/**
 * SwiftPath Capital — Bridge Loan Rate Calculator
 * Pricing engine derived from RCN Capital RTL rate sheets (GUC | RTL Calc tab).
 * Provides real-time indicative quotes for bridge loans.
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
   *  LTV LIMITS BY EXPERIENCE (Bridge — SFR, Purchase)
   *  From GUC | RTL (Calc) sheet rows 8-10
   *  Bridge has no rehab component and no T-LTC
   * ─────────────────────────────────────────── */
  var LTV_LIMITS = {
    '0':   { aiLtv: 0.75, iLtc: 0.75, arLtv: 0.75 },
    '1-4': { aiLtv: 0.75, iLtc: 0.75, arLtv: 0.75 },
    '5+':  { aiLtv: 0.80, iLtc: 0.80, arLtv: 0.80 }
  };

  /* ───────────────────────────────────────────
   *  FICO-BASED LTV ADJUSTMENTS
   *  From rate sheet rows 9-14, col O-S
   * ─────────────────────────────────────────── */
  var FICO_LTV_ADJ = [
    { min: 700, arAdj: 0 },
    { min: 680, arAdj: 0 },
    { min: 650, arAdj: 0 },
    { min: 0,   arAdj: 0 }
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
    if (!fico || fico <= 0) return { arAdj: 0 };
    for (var i = 0; i < FICO_LTV_ADJ.length; i++) {
      if (fico >= FICO_LTV_ADJ[i].min) return FICO_LTV_ADJ[i];
    }
    return { arAdj: 0 };
  }

  function calcMonthlyIO(principal, annualRate) {
    return principal * (annualRate / 12);
  }

  function fmt(n) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function fmtPct(n) { return (n * 100).toFixed(2) + '%'; }
  function fmtRate(n) { return (n * 100).toFixed(2) + '%'; }

  /* ─────────── MAIN CALCULATOR ─────────── */

  function calculateBridgeLoan(inputs) {
    var fico = parseInt(inputs.fico, 10) || 0;
    var experience = parseInt(inputs.experience, 10) || 0;
    var propertyValue = parseFloat(inputs.propertyValue) || 0;
    var loanAmount = parseFloat(inputs.loanAmount) || 0;
    var origTierIdx = parseInt(inputs.origTier, 10) || 0;
    var loanTermMonths = parseInt(inputs.loanTerm, 10) || 12;

    var result = { valid: false, errors: [], warnings: [] };

    // Validation
    if (fico > 0 && fico < 650) {
      result.errors.push('Minimum FICO score is 650 for Bridge loans.');
      return result;
    }
    if (propertyValue <= 0) {
      result.errors.push('Please enter a valid property value.');
      return result;
    }
    if (propertyValue < MIN_VALUE) {
      result.errors.push('Minimum property value is $' + fmt(MIN_VALUE) + '.');
      return result;
    }
    if (loanAmount <= 0) {
      result.errors.push('Please enter a valid loan amount.');
      return result;
    }
    if (loanAmount < MIN_LOAN) {
      result.errors.push('Minimum loan amount is $' + fmt(MIN_LOAN) + '.');
      return result;
    }

    // Experience bucket
    var expIdx = getExpBucket(experience);
    var expLabel = getExpLabel(experience);

    // Get LTV limits
    var limits = LTV_LIMITS[expLabel];
    var ficoLtvAdj = getFicoLtvAdj(fico);
    var adjMaxLtv = limits.arLtv + ficoLtvAdj.arAdj;

    // Calculate LTV
    var ltv = loanAmount / propertyValue;
    if (ltv > adjMaxLtv) {
      var maxLoan = Math.floor(propertyValue * adjMaxLtv);
      result.errors.push('LTV of ' + fmtPct(ltv) + ' exceeds the maximum ' + fmtPct(adjMaxLtv) + ' for your scenario. Max loan: $' + fmt(maxLoan));
      return result;
    }

    // Pricing
    var origTier = ORIG_TIERS[origTierIdx] || ORIG_TIERS[1];
    var baseRate = origTier.rates[expIdx];

    var loanSizeAdj = getLoanSizeAdj(loanAmount);
    var ficoAdj = getFicoAdj(fico);

    var totalAdj = loanSizeAdj + ficoAdj;
    var finalRate = baseRate + totalAdj;

    // Monthly IO payment
    var monthlyIO = calcMonthlyIO(loanAmount, finalRate);

    // Origination fee
    var origFee = loanAmount * origTier.points;

    // Down payment
    var downPayment = propertyValue - loanAmount;
    if (downPayment < 0) downPayment = 0;

    // Total cost of capital
    var totalInterestCost = monthlyIO * loanTermMonths;

    // Warnings
    if (fico > 0 && fico < 680) {
      result.warnings.push('FICO below 680 results in a rate adjustment of +0.25%-0.50%.');
    }

    result.valid = true;
    result.propertyValue = propertyValue;
    result.loanAmount = loanAmount;
    result.ltv = ltv;
    result.maxLtv = adjMaxLtv;
    result.experience = experience;
    result.expLabel = EXP_BUCKETS[expIdx].label;
    result.loanTermMonths = loanTermMonths;
    result.downPayment = downPayment;

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
    result.totalInterestCost = totalInterestCost;

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

  function initBridgeRateCalc() {
    var form = $('bridgeRateCalcForm');
    if (!form) return;

    ['propertyValue', 'loanAmount'].forEach(function (id) {
      var el = $(id);
      if (el) formatCurrencyInput(el);
    });

    // Auto-calc loan amount from LTV slider
    var ltvSlider = $('ltvSlider');
    var ltvDisplay = $('ltvDisplay');
    var propValueEl = $('propertyValue');
    var loanAmtEl = $('loanAmount');

    if (ltvSlider) {
      ltvSlider.addEventListener('input', function () {
        ltvDisplay.textContent = ltvSlider.value + '%';
        var pv = parseCurrency(propValueEl.value);
        if (pv > 0) {
          var la = Math.floor(pv * parseInt(ltvSlider.value, 10) / 100);
          loanAmtEl.value = '$' + fmt(la);
        }
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      runCalculation();
    });

    var allInputs = form.querySelectorAll('input, select');
    allInputs.forEach(function (el) {
      el.addEventListener('change', function () {
        var pv = parseCurrency(propValueEl.value);
        var la = parseCurrency(loanAmtEl.value);
        if (pv > 0 && la > 0) {
          runCalculation();
        }
      });
    });
  }

  function runCalculation() {
    var inputs = {
      fico: $('fico').value,
      experience: $('experience').value,
      propertyValue: parseCurrency($('propertyValue').value),
      loanAmount: parseCurrency($('loanAmount').value),
      origTier: $('origTier').value,
      loanTerm: $('loanTerm').value
    };

    var result = calculateBridgeLoan(inputs);
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
    $('resLoanAmount').textContent = '$' + fmt(result.loanAmount);
    $('resLtv').textContent = fmtPct(result.ltv);
    $('resMonthlyIO').textContent = '$' + fmt(result.monthlyIO);
    $('resDownPayment').textContent = '$' + fmt(result.downPayment);
    $('resOrigFee').textContent = '$' + fmt(result.origFee);
    $('resTotalInterest').textContent = '$' + fmt(result.totalInterestCost);

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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBridgeRateCalc);
  } else {
    initBridgeRateCalc();
  }

  window.SwiftPathBridgeRateCalc = { calculateBridgeLoan: calculateBridgeLoan };
})();
