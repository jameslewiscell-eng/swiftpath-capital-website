/**
 * SwiftPath Capital — Exit Strategy Calculator
 * Helps investors evaluate a deal based on their exit strategy (Flip or Rent).
 * - Flip: calculates projected profit from buying, rehabbing, and selling at ARV
 * - Rent: calculates refinance scenario (DSCR loan at 75% ARV) and monthly cash flow
 */
(function () {
  'use strict';

  var currentStep = 1;
  var totalSteps = 4;

  // ── Helpers ──────────────────────────────────────────────

  function parseCurrency(val) {
    if (!val) return NaN;
    return parseFloat(val.replace(/[^0-9.\-]/g, ''));
  }

  function formatCurrency(num) {
    if (isNaN(num)) return '$0';
    return '$' + Math.round(num).toLocaleString('en-US');
  }

  function formatCurrencyWithCents(num) {
    if (isNaN(num)) return '$0.00';
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function setupCurrencyInput(id) {
    var input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('blur', function () {
      var val = parseCurrency(input.value);
      if (!isNaN(val) && val > 0) {
        input.value = formatCurrency(val);
      }
    });
  }

  function calcMonthlyMortgage(principal, annualRate, years) {
    if (principal <= 0) return 0;
    var r = annualRate / 100 / 12;
    var n = years * 12;
    if (r === 0) return principal / n;
    return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  // ── Init Currency Inputs ───────────────────────────────

  setupCurrencyInput('arv');
  setupCurrencyInput('rehabCost');
  setupCurrencyInput('monthlyRent');

  // ── Purchase Price Slider ──────────────────────────────

  function initSlider() {
    var slider = document.getElementById('purchasePriceSlider');
    var display = document.getElementById('purchasePriceDisplay');
    var optimalBadge = document.getElementById('optimalBadge');
    var pctDisplay = document.getElementById('purchasePctDisplay');
    if (!slider || !display) return;

    slider.addEventListener('input', function () {
      var val = parseInt(slider.value, 10);
      display.textContent = formatCurrency(val);

      var arv = parseCurrency(document.getElementById('arv').value);
      if (!isNaN(arv) && arv > 0) {
        var pct = (val / arv * 100).toFixed(0);
        if (pctDisplay) pctDisplay.textContent = pct + '% of ARV';
      }

      var optimal = parseInt(slider.min, 10);
      if (optimalBadge) {
        optimalBadge.style.display = (val <= optimal) ? 'inline-block' : 'none';
      }
    });
  }

  function updateSliderRange() {
    var arv = parseCurrency(document.getElementById('arv').value);
    var rehab = parseCurrency(document.getElementById('rehabCost').value);
    if (isNaN(rehab)) rehab = 0;
    if (isNaN(arv) || arv <= 0) return;

    var optimal = Math.round(arv * 0.70 - rehab);
    if (optimal < 0) optimal = 0;

    var slider = document.getElementById('purchasePriceSlider');
    var display = document.getElementById('purchasePriceDisplay');
    var optimalDisplay = document.getElementById('optimalPriceDisplay');
    var pctDisplay = document.getElementById('purchasePctDisplay');
    if (!slider) return;

    // Slider range: optimal price to ARV
    slider.min = optimal;
    slider.max = Math.round(arv);
    slider.step = 1000;
    slider.value = optimal;

    if (display) display.textContent = formatCurrency(optimal);
    if (optimalDisplay) optimalDisplay.textContent = formatCurrency(optimal);
    if (pctDisplay) {
      var pct = (optimal / arv * 100).toFixed(0);
      pctDisplay.textContent = pct + '% of ARV';
    }
  }

  initSlider();

  // ── Exit Strategy Toggle ───────────────────────────────

  function getExitStrategy() {
    var flipBtn = document.getElementById('exitFlip');
    if (flipBtn && flipBtn.classList.contains('exit-active')) return 'flip';
    return 'rent';
  }

  function setupExitToggle() {
    var flipBtn = document.getElementById('exitFlip');
    var rentBtn = document.getElementById('exitRent');
    var rentFields = document.getElementById('rentFields');
    if (!flipBtn || !rentBtn) return;

    flipBtn.addEventListener('click', function () {
      flipBtn.classList.add('exit-active');
      rentBtn.classList.remove('exit-active');
      if (rentFields) rentFields.classList.add('hidden');
    });

    rentBtn.addEventListener('click', function () {
      rentBtn.classList.add('exit-active');
      flipBtn.classList.remove('exit-active');
      if (rentFields) rentFields.classList.remove('hidden');
    });
  }

  setupExitToggle();

  // ── Step Navigation ────────────────────────────────────

  function showStep(step) {
    for (var i = 1; i <= totalSteps; i++) {
      var el = document.getElementById('step-' + i);
      if (el) el.classList.toggle('active', i === step);

      var ind = document.getElementById('ind-' + i);
      if (ind) {
        ind.classList.remove('current', 'completed');
        if (i < step) {
          ind.classList.add('completed');
          ind.innerHTML = '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>';
        } else if (i === step) {
          ind.classList.add('current');
          ind.textContent = i;
        } else {
          ind.textContent = i;
        }
      }

      if (i < totalSteps) {
        var conn = document.getElementById('conn-' + i);
        if (conn) conn.classList.toggle('completed', i < step);
      }
    }
    currentStep = step;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Validation & Progression ───────────────────────────

  window.nextStep = function (step) {
    if (step === 1) {
      var arv = parseCurrency(document.getElementById('arv').value);
      var errArv = document.getElementById('err-arv');
      if (isNaN(arv) || arv <= 0) {
        errArv.classList.remove('hidden');
        return;
      }
      errArv.classList.add('hidden');

      var rehab = parseCurrency(document.getElementById('rehabCost').value);
      var errRehab = document.getElementById('err-rehab');
      if (isNaN(rehab) || rehab < 0) {
        errRehab.classList.remove('hidden');
        return;
      }
      errRehab.classList.add('hidden');

      showStep(2);

    } else if (step === 2) {
      showStep(3);
      updateSliderRange();

    } else if (step === 3) {
      var strategy = getExitStrategy();
      if (strategy === 'rent') {
        var rent = parseCurrency(document.getElementById('monthlyRent').value);
        var errRent = document.getElementById('err-rent');
        if (isNaN(rent) || rent <= 0) {
          errRent.classList.remove('hidden');
          return;
        }
        errRent.classList.add('hidden');
      }
      buildSummary();
      showStep(4);
    }
  };

  window.prevStep = function (step) {
    if (step > 1) {
      showStep(step - 1);
    }
  };

  window.startOver = function () {
    document.getElementById('arv').value = '';
    document.getElementById('rehabCost').value = '';
    document.getElementById('monthlyRent').value = '';

    var flipBtn = document.getElementById('exitFlip');
    var rentBtn = document.getElementById('exitRent');
    var rentFields = document.getElementById('rentFields');
    if (flipBtn) flipBtn.classList.add('exit-active');
    if (rentBtn) rentBtn.classList.remove('exit-active');
    if (rentFields) rentFields.classList.add('hidden');

    showStep(1);
  };

  // ── Summary Builder ────────────────────────────────────

  function buildSummary() {
    var arv = parseCurrency(document.getElementById('arv').value);
    var rehab = parseCurrency(document.getElementById('rehabCost').value);
    if (isNaN(rehab)) rehab = 0;
    var purchasePrice = parseInt(document.getElementById('purchasePriceSlider').value, 10);
    var strategy = getExitStrategy();

    var optimal = Math.round(arv * 0.70 - rehab);
    if (optimal < 0) optimal = 0;

    var flipSummary = document.getElementById('flipSummary');
    var rentSummary = document.getElementById('rentSummary');

    // Show/hide strategy-specific sections
    if (flipSummary) flipSummary.style.display = (strategy === 'flip') ? 'block' : 'none';
    if (rentSummary) rentSummary.style.display = (strategy === 'rent') ? 'block' : 'none';

    // Common property info
    document.getElementById('sumArv').textContent = formatCurrency(arv);
    document.getElementById('sumRehab').textContent = formatCurrency(rehab);
    document.getElementById('sumPurchasePrice').textContent = formatCurrency(purchasePrice);
    document.getElementById('sumOptimal').textContent = formatCurrency(optimal);

    var aboveOptimal = purchasePrice - optimal;
    var aboveEl = document.getElementById('sumAboveOptimal');
    if (aboveEl) {
      if (aboveOptimal > 0) {
        aboveEl.textContent = '+' + formatCurrency(aboveOptimal) + ' above optimal';
        aboveEl.className = 'text-xs text-yellow-300';
      } else {
        aboveEl.textContent = 'At optimal price';
        aboveEl.className = 'text-xs text-green-300';
      }
    }

    var strategyLabel = document.getElementById('sumStrategy');
    if (strategyLabel) strategyLabel.textContent = strategy === 'flip' ? 'Fix & Flip' : 'Buy & Hold (Rent)';

    if (strategy === 'flip') {
      buildFlipSummary(arv, rehab, purchasePrice);
    } else {
      buildRentSummary(arv, rehab, purchasePrice);
    }
  }

  function buildFlipSummary(arv, rehab, purchasePrice) {
    // Estimated costs
    var closingBuy = purchasePrice * 0.03; // ~3% closing costs on purchase
    var closingSell = arv * 0.06; // ~6% selling costs (agent commissions + closing)
    var holdingMonths = 6;
    var holdingCostMonthly = purchasePrice * 0.005; // ~0.5%/mo holding costs (taxes, insurance, utilities)
    var holdingCosts = holdingCostMonthly * holdingMonths;
    var totalCosts = purchasePrice + rehab + closingBuy + closingSell + holdingCosts;
    var profit = arv - totalCosts;
    var totalCashIn = purchasePrice + rehab + closingBuy + holdingCosts; // investor's spend
    var roi = totalCashIn > 0 ? (profit / totalCashIn * 100) : 0;

    document.getElementById('flipSalePrice').textContent = formatCurrency(arv);
    document.getElementById('flipClosingBuy').textContent = '-' + formatCurrency(closingBuy);
    document.getElementById('flipClosingSell').textContent = '-' + formatCurrency(closingSell);
    document.getElementById('flipHolding').textContent = '-' + formatCurrency(holdingCosts);
    document.getElementById('flipTotalCosts').textContent = formatCurrency(totalCosts);

    var profitEl = document.getElementById('flipProfit');
    profitEl.textContent = (profit >= 0 ? '+' : '') + formatCurrency(profit);
    profitEl.className = 'text-2xl font-extrabold ' + (profit >= 0 ? 'text-green-400' : 'text-red-400');

    var roiEl = document.getElementById('flipROI');
    roiEl.textContent = roi.toFixed(1) + '%';
    roiEl.className = 'text-lg font-bold ' + (roi >= 0 ? 'text-green-400' : 'text-red-400');

    // Verdict
    var verdictEl = document.getElementById('flipVerdict');
    if (verdictEl) {
      if (profit > 0 && roi >= 15) {
        verdictEl.innerHTML = '<div class="bg-green-900/40 border border-green-500/30 rounded-lg p-4"><p class="text-green-300 font-bold text-sm">Strong Flip Opportunity</p><p class="text-green-200 text-xs mt-1">This deal shows a healthy projected profit and ROI. Consider moving forward with due diligence.</p></div>';
      } else if (profit > 0) {
        verdictEl.innerHTML = '<div class="bg-yellow-900/40 border border-yellow-500/30 rounded-lg p-4"><p class="text-yellow-300 font-bold text-sm">Marginal Flip</p><p class="text-yellow-200 text-xs mt-1">There\'s profit here, but the margins are tight. Unexpected costs could eat into your returns. Negotiate a lower purchase price if possible.</p></div>';
      } else {
        verdictEl.innerHTML = '<div class="bg-red-900/40 border border-red-500/30 rounded-lg p-4"><p class="text-red-300 font-bold text-sm">Not Profitable as a Flip</p><p class="text-red-200 text-xs mt-1">At this purchase price, the deal doesn\'t pencil as a flip. Consider negotiating a lower price or evaluating a rental exit strategy instead.</p></div>';
      }
    }
  }

  function buildRentSummary(arv, rehab, purchasePrice) {
    var rent = parseCurrency(document.getElementById('monthlyRent').value);

    // Refinance scenario: DSCR loan at 75% of ARV
    var refiLTV = 0.75;
    var refiLoan = Math.round(arv * refiLTV);
    var refiRate = 7.0; // typical DSCR rate
    var refiTerm = 30;
    var monthlyMortgage = calcMonthlyMortgage(refiLoan, refiRate, refiTerm);

    // Estimate annual costs
    var annualTaxes = arv * 0.012; // ~1.2% property taxes
    var annualInsurance = arv * 0.005; // ~0.5% insurance
    var monthlyEscrow = (annualTaxes + annualInsurance) / 12;
    var monthlyPITI = monthlyMortgage + monthlyEscrow;

    // Cash flow
    var cashFlow = rent - monthlyPITI;
    var dscr = monthlyEscrow > 0 ? (rent / monthlyPITI) : 0;

    // Money left in deal after refi
    var totalInvested = purchasePrice + rehab;
    var cashOutRefi = refiLoan; // proceeds from new loan
    var moneyLeftInDeal = totalInvested - cashOutRefi;

    document.getElementById('rentRefiLoan').textContent = formatCurrency(refiLoan);
    document.getElementById('rentRefiLTV').textContent = (refiLTV * 100).toFixed(0) + '%';
    document.getElementById('rentRefiRate').textContent = refiRate.toFixed(1) + '%';
    document.getElementById('rentMonthlyPI').textContent = formatCurrencyWithCents(monthlyMortgage);
    document.getElementById('rentMonthlyEscrow').textContent = formatCurrencyWithCents(monthlyEscrow);
    document.getElementById('rentMonthlyPITI').textContent = formatCurrencyWithCents(monthlyPITI);

    document.getElementById('rentMonthlyRent').textContent = '+' + formatCurrencyWithCents(rent);
    document.getElementById('rentMonthlyExpense').textContent = '-' + formatCurrencyWithCents(monthlyPITI);

    var cfEl = document.getElementById('rentCashFlow');
    cfEl.textContent = (cashFlow >= 0 ? '+' : '') + formatCurrencyWithCents(cashFlow);
    cfEl.className = 'text-2xl font-extrabold ' + (cashFlow >= 0 ? 'text-green-400' : 'text-red-400');

    var dscrEl = document.getElementById('rentDSCR');
    dscrEl.textContent = dscr.toFixed(2) + 'x';
    dscrEl.className = 'text-lg font-bold ' + (dscr >= 1.0 ? 'text-green-400' : 'text-red-400');

    // Money in deal
    document.getElementById('rentTotalInvested').textContent = formatCurrency(totalInvested);
    document.getElementById('rentCashOut').textContent = formatCurrency(cashOutRefi);

    var moneyLeftEl = document.getElementById('rentMoneyLeft');
    moneyLeftEl.textContent = (moneyLeftInDeal <= 0 ? '' : '') + formatCurrency(Math.abs(moneyLeftInDeal));
    if (moneyLeftInDeal <= 0) {
      moneyLeftEl.className = 'text-lg font-extrabold text-green-400';
      moneyLeftEl.textContent = formatCurrency(Math.abs(moneyLeftInDeal)) + ' cash back';
    } else {
      moneyLeftEl.className = 'text-lg font-extrabold text-yellow-300';
      moneyLeftEl.textContent = formatCurrency(moneyLeftInDeal) + ' left in deal';
    }

    // Verdict
    var verdictEl = document.getElementById('rentVerdict');
    if (verdictEl) {
      if (cashFlow >= 200 && dscr >= 1.25 && moneyLeftInDeal <= 0) {
        verdictEl.innerHTML = '<div class="bg-green-900/40 border border-green-500/30 rounded-lg p-4"><p class="text-green-300 font-bold text-sm">Excellent BRRRR Candidate</p><p class="text-green-200 text-xs mt-1">Strong cash flow, healthy DSCR, and you get all your capital back at refinance. This deal checks every box.</p></div>';
      } else if (cashFlow >= 0 && dscr >= 1.0) {
        verdictEl.innerHTML = '<div class="bg-yellow-900/40 border border-yellow-500/30 rounded-lg p-4"><p class="text-yellow-300 font-bold text-sm">Viable Rental with Caveats</p><p class="text-yellow-200 text-xs mt-1">The deal cash flows positive, but margins are thin. ' + (moneyLeftInDeal > 0 ? 'You\'ll have ' + formatCurrency(moneyLeftInDeal) + ' left in the deal after refinance. ' : '') + 'Consider if the returns justify the capital committed.</p></div>';
      } else {
        verdictEl.innerHTML = '<div class="bg-red-900/40 border border-red-500/30 rounded-lg p-4"><p class="text-red-300 font-bold text-sm">Negative Cash Flow</p><p class="text-red-200 text-xs mt-1">At this purchase price and rent level, the property won\'t cash flow after refinancing. Consider negotiating a lower purchase price or confirming rents are accurate.</p></div>';
      }
    }
  }

  // ── Apply With Deal ────────────────────────────────────

  window.applyWithDeal = function () {
    var arv = parseCurrency(document.getElementById('arv').value);
    var rehab = parseCurrency(document.getElementById('rehabCost').value);
    if (isNaN(rehab)) rehab = 0;
    var purchasePrice = parseInt(document.getElementById('purchasePriceSlider').value, 10);
    var strategy = getExitStrategy();

    var params = new URLSearchParams();
    params.set('source', 'exit-strategy-calculator');
    params.set('purchasePrice', Math.round(purchasePrice).toString());
    params.set('rehabBudget', Math.round(rehab).toString());
    params.set('arv', Math.round(arv).toString());

    if (strategy === 'flip') {
      params.set('product', 'Fix-and-Flip');
    } else {
      params.set('product', 'DSCR');
      var rent = parseCurrency(document.getElementById('monthlyRent').value);
      if (!isNaN(rent)) params.set('monthlyRent', Math.round(rent).toString());
    }

    window.location.href = '/LoanApp.html?' + params.toString();
  };

})();
