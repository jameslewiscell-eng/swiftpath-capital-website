// assets/phone-verify-ui.js
// SMS verification UI for Twilio Verify.
// Exposes window.__phoneVerified() for submit handlers.
// Features: resend countdown, inline status messages, accessibility.
(function(){
  'use strict';

  function $(id){ return document.getElementById(id); }

  var phoneEl   = $('leadPhone') || $('phone') || document.querySelector('input[type="tel"]');
  var sendBtn   = $('sendCodeBtn');
  var checkBtn  = $('checkCodeBtn');
  var otpWrap   = $('otpWrap');
  var otpCode   = $('otpCode');
  var vStatus   = $('vStatus');
  var verified  = false;
  var cooldown  = 0;
  var cooldownTimer = null;

  window.__phoneVerified = function(){ return verified; };

  function normalizePhone(v){
    v = (v || '').replace(/[^\d+]/g, '');
    if (!v.startsWith('+')) v = '+1' + v;
    return v;
  }

  function setStatus(msg, type){
    if (!vStatus) return;
    vStatus.textContent = msg;
    vStatus.className = 'text-xs mt-1 block';
    if (type === 'success') {
      vStatus.classList.add('text-green-300', 'font-semibold');
    } else if (type === 'error') {
      vStatus.classList.add('text-red-300');
    } else {
      vStatus.classList.add('text-blue-100/90');
    }
    // For LoanApp page (different color scheme)
    if (document.getElementById('loanForm')) {
      vStatus.className = 'text-xs mt-1 block';
      if (type === 'success') {
        vStatus.classList.add('text-green-600', 'font-semibold');
      } else if (type === 'error') {
        vStatus.classList.add('text-red-600');
      } else {
        vStatus.classList.add('text-slate-600');
      }
    }
  }

  function startCooldown(seconds){
    cooldown = seconds;
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    function tick(){
      if (cooldown <= 0) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
        if (sendBtn) {
          sendBtn.textContent = 'Resend code';
          sendBtn.disabled = false;
          sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
        return;
      }
      if (sendBtn) sendBtn.textContent = 'Resend (' + cooldown + 's)';
      cooldown--;
    }
    tick();
    cooldownTimer = setInterval(tick, 1000);
  }

  async function startVerify(){
    verified = false;
    setStatus('', '');
    if (otpWrap) {
      otpWrap.style.display = 'inline-block';
      otpWrap.removeAttribute('aria-hidden');
    }

    var phone = normalizePhone(phoneEl && phoneEl.value);
    if (!/^\+\d{8,15}$/.test(phone)) {
      setStatus('Enter a valid phone number (e.g. 321-430-4434).', 'error');
      if (phoneEl) phoneEl.focus();
      return;
    }

    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
    }

    try {
      var res = await fetch('/.netlify/functions/twilio-start-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone })
      });

      if (res.ok) {
        setStatus('Code sent via SMS. Check your phone.', 'success');
        startCooldown(60);
        if (otpCode) otpCode.focus();
      } else if (res.status === 429) {
        setStatus('Too many requests. Please wait a minute and try again.', 'error');
        startCooldown(60);
      } else {
        var data = {};
        try { data = await res.json(); } catch(e){}
        setStatus(data.error || 'Could not send code. Please try again.', 'error');
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.textContent = 'Resend code';
        }
      }
    } catch(e) {
      setStatus('Network error. Please check your connection.', 'error');
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Resend code';
      }
    }
  }

  async function checkVerify(){
    var phone = normalizePhone(phoneEl && phoneEl.value);
    var code  = (otpCode && otpCode.value || '').trim();
    if (!code) {
      setStatus('Enter the verification code.', 'error');
      if (otpCode) otpCode.focus();
      return;
    }

    if (checkBtn) {
      checkBtn.disabled = true;
      checkBtn.textContent = 'Checking...';
    }

    try {
      var res = await fetch('/.netlify/functions/twilio-check-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone, code: code })
      });

      var data = {};
      try { data = await res.json(); } catch(e){}

      verified = data.ok === true;

      if (verified) {
        setStatus('Phone verified successfully.', 'success');
        // Disable inputs to prevent re-verification
        if (otpCode) otpCode.disabled = true;
        if (checkBtn) { checkBtn.textContent = 'Verified'; checkBtn.disabled = true; }
        if (sendBtn) { sendBtn.style.display = 'none'; }
        if (phoneEl) phoneEl.readOnly = true;
        // Clear cooldown
        if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
      } else if (res.status === 410) {
        setStatus(data.error || 'Code expired. Please request a new one.', 'error');
        if (checkBtn) { checkBtn.disabled = false; checkBtn.textContent = 'Verify'; }
        // Reset cooldown so they can resend
        if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
        if (sendBtn) {
          sendBtn.textContent = 'Resend code';
          sendBtn.disabled = false;
          sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
      } else {
        setStatus(data.error || 'Invalid code. Please try again.', 'error');
        if (checkBtn) { checkBtn.disabled = false; checkBtn.textContent = 'Verify'; }
        if (otpCode) { otpCode.value = ''; otpCode.focus(); }
      }
    } catch(e) {
      setStatus('Network error. Please try again.', 'error');
      if (checkBtn) { checkBtn.disabled = false; checkBtn.textContent = 'Verify'; }
    }
  }

  if (sendBtn) {
    sendBtn.setAttribute('aria-label', 'Send SMS verification code');
    sendBtn.addEventListener('click', startVerify);
  }
  if (checkBtn) {
    checkBtn.setAttribute('aria-label', 'Verify SMS code');
    checkBtn.addEventListener('click', checkVerify);
  }
  if (vStatus) {
    vStatus.setAttribute('aria-live', 'polite');
    vStatus.setAttribute('role', 'status');
  }
  if (otpWrap) {
    otpWrap.setAttribute('aria-hidden', 'true');
  }
})();
