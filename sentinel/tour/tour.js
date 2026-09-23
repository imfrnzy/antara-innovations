const scenes = Array.from(document.querySelectorAll(".scene"));
const dotsEl = document.getElementById("dots");
const stage = document.getElementById("stage");
let idx = 0, playing = true, timer = null, elapsed = 0, sceneStart = 0;

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
  if (scene.classList.contains("mapscene")) drawTourMap();
  if (scene.classList.contains("reportscene")) drawReportCharts();
}

function clearInternals(scene) {
  scene.querySelectorAll("[data-t]").forEach((el) => { clearTimeout(el._t); el.classList.remove("on"); });
  scene.querySelectorAll(".rc-row, .rc-evidence p").forEach((el) => { clearTimeout(el._t); el.classList.remove("on"); });
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

// Content scenes are numbered like the source PDF's own exhibits; title and end screen are not.
const CONTENT_SCENES = scenes.filter((s) => !s.classList.contains("end"));
function paintExhibit(i, last) {
  const scene = scenes[i];
  const isTitle = i === 0;
  const show = !isTitle && !last;
  document.getElementById("exline").hidden = !show;
  document.getElementById("decknote").hidden = !show;
  if (show) {
    const n = CONTENT_SCENES.indexOf(scene); // title excluded above, so scene 2 -> Exhibit 1
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

// ---------- the framework map, drawn live ----------
function drawTourMap() {
  const svg = document.getElementById("tourMap");
  const W = 640, H = 380, L = 66, T = 16, R = 16, B = 46, pw = W - L - R, ph = H - T - B, mx = L + pw / 2, my = T + ph / 2;
  const quad = (x, y, w, h, fill, label, sub) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="200ms" dur="500ms" fill="freeze"/></rect>
    <text x="${x + 12}" y="${y + 21}" font-size="13" font-weight="700" fill="#0F2A47" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="500ms" dur="400ms" fill="freeze"/>${label}</text>
    <text x="${x + 12}" y="${y + 37}" font-size="11" fill="#5B6472" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="600ms" dur="400ms" fill="freeze"/>${sub}</text>`;
  let g = `<g font-family="Inter, system-ui, sans-serif">
    ${quad(L, T, pw / 2, ph / 2, "#FBEDEA", "Exposure", "High consequence, weak traceability")}
    ${quad(mx, T, pw / 2, ph / 2, "#EEF5F0", "Controlled", "High consequence, well traced")}
    ${quad(L, my, pw / 2, ph / 2, "#F2F4F7", "Low stakes", "Leave it be")}
    ${quad(mx, my, pw / 2, ph / 2, "#FAF4E6", "Overbuilt", "Heavy process, low consequence")}
    <line x1="${L}" y1="${T + ph}" x2="${L + pw}" y2="${T + ph}" stroke="#0F2A47" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="150ms" dur="300ms" fill="freeze"/></line>
    <line x1="${L}" y1="${T}" x2="${L}" y2="${T + ph}" stroke="#0F2A47" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="150ms" dur="300ms" fill="freeze"/></line>
    <text x="${L + pw / 2}" y="${H - 10}" text-anchor="middle" font-size="11.5" fill="#3E5871" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="700ms" dur="400ms" fill="freeze"/>Traceability: invisible to governed</text>
    <text transform="translate(20 ${T + ph / 2}) rotate(-90)" text-anchor="middle" font-size="11.5" fill="#3E5871" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="700ms" dur="400ms" fill="freeze"/>Consequence: low to high</text>`;
  // Three example uses, landing one after another to demonstrate the read.
  const dots = [
    { x: L + 0.20 * pw, y: T + 0.22 * ph, zone: "exposure", n: 1, begin: 1600 },
    { x: L + 0.36 * pw, y: T + 0.30 * ph, zone: "exposure", n: 2, begin: 2600 },
    { x: mx + 0.22 * pw, y: T + 0.22 * ph, zone: "controlled", n: 3, begin: 3600 },
  ];
  dots.forEach((d) => {
    const fill = d.zone === "exposure" ? "#8A2A1C" : "#0F2A47";
    g += `<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${d.begin}ms" dur="1ms" fill="freeze"/>
      <circle cx="${d.x}" cy="${d.y}" r="0" fill="${fill}"><animate attributeName="r" from="0" to="12" begin="${d.begin}ms" dur="450ms" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1"/></circle>
      <text x="${d.x}" y="${d.y + 4}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#fff">${d.n}</text></g>`;
  });
  svg.innerHTML = g + "</g>";
}

// ---------- the report preview: illustrative, not real output ----------
function drawReportCharts() {
  const bar = document.getElementById("rcBar");
  if (bar) {
    const vals = [{ l: "Exposure", v: 2, c: "#8A2A1C" }, { l: "Controlled", v: 1, c: "#1F5A3A" }, { l: "Overbuilt", v: 3, c: "#7A5A12" }, { l: "Low stakes", v: 4, c: "#3E5871" }];
    const max = 5, w = 220, bw = 36, gap = 18, base = 92;
    let g = "";
    vals.forEach((d, i) => {
      const x = 10 + i * (bw + gap), bh = (d.v / max) * 62;
      g += `<rect x="${x}" y="${base}" width="${bw}" height="0" fill="${d.c}"><animate attributeName="height" from="0" to="${bh}" begin="${200 + i * 180}ms" dur="500ms" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1"/><animate attributeName="y" from="${base}" to="${base - bh}" begin="${200 + i * 180}ms" dur="500ms" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1"/></rect>
        <text x="${x + bw / 2}" y="${base + 14}" text-anchor="middle" font-size="9" fill="#5B6472">${d.l.split(" ")[0]}</text>
        <text x="${x + bw / 2}" y="${base - bh - 6}" text-anchor="middle" font-size="10" font-weight="700" fill="#151B23" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${700 + i * 180}ms" dur="300ms" fill="freeze"/>${d.v}</text>`;
    });
    bar.innerHTML = `<g font-family="Inter, system-ui, sans-serif">${g}<line x1="6" y1="${base}" x2="${w - 6}" y2="${base}" stroke="#0F2A47"/></g>`;
  }
  const donut = document.getElementById("rcDonut");
  if (donut) {
    const seg = [{ v: 22, c: "#8A2A1C", label: "Invisible" }, { v: 33, c: "#B8923F", label: "Informal" }, { v: 45, c: "#0F2A47", label: "Governed" }];
    const cx = 70, cy = 58, r = 42, C = 2 * Math.PI * r;
    let cum = 0, g = "";
    seg.forEach((s, i) => {
      const len = (s.v / 100) * C, offset = -cum;
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.c}" stroke-width="16" stroke-dashoffset="${offset}" stroke-dasharray="0 ${C}" transform="rotate(-90 ${cx} ${cy})"><animate attributeName="stroke-dasharray" from="0 ${C}" to="${len} ${C - len}" begin="${300 + i * 250}ms" dur="600ms" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1"/></circle>`;
      cum += len;
    });
    donut.innerHTML = `<g>${g}</g>`;
    const legend = document.getElementById("rcLegend");
    if (legend) legend.innerHTML = seg.map((s) => `<span><i style="background:${s.c}"></i>${s.label} ${s.v}%</span>`).join("");
  }
  [["rcRow1", 300], ["rcRow2", 900], ["rcRow3", 1500]].forEach(([id, t]) => {
    const el = document.getElementById(id); if (!el) return; el.classList.remove("on"); clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add("on"), t);
  });
  [["rcEv1", 2200], ["rcEv2", 2900]].forEach(([id, t]) => {
    const el = document.getElementById(id); if (!el) return; el.classList.remove("on"); clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add("on"), t);
  });
}


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
