/**
 * SwiftPath Capital — Fix & Flip Loan Sizer
 * Pricing engine derived from RCN Capital RTL (Residential Transitional Loan) rate sheets.
 * Provides real-time indicative quotes for fix-and-flip / rehab loans.
 */
(function () {
  'use strict';

  /* ───────────────────────────────────────────
   *  BASE INTEREST RATE MATRIX
   *  From RTL Pricing Chart (Calc sheet rows 5-8)
   *  Rows = Origination Points tier
   *  Cols = Experience bucket (0, 1-4, 5+ completed deals)
   * ─────────────────────────────────────────── */
  var EXP_BUCKETS = [
    { max: 0,  label: '0 deals' },
    { max: 4,  label: '1-4 deals' },
    { max: Infinity, label: '5+ deals' }
  ];

  // Base rates: [0 deals, 1-4 deals, 5+ deals]
  // at different origination point levels
  var ORIG_TIERS = [
    { points: 0.005,  label: '0.50%', rates: [0.1099, 0.1049, 0.0999] },
    { points: 0.0075, label: '0.75%', rates: [0.1074, 0.0999, 0.0974] },
    { points: 0.01,   label: '1.00%', rates: [0.1049, 0.0974, 0.0949] }
  ];

  /* ───────────────────────────────────────────
   *  LOAN AMOUNT PRICING ADJUSTMENT
   *  From Calc sheet rows 27-35, col V-W
   * ─────────────────────────────────────────── */
  var LOAN_SIZE_ADJ = [
    { max: 100000,   adj:  0.0035 },
    { max: 150000,   adj:  0.0025 },
    { max: 250000,   adj:  0 },
    { max: 325000,   adj: -0.001 },
    { max: 500000,   adj: -0.0015 },
    { max: 625000,   adj: -0.002 },
    { max: 750000,   adj: -0.0025 },
    { max: 825000,   adj: -0.003 },
    { max: Infinity, adj: -0.003 }
  ];

  /* ───────────────────────────────────────────
   *  FICO SCORE ADJUSTMENT
   *  From Calc sheet rows 27-31, col X-Y
   * ─────────────────────────────────────────── */
  var FICO_ADJ = [
    { min: 700, adj: 0 },
    { min: 680, adj: 0.0025 },
    { min: 650, adj: 0.005 },
    { min: 0,   adj: 0.005 }  // No FICO / below 650
  ];

  /* ───────────────────────────────────────────
   *  LTV / LTC LIMITS BY EXPERIENCE + REHAB TYPE
   *  From Calc sheet RTL rows (SFR, Purchase)
   *  H = AI-LTV (As-Is LTV on purchase price)
   *  I = I-LTC  (Initial Loan-to-Cost)
   *  J = AR-LTV (After-Repair LTV)
   *  K = T-LTC  (Total Loan-to-Cost)
   * ─────────────────────────────────────────── */
  var LTV_LIMITS = {
    'Light': {
      '0':  { aiLtv: 1.00, iLtc: 0.85, arLtv: 0.70, tLtc: 0.90 },
      '1-4':{ aiLtv: 1.00, iLtc: 0.90, arLtv: 0.75, tLtc: 0.95 },
      '5+': { aiLtv: 1.00, iLtc: 0.95, arLtv: 0.75, tLtc: 1.00 }
    },
    'Moderate': {
      '0':  { aiLtv: 1.00, iLtc: 0.85, arLtv: 0.70, tLtc: 0.90 },
      '1-4':{ aiLtv: 1.00, iLtc: 0.90, arLtv: 0.725, tLtc: 0.925 },
      '5+': { aiLtv: 1.00, iLtc: 0.925, arLtv: 0.75, tLtc: 0.95 }
    },
    'Heavy': {
      '0':  { aiLtv: 0.70, iLtc: 0.70, arLtv: 0.60, tLtc: 0.80 },
      '1-4':{ aiLtv: 0.80, iLtc: 0.80, arLtv: 0.65, tLtc: 0.875 },
      '5+': { aiLtv: 0.85, iLtc: 0.85, arLtv: 0.70, tLtc: 0.90 }
    }
  };

  /* ───────────────────────────────────────────
   *  FICO-BASED LTV ADJUSTMENTS
   *  From Sizer sheet rows 9-14, col O-S
   * ─────────────────────────────────────────── */
  var FICO_LTV_ADJ = [
    { min: 700, arAdj: 0,      tLtcAdj: 0 },
    { min: 680, arAdj: 0,      tLtcAdj: -0.05 },
    { min: 650, arAdj: 0,      tLtcAdj: -0.10 },
    { min: 0,   arAdj: 0,      tLtcAdj: -0.05 }  // No FICO
  ];

  /* ───────────────────────────────────────────
   *  MINIMUM LOAN & VALUE REQUIREMENTS
   * ─────────────────────────────────────────── */
  var MIN_LOAN_SFR = 75000;
  var MIN_VALUE_SFR = 100000;

  /* ─────────── HELPERS ─────────── */

  function getExpBucket(exp) {
    if (exp <= 0) return 0;
    if (exp <= 4) return 1;
    return 2;
  }

  function getExpLabel(exp) {
    if (exp <= 0) return '0';
    if (exp <= 4) return '1-4';
    return '5+';
  }

  function getLoanSizeAdj(loanAmount) {
    for (var i = 0; i < LOAN_SIZE_ADJ.length; i++) {
      if (loanAmount <= LOAN_SIZE_ADJ[i].max) return LOAN_SIZE_ADJ[i].adj;
    }
    return 0;
  }

  function getFicoAdj(fico) {
    if (!fico || fico <= 0) return 0.005; // No FICO treated as 0.5% adder
    for (var i = 0; i < FICO_ADJ.length; i++) {
      if (fico >= FICO_ADJ[i].min) return FICO_ADJ[i].adj;
    }
    return 0.005;
  }

  function getFicoLtvAdj(fico) {
    if (!fico || fico <= 0) return { arAdj: 0, tLtcAdj: -0.05 };
    for (var i = 0; i < FICO_LTV_ADJ.length; i++) {
      if (fico >= FICO_LTV_ADJ[i].min) return FICO_LTV_ADJ[i];
    }
    return { arAdj: 0, tLtcAdj: -0.05 };
  }

  function getRehabBucket(rehabPct) {
    if (rehabPct <= 0.25) return 'Light';
    if (rehabPct <= 0.50) return 'Moderate';
    return 'Heavy';
  }

  function calcMonthlyIO(principal, annualRate) {
    return principal * (annualRate / 12);
  }

  function fmt(n) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function fmtPct(n) { return (n * 100).toFixed(2) + '%'; }
  function fmtRate(n) { return (n * 100).toFixed(2) + '%'; }

  /* ─────────── MAIN CALCULATOR ─────────── */

  function calculateFlipLoan(inputs) {
    var fico = parseInt(inputs.fico, 10) || 0;
    var experience = parseInt(inputs.experience, 10) || 0;
    var purchasePrice = parseFloat(inputs.purchasePrice) || 0;
    var asIsValue = parseFloat(inputs.asIsValue) || 0;
    var rehabBudget = parseFloat(inputs.rehabBudget) || 0;
    var afterRepairValue = parseFloat(inputs.afterRepairValue) || 0;
    var origTierIdx = parseInt(inputs.origTier, 10) || 0;
    var loanTermMonths = parseInt(inputs.loanTerm, 10) || 12;

    var result = { valid: false, errors: [], warnings: [] };

    // Validation
    if (fico > 0 && fico < 650) {
      result.errors.push('Minimum FICO score is 650 for Fix & Flip loans. Scores below 650 are considered on a case-by-case basis.');
      return result;
    }
    if (purchasePrice <= 0) {
      result.errors.push('Please enter a valid purchase price.');
      return result;
    }
    if (afterRepairValue <= 0) {
      result.errors.push('Please enter a valid After-Repair Value (ARV).');
      return result;
    }
    if (afterRepairValue < MIN_VALUE_SFR) {
      result.errors.push('Minimum After-Repair Value is $' + fmt(MIN_VALUE_SFR) + '.');
      return result;
    }
    if (afterRepairValue <= purchasePrice) {
      result.errors.push('After-Repair Value must be greater than the purchase price.');
      return result;
    }
    if (rehabBudget <= 0) {
      result.errors.push('Please enter a rehab budget.');
      return result;
    }

    // Use purchase price as as-is value if not provided separately
    if (!asIsValue || asIsValue <= 0) {
      asIsValue = purchasePrice;
    }

    // Calculate rehab percentage relative to purchase price
    var rehabPct = rehabBudget / purchasePrice;
    var rehabType = getRehabBucket(rehabPct);

    // Determine experience bucket
    var expIdx = getExpBucket(experience);
    var expLabel = getExpLabel(experience);

    // Get LTV limits
    var limits = LTV_LIMITS[rehabType][expLabel];
    if (!limits) {
      result.errors.push('Unable to determine leverage limits for this scenario.');
      return result;
    }

    // Apply FICO-based LTV adjustments
    var ficoLtvAdj = getFicoLtvAdj(fico);
    var adjArLtv = limits.arLtv + ficoLtvAdj.arAdj;
    var adjTLtc = limits.tLtc + ficoLtvAdj.tLtcAdj;

    // Calculate total project cost
    var totalCost = purchasePrice + rehabBudget;

    // Calculate max leverage from each constraint
    var maxByAiLtv = Math.floor(asIsValue * limits.aiLtv);             // Max initial advance from AI-LTV
    var maxByILtc = Math.floor(totalCost * limits.iLtc);               // Max initial advance from I-LTC
    var maxByArLtv = Math.floor(afterRepairValue * adjArLtv);          // Max total loan from AR-LTV
    var maxByTLtc = Math.floor(totalCost * adjTLtc);                   // Max total loan from T-LTC

    // Initial advance = min of AI-LTV and I-LTC applied to purchase
    var maxInitialAdvance = Math.min(maxByAiLtv, maxByILtc, purchasePrice);

    // Max total loan = min of AR-LTV and T-LTC constraints
    var maxTotalLoan = Math.min(maxByArLtv, maxByTLtc);

    // Rehab funded = total loan minus initial advance, capped at rehab budget
    var rehabFundedMax = Math.min(maxTotalLoan - maxInitialAdvance, rehabBudget);
    if (rehabFundedMax < 0) rehabFundedMax = 0;

    // 85% of rehab budget is typically funded (holdback)
    var rehabFundedCalc = Math.floor(rehabBudget * 0.85);
    var rehabFunded = Math.min(rehabFundedCalc, rehabFundedMax);
    var rehabOOP = rehabBudget - rehabFunded;

    // Final loan amount
    var totalLoan = maxInitialAdvance + rehabFunded;

    // Ensure min loan
    if (totalLoan < MIN_LOAN_SFR) {
      result.errors.push('Minimum loan amount is $' + fmt(MIN_LOAN_SFR) + '. Your estimated loan of $' + fmt(totalLoan) + ' is below this threshold.');
      return result;
    }

    // Cap loan at total LTC and AR-LTV
    if (totalLoan > maxByArLtv) {
      totalLoan = maxByArLtv;
      rehabFunded = totalLoan - maxInitialAdvance;
      if (rehabFunded < 0) {
        maxInitialAdvance = totalLoan;
        rehabFunded = 0;
      }
      rehabOOP = rehabBudget - rehabFunded;
    }
    if (totalLoan > maxByTLtc) {
      totalLoan = maxByTLtc;
      rehabFunded = totalLoan - maxInitialAdvance;
      if (rehabFunded < 0) {
        maxInitialAdvance = totalLoan;
        rehabFunded = 0;
      }
      rehabOOP = rehabBudget - rehabFunded;
    }

    // Calculate actual LTV/LTC ratios
    var actualAiLtv = maxInitialAdvance / asIsValue;
    var actualILtc = maxInitialAdvance / totalCost;
    var actualArLtv = totalLoan / afterRepairValue;
    var actualTLtc = totalLoan / totalCost;

    // Pricing calculation
    var origTier = ORIG_TIERS[origTierIdx] || ORIG_TIERS[1]; // default to 0.75% points
    var baseRate = origTier.rates[expIdx];

    // Adjustments
    var loanSizeAdj = getLoanSizeAdj(totalLoan);
    var ficoAdj = getFicoAdj(fico);

    var totalAdj = loanSizeAdj + ficoAdj;
    var finalRate = baseRate + totalAdj;

    // Monthly interest-only payment (on full note / Dutch interest)
    var monthlyIO = calcMonthlyIO(totalLoan, finalRate);

    // Origination fee
    var origFee = totalLoan * origTier.points;

    // Down payment (purchase price minus initial advance)
    var downPayment = purchasePrice - maxInitialAdvance;
    if (downPayment < 0) downPayment = 0;

    // Projected ROI
    var totalInvestorCost = downPayment + rehabOOP + origFee + (monthlyIO * loanTermMonths);
    var projectedProfit = afterRepairValue - purchasePrice - rehabBudget - origFee - (monthlyIO * loanTermMonths);
    var projectedROI = totalInvestorCost > 0 ? (projectedProfit / totalInvestorCost) : 0;

    // Warnings
    if (rehabType === 'Heavy' && experience < 5) {
      result.warnings.push('Heavy rehab projects (>' + fmtPct(0.50) + ' of purchase price) have tighter leverage limits for borrowers with fewer than 5 deals.');
    }
    if (fico > 0 && fico < 680) {
      result.warnings.push('FICO below 680 results in reduced leverage (T-LTC reduced 5-10%).');
    }

    result.valid = true;
    result.purchasePrice = purchasePrice;
    result.asIsValue = asIsValue;
    result.rehabBudget = rehabBudget;
    result.rehabFunded = rehabFunded;
    result.rehabOOP = rehabOOP;
    result.afterRepairValue = afterRepairValue;
    result.totalCost = totalCost;
    result.rehabType = rehabType;
    result.rehabPct = rehabPct;
    result.experience = experience;
    result.expLabel = EXP_BUCKETS[expIdx].label;
    result.loanTermMonths = loanTermMonths;

    // Leverage
    result.initialAdvance = maxInitialAdvance;
    result.totalLoan = totalLoan;
    result.downPayment = downPayment;
    result.limits = limits;
    result.adjArLtv = adjArLtv;
    result.adjTLtc = adjTLtc;
    result.actualAiLtv = actualAiLtv;
    result.actualArLtv = actualArLtv;
    result.actualTLtc = actualTLtc;

    // Pricing
    result.origTier = origTier;
    result.baseRate = baseRate;
    result.adjustments = {
      loanSize: loanSizeAdj,
      fico: ficoAdj,
      total: totalAdj
    };
    result.finalRate = finalRate;
    result.monthlyIO = monthlyIO;
    result.origFee = origFee;

    // Profitability
    result.projectedProfit = projectedProfit;
    result.projectedROI = projectedROI;
    result.totalInvestorCost = totalInvestorCost;

    return result;
  }

  /* ─────────── UI WIRING ─────────── */

  function $(id) { return document.getElementById(id); }

  function formatCurrencyInput(el) {
    el.addEventListener('focus', function () {
      var v = el.value.replace(/[^0-9.]/g, '');
      el.value = v;
    });
    el.addEventListener('blur', function () {
      var v = parseFloat(el.value.replace(/[^0-9.]/g, ''));
      if (!isNaN(v)) el.value = '$' + fmt(v);
    });
  }

  function parseCurrency(val) {
    return parseFloat((val || '').replace(/[^0-9.]/g, '')) || 0;
  }

  function initFlipSizer() {
    var form = $('flipSizerForm');
    if (!form) return;

    // Format currency fields on blur
    ['purchasePrice', 'asIsValue', 'rehabBudget', 'afterRepairValue'].forEach(function (id) {
      var el = $(id);
      if (el) formatCurrencyInput(el);
    });

    // Form submission
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      runCalculation();
    });

    // Live recalculation on change
    var allInputs = form.querySelectorAll('input, select');
    allInputs.forEach(function (el) {
      el.addEventListener('change', function () {
        var pp = parseCurrency($('purchasePrice').value);
        var arv = parseCurrency($('afterRepairValue').value);
        if (pp > 0 && arv > 0) {
          runCalculation();
        }
      });
    });
  }

  function runCalculation() {
    var inputs = {
      fico: $('fico').value,
      experience: $('experience').value,
      purchasePrice: parseCurrency($('purchasePrice').value),
      asIsValue: parseCurrency($('asIsValue') ? $('asIsValue').value : ''),
      rehabBudget: parseCurrency($('rehabBudget').value),
      afterRepairValue: parseCurrency($('afterRepairValue').value),
      origTier: $('origTier').value,
      loanTerm: $('loanTerm').value
    };

    var result = calculateFlipLoan(inputs);
    displayResult(result);
  }

  function displayResult(result) {
    var panel = $('resultPanel');
    var errorDiv = $('resultErrors');
    var successDiv = $('resultSuccess');

    if (!panel) return;
    panel.classList.remove('hidden');

    if (!result.valid) {
      errorDiv.classList.remove('hidden');
      successDiv.classList.add('hidden');
      errorDiv.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-lg p-4">' +
        result.errors.map(function (e) { return '<p class="text-red-700 text-sm mb-1">' + e + '</p>'; }).join('') +
        '</div>';
      return;
    }

    errorDiv.classList.add('hidden');
    successDiv.classList.remove('hidden');

    // Populate result fields
    $('resRate').textContent = fmtRate(result.finalRate);
    $('resTotalLoan').textContent = '$' + fmt(result.totalLoan);
    $('resInitialAdvance').textContent = '$' + fmt(result.initialAdvance);
    $('resRehabFunded').textContent = '$' + fmt(result.rehabFunded);
    $('resMonthlyIO').textContent = '$' + fmt(result.monthlyIO);
    $('resDownPayment').textContent = '$' + fmt(result.downPayment);
    $('resRehabOOP').textContent = '$' + fmt(result.rehabOOP);
    $('resOrigFee').textContent = '$' + fmt(result.origFee);
    $('resRehabType').textContent = result.rehabType + ' Rehab';

    // LTV metrics
    $('resArLtv').textContent = fmtPct(result.actualArLtv);
    $('resTLtc').textContent = fmtPct(result.actualTLtc);

    // Profitability
    var profitEl = $('resProfit');
    profitEl.textContent = '$' + fmt(result.projectedProfit);
    profitEl.className = result.projectedProfit > 0
      ? 'text-2xl font-bold text-green-600'
      : 'text-2xl font-bold text-red-600';

    var roiEl = $('resROI');
    roiEl.textContent = fmtPct(result.projectedROI);
    roiEl.className = result.projectedROI > 0
      ? 'text-lg font-bold text-green-600'
      : 'text-lg font-bold text-red-600';

    // Warnings
    var warningDiv = $('resultWarnings');
    if (warningDiv) {
      if (result.warnings.length > 0) {
        warningDiv.classList.remove('hidden');
        warningDiv.innerHTML = '<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">' +
          result.warnings.map(function (w) { return '<p class="text-yellow-800 text-xs mb-1">' + w + '</p>'; }).join('') +
          '</div>';
      } else {
        warningDiv.classList.add('hidden');
      }
    }

    // Rate breakdown
    var breakdown = $('rateBreakdown');
    if (breakdown) {
      var adj = result.adjustments;
      var rows = [
        ['Base Rate (' + result.expLabel + ', ' + result.origTier.label + ' pts)', fmtRate(result.baseRate)],
        ['FICO Adjustment', (adj.fico >= 0 ? '+' : '') + fmtPct(adj.fico)],
        ['Loan Size Adjustment', (adj.loanSize >= 0 ? '+' : '') + fmtPct(adj.loanSize)],
        ['Final Rate', fmtRate(result.finalRate)]
      ];

      breakdown.innerHTML = rows.map(function (r, i) {
        var isLast = i === rows.length - 1;
        var cls = isLast ? 'font-bold text-brand-blue border-t border-slate-300 pt-2 mt-2' : '';
        return '<div class="flex justify-between text-sm ' + cls + '"><span>' + r[0] + '</span><span>' + r[1] + '</span></div>';
      }).join('');
    }

    // Leverage breakdown
    var leverage = $('leverageBreakdown');
    if (leverage) {
      var levRows = [
        ['AR-LTV (Max ' + fmtPct(result.adjArLtv) + ')', fmtPct(result.actualArLtv)],
        ['T-LTC (Max ' + fmtPct(result.adjTLtc) + ')', fmtPct(result.actualTLtc)],
        ['Rehab Type', result.rehabType + ' (' + fmtPct(result.rehabPct) + ' of PP)'],
        ['Loan Term', result.loanTermMonths + ' Months']
      ];

      leverage.innerHTML = levRows.map(function (r) {
        return '<div class="flex justify-between text-sm"><span>' + r[0] + '</span><span class="font-medium">' + r[1] + '</span></div>';
      }).join('');
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFlipSizer);
  } else {
    initFlipSizer();
  }

  // Expose for testing
  window.SwiftPathFlipSizer = { calculateFlipLoan: calculateFlipLoan };
})();
