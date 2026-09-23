(function(){
  // Header gains elevation once the page has scrolled past the hero
  var header = document.querySelector('.site-header');
  function onScroll(){
    if(!header) return;
    if(window.scrollY > 40){ header.classList.add('scrolled'); }
    else { header.classList.remove('scrolled'); }
  }
  window.addEventListener('scroll', onScroll, { passive:true });
  onScroll();

  // Stagger delay: siblings sharing a parent get an incremental delay, capped
  function applyStagger(list){
    var counts = new Map();
    list.forEach(function(el){
      var parent = el.parentElement;
      var i = counts.get(parent) || 0;
      var delay = Math.min(i, 5) * 90;
      el.style.setProperty('--reveal-delay', delay + 'ms');
      counts.set(parent, i + 1);
    });
  }

  // Above-the-fold elements: awaken automatically shortly after load
  var loadEls = Array.prototype.slice.call(document.querySelectorAll('.reveal-load'));
  applyStagger(loadEls);
  window.requestAnimationFrame(function(){
    window.requestAnimationFrame(function(){
      loadEls.forEach(function(el){ el.classList.add('is-visible'); });
    });
  });

  // Below-the-fold elements: awaken once scrolled into view, once only
  var scrollEls = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  applyStagger(scrollEls);

  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold:0.15, rootMargin:'0px 0px -8% 0px' });
    scrollEls.forEach(function(el){ io.observe(el); });
  } else {
    // No IntersectionObserver support: just show everything
    scrollEls.forEach(function(el){ el.classList.add('is-visible'); });
  }
})();
