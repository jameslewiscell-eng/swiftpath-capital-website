// assets/loanapp-submit.js
// Full loan application form handler with inline validation and error messages.
(function(){
  'use strict';

  var HUBSPOT_PORTAL_ID = "243569048";
  var HUBSPOT_LOAN_GUID = "6648e233-6873-4546-a9cf-b20d66ff4e8e";
  var THANK_YOU_URL = "/thank-you.html";

  function byId(id){ return document.getElementById(id); }
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

  function normalizeFields(fields){
    var out=[], full = (byId('fullName')?.value||'').trim();
    for(var i = 0; i < fields.length; i++){
      var f = fields[i];
      if(f && f.value!=null) out.push({name:f.name, value:''+f.value});
    }
    if(full){
      var parts = full.split(/\s+/); var first = parts.shift()||''; var last = parts.join(' ');
      if(first) out.push({name:'firstname', value:first});
      if(last)  out.push({name:'lastname',  value:last});
    }
    return out;
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

    // Full name
    var fullName = (byId('fullName')?.value || '').trim();
    var parts = fullName.split(/\s+/);
    if (!fullName || parts.length < 2) {
      showFieldError('fullName', 'Please enter your full name (first and last).');
      valid = false;
    } else { clearFieldError('fullName'); }

    // Email
    var email = (byId('email')?.value || '').trim();
    if (!email) {
      showFieldError('email', 'Email is required.');
      valid = false;
    } else if (!isValidEmail(email)) {
      showFieldError('email', 'Please enter a valid email address.');
      valid = false;
    } else { clearFieldError('email'); }

    // Phone
    var phone = (byId('phone')?.value || '').trim();
    if (!phone) {
      showFieldError('phone', 'Phone number is required.');
      valid = false;
    } else { clearFieldError('phone'); }

    // Property address
    var addr = (byId('propertyAddress')?.value || '').trim();
    if (!addr) {
      showFieldError('propertyAddress', 'Property address is required.');
      valid = false;
    } else { clearFieldError('propertyAddress'); }

    // Purchase price
    var price = (byId('purchasePrice')?.value || '').trim();
    if (!price) {
      showFieldError('purchasePrice', 'Purchase price is required.');
      valid = false;
    } else { clearFieldError('purchasePrice'); }

    // Consent
    if (!byId('consentCheckbox')?.checked) {
      showFieldError('consentCheckbox', 'You must agree to the Terms, Privacy Policy, and E-Sign Consent.');
      valid = false;
    } else { clearFieldError('consentCheckbox'); }

    return valid;
  }

  // ---- INLINE VALIDATION ON BLUR ----
  function attachInlineValidation(){
    var nameEl = byId('fullName');
    var emailEl = byId('email');

    if (nameEl) {
      nameEl.addEventListener('blur', function(){
        var v = nameEl.value.trim();
        if (v && v.split(/\s+/).length < 2) {
          showFieldError('fullName', 'Please enter your full name (first and last).');
        } else {
          clearFieldError('fullName');
        }
      });
    }

    if (emailEl) {
      emailEl.addEventListener('blur', function(){
        var v = emailEl.value.trim();
        if (v && !isValidEmail(v)) {
          showFieldError('email', 'Please enter a valid email address.');
        } else {
          clearFieldError('email');
        }
      });
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
        var phoneEl = byId('phone'); if(phoneEl) phoneEl.value = normalizePhoneE164(phoneEl.value);
        ['purchasePrice','rehabBudget','arv','loanAmount'].forEach(function(id){
          var el = byId(id); if(el) el.value = normalizeCurrency(el.value);
        });

        var fields = normalizeFields([
          { name:'full_name', value: byId('fullName')?.value || '' },
          { name:'email', value: byId('email')?.value || '' },
          { name:'phone', value: byId('phone')?.value || '' },
          { name:'mailing_address', value: byId('mailingAddress')?.value || '' },
          { name:'business_name', value: byId('businessName')?.value || '' },
          { name:'business_type', value: byId('businessType')?.value || '' },
          { name:'number_of_completed_deals', value: byId('numDeals')?.value || '' },
          { name:'entity_ein', value: byId('ein')?.value || '' },
          { name:'property_address', value: byId('propertyAddress')?.value || '' },
          { name:'purchase_price', value: byId('purchasePrice')?.value || '' },
          { name:'rehab_budget', value: byId('rehabBudget')?.value || '' },
          { name:'after_repair_value_arv', value: byId('arv')?.value || '' },
          { name:'wholesaler_involved', value: byId('wholesaler')?.value || '' },
          { name:'loan_purpose', value: byId('loanPurpose')?.value || '' },
          { name:'requested_loan_amount', value: byId('loanAmount')?.value || '' },
          { name:'timeline_to_close', value: byId('timeline')?.value || '' },
          { name:'exit_strategy', value: byId('exitStrategy')?.value || '' },
          { name:'loan_details_notes', value: byId('loanDetails')?.value || '' },
          { name:'file_upload_link_purchase_contract', value: '' },
          { name:'file_upload_link_rehab_budget', value: '' },
          { name:'file_upload_link_comps_appraisal', value: '' },
          { name:'utm_source', value: byId('utm_source')?.value || '' },
          { name:'utm_medium', value: byId('utm_medium')?.value || '' },
          { name:'utm_campaign', value: byId('utm_campaign')?.value || '' },
          { name:'utm_term', value: byId('utm_term')?.value || '' },
          { name:'utm_content', value: byId('utm_content')?.value || '' },
          { name:'gclid', value: byId('gclid')?.value || '' }
        ]);

        var url = 'https://api.hsforms.com/submissions/v3/integration/submit/' + HUBSPOT_PORTAL_ID + '/' + HUBSPOT_LOAN_GUID;
        var context = { pageUri: window.location.href, pageName: document.title };
        var hutk = getCookie('hubspotutk'); if(hutk) context.hutk = hutk;

        var res = await fetch(url, {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ fields: fields, context: context })
        });
        if(!res.ok){
          var txt = await res.text();
          throw new Error('HubSpot returned ' + res.status + ': ' + txt);
        }
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
