(function(){
  var f=document.getElementById('ctForm'); if(!f) return;
  var msg=document.getElementById('ctMsg'), btn=document.getElementById('ctBtn');
  var TO='hello@antara-innovations.com';
  try{var t=new URLSearchParams(location.search).get('topic'); if(t){var s=f.elements.topic; for(var i=0;i<s.options.length;i++){if(s.options[i].value.toLowerCase()===t.toLowerCase()){s.selectedIndex=i;break;}}}}catch(e){}
  function show(cls,html){msg.className='ct-msg '+cls; msg.innerHTML=html;}
  function fallback(d){
    var body=encodeURIComponent((d.message||'')+'\n\n'+(d.name||'')+(d.organisation?', '+d.organisation:'')+'\n'+(d.email||''));
    return '<a href="mailto:'+TO+'?subject='+encodeURIComponent('['+d.topic+'] from '+d.name)+'&body='+body+'">email us directly</a>';
  }
  f.addEventListener('submit',function(e){
    e.preventDefault();
    if(f.elements._gotcha.value) return;
    if(!f.checkValidity()){f.reportValidity();return;}
    var d={name:f.elements.name.value.trim(),email:f.elements.email.value.trim(),organisation:f.elements.organisation.value.trim(),topic:f.elements.topic.value,message:f.elements.message.value.trim()};
    btn.disabled=true; btn.textContent='Sending…'; msg.className='ct-msg';
    var ctl=('AbortController' in window)?new AbortController():null; var to=setTimeout(function(){ctl&&ctl.abort();},15000);
    fetch('https://formsubmit.co/ajax/'+TO,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({name:d.name,email:d.email,organisation:d.organisation||'-',topic:d.topic,message:d.message,_subject:'Website enquiry: '+d.topic+' ('+d.name+')',_replyto:d.email,_template:'table',_captcha:'false'}),signal:ctl?ctl.signal:undefined})
    .then(function(r){return r.json().catch(function(){return {};}).then(function(j){return {ok:r.ok,j:j};});})
    .then(function(x){
      clearTimeout(to);
      if(x.ok && String(x.j.success)!=='false'){f.reset();show('ok','Thank you. Your message is on its way to the team and you will hear back from us by email.');}
      else{show('err','That did not go through. Please '+fallback(d)+' instead, your message is ready in it.');}
    })
    .catch(function(){clearTimeout(to);show('err','That did not go through. Please '+fallback(d)+' instead, your message is ready in it.');})
    .then(function(){btn.disabled=false;btn.textContent='Send message';});
  });
})();
