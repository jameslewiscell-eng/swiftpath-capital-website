
(function(){
  if (typeof window === 'undefined') return;
  function animate(el){
    var target = Number(el.getAttribute('data-target') || el.textContent || '0');
    var duration = Number(el.getAttribute('data-duration') || 1500);
    var start = 0;
    var startTime = null;
    function frame(ts){
      if (!startTime) startTime = ts;
      var p = Math.min((ts - startTime) / duration, 1);
      var val = Math.floor(start + (target - start) * p);
      if (el.dataset.prefix) {
        el.textContent = el.dataset.prefix + val.toLocaleString();
      } else if (el.dataset.suffix) {
        el.textContent = val.toLocaleString() + el.dataset.suffix;
      } else {
        el.textContent = val.toLocaleString();
      }
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function init(){
    var els = document.querySelectorAll('[data-counter]');
    if (!('IntersectionObserver' in window)){
      els.forEach(animate);
      return;
    }
    var io = new IntersectionObserver(function(entries, obs){
      entries.forEach(function(entry){
        if (entry.isIntersecting){
          animate(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, {threshold: 0.4});
    els.forEach(function(el){ io.observe(el); });
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive'){
    setTimeout(init, 0);
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
