(function(){ 
  const HS_ENDPOINT = "https://api.hsforms.com/submissions/v3/integration/submit";
  function getCookie(name){ const m = document.cookie.match('(^|;)\s*'+name+'\s*=\s*([^;]+)'); return m ? m.pop() : ""; }
  function readUTM(){ const p=new URLSearchParams(location.search); const keys=['utm_source','utm_medium','utm_campaign','utm_term','utm_content']; const out={}; keys.forEach(k=>out[k]=p.get(k)||''); return out; }
  async function submitToHubSpot(formGuid, fields, redirectUrl){ 
    const utm=readUTM(); const nowFields=Object.entries(utm).map(([name,value])=>({name,value}));
    const payload={ fields: fields.concat(nowFields), context: { hutk:getCookie('hubspotutk'), pageUri:location.href, pageName:document.title } };
    const url=[HS_ENDPOINT, window.HUBSPOT_PORTAL_ID, formGuid].join('/');
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!res.ok){ throw new Error('HubSpot error '+res.status+' '+await res.text()); }
    if(redirectUrl) window.location.href=redirectUrl;
  }
  window.__swiftpathHS={ submitToHubSpot };
})();