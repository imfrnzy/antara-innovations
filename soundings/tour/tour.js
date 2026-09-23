const scenes = Array.from(document.querySelectorAll(".scene"));
const dotsEl = document.getElementById("dots");
const stage = document.getElementById("stage");
let idx = 0, playing = true, timer = null, elapsed = 0, sceneStart = 0;

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
  if (scene.classList.contains("mapscene")) drawTourMap();
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

// ---------- the framework map, drawn live ----------
function drawTourMap() {
  const svg = document.getElementById("tourMap");
  const W = 640, H = 380, L = 66, T = 16, R = 16, B = 46, pw = W - L - R, ph = H - T - B, mx = L + pw / 2, my = T + ph / 2;
  const quad = (x, y, w, h, fill, label, sub) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="200ms" dur="500ms" fill="freeze"/></rect>
    <text x="${x + 12}" y="${y + 21}" font-size="13" font-weight="700" fill="#0F2A47" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="500ms" dur="400ms" fill="freeze"/>${label}</text>
    <text x="${x + 12}" y="${y + 37}" font-size="11" fill="#5B6472" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="600ms" dur="400ms" fill="freeze"/>${sub}</text>`;
  let g = `<g font-family="Inter, system-ui, sans-serif">
    ${quad(L, T, pw / 2, ph / 2, "#FBEDEA", "Exposure", "High risk, weak oversight")}
    ${quad(mx, T, pw / 2, ph / 2, "#EEF5F0", "Controlled", "High risk, well watched")}
    ${quad(L, my, pw / 2, ph / 2, "#F2F4F7", "Low stakes", "Leave it be")}
    ${quad(mx, my, pw / 2, ph / 2, "#FAF4E6", "Friction", "Heavy process, low risk")}
    <line x1="${L}" y1="${T + ph}" x2="${L + pw}" y2="${T + ph}" stroke="#0F2A47" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="150ms" dur="300ms" fill="freeze"/></line>
    <line x1="${L}" y1="${T}" x2="${L}" y2="${T + ph}" stroke="#0F2A47" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="150ms" dur="300ms" fill="freeze"/></line>
    <text x="${L + pw / 2}" y="${H - 10}" text-anchor="middle" font-size="11.5" fill="#3E5871" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="700ms" dur="400ms" fill="freeze"/>Oversight: invisible to governed</text>
    <text transform="translate(20 ${T + ph / 2}) rotate(-90)" text-anchor="middle" font-size="11.5" fill="#3E5871" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="700ms" dur="400ms" fill="freeze"/>Risk: low to high</text>`;
  // Three example uses, landing one after another to demonstrate the read.
  const dots = [
    { x: L + 0.20 * pw, y: T + 0.22 * ph, zone: "exposure", n: 1, begin: 1600 },
    { x: L + 0.36 * pw, y: T + 0.30 * ph, zone: "exposure", n: 2, begin: 2600 },
    { x: mx + 0.22 * pw, y: T + 0.78 * ph, zone: "friction", n: 3, begin: 3600 },
  ];
  dots.forEach((d) => {
    const fill = d.zone === "exposure" ? "#8A2A1C" : "#0F2A47";
    g += `<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${d.begin}ms" dur="1ms" fill="freeze"/>
      <circle cx="${d.x}" cy="${d.y}" r="0" fill="${fill}"><animate attributeName="r" from="0" to="12" begin="${d.begin}ms" dur="450ms" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1"/></circle>
      <text x="${d.x}" y="${d.y + 4}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#fff">${d.n}</text></g>`;
  });
  svg.innerHTML = g + "</g>";
}

// ---------- exits ----------
document.getElementById("backBtn").onclick = () => { location.href = "../../frameworks/"; };
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

// Reduced motion: show the end screen state without the timed auto-advance.
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduced) { document.getElementById("playBtn").click(); }

goTo(0);
