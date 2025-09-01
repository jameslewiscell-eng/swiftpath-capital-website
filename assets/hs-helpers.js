// assets/hs-helpers.js
(function(){
  const HUBSPOT_PORTAL_ID = "243569048";
  const HUBSPOT_LEAD_GUID = "65717a53-a61c-4f85-ae97-8c34b85c5d83";

  function getCookie(name){
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function submitToHubSpot(formGuid, fields, redirectTo){
    const url = `https://api.hsforms.com/submissions/v3/integration/submit/${HUBSPOT_PORTAL_ID}/${formGuid}`;
    const context = { pageUri: window.location.href, pageName: document.title };
    const hutk = getCookie('hubspotutk'); if(hutk) context.hutk = hutk;

    const p = new URLSearchParams(location.search);
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid'].forEach(k=>{
      const val = p.get(k); if(val) fields.push({name:k, value:val});
    });

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ fields: fields.map(f=>({name:f.name, value:''+f.value})), context })
    }).then(async res => {
      if(!res.ok){
        const txt = await res.text();
        throw new Error('HubSpot returned ' + res.status + ': ' + txt);
      }
      if(redirectTo){
        try { const qs = window.location.search || ""; window.location.assign(redirectTo + qs); }
        catch(_) { window.location.assign(redirectTo); }
      }
    });
  }

  window.__swiftpathHS = { submitToHubSpot };

  function byId(id){ return document.getElementById(id); }
  function attachLeadForm(){
    const form = byId('leadForm'); if(!form) return;
    form.addEventListener('submit', async function(e){
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const orig = btn ? btn.textContent : '';
      if(btn){ btn.disabled = true; btn.textContent = 'Submitting…'; }
      try{
        const fields = [
          { name: 'name', value: (byId('leadName')?.value || '').trim() },
          { name: 'email', value: (byId('leadEmail')?.value || '').trim() },
          { name: 'phone', value: (byId('leadPhone')?.value || '').trim() },
          { name: 'lead_purpose', value: (byId('leadPurpose')?.value || '').trim() }
        ];
        await submitToHubSpot(HUBSPOT_LEAD_GUID, fields, '/thank-you.html');
      }catch(err){
        console.error('Lead form error:', err);
        alert('Sorry, something went wrong. Please email info@swiftpathcapital.com or try again.');
      }finally{
        if(btn){ btn.disabled=false; btn.textContent=orig; }
      }
    }, {passive:false});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', attachLeadForm);
  else attachLeadForm();
})();