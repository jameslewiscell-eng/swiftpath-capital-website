// assets/verify-gatekeeper.js
// Harden form gating: block any submission unless phone has been SMS-verified.
// Uses inline error messages instead of alert().
(function(){
  'use strict';

  var MSG = 'Please verify your phone number via SMS before submitting.';

  function isVerified(){
    try { return !!(window.__phoneVerified && window.__phoneVerified()); }
    catch(e){ return false; }
  }

  function setSubmitEnabled(enabled){
    var submits = document.querySelectorAll(
      'button[type="submit"], input[type="submit"], #leadSubmit, #loanSubmit'
    );
    submits.forEach(function(el){
      if (enabled) {
        el.removeAttribute('disabled');
        el.classList.remove('opacity-50', 'pointer-events-none');
        el.setAttribute('aria-disabled', 'false');
      } else {
        el.setAttribute('disabled', 'disabled');
        el.classList.add('opacity-50', 'pointer-events-none');
        el.setAttribute('aria-disabled', 'true');
      }
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
    // Scroll verification area into view
    var sendBtn = document.getElementById('sendCodeBtn');
    if (sendBtn) {
      sendBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Initially disable until verified
  setSubmitEnabled(isVerified());

  // Watch for verification changes instead of polling
  var lastState = isVerified();
  var iv = setInterval(function(){
    var current = isVerified();
    if (current !== lastState) {
      lastState = current;
      setSubmitEnabled(current);
      // Clear gate message when verified
      if (current) {
        var banner = document.getElementById('submitStatus');
        if (banner && banner.textContent === MSG) {
          banner.classList.add('hidden');
        }
      }
    }
  }, 400);

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

  // Block all form submits
  document.addEventListener('submit', guardEvent, true);

  // Block common click paths
  document.addEventListener('click', function(e){
    var el = e.target;
    if (!el) return;
    if (el.closest('button[type="submit"], input[type="submit"], #leadSubmit, #loanSubmit')){
      guardEvent(e);
    }
  }, true);

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
