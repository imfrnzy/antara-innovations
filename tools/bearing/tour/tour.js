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
    examples: [
      { h: "Named accountability", p: "Is AI written into a Senior Manager's actual Statement of Responsibilities, or just discussed at a steering group." },
      { h: "Evidence of reasonable steps", p: "Minutes, challenges raised, sign-offs. What a supervisor would actually ask to see." },
      { h: "Model risk management", p: "Whether AI and machine learning sit inside the same validation discipline as any other model." },
    ],
    endKick: "That's Bearing, for banks",
  },
  insurer: {
    painH: "Claims and pricing AI gets watched differently to everything else",
    painP: "EIOPA and the FCA both treat AI in claims and underwriting as high-impact, even though it usually isn't classed as \u201Chigh-risk\u201D under the EU AI Act. The gap between those two facts is where most insurers are exposed.",
    examples: [
      { h: "Claims and underwriting bias checks", p: "Whether AI-assisted claims decisions and fraud flags are checked before they affect a payout." },
      { h: "Customer outcomes", p: "Consumer Duty is judged on outcomes. If AI plays a part, its effect has to show up in what you measure." },
      { h: "Explainability", p: "FINMA has said results are often not understood or explained. This is exactly where it looks." },
    ],
    endKick: "That's Bearing, for insurers",
  },
  default: {
    painH: "Every AI use raises the same question eventually",
    painP: "A supervisor, an auditor or a client asks who's accountable for a specific AI decision. The honest answer is usually \u201Cseveral people, informally\u201D, which in practice means no one.",
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

function applyPersona(key) {
  const persona = PERSONA[key] || PERSONA.default;
  document.getElementById("painH").textContent = persona.painH;
  document.getElementById("painP").textContent = persona.painP;
  document.getElementById("exH").textContent = key === "bank" || key === "insurer"
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
    // The assessment only has tailored entry copy for bank and insurer;
    // "other" and no-choice both fall through to its generic opening line.
    const passOn = (chosenPersona === "bank" || chosenPersona === "insurer") ? chosenPersona : "";
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
