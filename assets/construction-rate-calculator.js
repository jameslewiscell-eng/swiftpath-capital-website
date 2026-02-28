/**
 * SwiftPath Capital — New Construction Rate Calculator
 * Pricing engine derived from RCN Capital GUC (Ground-Up Construction) rate sheets.
 * Provides real-time indicative quotes for new construction loans.
 */
(function () {
  'use strict';

  /* ───────────────────────────────────────────
   *  BASE INTEREST RATE MATRIX
   *  Same tiers as RTL — origination points x experience
   *  From RTL Pricing Chart (Calc sheet rows 5-8)
   * ─────────────────────────────────────────── */
  var EXP_BUCKETS = [
    { max: 0,  label: '0 deals' },
    { max: 4,  label: '1-4 deals' },
    { max: Infinity, label: '5+ deals' }
  ];

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
    { min: 0,   adj: 0.005 }
  ];

  /* ───────────────────────────────────────────
   *  LTV / LTC LIMITS BY EXPERIENCE (GUC — SFR, Purchase)
   *  From GUC | RTL (Calc) sheet rows 5-7
   *  AI-LTV = As-Is LTV (land value)
   *  I-LTC  = Initial Loan-to-Cost
   *  AR-LTV = After-Repair/Completion LTV
   *  T-LTC  = Total Loan-to-Cost
   * ─────────────────────────────────────────── */
  var LTV_LIMITS = {
    '0':   { aiLtv: 0.70, iLtc: 0.70, arLtv: 0.65, tLtc: 0.85 },
    '1-4': { aiLtv: 0.75, iLtc: 0.75, arLtv: 0.70, tLtc: 0.85 },
    '5+':  { aiLtv: 0.75, iLtc: 0.80, arLtv: 0.75, tLtc: 0.90 }
  };

  /* ───────────────────────────────────────────
   *  FICO-BASED LTV ADJUSTMENTS
   *  From rate sheet rows 9-14, col O-S
   * ─────────────────────────────────────────── */
  var FICO_LTV_ADJ = [
    { min: 700, arAdj: 0,  tLtcAdj: 0 },
    { min: 680, arAdj: 0,  tLtcAdj: -0.05 },
    { min: 650, arAdj: 0,  tLtcAdj: -0.10 },
    { min: 0,   arAdj: 0,  tLtcAdj: -0.05 }
  ];

  var MIN_LOAN = 75000;
  var MIN_VALUE = 100000;

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
    if (!fico || fico <= 0) return 0.005;
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

  function calcMonthlyIO(principal, annualRate) {
    return principal * (annualRate / 12);
  }

  function fmt(n) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function fmtPct(n) { return (n * 100).toFixed(2) + '%'; }
  function fmtRate(n) { return (n * 100).toFixed(2) + '%'; }

  /* ─────────── MAIN CALCULATOR ─────────── */

  function calculateConstructionLoan(inputs) {
    var fico = parseInt(inputs.fico, 10) || 0;
    var experience = parseInt(inputs.experience, 10) || 0;
    var landValue = parseFloat(inputs.landValue) || 0;
    var constructionBudget = parseFloat(inputs.constructionBudget) || 0;
    var completedValue = parseFloat(inputs.completedValue) || 0;
    var origTierIdx = parseInt(inputs.origTier, 10) || 0;
    var loanTermMonths = parseInt(inputs.loanTerm, 10) || 12;

    var result = { valid: false, errors: [], warnings: [] };

    // Validation
    if (fico > 0 && fico < 650) {
      result.errors.push('Minimum FICO score is 650 for New Construction loans.');
      return result;
    }
    if (landValue <= 0) {
      result.errors.push('Please enter a valid land/lot value.');
      return result;
    }
    if (constructionBudget <= 0) {
      result.errors.push('Please enter a valid construction budget.');
      return result;
    }
    if (completedValue <= 0) {
      result.errors.push('Please enter a valid completed/after-built value.');
      return result;
    }
    if (completedValue < MIN_VALUE) {
      result.errors.push('Minimum completed value is $' + fmt(MIN_VALUE) + '.');
      return result;
    }
    if (completedValue <= landValue + constructionBudget) {
      result.errors.push('Completed value should exceed total project cost (land + construction).');
      return result;
    }

    // Experience bucket
    var expIdx = getExpBucket(experience);
    var expLabel = getExpLabel(experience);

    // Get LTV limits
    var limits = LTV_LIMITS[expLabel];
    if (!limits) {
      result.errors.push('Unable to determine leverage limits for this scenario.');
      return result;
    }

    // Apply FICO-based LTV adjustments
    var ficoLtvAdj = getFicoLtvAdj(fico);
    var adjArLtv = limits.arLtv + ficoLtvAdj.arAdj;
    var adjTLtc = limits.tLtc + ficoLtvAdj.tLtcAdj;

    // Total project cost
    var totalCost = landValue + constructionBudget;

    // Calculate max leverage from each constraint
    var maxByAiLtv = Math.floor(landValue * limits.aiLtv);
    var maxByILtc = Math.floor(totalCost * limits.iLtc);
    var maxByArLtv = Math.floor(completedValue * adjArLtv);
    var maxByTLtc = Math.floor(totalCost * adjTLtc);

    // Initial advance (land acquisition) = min of AI-LTV and I-LTC, capped at land value
    var maxInitialAdvance = Math.min(maxByAiLtv, maxByILtc, landValue);

    // Max total loan from AR-LTV and T-LTC constraints
    var maxTotalLoan = Math.min(maxByArLtv, maxByTLtc);

    // Construction funded = total loan minus initial advance, capped at construction budget
    var constructionFundedMax = Math.min(maxTotalLoan - maxInitialAdvance, constructionBudget);
    if (constructionFundedMax < 0) constructionFundedMax = 0;

    // 85% of construction budget is typically funded (holdback for draw schedule)
    var constructionFundedCalc = Math.floor(constructionBudget * 0.85);
    var constructionFunded = Math.min(constructionFundedCalc, constructionFundedMax);
    var constructionOOP = constructionBudget - constructionFunded;

    // Final loan amount
    var totalLoan = maxInitialAdvance + constructionFunded;

    // Min loan check
    if (totalLoan < MIN_LOAN) {
      result.errors.push('Minimum loan amount is $' + fmt(MIN_LOAN) + '. Your estimated loan of $' + fmt(totalLoan) + ' is below this threshold.');
      return result;
    }

    // Cap at AR-LTV and T-LTC
    if (totalLoan > maxByArLtv) {
      totalLoan = maxByArLtv;
      constructionFunded = totalLoan - maxInitialAdvance;
      if (constructionFunded < 0) {
        maxInitialAdvance = totalLoan;
        constructionFunded = 0;
      }
      constructionOOP = constructionBudget - constructionFunded;
    }
    if (totalLoan > maxByTLtc) {
      totalLoan = maxByTLtc;
      constructionFunded = totalLoan - maxInitialAdvance;
      if (constructionFunded < 0) {
        maxInitialAdvance = totalLoan;
        constructionFunded = 0;
      }
      constructionOOP = constructionBudget - constructionFunded;
    }

    // Actual ratios
    var actualAiLtv = maxInitialAdvance / landValue;
    var actualArLtv = totalLoan / completedValue;
    var actualTLtc = totalLoan / totalCost;

    // Pricing
    var origTier = ORIG_TIERS[origTierIdx] || ORIG_TIERS[1];
    var baseRate = origTier.rates[expIdx];

    var loanSizeAdj = getLoanSizeAdj(totalLoan);
    var ficoAdj = getFicoAdj(fico);

    var totalAdj = loanSizeAdj + ficoAdj;
    var finalRate = baseRate + totalAdj;

    // Monthly IO payment (on full note)
    var monthlyIO = calcMonthlyIO(totalLoan, finalRate);

    // Origination fee
    var origFee = totalLoan * origTier.points;

    // Down payment (land cost minus initial advance)
    var downPayment = landValue - maxInitialAdvance;
    if (downPayment < 0) downPayment = 0;

    // Projected profit/ROI
    var totalInvestorCost = downPayment + constructionOOP + origFee + (monthlyIO * loanTermMonths);
    var projectedProfit = completedValue - landValue - constructionBudget - origFee - (monthlyIO * loanTermMonths);
    var projectedROI = totalInvestorCost > 0 ? (projectedProfit / totalInvestorCost) : 0;

    // Warnings
    if (experience < 1) {
      result.warnings.push('First-time builders: GUC loans typically require entitlements, permits, and approved plans. Be prepared to provide a feasibility study.');
    }
    if (fico > 0 && fico < 680) {
      result.warnings.push('FICO below 680 results in reduced leverage (T-LTC reduced 5-10%).');
    }

    result.valid = true;
    result.landValue = landValue;
    result.constructionBudget = constructionBudget;
    result.constructionFunded = constructionFunded;
    result.constructionOOP = constructionOOP;
    result.completedValue = completedValue;
    result.totalCost = totalCost;
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

  function initConstructionRateCalc() {
    var form = $('constructionRateCalcForm');
    if (!form) return;

    ['landValue', 'constructionBudget', 'completedValue'].forEach(function (id) {
      var el = $(id);
      if (el) formatCurrencyInput(el);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      runCalculation();
    });

    var allInputs = form.querySelectorAll('input, select');
    allInputs.forEach(function (el) {
      el.addEventListener('change', function () {
        var lv = parseCurrency($('landValue').value);
        var cv = parseCurrency($('completedValue').value);
        if (lv > 0 && cv > 0) {
          runCalculation();
        }
      });
    });
  }

  function runCalculation() {
    var inputs = {
      fico: $('fico').value,
      experience: $('experience').value,
      landValue: parseCurrency($('landValue').value),
      constructionBudget: parseCurrency($('constructionBudget').value),
      completedValue: parseCurrency($('completedValue').value),
      origTier: $('origTier').value,
      loanTerm: $('loanTerm').value
    };

    var result = calculateConstructionLoan(inputs);
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

    $('resRate').textContent = fmtRate(result.finalRate);
    $('resTotalLoan').textContent = '$' + fmt(result.totalLoan);
    $('resInitialAdvance').textContent = '$' + fmt(result.initialAdvance);
    $('resConstructionFunded').textContent = '$' + fmt(result.constructionFunded);
    $('resMonthlyIO').textContent = '$' + fmt(result.monthlyIO);
    $('resDownPayment').textContent = '$' + fmt(result.downPayment);
    $('resConstructionOOP').textContent = '$' + fmt(result.constructionOOP);
    $('resOrigFee').textContent = '$' + fmt(result.origFee);

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
        ['Loan Term', result.loanTermMonths + ' Months']
      ];

      leverage.innerHTML = levRows.map(function (r) {
        return '<div class="flex justify-between text-sm"><span>' + r[0] + '</span><span class="font-medium">' + r[1] + '</span></div>';
      }).join('');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initConstructionRateCalc);
  } else {
    initConstructionRateCalc();
  }

  window.SwiftPathConstructionRateCalc = { calculateConstructionLoan: calculateConstructionLoan };
})();
