const scenes = Array.from(document.querySelectorAll(".scene"));
const dotsEl = document.getElementById("dots");
let idx = 0, playing = true, timer = null;

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
  if (!modalLoaded) { modalFrame.src = "../"; modalLoaded = true; }
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
