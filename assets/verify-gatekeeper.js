
// assets/verify-gatekeeper.js
// Harden form gating: block any submission unless phone has been SMS-verified.
// Works even if other scripts try to submit programmatically.
(function(){
  var MSG = 'Please verify your phone number via SMS before submitting.';

  function isVerified(){
    try { return !!(window.__phoneVerified && window.__phoneVerified()); }
    catch(e){ return false; }
  }

  function setSubmitEnabled(enabled){
    var submits = document.querySelectorAll('button[type="submit"], input[type="submit"], .submit, [data-submit], #leadSubmit, #loanSubmit');
    submits.forEach(function(el){
      if (enabled) {
        el.removeAttribute('disabled');
        el.classList.remove('opacity-50','pointer-events-none');
      } else {
        el.setAttribute('disabled','disabled');
        el.classList.add('opacity-50','pointer-events-none');
      }
    });
  }

  // Initially disable until we know it's verified
  setSubmitEnabled(isVerified());

  // Poll for verification changes (phone-verify-ui.js sets window.__phoneVerified)
  var iv = setInterval(function(){
    setSubmitEnabled(isVerified());
  }, 400);

  // Capture any submit attempts and block if not verified
  function guardEvent(e){
    if (!isVerified()){
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      alert(MSG);
      return false;
    }
  }

  // Block all form submits
  document.addEventListener('submit', guardEvent, true);

  // Block common click paths (buttons/links that trigger submit)
  document.addEventListener('click', function(e){
    var el = e.target;
    if (!el) return;
    if (el.closest('button[type="submit"], input[type="submit"], .submit, [data-submit], #leadSubmit, #loanSubmit')){
      guardEvent(e);
    }
  }, true);

  // Also wrap HTMLFormElement.prototype.submit to guard programmatic submits
  try {
    var nativeSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function(){
      if (!isVerified()){
        alert(MSG);
        return;
      }
      return nativeSubmit.apply(this, arguments);
    };
  } catch(e){ /* ignore if not allowed */ }
})();
