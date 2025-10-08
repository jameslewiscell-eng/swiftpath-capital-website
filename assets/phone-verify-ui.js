// assets/phone-verify-ui.js
// Tiny helper to render Twilio SMS verification around a phone <input>.
// Exposes window.__phoneVerified() for your submit handlers to check.
(function(){
  function $(id){ return document.getElementById(id); }
  const phoneEl = $('leadPhone') || $('phone') || document.querySelector('input[type="tel"]');
  const sendBtn = $('sendCodeBtn');
  const checkBtn = $('checkCodeBtn');
  const otpWrap = $('otpWrap');
  const vStatus = $('vStatus');
  let verified = false;

  window.__phoneVerified = () => verified;

  function normalizePhone(v){
    v = (v||'').replace(/[^\d+]/g,'');
    if (!v.startsWith('+')) v = '+1' + v; // default to US
    return v;
  }

  async function startVerify(){
    verified = false;
    if (vStatus) vStatus.textContent = '';
    if (otpWrap) otpWrap.style.display = 'inline-block';
    const phone = normalizePhone(phoneEl && phoneEl.value);
    if (!/\+\d{8,15}$/.test(phone)) { if (vStatus) vStatus.textContent = 'Enter a valid phone'; return; }

    const res = await fetch('/.netlify/functions/twilio-start-verify', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ phone })
    });
    if (vStatus) vStatus.textContent = res.ok ? 'Code sent via SMS.' : 'Could not send code.';
  }

  async function checkVerify(){
    const phone = normalizePhone(phoneEl && phoneEl.value);
    const codeEl = $('otpCode');
    const code = (codeEl && codeEl.value || '').trim();
    if (!code) { if (vStatus) vStatus.textContent = 'Enter the code'; return; }

    const res = await fetch('/.netlify/functions/twilio-check-verify', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ phone, code })
    });
    verified = res.ok;
    if (vStatus) vStatus.textContent = verified ? 'Verified ✓' : 'Invalid code';
  }

  sendBtn && sendBtn.addEventListener('click', startVerify);
  checkBtn && checkBtn.addEventListener('click', checkVerify);
})();