// assets/funnel-form.js
// Multi-step funnel form handler for the ad landing page (get-started.html).
// Manages step navigation, per-step validation, review summary,
// and final submission to HubSpot + Dropbox (same backend as LoanApp).
(function(){
  'use strict';

  var HUBSPOT_PORTAL_ID = "243569048";
  var HUBSPOT_LOAN_GUID = "6648e233-6873-4546-a9cf-b20d66ff4e8e";
  var THANK_YOU_URL = "/thank-you.html";
  var TOTAL_STEPS = 7;

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

  // ---- STEP NAVIGATION ----
  var currentStep = 1;
  var steps = document.querySelectorAll('.funnel-step');
  var dots = document.querySelectorAll('#stepDots .step-dot');

  function showStep(n){
    steps.forEach(function(s){ s.classList.remove('active'); });
    var target = document.querySelector('[data-step="' + n + '"]');
    if(target) target.classList.add('active');

    // Update progress
    var pct = Math.round((n / TOTAL_STEPS) * 100);
    var fill = byId('progressFill');
    var label = byId('stepLabel');
    var percent = byId('stepPercent');
    if(fill) fill.style.width = pct + '%';
    if(label) label.textContent = 'Step ' + n + ' of ' + TOTAL_STEPS;
    if(percent) percent.textContent = pct + '%';

    // Update dots
    dots.forEach(function(d, i){
      d.classList.remove('active', 'done');
      if(i < n - 1) d.classList.add('done');
      else if(i === n - 1) d.classList.add('active');
    });

    // Scroll to top of funnel
    var funnel = byId('funnel');
    if(funnel) funnel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    currentStep = n;

    // Re-init signature pad when step 7 becomes visible
    if(n === TOTAL_STEPS){
      buildReviewSummary();
      if(typeof window.__reinitSignaturePad === 'function'){
        // Small delay to ensure the step is fully rendered/visible
        setTimeout(function(){ window.__reinitSignaturePad(); }, 50);
      }
    }
  }

  // ---- INLINE ERRORS ----
  function showFieldError(fieldId, msg){
    var field = byId(fieldId);
    if(!field) return;
    field.classList.add('ring-2', 'ring-red-400');
    field.setAttribute('aria-invalid', 'true');
    var errorId = fieldId + '-error';
    var errorEl = byId(errorId);
    if(!errorEl){
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
    if(!field) return;
    field.classList.remove('ring-2', 'ring-red-400');
    field.removeAttribute('aria-invalid');
    var errorEl = byId(fieldId + '-error');
    if(errorEl) errorEl.textContent = '';
  }

  function showFormStatus(msg, type){
    var banner = byId('submitStatus');
    if(!banner) return;
    banner.classList.remove('hidden', 'border-red-300', 'bg-red-50', 'text-red-800', 'border-green-300', 'bg-green-50', 'text-green-800');
    if(type === 'error'){
      banner.className = 'mb-6 rounded-md border border-red-300 bg-red-50 text-red-800 p-4';
    } else {
      banner.className = 'mb-6 rounded-md border border-green-300 bg-green-50 text-green-800 p-4';
    }
    banner.textContent = msg;
    banner.removeAttribute('hidden');
  }

  function hideFormStatus(){
    var banner = byId('submitStatus');
    if(banner) banner.classList.add('hidden');
  }

  // ---- PER-STEP VALIDATION ----
  function validateStep(n){
    hideFormStatus();
    var valid = true;
    var firstInvalid = null;

    function require(id, msg){
      if(!val(id)){
        showFieldError(id, msg);
        if(!firstInvalid) firstInvalid = id;
        valid = false;
      } else {
        clearFieldError(id);
      }
    }

    switch(n){
      case 1:
        if(!val('loanPurpose')){
          // Show error near the cards container since loanPurpose is a hidden input
          var cardsContainer = byId('loanPurposeCards');
          if(cardsContainer) cardsContainer.classList.add('ring-2', 'ring-red-400', 'rounded-lg');
          var errorId = 'loanPurpose-error';
          var errorEl = byId(errorId);
          if(!errorEl){
            errorEl = document.createElement('p');
            errorEl.id = errorId;
            errorEl.className = 'text-red-600 text-xs mt-1';
            errorEl.setAttribute('role', 'alert');
            var purposeHidden = byId('loanPurpose');
            if(purposeHidden) purposeHidden.parentNode.insertBefore(errorEl, purposeHidden);
          }
          errorEl.textContent = 'Please select a loan purpose.';
          if(!firstInvalid) firstInvalid = 'loanPurposeCards';
          valid = false;
        } else {
          var cardsContainer = byId('loanPurposeCards');
          if(cardsContainer) cardsContainer.classList.remove('ring-2', 'ring-red-400', 'rounded-lg');
          var errorEl = byId('loanPurpose-error');
          if(errorEl) errorEl.textContent = '';
        }
        require('loanType', 'Please select purchase or refinance.');
        break;
      case 2:
        require('purchasePrice', 'Purchase price is required.');
        require('rehabBudget', 'Estimated rehab cost is required.');
        require('arv', 'After repair value is required.');
        break;
      case 3:
        // All optional, always valid
        break;
      case 4:
        require('firstName', 'First name is required.');
        require('lastName', 'Last name is required.');
        if(!val('email')){
          showFieldError('email', 'Email is required.');
          if(!firstInvalid) firstInvalid = 'email';
          valid = false;
        } else if(!isValidEmail(val('email'))){
          showFieldError('email', 'Please enter a valid email address.');
          if(!firstInvalid) firstInvalid = 'email';
          valid = false;
        } else {
          clearFieldError('email');
        }
        require('phone', 'Phone number is required.');
        break;
      case 5:
        require('propStreet', 'Street address is required.');
        require('propCity', 'City is required.');
        require('propState', 'State is required.');
        require('propZip', 'ZIP code is required.');
        break;
      case 6:
        // All optional, always valid
        break;
      case 7:
        if(!checked('investmentConfirm')){
          showFieldError('investmentConfirm', 'Please confirm this is an investment loan.');
          valid = false;
        } else { clearFieldError('investmentConfirm'); }

        if(typeof window.__hasSignature === 'function' && !window.__hasSignature()){
          showFieldError('clearSignatureBtn', 'Please provide your signature.');
          valid = false;
        } else { clearFieldError('clearSignatureBtn'); }

        if(!checked('consentCheckbox')){
          showFieldError('consentCheckbox', 'You must agree to the Terms, Privacy Policy, and E-Sign Consent.');
          valid = false;
        } else { clearFieldError('consentCheckbox'); }
        break;
    }

    if(!valid && firstInvalid){
      var el = byId(firstInvalid);
      if(el){ el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
    }

    return valid;
  }

  // ---- LOAN PURPOSE CARDS ----
  function initLoanPurposeCards(){
    var container = byId('loanPurposeCards');
    if(!container) return;
    var cards = container.querySelectorAll('.option-card');
    var hidden = byId('loanPurpose');

    // Map loan purpose to exit strategy
    var exitMap = {
      'Fix-and-Flip': 'Sell (Fix & Flip)',
      'BRRRR': 'Hold & Refinance',
      'Rental Property': 'Hold & Refinance',
      'Bridge Loan': 'Other',
      'New Construction': 'Sell (Fix & Flip)',
      'Other': 'Other'
    };

    function selectCard(card){
      cards.forEach(function(c){ c.classList.remove('selected'); c.setAttribute('aria-pressed', 'false'); });
      card.classList.add('selected');
      card.setAttribute('aria-pressed', 'true');
      var purpose = card.getAttribute('data-value');
      if(hidden) hidden.value = purpose;
      // Auto-set exit strategy
      var exitEl = byId('exitStrategy');
      if(exitEl && exitMap[purpose]) exitEl.value = exitMap[purpose];
    }

    cards.forEach(function(card){
      // Make keyboard accessible
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', 'false');

      card.addEventListener('click', function(){ selectCard(card); });
      card.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          selectCard(card);
        }
      });
    });
  }

  // ---- REVIEW SUMMARY ----
  function buildReviewSummary(){
    var container = byId('reviewSummary');
    if(!container) return;

    var rows = [
      { label: 'Loan Purpose', value: val('loanPurpose') },
      { label: 'Loan Type', value: val('loanType') },
      { label: 'Exit Strategy', value: val('exitStrategy') },
      { label: 'Purchase Price', value: val('purchasePrice') },
      { label: 'Rehab Budget', value: val('rehabBudget') },
      { label: 'ARV', value: val('arv') },
      { label: 'Credit Score', value: val('creditScore') },
      { label: 'Experience', value: val('investorExperience') },
      { label: 'Available Cash', value: val('availableCash') },
      { label: 'Name', value: [val('firstName'), val('lastName')].filter(Boolean).join(' ') },
      { label: 'Email', value: val('email') },
      { label: 'Phone', value: val('phone') },
      { label: 'Property', value: [val('propStreet'), val('propCity'), val('propState'), val('propZip')].filter(Boolean).join(', ') },
      { label: 'Company', value: val('businessName') },
      { label: 'Business Type', value: val('businessType') },
      { label: 'EIN', value: val('ein') }
    ];

    container.innerHTML = '';
    rows.forEach(function(r){
      if(!r.value) return;
      var row = document.createElement('div');
      row.className = 'flex justify-between py-1 border-b border-slate-100 last:border-0';
      var labelSpan = document.createElement('span');
      labelSpan.className = 'text-slate-500';
      labelSpan.textContent = r.label;
      var valueSpan = document.createElement('span');
      valueSpan.className = 'font-medium text-right';
      valueSpan.textContent = r.value;
      row.appendChild(labelSpan);
      row.appendChild(valueSpan);
      container.appendChild(row);
    });
  }

  // ---- ATTRIBUTION ----
  function captureAttribution(){
    var p = new URLSearchParams(location.search);
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid'].forEach(function(k){
      var el = byId(k); if(el) el.value = p.get(k) || '';
    });
  }

  // ---- HUBSPOT FIELDS ----
  function buildFullName(){
    var parts = [val('firstName'), val('middleInitial'), val('lastName'), val('suffix')];
    return parts.filter(Boolean).join(' ');
  }
  function buildAddress(streetId, cityId, stateId, zipId){
    var parts = [val(streetId), val(cityId), val(stateId), val(zipId)];
    return parts.filter(Boolean).join(', ');
  }

  function buildHubSpotFields(){
    var fullName = buildFullName();
    var firstName = val('firstName');
    var lastName = [val('middleInitial'), val('lastName'), val('suffix')].filter(Boolean).join(' ') || val('lastName');
    var mailingAddress = buildAddress('residenceStreet', 'residenceCity', 'residenceState', 'residenceZip');
    var propertyAddress = buildAddress('propStreet', 'propCity', 'propState', 'propZip');

    var fields = [
      { name:'full_name', value: fullName },
      { name:'firstname', value: firstName },
      { name:'lastname', value: lastName },
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

    return fields.filter(function(f){ return f.value != null && f.value !== ''; })
                 .map(function(f){ return {name:f.name, value:''+f.value}; });
  }

  // ---- EXTRA FIELDS (Dropbox) ----
  function buildExtraFields(){
    var sigData = null;
    if(typeof window.__getSignatureDataURL === 'function'){
      sigData = window.__getSignatureDataURL();
    }
    return {
      first_name: val('firstName'),
      middle_initial: val('middleInitial'),
      email: val('email'),
      phone: val('phone'),
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
      company_state_registration: val('companyStateReg'),
      company_address_same_as_primary: false,
      partner_name: val('partnerName'),
      partner_email: val('partnerEmail'),
      partner_phone: val('partnerPhone'),
      partner_dob: val('partnerDob'),
      partner_address: val('partnerAddress'),
      loan_type: val('loanType'),
      desired_closing_date: val('desiredCloseDate'),
      property_street: val('propStreet'),
      property_city: val('propCity'),
      property_state: val('propState'),
      property_zip: val('propZip'),
      requesting_repair_funds: val('requestingRepairFunds'),
      scope_of_work: val('scopeOfWork'),
      available_cash: val('availableCash'),
      credit_score: val('creditScore'),
      bankruptcy: val('bankruptcy'),
      own_property_free_clear: val('ownPropertyFreeClear'),
      investor_experience: val('investorExperience'),
      past_investments: val('pastInvestments'),
      how_heard: val('howHeard'),
      signature_data: sigData,
      submitted_at: new Date().toISOString(),
      page_url: window.location.href,
      form_type: 'funnel'
    };
  }

  async function saveExtraFields(extraData){
    try {
      var res = await fetch('/.netlify/functions/save-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extraData)
      });
      if(!res.ok) console.warn('Extra fields save returned', res.status);
    } catch(err){
      console.warn('Extra fields save failed:', err);
    }
  }

  async function notifyApplicationError(type, details){
    try {
      await fetch('/.netlify/functions/notify-application-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type,
          details: details || {},
          page_url: window.location.href,
          user_agent: navigator.userAgent,
          submitted_at: new Date().toISOString()
        })
      });
    } catch(err){
      console.warn('Failed to send error notification:', err);
    }
  }

  // ---- INIT ----
  function attach(){
    var form = byId('loanForm');
    if(!form) return;

    captureAttribution();
    initLoanPurposeCards();

    // Next / Prev buttons
    form.addEventListener('click', function(e){
      var btn = e.target.closest('.funnel-next');
      if(btn){
        e.preventDefault();
        if(validateStep(currentStep)){
          showStep(currentStep + 1);
        }
        return;
      }
      btn = e.target.closest('.funnel-prev');
      if(btn){
        e.preventDefault();
        if(currentStep > 1) showStep(currentStep - 1);
      }
    });

    // Form submission (step 7)
    form.addEventListener('submit', async function(e){
      e.preventDefault();

      // Honeypot
      var honeypot = byId('loanWebsite');
      if(honeypot && honeypot.value){
        window.location.href = THANK_YOU_URL;
        return;
      }

      if(!validateStep(7)) return;

      var btn = form.querySelector('button[type="submit"]');
      var orig = btn ? btn.textContent : '';
      if(btn){ btn.disabled = true; btn.textContent = 'Submitting\u2026'; }

      try {
        // Normalize phone
        var phoneEl = byId('phone');
        if(phoneEl) phoneEl.value = normalizePhoneE164(phoneEl.value);

        // Normalize currency
        ['purchasePrice','rehabBudget','arv','availableCash'].forEach(function(id){
          var el = byId(id); if(el) el.value = normalizeCurrency(el.value);
        });

        // 1. Submit to HubSpot
        var hsFields = buildHubSpotFields();
        var url = 'https://api.hsforms.com/submissions/v3/integration/submit/' + HUBSPOT_PORTAL_ID + '/' + HUBSPOT_LOAN_GUID;
        var context = { pageUri: window.location.href, pageName: document.title };
        var hutk = getCookie('hubspotutk'); if(hutk) context.hutk = hutk;

        var res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: hsFields, context: context })
        });
        if(!res.ok){
          var txt = await res.text();
          throw new Error('HubSpot returned ' + res.status + ': ' + txt);
        }

        // 2. Save extra fields (non-blocking)
        saveExtraFields(buildExtraFields());

        // 3. Redirect
        var qs = window.location.search || '';
        window.location.assign(THANK_YOU_URL + qs);
      } catch(err){
        console.error('Submission error:', err);
        showFormStatus('There was a problem submitting. Please try again or email info@swiftpathcapital.com.', 'error');
        notifyApplicationError('submission_error', {
          message: err && err.message ? err.message : String(err)
        });
        if(btn){ btn.disabled = false; btn.textContent = orig; }
      }
    }, {passive: false});

    // Keyboard: Enter advances to next step (only from text-like inputs and selects)
    form.addEventListener('keydown', function(e){
      if(e.key !== 'Enter' || currentStep >= TOTAL_STEPS) return;
      var tag = e.target.tagName;
      var type = (e.target.type || '').toLowerCase();
      var textLike = (tag === 'INPUT' && ['text','email','tel','number','search','url','password',''].indexOf(type) !== -1) || tag === 'SELECT';
      if(!textLike) return;
      e.preventDefault();
      if(validateStep(currentStep)) showStep(currentStep + 1);
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();
