(function () {
  'use strict';

  var currentStep = 1;
  var totalSteps = 5;
  var selectedStrategy = ''; // 'flip' or 'rent'

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

  setupCurrencyInput('arv');
  setupCurrencyInput('rehabCost');
  setupCurrencyInput('purchasePrice');
  setupCurrencyInput('monthlyRent');

  // ── Mortgage Calculation ─────────────────────────────────

  function calcMonthlyMortgage(principal, annualRate, years) {
    if (principal <= 0) return 0;
    var r = annualRate / 100 / 12;
    var n = years * 12;
    if (r === 0) return principal / n;
    return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  // ── Step Navigation ──────────────────────────────────────

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

  // ── Exit Strategy Selection ────────────────────────────────

  window.selectStrategy = function (strategy) {
    selectedStrategy = strategy;
    var btnFlip = document.getElementById('btn-flip');
    var btnRent = document.getElementById('btn-rent');
    var rentFields = document.getElementById('rent-fields');
    var errStrategy = document.getElementById('err-strategy');

    btnFlip.classList.toggle('selected', strategy === 'flip');
    btnRent.classList.toggle('selected', strategy === 'rent');
    errStrategy.classList.add('hidden');

    if (strategy === 'rent') {
      rentFields.classList.remove('hidden');
    } else {
      rentFields.classList.add('hidden');
    }
  };

  // ── Validation & Progression ─────────────────────────────

  window.nextStep = function (step) {
    if (step === 1) {
      var arv = parseCurrency(document.getElementById('arv').value);
      var errArv = document.getElementById('err-arv');
      if (isNaN(arv) || arv <= 0) {
        errArv.classList.remove('hidden');
        return;
      }
      errArv.classList.add('hidden');
      updateOfferDisplay();
      showStep(2);

    } else if (step === 2) {
      var rehab = parseCurrency(document.getElementById('rehabCost').value);
      var errRehab = document.getElementById('err-rehab');
      if (isNaN(rehab) || rehab < 0) {
        errRehab.classList.remove('hidden');
        return;
      }
      errRehab.classList.add('hidden');
      updateOfferDisplay();
      showStep(3);

    } else if (step === 3) {
      showStep(4);

    } else if (step === 4) {
      // Validate strategy selected
      var errStrategy = document.getElementById('err-strategy');
      if (!selectedStrategy) {
        errStrategy.classList.remove('hidden');
        return;
      }
      errStrategy.classList.add('hidden');

      // If rent strategy, validate rent input
      if (selectedStrategy === 'rent') {
        var rent = parseCurrency(document.getElementById('monthlyRent').value);
        var errRent = document.getElementById('err-rent');
        if (isNaN(rent) || rent <= 0) {
          errRent.classList.remove('hidden');
          return;
        }
        errRent.classList.add('hidden');
      }

      buildSummary();
      showStep(5);
    }
  };

  window.prevStep = function (step) {
    if (step > 1) {
      if (step === 3) updateOfferDisplay();
      showStep(step - 1);
    }
  };

  window.startOver = function () {
    document.getElementById('propStreet').value = '';
    document.getElementById('propCity').value = '';
    document.getElementById('propState').value = '';
    document.getElementById('propZip').value = '';
    document.getElementById('arv').value = '';
    document.getElementById('rehabCost').value = '';
    document.getElementById('purchasePrice').value = '';
    document.getElementById('monthlyRent').value = '';
    selectedStrategy = '';
    document.getElementById('btn-flip').classList.remove('selected');
    document.getElementById('btn-rent').classList.remove('selected');
    document.getElementById('rent-fields').classList.add('hidden');
    showStep(1);
  };

  window.applyWithDeal = function () {
    var arv = parseCurrency(document.getElementById('arv').value);
    var rehab = parseCurrency(document.getElementById('rehabCost').value);
    if (isNaN(rehab)) rehab = 0;
    var purchasePrice = getPurchasePrice();

    var params = new URLSearchParams();
    params.set('source', 'deal-evaluator');
    params.set('propStreet', document.getElementById('propStreet').value.trim());
    params.set('propCity', document.getElementById('propCity').value.trim());
    params.set('propState', document.getElementById('propState').value.trim());
    params.set('propZip', document.getElementById('propZip').value.trim());
    params.set('purchasePrice', Math.round(purchasePrice).toString());
    params.set('rehabBudget', Math.round(rehab).toString());
    params.set('arv', Math.round(arv).toString());
    params.set('loanType', 'Purchase');

    if (selectedStrategy === 'flip') {
      params.set('product', 'Fix-and-Flip');
    } else {
      params.set('product', 'DSCR');
      var rentVal = document.getElementById('monthlyRent').value.replace(/[^0-9.]/g, '');
      if (rentVal) params.set('monthlyRent', rentVal);
    }

    window.location.href = '/LoanApp.html?' + params.toString();
  };

  // ── Display Updates ──────────────────────────────────────

  function getMaxOffer() {
    var arv = parseCurrency(document.getElementById('arv').value);
    var rehab = parseCurrency(document.getElementById('rehabCost').value);
    if (isNaN(rehab)) rehab = 0;
    return arv * 0.70 - rehab;
  }

  function getPurchasePrice() {
    var custom = parseCurrency(document.getElementById('purchasePrice').value);
    if (!isNaN(custom) && custom > 0) return custom;
    return getMaxOffer();
  }

  function updateOfferDisplay() {
    var arv = parseCurrency(document.getElementById('arv').value);
    var rehab = parseCurrency(document.getElementById('rehabCost').value);
    if (isNaN(rehab)) rehab = 0;

    var arv70 = arv * 0.70;
    var maxOffer = arv70 - rehab;

    document.getElementById('maxOfferDisplay').textContent = formatCurrency(maxOffer);
    document.getElementById('offerBreakdown').textContent =
      formatCurrency(arv) + ' x 70% = ' + formatCurrency(arv70) + ' - ' + formatCurrency(rehab) + ' rehab';

    // Pre-fill purchase price with the 70% rule value if empty
    var ppInput = document.getElementById('purchasePrice');
    if (!ppInput.value || ppInput.dataset.autoFilled === 'true') {
      ppInput.value = formatCurrency(maxOffer);
      ppInput.dataset.autoFilled = 'true';
    }
    ppInput.addEventListener('input', function () {
      ppInput.dataset.autoFilled = 'false';
    }, { once: true });
  }

  // ── Summary Builder ──────────────────────────────────────

  function buildSummary() {
    var arv = parseCurrency(document.getElementById('arv').value);
    var rehab = parseCurrency(document.getElementById('rehabCost').value);
    if (isNaN(rehab)) rehab = 0;
    var purchasePrice = getPurchasePrice();

    var arv70 = arv * 0.70;
    var maxOffer = arv70 - rehab;

    // Property section
    document.getElementById('sumArv').textContent = formatCurrency(arv);
    document.getElementById('sumRehab').textContent = formatCurrency(rehab);
    document.getElementById('sumPurchase').textContent = formatCurrency(purchasePrice);

    // 70% Rule section (suggestion only)
    document.getElementById('sumArv70').textContent = formatCurrency(arv70);
    document.getElementById('sumMinusRehab').textContent = '- ' + formatCurrency(rehab);
    document.getElementById('sumMaxOffer').textContent = formatCurrency(maxOffer);

    // Price comparison
    var diff = purchasePrice - maxOffer;
    var compareEl = document.getElementById('sumPriceCompare');
    if (Math.abs(diff) < 1) {
      compareEl.textContent = 'At suggestion';
      compareEl.className = 'text-sm font-bold text-yellow-300';
    } else if (diff > 0) {
      compareEl.textContent = formatCurrency(diff) + ' above';
      compareEl.className = 'text-sm font-bold text-red-300';
    } else {
      compareEl.textContent = formatCurrency(Math.abs(diff)) + ' below';
      compareEl.className = 'text-sm font-bold text-green-300';
    }

    // Show/hide strategy-specific sections
    var flipSection = document.getElementById('flip-summary');
    var rentSection = document.getElementById('rent-summary');

    if (selectedStrategy === 'flip') {
      flipSection.classList.remove('hidden');
      rentSection.classList.add('hidden');
      document.getElementById('sumSubtitle').textContent = "Here's your flip analysis based on your purchase price.";
      buildFlipSummary(arv, rehab, purchasePrice);
    } else {
      flipSection.classList.add('hidden');
      rentSection.classList.remove('hidden');
      document.getElementById('sumSubtitle').textContent = "Here's your rental / BRRRR analysis based on your purchase price.";
      buildRentSummary(arv, rehab, purchasePrice);
    }
  }

  function buildFlipSummary(arv, rehab, purchasePrice) {
    var closingBuy = purchasePrice * 0.03;
    var closingSell = arv * 0.06;
    var holdingCosts = purchasePrice * 0.005 * 6; // ~0.5% of purchase per month, 6 months
    var totalCosts = purchasePrice + rehab + closingBuy + closingSell + holdingCosts;
    var profit = arv - totalCosts;
    var totalCashIn = purchasePrice + rehab + closingBuy + holdingCosts;
    var roi = totalCashIn > 0 ? (profit / totalCashIn) * 100 : 0;

    document.getElementById('sumFlipSale').textContent = '+' + formatCurrency(arv);
    document.getElementById('sumFlipPurchase').textContent = '-' + formatCurrency(purchasePrice);
    document.getElementById('sumFlipRehab').textContent = '-' + formatCurrency(rehab);
    document.getElementById('sumFlipCloseBuy').textContent = '-' + formatCurrency(closingBuy);
    document.getElementById('sumFlipCloseSell').textContent = '-' + formatCurrency(closingSell);
    document.getElementById('sumFlipHolding').textContent = '-' + formatCurrency(holdingCosts);

    var profitEl = document.getElementById('sumFlipProfit');
    profitEl.textContent = (profit >= 0 ? '+' : '') + formatCurrency(profit);
    profitEl.className = 'text-xl font-extrabold ' + (profit >= 0 ? 'text-green-400' : 'text-red-400');

    var roiEl = document.getElementById('sumFlipROI');
    roiEl.textContent = roi.toFixed(1) + '%';
    roiEl.className = 'text-sm font-bold ' + (roi >= 0 ? 'text-green-300' : 'text-red-300');
  }

  function buildRentSummary(arv, rehab, purchasePrice) {
    var rent = parseCurrency(document.getElementById('monthlyRent').value);

    // Refinance analysis
    var totalInvested = purchasePrice + rehab;
    var refiAmount = arv * 0.75;
    var capitalPosition = refiAmount - totalInvested;

    document.getElementById('sumRefiInvested').textContent = formatCurrency(totalInvested);
    document.getElementById('sumRefiAmount').textContent = formatCurrency(refiAmount);

    var posEl = document.getElementById('sumRefiPosition');
    var labelEl = document.getElementById('sumRefiLabel');
    var detailEl = document.getElementById('sumRefiDetail');

    if (capitalPosition >= 0) {
      posEl.textContent = '+' + formatCurrency(capitalPosition);
      posEl.className = 'text-lg font-extrabold text-green-400';
      labelEl.textContent = 'You get money back at refinance';
      detailEl.textContent = formatCurrency(capitalPosition) + ' cash back';
      detailEl.className = 'text-sm font-bold text-green-300';
    } else {
      posEl.textContent = '-' + formatCurrency(Math.abs(capitalPosition));
      posEl.className = 'text-lg font-extrabold text-red-400';
      labelEl.textContent = 'Money left in the deal after refinance';
      detailEl.textContent = formatCurrency(Math.abs(capitalPosition)) + ' still in deal';
      detailEl.className = 'text-sm font-bold text-red-300';
    }

    // Monthly cash flow based on refinance loan
    var refiRate = 7.0;
    var refiTerm = 30;
    var monthlyMortgage = calcMonthlyMortgage(refiAmount, refiRate, refiTerm);
    var cashFlow = rent - monthlyMortgage;

    document.getElementById('sumRefiLoan').textContent = formatCurrency(refiAmount);
    document.getElementById('sumRefiTerms').textContent = refiRate.toFixed(1) + '% / ' + refiTerm + ' Years';
    document.getElementById('sumRefiMortgage').textContent = formatCurrencyWithCents(monthlyMortgage);

    document.getElementById('sumRent').textContent = '+' + formatCurrencyWithCents(rent);
    document.getElementById('sumMortgage2').textContent = '-' + formatCurrencyWithCents(monthlyMortgage);

    var cfEl = document.getElementById('sumCashFlow');
    cfEl.textContent = (cashFlow >= 0 ? '+' : '') + formatCurrencyWithCents(cashFlow);
    cfEl.className = 'text-xl font-extrabold ' + (cashFlow >= 0 ? 'text-green-400' : 'text-red-400');
  }

})();
