(function(){
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hero = document.querySelector('.hm-hero'), img = document.querySelector('.hm-img'), cv = document.querySelector('.hm-motes');
  /* header goes solid once scrolled */
  var hd = document.querySelector('.site-header');
  function hs(){ if(hd) hd.classList.toggle('scrolled', window.scrollY > 40); }
  window.addEventListener('scroll', hs, {passive:true}); hs();

  /* light motes drifting through the sun */
  if(cv && img && !reduce){
    var ctx = cv.getContext('2d'), W=0, H=0, dpr=1, mx=0, my=0, tx=0, ty=0, P=[], t0=performance.now(), running=true;
    var IW=685, IH=765, SX=.137, SY=.462;
    function rand(a,b){ return a + Math.random()*(b-a); }
    function size(){
      dpr = Math.min(window.devicePixelRatio||1, 2);
      var r = hero.getBoundingClientRect(); W = r.width; H = r.height;
      cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
      var n = W < 700 ? 38 : 80; P = [];
      for(var i=0;i<n;i++) P.push({x:rand(0,W), y:rand(0,H), z:rand(.2,1), r:rand(.5,2), s:rand(.12,.5), ph:rand(0,6.28), w:rand(-.15,.3)});
    }
    function sun(){
      var r = img.getBoundingClientRect(), hr = hero.getBoundingClientRect();
      var bw = img.offsetWidth, bh = img.offsetHeight, k = Math.max(bw/IW, bh/IH), w = IW*k, h = IH*k;
      var left = (hr.width - bw) + (bw-w)/2, top = (bh-h)/2;
      return { x: left + SX*w, y: top + SY*h, k:k };
    }
    hero.addEventListener('pointermove', function(e){ var r=hero.getBoundingClientRect(); tx=(e.clientX-r.left)/r.width-.5; ty=(e.clientY-r.top)/r.height-.5; });
    function frame(now){
      if(!running){ return; }
      mx += (tx-mx)*.05; my += (ty-my)*.05;
      var t=(now-t0)/1000, s=sun();
      ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,W,H);
      var br = 1 + .08*Math.sin(t*.7), R = 300*s.k*br;
      var g = ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,R);
      g.addColorStop(0,'rgba(255,214,140,.55)'); g.addColorStop(.35,'rgba(255,190,110,.20)'); g.addColorStop(1,'rgba(255,190,110,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(s.x,s.y,R,0,7); ctx.fill();
      ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(t*.03);
      for(var i=0;i<7;i++){ ctx.rotate(Math.PI*2/7); var a = .03 + .02*Math.sin(t*.6+i*1.7);
        var rg=ctx.createLinearGradient(0,0,R*3.2,0); rg.addColorStop(0,'rgba(255,214,150,'+a+')'); rg.addColorStop(1,'rgba(255,214,150,0)');
        ctx.fillStyle=rg; ctx.beginPath(); ctx.moveTo(0,-8*s.k); ctx.lineTo(R*3.2,-(60+10*i%4)*s.k); ctx.lineTo(R*3.2,(60+10*i%4)*s.k); ctx.lineTo(0,8*s.k); ctx.fill(); }
      ctx.restore();
      for(var j=0;j<P.length;j++){ var p=P[j];
        p.y -= p.s*p.z*.6; p.x += (p.w + Math.sin(t*.4+p.ph)*.12)*p.z*.6;
        if(p.y < -6){ p.y = H+6; p.x = rand(0,W); } if(p.x > W+6) p.x=-6; if(p.x < -6) p.x=W+6;
        var tw = .45 + .55*Math.sin(t*1.3+p.ph), x = p.x - mx*28*p.z, y = p.y - my*18*p.z;
        ctx.globalAlpha = .3 + .7*tw*p.z; ctx.fillStyle = p.z>.65 ? '#ffe2a8' : '#ffffff';
        ctx.beginPath(); ctx.arc(x,y,p.r*p.z*1.3+.5,0,7); ctx.fill();
        if(p.z>.8){ ctx.globalAlpha=.08*tw; ctx.beginPath(); ctx.arc(x,y,p.r*5,0,7); ctx.fill(); } }
      ctx.globalAlpha=1; requestAnimationFrame(frame);
    }
    size(); window.addEventListener('resize', size);
    document.addEventListener('visibilitychange', function(){ if(document.hidden){ running=false; } else if(!running){ running=true; requestAnimationFrame(frame); } });
    new IntersectionObserver(function(es){ var v=es[0].isIntersecting; if(v&&!running){running=true; requestAnimationFrame(frame);} if(!v) running=false; }).observe(hero);
    requestAnimationFrame(frame);
  }

  /* values fill as they cross the middle of the screen */
  var vs = [].slice.call(document.querySelectorAll('.hm-vals li'));
  function vf(){
    var vh = window.innerHeight;
    vs.forEach(function(li){
      var r = li.getBoundingClientRect(), c = r.top + r.height/2, f = Math.max(0, Math.min(1, (vh*.9 - c) / (vh*.42)));
      if(reduce) f = 1;
      li.style.setProperty('--f', f.toFixed(3)); li.classList.toggle('on', f > .05);
      li.querySelector('b').style.setProperty('--f', f.toFixed(3));
    });
  }
  window.addEventListener('scroll', vf, {passive:true}); window.addEventListener('resize', vf); vf();
})();
