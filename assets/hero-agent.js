(function(){
  var cv=document.getElementById('haCanvas'); if(!cv) return;
  var ctx=cv.getContext('2d'), W=800, H=500, dpr=Math.min(window.devicePixelRatio||1,2);
  function size(){var r=cv.getBoundingClientRect(); cv.width=Math.round(r.width*dpr); cv.height=Math.round(r.width*H/W*dpr);}
  size(); window.addEventListener('resize',size);
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var GROUPS=[['Identity',-90],['Finance',-30],['Cloud',30],['Software',90],['Agents',150],['Models',210]];
  var seed=7; function rnd(){seed=(seed*16807)%2147483647; return (seed-1)/2147483646}
  var nodes=[],cx=W/2,cy=H/2;
  GROUPS.forEach(function(g,gi){
    for(var i=0;i<11;i++){
      var a=(g[1]+(rnd()-.5)*50)*Math.PI/180, r=95+rnd()*150;
      nodes.push({x:cx+Math.cos(a)*r*1.45,y:cy+Math.sin(a)*r*.92,g:gi,ang:((a*180/Math.PI)+360+90)%360,gap:false,found:0,s:1.6+rnd()*1.8});
    }
  });
  [3,17,29,41,52,60].forEach(function(i){nodes[i].gap=true; nodes[i].s=3.4});
  var DUR=16000, t0=performance.now();
  var stat={tools:document.getElementById('haTools'),gaps:document.getElementById('haGaps'),fresh:document.getElementById('haNew')};
  var log=document.getElementById('haLog');
  var LINES=[[600,'connect','identity, finance, cloud: read-only',''],[2600,'discover','61 AI tools found. 38 are on the approved list.',''],[5200,'trace','complaint-triage assistant reads customer data and decides who escalates',''],[7600,'score','regulation high, data high, reversibility low. Overall: high.','bad'],[10000,'compare','leadership believes 38 tools. The records show 61.','bad'],[12500,'propose','owner and approval gate. Waiting for a named person.','']];
  var shown=-1;
  function say(i){ if(i<=shown) return; shown=i; var l=LINES[i],p=document.createElement('p'); p.innerHTML='<b>'+l[1]+'</b><span class="'+l[3]+'">'+l[2]+'</span>'; log.appendChild(p); while(log.children.length>3) log.removeChild(log.firstChild); }
  function ease(x){return 1-Math.pow(1-x,3)}
  function frame(now){
    var t=reduce?DUR*.9:(now-t0)%DUR, loop=t/DUR;
    if(t<80&&shown>=0){shown=-1; log.innerHTML='';}
    LINES.forEach(function(l,i){ if(t>=l[0]) say(i); });
    var w=cv.width,h=cv.height,k=w/W; ctx.setTransform(k,0,0,k,0,0); ctx.clearRect(0,0,W,H);
    // rings
    ctx.lineWidth=1; [90,170,250].forEach(function(r,i){ctx.strokeStyle='rgba(217,184,106,'+(.12-i*.03)+')'; ctx.setLineDash([2,7]); ctx.beginPath(); ctx.ellipse(cx,cy,r*1.45,r*.92,0,0,7); ctx.stroke();}); ctx.setLineDash([]);
    var sweep=Math.min(1,t/6500), ang=sweep*360, count=0, gaps=0;
    nodes.forEach(function(n){ var f=t>1000&&ang>=n.ang?1:0; n.found+=((f)-n.found)*.12; if(f&&n.found>.5){count++; if(n.gap&&t>7000) gaps++;} });
    // edges
    nodes.forEach(function(n){ if(n.found<.05) return; var gapOn=n.gap&&t>7000;
      ctx.strokeStyle=gapOn?'rgba(255,155,138,'+(.35*n.found)+')':'rgba(217,184,106,'+(.13*n.found)+')'; ctx.lineWidth=gapOn?1.2:.7;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+(n.x-cx)*n.found,cy+(n.y-cy)*n.found); ctx.stroke(); });
    // sweep beam
    if(t>1000&&t<7000){ var a=(ang-90)*Math.PI/180; var g=ctx.createLinearGradient(cx,cy,cx+Math.cos(a)*330,cy+Math.sin(a)*210); g.addColorStop(0,'rgba(217,184,106,.55)'); g.addColorStop(1,'rgba(217,184,106,0)'); ctx.strokeStyle=g; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(a)*400,cy+Math.sin(a)*255); ctx.stroke(); }
    // nodes
    nodes.forEach(function(n){ var gapOn=n.gap&&t>7000, pulse=gapOn?(1+.5*Math.sin(now/260)):1;
      ctx.beginPath(); ctx.arc(n.x,n.y,n.s*pulse*(.6+.4*n.found),0,7);
      ctx.fillStyle=gapOn?'#ff9b8a':(n.found>.3?'rgba(236,205,130,'+(.5+.5*n.found)+')':'rgba(237,241,245,.18)'); ctx.fill();
      if(gapOn){ctx.strokeStyle='rgba(255,155,138,.35)'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(n.x,n.y,n.s*pulse+7+3*Math.sin(now/260),0,7); ctx.stroke();} });
    // group labels
    ctx.font='600 10.5px Inter,sans-serif'; ctx.textAlign='center';
    GROUPS.forEach(function(g){ var a=g[1]*Math.PI/180; ctx.fillStyle='rgba(237,241,245,.55)'; ctx.fillText(g[0].toUpperCase(),cx+Math.cos(a)*330*1.0,cy+Math.sin(a)*205+4); });
    // core
    var cr=26+(reduce?0:3*Math.sin(now/500)); var cg=ctx.createRadialGradient(cx,cy,2,cx,cy,cr*2.4); cg.addColorStop(0,'rgba(217,184,106,.5)'); cg.addColorStop(1,'rgba(217,184,106,0)'); ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(cx,cy,cr*2.4,0,7); ctx.fill();
    ctx.fillStyle='#d9b86a'; ctx.beginPath(); ctx.arc(cx,cy,cr,0,7); ctx.fill();
    ctx.fillStyle='#0e1b2c'; ctx.font='700 11px Inter,sans-serif'; ctx.fillText('AGENT',cx,cy+4);
    // callout
    if(t>8000&&t<13800){ var o=Math.min(1,(t-8000)/500)*(t>13000?Math.max(0,(13800-t)/800):1); ctx.globalAlpha=o; var gx=nodes[29].x,gy=nodes[29].y; ctx.strokeStyle='rgba(255,155,138,.6)'; ctx.lineWidth=1; ctx.beginPath(); var d=gx>W-300?-1:1; ctx.moveTo(gx,gy); ctx.lineTo(gx+26*d,gy-34); ctx.lineTo(gx+90*d,gy-34); ctx.stroke(); var bx=d>0?gx+92:gx-244; ctx.fillStyle='rgba(255,155,138,.15)'; ctx.fillRect(bx,gy-48,152,28); ctx.strokeRect(bx,gy-48,152,28); ctx.fillStyle='#ffd2c8'; ctx.textAlign='left'; ctx.font='600 11px Inter,sans-serif'; ctx.fillText('Complaint triage: no owner',bx+8,gy-30); ctx.globalAlpha=1; ctx.textAlign='center'; }
    stat.tools.textContent=Math.round(ease(Math.min(1,Math.max(0,(t-1000)/5500)))*61);
    stat.gaps.textContent=t>7000?Math.min(23,Math.round((t-7000)/180)):0;
    stat.fresh.textContent=t>10000?4:0;
    if(!reduce) requestAnimationFrame(frame);
  }
  if(reduce){ frame(performance.now()); } else requestAnimationFrame(frame);
})();
