// assets/loanapp-submit.js
(function(){
  const HUBSPOT_PORTAL_ID = "243569048";
  const HUBSPOT_LOAN_GUID = "6648e233-6873-4546-a9cf-b20d66ff4e8e";
  const THANK_YOU_URL = "/thank-you.html";

  const params = new URLSearchParams(location.search);
  const DEBUG = params.get('debug') === '1';

  function byId(id){ return document.getElementById(id); }
  function onlyDigits(s){ return (s||'').replace(/\D+/g,''); }
  function normalizeCurrency(s){
    const clean = (s||'').replace(/[^0-9.]/g,'');
    const parts = clean.split('.');
    return parts.length > 2 ? (parts[0] + '.' + parts.slice(1).join('')) : clean;
  }
  function normalizePhoneE164(s){
    const d = onlyDigits(s);
    if(!d) return '';
    if(d.length===10) return '+1'+d;
    if(d.length>10 && d[0] !== '0') return '+'+d;
    return d;
  }
  function statusEl(){
    let el = byId('submitStatus');
    if(!el){
      el = document.createElement('div');
      el.id = 'submitStatus';
      const form = byId('loanForm');
      if(form && form.parentNode){ form.parentNode.insertBefore(el, form); }
    }
    return el;
  }
  function showStatus(type, title, details){
    const el = statusEl();
    const base = 'mb-6 rounded-md border p-4 ';
    const cls  = (type==='error') ? 'bg-red-50 border-red-200 text-red-700' : (type==='warn' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800');
    el.className = base + cls;
    el.innerHTML = '<p class="font-semibold">'+(title||'')+'</p>' + (details?('<pre class="mt-2 whitespace-pre-wrap text-xs">'+details+'</pre>') : '');
    try{ el.scrollIntoView({behavior:'smooth', block:'start'}); }catch{}
  }
  function getCookie(name){
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\\[\\]\\\\/+^])/g, '\\\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function normalizeFields(fields){
    const out=[], full = (byId('fullName')?.value||'').trim();
    for(const f of fields){ if(f && f.value!=null) out.push({name:f.name, value:''+f.value}); }
    if(full){
      const parts = full.split(/\\s+/); const first = parts.shift()||''; const last = parts.join(' ');
      if(first) out.push({name:'firstname', value:first});
      if(last)  out.push({name:'lastname',  value:last});
    }
    return out;
  }
  function captureAttribution(){
    const p = new URLSearchParams(location.search);
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid'].forEach(k=>{
      const el = byId(k); if(el) el.value = p.get(k) || '';
    });
  }
  function maskFields(arr){
    return (arr||[]).map(f=>{
      const n = (f && f.name ? (''+f.name).toLowerCase() : '');
      let v = (f && f.value != null ? ''+f.value : '');
      if(n.includes('email')) v = v.replace(/(^.).*(@.*$)/,'$1***$2');
      if(n.includes('phone')) v = v.length>4 ? ('***'+v.slice(-4)) : '***';
      return { name:f.name, value:v };
    });
  }

  async function postToHubSpot(fields){
    const url = `https://api.hsforms.com/submissions/v3/integration/submit/${HUBSPOT_PORTAL_ID}/${HUBSPOT_LOAN_GUID}`;
    const context = { pageUri: window.location.href, pageName: document.title };
    const hutk = getCookie('hubspotutk'); if(hutk) context.hutk = hutk;

    if (DEBUG) showStatus('warn','Debug: Payload preview', JSON.stringify({ url, payload: { fields: maskFields(fields), context } }, null, 2));

    const res = await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ fields, context })
    });
    const text = await res.text();
    if (DEBUG) showStatus(res.ok ? 'success' : 'error', 'Debug: HubSpot response', `HTTP ${res.status}\\n${text.slice(0,4000)}`);
    if(!res.ok) throw new Error('HubSpot returned ' + res.status + ': ' + text);
    return true;
  }

  function attach(){
    const form = byId('loanForm');
    if(!form) return;
    captureAttribution();
    form.addEventListener('submit', async function(e){
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const orig = btn ? btn.textContent : '';
      if(btn){ btn.disabled = true; btn.textContent = 'Submitting…'; }

      try{
        if(!byId('consentCheckbox')?.checked){
          showStatus('error','Please agree to Terms & Privacy.');
          if(btn){ btn.disabled=false; btn.textContent=orig; }
          return;
        }
        const phoneEl = byId('phone'); if(phoneEl) phoneEl.value = normalizePhoneE164(phoneEl.value);
        ['purchasePrice','rehabBudget','arv','loanAmount'].forEach(id=>{
          const el = byId(id); if(el) el.value = normalizeCurrency(el.value);
        });

        const fields = normalizeFields([
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

        await postToHubSpot(fields);

        if (DEBUG) {
          showStatus('success', 'Success (Debug Mode)', 'Not redirecting because debug=1. Remove ?debug=1 to enable redirect.');
          if(btn){ btn.disabled=false; btn.textContent=orig; }
          return;
        }
        const qs = window.location.search || '';
        window.location.assign(THANK_YOU_URL + qs);
      } catch(err){
        console.error('Submission error:', err);
        showStatus('error','There was a problem', err && err.message ? err.message : String(err));
        if(btn){ btn.disabled=false; btn.textContent=orig; }
      }
    }, {passive:false});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();