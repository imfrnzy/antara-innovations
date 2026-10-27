(function(){
'use strict';
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
/* reveal for page-specific elements */
var els=[].slice.call(document.querySelectorAll('.writ,.quote,.aw'));
if('IntersectionObserver' in window&&!reduce){
  var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.35});
  els.forEach(function(e){io.observe(e)});
}else els.forEach(function(e){e.classList.add('in')});
/* Pulse day: progress rail + beat per row */
var day=document.querySelector('.day');
if(day){
  var rows=[].slice.call(day.querySelectorAll('.dr'));
  function upd(){
    var r=day.getBoundingClientRect(),vh=window.innerHeight,line=vh*.62;
    var p=(line-r.top)/r.height; p=Math.max(0,Math.min(1,p)); day.style.setProperty('--p',p.toFixed(4));
    rows.forEach(function(row){var rr=row.getBoundingClientRect();row.classList.toggle('on',rr.top<line)});
  }
  if(reduce){rows.forEach(function(r){r.classList.add('on')});day.style.setProperty('--p',1)}
  else{window.addEventListener('scroll',upd,{passive:true});window.addEventListener('resize',upd);upd()}
}
})();
/* count-up for result numbers */
(function(){
var els=[].slice.call(document.querySelectorAll('.cnt'));if(!els.length)return;
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function run(el){var to=+el.dataset.to,pre=el.dataset.pre||'',suf=el.dataset.suf||'',t0=null,d=1300;
  function f(t){if(!t0)t0=t;var p=Math.min(1,(t-t0)/d),e=1-Math.pow(1-p,3);el.textContent=pre+Math.round(to*e)+suf;if(p<1)requestAnimationFrame(f)}requestAnimationFrame(f)}
if(reduce||!('IntersectionObserver' in window))return;
var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){run(e.target);io.unobserve(e.target)}})},{threshold:.6});
els.forEach(function(e){e.textContent=(e.dataset.pre||'')+'0'+(e.dataset.suf||'');io.observe(e)});
})();
