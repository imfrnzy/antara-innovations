/* Antara tool pages: light by default, dark if the visitor chose it on any page.
   Uses the same "antara-theme" key as the main pages (assets/a3.js), so the choice follows them around.
   Runs in <head> so the right colours are there before the page paints. */
(function(){
  var d=document.documentElement, KEY='antara-theme', saved=null, inFrame=false;
  try{saved=localStorage.getItem(KEY)}catch(e){}
  try{inFrame=window.self!==window.top}catch(e){inFrame=true}
  /* inside the tour's assessment window the tour is dark, so stay dark there */
  d.setAttribute('data-theme', inFrame||saved==='dark' ? 'dark' : 'light');

  function mount(){
    var nav=document.getElementById('navLinks');
    if(!nav||document.getElementById('tg'))return;
    var b=document.createElement('button');
    b.type='button';b.className='tg';b.id='tg';b.setAttribute('aria-label','Switch light and dark theme');
    b.innerHTML='<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/></svg>'+
              '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
    b.addEventListener('click',function(){
      var next=d.getAttribute('data-theme')==='dark'?'light':'dark';
      d.setAttribute('data-theme',next);
      try{localStorage.setItem(KEY,next)}catch(e){}
      window.dispatchEvent(new Event('antara-theme'));
    });
    nav.appendChild(b);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
