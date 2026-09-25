const scenes = Array.from(document.querySelectorAll(".scene"));
const dotsEl = document.getElementById("dots");
let idx = 0, playing = true, timer = null;

// ---------- persona, chosen in the picker or carried in as ?from= ----------
const PERSONA = {
  bank: {
    painH: "The request that skips the process is the one built to work",
    painP: "An urgent payment, a channel that isn't the usual one, an instruction to keep it quiet. None of that proves anything on its own, but together it's the exact shape fraud is built to take, and it works because it's designed to stop you thinking.",
    examples: [
      { h: "The urgent request", p: "A message that creates pressure and secrecy in the same breath, asking you to skip the usual sign-off." },
      { h: "The believable ask", p: "A known supplier, a normal reason, nothing that should trigger a second look, and most requests genuinely are this." },
      { h: "The one worth a check", p: "Nothing definitively wrong, but a detail, a new account, a mismatched country, that's worth two minutes before the money moves." },
    ],
    endKick: "That's Squall, for banking and payments",
  },
  insurer: {
    painH: "A polished claim isn't the same as a genuine one",
    painP: "Inconsistent shadows in a photo, an invoice with a VAT number that doesn't check out, phrasing that's a little too close to another claim filed the same week. Small details carry more signal than the overall impression.",
    examples: [
      { h: "The manipulated image", p: "Photos that look consistent at a glance, until the shadows or reflections don't quite agree with each other." },
      { h: "The genuine but messy one", p: "Blurry, badly lit, awkward angle, and entirely real. Imperfection is normal, not suspicious." },
      { h: "The one worth a check", p: "Nothing wrong with the story itself, but a detail, timing, phrasing, a document, that's worth a closer look before it's paid out." },
    ],
    endKick: "That's Squall, for claims and underwriting",
  },
};

let chosenPersona = "";

function applyPersona(key) {
  const persona = PERSONA[key];
  if (!persona) return;
  document.getElementById("painH").textContent = persona.painH;
  document.getElementById("painP").textContent = persona.painP;
  document.getElementById("exH").textContent = "What you're actually judging";
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
  applyPersona(key);
}

document.querySelectorAll("#picker button").forEach((button) => {
  button.onclick = () => {
    selectPersona(button.dataset.persona);
    clearTimer();
    setTimeout(next, 320);
  };
});

const linkedFrom = new URLSearchParams(location.search).get("from");
if (linkedFrom && PERSONA[linkedFrom]) {
  selectPersona(linkedFrom);
} else {
  applyPersona("bank");
}

import("../config.js").then(({ REPORT_PRICE_LABEL }) => {
  const el = document.getElementById("ladderPrice");
  if (el && REPORT_PRICE_LABEL) el.textContent = REPORT_PRICE_LABEL;
}).catch(() => {});

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
    modalFrame.src = chosenPersona ? `../?from=${chosenPersona}` : "../";
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
