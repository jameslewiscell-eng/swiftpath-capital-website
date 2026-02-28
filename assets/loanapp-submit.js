// assets/loanapp-submit.js
// Full loan application form handler with inline validation and error messages.
// HubSpot receives ONLY the original mapped fields (unchanged).
// Extra fields (credit score, DOB, signature, etc.) are saved separately via
// the save-application Netlify function → Dropbox.
(function(){
  'use strict';

  var HUBSPOT_PORTAL_ID = "243569048";
  var HUBSPOT_LOAN_GUID = "6648e233-6873-4546-a9cf-b20d66ff4e8e";
  var THANK_YOU_URL = "/thank-you.html";

  function byId(id){ return document.getElementById(id); }
  function val(id){ return (byId(id)?.value || '').trim(); }
  function onlyDigits(s){ return (s||'').replace(/\D+/g,''); }
  function normalizeCurrency(s){
    var clean = (s||'').replace(/[^0-9.]/g,'');
    var parts = clean.split('.');
    return parts.length > 2 ? (parts[0] + '.' + parts.slice(1).join('')) : clean;
  }
  function normalizePhoneE164(s){
    var d = onlyDigits(s);
    if(!d) return '';
    if(d.length===10) return '+1'+d;
    if(d.length>10 && d[0] !== '0') return '+'+d;
    return d;
  }
  function getCookie(name){
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function isValidEmail(email){
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }
  function checked(id){ var el = byId(id); return el ? el.checked : false; }

  // ---- INLINE ERROR DISPLAY ----
  function showFieldError(fieldId, msg){
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
      field.setAttribute('aria-describedby', errorId);
      field.parentNode.appendChild(errorEl);
    }
    errorEl.textContent = msg;
  }

  function clearFieldError(fieldId){
    var field = byId(fieldId);
    if (!field) return;
    field.classList.remove('ring-2', 'ring-red-400');
    field.removeAttribute('aria-invalid');
    var errorEl = byId(fieldId + '-error');
    if (errorEl) errorEl.textContent = '';
  }

  function showFormStatus(msg, type){
    var banner = byId('submitStatus');
    if (!banner) return;
    banner.classList.remove('hidden', 'border-red-300', 'bg-red-50', 'text-red-800', 'border-green-300', 'bg-green-50', 'text-green-800');
    if (type === 'error') {
      banner.className = 'mb-6 rounded-md border border-red-300 bg-red-50 text-red-800 p-4';
    } else {
      banner.className = 'mb-6 rounded-md border border-green-300 bg-green-50 text-green-800 p-4';
    }
    banner.textContent = msg;
    banner.removeAttribute('hidden');
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideFormStatus(){
    var banner = byId('submitStatus');
    if (banner) banner.classList.add('hidden');
  }

  // Build the full_name from separate fields for HubSpot compatibility
  function buildFullName(){
    var parts = [val('firstName'), val('middleInitial'), val('lastName'), val('suffix')];
    return parts.filter(Boolean).join(' ');
  }

  // Build concatenated address string for HubSpot compatibility
  function buildAddress(streetId, cityId, stateId, zipId){
    var parts = [val(streetId), val(cityId), val(stateId), val(zipId)];
    return parts.filter(Boolean).join(', ');
  }

  function captureAttribution(){
    var p = new URLSearchParams(location.search);
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid'].forEach(function(k){
      var el = byId(k); if(el) el.value = p.get(k) || '';
    });
  }

  // ---- VALIDATION ----
  function validateForm(){
    var valid = true;
    hideFormStatus();

    // Honeypot
    var honeypot = byId('loanWebsite');
    if (honeypot && honeypot.value) return 'bot';

    // Investment confirmation
    if (!checked('investmentConfirm')) {
      showFieldError('investmentConfirm', 'Please confirm this is a real estate investment loan.');
      valid = false;
    } else { clearFieldError('investmentConfirm'); }

    // First name
    if (!val('firstName')) {
      showFieldError('firstName', 'First name is required.');
      valid = false;
    } else { clearFieldError('firstName'); }

    // Last name
    if (!val('lastName')) {
      showFieldError('lastName', 'Last name is required.');
      valid = false;
    } else { clearFieldError('lastName'); }

    // Email
    var email = val('email');
    if (!email) {
      showFieldError('email', 'Email is required.');
      valid = false;
    } else if (!isValidEmail(email)) {
      showFieldError('email', 'Please enter a valid email address.');
      valid = false;
    } else { clearFieldError('email'); }

    // Phone
    if (!val('phone')) {
      showFieldError('phone', 'Phone number is required.');
      valid = false;
    } else { clearFieldError('phone'); }

    // Loan type
    if (!val('loanType')) {
      showFieldError('loanType', 'Please select a loan type.');
      valid = false;
    } else { clearFieldError('loanType'); }

    // Property address
    if (!val('propStreet')) {
      showFieldError('propStreet', 'Property street address is required.');
      valid = false;
    } else { clearFieldError('propStreet'); }

    if (!val('propCity')) {
      showFieldError('propCity', 'Property city is required.');
      valid = false;
    } else { clearFieldError('propCity'); }

    if (!val('propState')) {
      showFieldError('propState', 'Property state is required.');
      valid = false;
    } else { clearFieldError('propState'); }

    if (!val('propZip')) {
      showFieldError('propZip', 'Property ZIP code is required.');
      valid = false;
    } else { clearFieldError('propZip'); }

    // Purchase price
    if (!val('purchasePrice')) {
      showFieldError('purchasePrice', 'Purchase price is required.');
      valid = false;
    } else { clearFieldError('purchasePrice'); }

    // Signature
    if (typeof window.__hasSignature === 'function' && !window.__hasSignature()) {
      showFieldError('clearSignatureBtn', 'Please provide your signature above.');
      valid = false;
    } else { clearFieldError('clearSignatureBtn'); }

    // Consent
    if (!checked('consentCheckbox')) {
      showFieldError('consentCheckbox', 'You must agree to the Terms, Privacy Policy, and E-Sign Consent.');
      valid = false;
    } else { clearFieldError('consentCheckbox'); }

    return valid;
  }

  // ---- INLINE VALIDATION ON BLUR ----
  function attachInlineValidation(){
    var blurChecks = [
      { id:'firstName', check: function(v){ return v ? null : 'First name is required.'; } },
      { id:'lastName',  check: function(v){ return v ? null : 'Last name is required.'; } },
      { id:'email',     check: function(v){
          if(!v) return null; // only validate if something typed
          return isValidEmail(v) ? null : 'Please enter a valid email address.';
        }
      }
    ];

    blurChecks.forEach(function(item){
      var el = byId(item.id);
      if(!el) return;
      el.addEventListener('blur', function(){
        var msg = item.check(el.value.trim());
        if(msg) showFieldError(item.id, msg);
        else clearFieldError(item.id);
      });
    });
  }

  // ---- BUILD HUBSPOT FIELDS (unchanged from original mapping) ----
  function buildHubSpotFields(){
    var fullName = buildFullName();
    var firstName = val('firstName');
    var lastName = [val('middleInitial'), val('lastName'), val('suffix')].filter(Boolean).join(' ') || val('lastName');
    var mailingAddress = buildAddress('residenceStreet', 'residenceCity', 'residenceState', 'residenceZip');
    var propertyAddress = buildAddress('propStreet', 'propCity', 'propState', 'propZip');

    var fields = [
      { name:'full_name', value: fullName },
      { name:'firstname', value: firstName },
      { name:'lastname',  value: lastName },
      { name:'email', value: val('email') },
      { name:'phone', value: val('phone') },
      { name:'mailing_address', value: mailingAddress },
      { name:'business_name', value: val('businessName') },
      { name:'business_type', value: val('businessType') },
      { name:'number_of_completed_deals', value: val('numDeals') },
      { name:'entity_ein', value: val('ein') },
      { name:'property_address', value: propertyAddress },
      { name:'purchase_price', value: val('purchasePrice') },
      { name:'rehab_budget', value: val('rehabBudget') },
      { name:'after_repair_value_arv', value: val('arv') },
      { name:'wholesaler_involved', value: val('wholesaler') },
      { name:'loan_purpose', value: val('loanPurpose') },
      // requested_loan_amount REMOVED per client request
      { name:'timeline_to_close', value: val('desiredCloseDate') },
      { name:'exit_strategy', value: val('exitStrategy') },
      { name:'loan_details_notes', value: val('loanDetails') },
      { name:'file_upload_link_purchase_contract', value: '' },
      { name:'file_upload_link_rehab_budget', value: '' },
      { name:'file_upload_link_comps_appraisal', value: '' },
      { name:'utm_source', value: val('utm_source') },
      { name:'utm_medium', value: val('utm_medium') },
      { name:'utm_campaign', value: val('utm_campaign') },
      { name:'utm_term', value: val('utm_term') },
      { name:'utm_content', value: val('utm_content') },
      { name:'gclid', value: val('gclid') }
    ];

    // Filter out empty values
    return fields.filter(function(f){ return f.value != null && f.value !== ''; })
                 .map(function(f){ return {name:f.name, value:''+f.value}; });
  }

  // ---- BUILD EXTRA FIELDS (NOT sent to HubSpot) ----
  function buildExtraFields(){
    var sigData = null;
    if(typeof window.__getSignatureDataURL === 'function'){
      sigData = window.__getSignatureDataURL();
    }
    return {
      // Borrower details
      first_name: val('firstName'),
      middle_initial: val('middleInitial'),
      last_name: val('lastName'),
      suffix: val('suffix'),
      date_of_birth: val('dob'),
      residence_street: val('residenceStreet'),
      residence_city: val('residenceCity'),
      residence_state: val('residenceState'),
      residence_zip: val('residenceZip'),
      borrower_type: val('borrowerType'),
      marital_status: val('maritalStatus'),
      sms_consent: checked('smsConsent'),
      // Business
      company_state_registration: val('companyStateReg'),
      company_address_same_as_primary: checked('companyAddrSame'),
      // Partner
      partner_name: val('partnerName'),
      partner_email: val('partnerEmail'),
      partner_phone: val('partnerPhone'),
      partner_dob: val('partnerDob'),
      partner_address: val('partnerAddress'),
      // Property & loan extras
      loan_type: val('loanType'),
      desired_closing_date: val('desiredCloseDate'),
      property_street: val('propStreet'),
      property_city: val('propCity'),
      property_state: val('propState'),
      property_zip: val('propZip'),
      requesting_repair_funds: val('requestingRepairFunds'),
      scope_of_work: val('scopeOfWork'),
      // Financial & experience
      available_cash: val('availableCash'),
      credit_score: val('creditScore'),
      bankruptcy: val('bankruptcy'),
      own_property_free_clear: val('ownPropertyFreeClear'),
      investor_experience: val('investorExperience'),
      past_investments: val('pastInvestments'),
      how_heard: val('howHeard'),
      // Signature
      signature_data: sigData,
      // Meta
      submitted_at: new Date().toISOString(),
      page_url: window.location.href
    };
  }

  // ---- SAVE EXTRA FIELDS TO DROPBOX (via Netlify function) ----
  async function saveExtraFields(extraData){
    try {
      var res = await fetch('/.netlify/functions/save-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extraData)
      });
      if(!res.ok){
        console.warn('Extra fields save returned', res.status);
      }
    } catch(err){
      // Non-blocking — don't prevent the user from proceeding
      console.warn('Extra fields save failed:', err);
    }
  }

  function attach(){
    var form = byId('loanForm');
    if(!form) return;
    captureAttribution();
    attachInlineValidation();

    form.addEventListener('submit', async function(e){
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var orig = btn ? btn.textContent : '';

      var validResult = validateForm();

      // Bot check
      if (validResult === 'bot') {
        window.location.href = THANK_YOU_URL;
        return;
      }

      if (!validResult) {
        var firstError = form.querySelector('[aria-invalid="true"]');
        if (firstError) firstError.focus();
        return;
      }

      if(btn){ btn.disabled = true; btn.textContent = 'Submitting\u2026'; }

      try{
        // Normalize phone
        var phoneEl = byId('phone');
        if(phoneEl) phoneEl.value = normalizePhoneE164(phoneEl.value);

        // Normalize currency fields
        ['purchasePrice','rehabBudget','arv','availableCash'].forEach(function(id){
          var el = byId(id); if(el) el.value = normalizeCurrency(el.value);
        });

        // 1. Submit to HubSpot (unchanged fields only)
        var hsFields = buildHubSpotFields();
        var url = 'https://api.hsforms.com/submissions/v3/integration/submit/' + HUBSPOT_PORTAL_ID + '/' + HUBSPOT_LOAN_GUID;
        var context = { pageUri: window.location.href, pageName: document.title };
        var hutk = getCookie('hubspotutk'); if(hutk) context.hutk = hutk;

        var res = await fetch(url, {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ fields: hsFields, context: context })
        });
        if(!res.ok){
          var txt = await res.text();
          throw new Error('HubSpot returned ' + res.status + ': ' + txt);
        }

        // 2. Save extra fields to Dropbox (non-blocking)
        var extraData = buildExtraFields();
        saveExtraFields(extraData);

        // 3. Redirect to thank-you page
        var qs = window.location.search || '';
        window.location.assign(THANK_YOU_URL + qs);
      } catch(err){
        console.error('Submission error:', err);
        showFormStatus('There was a problem submitting. Please try again or email info@swiftpathcapital.com.', 'error');
        if(btn){ btn.disabled=false; btn.textContent=orig; }
      }
    }, {passive:false});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();
