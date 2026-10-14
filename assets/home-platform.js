(function(){
  var D={
   keel:{k:'Policy layer',t:'Keel',p:'The rules every other part answers to. It decides which use cases ship on their own and which need a person, and checks that each gate was actually followed.',l:['One fixed rule at intake, so the same inputs always give the same decision','Gates checked against your delivery and approval records','Switched on by size, sector and market, on the same foundation'],h:'keel/tour/'},
   soundings:{k:'Agent',t:'Soundings',p:'Finds what is actually running. It reads spend, sign-in and software records and builds a live inventory of AI use, then tests whether the oversight matches the risk.',l:['Regulation, data and reversibility scored separately, highest wins','Leadership belief compared with what the records show','New tools flagged on every run'],h:'soundings/tour/'},
   sentinel:{k:'Agent',t:'Sentinel',p:'Tests what each agent can see, change and cause. It maps permissions and actions, and looks for the open path: outside input, private data and an action nobody approves.',l:['Consequence and traceability scored apart','Agents nobody registered are found, not assumed away','Near misses become proposals a named person approves'],h:'sentinel/tour/'},
   bearing:{k:'Agent',t:'Bearing',p:'Proves it to the supervisor. It maps each obligation to the document that evidences it and the person who owns it, and keeps the pack current as the evidence changes.',l:['A yes counts only when the document behind it exists','Split or missing ownership reported as a finding','Obligations by regime, per market'],h:'tools/bearing/tour/'},
   halo:{k:'Human layer',t:'HALO',p:'Measures what system logs cannot: whether leaders and teams agree on how decisions are made, acknowledged and repaired, and where the two accounts come apart.',l:['Anonymous, and reported as totals only','Opt-in, never message surveillance','Leaders and teams compared on the same standards'],h:'halo/tour/'},
   squall:{k:'Human layer',t:'Squall',p:'Builds scenarios from your own fraud and claims patterns and measures judgement under pressure, including how confident people are when they are wrong.',l:['Scenarios from your own cases','Accuracy and calibration by team','Updated as new attack patterns appear'],h:'tools/squall/tour/'},
   ensign:{k:'Human layer',t:'Ensign',p:'Checks real content and client clauses against the disclosure rules of every market an asset runs in, and records what was decided and why.',l:['A label cannot rescue a misleading claim','Client clauses checked against each asset','A record for every decision'],h:'tools/ensign/tour/'}
  };
  var root=document.getElementById('pf'); if(!root) return;
  var nodes=[].slice.call(root.querySelectorAll('.pf-node')), box=document.getElementById('pfDetail');
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches, user=false, cur=0, timer, vis=false;
  function show(i){
    cur=i; var n=nodes[i], d=D[n.dataset.k];
    nodes.forEach(function(x){x.setAttribute('aria-pressed',x===n)});
    box.classList.add('swap');
    setTimeout(function(){
      box.querySelector('.k').textContent=d.k;
      box.querySelector('h3').textContent=d.t;
      box.querySelector('p:not(.k)').textContent=d.p;
      box.querySelector('ul').innerHTML=d.l.map(function(x){return '<li>'+x+'</li>'}).join('');
      box.querySelector('.go').href=d.h; box.querySelector('.go').textContent='See how '+d.t+' works →';
      box.classList.remove('swap');
    },reduce?0:200);
  }
  function loop(){clearTimeout(timer); if(user||reduce) return; timer=setTimeout(function(){ if(vis) show((cur+1)%nodes.length); loop(); },4200);}
  nodes.forEach(function(n,i){ n.addEventListener('click',function(){user=true; show(i);}); n.addEventListener('mouseenter',function(){ if(window.matchMedia('(hover:hover)').matches){user=true; show(i);} }); });
  if('IntersectionObserver' in window){ new IntersectionObserver(function(e){vis=e[0].isIntersecting},{threshold:.3}).observe(root);} else vis=true;
  show(0); loop();
  // engagement line
  var eg=document.getElementById('egLine');
  if(eg){ var steps=[].slice.call(eg.querySelectorAll('.eg-step'));
    function run(){ steps.forEach(function(s,i){ setTimeout(function(){ s.classList.add('on'); eg.style.setProperty('--p',((i)/(steps.length-1)*100)+'%'); }, reduce?0:i*650); }); }
    if('IntersectionObserver' in window){ var io=new IntersectionObserver(function(e){ if(e[0].isIntersecting){run(); io.disconnect();} },{threshold:.4}); io.observe(eg);} else run();
  }
})();
