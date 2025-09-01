// assets/loanapp-submit.js
(function(){
  const HUBSPOT_PORTAL_ID = "243569048";
  const HUBSPOT_LOAN_GUID = "6648e233-6873-4546-a9cf-b20d66ff4e8e";
  const THANK_YOU_URL = "/thank-you.html";

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
  function getCookie(name){
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function normalizeFields(fields){
    const out=[], full = (byId('fullName')?.value||'').trim();
    for(const f of fields){ if(f && f.value!=null) out.push({name:f.name, value:''+f.value}); }
    if(full){
      const parts = full.split(/\s+/); const first = parts.shift()||''; const last = parts.join(' ');
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
          alert('Please agree to Terms & Privacy.');
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

        const url = `https://api.hsforms.com/submissions/v3/integration/submit/${HUBSPOT_PORTAL_ID}/${HUBSPOT_LOAN_GUID}`;
        const context = { pageUri: window.location.href, pageName: document.title };
        const hutk = getCookie('hubspotutk'); if(hutk) context.hutk = hutk;

        const res = await fetch(url, {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ fields, context })
        });
        if(!res.ok){
          const txt = await res.text();
          throw new Error('HubSpot returned ' + res.status + ': ' + txt);
        }
        const qs = window.location.search || '';
        window.location.assign(THANK_YOU_URL + qs);
      } catch(err){
        console.error('Submission error:', err);
        alert('There was a problem submitting. Please try again or email info@swiftpathcapital.com.');
        if(btn){ btn.disabled=false; btn.textContent=orig; }
      }
    }, {passive:false});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();