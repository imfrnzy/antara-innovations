const scenes = Array.from(document.querySelectorAll(".scene"));
const dotsEl = document.getElementById("dots");
let idx = 0, playing = true, timer = null;

// ---------- persona, carried in from the Instruments hub as ?from= ----------
// Same three sectors Bearing's own setup form offers. Anything else, or
// nothing, falls back to a generic reading that still makes sense on its own.
const PERSONA = {
  bank: {
    painH: "A named person has to answer for the AI, eventually",
    painP: "A regulator, an auditor or your own board asks who's accountable for a specific AI-assisted decision. \u201CSeveral people, informally\u201D is the honest answer at most banks, which in practice means no one, and under SM&CR that answer isn't good enough.",
    confrontH: "If the FCA called your Senior Manager this afternoon, could the evidence be handed over in two hours?",
    confrontP: "Not described. Produced. Dated records, not a good memory of what happened.",
    confrontSource: "The Bank of England and FCA's own survey found most firms name three or more people as accountable for the same AI use. When everyone is accountable, no one actually is.",
    visual: null,    examples: [
      { h: "Named accountability", p: "Is AI written into a Senior Manager's actual Statement of Responsibilities, or just discussed at a steering group." },
      { h: "Evidence of reasonable steps", p: "Minutes, challenges raised, sign-offs. What a supervisor would actually ask to see." },
      { h: "Model risk management", p: "Whether AI and machine learning sit inside the same validation discipline as any other model." },
    ],
    endKick: "That's Bearing, for banks",
  },
  insurer: {
    painH: "Claims and pricing AI gets watched differently to everything else",
    painP: "EIOPA and the FCA both treat AI in claims and underwriting as high-impact, even though it usually isn't classed as \u201Chigh-risk\u201D under the EU AI Act. The gap between those two facts is where most insurers are exposed.",
    confrontH: "Your claims team is already being tested by this, whether the process has caught up or not.",
    confrontP: "Insurers detected more than £233m of suspected fraud last year, much of it involving AI-generated documents and images that looked entirely convincing.",
    confrontSource: "That figure is from Aviva's own 2025 fraud reporting. The techniques it describes are not hypothetical, and they are not aimed only at Aviva.",
    visual: { type: "readout", target: 233, prefix: "\u00A3", suffix: "m", caption: "suspected fraud, last year" },
    examples: [
      { h: "Claims and underwriting bias checks", p: "Whether AI-assisted claims decisions and fraud flags are checked before they affect a payout." },
      { h: "Customer outcomes", p: "Consumer Duty is judged on outcomes. If AI plays a part, its effect has to show up in what you measure." },
      { h: "Explainability", p: "FINMA has said results are often not understood or explained. This is exactly where it looks." },
    ],
    endKick: "That's Bearing, for insurers",
  },
  asset: {
    painH: "\u201CThe AI flagged it\u201D is not going to be an acceptable answer",
    painP: "The FCA has said directly that it will not accept a \u201Cthe black box made the decision\u201D defence for an AI-influenced investment decision. Senior managers remain accountable for the outcome, whatever generated the recommendation.",
    confrontH: "A client complains after a loss. They ask who actually reviewed the AI's reasoning before the position went in.",
    confrontP: "13% of investment firms currently use AI tools, in house or through a vendor. That rises to 45% within the next twelve months, most of it arriving faster than the oversight built to check it.",
    confrontSource: "Both figures are the FCA's own, from its September 2026 review of the wealth and investment management sector.",
    visual: { type: "gauge2", from: 13, to: 45, caption: "of investment firms now using AI" },
    examples: [
      { h: "Human oversight of AI-flagged positions", p: "Whether a named person actually reviewed the reasoning before an AI-flagged position went into a model portfolio." },
      { h: "Third-party AI dependency", p: "The FCA has flagged buy-side reliance on outsourced AI and data providers as a specific concentration risk." },
      { h: "Customer outcomes", p: "Consumer Duty applies here too. If AI shaped a client's outcome, that effect has to show up in what you measure." },
    ],
    endKick: "That's Bearing, for asset and investment management",
  },
  default: {
    painH: "Every AI use raises the same question eventually",
    painP: "A supervisor, an auditor or a client asks who's accountable for a specific AI decision. The honest answer is usually \u201Cseveral people, informally\u201D, which in practice means no one.",
    confrontH: "Would you say your organisation genuinely understands the AI it already runs?",
    confrontP: "Most firms surveyed by the Bank of England and FCA claim only partial understanding of their own AI systems, not full understanding.",
    confrontSource: "Just 34% claimed complete understanding. The other two-thirds includes firms that would have answered yes if asked casually.",
    visual: { type: "gauge", value: 34, caption: "claim complete understanding" },
    examples: [
      { h: "Named accountability", p: "Whether responsibility for AI sits with a specific person, not a committee." },
      { h: "Knowing what you run", p: "Including AI features inside vendor software, not just the tools you built yourselves." },
      { h: "Explainability", p: "Whether you could explain a specific AI-assisted result to a supervisor or a client, in terms they'd follow." },
    ],
    endKick: "That's Bearing",
  },
};

// chosenPersona is what the visitor actually clicked (or arrived with via a
// deep link). It starts empty: nothing is assumed about who's reading this
// until they say so, or the deck reaches the picker scene and they choose.
let chosenPersona = "";

// ---------- the instrument: gauge and readout ----------
const GAUGE_START = -144;   // degrees, matches the arc path's bottom-left opening
const GAUGE_SWEEP = 288;    // degrees, full sweep of the arc
const ARC_LENGTH = 402;     // approximate path length of the drawn arc, for stroke-dashoffset

function buildGaugeTicks() {
  const g = document.getElementById("gaugeTicks");
  if (g.childElementCount) return; // build once
  const count = 8;
  for (let i = 0; i <= count; i++) {
    const deg = GAUGE_START + (GAUGE_SWEEP * i) / count;
    const rad = (deg * Math.PI) / 180;
    const x1 = 100 + 74 * Math.sin(rad), y1 = 100 - 74 * Math.cos(rad);
    const x2 = 100 + 82 * Math.sin(rad), y2 = 100 - 82 * Math.cos(rad);
    const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
    tick.setAttribute("x1", x1.toFixed(1)); tick.setAttribute("y1", y1.toFixed(1));
    tick.setAttribute("x2", x2.toFixed(1)); tick.setAttribute("y2", y2.toFixed(1));
    tick.setAttribute("class", "tick");
    g.appendChild(tick);
  }
}

function setGaugeTo(percent) {
  const deg = GAUGE_START + (GAUGE_SWEEP * Math.max(0, Math.min(100, percent))) / 100;
  document.getElementById("needle").style.transform = `rotate(${deg}deg)`;
  const offset = ARC_LENGTH * (1 - percent / 100);
  document.getElementById("arcFill").style.strokeDashoffset = String(offset);
}

function animatePlainNumber(el, target, ms) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = Math.round((1 - Math.pow(1 - t, 3)) * target) + "%";
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function showGauge() { document.getElementById("gauge").removeAttribute("hidden"); }
function hideGauge() { document.getElementById("gauge").setAttribute("hidden", ""); }

function runVisual(persona) {
  const gaugeReadout = document.getElementById("gaugeReadout");
  const gaugeCaption = document.getElementById("gaugeCaption");
  const readout = document.getElementById("confrontReadout");
  const readoutCaption = document.getElementById("readoutCaption");
  hideGauge(); gaugeReadout.hidden = true; gaugeCaption.hidden = true;
  readout.hidden = true; readoutCaption.hidden = true;

  const v = persona.visual;
  if (!v) return;

  if (v.type === "readout") {
    readout.hidden = false; readoutCaption.hidden = false;
    readout.style.opacity = "1"; readoutCaption.style.opacity = "1";
    readoutCaption.textContent = v.caption;
    readout.textContent = v.prefix + "0";
    const start = performance.now();
    const ms = 1500;
    function tick(now) {
      const t = Math.min(1, (now - start) / ms);
      readout.textContent = v.prefix + Math.round((1 - Math.pow(1 - t, 3)) * v.target) + v.suffix;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return;
  }

  buildGaugeTicks();
  showGauge(); gaugeReadout.hidden = false; gaugeCaption.hidden = false;
  const gauge = document.getElementById("gauge");
  gauge.style.opacity = "1"; gauge.style.transform = "none";
  gaugeReadout.style.opacity = "1"; gaugeCaption.style.opacity = "1";
  gaugeCaption.textContent = v.caption;
  setGaugeTo(0);
  gaugeReadout.textContent = "0%";

  if (v.type === "gauge") {
    setTimeout(() => { setGaugeTo(v.value); animatePlainNumber(gaugeReadout, v.value, 1500); }, 150);
  } else if (v.type === "gauge2") {
    setTimeout(() => { setGaugeTo(v.from); animatePlainNumber(gaugeReadout, v.from, 1200); }, 150);
    setTimeout(() => { setGaugeTo(v.to); animatePlainNumber(gaugeReadout, v.to, 1200); }, 1900);
  }
}

let currentPersona = null;

function applyPersona(key) {
  const persona = PERSONA[key] || PERSONA.default;
  currentPersona = persona;
  document.getElementById("painH").textContent = persona.painH;
  document.getElementById("painP").textContent = persona.painP;
  document.getElementById("confrontH").textContent = persona.confrontH;
  document.getElementById("confrontP").textContent = persona.confrontP;
  document.getElementById("confrontSource").textContent = persona.confrontSource;
  document.getElementById("exH").textContent = key === "bank" || key === "insurer" || key === "asset"
    ? "What it actually asks about, for you"
    : "What it actually asks about";
  document.getElementById("endKick").textContent = persona.endKick;
  const exampleEls = document.querySelectorAll("#examples > div");
  persona.examples.forEach((example, i) => {
    exampleEls[i].innerHTML = `<h4>${example.h}</h4><p>${example.p}</p>`;
  });
}

function selectPersona(key) {
  chosenPersona = key;
  document.querySelectorAll("#picker button").forEach((button) => {
    button.classList.toggle("picked", button.dataset.persona === key);
  });
  applyPersona(key === "other" ? "default" : key);
}

document.querySelectorAll("#picker button").forEach((button) => {
  button.onclick = () => {
    selectPersona(button.dataset.persona);
    clearTimer();
    setTimeout(next, 320);
  };
});

// A deep link (?from=bank) pre-picks an answer rather than asking again,
// but the deck still pauses on the picker scene so that choice is visible
// and changeable, not silently assumed.
const linkedFrom = new URLSearchParams(location.search).get("from");
if (linkedFrom && PERSONA[linkedFrom]) {
  selectPersona(linkedFrom);
} else {
  applyPersona("default");
}

import("../config.js").then(({ REPORT_PRICE_LABEL }) => {
  const el = document.getElementById("ladderPrice");
  if (el && REPORT_PRICE_LABEL) el.textContent = REPORT_PRICE_LABEL;
}).catch(() => {});

// Progress dots, one per scene, filling like a story bar.
scenes.forEach((s, i) => {
  const d = document.createElement("i");
  d.innerHTML = "<b></b>";
  d.dataset.i = i;
  d.addEventListener("click", () => goTo(i));
  dotsEl.appendChild(d);
});
const dotEls = () => Array.from(dotsEl.children);

function paintDots() {
  dotEls().forEach((d, i) => {
    d.classList.toggle("done", i < idx);
    d.classList.toggle("active", i === idx);
    const bar = d.querySelector("b");
    bar.style.animation = "none"; void bar.offsetWidth;
    if (i === idx && playing) {
      const ms = Number(scenes[i].dataset.ms) || 6000;
      bar.style.animation = `fillbar linear forwards`;
      bar.style.animationDuration = ms + "ms";
    }
  });
}

function armInternals(scene) {
  scene.querySelectorAll("[data-t]").forEach((el) => {
    el.classList.remove("on");
    clearTimeout(el._t);
    const t = Number(el.dataset.t) || 0;
    el._t = setTimeout(() => el.classList.add("on"), t);
  });
}
function clearInternals(scene) {
  scene.querySelectorAll("[data-t]").forEach((el) => { clearTimeout(el._t); el.classList.remove("on"); });
}

function showScene(i) {
  scenes.forEach((s, j) => { s.classList.toggle("on", j === i); if (j !== i) clearInternals(s); });
  armInternals(scenes[i]);
  paintDots();
  document.getElementById("prevBtn").disabled = i === 0;
  const last = i === scenes.length - 1;
  document.getElementById("tourBottom").style.display = last ? "none" : "flex";
  document.getElementById("skipBtn").style.display = last ? "none" : "inline";
  document.getElementById("playBtn").style.display = last ? "none" : "inline";
  paintExhibit(i, last);

  const confrontH = document.getElementById("confrontH");
  if (scenes[i].contains(confrontH) && currentPersona) {
    runVisual(currentPersona);
  }
}

const CONTENT_SCENES = scenes.filter((s) => !s.classList.contains("end"));
function paintExhibit(i, last) {
  const scene = scenes[i];
  const isTitle = i === 0;
  const show = !isTitle && !last;
  document.getElementById("exline").hidden = !show;
  document.getElementById("decknote").hidden = !show;
  if (show) {
    const n = CONTENT_SCENES.indexOf(scene);
    document.getElementById("exnum").textContent = `Exhibit ${n}`;
  }
}

function clearTimer() { clearTimeout(timer); }
function armTimer() {
  clearTimer();
  const scene = scenes[idx];
  const ms = Number(scene.dataset.ms) || 0;
  if (!ms || !playing) return;
  timer = setTimeout(next, ms);
}
function goTo(i) {
  idx = Math.max(0, Math.min(scenes.length - 1, i));
  showScene(idx);
  armTimer();
}
function next() { if (idx < scenes.length - 1) goTo(idx + 1); }
function prev() { goTo(idx - 1); }

document.getElementById("nextBtn").onclick = next;
document.getElementById("prevBtn").onclick = prev;
document.getElementById("playBtn").onclick = () => {
  playing = !playing;
  document.getElementById("playBtn").textContent = playing ? "Pause" : "Play";
  if (playing) armTimer(); else clearTimer();
  paintDots();
};
document.addEventListener("visibilitychange", () => { if (document.hidden) clearTimer(); else if (playing) armTimer(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") next();
  if (e.key === "ArrowLeft") prev();
  if (e.key === "Escape") closeModal();
});

document.getElementById("backBtn").onclick = () => { location.href = "../../"; };
document.getElementById("skipBtn").onclick = () => { clearTimer(); goTo(scenes.length - 1); };

const modalbg = document.getElementById("modalbg");
const modalFrame = document.getElementById("modalFrame");
let modalLoaded = false;
function openModal() {
  clearTimer(); playing = false;
  if (!modalLoaded) {
    // The assessment only has tailored entry copy for bank, insurer and
    // asset; "other" and no-choice both fall through to its generic line.
    const passOn = (chosenPersona === "bank" || chosenPersona === "insurer" || chosenPersona === "asset") ? chosenPersona : "";
    modalFrame.src = passOn ? `../?from=${passOn}` : "../";
    modalLoaded = true;
  }
  modalbg.classList.add("on");
  document.getElementById("modalClose").focus();
}
function closeModal() { modalbg.classList.remove("on"); }
document.getElementById("continueBtn").onclick = openModal;
document.getElementById("modalClose").onclick = closeModal;
modalbg.addEventListener("click", (e) => { if (e.target === modalbg) closeModal(); });

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduced) { document.getElementById("playBtn").click(); }

goTo(0);
