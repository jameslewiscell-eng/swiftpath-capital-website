// assets/verify-gatekeeper.js
// Harden form gating: block any submission unless phone has been SMS-verified.
// Uses inline error messages instead of alert().
// Only activates on pages that include the SMS verification UI (sendCodeBtn).
(function(){
  'use strict';

  // Don't activate gating if SMS verification UI is not present on this page
  if (!document.getElementById('sendCodeBtn')) return;

  var MSG = 'Please verify your phone number via SMS before submitting.';

  function isVerified(){
    try { return !!(window.__phoneVerified && window.__phoneVerified()); }
    catch(e){ return false; }
  }

  function markVerifyUiNeeded(){
    var sendBtn = document.getElementById('sendCodeBtn');
    var otpCode = document.getElementById('otpCode');
    [sendBtn, otpCode].forEach(function(el){
      if (!el) return;
      el.classList.add('ring-2', 'ring-red-400');
    });
  }

  function clearVerifyUiNeeded(){
    var sendBtn = document.getElementById('sendCodeBtn');
    var otpCode = document.getElementById('otpCode');
    [sendBtn, otpCode].forEach(function(el){
      if (!el) return;
      el.classList.remove('ring-2', 'ring-red-400');
    });
  }

  function showGateMessage(){
    // Show inline message near the verification area
    var vStatus = document.getElementById('vStatus');
    if (vStatus) {
      vStatus.textContent = MSG;
      // Apply appropriate color based on page context
      vStatus.className = 'text-xs mt-1 block';
      if (document.getElementById('loanForm')) {
        vStatus.classList.add('text-red-600');
      } else {
        vStatus.classList.add('text-red-300');
      }
    }
    // Also show in the submitStatus banner if available (LoanApp)
    var banner = document.getElementById('submitStatus');
    if (banner) {
      banner.textContent = MSG;
      banner.className = 'mb-6 rounded-md border border-red-300 bg-red-50 text-red-800 p-4';
      banner.removeAttribute('hidden');
      banner.classList.remove('hidden');
    }
    markVerifyUiNeeded();

    // Scroll verification area into view
    var sendBtn = document.getElementById('sendCodeBtn');
    if (sendBtn) {
      sendBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function handleVerificationState(){
    if (!isVerified()) return;
    clearVerifyUiNeeded();
    var banner = document.getElementById('submitStatus');
    if (banner && banner.textContent === MSG) {
      banner.classList.add('hidden');
    }
  }

  // Event-driven verification state updates from phone-verify-ui.js
  window.addEventListener('phone-verification-state', handleVerificationState);

  // Also run once on load in case user is already verified
  handleVerificationState();

  // Capture any submit attempts and block if not verified
  function guardEvent(e){
    if (!isVerified()){
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      showGateMessage();
      return false;
    }
  }

  // Block all form submits. Native constraint validation still runs on click;
  // this gate only blocks the actual submit event if phone isn't verified.
  document.addEventListener('submit', guardEvent, true);

  // Guard programmatic submits
  try {
    var nativeSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function(){
      if (!isVerified()){
        showGateMessage();
        return;
      }
      return nativeSubmit.apply(this, arguments);
    };
  } catch(e){ /* ignore if not allowed */ }
})();
