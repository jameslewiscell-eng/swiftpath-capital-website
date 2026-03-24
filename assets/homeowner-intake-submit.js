(function () {
  'use strict';

  var HUBSPOT_PORTAL_ID = '243569048';
  var HUBSPOT_FORM_GUID = '6648e233-6873-4546-a9cf-b20d66ff4e8e';
  var HS_PROXY_URL = '/.netlify/functions/hs-submit';
  var SAVE_APP_URL = '/.netlify/functions/save-application';
  var THANK_YOU_URL = '/thank-you.html';

  function byId(id){ return document.getElementById(id); }
  function value(id){ return (byId(id)?.value || '').trim(); }

  function getCookie(name){
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function showFieldError(fieldId, message){
    var field = byId(fieldId);
    if (!field) return;
    field.classList.add('ring-2', 'ring-red-400');
    field.setAttribute('aria-invalid', 'true');
    var errorId = fieldId + '-error';
    var errorEl = byId(errorId);
    if (!errorEl) {
      errorEl = document.createElement('p');
      errorEl.id = errorId;
      errorEl.className = 'text-red-600 text-xs mt-1';
      errorEl.setAttribute('role', 'alert');
      field.parentNode.appendChild(errorEl);
    }
    errorEl.textContent = message;
  }

  function clearFieldError(fieldId){
    var field = byId(fieldId);
    if (!field) return;
    field.classList.remove('ring-2', 'ring-red-400');
    field.removeAttribute('aria-invalid');
    var errorEl = byId(fieldId + '-error');
    if (errorEl) errorEl.textContent = '';
  }

  function showStatus(message, type){
    var status = byId('submitStatus');
    if (!status) return;
    if (type === 'error') {
      status.className = 'mb-6 rounded-md border border-red-300 bg-red-50 text-red-800 p-4';
    } else {
      status.className = 'mb-6 rounded-md border border-green-300 bg-green-50 text-green-800 p-4';
    }
    status.textContent = message;
    status.classList.remove('hidden');
  }

  function setSubmitting(isSubmitting){
    var btn = byId('submitBtn');
    if (!btn) return;
    if (isSubmitting) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent = 'Submitting...';
      btn.disabled = true;
      btn.classList.add('opacity-60', 'cursor-not-allowed');
    } else {
      btn.textContent = btn.dataset.originalText || 'Submit Intake';
      btn.disabled = false;
      btn.classList.remove('opacity-60', 'cursor-not-allowed');
    }
  }

  function captureAttribution(){
    var p = new URLSearchParams(location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'].forEach(function(k){
      var el = byId(k);
      if (el) el.value = p.get(k) || '';
    });
  }

  function parseNameParts(fullName){
    var parts = (fullName || '').split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' ')
    };
  }

  function buildDebtRows(){
    var rows = [];
    for (var i = 1; i <= 5; i++) {
      var row = {
        loan_type: value('debtLoanType' + i),
        current_balance: value('debtBalance' + i),
        interest_rate: value('debtRate' + i),
        monthly_payment: value('debtPayment' + i)
      };
      if (row.loan_type || row.current_balance || row.interest_rate || row.monthly_payment) {
        rows.push(row);
      }
    }
    return rows;
  }

  function validateForm(){
    var ok = true;

    ['client1Name', 'client1Email', 'client1Phone', 'propertyStreet', 'propertyCity', 'propertyState'].forEach(function(fieldId){
      if (!value(fieldId)) {
        showFieldError(fieldId, 'This field is required.');
        ok = false;
      } else {
        clearFieldError(fieldId);
      }
    });

    if (!byId('consentCheckbox')?.checked) {
      showFieldError('consentCheckbox', 'Please provide consent to submit.');
      ok = false;
    } else {
      clearFieldError('consentCheckbox');
    }

    if (typeof window.__hasSignature === 'function' && !window.__hasSignature()) {
      showFieldError('clearSignatureBtn', 'Please provide your signature.');
      ok = false;
    } else {
      clearFieldError('clearSignatureBtn');
    }

    return ok;
  }

  function buildHubspotFields(){
    var client1Name = value('client1Name');
    var name = parseNameParts(client1Name);
    var propertyAddress = [value('propertyStreet'), value('propertyCity'), value('propertyState'), value('propertyZip')].filter(Boolean).join(', ');

    var notes = [
      'Agent: ' + value('agentName') + ' | ' + value('agentEmail') + ' | ' + value('agentPhone'),
      'Client 1 DOB: ' + value('client1Dob'),
      'Client 2: ' + [value('client2Name'), value('client2Dob'), value('client2Email'), value('client2Phone')].filter(Boolean).join(' | '),
      'Property Class: ' + value('propertyClass'),
      'Fair Market Value: ' + value('fairMarketValue'),
      'Current Balance: ' + value('currentBalance'),
      'Current APR: ' + value('currentApr'),
      'Years Remaining: ' + value('yearsRemaining'),
      'Mortgage Payment: ' + value('mortgagePayment'),
      'Income: ' + value('monthlyIncome'),
      'Expenses: ' + value('monthlyExpenses'),
      'Liquid Savings: ' + value('liquidSavings'),
      'Credit Score: ' + value('creditScore')
    ].join('\n');

    return [
      { name: 'full_name', value: client1Name },
      { name: 'firstname', value: name.firstName },
      { name: 'lastname', value: name.lastName },
      { name: 'email', value: value('client1Email') },
      { name: 'phone', value: value('client1Phone') },
      { name: 'property_address', value: propertyAddress },
      { name: 'loan_purpose', value: 'Homeowner Occupied Intake' },
      { name: 'loan_details_notes', value: notes },
      { name: 'utm_source', value: value('utm_source') },
      { name: 'utm_medium', value: value('utm_medium') },
      { name: 'utm_campaign', value: value('utm_campaign') },
      { name: 'utm_term', value: value('utm_term') },
      { name: 'utm_content', value: value('utm_content') },
      { name: 'gclid', value: value('gclid') }
    ].filter(function(field){ return field.value; });
  }

  function buildExtraFields(){
    return {
      intake_type: 'homeowner_occupied',
      source_page: location.href,
      agent_name: value('agentName'),
      agent_email: value('agentEmail'),
      agent_phone: value('agentPhone'),
      first_name: parseNameParts(value('client1Name')).firstName,
      last_name: parseNameParts(value('client1Name')).lastName,
      client_1_name: value('client1Name'),
      email: value('client1Email'),
      phone: value('client1Phone'),
      client_1_dob: value('client1Dob'),
      client_2_name: value('client2Name'),
      client_2_dob: value('client2Dob'),
      client_2_email: value('client2Email'),
      client_2_phone: value('client2Phone'),
      property_street: value('propertyStreet'),
      property_city: value('propertyCity'),
      property_state: value('propertyState'),
      property_zip: value('propertyZip'),
      fair_market_value: value('fairMarketValue'),
      current_balance: value('currentBalance'),
      current_apr: value('currentApr'),
      years_remaining_mortgage: value('yearsRemaining'),
      mortgage_payment: value('mortgagePayment'),
      property_classification: value('propertyClass'),
      monthly_income: value('monthlyIncome'),
      monthly_expenses: value('monthlyExpenses'),
      liquid_savings: value('liquidSavings'),
      credit_score: value('creditScore'),
      additional_debts_loans: buildDebtRows(),
      consent: !!byId('consentCheckbox')?.checked,
      signature_data: typeof window.__getSignatureDataURL === 'function' ? window.__getSignatureDataURL() : null,
      utm_source: value('utm_source'),
      utm_medium: value('utm_medium'),
      utm_campaign: value('utm_campaign'),
      utm_term: value('utm_term'),
      utm_content: value('utm_content'),
      gclid: value('gclid')
    };
  }

  async function submitToHubspot(fields){
    var hutk = getCookie('hubspotutk');
    var context = {
      pageUri: location.href,
      pageName: document.title
    };
    if (hutk) context.hutk = hutk;

    var res = await fetch(HS_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portalId: HUBSPOT_PORTAL_ID,
        formGuid: HUBSPOT_FORM_GUID,
        fields: fields,
        context: context
      })
    });

    if (!res.ok) {
      var errText = await res.text();
      throw new Error('HubSpot submission failed: ' + res.status + ' ' + errText.slice(0, 200));
    }
  }

  async function saveApplication(extraFields){
    var res = await fetch(SAVE_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(extraFields)
    });

    if (!res.ok) {
      var errText = await res.text();
      throw new Error('Save application failed: ' + res.status + ' ' + errText.slice(0, 200));
    }
  }

  async function onSubmit(e){
    e.preventDefault();

    var honeypot = byId('homeownerWebsite');
    if (honeypot && honeypot.value) {
      location.href = THANK_YOU_URL;
      return;
    }

    if (!validateForm()) {
      showStatus('Please complete the required fields and signature.', 'error');
      return;
    }

    setSubmitting(true);
    showStatus('Submitting your intake form...', 'success');

    try {
      var hubspotFields = buildHubspotFields();
      var extraFields = buildExtraFields();

      await Promise.all([
        submitToHubspot(hubspotFields),
        saveApplication(extraFields)
      ]);

      location.href = THANK_YOU_URL;
    } catch (err) {
      console.error(err);
      showStatus('We could not submit your form right now. Please try again or contact support.', 'error');
      setSubmitting(false);
    }
  }

  function init(){
    captureAttribution();
    var form = byId('homeownerIntakeForm');
    if (!form) return;
    form.addEventListener('submit', onSubmit);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
