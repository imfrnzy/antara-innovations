(function(){
  var book=document.getElementById('npSpread'); if(!book) return;
  var pages=[].slice.call(book.querySelectorAll('.np-page')), N=pages.length, dots=[].slice.call(document.querySelectorAll('.np-dots i'));
  var touch=book.querySelector('.np-touch'), idx=0, timer=null, hover=false, seen=false, busy=false;
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  function paint(){
    pages.forEach(function(p,i){p.classList.toggle('turned',i<idx);});
    dots.forEach(function(d,i){d.classList.toggle('on',i===idx);});
  }
  function swipe(){ if(!touch) return; touch.classList.remove('go'); void touch.offsetWidth; touch.classList.add('go'); }
  function turn(dir){
    var t=dir>0?idx:idx-1; if(t<0||t>=N) return;
    var p=pages[t]; p.classList.add('turning'); setTimeout(function(){p.classList.remove('turning');},1250);
    if(dir>0) swipe();
    idx+=dir; paint();
  }
  function rewind(){
    if(busy) return; busy=true;
    (function step(){ if(idx>0){turn(-1); setTimeout(step,360);} else {busy=false; schedule();} })();
  }
  function next(){ if(idx<N-1) turn(1); else rewind(); }
  function schedule(){ clearTimeout(timer); if(reduce||!seen) return; timer=setTimeout(function(){ if(!hover&&!busy&&!document.hidden){next();} if(!busy) schedule(); },idx===0?4200:6800); }
  book.addEventListener('mouseenter',function(){hover=true;});
  book.addEventListener('mouseleave',function(){hover=false;});
  document.getElementById('npNext').addEventListener('click',function(){ if(busy) return; if(idx<N-1) turn(1); else rewind(); schedule(); });
  document.getElementById('npPrev').addEventListener('click',function(){ if(busy) return; turn(-1); schedule(); });
  dots.forEach(function(d,i){d.addEventListener('click',function(){ if(busy) return; var guard=0; (function go(){ if(idx===i||guard++>6) return; turn(idx<i?1:-1); setTimeout(go,380); })(); schedule(); });});
  var sx=null; book.addEventListener('touchstart',function(e){sx=e.touches[0].clientX;},{passive:true});
  book.addEventListener('touchend',function(e){ if(sx===null||busy) return; var dx=e.changedTouches[0].clientX-sx; sx=null; if(Math.abs(dx)>40){ dx<0?(idx<N-1&&turn(1)):turn(-1); schedule(); } },{passive:true});
  if('IntersectionObserver' in window){ new IntersectionObserver(function(es){ seen=es[0].isIntersecting; if(seen) schedule(); else clearTimeout(timer); },{threshold:.5}).observe(book); } else { seen=true; schedule(); }
  paint();
})();
