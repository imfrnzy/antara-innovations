(function(){
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  function clamp(v,a,b){ return Math.min(b, Math.max(a, v)); }
  function $all(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }

  /* ---------- Menu, year ---------- */
  var tog = document.getElementById('navToggle'), links = document.getElementById('navLinks');
  if(tog && links){
    tog.addEventListener('click', function(){
      var open = links.classList.toggle('open');
      tog.innerHTML = open ? '&times;' : '&#9776;';
      tog.setAttribute('aria-expanded', open);
      tog.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
  }
  var yr = document.getElementById('yr'); if(yr) yr.textContent = new Date().getFullYear();

  /* ---------- Reading progress bar + scroll-linked bits, one rAF ---------- */
  var bar = document.createElement('div'); bar.className = 'v2-progress'; document.body.appendChild(bar);
  var phone = document.querySelector('.phone');
  var par = $all('[data-parallax]');
  var ticking = false;
  function onScroll(){
    ticking = false;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = 'scaleX(' + (h > 0 ? clamp(window.scrollY / h, 0, 1) : 0).toFixed(4) + ')';
    if(reduce) return;
    var vh = window.innerHeight;
    par.forEach(function(el){
      var r = el.getBoundingClientRect();
      var c = (r.top + r.height/2 - vh/2) / vh;
      el.style.transform = 'translate3d(0,' + (c * -(+el.dataset.parallax || 30)).toFixed(1) + 'px,0)';
    });
    if(phone){
      var pr = phone.getBoundingClientRect();
      phone.style.setProperty('--tilt', (clamp((pr.top + pr.height/2 - vh/2) / vh, -1, 1) * 6).toFixed(2));
    }
    if(words.length){
      var line = vh * 0.62;
      words.forEach(function(w){ w.classList.toggle('lit', w.getBoundingClientRect().top < line); });
    }
  }
  var words = $all('.mf .mw');
  window.addEventListener('scroll', function(){ if(!ticking){ ticking = true; requestAnimationFrame(onScroll); } }, { passive:true });
  window.addEventListener('resize', onScroll);
  if(reduce){ words.forEach(function(w){ w.classList.add('lit'); }); words = []; }
  onScroll();

  /* ---------- Cursor spotlight on cards, glow in hero ---------- */
  if(fine && !reduce){
    $all('.card, .fw-card, .dcard').forEach(function(c){
      c.addEventListener('pointermove', function(e){
        var r = c.getBoundingClientRect();
        c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        c.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
    var hero = document.querySelector('.p-hero');
    if(hero){
      var glow = document.createElement('div'); glow.className = 'p-glow'; hero.appendChild(glow);
      hero.addEventListener('pointermove', function(e){
        var r = hero.getBoundingClientRect();
        hero.style.setProperty('--gx', (e.clientX - r.left) + 'px');
        hero.style.setProperty('--gy', (e.clientY - r.top) + 'px');
        hero.style.setProperty('--go', '1');
      });
      hero.addEventListener('pointerleave', function(){ hero.style.setProperty('--go', '0'); });
    }
  }

  /* ---------- Count-up for plain numbers: 60%, 50%, 5, GBP 50M ---------- */
  var counters = $all('[data-count]');
  function runCount(el){
    var m = /^([^0-9]*)(\d+(?:\.\d+)?)(.*)$/.exec(el.dataset.count);
    if(!m) return;
    var pre = m[1], end = parseFloat(m[2]), post = m[3], dec = (m[2].split('.')[1] || '').length, t0 = null, dur = 1400;
    function step(ts){
      if(t0 === null) t0 = ts;
      var p = clamp((ts - t0) / dur, 0, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + (end * e).toFixed(dec) + post;
      if(p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if(counters.length){
    if(reduce || !('IntersectionObserver' in window)){ counters.forEach(function(el){ el.textContent = el.dataset.count; }); }
    else {
      var cio = new IntersectionObserver(function(es){
        es.forEach(function(e){ if(e.isIntersecting){ runCount(e.target); cio.unobserve(e.target); } });
      }, { threshold:.6 });
      counters.forEach(function(el){ cio.observe(el); });
    }
  }

  /* ---------- Filter chips (instruments) ---------- */
  var chips = $all('.fchip');
  if(chips.length){
    var cards = $all('.dcard'), groups = $all('.dgroup');
    function applyFilter(key){
      chips.forEach(function(c){ c.setAttribute('aria-pressed', c.dataset.f === key ? 'true' : 'false'); });
      cards.forEach(function(c){ c.classList.toggle('is-hidden', key !== 'all' && c.dataset.s !== key); });
      groups.forEach(function(g){ g.hidden = key !== 'all' && g.dataset.s !== key; });
    }
    chips.forEach(function(c){ c.addEventListener('click', function(){ applyFilter(c.dataset.f); }); });
    if(location.hash){ var k = location.hash.slice(1); if(chips.some(function(c){ return c.dataset.f === k; })) applyFilter(k); }
  }

  /* ---------- Chain explorer (frameworks) ---------- */
  var nodes = $all('.node');
  if(nodes.length){
    var chain = document.querySelector('.chain'), details = $all('.cd'), ci = 0, ct = null, took = false, seen = false;
    function setNode(i){
      ci = i;
      nodes.forEach(function(n, k){ n.setAttribute('aria-selected', k === i ? 'true' : 'false'); n.classList.toggle('done', k < i); });
      details.forEach(function(d, k){ d.classList.toggle('on', k === i); });
      chain.style.setProperty('--p', (i / (nodes.length - 1)).toFixed(3));
    }
    function loop(){ clearTimeout(ct); ct = setTimeout(function(){ if(!took && seen && !reduce){ setNode((ci + 1) % nodes.length); } loop(); }, 3800); }
    nodes.forEach(function(n, k){ n.addEventListener('click', function(){ took = true; setNode(k); }); });
    if('IntersectionObserver' in window){ new IntersectionObserver(function(es){ seen = es[0].isIntersecting; }, { threshold:.4 }).observe(chain); } else { seen = true; }
    setNode(0); loop();
  }

  /* ---------- Breathing prompt (wellness) ---------- */
  var bw = document.querySelector('.breath-word');
  if(bw && !reduce){
    var inh = true; bw.textContent = 'Breathe in';
    setInterval(function(){ inh = !inh; bw.textContent = inh ? 'Breathe in' : 'Breathe out'; }, 4000);
  } else if(bw){ bw.textContent = 'Breathe'; }
})();
