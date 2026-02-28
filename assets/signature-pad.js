// assets/signature-pad.js
// Canvas-based draw-to-sign signature pad.
// Exposes window.__getSignatureDataURL() for the form handler.
(function(){
  'use strict';

  var canvas, ctx, drawing = false, hasSigned = false;
  var lastX = 0, lastY = 0;

  function init(){
    canvas = document.getElementById('signatureCanvas');
    if(!canvas) return;
    ctx = canvas.getContext('2d');

    // Make canvas responsive
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Mouse events
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);

    // Touch events
    canvas.addEventListener('touchstart', startDrawTouch, {passive:false});
    canvas.addEventListener('touchmove', drawTouch, {passive:false});
    canvas.addEventListener('touchend', stopDraw);
    canvas.addEventListener('touchcancel', stopDraw);

    // Clear button
    var clearBtn = document.getElementById('clearSignatureBtn');
    if(clearBtn) clearBtn.addEventListener('click', clearSignature);
  }

  function resizeCanvas(){
    if(!canvas) return;
    var rect = canvas.parentElement.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.min(rect.width, 560);
    canvas.style.width = w + 'px';
    canvas.style.height = '180px';
    canvas.width = w * dpr;
    canvas.height = 180 * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if(hasSigned){
      // Canvas was cleared by resize; mark as unsigned
      hasSigned = false;
      updateStatus('Signature cleared by resize. Please sign again.');
    }
  }

  function getPos(e){
    var rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e){
    drawing = true;
    var pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
    canvas.classList.add('signing');
  }

  function draw(e){
    if(!drawing) return;
    var pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastX = pos.x;
    lastY = pos.y;
    hasSigned = true;
  }

  function stopDraw(){
    drawing = false;
    canvas.classList.remove('signing');
    if(hasSigned) updateStatus('Signature captured.');
  }

  function startDrawTouch(e){
    e.preventDefault();
    var touch = e.touches[0];
    var rect = canvas.getBoundingClientRect();
    drawing = true;
    lastX = touch.clientX - rect.left;
    lastY = touch.clientY - rect.top;
    canvas.classList.add('signing');
  }

  function drawTouch(e){
    e.preventDefault();
    if(!drawing) return;
    var touch = e.touches[0];
    var rect = canvas.getBoundingClientRect();
    var x = touch.clientX - rect.left;
    var y = touch.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastX = x;
    lastY = y;
    hasSigned = true;
  }

  function clearSignature(){
    if(!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSigned = false;
    updateStatus('Signature cleared.');
  }

  function updateStatus(msg){
    var el = document.getElementById('signatureStatus');
    if(el) el.textContent = msg;
  }

  // Public API for the form handler
  window.__getSignatureDataURL = function(){
    if(!hasSigned || !canvas) return null;
    return canvas.toDataURL('image/png');
  };

  window.__hasSignature = function(){
    return hasSigned;
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
