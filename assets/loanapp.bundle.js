
(function(){
  // --- Tiny utilities
  function qs(id){ return document.getElementById(id); }
  function onlyDigits(s){ return (s||'').replace(/\D+/g,''); }
  function normalizeCurrencyForSubmit(s){
    var clean = (s||'').replace(/[^0-9.]/g,'');
    var parts = clean.split('.');
    if(parts.length>2){ clean = parts[0] + '.' + parts.slice(1).join(''); }
    return clean;
  }
  function normalizePhoneE164(s){
    var d = onlyDigits(s);
    if(!d) return '';
    if(d.length===10) return '+1'+d;
    if(d.length>10 && d[0] !== '0') return '+'+d;
    return d;
  }
  function ensureStatus(){
    var box = document.getElementById('submitStatus');
    if(!box){
      box = document.createElement('div');
      box.id = 'submitStatus';
      box.className = 'mb-6 rounded-md border p-4';
      var form = qs('loanForm');
      if(form) form.parentNode.insertBefore(box, form);
    }
    return box;
  }
  function showStatus(type, title, details){
    var box = ensureStatus();
    var base = 'mb-6 rounded-md border p-4 ';
    var cls = (type==='error') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800';
    box.className = base + cls;
    box.innerHTML = '<p class="font-semibold">'+(title||'')+'</p>' + (details?('<pre class="mt-2 whitespace-pre-wrap text-xs">'+details+'</pre>') : '');
    try{ box.scrollIntoView({behavior:'smooth', block:'start'}); }catch(_){}
  }

  // --- HubSpot submission helper
  function getCookie(name){
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\\[\\]\\\\/+^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function normalizeFields(fields){
    var out = []; var fullName = null;
    (fields||[]).forEach(function(f){
      if(!f || f.value == null) return;
      if(f.name==='full_name' || f.name==='name_full'){
        fullName = (''+f.value).trim(); return;
      }
      out.push({ name:f.name, value: ''+f.value });
    });
    if(fullName){
      var parts = fullName.split(/\s+/); var first = parts.shift()||''; var last = parts.join(' ');
      if(first) out.push({ name:'firstname', value:first });
      if(last)  out.push({ name:'lastname',  value:last });
    }
    return out;
  }

  window.__swiftpathHS = window.__swiftpathHS || {};
  window.__swiftpathHS.submitToHubSpot = async function(formGuid, fields){
    var portalId = '243569048';
    var url = 'https://api.hsforms.com/submissions/v3/integration/submit/'+portalId+'/'+formGuid;
    var context = { pageUri: window.location.href, pageName: document.title };
    var hutk = getCookie('hubspotutk'); if(hutk) context.hutk = hutk;
    var payload = { fields: normalizeFields(fields), context: context };

    // Diagnostics: masked payload
    try{
      function mask(arr){
        return (arr||[]).map(function(f){
          var n = (f && f.name ? (''+f.name).toLowerCase() : '');
          var v = (f && f.value != null ? ''+f.value : '');
          if(n.indexOf('email')>=0) v = v.replace(/(^.).*(@.*$)/,'$1***$2');
          if(n.indexOf('phone')>=0) v = v.length>4 ? ('***'+v.slice(-4)) : '***';
          return {name:f.name, value:v};
        });
      }
      showStatus('success', 'Debug: Payload preview', JSON.stringify({url:url, formGuid:formGuid, payload:{fields:mask(payload.fields), context:payload.context}}, null, 2));
    }catch(_){}

    var res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    var text = await res.text(); var json = null; try{ json = JSON.parse(text); }catch(_){}

    showStatus('success', 'Debug: HubSpot response', (text||'[empty]').slice(0,4000));
    if(!res.ok || (json && json.status && (''+json.status).toLowerCase()==='error')){
      var msg = 'HubSpot rejected the submission.';
      if(json && json.errors){ msg += '\\n' + json.errors.map(function(e){return e.message||e.errorType||JSON.stringify(e);}).join('\\n'); }
      else { msg += '\\nHTTP ' + res.status + ': ' + text; }
      showStatus('error', 'Submission failed', msg);
      throw new Error(msg);
    }
    showStatus('success', 'SUCCESS (no-redirect build)', 'Would redirect to /thank-you.html');
  };

  function captureAttribution(){
    function getParam(k){ return new URLSearchParams(window.location.search).get(k) || ''; }
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid'].forEach(function(k){
      var el = qs(k); if(el) el.value = getParam(k);
    });
  }

  function init(){
    var form = qs('loanForm'); if(!form){ return; }
    captureAttribution();

    // Attach submit handler
    form.addEventListener('submit', async function(e){
      e.preventDefault();
      try {
        var btn = form.querySelector('button[type="submit"]'); if(btn){ btn.disabled=true; btn.textContent='Submitting…'; }
        // Normalize inputs
        var phone = qs('phone'); if(phone) phone.value = normalizePhoneE164(phone.value);
        ['purchasePrice','rehabBudget','arv','loanAmount'].forEach(function(id){
          var el = qs(id); if(el) el.value = normalizeCurrencyForSubmit(el.value);
        });
        // Required consent
        var consent = qs('consentCheckbox'); if(!consent || !consent.checked){ showStatus('error','Please agree to Terms & Privacy.'); if(btn){btn.disabled=false; btn.textContent='Submit Application';} return; }

        // Build fields using the EXACT HubSpot property names
        var fields = [
          { name:'full_name', value: (qs('fullName')||{}).value || '' },
          { name:'email', value: (qs('email')||{}).value || '' },
          { name:'phone', value: (qs('phone')||{}).value || '' },
          { name:'mailing_address', value: (qs('mailingAddress')||{}).value || '' },
          { name:'business_name', value: (qs('businessName')||{}).value || '' },
          { name:'name', value: (qs('businessName')||{}).value || '' }, // company property
          { name:'business_type', value: (qs('businessType')||{}).value || '' },
          { name:'number_of_completed_deals', value: (qs('numDeals')||{}).value || '' },
          { name:'entity_ein', value: (qs('ein')||{}).value || '' },
          { name:'property_address', value: (qs('propertyAddress')||{}).value || '' },
          { name:'purchase_price', value: (qs('purchasePrice')||{}).value || '' },
          { name:'rehab_budget', value: (qs('rehabBudget')||{}).value || '' },
          { name:'after_repair_value_arv', value: (qs('arv')||{}).value || '' },
          { name:'wholesaler_involved', value: (qs('wholesaler')||{}).value || '' },
          { name:'loan_purpose', value: (qs('loanPurpose')||{}).value || '' },
          { name:'requested_loan_amount', value: (qs('loanAmount')||{}).value || '' },
          { name:'timeline_to_close', value: (qs('timeline')||{}).value || '' },
          { name:'exit_strategy', value: (qs('exitStrategy')||{}).value || '' },
          { name:'loan_details_notes', value: (qs('loanDetails')||{}).value || '' },
          // File URLs: leave blank in this debug build; upload function can fill these later
          { name:'file_upload_link_purchase_contract', value: '' },
          { name:'file_upload_link_rehab_budget', value: '' },
          { name:'file_upload_link_comps_appraisal', value: '' },
          // Attribution
          { name:'utm_source', value:(qs('utm_source')||{}).value || '' },
          { name:'utm_medium', value:(qs('utm_medium')||{}).value || '' },
          { name:'utm_campaign', value:(qs('utm_campaign')||{}).value || '' },
          { name:'utm_term', value:(qs('utm_term')||{}).value || '' },
          { name:'utm_content', value:(qs('utm_content')||{}).value || '' },
          { name:'gclid', value:(qs('gclid')||{}).value || '' }
        ];

        await window.__swiftpathHS.submitToHubSpot('6648e233-6873-4546-a9cf-b20d66ff4e8e', fields);
      } catch(err){
        console.error('Submission error:', err);
      } finally {
        var btn = form.querySelector('button[type="submit"]'); if(btn){ btn.disabled=false; btn.textContent='Submit Application'; }
      }
    }, true);

    console.log('Loan application bundle initialized');
  }

  if(document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
