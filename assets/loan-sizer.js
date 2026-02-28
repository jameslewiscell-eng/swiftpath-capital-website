/**
 * SwiftPath Capital — Instant Loan Sizer
 * Pricing engine derived from RCN Capital LTR DSCR rate sheets.
 * Provides real-time indicative quotes for DSCR rental loans.
 */
(function () {
  'use strict';

  /* ───────────────────────────────────────────
   *  LLPA BASE RATE MATRIX  (DSCR Interest Rate)
   *  Rows = FICO bucket, Cols = LTV bucket
   *  Values are annual interest rates (decimal)
   * ─────────────────────────────────────────── */
  var LTV_BUCKETS = [50, 55, 60, 65, 70, 75, 80];
  // Labels for display
  var LTV_LABELS = ['<= 50%', '<= 55%', '<= 60%', '<= 65%', '<= 70%', '<= 75%', '<= 80%'];

  var FICO_BUCKETS = [
    { min: 680, label: '680+' },
    { min: 700, label: '700+' },
    { min: 720, label: '720+' },
    { min: 740, label: '740+' },
    { min: 760, label: '760+' },
    { min: 780, label: '780+' },
    { min: 800, label: '800+' }
  ];

  // Base rates: FICO bucket (row) x LTV bucket (col)
  // From LTR (LLPA) sheet rows 29-35, cols E-K (DSCR Interest Rate table)
  var BASE_RATES = [
    // 680+
    [0.0630, 0.06325, 0.06475, 0.06550, 0.06800, 0.07050, 0.07300],
    // 700+
    [0.0615, 0.06175, 0.06350, 0.06450, 0.06625, 0.06875, 0.07050],
    // 720+
    [0.0610, 0.06125, 0.06238, 0.06375, 0.06475, 0.06675, 0.06925],
    // 740+
    [0.06075, 0.06100, 0.06150, 0.06250, 0.06425, 0.06550, 0.06800],
    // 760+
    [0.06050, 0.06075, 0.06125, 0.06175, 0.06275, 0.06475, 0.06675],
    // 780+
    [0.06025, 0.06050, 0.06100, 0.06150, 0.06200, 0.06300, 0.06550],
    // 800+
    [0.06000, 0.06025, 0.06075, 0.06125, 0.06175, 0.06275, 0.06525]
  ];

  /* ───────────────────────────────────────────
   *  SPREAD ADJUSTMENTS (additive to base rate)
   *  Each adjustment is indexed by LTV bucket
   * ─────────────────────────────────────────── */

  // Property Type adjustments
  var PROP_TYPE_ADJ = {
    'Detached SFR':        [0, 0, 0, 0, 0, 0, 0],
    'Townhome':            [0, 0, 0, 0, 0, 0, 0],
    'PUD':                 [0, 0, 0, 0, 0, 0, 0],
    'SFR + ADU':           [0.0005, 0.00075, 0.001, 0.00125, 0.0015, 0.00175, 0.002],
    '2-4 Unit':            [0.001, 0.00125, 0.0015, 0.00175, 0.0025, 0.00275, 0.003],
    'Condo (Warrantable)': [0.001, 0.00125, 0.0015, 0.00175, 0.0025, 0.00275, 0.003],
    'Condo (Non-Warr.)':   [0.005, 0.005, 0.005, 0.005, 0.005, 0.005, 0.005],
    '5-9 Unit':            [0.005, 0.005, 0.005, 0.005, 0.005, 0.005, 0.005],
    '10+ Unit':            [0.005, 0.005, 0.005, 0.005, 0.005, 0.005, 0.005]
  };

  // Loan Purpose adjustments
  var PURPOSE_ADJ = {
    'Purchase':            [0, 0, 0, 0, 0, 0, 0],
    'Delayed Purchase':    [0, 0, 0, 0, 0, 0, 0],
    'Rate/Term Refi':      [0, 0, 0, 0, 0, 0, 0],
    'Cash-Out Refi':       [0.00025, 0.0005, 0.00075, 0.001, 0.00175, 0.0025, 0.01]
  };

  // IO Period adjustments
  var IO_ADJ = {
    'No IO':  [0, 0, 0, 0, 0, 0, 0],
    '5Y IO':  [0.00175, 0.00175, 0.00175, 0.00225, 0.00225, 0.003, 0.003],
    '7Y IO':  [0.0015, 0.0015, 0.0015, 0.002, 0.002, 0.00275, 0.00275],
    '10Y IO': [0.00125, 0.00125, 0.00125, 0.00175, 0.00175, 0.0025, 0.0025]
  };

  // Prepay Penalty adjustments
  var PPP_ADJ = {
    '5y (5% Flat)':  [-0.0025, -0.0025, -0.0025, -0.0025, -0.0025, -0.0025, -0.0025],
    '5y (Step-Down)':[-0.00175, -0.00175, -0.00175, -0.00175, -0.00175, -0.00175, -0.00175],
    '3y (Step-Down)': [0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001],
    '2y (Step-Down)': [0.002, 0.002, 0.002, 0.002, 0.002, 0.002, 0.002],
    '1y (1%)':        [0.00225, 0.00225, 0.00225, 0.00225, 0.00225, 0.00225, 0.00225],
    'No Prepay':      [0.00275, 0.00275, 0.00275, 0.00275, 0.00275, 0.00275, 0.00275]
  };

  // Loan Size adjustments
  var SIZE_BRACKETS = [
    { max: 75000,    adj: [0.002, 0.00225, 0.0025, 0.00275, 0.003, 0.003, 0.003] },
    { max: 100000,   adj: [0, 0.0005, 0.00075, 0.001, 0.00125, 0.0015, 0.00175] },
    { max: 125000,   adj: [0, 0, 0.00025, 0.0005, 0.00075, 0.001, 0.00125] },
    { max: 150000,   adj: [0, 0, 0, 0, 0, 0, 0] },
    { max: Infinity, adj: [0, 0, 0, 0, 0, 0, 0] }
  ];

  // LTV constraints by FICO for each purpose
  // From LTR (Calc) rows 30-42
  var MAX_LTV = {
    'Purchase':        { 680: 75, 700: 80, 720: 80, 740: 80, 760: 80, 780: 80, 800: 80 },
    'Delayed Purchase':{ 680: 75, 700: 80, 720: 80, 740: 80, 760: 80, 780: 80, 800: 80 },
    'Rate/Term Refi':  { 680: 75, 700: 80, 720: 80, 740: 80, 760: 80, 780: 80, 800: 80 },
    'Cash-Out Refi':   { 680: 70, 700: 75, 720: 75, 740: 75, 760: 75, 780: 75, 800: 75 }
  };

  // Min DSCR by FICO
  var MIN_DSCR = {
    680: 1.20, 700: 1.10, 720: 1.00, 740: 1.00, 760: 1.00, 780: 1.00, 800: 1.00
  };

  /* ─────────── HELPERS ─────────── */

  function getFicoBucket(fico) {
    if (fico < 680) return -1;
    for (var i = FICO_BUCKETS.length - 1; i >= 0; i--) {
      if (fico >= FICO_BUCKETS[i].min) return i;
    }
    return 0;
  }

  function getLtvBucketIndex(ltvPct) {
    for (var i = 0; i < LTV_BUCKETS.length; i++) {
      if (ltvPct <= LTV_BUCKETS[i]) return i;
    }
    return LTV_BUCKETS.length - 1;
  }

  function getLoanSizeAdj(loanAmount, ltvIdx) {
    for (var i = 0; i < SIZE_BRACKETS.length; i++) {
      if (loanAmount <= SIZE_BRACKETS[i].max) return SIZE_BRACKETS[i].adj[ltvIdx];
    }
    return 0;
  }

  function getMaxLtv(purpose, fico) {
    var table = MAX_LTV[purpose];
    if (!table) return 75;
    for (var threshold = 800; threshold >= 680; threshold -= 20) {
      if (fico >= threshold && table[threshold] !== undefined) return table[threshold];
    }
    return 75;
  }

  function getMinDscr(fico) {
    for (var threshold = 800; threshold >= 680; threshold -= 20) {
      if (fico >= threshold && MIN_DSCR[threshold] !== undefined) return MIN_DSCR[threshold];
    }
    return 1.20;
  }

  // Monthly payment (P&I) for fully-amortizing loan
  function calcMonthlyPI(principal, annualRate, termMonths) {
    var r = annualRate / 12;
    if (r === 0) return principal / termMonths;
    return principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
  }

  // Interest-only monthly payment
  function calcMonthlyIO(principal, annualRate) {
    return principal * (annualRate / 12);
  }

  function fmt(n) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function fmtPct(n) { return (n * 100).toFixed(3) + '%'; }
  function fmtRate(n) { return (n * 100).toFixed(3) + '%'; }

  /* ─────────── MAIN CALCULATOR ─────────── */

  function calculateLoan(inputs) {
    var fico = parseInt(inputs.fico, 10);
    var propertyValue = parseFloat(inputs.propertyValue);
    var loanAmount = parseFloat(inputs.loanAmount);
    var propertyType = inputs.propertyType;
    var purpose = inputs.purpose;
    var ioOption = inputs.ioOption || 'No IO';
    var pppOption = inputs.pppOption || '5y (5% Flat)';
    var monthlyRent = parseFloat(inputs.monthlyRent) || 0;
    var annualTaxes = parseFloat(inputs.annualTaxes) || 0;
    var annualInsurance = parseFloat(inputs.annualInsurance) || 0;
    var annualHOA = parseFloat(inputs.annualHOA) || 0;
    var termYears = parseInt(inputs.termYears, 10) || 30;

    var result = { valid: false, errors: [] };

    // Validation
    if (isNaN(fico) || fico < 680) {
      result.errors.push('Minimum FICO score is 680 for DSCR loans.');
      return result;
    }
    if (isNaN(propertyValue) || propertyValue < 115000) {
      result.errors.push('Minimum property value is $115,000.');
      return result;
    }
    if (isNaN(loanAmount) || loanAmount < 75000) {
      result.errors.push('Minimum loan amount is $75,000.');
      return result;
    }

    // Calculate LTV
    var ltv = (loanAmount / propertyValue) * 100;
    var maxLtv = getMaxLtv(purpose, fico);

    if (ltv > maxLtv) {
      result.errors.push('LTV of ' + ltv.toFixed(1) + '% exceeds maximum ' + maxLtv + '% for your scenario. Max loan: $' + fmt(Math.floor(propertyValue * maxLtv / 100)));
      return result;
    }

    if (ltv > 80) {
      result.errors.push('Maximum LTV is 80%.');
      return result;
    }

    // Lookup indices
    var ficoIdx = getFicoBucket(fico);
    var ltvIdx = getLtvBucketIndex(ltv);

    // Base rate
    var baseRate = BASE_RATES[ficoIdx][ltvIdx];

    // Adjustments
    var propAdj = PROP_TYPE_ADJ[propertyType] ? PROP_TYPE_ADJ[propertyType][ltvIdx] : 0;
    var purpAdj = PURPOSE_ADJ[purpose] ? PURPOSE_ADJ[purpose][ltvIdx] : 0;
    var ioAdj = IO_ADJ[ioOption] ? IO_ADJ[ioOption][ltvIdx] : 0;
    var pppAdj = PPP_ADJ[pppOption] ? PPP_ADJ[pppOption][ltvIdx] : 0;
    var sizeAdj = getLoanSizeAdj(loanAmount, ltvIdx);

    var totalAdj = propAdj + purpAdj + ioAdj + pppAdj + sizeAdj;
    var finalRate = baseRate + totalAdj;

    // Monthly payments
    var termMonths = termYears * 12;
    var monthlyPI = calcMonthlyPI(loanAmount, finalRate, termMonths);
    var monthlyIOPmt = calcMonthlyIO(loanAmount, finalRate);

    var monthlyTaxes = annualTaxes / 12;
    var monthlyIns = annualInsurance / 12;
    var monthlyHOA = annualHOA / 12;
    var monthlyEscrow = monthlyTaxes + monthlyIns + monthlyHOA;

    // DSCR calculation — use IO payment if IO option selected, else P&I
    var qualifyingPayment = (ioOption !== 'No IO') ? monthlyIOPmt : monthlyPI;
    var monthlyPITIA = qualifyingPayment + monthlyEscrow;
    var dscr = monthlyRent > 0 ? monthlyRent / monthlyPITIA : 0;

    // Min DSCR check
    var minDscr = getMinDscr(fico);

    result.valid = true;
    result.ltv = ltv;
    result.maxLtv = maxLtv;
    result.baseRate = baseRate;
    result.adjustments = {
      propertyType: propAdj,
      purpose: purpAdj,
      io: ioAdj,
      prepay: pppAdj,
      loanSize: sizeAdj,
      total: totalAdj
    };
    result.finalRate = finalRate;
    result.loanAmount = loanAmount;
    result.monthlyPI = monthlyPI;
    result.monthlyIO = monthlyIOPmt;
    result.monthlyEscrow = monthlyEscrow;
    result.monthlyPITIA = monthlyPITIA;
    result.dscr = dscr;
    result.minDscr = minDscr;
    result.dscrPass = dscr >= minDscr;
    result.ficoBucket = FICO_BUCKETS[ficoIdx].label;
    result.ltvBucket = LTV_LABELS[ltvIdx];
    result.termYears = termYears;
    result.ioOption = ioOption;

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

  function initSizer() {
    var form = $('sizerForm');
    if (!form) return;

    // Format currency fields on blur
    ['propertyValue', 'loanAmount', 'monthlyRent', 'annualTaxes', 'annualInsurance', 'annualHOA'].forEach(function (id) {
      var el = $(id);
      if (el) formatCurrencyInput(el);
    });

    // Auto-calc loan amount from property value + LTV slider
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

    // Form submission
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      runCalculation();
    });

    // Live recalculation on change
    var allInputs = form.querySelectorAll('input, select');
    allInputs.forEach(function (el) {
      el.addEventListener('change', function () {
        // Only recalculate if we have minimum required fields
        var pv = parseCurrency(propValueEl.value);
        var fico = parseInt($('fico').value, 10);
        if (pv > 0 && fico >= 680) {
          runCalculation();
        }
      });
    });
  }

  function runCalculation() {
    var inputs = {
      fico: $('fico').value,
      propertyValue: parseCurrency($('propertyValue').value),
      loanAmount: parseCurrency($('loanAmount').value),
      propertyType: $('propertyType').value,
      purpose: $('purpose').value,
      ioOption: $('ioOption').value,
      pppOption: $('pppOption').value,
      monthlyRent: parseCurrency($('monthlyRent').value),
      annualTaxes: parseCurrency($('annualTaxes').value),
      annualInsurance: parseCurrency($('annualInsurance').value),
      annualHOA: $('annualHOA') ? parseCurrency($('annualHOA').value) : 0,
      termYears: 30
    };

    var result = calculateLoan(inputs);
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
        result.errors.map(function (e) { return '<p class="text-red-700 text-sm">' + e + '</p>'; }).join('') +
        '</div>';
      return;
    }

    errorDiv.classList.add('hidden');
    successDiv.classList.remove('hidden');

    // Populate result fields
    $('resRate').textContent = fmtRate(result.finalRate);
    $('resLoan').textContent = '$' + fmt(result.loanAmount);
    $('resLtv').textContent = result.ltv.toFixed(1) + '%';

    var paymentLabel = result.ioOption !== 'No IO' ? 'Monthly IO Payment' : 'Monthly P&I';
    $('resPaymentLabel').textContent = paymentLabel;
    var displayPayment = result.ioOption !== 'No IO' ? result.monthlyIO : result.monthlyPI;
    $('resPayment').textContent = '$' + fmt(displayPayment);
    $('resPITIA').textContent = '$' + fmt(displayPayment + result.monthlyEscrow);

    // DSCR
    var dscrEl = $('resDscr');
    if (result.dscr > 0) {
      dscrEl.textContent = result.dscr.toFixed(2) + 'x';
      dscrEl.className = result.dscrPass ? 'text-2xl font-bold text-green-600' : 'text-2xl font-bold text-red-600';
      $('resDscrNote').textContent = result.dscrPass
        ? 'Meets minimum DSCR of ' + result.minDscr.toFixed(2) + 'x'
        : 'Below minimum DSCR of ' + result.minDscr.toFixed(2) + 'x — consider lower LTV or higher rent';
      $('resDscrNote').className = result.dscrPass ? 'text-xs text-green-600' : 'text-xs text-red-600';
    } else {
      dscrEl.textContent = 'N/A';
      dscrEl.className = 'text-2xl font-bold text-slate-400';
      $('resDscrNote').textContent = 'Enter monthly rent to calculate DSCR';
      $('resDscrNote').className = 'text-xs text-slate-500';
    }

    // Rate breakdown
    var breakdown = $('rateBreakdown');
    if (breakdown) {
      var adj = result.adjustments;
      var rows = [
        ['Base Rate (' + result.ficoBucket + ' FICO, ' + result.ltvBucket + ' LTV)', fmtRate(result.baseRate)],
        ['Property Type', (adj.propertyType >= 0 ? '+' : '') + fmtPct(adj.propertyType)],
        ['Loan Purpose', (adj.purpose >= 0 ? '+' : '') + fmtPct(adj.purpose)],
        ['Interest-Only', (adj.io >= 0 ? '+' : '') + fmtPct(adj.io)],
        ['Prepay Penalty', (adj.prepay >= 0 ? '+' : '') + fmtPct(adj.prepay)],
        ['Loan Size', (adj.loanSize >= 0 ? '+' : '') + fmtPct(adj.loanSize)],
        ['Final Rate', fmtRate(result.finalRate)]
      ];

      breakdown.innerHTML = rows.map(function (r, i) {
        var isLast = i === rows.length - 1;
        var cls = isLast ? 'font-bold text-brand-blue border-t border-slate-300 pt-2 mt-2' : '';
        return '<div class="flex justify-between text-sm ' + cls + '"><span>' + r[0] + '</span><span>' + r[1] + '</span></div>';
      }).join('');
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSizer);
  } else {
    initSizer();
  }

  // Expose for testing
  window.SwiftPathSizer = { calculateLoan: calculateLoan };
})();
