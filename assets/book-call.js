(function(){
  var go=document.getElementById('bkGo'), box=document.getElementById('bkFrame');
  if(!go||!box) return;
  var URL_='https://cal.com/antarainnovations/awaken';
  function theme(){
    try{if(document.documentElement.getAttribute('data-theme')==='light') return 'light';}catch(e){}
    return 'dark';
  }
  function open(){
    if(box.firstChild) return;
    var f=document.createElement('iframe');
    f.src=URL_+'?embed=true&theme='+theme()+'&layout=month_view';
    f.title='Awaken with Antara Innovations, book a call';
    f.loading='lazy';
    f.setAttribute('allow','payment');
    box.appendChild(f);
    box.hidden=false;
    go.setAttribute('aria-expanded','true');
    go.disabled=true; go.style.opacity='.6'; go.style.cursor='default';
    setTimeout(function(){try{box.scrollIntoView({behavior:'smooth',block:'nearest'});}catch(e){}},50);
  }
  go.addEventListener('click',open);
  if(location.hash==='#book'&&/[?&]open=1/.test(location.search)) open();
})();
