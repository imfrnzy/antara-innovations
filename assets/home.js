(function(){
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  function clamp(v,a,b){ return Math.min(b, Math.max(a, v)); }

  /* ---------- Hero: pointer parallax on desktop, scroll parallax everywhere ---------- */
  var hero = document.querySelector('.h-hero');
  if(hero && !reduce){
    var tx = 0, ty = 0, cx = 0, cy = 0, sy = 0, running = false;
    function frame(){
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      hero.style.setProperty('--px', cx.toFixed(3));
      hero.style.setProperty('--py', cy.toFixed(3));
      hero.style.setProperty('--sy', sy.toFixed(3));
      if(Math.abs(tx-cx) > 0.001 || Math.abs(ty-cy) > 0.001){ requestAnimationFrame(frame); } else { running = false; }
    }
    function kick(){ if(!running){ running = true; requestAnimationFrame(frame); } }
    if(fine){
      hero.addEventListener('pointermove', function(e){
        var r = hero.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - .5) * 2;
        ty = ((e.clientY - r.top) / r.height - .5) * 2;
        hero.style.setProperty('--gx', (e.clientX - r.left) + 'px');
        hero.style.setProperty('--gy', (e.clientY - r.top) + 'px');
        hero.style.setProperty('--go', '1');
        kick();
      });
      hero.addEventListener('pointerleave', function(){ tx = 0; ty = 0; hero.style.setProperty('--go','0'); kick(); });
    }
    window.addEventListener('scroll', function(){
      var h = hero.offsetHeight;
      sy = clamp(window.scrollY / h, 0, 1);
      kick();
    }, { passive:true });
  }

  /* ---------- Laptop: lid opens as it scrolls into view (works on touch too) ---------- */
  var laptop = document.querySelector('.laptop');
  if(laptop){
    if(reduce){ laptop.style.setProperty('--open','1'); }
    else {
      var ticking = false;
      function lid(){
        ticking = false;
        var r = laptop.getBoundingClientRect(), vh = window.innerHeight;
        var p = clamp((vh * 0.92 - r.top) / (vh * 0.55), 0, 1);
        p = 1 - Math.pow(1 - p, 3);
        laptop.style.setProperty('--open', p.toFixed(3));
      }
      window.addEventListener('scroll', function(){ if(!ticking){ ticking = true; requestAnimationFrame(lid); } }, { passive:true });
      window.addEventListener('resize', lid);
      lid();
    }
  }

  /* ---------- Laptop tabs: auto-cycle until the visitor takes over ---------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  var panes = Array.prototype.slice.call(document.querySelectorAll('.pane'));
  if(tabs.length){
    var DUR = 7000, cur = 0, timer = null, userTook = false, visible = false;
    function show(i){
      cur = i;
      tabs.forEach(function(t, n){
        var on = n === i;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.classList.remove('auto');
      });
      panes.forEach(function(p, n){ p.classList.toggle('on', n === i); });
      var cta = document.getElementById('stageCta');
      if(cta && tabs[i].dataset.line){
        cta.classList.add('swap');
        setTimeout(function(){
          document.getElementById('stageLine').innerHTML = tabs[i].dataset.line;
          document.getElementById('stageTourLabel').textContent = 'See how ' + tabs[i].dataset.name + ' works';
          document.getElementById('stageTour').setAttribute('href', tabs[i].dataset.tour);
          var _sa=document.getElementById('stageApp'); if(_sa) _sa.setAttribute('href', tabs[i].dataset.app);
          cta.classList.remove('swap');
        }, reduce ? 0 : 220);
      }
      var first = panes[i].querySelector('.row');
      if(first && !panes[i].querySelector('.row[aria-pressed="true"]')){ pick(first); }
      else { var sel = panes[i].querySelector('.row[aria-pressed="true"]'); if(sel) pick(sel); }
      if(!userTook && !reduce){
        void tabs[i].offsetWidth; // restart the progress animation
        tabs[i].classList.add('auto');
        clearTimeout(timer);
        timer = setTimeout(function(){ if(visible && !userTook) show((cur + 1) % tabs.length); else schedule(); }, DUR);
      }
    }
    function schedule(){ clearTimeout(timer); timer = setTimeout(function(){ if(visible && !userTook) show((cur + 1) % tabs.length); else schedule(); }, 1000); }
    tabs.forEach(function(t, i){
      t.addEventListener('click', function(){ userTook = true; clearTimeout(timer); show(i); });
    });
    // Soundings rows: selecting one drives the three meters
    function pick(row){
      var pane = row.closest('.pane');
      pane.querySelectorAll('.row').forEach(function(r){ r.setAttribute('aria-pressed', r === row ? 'true' : 'false'); });
      var set = function(id, v){ var el = pane.querySelector('[data-m="'+id+'"]'); if(el){ el.style.width = v + '%'; el.classList.toggle('hot', v >= 66); } };
      if(row.dataset.r){
        set('r', +row.dataset.r); set('d', +row.dataset.d); set('v', +row.dataset.v);
        pane.querySelectorAll('[data-note]').forEach(function(n){ n.textContent = row.dataset.why; });
      }
    }
    document.querySelectorAll('.row').forEach(function(r){
      r.addEventListener('click', function(){ userTook = true; clearTimeout(timer); tabs[cur].classList.remove('auto'); pick(r); });
    });
    var stage = document.querySelector('.laptop');
    if('IntersectionObserver' in window){
      new IntersectionObserver(function(es){ visible = es[0].isIntersecting; }, { threshold:0.35 }).observe(stage);
    } else { visible = true; }
    show(0);
  }

  /* ---------- Card spotlight follows the cursor ---------- */
  if(fine && !reduce){
    document.querySelectorAll('.pcard').forEach(function(c){
      c.addEventListener('pointermove', function(e){
        var r = c.getBoundingClientRect();
        c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        c.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }
})();
