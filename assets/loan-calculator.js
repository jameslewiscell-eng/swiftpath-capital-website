/**
 * SwiftPath Capital — Unified Loan Calculator
 * Handles DSCR, Fix & Flip, Bridge, and Ground-Up Construction loan calculations.
 * Pricing engines derived from RCN Capital rate sheets (LTR + RTL).
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
   *  SHARED HELPERS
   * ═══════════════════════════════════════════════════════════ */

  function fmt(n) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function fmtPct(n) { return (n * 100).toFixed(2) + '%'; }
  function fmtRate(n) { return (n * 100).toFixed(3) + '%'; }

  function calcMonthlyPI(principal, annualRate, termMonths) {
    var r = annualRate / 12;
    if (r === 0) return principal / termMonths;
    return principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
  }

  function calcMonthlyIO(principal, annualRate) {
    return principal * (annualRate / 12);
  }

  function $(id) { return document.getElementById(id); }

  function parseCurrency(val) {
    return parseFloat((val || '').replace(/[^0-9.]/g, '')) || 0;
  }

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

  /* ═══════════════════════════════════════════════════════════
   *  DSCR RENTAL LOAN ENGINE
   *  From LTR (LLPA) rate sheets
   * ═══════════════════════════════════════════════════════════ */

  var DSCR = (function () {
    var LTV_BUCKETS = [50, 55, 60, 65, 70, 75, 80];
    var LTV_LABELS = ['<= 50%', '<= 55%', '<= 60%', '<= 65%', '<= 70%', '<= 75%', '<= 80%'];

    var FICO_BUCKETS = [
      { min: 680, label: '680+' }, { min: 700, label: '700+' },
      { min: 720, label: '720+' }, { min: 740, label: '740+' },
      { min: 760, label: '760+' }, { min: 780, label: '780+' },
      { min: 800, label: '800+' }
    ];

    var BASE_RATES = [
      [0.0630, 0.06325, 0.06475, 0.06550, 0.06800, 0.07050, 0.07300],
      [0.0615, 0.06175, 0.06350, 0.06450, 0.06625, 0.06875, 0.07050],
      [0.0610, 0.06125, 0.06238, 0.06375, 0.06475, 0.06675, 0.06925],
      [0.06075, 0.06100, 0.06150, 0.06250, 0.06425, 0.06550, 0.06800],
      [0.06050, 0.06075, 0.06125, 0.06175, 0.06275, 0.06475, 0.06675],
      [0.06025, 0.06050, 0.06100, 0.06150, 0.06200, 0.06300, 0.06550],
      [0.06000, 0.06025, 0.06075, 0.06125, 0.06175, 0.06275, 0.06525]
    ];

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

    var PURPOSE_ADJ = {
      'Purchase':        [0, 0, 0, 0, 0, 0, 0],
      'Delayed Purchase':[0, 0, 0, 0, 0, 0, 0],
      'Rate/Term Refi':  [0, 0, 0, 0, 0, 0, 0],
      'Cash-Out Refi':   [0.00025, 0.0005, 0.00075, 0.001, 0.00175, 0.0025, 0.01]
    };

    var IO_ADJ = {
      'No IO':  [0, 0, 0, 0, 0, 0, 0],
      '5Y IO':  [0.00175, 0.00175, 0.00175, 0.00225, 0.00225, 0.003, 0.003],
      '7Y IO':  [0.0015, 0.0015, 0.0015, 0.002, 0.002, 0.00275, 0.00275],
      '10Y IO': [0.00125, 0.00125, 0.00125, 0.00175, 0.00175, 0.0025, 0.0025]
    };

    var PPP_ADJ = {
      '5y (5% Flat)':   [-0.0025, -0.0025, -0.0025, -0.0025, -0.0025, -0.0025, -0.0025],
      '5y (Step-Down)': [-0.00175, -0.00175, -0.00175, -0.00175, -0.00175, -0.00175, -0.00175],
      '3y (Step-Down)': [0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001],
      '2y (Step-Down)': [0.002, 0.002, 0.002, 0.002, 0.002, 0.002, 0.002],
      '1y (1%)':        [0.00225, 0.00225, 0.00225, 0.00225, 0.00225, 0.00225, 0.00225],
      'No Prepay':      [0.00275, 0.00275, 0.00275, 0.00275, 0.00275, 0.00275, 0.00275]
    };

    var SIZE_BRACKETS = [
      { max: 75000,    adj: [0.002, 0.00225, 0.0025, 0.00275, 0.003, 0.003, 0.003] },
      { max: 100000,   adj: [0, 0.0005, 0.00075, 0.001, 0.00125, 0.0015, 0.00175] },
      { max: 125000,   adj: [0, 0, 0.00025, 0.0005, 0.00075, 0.001, 0.00125] },
      { max: 150000,   adj: [0, 0, 0, 0, 0, 0, 0] },
      { max: Infinity, adj: [0, 0, 0, 0, 0, 0, 0] }
    ];

    var MAX_LTV = {
      'Purchase':        { 680: 75, 700: 80, 720: 80, 740: 80, 760: 80, 780: 80, 800: 80 },
      'Delayed Purchase':{ 680: 75, 700: 80, 720: 80, 740: 80, 760: 80, 780: 80, 800: 80 },
      'Rate/Term Refi':  { 680: 75, 700: 80, 720: 80, 740: 80, 760: 80, 780: 80, 800: 80 },
      'Cash-Out Refi':   { 680: 70, 700: 75, 720: 75, 740: 75, 760: 75, 780: 75, 800: 75 }
    };

    var MIN_DSCR = {
      680: 1.20, 700: 1.10, 720: 1.00, 740: 1.00, 760: 1.00, 780: 1.00, 800: 1.00
    };

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

    function calculate(inputs) {
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

      var result = { valid: false, errors: [], warnings: [], loanType: 'dscr' };

      if (isNaN(fico) || fico < 680) { result.errors.push('Minimum FICO score is 680 for DSCR loans.'); return result; }
      if (isNaN(propertyValue) || propertyValue < 115000) { result.errors.push('Minimum property value is $115,000.'); return result; }
      if (isNaN(loanAmount) || loanAmount < 75000) { result.errors.push('Minimum loan amount is $75,000.'); return result; }

      var ltv = (loanAmount / propertyValue) * 100;
      var maxLtv = getMaxLtv(purpose, fico);

      if (ltv > maxLtv) {
        result.errors.push('LTV of ' + ltv.toFixed(1) + '% exceeds maximum ' + maxLtv + '% for your scenario. Max loan: $' + fmt(Math.floor(propertyValue * maxLtv / 100)));
        return result;
      }
      if (ltv > 80) { result.errors.push('Maximum LTV is 80%.'); return result; }

      var ficoIdx = getFicoBucket(fico);
      var ltvIdx = getLtvBucketIndex(ltv);

      var baseRate = BASE_RATES[ficoIdx][ltvIdx];
      var propAdj = PROP_TYPE_ADJ[propertyType] ? PROP_TYPE_ADJ[propertyType][ltvIdx] : 0;
      var purpAdj = PURPOSE_ADJ[purpose] ? PURPOSE_ADJ[purpose][ltvIdx] : 0;
      var ioAdj = IO_ADJ[ioOption] ? IO_ADJ[ioOption][ltvIdx] : 0;
      var pppAdj = PPP_ADJ[pppOption] ? PPP_ADJ[pppOption][ltvIdx] : 0;
      var sizeAdj = getLoanSizeAdj(loanAmount, ltvIdx);

      var totalAdj = propAdj + purpAdj + ioAdj + pppAdj + sizeAdj;
      var finalRate = baseRate + totalAdj;

      var monthlyPI = calcMonthlyPI(loanAmount, finalRate, 360);
      var monthlyIOPmt = calcMonthlyIO(loanAmount, finalRate);

      var monthlyEscrow = (annualTaxes / 12) + (annualInsurance / 12) + (annualHOA / 12);
      var qualifyingPayment = (ioOption !== 'No IO') ? monthlyIOPmt : monthlyPI;
      var monthlyPITIA = qualifyingPayment + monthlyEscrow;
      var dscr = monthlyRent > 0 ? monthlyRent / monthlyPITIA : 0;
      var minDscr = getMinDscr(fico);

      // Down payment for purchase scenarios
      var downPayment = 0;
      if (purpose === 'Purchase' || purpose === 'Delayed Purchase') {
        downPayment = propertyValue - loanAmount;
        if (downPayment < 0) downPayment = 0;
      }

      // Qualification status
      var qualStatus = 'pass';
      var qualMessage = 'This deal qualifies based on current guidelines';
      if (dscr > 0 && dscr < minDscr) {
        qualStatus = 'caution';
        qualMessage = 'DSCR of ' + dscr.toFixed(2) + 'x is below the ' + minDscr.toFixed(2) + 'x minimum — consider lower LTV or higher rent';
      } else if (monthlyRent <= 0) {
        qualStatus = 'caution';
        qualMessage = 'Enter monthly rent to verify DSCR qualification';
      }

      result.valid = true;
      result.qualStatus = qualStatus;
      result.qualMessage = qualMessage;
      result.ltv = ltv;
      result.maxLtv = maxLtv;
      result.downPayment = downPayment;
      result.totalCashToClose = downPayment;
      result.baseRate = baseRate;
      result.adjustments = {
        propertyType: propAdj, purpose: purpAdj, io: ioAdj, prepay: pppAdj, loanSize: sizeAdj, total: totalAdj
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
      result.ioOption = ioOption;
      result.purpose = purpose;

      return result;
    }

    return { calculate: calculate };
  })();


  /* ═══════════════════════════════════════════════════════════
   *  RTL SHARED ENGINE (Fix & Flip, Bridge, Ground-Up Construction)
   *  From GUC | RTL (Calc) rate sheets
   * ═══════════════════════════════════════════════════════════ */

  var RTL_SHARED = (function () {
    var ORIG_TIERS = [
      { points: 0.005,  label: '0.50%', rates: [0.1099, 0.1049, 0.0999] },
      { points: 0.0075, label: '0.75%', rates: [0.1074, 0.0999, 0.0974] },
      { points: 0.01,   label: '1.00%', rates: [0.1049, 0.0974, 0.0949] }
    ];

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

    var FICO_ADJ = [
      { min: 700, adj: 0 },
      { min: 680, adj: 0.0025 },
      { min: 650, adj: 0.005 },
      { min: 0,   adj: 0.005 }
    ];

    var FICO_LTV_ADJ = [
      { min: 700, arAdj: 0,  tLtcAdj: 0 },
      { min: 680, arAdj: 0,  tLtcAdj: -0.05 },
      { min: 650, arAdj: 0,  tLtcAdj: -0.10 },
      { min: 0,   arAdj: 0,  tLtcAdj: -0.05 }
    ];

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

    function calculateRate(origTierIdx, expIdx, fico, totalLoan) {
      var origTier = ORIG_TIERS[origTierIdx] || ORIG_TIERS[1];
      var baseRate = origTier.rates[expIdx];
      var loanSizeAdj = getLoanSizeAdj(totalLoan);
      var ficoAdj = getFicoAdj(fico);
      var totalAdj = loanSizeAdj + ficoAdj;

      return {
        origTier: origTier,
        baseRate: baseRate,
        loanSizeAdj: loanSizeAdj,
        ficoAdj: ficoAdj,
        totalAdj: totalAdj,
        finalRate: baseRate + totalAdj
      };
    }

    return {
      ORIG_TIERS: ORIG_TIERS,
      getExpBucket: getExpBucket,
      getExpLabel: getExpLabel,
      getFicoLtvAdj: getFicoLtvAdj,
      calculateRate: calculateRate
    };
  })();


  /* ═══════════════════════════════════════════════════════════
   *  FIX & FLIP ENGINE
   * ═══════════════════════════════════════════════════════════ */

  var FLIP = (function () {
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

    function getRehabBucket(rehabPct) {
      if (rehabPct <= 0.25) return 'Light';
      if (rehabPct <= 0.50) return 'Moderate';
      return 'Heavy';
    }

    function calculate(inputs) {
      var fico = parseInt(inputs.fico, 10) || 0;
      var experience = parseInt(inputs.experience, 10) || 0;
      var purchasePrice = parseFloat(inputs.purchasePrice) || 0;
      var asIsValue = parseFloat(inputs.asIsValue) || 0;
      var rehabBudget = parseFloat(inputs.rehabBudget) || 0;
      var afterRepairValue = parseFloat(inputs.afterRepairValue) || 0;
      var origTierIdx = parseInt(inputs.origTier, 10) || 0;
      var loanTermMonths = parseInt(inputs.loanTerm, 10) || 12;

      var result = { valid: false, errors: [], warnings: [], loanType: 'flip' };

      if (fico > 0 && fico < 650) { result.errors.push('Minimum FICO score is 650 for Fix & Flip loans.'); return result; }
      if (purchasePrice <= 0) { result.errors.push('Please enter a valid purchase price.'); return result; }
      if (afterRepairValue <= 0) { result.errors.push('Please enter a valid After-Repair Value (ARV).'); return result; }
      if (afterRepairValue < 100000) { result.errors.push('Minimum After-Repair Value is $100,000.'); return result; }
      if (afterRepairValue <= purchasePrice) { result.errors.push('After-Repair Value must be greater than the purchase price.'); return result; }
      if (rehabBudget <= 0) { result.errors.push('Please enter a rehab budget.'); return result; }

      if (!asIsValue || asIsValue <= 0) asIsValue = purchasePrice;

      var rehabPct = rehabBudget / purchasePrice;
      var rehabType = getRehabBucket(rehabPct);
      var expIdx = RTL_SHARED.getExpBucket(experience);
      var expLabel = RTL_SHARED.getExpLabel(experience);

      var limits = LTV_LIMITS[rehabType][expLabel];
      if (!limits) { result.errors.push('Unable to determine leverage limits for this scenario.'); return result; }

      var ficoLtvAdj = RTL_SHARED.getFicoLtvAdj(fico);
      var adjArLtv = limits.arLtv + ficoLtvAdj.arAdj;
      var adjTLtc = limits.tLtc + ficoLtvAdj.tLtcAdj;

      var totalCost = purchasePrice + rehabBudget;
      var maxByAiLtv = Math.floor(asIsValue * limits.aiLtv);
      var maxByILtc = Math.floor(totalCost * limits.iLtc);
      var maxByArLtv = Math.floor(afterRepairValue * adjArLtv);
      var maxByTLtc = Math.floor(totalCost * adjTLtc);

      var maxInitialAdvance = Math.min(maxByAiLtv, maxByILtc, purchasePrice);
      var maxTotalLoan = Math.min(maxByArLtv, maxByTLtc);

      var rehabFundedMax = Math.min(maxTotalLoan - maxInitialAdvance, rehabBudget);
      if (rehabFundedMax < 0) rehabFundedMax = 0;

      var rehabFundedCalc = Math.floor(rehabBudget * 0.85);
      var rehabFunded = Math.min(rehabFundedCalc, rehabFundedMax);
      var rehabOOP = rehabBudget - rehabFunded;

      var totalLoan = maxInitialAdvance + rehabFunded;
      if (totalLoan < 75000) { result.errors.push('Minimum loan amount is $75,000. Your estimated loan of $' + fmt(totalLoan) + ' is below this threshold.'); return result; }

      if (totalLoan > maxByArLtv) {
        totalLoan = maxByArLtv;
        rehabFunded = totalLoan - maxInitialAdvance;
        if (rehabFunded < 0) { maxInitialAdvance = totalLoan; rehabFunded = 0; }
        rehabOOP = rehabBudget - rehabFunded;
      }
      if (totalLoan > maxByTLtc) {
        totalLoan = maxByTLtc;
        rehabFunded = totalLoan - maxInitialAdvance;
        if (rehabFunded < 0) { maxInitialAdvance = totalLoan; rehabFunded = 0; }
        rehabOOP = rehabBudget - rehabFunded;
      }

      var actualArLtv = totalLoan / afterRepairValue;
      var actualTLtc = totalLoan / totalCost;

      var pricing = RTL_SHARED.calculateRate(origTierIdx, expIdx, fico, totalLoan);
      var monthlyIO = calcMonthlyIO(totalLoan, pricing.finalRate);
      var origFee = totalLoan * pricing.origTier.points;

      var downPayment = purchasePrice - maxInitialAdvance;
      if (downPayment < 0) downPayment = 0;

      var totalInvestorCost = downPayment + rehabOOP + origFee + (monthlyIO * loanTermMonths);
      var projectedProfit = afterRepairValue - purchasePrice - rehabBudget - origFee - (monthlyIO * loanTermMonths);
      var projectedROI = totalInvestorCost > 0 ? (projectedProfit / totalInvestorCost) : 0;

      var qualStatus = 'pass';
      var qualMessage = 'This deal qualifies based on current guidelines';
      if (projectedProfit <= 0) {
        qualStatus = 'caution';
        qualMessage = 'Deal shows negative projected profit — review your numbers';
      }

      if (rehabType === 'Heavy' && experience < 5) {
        result.warnings.push('Heavy rehab projects have tighter leverage limits for borrowers with fewer than 5 deals.');
      }
      if (fico > 0 && fico < 680) {
        result.warnings.push('FICO below 680 results in reduced leverage (T-LTC reduced 5-10%).');
      }

      result.valid = true;
      result.qualStatus = qualStatus;
      result.qualMessage = qualMessage;
      result.downPayment = downPayment;
      result.rehabOOP = rehabOOP;
      result.origFee = origFee;
      result.totalCashToClose = downPayment + rehabOOP + origFee;
      result.loanAmount = totalLoan;
      result.initialAdvance = maxInitialAdvance;
      result.rehabFunded = rehabFunded;
      result.monthlyIO = monthlyIO;
      result.loanTermMonths = loanTermMonths;
      result.finalRate = pricing.finalRate;
      result.baseRate = pricing.baseRate;
      result.origTier = pricing.origTier;
      result.adjustments = { loanSize: pricing.loanSizeAdj, fico: pricing.ficoAdj, total: pricing.totalAdj };
      result.expLabel = expLabel;
      result.rehabType = rehabType;
      result.rehabPct = rehabPct;
      result.actualArLtv = actualArLtv;
      result.actualTLtc = actualTLtc;
      result.adjArLtv = adjArLtv;
      result.adjTLtc = adjTLtc;
      result.projectedProfit = projectedProfit;
      result.projectedROI = projectedROI;

      return result;
    }

    return { calculate: calculate };
  })();


  /* ═══════════════════════════════════════════════════════════
   *  BRIDGE LOAN ENGINE
   *  Same pricing as RTL, but no rehab component.
   *  LTV limits from GUC|RTL (Calc) Bridge rows.
   * ═══════════════════════════════════════════════════════════ */

  var BRIDGE = (function () {
    // Bridge LTV limits: AI-LTV only (no rehab, no T-LTC constraint)
    // From Calc rows 8-10 (Purchase SFR) and 23-25 (Purchase Multi)
    var LTV_LIMITS = {
      '0':  { aiLtv: 0.75 },
      '1-4':{ aiLtv: 0.75 },
      '5+': { aiLtv: 0.80 }
    };

    function calculate(inputs) {
      var fico = parseInt(inputs.fico, 10) || 0;
      var experience = parseInt(inputs.experience, 10) || 0;
      var propertyValue = parseFloat(inputs.propertyValue) || 0;
      var purchasePrice = parseFloat(inputs.purchasePrice) || 0;
      var origTierIdx = parseInt(inputs.origTier, 10) || 0;
      var loanTermMonths = parseInt(inputs.loanTerm, 10) || 12;

      var result = { valid: false, errors: [], warnings: [], loanType: 'bridge' };

      if (fico > 0 && fico < 650) { result.errors.push('Minimum FICO score is 650 for Bridge loans.'); return result; }
      if (propertyValue <= 0) { result.errors.push('Please enter a valid property value.'); return result; }
      if (propertyValue < 100000) { result.errors.push('Minimum property value is $100,000.'); return result; }
      if (purchasePrice <= 0) { result.errors.push('Please enter a valid purchase price.'); return result; }

      var expIdx = RTL_SHARED.getExpBucket(experience);
      var expLabel = RTL_SHARED.getExpLabel(experience);
      var limits = LTV_LIMITS[expLabel];

      var maxLoan = Math.floor(propertyValue * limits.aiLtv);
      var loanAmount = Math.min(maxLoan, purchasePrice);

      if (loanAmount < 75000) { result.errors.push('Minimum loan amount is $75,000. Your estimated loan of $' + fmt(loanAmount) + ' is below this threshold.'); return result; }

      var pricing = RTL_SHARED.calculateRate(origTierIdx, expIdx, fico, loanAmount);
      var monthlyIO = calcMonthlyIO(loanAmount, pricing.finalRate);
      var origFee = loanAmount * pricing.origTier.points;

      var downPayment = purchasePrice - loanAmount;
      if (downPayment < 0) downPayment = 0;

      var actualLtv = loanAmount / propertyValue;

      var qualStatus = 'pass';
      var qualMessage = 'This deal qualifies based on current guidelines';

      if (fico > 0 && fico < 680) {
        result.warnings.push('FICO below 680 may result in additional review.');
      }

      result.valid = true;
      result.qualStatus = qualStatus;
      result.qualMessage = qualMessage;
      result.downPayment = downPayment;
      result.origFee = origFee;
      result.totalCashToClose = downPayment + origFee;
      result.loanAmount = loanAmount;
      result.monthlyIO = monthlyIO;
      result.loanTermMonths = loanTermMonths;
      result.finalRate = pricing.finalRate;
      result.baseRate = pricing.baseRate;
      result.origTier = pricing.origTier;
      result.adjustments = { loanSize: pricing.loanSizeAdj, fico: pricing.ficoAdj, total: pricing.totalAdj };
      result.expLabel = expLabel;
      result.actualLtv = actualLtv;
      result.maxLtv = limits.aiLtv;

      return result;
    }

    return { calculate: calculate };
  })();


  /* ═══════════════════════════════════════════════════════════
   *  GROUND-UP CONSTRUCTION ENGINE
   *  From GUC|RTL (Calc) rows 5-7 (Purchase SFR)
   *  Same pricing as RTL, tighter LTV limits.
   * ═══════════════════════════════════════════════════════════ */

  var GUC = (function () {
    // GUC LTV limits from Calc rows 5-7
    var LTV_LIMITS = {
      '0':  { aiLtv: 0.70, iLtc: 0.70, arLtv: 0.65, tLtc: 0.85 },
      '1-4':{ aiLtv: 0.75, iLtc: 0.75, arLtv: 0.70, tLtc: 0.85 },
      '5+': { aiLtv: 0.75, iLtc: 0.80, arLtv: 0.75, tLtc: 0.90 }
    };

    function calculate(inputs) {
      var fico = parseInt(inputs.fico, 10) || 0;
      var experience = parseInt(inputs.experience, 10) || 0;
      var lotPrice = parseFloat(inputs.lotPrice) || 0;
      var constructionBudget = parseFloat(inputs.constructionBudget) || 0;
      var afterBuiltValue = parseFloat(inputs.afterBuiltValue) || 0;
      var asIsValue = parseFloat(inputs.asIsValue) || 0;
      var origTierIdx = parseInt(inputs.origTier, 10) || 0;
      var loanTermMonths = parseInt(inputs.loanTerm, 10) || 18;

      var result = { valid: false, errors: [], warnings: [], loanType: 'guc' };

      if (fico > 0 && fico < 650) { result.errors.push('Minimum FICO score is 650 for Construction loans.'); return result; }
      if (lotPrice <= 0) { result.errors.push('Please enter a valid lot/land acquisition price.'); return result; }
      if (constructionBudget <= 0) { result.errors.push('Please enter a construction budget.'); return result; }
      if (afterBuiltValue <= 0) { result.errors.push('Please enter a valid After-Built Value.'); return result; }
      if (afterBuiltValue < 100000) { result.errors.push('Minimum After-Built Value is $100,000.'); return result; }
      if (afterBuiltValue <= lotPrice + constructionBudget) {
        result.errors.push('After-Built Value should exceed total project cost (lot + construction).');
        return result;
      }

      if (!asIsValue || asIsValue <= 0) asIsValue = lotPrice;

      var expIdx = RTL_SHARED.getExpBucket(experience);
      var expLabel = RTL_SHARED.getExpLabel(experience);
      var limits = LTV_LIMITS[expLabel];

      var ficoLtvAdj = RTL_SHARED.getFicoLtvAdj(fico);
      var adjArLtv = limits.arLtv + ficoLtvAdj.arAdj;
      var adjTLtc = limits.tLtc + ficoLtvAdj.tLtcAdj;

      var totalCost = lotPrice + constructionBudget;

      // Max initial advance (lot acquisition)
      var maxByAiLtv = Math.floor(asIsValue * limits.aiLtv);
      var maxByILtc = Math.floor(totalCost * limits.iLtc);
      var maxInitialAdvance = Math.min(maxByAiLtv, maxByILtc, lotPrice);

      // Max total loan
      var maxByArLtv = Math.floor(afterBuiltValue * adjArLtv);
      var maxByTLtc = Math.floor(totalCost * adjTLtc);
      var maxTotalLoan = Math.min(maxByArLtv, maxByTLtc);

      // Construction funded
      var constructionFundedMax = Math.min(maxTotalLoan - maxInitialAdvance, constructionBudget);
      if (constructionFundedMax < 0) constructionFundedMax = 0;

      // 85% of construction funded via draws (15% holdback)
      var constructionFundedCalc = Math.floor(constructionBudget * 0.85);
      var constructionFunded = Math.min(constructionFundedCalc, constructionFundedMax);
      var constructionOOP = constructionBudget - constructionFunded;

      var totalLoan = maxInitialAdvance + constructionFunded;

      if (totalLoan < 75000) { result.errors.push('Minimum loan amount is $75,000. Your estimated loan of $' + fmt(totalLoan) + ' is below this threshold.'); return result; }

      // Cap at constraints
      if (totalLoan > maxByArLtv) {
        totalLoan = maxByArLtv;
        constructionFunded = totalLoan - maxInitialAdvance;
        if (constructionFunded < 0) { maxInitialAdvance = totalLoan; constructionFunded = 0; }
        constructionOOP = constructionBudget - constructionFunded;
      }
      if (totalLoan > maxByTLtc) {
        totalLoan = maxByTLtc;
        constructionFunded = totalLoan - maxInitialAdvance;
        if (constructionFunded < 0) { maxInitialAdvance = totalLoan; constructionFunded = 0; }
        constructionOOP = constructionBudget - constructionFunded;
      }

      var actualArLtv = totalLoan / afterBuiltValue;
      var actualTLtc = totalLoan / totalCost;

      var pricing = RTL_SHARED.calculateRate(origTierIdx, expIdx, fico, totalLoan);
      var monthlyIO = calcMonthlyIO(totalLoan, pricing.finalRate);
      var origFee = totalLoan * pricing.origTier.points;

      var downPayment = lotPrice - maxInitialAdvance;
      if (downPayment < 0) downPayment = 0;

      var totalInvestorCost = downPayment + constructionOOP + origFee + (monthlyIO * loanTermMonths);
      var projectedProfit = afterBuiltValue - lotPrice - constructionBudget - origFee - (monthlyIO * loanTermMonths);
      var projectedROI = totalInvestorCost > 0 ? (projectedProfit / totalInvestorCost) : 0;

      var qualStatus = 'pass';
      var qualMessage = 'This deal qualifies based on current guidelines';
      if (experience < 1) {
        qualStatus = 'caution';
        qualMessage = 'Ground-up construction with 0 experience requires additional review';
      }
      if (projectedProfit <= 0) {
        qualStatus = 'caution';
        qualMessage = 'Deal shows negative projected profit — review your numbers';
      }

      if (experience < 5) {
        result.warnings.push('Ground-up construction has tighter leverage limits for borrowers with fewer than 5 deals.');
      }
      if (fico > 0 && fico < 680) {
        result.warnings.push('FICO below 680 results in reduced leverage.');
      }

      result.valid = true;
      result.qualStatus = qualStatus;
      result.qualMessage = qualMessage;
      result.downPayment = downPayment;
      result.constructionOOP = constructionOOP;
      result.origFee = origFee;
      result.totalCashToClose = downPayment + constructionOOP + origFee;
      result.loanAmount = totalLoan;
      result.initialAdvance = maxInitialAdvance;
      result.constructionFunded = constructionFunded;
      result.monthlyIO = monthlyIO;
      result.loanTermMonths = loanTermMonths;
      result.finalRate = pricing.finalRate;
      result.baseRate = pricing.baseRate;
      result.origTier = pricing.origTier;
      result.adjustments = { loanSize: pricing.loanSizeAdj, fico: pricing.ficoAdj, total: pricing.totalAdj };
      result.expLabel = expLabel;
      result.actualArLtv = actualArLtv;
      result.actualTLtc = actualTLtc;
      result.adjArLtv = adjArLtv;
      result.adjTLtc = adjTLtc;
      result.projectedProfit = projectedProfit;
      result.projectedROI = projectedROI;

      return result;
    }

    return { calculate: calculate };
  })();


  /* ═══════════════════════════════════════════════════════════
   *  UI WIRING — Tab switching, form handling, results display
   * ═══════════════════════════════════════════════════════════ */

  var currentLoanType = 'dscr';

  function initTabs() {
    var tabs = document.querySelectorAll('.loan-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var type = tab.getAttribute('data-loan-type');
        switchTab(type);
      });
    });
  }

  function switchTab(type) {
    currentLoanType = type;

    // Update tab styles
    document.querySelectorAll('.loan-tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-loan-type') === type);
    });

    // Show/hide form sections
    document.querySelectorAll('.loan-form-section').forEach(function (s) {
      s.classList.toggle('active', s.id === 'form-' + type);
    });

    // Hide results when switching tabs
    var panel = $('resultPanel');
    if (panel) panel.classList.add('hidden');
  }

  function initForms() {
    // DSCR form
    var dscrForm = $('dscrForm');
    if (dscrForm) {
      ['dscr-propertyValue', 'dscr-loanAmount', 'dscr-monthlyRent', 'dscr-annualTaxes', 'dscr-annualInsurance', 'dscr-annualHOA'].forEach(function (id) {
        var el = $(id);
        if (el) formatCurrencyInput(el);
      });

      var ltvSlider = $('dscr-ltvSlider');
      var ltvDisplay = $('dscr-ltvDisplay');
      var propValueEl = $('dscr-propertyValue');
      var loanAmtEl = $('dscr-loanAmount');

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

      dscrForm.addEventListener('submit', function (e) { e.preventDefault(); runDSCR(); });
      dscrForm.querySelectorAll('input, select').forEach(function (el) {
        el.addEventListener('change', function () {
          var pv = parseCurrency(propValueEl.value);
          var fico = parseInt($('dscr-fico').value, 10);
          if (pv > 0 && fico >= 680) runDSCR();
        });
      });
    }

    // Flip form
    var flipForm = $('flipForm');
    if (flipForm) {
      ['flip-purchasePrice', 'flip-asIsValue', 'flip-rehabBudget', 'flip-afterRepairValue'].forEach(function (id) {
        var el = $(id);
        if (el) formatCurrencyInput(el);
      });

      flipForm.addEventListener('submit', function (e) { e.preventDefault(); runFlip(); });
      flipForm.querySelectorAll('input, select').forEach(function (el) {
        el.addEventListener('change', function () {
          var pp = parseCurrency($('flip-purchasePrice').value);
          var arv = parseCurrency($('flip-afterRepairValue').value);
          if (pp > 0 && arv > 0) runFlip();
        });
      });
    }

    // Bridge form
    var bridgeForm = $('bridgeForm');
    if (bridgeForm) {
      ['bridge-propertyValue', 'bridge-purchasePrice'].forEach(function (id) {
        var el = $(id);
        if (el) formatCurrencyInput(el);
      });

      bridgeForm.addEventListener('submit', function (e) { e.preventDefault(); runBridge(); });
      bridgeForm.querySelectorAll('input, select').forEach(function (el) {
        el.addEventListener('change', function () {
          var pv = parseCurrency($('bridge-propertyValue').value);
          var pp = parseCurrency($('bridge-purchasePrice').value);
          if (pv > 0 && pp > 0) runBridge();
        });
      });
    }

    // GUC form
    var gucForm = $('gucForm');
    if (gucForm) {
      ['guc-lotPrice', 'guc-constructionBudget', 'guc-afterBuiltValue', 'guc-asIsValue'].forEach(function (id) {
        var el = $(id);
        if (el) formatCurrencyInput(el);
      });

      gucForm.addEventListener('submit', function (e) { e.preventDefault(); runGUC(); });
      gucForm.querySelectorAll('input, select').forEach(function (el) {
        el.addEventListener('change', function () {
          var lp = parseCurrency($('guc-lotPrice').value);
          var abv = parseCurrency($('guc-afterBuiltValue').value);
          if (lp > 0 && abv > 0) runGUC();
        });
      });
    }
  }

  function runDSCR() {
    var result = DSCR.calculate({
      fico: $('dscr-fico').value,
      propertyValue: parseCurrency($('dscr-propertyValue').value),
      loanAmount: parseCurrency($('dscr-loanAmount').value),
      propertyType: $('dscr-propertyType').value,
      purpose: $('dscr-purpose').value,
      ioOption: $('dscr-ioOption').value,
      pppOption: $('dscr-pppOption').value,
      monthlyRent: parseCurrency($('dscr-monthlyRent').value),
      annualTaxes: parseCurrency($('dscr-annualTaxes').value),
      annualInsurance: parseCurrency($('dscr-annualInsurance').value),
      annualHOA: parseCurrency($('dscr-annualHOA').value)
    });
    displayResult(result);
  }

  function runFlip() {
    var result = FLIP.calculate({
      fico: $('flip-fico').value,
      experience: $('flip-experience').value,
      purchasePrice: parseCurrency($('flip-purchasePrice').value),
      asIsValue: parseCurrency($('flip-asIsValue') ? $('flip-asIsValue').value : ''),
      rehabBudget: parseCurrency($('flip-rehabBudget').value),
      afterRepairValue: parseCurrency($('flip-afterRepairValue').value),
      origTier: $('flip-origTier').value,
      loanTerm: $('flip-loanTerm').value
    });
    displayResult(result);
  }

  function runBridge() {
    var result = BRIDGE.calculate({
      fico: $('bridge-fico').value,
      experience: $('bridge-experience').value,
      propertyValue: parseCurrency($('bridge-propertyValue').value),
      purchasePrice: parseCurrency($('bridge-purchasePrice').value),
      origTier: $('bridge-origTier').value,
      loanTerm: $('bridge-loanTerm').value
    });
    displayResult(result);
  }

  function runGUC() {
    var result = GUC.calculate({
      fico: $('guc-fico').value,
      experience: $('guc-experience').value,
      lotPrice: parseCurrency($('guc-lotPrice').value),
      constructionBudget: parseCurrency($('guc-constructionBudget').value),
      afterBuiltValue: parseCurrency($('guc-afterBuiltValue').value),
      asIsValue: parseCurrency($('guc-asIsValue') ? $('guc-asIsValue').value : ''),
      origTier: $('guc-origTier').value,
      loanTerm: $('guc-loanTerm').value
    });
    displayResult(result);
  }


  /* ═══════════════════════════════════════════════════════════
   *  RESULTS DISPLAY
   * ═══════════════════════════════════════════════════════════ */

  function displayResult(result) {
    var panel = $('resultPanel');
    var errorDiv = $('resultErrors');
    var warningDiv = $('resultWarnings');
    var successDiv = $('resultSuccess');

    if (!panel) return;
    panel.classList.remove('hidden');

    if (!result.valid) {
      errorDiv.classList.remove('hidden');
      successDiv.classList.add('hidden');
      warningDiv.classList.add('hidden');
      errorDiv.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-lg p-4">' +
        result.errors.map(function (e) { return '<p class="text-red-700 text-sm mb-1">' + e + '</p>'; }).join('') +
        '</div>';
      return;
    }

    errorDiv.classList.add('hidden');
    successDiv.classList.remove('hidden');

    // Warnings
    if (result.warnings && result.warnings.length > 0) {
      warningDiv.classList.remove('hidden');
      warningDiv.innerHTML = '<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">' +
        result.warnings.map(function (w) { return '<p class="text-yellow-800 text-xs mb-1">' + w + '</p>'; }).join('') +
        '</div>';
    } else {
      warningDiv.classList.add('hidden');
    }

    // Qualification badge
    var qualBadge = $('qualBadge');
    var qualText = $('qualText');
    var qualIconPass = $('qualIconPass');
    var qualIconCaution = $('qualIconCaution');

    qualBadge.className = 'qual-badge ' + (result.qualStatus === 'pass' ? 'qual-pass' : result.qualStatus === 'caution' ? 'qual-caution' : 'qual-fail');
    qualText.textContent = result.qualMessage;
    qualIconPass.classList.toggle('hidden', result.qualStatus !== 'pass');
    qualIconCaution.classList.toggle('hidden', result.qualStatus === 'pass');

    // Loan type label
    var labels = { dscr: 'DSCR Rental Loan — 30-Year Fixed', flip: 'Fix & Flip Loan — Interest-Only', bridge: 'Bridge Loan — Interest-Only', guc: 'Ground-Up Construction — Interest-Only' };
    $('resLoanTypeLabel').textContent = labels[result.loanType] || '';

    // Cash to close
    $('resTotalCash').textContent = '$' + fmt(result.totalCashToClose);
    $('resDownPayment').textContent = '$' + fmt(result.downPayment);

    // Origination fee row
    var origFeeRow = $('resOrigFeeRow');
    if (result.origFee !== undefined && result.origFee > 0) {
      origFeeRow.classList.remove('hidden');
      $('resOrigFee').textContent = '$' + fmt(result.origFee);
    } else {
      origFeeRow.classList.add('hidden');
    }

    // Rehab/construction OOP row
    var rehabOOPRow = $('resRehabOOPRow');
    if (result.rehabOOP !== undefined && result.rehabOOP > 0) {
      rehabOOPRow.classList.remove('hidden');
      $('resRehabOOP').textContent = '$' + fmt(result.rehabOOP);
    } else if (result.constructionOOP !== undefined && result.constructionOOP > 0) {
      rehabOOPRow.classList.remove('hidden');
      rehabOOPRow.querySelector('.text-blue-300').textContent = 'Construction (Out-of-Pocket)';
      $('resRehabOOP').textContent = '$' + fmt(result.constructionOOP);
    } else {
      rehabOOPRow.classList.add('hidden');
    }

    // Key metrics
    $('resLoanAmount').textContent = '$' + fmt(result.loanAmount);

    if (result.loanType === 'dscr') {
      var isIO = result.ioOption !== 'No IO';
      $('resPaymentLabel').textContent = isIO ? 'Monthly IO Payment' : 'Monthly P&I';
      $('resMonthlyPayment').textContent = '$' + fmt(isIO ? result.monthlyIO : result.monthlyPI);

      $('resLtv').textContent = result.ltv.toFixed(1) + '%';
      $('resLtvLabel').textContent = 'LTV (Max ' + result.maxLtv + '%)';
      $('resLtvWrap').classList.remove('hidden');

      // DSCR
      $('resDscrWrap').classList.remove('hidden');
      if (result.dscr > 0) {
        $('resDscr').textContent = result.dscr.toFixed(2) + 'x';
        $('resDscr').className = 'deal-metric-value' + (result.dscrPass ? '' : ' !text-red-400');
        $('resDscrLabel').textContent = 'DSCR (Min ' + result.minDscr.toFixed(2) + 'x)';
      } else {
        $('resDscr').textContent = 'N/A';
        $('resDscrLabel').textContent = 'Enter rent to calc DSCR';
      }

      // PITIA section
      $('resPitiaSection').classList.remove('hidden');
      $('resPITIA').textContent = '$' + fmt(result.monthlyPITIA);
      if (result.dscr > 0) {
        $('resDscrNote').textContent = result.dscrPass
          ? 'Meets minimum DSCR of ' + result.minDscr.toFixed(2) + 'x'
          : 'Below minimum DSCR of ' + result.minDscr.toFixed(2) + 'x — consider lower LTV or higher rent';
        $('resDscrNote').className = result.dscrPass ? 'text-xs text-green-400' : 'text-xs text-red-400';
      } else {
        $('resDscrNote').textContent = 'Enter monthly rent to verify DSCR qualification';
        $('resDscrNote').className = 'text-xs text-blue-300';
      }

      $('resProfitSection').classList.add('hidden');

    } else {
      // Flip, Bridge, GUC
      $('resPaymentLabel').textContent = 'Monthly IO Payment';
      $('resMonthlyPayment').textContent = '$' + fmt(result.monthlyIO);

      $('resPitiaSection').classList.add('hidden');
      $('resDscrWrap').classList.add('hidden');

      if (result.loanType === 'bridge') {
        $('resLtv').textContent = fmtPct(result.actualLtv);
        $('resLtvLabel').textContent = 'LTV (Max ' + fmtPct(result.maxLtv) + ')';
        $('resLtvWrap').classList.remove('hidden');
        $('resProfitSection').classList.add('hidden');
      } else {
        // Flip or GUC — show AR-LTV
        $('resLtv').textContent = fmtPct(result.actualArLtv);
        $('resLtvLabel').textContent = 'AR-LTV (Max ' + fmtPct(result.adjArLtv) + ')';
        $('resLtvWrap').classList.remove('hidden');

        // Show DSCR slot as T-LTC for flip/guc
        $('resDscrWrap').classList.remove('hidden');
        $('resDscr').textContent = fmtPct(result.actualTLtc);
        $('resDscr').className = 'deal-metric-value';
        $('resDscrLabel').textContent = 'T-LTC (Max ' + fmtPct(result.adjTLtc) + ')';

        // Profit section
        $('resProfitSection').classList.remove('hidden');
        var profitEl = $('resProfit');
        profitEl.textContent = '$' + fmt(result.projectedProfit);
        profitEl.className = result.projectedProfit > 0 ? 'text-2xl font-bold text-green-400' : 'text-2xl font-bold text-red-400';
        var roiEl = $('resROI');
        roiEl.textContent = fmtPct(result.projectedROI);
        roiEl.className = result.projectedROI > 0 ? 'font-bold text-green-400' : 'font-bold text-red-400';
      }
    }

    // Rate breakdown
    var breakdown = $('rateBreakdown');
    if (breakdown) {
      var rows = [];
      if (result.loanType === 'dscr') {
        var adj = result.adjustments;
        rows = [
          ['Base Rate (' + result.ficoBucket + ' FICO, ' + result.ltvBucket + ' LTV)', fmtRate(result.baseRate)],
          ['Property Type', (adj.propertyType >= 0 ? '+' : '') + fmtPct(adj.propertyType)],
          ['Loan Purpose', (adj.purpose >= 0 ? '+' : '') + fmtPct(adj.purpose)],
          ['Interest-Only', (adj.io >= 0 ? '+' : '') + fmtPct(adj.io)],
          ['Prepay Penalty', (adj.prepay >= 0 ? '+' : '') + fmtPct(adj.prepay)],
          ['Loan Amount', (adj.loanSize >= 0 ? '+' : '') + fmtPct(adj.loanSize)],
          ['Final Rate', fmtRate(result.finalRate)]
        ];
      } else {
        var adj2 = result.adjustments;
        rows = [
          ['Base Rate (' + result.expLabel + ', ' + result.origTier.label + ' pts)', fmtRate(result.baseRate)],
          ['FICO Adjustment', (adj2.fico >= 0 ? '+' : '') + fmtPct(adj2.fico)],
          ['Loan Amount Adjustment', (adj2.loanSize >= 0 ? '+' : '') + fmtPct(adj2.loanSize)],
          ['Final Rate', fmtRate(result.finalRate)]
        ];
        // Add term
        if (result.loanTermMonths) {
          rows.splice(rows.length - 1, 0, ['Loan Term', result.loanTermMonths + ' Months']);
        }
      }

      breakdown.innerHTML = rows.map(function (r, i) {
        var isLast = i === rows.length - 1;
        var cls = isLast ? 'font-bold text-brand-blue border-t border-slate-300 pt-2 mt-2' : '';
        return '<div class="flex justify-between text-sm ' + cls + '"><span>' + r[0] + '</span><span>' + r[1] + '</span></div>';
      }).join('');
    }

    // Leverage breakdown (flip/guc only)
    var leverageCard = $('leverageCard');
    var leverageBreakdown = $('leverageBreakdown');
    if (result.loanType === 'flip' || result.loanType === 'guc') {
      leverageCard.classList.remove('hidden');
      var levRows;
      if (result.loanType === 'flip') {
        levRows = [
          ['Initial Advance', '$' + fmt(result.initialAdvance)],
          ['Rehab Funded (85% draw)', '$' + fmt(result.rehabFunded)],
          ['AR-LTV (Max ' + fmtPct(result.adjArLtv) + ')', fmtPct(result.actualArLtv)],
          ['T-LTC (Max ' + fmtPct(result.adjTLtc) + ')', fmtPct(result.actualTLtc)],
          ['Rehab Type', result.rehabType + ' (' + fmtPct(result.rehabPct) + ' of PP)']
        ];
      } else {
        levRows = [
          ['Lot Advance', '$' + fmt(result.initialAdvance)],
          ['Construction Funded (85% draws)', '$' + fmt(result.constructionFunded)],
          ['AR-LTV (Max ' + fmtPct(result.adjArLtv) + ')', fmtPct(result.actualArLtv)],
          ['T-LTC (Max ' + fmtPct(result.adjTLtc) + ')', fmtPct(result.actualTLtc)]
        ];
      }
      leverageBreakdown.innerHTML = levRows.map(function (r) {
        return '<div class="flex justify-between text-sm"><span>' + r[0] + '</span><span class="font-medium">' + r[1] + '</span></div>';
      }).join('');
    } else {
      leverageCard.classList.add('hidden');
    }

    // CTA text
    var ctaText = $('ctaText');
    var ctaLink = $('ctaLink');
    if (result.qualStatus === 'pass') {
      ctaText.textContent = 'Your deal qualifies. Let\'s lock it in.';
    } else {
      ctaText.textContent = 'Have questions? Let\'s talk through your deal.';
    }

    // Product-specific application link
    var productParam = { dscr: 'DSCR', flip: 'Fix-and-Flip', bridge: 'Bridge', guc: 'New-Construction' };
    ctaLink.href = '/LoanApp.html?product=' + (productParam[result.loanType] || '');
  }


  /* ═══════════════════════════════════════════════════════════
   *  INIT
   * ═══════════════════════════════════════════════════════════ */

  function init() {
    initTabs();
    initForms();

    // Check URL hash for pre-selected loan type
    var hash = window.location.hash.replace('#', '');
    if (['dscr', 'flip', 'bridge', 'guc'].indexOf(hash) !== -1) {
      switchTab(hash);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for testing
  window.SwiftPathLoanCalculator = {
    calculateDSCR: DSCR.calculate,
    calculateFlip: FLIP.calculate,
    calculateBridge: BRIDGE.calculate,
    calculateGUC: GUC.calculate
  };
})();
