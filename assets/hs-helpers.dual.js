// assets/hs-helpers.dual.js
(function(){
  const HUBSPOT_PORTAL_ID = "243569048";
  const HUBSPOT_LEAD_GUID = "65717a53-a61c-4f85-ae97-8c34b85c5d83";
  const DIRECT_URL = `https://api.hsforms.com/submissions/v3/integration/submit/${HUBSPOT_PORTAL_ID}/${HUBSPOT_LEAD_GUID}`;
  const PROXY_URL = "/.netlify/functions/hs-submit";

  function getCookie(name){
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function byId(id){ return document.getElementById(id); }

  function buildPayload(fields){
    const context = { pageUri: window.location.href, pageName: document.title };
    const hutk = getCookie('hubspotutk'); if(hutk) context.hutk = hutk;

    // Append UTMs if present
    const p = new URLSearchParams(location.search);
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid'].forEach(k=>{
      const val = p.get(k);
      if(val) fields.push({name:k, value:val});
    });

    return { fields: fields.map(f=>({name:f.name, value: String(f.value||'')})), context };
  }

  async function submitDirect(fields){
    const body = JSON.stringify(buildPayload(fields));
    const res = await fetch(DIRECT_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body });
    if(!res.ok){
      const txt = await res.text();
      throw new Error('Direct submit failed: ' + res.status + ' ' + txt);
    }
  }

  async function submitViaProxy(fields){
    const payload = buildPayload(fields);
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ portalId: HUBSPOT_PORTAL_ID, formGuid: HUBSPOT_LEAD_GUID, ...payload })
    });
    if(!res.ok){
      const txt = await res.text();
      throw new Error('Proxy submit failed: ' + res.status + ' ' + txt);
    }
  }

  async function submitWithFallback(fields){
    try{
      await submitDirect(fields);
    }catch(err){
      console.warn('[LeadForm] Direct submit error, retrying via proxy:', err);
      await submitViaProxy(fields);
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
        const fields = [
          { name: 'name',  value: (byId('leadName')?.value || '').trim() },
          { name: 'email', value: (byId('leadEmail')?.value || '').trim() },
          { name: 'phone', value: (byId('leadPhone')?.value || '').trim() },
          { name: 'lead_purpose', value: (byId('leadPurpose')?.value || '').trim() }
        ];
        await submitWithFallback(fields);
        const qs = window.location.search || '';
        window.location.assign('/thank-you.html' + qs);
      }catch(err){
        console.error('[LeadForm] Submission error:', err);
        alert('Sorry, something went wrong. Please email info@swiftpathcapital.com or try again.');
      }finally{
        if(btn){ btn.disabled = false; btn.textContent = orig; }
      }
    }, {passive:false});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();