
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-MC0NC3VFNR');

;

    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'AW-17093021602');
  
;

;

(function(){
  const MAX_FILE_MB = 25;
  const BYTE_LIMIT = MAX_FILE_MB * 1024 * 1024;
  const allowedTypes = {
    purchaseContractFile: ['application/pdf', 'image/',], // image/*
    rehabBudgetFile: ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'image/'],
    compsFile: ['application/pdf', 'image/']
  };

  function qs(id){ return document.getElementById(id); }
  function addError(el, msg){
    if(!el) return;
    el.classList.add('border-red-500', 'ring-1', 'ring-red-300');
    let p = document.getElementById('err-' + el.id);
    if(!p){
      p = document.createElement('p');
      p.id = 'err-' + el.id;
      p.className = 'mt-1 text-sm text-red-600';
      el.insertAdjacentElement('afterend', p);
    }
    p.textContent = msg;
  }
  function clearError(el){
    if(!el) return;
    el.classList.remove('border-red-500','ring-1','ring-red-300');
    const p = document.getElementById('err-' + el.id);
    if(p) p.remove();
  }

  function getParam(name){ return new URLSearchParams(window.location.search).get(name) || ''; }
  function captureAttribution(){
    const map = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid'];
    map.forEach(k => { const v = getParam(k); const el = qs(k); if(el) el.value = v; });
  }
  captureAttribution();

  function validateFiles(errors){
    const pairs = [
      ['purchaseContractFile','PDF or image (max 25MB)'],
      ['rehabBudgetFile','PDF, spreadsheet, CSV, or image (max 25MB)'],
      ['compsFile','PDF or image (max 25MB)']
    ];
    for(const [id, help] of pairs){
      const el = qs(id);
      clearError(el);
      if(!el || !el.files || !el.files[0]) continue;
      const f = el.files[0];
      if(f.size > BYTE_LIMIT){
        errors.push(`${id.replace(/File$/, '').replace(/([A-Z])/g,' $1').trim()}: file exceeds ${MAX_FILE_MB}MB`);
        addError(el, `Too large. Please upload a file under ${MAX_FILE_MB} MB.`);
        continue;
      }
      const t = f.type || '';
      const allow = allowedTypes[id];
      const ok = allow && allow.some(a => a.endsWith('/') ? t.startsWith(a) : t === a);
      if(!ok){
        errors.push(`${id.replace(/File$/, '').replace(/([A-Z])/g,' $1').trim()}: unsupported type. Allowed: ${help}`);
        addError(el, `Unsupported type. Allowed: ${help}.`);
      }
    }
  }

  function onlyDigits(str){ return (str || '').replace(/\D+/g,''); }
  function normalizeCurrencyForSubmit(str){
    const clean = (str || '').replace(/[^0-9.]/g, '');
    const parts = clean.split('.');
    if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('');
    return clean;
  }
  function validateRequired(errors, id, label){
    const el = qs(id);
    clearError(el);
    if(!el || !el.value || !el.value.trim()){
      errors.push(`${label} is required.`);
      addError(el, `${label} is required.`);
      return false;
    }
    return true;
  }
  function validateEmail(errors){
    const el = qs('email');
    clearError(el);
    const v = (el.value||'').trim();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    if(!ok){
      errors.push('Please enter a valid email.');
      addError(el, 'Please enter a valid email.');
    }
  }
  function validatePhone(errors){
    const el = qs('phone');
    clearError(el);
    const d = onlyDigits(el.value);
    if(d.length < 10){
      errors.push('Please enter a valid phone number.');
      addError(el, 'Please enter a valid phone number.');
    }
  }
  function validateMoney(errors, id, label){
    const el = qs(id);
    clearError(el);
    const num = parseFloat(normalizeCurrencyForSubmit(el.value));
    if(!isFinite(num) || num <= 0){
      errors.push(`${label} must be a positive number.`);
      addError(el, `${label} must be a positive number.`);
    }
  }

  const form = qs('loanForm');
  const errorsBox = qs('formErrors');
  const errorsList = qs('formErrorsList');

  if(form){
    // Guard against Enter key double-submit
    form.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' && e.target.tagName.toLowerCase() !== 'textarea'){
        e.preventDefault();
      }
    });

    // Run validation BEFORE your existing submit listener (capture phase)
    form.addEventListener('submit', (e)=>{
      const errors = [];
      errorsBox.classList.add('hidden');
      errorsList.innerHTML = '';

      // Requireds
      validateRequired(errors, 'fullName', 'Full Name');
      validateRequired(errors, 'email', 'Email');
      validateRequired(errors, 'phone', 'Phone');
      validateRequired(errors, 'propertyAddress', 'Property Address');
      validateRequired(errors, 'purchasePrice', 'Purchase Price');
      validateRequired(errors, 'rehabBudget', 'Rehab / Renovation Budget');
      validateRequired(errors, 'arv', 'After Repair Value');

      // Email/Phone specifics
      validateEmail(errors);
      validatePhone(errors);

      // Money numeric checks
      validateMoney(errors, 'purchasePrice', 'Purchase Price');
      validateMoney(errors, 'rehabBudget', 'Rehab / Renovation Budget');
      validateMoney(errors, 'arv', 'After Repair Value');
      const loanAmtEl = qs('loanAmount');
      if(loanAmtEl && loanAmtEl.value.trim()){
        validateMoney(errors, 'loanAmount', 'Requested Loan Amount');
      }

      // Consent checkbox
      const consent = qs('consentCheckbox');
      if(!consent || !consent.checked){
        errors.push('You must agree to the Terms & Privacy Policy.');
        addError(consent, 'Please check this box to continue.');
      } else {
        clearError(consent);
      }

      // Files
      validateFiles(errors);

      // Show errors if any
      if(errors.length){
        e.preventDefault();
        errorsList.innerHTML = errors.map(t => `<li>${t}</li>`).join('');
        errorsBox.classList.remove('hidden');
        // Scroll to first invalid field for clarity
        const firstErr = document.querySelector('.border-red-500');
        if(firstErr && typeof firstErr.scrollIntoView === 'function'){
          firstErr.scrollIntoView({behavior:'smooth', block:'center'});
        } else {
          errorsBox.scrollIntoView({behavior:'smooth', block:'start'});
        }
      }
    }, true);
  }
})();

;

(function(){
  function showStatus(type, title, details){
    var box = document.getElementById('submitStatus');
    if(!box) return;
    var base = 'mb-6 rounded-md border p-4 ';
    var cls = type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800';
    box.className = base + cls;
    box.innerHTML = '<p class="font-semibold">'+ (title||'') +'</p>' + (details ? '<pre class="mt-2 whitespace-pre-wrap text-xs opacity-80">'+details+'</pre>' : '');
    box.classList.remove('hidden');
    // keep the status box in view
    try { box.scrollIntoView({behavior:'smooth', block:'start'}); } catch(_){}
  }
  window.__swiftpathStatus = { showStatus };
})();

;

async function uploadFile(inputId, dealName) {
  const el = document.getElementById(inputId);
  if (!el || !el.files || !el.files[0]) return null;
  const fd = new FormData();
  fd.append('file', el.files[0]);
  fd.append('dealName', dealName);
  const res = await fetch('/.netlify/functions/upload-to-dropbox', { method:'POST', body: fd });
  if (!res.ok) throw new Error('Upload failed: '+res.status+' '+await res.text());
  const data = await res.json();
  return data.url;
}

const loanForm = document.getElementById('loanForm');
loanForm.addEventListener('submit', async (e)=>{ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();{
  e.preventDefault();
  const btn = loanForm.querySelector('button[type="submit"]'); btn.disabled=true; btn.innerText='Uploading...';
  try {
    const dealName = (document.getElementById('fullName').value || 'applicant') + ' - ' + (document.getElementById('propertyAddress').value || 'property');
    const purchaseUrl = await uploadFile('purchaseContractFile', dealName);
    const budgetUrl = await uploadFile('rehabBudgetFile', dealName);
    const compsUrl = await uploadFile('compsFile', dealName);

    btn.innerText='Submitting...';
    const fields = [
{ name:'full_name', value: document.getElementById('fullName').value.trim() },
      { name:'email', value: document.getElementById('email').value.trim() },
      { name:'phone', value: document.getElementById('phone').value.trim() },
      { name:'mailing_address', value: document.getElementById('mailingAddress').value.trim() },
      { name:'business_name', value: document.getElementById('businessName').value.trim() },
      { name:'name', value: document.getElementById('businessName').value.trim() },},
      { name:'business_type', value: document.getElementById('businessType').value.trim() },
      { name:'number_of_completed_deals', value: document.getElementById('numDeals').value.trim() },
      { name:'entity_ein', value: document.getElementById('ein').value.trim() },
      { name:'property_address', value: document.getElementById('propertyAddress').value.trim() },
      { name:'purchase_price', value: document.getElementById('purchasePrice').value.trim() },
      { name:'rehab_budget', value: document.getElementById('rehabBudget').value.trim() },
      { name:'after_repair_value_arv', value: document.getElementById('arv').value.trim() },
      { name:'wholesaler_involved', value: document.getElementById('wholesaler').value },
      { name:'loan_purpose', value: document.getElementById('loanPurpose').value },
      { name:'requested_loan_amount', value: document.getElementById('loanAmount').value.trim() },
      { name:'timeline_to_close', value: document.getElementById('timeline').value.trim() },
      { name:'exit_strategy', value: document.getElementById('exitStrategy').value },
      { name:'loan_details_notes', value: document.getElementById('loanDetails').value.trim() },
      { name:'file_upload_link_purchase_contract', value: purchaseUrl || '' },
      { name:'file_upload_link_rehab_budget', value: budgetUrl || '' },
      { name:'file_upload_link_comps_appraisal', value: compsUrl || '' }
];
    if(!window.HUBSPOT_LOAN_GUID) throw new Error('Missing HUBSPOT_LOAN_GUID');
    await window.__swiftpathHS.submitToHubSpot(window.HUBSPOT_LOAN_GUID, fields, '/thank-you.html');
  } catch(err) { alert('There was a problem: '+err.message); }
  finally { btn.disabled=false; btn.innerText='Submit Application'; }
});


;

(function(){
  function getParam(name){
    return new URLSearchParams(window.location.search).get(name);
  }
  const product = getParam('product');
  if(!product) return;
  const map = {
    "BRRRR Method":"BRRRR",
    "Rental Properties":"Rental Property",
    "Bridge Loans":"Bridge Loan"
  };
  const normalized = map[product] || product;

  const ids = ['loanType','loanPurpose','purpose','applicationPurpose','product'];
  let select = null;
  for(const id of ids){
    const el = document.getElementById(id);
    if(el && el.tagName === 'SELECT'){ select = el; break; }
  }
  if(select){
    // try exact by text
    let opt = Array.from(select.options).find(o => o.text.trim().toLowerCase() === normalized.toLowerCase());
    if(!opt){
      // try contains
      opt = Array.from(select.options).find(o => o.text.toLowerCase().includes(normalized.toLowerCase()));
    }
    if(opt){ select.value = opt.value; select.dispatchEvent(new Event('change')); }
  }
  // set hidden mirrors if present
  ['selected_product','lead_product','loan_product'].forEach(id => {
    const h = document.getElementById(id);
    if(h) h.value = normalized;
  });
})();

;

// Require consent checkbox to submit
(function(){
  const form = document.getElementById('loanForm');
  if(!form) return;
  form.addEventListener('submit', function(e){
    const cb = document.getElementById('consentCheckbox');
    if(cb && !cb.checked){
      e.preventDefault();
      alert('Please agree to the Terms & Privacy Policy to continue.');
      cb.focus();
    }
  }, true);
})();

;

(function(){
  try {
    var KEY='spc_cookie_consent';
    var banner=document.getElementById('cookieBanner');
    var pref=localStorage.getItem(KEY);
    if(!pref){ banner.classList.remove('hidden'); }
    function set(val){ localStorage.setItem(KEY,val); banner.classList.add('hidden'); }
    document.getElementById('cookieAccept')?.addEventListener('click', function(){ set('accepted'); });
    document.getElementById('cookieDecline')?.addEventListener('click', function(){ set('declined'); });

    // Footer "Cookie Preferences" opener
    document.getElementById('open-cookie-prefs')?.addEventListener('click', function(e){
      e.preventDefault(); banner.classList.remove('hidden');
    });

    // Open privacy modal from banner if available
    document.getElementById('cookiePrivacyLink')?.addEventListener('click', function(e){
      e.preventDefault();
      if (typeof openModal==='function') { openModal('privacyModal'); }
      else { location.hash = '#privacy'; }
    });
  } catch(e){ console.warn('cookie banner error', e); }
})();

;

(function(){
  // -------- helpers
  function onlyDigits(str){ return (str || '').replace(/\D+/g,''); }
  function normalizeCurrencyForSubmit(str){
    // keep digits + dot; strip everything else (commas, $)
    const clean = (str || '').replace(/[^0-9.]/g, '');
    const parts = clean.split('.');
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('');
    }
    return clean;
  }
  function formatCurrencyForDisplay(str){
    const clean = normalizeCurrencyForSubmit(str);
    if (!clean) return '';
    const [intPart, decPart] = clean.split('.');
    const withCommas = (intPart || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
  }

  function formatPhoneForDisplay(str){
    const d = onlyDigits(str);
    if (d.length === 10) {
      return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    }
    return str;
  }
  function normalizePhoneForSubmit(str){
    const d = onlyDigits(str);
    if (d.length === 0) return '';
    if (d.length === 10) return `+1${d}`;         // assume US if 10 digits
    if (d.length > 10 && d[0] != '0') return `+${d}`; // treat as E.164 with country code
    return d;
  }

  const phone = document.getElementById('phone');
  const moneyIds = ['purchasePrice','rehabBudget','arv','loanAmount'];
  const moneyEls = moneyIds
    .map(id => document.getElementById(id))
    .filter(Boolean);

  // Currency: format on input (visual) and on blur
  moneyEls.forEach(el => {
    el.setAttribute('inputmode','decimal');
    el.addEventListener('input', () => {
      const before = el.value;
      el.value = formatCurrencyForDisplay(before);
      try { el.setSelectionRange(el.value.length, el.value.length); } catch(_) {}
    });
    el.addEventListener('blur', () => {
      el.value = formatCurrencyForDisplay(el.value);
    });
  });

  // Phone: live clean & pretty display
  if (phone) {
    phone.setAttribute('type','tel');
    phone.setAttribute('inputmode','tel');
    phone.setAttribute('pattern','^\\+?[0-9\\s\\-()]{7,20}$');
    phone.placeholder = '+1 407-374-3301';
    phone.addEventListener('input', () => {
      const raw = phone.value;
      const d = onlyDigits(raw);
      if (d.length <= 10) {
        phone.value = formatPhoneForDisplay(raw);
      } else {
        phone.value = raw.replace(/[^\d+]/g,'').replace(/(\d{3})(?=\d)/g,'$1 ');
      }
    });
    phone.addEventListener('blur', () => {
      phone.value = formatPhoneForDisplay(phone.value);
    });
  }

  // Normalize values right before your existing submit handler builds the field list
  const loanForm = document.getElementById('loanForm');
  if (loanForm) {
    loanForm.addEventListener('submit', () => {
      moneyEls.forEach(el => { el.value = normalizeCurrencyForSubmit(el.value); });
      if (phone) phone.value = normalizePhoneForSubmit(phone.value);
    }, true); // capture phase so this runs before other listeners
  }
})();

;

(function () {
  try {
    window.HUBSPOT_PORTAL_ID = "243569048";
    window.HUBSPOT_LEAD_GUID = "65717a53-a61c-4f85-ae97-8c34b85c5d83";
    window.HUBSPOT_LOAN_GUID = "6648e233-6873-4546-a9cf-b20d66ff4e8e";

    function getCookie(name){
      const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    }
    function normalizeFields(fields){
      const out = [];
      let fullName = null;
      for (const f of (fields||[])) {
        if (!f || f.value == null) continue;
        if (f.name === 'full_name' || f.name === 'name_full' || f.name === 'name') {
          fullName = (''+f.value).trim();
          continue;
        }
        out.push({ name: f.name, value: ''+f.value });
      }
      if (fullName) {
        const parts = fullName.split(/\s+/);
        const first = parts.shift() || '';
        const last = parts.join(' ');
        if (first) out.push({ name: 'firstname', value: first });
        if (last)  out.push({ name: 'lastname',  value: last });
      }
      return out;
    }

    window.__swiftpathHS = window.__swiftpathHS || {};
    window.__swiftpathHS.submitToHubSpot = async function (formGuid, fields, redirectTo) {
      const portalId = window.HUBSPOT_PORTAL_ID;
      if (!portalId) throw new Error("Missing HUBSPOT_PORTAL_ID");

      const url = `https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formGuid}`;
      const context = { pageUri: window.location.href, pageName: document.title };
      const hutk = getCookie('hubspotutk');
      if (hutk) context.hutk = hutk;

      const payload = { fields: normalizeFields(fields), context };
      // Diagnostics: payload preview masked
      try {
        function maskFields(arr){
          return (arr||[]).map(function(f){
            var n = (f && f.name ? (''+f.name).toLowerCase() : '');
            var v = (f && f.value != null ? ''+f.value : '');
            if (n.includes('email')) v = v.replace(/(^.).*(@.*$)/, '$1***$2');
            if (n.includes('phone') || n === 'tel') v = v.length > 4 ? ('***' + v.slice(-4)) : '***';
            if (n.includes('ssn') || n.includes('tax')) v = '***';
            return { name: f.name, value: v };
          });
        }
        if (window.__swiftpathStatus) {
          window.__swiftpathStatus.showStatus('success', 'Debug: Payload preview', JSON.stringify({ url, formGuid, payload: { fields: maskFields(payload.fields), context } }, null, 2));
        }
      } catch(_) {}

      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      let resultText = await res.text();
      let json = null; try { json = JSON.parse(resultText); } catch(_) {}

      try {
        if (window.__swiftpathStatus) window.__swiftpathStatus.showStatus('success', 'Debug: HubSpot response', (resultText || '[empty]').slice(0, 4000));
      } catch(_) {}

      if (!res.ok || (json && json.status && (''+json.status).toLowerCase() === 'error')) {
        var msg = 'HubSpot rejected the submission.';
        if(json && json.errors){ msg += '\n' + json.errors.map(e => (e.message || e.errorType || JSON.stringify(e))).join('\n'); }
        else { msg += '\nHTTP ' + res.status + ': ' + resultText; }
        if (window.__swiftpathStatus) window.__swiftpathStatus.showStatus('error', 'Submission failed', msg);
        throw new Error(msg);
      }

      try {
        if (window.gtag) { gtag('event', 'generate_lead'); gtag('event', 'conversion', {'send_to':'AW-17093021602/lead'}); }
      } catch(_) {}

      if (redirectTo) { try { console.log('SUCCESS (no-redirect build): would redirect to', redirectTo); } catch(_) {} }
    };
  } catch (e) { console.warn("HubSpot helper init error:", e); }
})();

;

(function(){
  function ensureStatus(){
    var box = document.getElementById('submitStatus');
    if(!box){
      box = document.createElement('div');
      box.id = 'submitStatus';
      box.className = 'mb-6 rounded-md border p-4 bg-red-50 border-red-200 text-red-700';
      var form = document.getElementById('loanForm');
      if(form) form.parentNode.insertBefore(box, form);
    }
    return box;
  }
  window.addEventListener('error', function(e){
    var box = ensureStatus();
    box.innerHTML = '<p class="font-semibold">JavaScript error</p><pre class="mt-2 whitespace-pre-wrap text-xs">'+(e.message||'error')+'</pre>';
    try { box.scrollIntoView({behavior:'smooth', block:'start'}); } catch(_){}
  });
  window.addEventListener('unhandledrejection', function(e){
    var box = ensureStatus();
    var msg = (e && e.reason) ? (e.reason.message || String(e.reason)) : 'unhandled rejection';
    box.innerHTML = '<p class="font-semibold">Unhandled promise rejection</p><pre class="mt-2 whitespace-pre-wrap text-xs">'+msg+'</pre>';
    try { box.scrollIntoView({behavior:'smooth', block:'start'}); } catch(_){}
  });
  console.log('NO-REDIRECT build active');
})();
