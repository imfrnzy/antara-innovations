/* Antara Innovations, journey scripts (a3). Every block checks its own elements, so one file serves every page.
   A dot is a person. A line is the machine. */
(function(){
"use strict";
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var clamp=function(v,a,b){a=a===undefined?0:a;b=b===undefined?1:b;return Math.min(b,Math.max(a,v))};
var smooth=function(v){return v*v*(3-2*v)};
var root=document.documentElement;

/* ---------- colour from the theme tokens ---------- */
var probe=document.createElement('canvas');probe.width=probe.height=1;var pctx=probe.getContext('2d',{willReadFrequently:true});
function tok(name){var v=getComputedStyle(root).getPropertyValue(name).trim();pctx.clearRect(0,0,1,1);pctx.fillStyle='#000';pctx.fillStyle=v;pctx.fillRect(0,0,1,1);var d=pctx.getImageData(0,0,1,1).data;return d[0]+','+d[1]+','+d[2]}
var COL={ink:'228,236,232',acc:'255,176,58',mute:'134,160,151'};
function readCols(){COL.ink=tok('--ink');COL.acc=tok('--acc');COL.mute=tok('--mute')}
readCols();

/* ---------- theme, nav, header, year ---------- */
var tg=$('#tg');
if(tg)tg.addEventListener('click',function(){
  var next=root.getAttribute('data-theme')==='light'?'dark':'light';
  root.setAttribute('data-theme',next);try{localStorage.setItem('antara-theme',next)}catch(e){}
  readCols();window.dispatchEvent(new Event('antara-theme'));
});
var burger=$('#burger'),nav=$('#nav');
if(burger&&nav){burger.addEventListener('click',function(){var o=nav.classList.toggle('open');burger.setAttribute('aria-expanded',o);burger.setAttribute('aria-label',o?'Close menu':'Open menu')});
  $$('a',nav).forEach(function(a){a.addEventListener('click',function(){nav.classList.remove('open');burger.setAttribute('aria-expanded','false')})})}
var hd=$('#hd');function hs(){if(hd)hd.classList.toggle('on',window.scrollY>24)}
window.addEventListener('scroll',hs,{passive:true});hs();
var yr=$('#yr');if(yr)yr.textContent=new Date().getFullYear();

/* ---------- reveal ---------- */
var h1=$('#h1');
requestAnimationFrame(function(){requestAnimationFrame(function(){if(h1)h1.classList.add('in')})});
var rv=$$('.rv');
if('IntersectionObserver' in window&&!reduce){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px',threshold:.08});
  rv.forEach(function(el){io.observe(el)});
}else{rv.forEach(function(el){el.classList.add('in')})}

/* ---------- doors: soft light follows the cursor, and the dot travels with you ---------- */
$$('.door').forEach(function(d){d.addEventListener('pointermove',function(e){var r=d.getBoundingClientRect();d.style.setProperty('--mx',(e.clientX-r.left)+'px');d.style.setProperty('--my',(e.clientY-r.top)+'px')})});
var headDot=$('.hd .mark .dot');
$$('[data-door]').forEach(function(a){a.addEventListener('click',function(e){
  if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button)return;
  var d=$('.hd2,.core,.pd',a);
  if(d&&headDot&&window.CSS&&CSS.supports('view-transition-name','x')){headDot.style.viewTransitionName='none';d.style.viewTransitionName='antara-dot'}
})});
window.addEventListener('pageshow',function(){if(headDot)headDot.style.viewTransitionName='';$$('[data-door] *').forEach(function(n){n.style.viewTransitionName=''})});

/* ---------- home hero: machine rails that bend toward a person ---------- */
function Rails(host,cv){
  var ctx=cv.getContext('2d'),W=0,H=0,raf=0,hx=0,hy=0,tx=0,ty=0,last=-1e9,on=false,rails=[];
  function size(){var dpr=Math.min(devicePixelRatio||1,2),r=host.getBoundingClientRect();W=r.width;H=r.height;cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    var n=Math.max(14,Math.round(H/16));rails=[];for(var i=0;i<n;i++)rails.push({y:(i+.5)*H/n,s:.25+Math.random()*.9,o:Math.random()*W});hx=tx=W*.74;hy=ty=H*.5}
  host.addEventListener('pointermove',function(e){var r=host.getBoundingClientRect();tx=e.clientX-r.left;ty=e.clientY-r.top;last=performance.now()});
  function yAt(b,x){var ax=Math.exp(-((x-hx)*(x-hx))/(2*190*190)),ay=Math.exp(-((b-hy)*(b-hy))/(2*120*120)),A=ax*ay*.78;return{y:b+(hy-b)*A,A:A}}
  function frame(now){
    if(on)raf=requestAnimationFrame(frame);var t=now/1000;
    if(now-last>2500){tx=W*.76+Math.cos(t*.28)*W*.11;ty=H*.5+Math.sin(t*.4)*H*.22}
    hx+=(tx-hx)*.07;hy+=(ty-hy)*.07;ctx.clearRect(0,0,W,H);ctx.lineWidth=1;
    for(var i=0;i<rails.length;i++){var r=rails[i],mx=0;ctx.beginPath();
      for(var x=0;x<=W;x+=8){var o=yAt(r.y,x);if(o.A>mx)mx=o.A;x?ctx.lineTo(x,o.y):ctx.moveTo(x,o.y)}
      ctx.strokeStyle=mx>.08?'rgba('+COL.acc+','+(.16+mx*.8)+')':'rgba('+COL.ink+',.17)';ctx.stroke();
      var px=((r.o+t*60*r.s)%(W+40))-20,a=yAt(r.y,px),b=yAt(r.y,px-14);
      ctx.strokeStyle=a.A>.25?'rgba('+COL.acc+',.95)':'rgba('+COL.ink+',.5)';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(px-14,b.y);ctx.lineTo(px,a.y);ctx.stroke();ctx.lineWidth=1}
    for(var k=0;k<3;k++){var pr=((t/2.6)+k/3)%1;ctx.strokeStyle='rgba('+COL.acc+','+(.45*(1-pr))+')';ctx.beginPath();ctx.arc(hx,hy,6+pr*70,0,7);ctx.stroke()}
    ctx.fillStyle='rgb('+COL.acc+')';ctx.shadowColor='rgb('+COL.acc+')';ctx.shadowBlur=18;ctx.beginPath();ctx.arc(hx,hy,5.5,0,7);ctx.fill();ctx.shadowBlur=0;
  }
  var api={start:function(){if(on)return;on=true;size();if(reduce){frame(3000);on=false;return}raf=requestAnimationFrame(frame)},stop:function(){on=false;cancelAnimationFrame(raf)},resize:function(){if(on)size()}};
  return api;
}

/* ---------- solutions hero: machine requests queue at a gate until a person approves ---------- */
function GateField(host,cv){
  var ctx=cv.getContext('2d'),W=0,H=0,raf=0,on=false,rails=[],gx=0,ap={y:0,rail:-1,dwell:0,pick:0},px=0,py=0,last=-1e9,lastT=0;
  function size(){var dpr=Math.min(devicePixelRatio||1,2),r=host.getBoundingClientRect();W=r.width;H=r.height;cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    gx=W*(W<700?.62:.72);var n=9;rails=[];for(var i=0;i<n;i++)rails.push({y:H*(.16+.68*i/(n-1)),q:[],next:Math.random()*2});ap.y=H*.5}
  host.addEventListener('pointermove',function(e){var r=host.getBoundingClientRect();px=e.clientX-r.left;py=e.clientY-r.top;last=performance.now()});
  function frame(now){
    if(on)raf=requestAnimationFrame(frame);var t=now/1000,dt=Math.min(.05,t-lastT||.016);lastT=t;
    ctx.clearRect(0,0,W,H);
    var human=now-last<2500;
    // spawn + move
    rails.forEach(function(r,i){
      r.next-=dt;if(r.next<=0&&r.q.length<6){r.q.push({x:-12,st:0,v:90+Math.random()*70});r.next=1.1+Math.random()*2.6}
      for(var k=0;k<r.q.length;k++){var p=r.q[k];
        if(p.st===0){var lim=gx-8-k*16;p.x+=p.v*dt;if(p.x>=lim){p.x=lim;p.st=1}}
        else if(p.st===2){p.x+=(160+p.v)*dt}
        else if(p.st===1){var lim2=gx-8-k*16;if(p.x<lim2-.5){p.x+=p.v*dt;if(p.x>=lim2)p.x=lim2}}}
      r.q=r.q.filter(function(p){return p.x<W+20});
    });
    // the person: follows the cursor if there is one, otherwise walks to a rail with a waiting request
    var waiting=[];rails.forEach(function(r,i){var h=r.q.filter(function(p){return p.st===1})[0];if(h)waiting.push(i)});
    if(human){var best=0,bd=1e9;rails.forEach(function(r,i){var d=Math.abs(r.y-py);if(d<bd){bd=d;best=i}});ap.rail=best;ap.y+=(py-ap.y)*.12}
    else{ap.pick-=dt;if(ap.pick<=0||ap.rail<0||waiting.indexOf(ap.rail)<0){ap.rail=waiting.length?waiting[Math.floor(Math.random()*waiting.length)]:Math.floor(Math.random()*rails.length);ap.pick=1.3}ap.y+=(rails[ap.rail].y-ap.y)*.08}
    if(ap.rail>=0&&Math.abs(ap.y-rails[ap.rail].y)<(human?26:3)){ap.dwell+=dt;if(ap.dwell>.45){var q=rails[ap.rail].q;for(var k=0;k<q.length;k++){if(q[k].st===1){q[k].st=2;break}}ap.dwell=0}}else ap.dwell=0;
    // draw rails
    ctx.lineWidth=1;rails.forEach(function(r){ctx.strokeStyle='rgba('+COL.ink+',.16)';ctx.beginPath();ctx.moveTo(0,r.y);ctx.lineTo(W,r.y);ctx.stroke()});
    // gate
    ctx.strokeStyle='rgba('+COL.ink+',.55)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(gx,H*.08);ctx.lineTo(gx,H*.92);ctx.stroke();ctx.lineWidth=1;
    rails.forEach(function(r){ctx.beginPath();ctx.moveTo(gx-5,r.y);ctx.lineTo(gx+5,r.y);ctx.stroke()});
    // requests
    rails.forEach(function(r){r.q.forEach(function(p){
      var rel=p.st===2;ctx.fillStyle=rel?'rgb('+COL.acc+')':'rgba('+COL.ink+','+(p.st===1?.85:.55)+')';
      ctx.fillRect(p.x-9,r.y-2.5,12,5);
      if(rel){ctx.fillStyle='rgba('+COL.acc+',.25)';ctx.fillRect(p.x-30,r.y-1,22,2)}})});
    // person
    var ax=gx+26;ctx.strokeStyle='rgba('+COL.acc+',.5)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(gx,ap.y);ctx.lineTo(ax,ap.y);ctx.stroke();
    var pr=(t%2)/2;ctx.strokeStyle='rgba('+COL.acc+','+(.5*(1-pr))+')';ctx.beginPath();ctx.arc(ax,ap.y,6+pr*26,0,7);ctx.stroke();
    ctx.fillStyle='rgb('+COL.acc+')';ctx.shadowColor='rgb('+COL.acc+')';ctx.shadowBlur=14;ctx.beginPath();ctx.arc(ax,ap.y,6,0,7);ctx.fill();ctx.shadowBlur=0;
  }
  return{start:function(){if(on)return;on=true;size();if(reduce){for(var i=0;i<240;i++)frame(i*16);on=false;return}raf=requestAnimationFrame(frame)},stop:function(){on=false;cancelAnimationFrame(raf)},resize:function(){if(on)size()}};
}

var heroCv=$('#rails'),gateCv=$('#gcv'),field=null;
if(heroCv)field=Rails($('#hero'),heroCv);
if(gateCv)field=GateField($('#hero'),gateCv);
if(field){
  field.start();
  var rt;window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(field.resize,200)});
  if('IntersectionObserver' in window){new IntersectionObserver(function(es){es[0].isIntersecting?field.start():field.stop()}).observe($('#hero'))}
  document.addEventListener('visibilitychange',function(){document.hidden?field.stop():field.start()});
}

/* ---------- awaken chart draws itself ---------- */
(function(){
  var svg=$('#chart');if(!svg)return;var fig=svg.parentNode,ch=$('#ch'),dt=$('#cd'),L=ch.getTotalLength();
  if(reduce||!('IntersectionObserver' in window))return;
  fig.style.setProperty('--m',0);fig.style.setProperty('--h',0);dt.setAttribute('cx',0);dt.setAttribute('cy',312);
  var seen=false;new IntersectionObserver(function(es,o){if(!es[0].isIntersecting||seen)return;seen=true;o.disconnect();var t0=performance.now();
    (function step(now){var m=clamp((now-t0)/1900),h=clamp((now-t0-700)/2600);m=smooth(m);h=smooth(h);
      fig.style.setProperty('--m',m);fig.style.setProperty('--h',h);var pt=ch.getPointAtLength(L*h);dt.setAttribute('cx',pt.x);dt.setAttribute('cy',pt.y);
      if(m<1||h<1)requestAnimationFrame(step)})(t0)},{threshold:.35}).observe(svg);
})();

/* ---------- evidence: odometer digits, and the panel that grows into place ---------- */
(function(){
  var odos=$$('.odo');
  odos.forEach(function(b){
    var pre=b.getAttribute('data-pre')||'',val=b.getAttribute('data-val'),suf=b.getAttribute('data-suf')||'';
    b.setAttribute('aria-label',(pre+(val||'')+suf).replace('&pound;','£'));
    var h='';if(pre)h+='<span class="fx" aria-hidden="true">'+pre+'</span>';
    if(val!==''&&val!==null){val.split('').forEach(function(d,i){var s='';for(var k=0;k<20;k++)s+='<span>'+(k%10)+'</span>';h+='<span class="dg" aria-hidden="true"><span class="col" style="--dl:'+(i*.14)+'s" data-d="'+d+'">'+s+'</span></span>'})}
    h+='<span class="fx" aria-hidden="true">'+suf+'</span>';b.innerHTML=h;
    if(reduce||!('IntersectionObserver' in window)){$$('.col',b).forEach(function(c){c.style.setProperty('--k',10+(+c.getAttribute('data-d')))})}
  });
  if(odos.length&&!reduce&&'IntersectionObserver' in window){
    var o=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){$$('.col',e.target).forEach(function(c){c.style.setProperty('--k',10+(+c.getAttribute('data-d')))});o.unobserve(e.target)}})},{threshold:.6});
    odos.forEach(function(b){o.observe(b)});
  }
  var rw=$('#resw');if(rw&&!reduce){var tk=false;function sc(){tk=false;var r=rw.getBoundingClientRect(),vh=innerHeight,e=clamp(1-(r.top-vh*.12)/(vh*.65));rw.style.setProperty('--e',e.toFixed(3))}
    window.addEventListener('scroll',function(){if(!tk){tk=true;requestAnimationFrame(sc)}},{passive:true});sc()}
})();

/* ---------- solutions: finding labels, radar ---------- */
(function(){
  var chips=$('#chips');if(chips){var note=$('#chipnote');
    var setc=function(b){$$('.chip',chips).forEach(function(c){c.classList.toggle('on',c===b);c.setAttribute('aria-selected',c===b)});note.textContent=b.getAttribute('data-n')};
    chips.addEventListener('click',function(e){var b=e.target.closest('.chip');if(b)setc(b)});
    chips.addEventListener('pointerover',function(e){var b=e.target.closest('.chip');if(b&&e.pointerType==='mouse')setc(b)})}
  $$('.bl').forEach(function(g){var x=+g.getAttribute('data-x'),y=+g.getAttribute('data-y');g.setAttribute('transform','translate('+x+' '+y+')');
    var a=Math.atan2(y-80,x-100)*180/Math.PI;if(a<0)a+=360;g.style.animationDelay=(a/360*6)+'s'});
})();

/* ---------- the six gates: scroll moves one AI action through the method ---------- */
(function(){
  var sec=$('#gates');if(!sec)return;
  var sticky=$('.gs-sticky',sec),svg=$('#gsSvg'),gg=$('#gsGates'),pk=$('#gsPk'),person=$('#gsPerson'),loop=$('#gsLoop'),rail=$('#gsRail');
  var steps=$$('.gs-step',sec),NS='http://www.w3.org/2000/svg';
  var G=[110,210,310,410,510,610],NAMES=['Identity','Authority','Context','Action','Evidence','Adaptation'];
  var DATA=[
    {q:'Who is acting?',s:'Flag',k:'flag',t:'claims-agent-07, running on a shared login. Nobody can say which person started it.'},
    {q:'What may it do?',s:'Held',k:'flag',t:'It may draft refunds up to £500. This one is £2,400, so it waits for approval.'},
    {q:'What does it use?',s:'Flag',k:'flag',t:'Customer notes and three internal files. One of the sources has no recorded owner.'},
    {q:'What can it cause?',s:'Approved',k:'ok',t:'A payment that cannot be recalled. The named owner for claims reviews it and approves.'},
    {q:'Can we reconstruct it?',s:'Logged',k:'ok',t:'Inputs, output and approver are written to the record, with the time.'},
    {q:'What should change?',s:'Rule sent',k:'ok',t:'Lower the limit for shared logins. The recommendation goes back to Keel and into the rules.'}
  ];
  G.forEach(function(x,i){var g=document.createElementNS(NS,'g');g.setAttribute('class','gt'+(DATA[i].k==='ok'?' ok':''));
    g.innerHTML='<line x1="'+x+'" y1="140" x2="'+x+'" y2="240"/><text x="'+x+'" y="126">0'+(i+1)+'</text><text x="'+x+'" y="262">'+NAMES[i]+'</text><circle class="mk" cx="'+x+'" cy="166" r="4"/>';gg.appendChild(g)});
  var gates=$$('.gt',gg);person.setAttribute('transform','translate('+G[3]+' 98)');
  var L=loop.getTotalLength(),pill=$('.pill',pk),pillT=$('text',pill),pillR=$('rect',pill);
  var qEl=$('#gcQ'),sEl=$('#gcS'),tEl=$('#gcT'),shown=-1,cur=0,target=0,running=false;
  function setCard(i){if(i===shown)return;shown=i;var d=DATA[i];qEl.textContent=d.q;sEl.textContent=d.s;sEl.className='chipS'+(d.k==='ok'?' ok':'');tEl.textContent=d.t;
    steps.forEach(function(s,j){s.classList.toggle('act',j===i)})}
  function paint(p){
    var q=clamp(p)*7,seg=Math.min(6,Math.floor(q)),t=q-seg;if(p>=1){seg=6;t=1}
    var x,y=190;
    if(seg<=5){var from=seg===0?32:G[seg-1],to=G[seg];x=from+(to-from)*smooth(clamp(t/.5))}
    else if(t<.2){x=G[5]+(640-G[5])*smooth(t/.2)}
    else{var f=smooth(clamp((t-.2)/.8));var pt=loop.getPointAtLength(L*f);x=pt.x;y=pt.y;svg.style.setProperty('--lp',f)}
    if(seg<6)svg.style.setProperty('--lp',0);
    pk.setAttribute('transform','translate('+x.toFixed(1)+' '+y.toFixed(1)+')');
    var step=Math.min(5,seg);setCard(step);
    gates.forEach(function(g,i){g.classList.toggle('on',i===step&&seg<=5);g.classList.toggle('done',i<seg||seg===6)});
    var held=seg===1&&t>.5;pk.classList.toggle('held',held);
    var txt='refund £2,400';if(held)txt='held for approval';else if((seg===3&&t>.5)||seg===4||seg===5)txt='approved';else if(seg===6)txt='rule sent back';
    pillT.textContent=txt;var flip=x>500;pill.setAttribute('transform','translate('+(flip?-16-128:16)+' -34)');
    person.classList.toggle('show',seg>3||(seg===3&&t>.45));
    sec.style.setProperty('--p',clamp(p).toFixed(3));
  }
  function measure(){var r=sec.getBoundingClientRect(),run=r.height-sticky.offsetHeight,top=parseFloat(getComputedStyle(sticky).top)||0;target=clamp((top-r.top)/(run>0?run:1))}
  function frame(){cur+=(target-cur)*.16;if(Math.abs(target-cur)<.0006)cur=target;paint(cur);if(cur!==target)requestAnimationFrame(frame);else running=false}
  function onScroll(){if(reduce)return;measure();if(!running){running=true;requestAnimationFrame(frame)}}
  if(reduce){sec.classList.add('static');paint(1);steps.forEach(function(s){s.classList.add('act')});return}
  window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onScroll);
  measure();cur=target;paint(cur);
})();
})();
