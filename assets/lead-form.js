
/**
 * assets/lead-form.js
 * SwiftPath Capital — externalized lead form handler (v2.4)
 * - No inline JS required (works with strict CSP)
 * - Submits to HubSpot directly; falls back to Netlify function proxy on failure
 * - Validates name -> requires at least first & last
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

  function readValue(id){ return (byId(id) && byId(id).value || '').trim(); }

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

  function showError(msg){
    // Friendly alert for now; can be swapped for inline banner
    alert(msg || 'There was a problem submitting your request. Please try again.');
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

  async function handleSubmit(e){
    try{
      e.preventDefault();
      var form = e.currentTarget || e.target;

      // Basic validation: require first + last name for HS 'lastname' requirement
      var data = buildFields();
      var ctx  = buildContext();
      if(!data.names.first || !data.names.last){
        showError('Please enter your full name (first and last).');
        byId('leadName') && byId('leadName').focus();
        return;
      }
      if(!readValue('leadEmail')){
        showError('Please enter a valid email address.');
        byId('leadEmail') && byId('leadEmail').focus();
        return;
      }

      setSubmitting(true);

      var payload = { fields: data.fields, context: ctx };
      var res = await submitDirect(payload);

      if(!res.ok){
        // Some browsers / CSPs may block direct call; try proxy
        res = await submitViaProxy(payload);
      }

      if(res.ok){
        // redirect
        window.location.href = '/thank-you.html';
      }else{
        var text = await res.text();
        console.warn('[LeadForm] submit error', res.status, text);
        showError('We couldn’t submit the form. Please confirm your info and try again.');
        setSubmitting(false);
      }
    }catch(err){
      console.error('[LeadForm] unexpected error', err);
      showError('Unexpected error. Please try again.');
      setSubmitting(false);
    }
  }

  function attach(){
    var form = byId('leadForm');
    if(!form) return;
    // Capture-phase submit gets precedence across browsers
    form.addEventListener('submit', handleSubmit, true);
    // Click fallback (e.g., Safari focus quirks)
    var btn = byId('leadSubmit');
    if(btn) btn.addEventListener('click', function(){ /* no-op */ }, true);
    // Global capture as belt-and-suspenders
    window.addEventListener('submit', function(ev){ if(ev.target===form) handleSubmit(ev); }, true);
    console.log('[LeadForm] handler attached (v2.4 external)');
  }

  if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', attach, { once:true }); }
  else attach();
})();
