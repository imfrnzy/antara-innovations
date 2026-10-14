(function(){
  var A={
    soundings:{ask:"What is actually running, and is it watched properly?",on:["Identity","Finance","Software estate","Cloud"],rh:"Soundings rules",rule:"Each use of AI is scored on regulation, data sensitivity and reversibility. The overall rating is the highest of the three, never an average.",out:["Live AI inventory","Oversight gap register","Alert when a new AI tool appears"]},
    sentinel:{ask:"What can each agent actually cause, and can it be reconstructed?",on:["Agent platforms","Identity","Cloud"],rh:"Sentinel rules",rule:"The six-link chain: identity, authority, context, action, evidence, adaptation. It tests for outside input, private data and an unapproved action in the same place.",out:["Agent inventory","Action-risk register","Reconstruction check for every action","Proposed control changes"]},
    bearing:{ask:"What can you actually prove to a supervisor?",on:["Documents","Model register","Identity"],rh:"Bearing rules",rule:"Each obligation is mapped to the document that evidences it and to a named accountable person. Where there is no evidence, it says so.",out:["Obligation-to-evidence map","Accountability map","Supervisor pack, kept current","Alert on stale evidence or regulatory change"]},
    keel:{ask:"What is allowed to ship, and is it still behaving?",on:["Delivery tooling","Documents","Model register","Identity"],rh:"Keel rules",rule:"Every use case is scored at intake against a fixed rule: it ships on its own, or it needs human review. The gates are checked, not assumed.",out:["Use-case gate register","Ship or review decisions, recorded","Drift and incident watch","The first ninety days, as checkable gates"]}
  };
  var SRC=["Identity","Finance","Software estate","Cloud","Documents","Agent platforms","Model register","Delivery tooling"];
  var P={uk:"UK: FCA and PRA expectations, SM&CR, Consumer Duty, PRA model risk, UK GDPR.",ch:"Switzerland: FINMA guidance, the Federal Act on Data Protection, cantonal and sector rules.",eu:"EU: the AI Act, DORA, GDPR and national supervisors."};
  var $=function(id){return document.getElementById(id)};
  var cur="soundings",mk="uk",userMk=false;
  function renderA(a){
    cur=a; var d=A[a];
    $("agAsk").textContent=d.ask;
    $("agSrc").innerHTML=SRC.map(function(s){return '<li class="'+(d.on.indexOf(s)>-1?"on":"")+'">'+s+'</li>'}).join("");
    $("agRuleH").textContent=d.rh; $("agRule").textContent=d.rule;
    $("agOut").innerHTML=d.out.map(function(o){return "<li>"+o+"</li>"}).join("");
    document.querySelectorAll("#agTabs button").forEach(function(b){b.setAttribute("aria-pressed",b.dataset.a===a)});
  }
  function renderM(m){mk=m; $("agPack").textContent=P[m]; document.querySelectorAll("#agMk button").forEach(function(b){b.setAttribute("aria-pressed",b.dataset.m===m)})}
  document.querySelectorAll("#agTabs button").forEach(function(b){b.addEventListener("click",function(){renderA(b.dataset.a)})});
  document.querySelectorAll("#agMk button").forEach(function(b){b.addEventListener("click",function(){userMk=true;renderM(b.dataset.m)})});
  renderA("soundings"); renderM("uk");
  // terminal
  var L=[["09:02:11","connect","agent-platform: read-only access confirmed",""],
         ["09:02:14","discover","14 agents found. 9 are registered. 5 are in no inventory.",""],
         ["09:02:19","map","refund-assistant reads CRM, payments and customer email. It can issue refunds.",""],
         ["09:02:22","test","outside input + private data + unapproved action: path open","bad"],
         ["09:02:26","verify","action log reviewed: 71% of refund actions can be reconstructed",""],
         ["09:02:31","score","rule SEN-04 applied: consequence high, traceability low. No model involved.",""],
         ["09:02:33","propose","approval above a set value; longer log retention. Waiting for the owner.",""]];
  var term=$("agTerm"),card=$("agCard"),timers=[],started=false;
  function clear(){timers.forEach(clearTimeout);timers=[];term.innerHTML="";card.classList.remove("on")}
  function play(){
    clear();
    var reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    L.forEach(function(r,i){
      var f=function(){var d=document.createElement("div");d.className="ln";d.innerHTML="<time>"+r[0]+"</time><b class='k'>"+r[1]+"</b><span class='t "+r[3]+"'>"+r[2]+"</span>";term.appendChild(d)};
      if(reduce)f(); else timers.push(setTimeout(f,500+i*900));
    });
    if(reduce)card.classList.add("on"); else timers.push(setTimeout(function(){card.classList.add("on")},500+L.length*900));
  }
  $("agReplay").addEventListener("click",play);
  var io=("IntersectionObserver" in window)?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting&&!started){started=true;play()}})},{threshold:.35}):null;
  if(io)io.observe($("run")); else play();
  // market rotates until the visitor picks one
  var order=["uk","ch","eu"],k=0;
  setInterval(function(){if(userMk)return;k=(k+1)%3;renderM(order[k])},4800);
})();
