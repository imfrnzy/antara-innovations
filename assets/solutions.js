(function(){
var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var T=[],RAF=0,LT=0;
var SOLN={soundings:'Soundings',sentinel:'Sentinel',keel:'Keel'};
var ROLE={soundings:'Sees what is running',sentinel:'Tests what it can cause',keel:'Governs how it is approved'};
var ORD=['soundings','sentinel','keel'];
var LAP={
 soundings:{src:['Finance and expenses','Identity and sign-in','Software estate','Cloud accounts'],log:[['discover','61 AI tools found',0],['compare','38 on the approved list. 23 are not.',1],['trace','complaint triage reads customer data',0],['score','regulation high, data high. Overall high.',1]],n:'23',c:'AI tools nobody approved',g:'Gap: complaint triage has no named owner',p:'Proposed: owner and approval gate. Waiting for a named person.'},
 keel:{src:['Use-case intake','Approval tooling','Delivery pipeline','Model register'],log:[['discover','23 use cases in flight',0],['check','14 went through intake. 9 did not.',1],['score','invoice-triage ships on its own',0],['gate','cv-screening: fallback missing',1]],n:'9',c:'use cases that skipped the gates',g:'Gap: cv-screening has no fallback',p:'Proposed: human review before launch. Waiting for sign-off.'},
 sentinel:{src:['Agent platforms','Tool servers','Permission sets','Action logs'],log:[['discover','14 agents found. 5 in no inventory.',1],['map','refund-assistant reads CRM and email',0],['test','outside input + private data + unapproved action: open',1],['verify','71% of refund actions reconstructable',0]],n:'1',c:'open attack path',g:'Path: customer email to refund, no approval',p:'Proposed: approval above a set value.'},
 halo:{src:['Anonymous team pulses','Leaders\u2019 own accounts','AI decision records','Team rhythms, opt-in'],log:[['pulse','94 of 112 answered, anonymously',0],['compare','leaders: 24h. Teams: 3 days.',1],['flag','widest gap: repair after a miss',1],['check','3 decisions with no named person',1]],n:'4',c:'points where leaders and teams disagree',g:'Widest gap: repair after a miss',p:'Next: read-out with the leaders. Totals only.'}
};

function scanStart(){
  var cv=document.getElementById('cv'); if(!cv) return; var ctx=cv.getContext('2d'),W=800,H=500,dpr=Math.min(window.devicePixelRatio||1,2);
  var r=cv.getBoundingClientRect(); cv.width=Math.round(r.width*dpr); cv.height=Math.round(r.width*H/W*dpr);
  var G=[['IDENTITY',-90],['FINANCE',-30],['CLOUD',30],['SOFTWARE',90],['AGENTS',150],['MODELS',210]],seed=7;
  function rnd(){seed=(seed*16807)%2147483647;return (seed-1)/2147483646}
  var N=[],cx=W/2,cy=H/2; G.forEach(function(g,gi){for(var i=0;i<11;i++){var a=(g[1]+(rnd()-.5)*50)*Math.PI/180,rr=95+rnd()*150;N.push({x:cx+Math.cos(a)*rr*1.45,y:cy+Math.sin(a)*rr*.92,ang:((a*180/Math.PI)+450)%360,gap:false,f:0,s:1.6+rnd()*1.8})}});
  [3,17,29,41,52,60].forEach(function(i){N[i].gap=true;N[i].s=3.4});
  var DUR=16000,t0=performance.now(),LN=[[600,'connect','identity, finance, cloud: read-only',''],[2600,'discover','61 AI tools found. 38 are on the approved list.',''],[5200,'trace','complaint triage reads customer data and decides who escalates',''],[7600,'score','regulation high, data high, reversibility low. Overall: high.','bad'],[10000,'compare','leadership believes 38 tools. Records show 61.','bad'],[12500,'propose','owner and approval gate. Waiting for a named person.','']],shown=-1,lg=document.getElementById('lg');
  function say(i){if(i<=shown)return;shown=i;var l=LN[i],p=document.createElement('p');p.innerHTML='<b>'+l[1]+'</b><span class="'+l[3]+'">'+l[2]+'</span>';lg.appendChild(p);while(lg.children.length>3)lg.removeChild(lg.firstChild)}
  function fr(now){
    var t=(now-t0)%DUR; if(t<80&&shown>=0){shown=-1;lg.innerHTML=''} LN.forEach(function(l,i){if(t>=l[0])say(i)});
    var k=cv.width/W; ctx.setTransform(k,0,0,k,0,0); ctx.clearRect(0,0,W,H);
    [90,170,250].forEach(function(rr,i){ctx.strokeStyle='rgba(255,176,58,'+(.12-i*.03)+')';ctx.setLineDash([2,7]);ctx.beginPath();ctx.ellipse(cx,cy,rr*1.45,rr*.92,0,0,7);ctx.stroke()});ctx.setLineDash([]);
    var ang=Math.min(1,t/6500)*360; N.forEach(function(n){var f=t>1000&&ang>=n.ang?1:0;n.f+=(f-n.f)*.12});
    N.forEach(function(n){if(n.f<.05)return;var go=n.gap&&t>7000;ctx.strokeStyle=go?'rgba(255,155,138,'+(.35*n.f)+')':'rgba(255,176,58,'+(.13*n.f)+')';ctx.lineWidth=go?1.2:.7;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+(n.x-cx)*n.f,cy+(n.y-cy)*n.f);ctx.stroke()});
    if(t>1000&&t<7000){var a=(ang-90)*Math.PI/180,g=ctx.createLinearGradient(cx,cy,cx+Math.cos(a)*330,cy+Math.sin(a)*210);g.addColorStop(0,'rgba(255,176,58,.55)');g.addColorStop(1,'rgba(255,176,58,0)');ctx.strokeStyle=g;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*400,cy+Math.sin(a)*255);ctx.stroke()}
    N.forEach(function(n){var go=n.gap&&t>7000,pu=go?(1+.5*Math.sin(now/260)):1;ctx.beginPath();ctx.arc(n.x,n.y,n.s*pu*(.6+.4*n.f),0,7);ctx.fillStyle=go?'#ff9b8a':(n.f>.3?'rgba(236,205,130,'+(.5+.5*n.f)+')':'rgba(228,236,232,.18)');ctx.fill();if(go){ctx.strokeStyle='rgba(255,155,138,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(n.x,n.y,n.s*pu+7+3*Math.sin(now/260),0,7);ctx.stroke()}});
    ctx.font='600 10.5px Inter,sans-serif';ctx.textAlign='center';G.forEach(function(g){var a=g[1]*Math.PI/180;ctx.fillStyle='rgba(228,236,232,.55)';ctx.fillText(g[0],cx+Math.cos(a)*330,cy+Math.sin(a)*205+4)});
    var cr=26+3*Math.sin(now/500),cg=ctx.createRadialGradient(cx,cy,2,cx,cy,cr*2.4);cg.addColorStop(0,'rgba(255,176,58,.5)');cg.addColorStop(1,'rgba(255,176,58,0)');ctx.fillStyle=cg;ctx.beginPath();ctx.arc(cx,cy,cr*2.4,0,7);ctx.fill();ctx.fillStyle='#ffb03a';ctx.beginPath();ctx.arc(cx,cy,cr,0,7);ctx.fill();ctx.fillStyle='#0e1b2c';ctx.font='700 11px Inter,sans-serif';ctx.fillText('AGENT',cx,cy+4);
    document.getElementById('s1').textContent=Math.round((1-Math.pow(1-Math.min(1,Math.max(0,(t-1000)/5500)),3))*61);
    document.getElementById('s2').textContent=t>7000?Math.min(23,Math.round((t-7000)/180)):0; document.getElementById('s3').textContent=t>10000?4:0;
    RAF=requestAnimationFrame(fr);
  }
  RAF=requestAnimationFrame(fr);
}

var RPT={soundings:['AI inventory','23 AI tools nobody approved','Gap: complaint triage has no named owner','Proposed: owner and approval gate'],sentinel:['Attack-path report','1 open attack path','Customer email to refund, no approval','Proposed: approval above a set value'],keel:['Gate report','9 use cases skipped the gates','cv-screening has no fallback','Proposed: human review before launch']};
var RUN=0;
function lap2Cycle(){
  RUN++; var ck=document.getElementById('lclock'); if(ck)ck.textContent='Cycle '+RUN;
  ORD.forEach(function(k,i){
    var w=document.getElementById('aw'+i),r=document.getElementById('rp'+i); if(!w)return;
    var al=w.querySelector('.al'),pb=w.querySelector('.pb u'),st=w.querySelector('em'),d=LAP[k],t0=i*1600;
    w.classList.remove('on','done'); al.innerHTML=''; pb.style.transition='none'; pb.style.width='0'; st.textContent='standing by';
    r.innerHTML='<div class="rw">Report from '+SOLN[k]+' appears here</div>'; r.classList.remove('in');
    T.push(setTimeout(function(){w.classList.add('on'); st.textContent='reading'; pb.style.transition='width 7.2s linear'; pb.style.width='100%'},t0+200));
    d.src.forEach(function(x,j){T.push(setTimeout(function(){al.insertAdjacentHTML('beforeend','<p class="rd"><b>read</b>'+x+'</p>'); trim(al)},t0+500+j*450))});
    T.push(setTimeout(function(){st.textContent='investigating'},t0+2500));
    d.log.forEach(function(x,j){T.push(setTimeout(function(){al.insertAdjacentHTML('beforeend','<p><b>'+x[0]+'</b><span class="'+(x[1]&&x[2]?'bad':'')+'">'+x[1]+'</span></p>'); trim(al)},t0+2700+j*1050))});
    T.push(setTimeout(function(){st.textContent='report ready'; w.classList.add('done'); var q=RPT[k]; r.innerHTML='<div class="rh"><b>'+q[0]+'</b><span>'+SOLN[k]+'</span></div><div class="rn">'+d.n+'</div><div class="rc">'+d.c+'</div><div class="rg">'+q[2]+'</div><div class="rpp">'+q[3]+'</div><div class="ra"><i></i>Awaiting a named approver</div>'; r.classList.add('in')},t0+7200));
  });
}
function trim(al){while(al.children.length>5)al.removeChild(al.firstChild)}
function lapStart(){if(!document.getElementById('aw0'))return;RUN=0;T.forEach(clearTimeout);T=[];lap2Cycle();LT=setInterval(function(){T.forEach(clearTimeout);T=[];lap2Cycle()},17500)}
function lapReset(){lapStart()}

function boot(){
  if(document.getElementById('cv')) scanStart();
  if(document.getElementById('aw0')) lapStart();
  var tb=document.getElementById('sxt'),pk=document.getElementById('pack');
  var PK={uk:['United Kingdom','FCA and PRA expectations, SM&CR, Consumer Duty, UK GDPR.'],eu:['European Union','The EU AI Act risk classes, GDPR and DORA where they apply.']};
  if(tb&&pk){tb.addEventListener('click',function(e){var b=e.target.closest('button[data-sx]');if(!b)return;tb.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',x===b)});var p=PK[b.dataset.sx];pk.innerHTML='<b>'+p[0]+'.</b> '+p[1]})}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
