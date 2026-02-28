
/**
 * assets/lead-form.js
 * SwiftPath Capital — externalized lead form handler (v3.0)
 * - No inline JS required (works with strict CSP)
 * - Submits to HubSpot directly; falls back to Netlify function proxy on failure
 * - Validates name -> requires at least first & last
 * - Validates email format (RFC-like)
 * - Honeypot field for bot detection
 * - Inline error messages (no alert())
 * - Real-time inline validation
 * - Preserves UTM params; sends to common HubSpot field names
 */

(function () {
  'use strict';

  // ---- CONFIG ----
  var HUBSPOT_PORTAL_ID = '243569048';
  var HUBSPOT_FORM_GUID = '65717a53-a61c-4f85-ae97-8c34b85c5d83';
  var DIRECT_URL = 'https://api.hsforms.com/submissions/v3/integration/submit/' + HUBSPOT_PORTAL_ID + '/' + HUBSPOT_FORM_GUID;
  var PROXY_URL  = '/.netlify/functions/hs-submit';

  // ---- HELPERS ----
  function byId(id){ return document.getElementById(id); }

  function getCookie(name){
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function splitName(full){
    var s = (full || '').trim().replace(/\s+/g,' ');
    if(!s) return { first:'', last:'' };
    var parts = s.split(' ');
    if(parts.length === 1) return { first: parts[0], last: '' };
    return { first: parts[0], last: parts.slice(1).join(' ') };
  }

  function isValidEmail(email){
    // Reasonable RFC-like validation
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }

  function readValue(id){ return (byId(id) && byId(id).value || '').trim(); }

  // ---- INLINE ERROR DISPLAY ----
  function showFieldError(fieldId, msg){
    var field = byId(fieldId);
    if (!field) return;
    // Add error styling
    field.classList.add('ring-2', 'ring-red-400');
    field.setAttribute('aria-invalid', 'true');
    // Find or create error element
    var errorId = fieldId + '-error';
    var errorEl = byId(errorId);
    if (!errorEl) {
      errorEl = document.createElement('p');
      errorEl.id = errorId;
      errorEl.className = 'text-red-300 text-xs mt-1';
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

  function showFormError(msg){
    // Show error in a banner above the form
    var banner = byId('leadFormError');
    if (!banner) {
      var form = byId('leadForm');
      if (!form) return;
      banner = document.createElement('div');
      banner.id = 'leadFormError';
      banner.className = 'bg-red-500/20 border border-red-400/40 text-red-100 rounded-lg px-4 py-3 mb-4 text-sm';
      banner.setAttribute('role', 'alert');
      banner.setAttribute('aria-live', 'assertive');
      form.insertBefore(banner, form.firstChild);
    }
    banner.textContent = msg;
    banner.style.display = 'block';
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearFormError(){
    var banner = byId('leadFormError');
    if (banner) banner.style.display = 'none';
  }

  // ---- FIELD BUILDING ----
  function buildFields(){
    var full    = readValue('leadName');
    var email   = readValue('leadEmail');
    var phone   = readValue('leadPhone');
    var purpose = readValue('leadPurpose');
    var names   = splitName(full);

    var fields = [];
    if(full)            fields.push({name:'name', value:full});
    if(names.first)     fields.push({name:'firstname', value:names.first});
    if(names.last)      fields.push({name:'lastname',  value:names.last});
    if(email)           fields.push({name:'email', value:email});
    if(phone)           ['phone','mobilephone','phone_number'].forEach(function(n){ fields.push({name:n, value:phone}); });
    if(purpose)         ['lead_purpose','loan_purpose','purpose','loan_interest','product'].forEach(function(n){ fields.push({name:n, value:purpose}); });

    var p = new URLSearchParams(location.search);
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','gbraid','wbraid'].forEach(function(k){
      var v = p.get(k); if(v) fields.push({name:k, value:v});
    });

    return { fields: fields, names: names };
  }

  function buildContext(){
    var ctx = { pageUri: location.href, pageName: document.title };
    var hutk = getCookie('hubspotutk');
    if(hutk) ctx.hutk = hutk;
    return ctx;
  }

  function setSubmitting(isOn){
    var btn = byId('leadSubmit');
    if(!btn) return;
    if(isOn){
      btn.dataset.origText = btn.dataset.origText || btn.textContent;
      btn.textContent = 'Sending...';
      btn.setAttribute('disabled', 'disabled');
      btn.classList.add('opacity-60', 'cursor-not-allowed');
    }else{
      if(btn.dataset.origText) btn.textContent = btn.dataset.origText;
      btn.removeAttribute('disabled');
      btn.classList.remove('opacity-60', 'cursor-not-allowed');
    }
  }

  async function submitDirect(payload){
    var res = await fetch(DIRECT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res;
  }

  async function submitViaProxy(payload){
    var res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portalId: HUBSPOT_PORTAL_ID,
        formGuid: HUBSPOT_FORM_GUID,
        fields: payload.fields,
        context: payload.context
      }),
    });
    return res;
  }

  // ---- VALIDATION ----
  function validateForm(){
    var valid = true;
    clearFormError();

    // Name
    var data = buildFields();
    if(!data.names.first || !data.names.last){
      showFieldError('leadName', 'Please enter your full name (first and last).');
      valid = false;
    } else {
      clearFieldError('leadName');
    }

    // Email
    var email = readValue('leadEmail');
    if(!email){
      showFieldError('leadEmail', 'Email is required.');
      valid = false;
    } else if(!isValidEmail(email)){
      showFieldError('leadEmail', 'Please enter a valid email address.');
      valid = false;
    } else {
      clearFieldError('leadEmail');
    }

    // Phone
    var phone = readValue('leadPhone');
    if(!phone){
      showFieldError('leadPhone', 'Phone number is required.');
      valid = false;
    } else {
      clearFieldError('leadPhone');
    }

    // Loan type
    var purpose = readValue('leadPurpose');
    if(!purpose){
      showFieldError('leadPurpose', 'Please select a loan type.');
      valid = false;
    } else {
      clearFieldError('leadPurpose');
    }

    return valid;
  }

  async function handleSubmit(e){
    try{
      e.preventDefault();

      // Honeypot check
      var honeypot = byId('leadWebsite');
      if (honeypot && honeypot.value) {
        // Bot detected — silently redirect to thank-you
        window.location.href = '/thank-you.html';
        return;
      }

      if(!validateForm()){
        // Focus the first invalid field
        var firstError = document.querySelector('[aria-invalid="true"]');
        if (firstError) firstError.focus();
        return;
      }

      setSubmitting(true);
      clearFormError();

      var data = buildFields();
      var ctx  = buildContext();
      var payload = { fields: data.fields, context: ctx };
      var res = await submitDirect(payload);

      if(!res.ok){
        res = await submitViaProxy(payload);
      }

      if(res.ok){
        window.location.href = '/thank-you.html';
      }else{
        var text = await res.text();
        console.warn('[LeadForm] submit error', res.status, text);
        showFormError('We couldn\u2019t submit the form. Please confirm your info and try again.');
        setSubmitting(false);
      }
    }catch(err){
      console.error('[LeadForm] unexpected error', err);
      showFormError('Unexpected error. Please try again or email info@swiftpathcapital.com.');
      setSubmitting(false);
    }
  }

  // ---- INLINE VALIDATION ON BLUR ----
  function attachInlineValidation(){
    var nameEl = byId('leadName');
    var emailEl = byId('leadEmail');
    var phoneEl = byId('leadPhone');

    if (nameEl) {
      nameEl.addEventListener('blur', function(){
        var names = splitName(nameEl.value);
        if (nameEl.value.trim() && (!names.first || !names.last)) {
          showFieldError('leadName', 'Please enter your full name (first and last).');
        } else {
          clearFieldError('leadName');
        }
      });
    }

    if (emailEl) {
      emailEl.addEventListener('blur', function(){
        var v = emailEl.value.trim();
        if (v && !isValidEmail(v)) {
          showFieldError('leadEmail', 'Please enter a valid email address.');
        } else {
          clearFieldError('leadEmail');
        }
      });
    }

    if (phoneEl) {
      phoneEl.addEventListener('blur', function(){
        var v = phoneEl.value.trim().replace(/[^\d+]/g, '');
        if (v && v.length < 10) {
          showFieldError('leadPhone', 'Please enter a valid phone number.');
        } else {
          clearFieldError('leadPhone');
        }
      });
    }
  }

  function attach(){
    var form = byId('leadForm');
    if(!form) return;
    form.addEventListener('submit', handleSubmit, true);
    window.addEventListener('submit', function(ev){ if(ev.target===form) handleSubmit(ev); }, true);
    attachInlineValidation();
    console.log('[LeadForm] handler attached (v3.0 external)');
  }

  if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', attach, { once:true }); }
  else attach();
})();
