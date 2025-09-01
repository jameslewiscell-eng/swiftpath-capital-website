// assets/hs-helpers.dual.js  (v2 with robust field mapping + better diagnostics)
(function(){
  // ---- CONFIG: update if your form GUID changes ----
  const HUBSPOT_PORTAL_ID = "243569048";
  const HUBSPOT_LEAD_GUID = "65717a53-a61c-4f85-ae97-8c34b85c5d83"; // Lead / Get Pre‑Qualified form
  const DIRECT_URL = `https://api.hsforms.com/submissions/v3/integration/submit/${HUBSPOT_PORTAL_ID}/${HUBSPOT_LEAD_GUID}`;
  const PROXY_URL = "/.netlify/functions/hs-submit";

  function getCookie(name){
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\\[\\]\\\\/+^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function byId(id){ return document.getElementById(id); }

  function splitName(full){
    const s = (full || "").trim().replace(/\s+/g,' ');
    if(!s) return { first: "", last: "" };
    const parts = s.split(' ');
    if(parts.length === 1) return { first: parts[0], last: "" };
    return { first: parts[0], last: parts.slice(1).join(' ') };
  }

  // Build fields including multiple aliases so HubSpot forms with different internal names still accept submissions.
  function buildFields(){
    const fullName = (byId('leadName')?.value || '').trim();
    const email    = (byId('leadEmail')?.value || '').trim();
    const phone    = (byId('leadPhone')?.value || '').trim();
    const purpose  = (byId('leadPurpose')?.value || '').trim();
    const { first, last } = splitName(fullName);

    const fields = [];

    // Name variants
    if(fullName) fields.push({name:'name', value: fullName});
    if(first)    fields.push({name:'firstname', value: first});
    if(last)     fields.push({name:'lastname', value: last});

    // Email
    if(email)    fields.push({name:'email', value: email});

    // Phone variants
    if(phone) {
      fields.push({name:'phone', value: phone});
      fields.push({name:'mobilephone', value: phone});
      fields.push({name:'phone_number', value: phone});
    }

    // Purpose / product variants
    if(purpose){
      ['lead_purpose','loan_purpose','purpose','loan_type','product_interest','product'].forEach(n=>{
        fields.push({name:n, value: purpose});
      });
    }

    // Append UTMs if present
    const p = new URLSearchParams(location.search);
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid'].forEach(k=>{
      const val = p.get(k);
      if(val) fields.push({name:k, value:val});
    });

    return fields;
  }

  function buildContext(){
    const ctx = { pageUri: window.location.href, pageName: document.title };
    const hutk = getCookie('hubspotutk'); if(hutk) ctx.hutk = hutk;
    return ctx;
  }

  async function submitDirect(fields, context){
    const body = JSON.stringify({ fields, context });
    const res = await fetch(DIRECT_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body });
    const txt = await res.text();
    if(!res.ok){
      // Surface HubSpot validation errors to the console for easier debugging.
      try { console.warn('[LeadForm] HubSpot direct error:', res.status, JSON.parse(txt)); }
      catch{ console.warn('[LeadForm] HubSpot direct error:', res.status, txt); }
      throw new Error('direct:' + res.status);
    }
    return txt;
  }

  async function submitViaProxy(fields, context){
    const payload = { portalId: HUBSPOT_PORTAL_ID, formGuid: HUBSPOT_LEAD_GUID, fields, context };
    const res = await fetch(PROXY_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const txt = await res.text();
    if(!res.ok){
      try { console.warn('[LeadForm] Proxy error:', res.status, JSON.parse(txt)); }
      catch{ console.warn('[LeadForm] Proxy error:', res.status, txt); }
      throw new Error('proxy:' + res.status);
    }
    return txt;
  }

  async function submitWithFallback(fields, context){
    try{
      return await submitDirect(fields, context);
    }catch(err){
      console.warn('[LeadForm] Direct failed, retrying via proxy →', err && err.message);
      return await submitViaProxy(fields, context);
    }
  }

  function attach(){
    const form = byId('leadForm'); if(!form) return;
    form.addEventListener('submit', async function(e){
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const orig = btn ? btn.textContent : '';
      if(btn){ btn.disabled = true; btn.textContent = 'Submitting…'; }
      try{
        const fields = buildFields();
        const context = buildContext();
        await submitWithFallback(fields, context);
        const qs = window.location.search || '';
        window.location.assign('/thank-you.html' + qs);
      }catch(err){
        alert('Sorry, something went wrong. Please email info@swiftpathcapital.com or try again.');
      }finally{
        if(btn){ btn.disabled = false; btn.textContent = orig; }
      }
    }, {passive:false});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();