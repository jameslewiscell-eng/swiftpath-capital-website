(function () {
  'use strict';

  var currentStep = 1;
  var totalSteps = 5;

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

  // Auto-format currency inputs as the user types
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

      // Pre-populate step 3 calculations
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
      updateMortgagePreview();
      showStep(4);

    } else if (step === 4) {
      var rent = parseCurrency(document.getElementById('monthlyRent').value);
      var errRent = document.getElementById('err-rent');
      if (isNaN(rent) || rent <= 0) {
        errRent.classList.remove('hidden');
        return;
      }
      errRent.classList.add('hidden');

      buildSummary();
      showStep(5);
    }
  };

  window.prevStep = function (step) {
    if (step > 1) {
      if (step === 3) updateOfferDisplay();
      if (step === 4) updateMortgagePreview();
      showStep(step - 1);
    }
  };

  window.startOver = function () {
    document.getElementById('arv').value = '';
    document.getElementById('rehabCost').value = '';
    document.getElementById('interestRate').value = '7.0';
    document.getElementById('loanTerm').value = '30';
    document.getElementById('monthlyRent').value = '';
    showStep(1);
  };

  // ── Display Updates ──────────────────────────────────────

  function updateOfferDisplay() {
    var arv = parseCurrency(document.getElementById('arv').value);
    var rehab = parseCurrency(document.getElementById('rehabCost').value);
    if (isNaN(rehab)) rehab = 0;

    var arv70 = arv * 0.70;
    var maxOffer = arv70 - rehab;

    document.getElementById('maxOfferDisplay').textContent = formatCurrency(maxOffer);
    document.getElementById('offerBreakdown').textContent =
      formatCurrency(arv) + ' x 70% = ' + formatCurrency(arv70) + ' - ' + formatCurrency(rehab) + ' rehab';
  }

  function updateMortgagePreview() {
    var arv = parseCurrency(document.getElementById('arv').value);
    var rehab = parseCurrency(document.getElementById('rehabCost').value);
    if (isNaN(rehab)) rehab = 0;

    var maxOffer = arv * 0.70 - rehab;
    var rate = parseFloat(document.getElementById('interestRate').value);
    var term = parseInt(document.getElementById('loanTerm').value, 10);

    if (isNaN(rate) || rate <= 0) rate = 7.0;

    var monthly = calcMonthlyMortgage(maxOffer, rate, term);

    document.getElementById('mortgagePreview').textContent = formatCurrencyWithCents(monthly);
    document.getElementById('mortgageBreakdownPreview').textContent =
      formatCurrency(maxOffer) + ' loan at ' + rate.toFixed(1) + '% for ' + term + ' years';
  }

  // ── Summary Builder ──────────────────────────────────────

  function buildSummary() {
    var arv = parseCurrency(document.getElementById('arv').value);
    var rehab = parseCurrency(document.getElementById('rehabCost').value);
    if (isNaN(rehab)) rehab = 0;
    var rate = parseFloat(document.getElementById('interestRate').value);
    var term = parseInt(document.getElementById('loanTerm').value, 10);
    var rent = parseCurrency(document.getElementById('monthlyRent').value);

    if (isNaN(rate) || rate <= 0) rate = 7.0;

    var arv70 = arv * 0.70;
    var maxOffer = arv70 - rehab;
    var monthly = calcMonthlyMortgage(maxOffer, rate, term);
    var cashFlow = rent - monthly;

    // Property
    document.getElementById('sumArv').textContent = formatCurrency(arv);
    document.getElementById('sumRehab').textContent = formatCurrency(rehab);

    // 70% Rule
    document.getElementById('sumArv70').textContent = formatCurrency(arv70);
    document.getElementById('sumMinusRehab').textContent = '- ' + formatCurrency(rehab);
    document.getElementById('sumMaxOffer').textContent = formatCurrency(maxOffer);

    // Financing
    document.getElementById('sumLoanAmt').textContent = formatCurrency(maxOffer);
    document.getElementById('sumRate').textContent = rate.toFixed(1) + '%';
    document.getElementById('sumTerm').textContent = term + ' Years';
    document.getElementById('sumMortgage').textContent = formatCurrencyWithCents(monthly);

    // Cash Flow
    document.getElementById('sumRent').textContent = '+' + formatCurrencyWithCents(rent);
    document.getElementById('sumMortgage2').textContent = '-' + formatCurrencyWithCents(monthly);

    var cfEl = document.getElementById('sumCashFlow');
    cfEl.textContent = (cashFlow >= 0 ? '+' : '') + formatCurrencyWithCents(cashFlow);
    cfEl.className = 'text-xl font-extrabold ' + (cashFlow >= 0 ? 'text-green-400' : 'text-red-400');
  }

})();
