import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, REPORT_PAYMENT_LINK, REPORT_PRICE_LABEL, CONTACT_EMAIL } from "./config.js";
import { classifyAgent, summarise, FIELDS } from "./engine.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const KEY = "sentinel.assessment";
let assessmentId = localStorage.getItem(KEY);
let busy = false;

const screens = ["s-intro", "s-setup", "s-interview", "s-gate", "s-results", "s-loading"];
function show(id) {
  screens.forEach((s) => ($(s).hidden = s !== id));
  window.scrollTo({ top: 0 });
  const h = $(id).querySelector("h1, .question");
  if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
}

const ZONE = {
  EXPOSURE: "Exposure", CONTROLLED: "Controlled", OVERBUILT: "Overbuilt", LOW_STAKES: "Low stakes",
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- start-up ----------
async function boot() {
  $("reportBtn").textContent = `Get the detailed report (${REPORT_PRICE_LABEL})`;
  const { data: { session } } = await sb.auth.getSession();
  if (!session || !assessmentId) { show("s-intro"); return; }
  const { data: a } = await sb.from("sentinel_assessments").select("id,status").eq("id", assessmentId).maybeSingle();
  if (!a) { localStorage.removeItem(KEY); assessmentId = null; show("s-intro"); return; }
  if (a.status === "in_progress") {
    show("s-intro"); $("resumeLink").hidden = false; return;
  }
  await toResultsOrGate();
}

// ---------- intro and setup ----------
$("beginBtn").onclick = () => { localStorage.removeItem(KEY); assessmentId = null; show("s-setup"); };
$("resumeLink").onclick = () => startInterview();
$("newBtn").onclick = () => { localStorage.removeItem(KEY); assessmentId = null; show("s-setup"); };

$("setupForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const vals = Object.fromEntries(f.entries());
  if (Object.values(vals).some((v) => !String(v).trim())) { $("setupErr").textContent = "Fill in every field to continue."; return; }
  $("setupErr").textContent = ""; $("setupBtn").disabled = true;
  try {
    let { data: { session } } = await sb.auth.getSession();
    if (!session) {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }
    const uid = session.user.id;
    const { data: org, error: oe } = await sb.from("sentinel_organisations").insert({
      created_by: uid, name: vals.org.trim(), industry: vals.industry, size_band: vals.size,
    }).select().single();
    if (oe) throw oe;
    const { error: pe } = await sb.from("sentinel_profiles").upsert({ user_id: uid, role_category: vals.role, organisation_id: org.id });
    if (pe) throw pe;
    const { data: a, error: ae } = await sb.from("sentinel_assessments").insert({ user_id: uid, organisation_id: org.id }).select().single();
    if (ae) throw ae;
    assessmentId = a.id; localStorage.setItem(KEY, a.id);
    await startInterview();
  } catch (err) {
    console.error(err);
    $("setupErr").textContent = "Couldn't start the assessment. Check your connection and try again.";
  } finally { $("setupBtn").disabled = false; }
};

// ---------- interview ----------
async function call(action, message) {
  const { data, error } = await sb.functions.invoke("sentinel-interview", { body: { assessment_id: assessmentId, action, message } });
  if (error) {
    let msg = "Something went wrong. Try again.";
    try { const j = await error.context.json(); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return data;
}

async function startInterview() {
  show("s-interview");
  $("question").textContent = "";
  $("thinking").hidden = false;
  try { render(await call("start")); }
  catch (e) { $("answerErr").textContent = e.message; }
  finally { $("thinking").hidden = true; }
}

function render(r) {
  if (r.done) { toResultsOrGate(); return; }
  $("question").textContent = r.question;
  $("why").textContent = r.why || "";
  $("why").hidden = true;
  $("answer").value = "";
  $("answer").focus();
  drawChainProgress(r.progress);
}

$("whyBtn").onclick = () => { $("why").hidden = !$("why").hidden; };

$("answerForm").onsubmit = async (e) => {
  e.preventDefault();
  if (busy) return;
  const text = $("answer").value.trim();
  if (!text) { $("answerErr").textContent = "Type an answer first. \"I don't know\" is a fine answer."; return; }
  busy = true; $("sendBtn").disabled = true; $("thinking").hidden = false; $("answerErr").textContent = "";
  try { render(await call("answer", text)); }
  catch (err) { $("answerErr").textContent = err.message; }
  finally { busy = false; $("sendBtn").disabled = false; $("thinking").hidden = true; }
};
$("answer").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("answerForm").requestSubmit();
});

$("finishBtn").onclick = async () => {
  if (busy) return;
  if (!confirm("Finish now? Anything not yet established will be treated as unknown, and the map will assume the worse case for it.")) return;
  busy = true;
  try { await call("finish"); await toResultsOrGate(); }
  catch (e) { $("answerErr").textContent = e.message; }
  finally { busy = false; }
};

// The Sentinel chain: the six links from the framework itself, lighting up as
// facts are established. Not a literal per-field map, established/possible
// drives how many links are lit, same underlying signal as Soundings' line,
// a visual native to this framework instead of a borrowed one.
const CHAIN_LINKS = [
  { key: "identity", label: "Identity" },
  { key: "authority", label: "Authority" },
  { key: "context", label: "Context" },
  { key: "action", label: "Action" },
  { key: "evidence", label: "Evidence" },
  { key: "adaptation", label: "Adaptation" },
];
function drawChainProgress(p) {
  if (!p) return;
  const ratio = Math.min(1, p.established / p.possible);
  const litCount = Math.round(ratio * CHAIN_LINKS.length);
  const host = $("ichain");
  let html = "";
  CHAIN_LINKS.forEach((link, i) => {
    const lit = i < litCount;
    const current = i === litCount && litCount < CHAIN_LINKS.length;
    if (i > 0) html += `<div class="seg${i <= litCount ? " lit" : ""}"></div>`;
    html += `<div class="node${lit ? " lit" : ""}${current ? " current" : ""}">${i + 1}</div><span class="label">${link.label}</span>`;
  });
  host.innerHTML = html;
  $("mobileDepth").textContent = `${p.established} of ${p.possible} facts established · answer ${p.turns_used} of ${p.turns_max}`;
  $("found").innerHTML = p.agents.length
    ? `Agents found so far: <b>${p.agents.map(esc).join("</b>, <b>")}</b>`
    : "";
}

// ---------- gate and results ----------
async function toResultsOrGate() {
  const { data: { session } } = await sb.auth.getSession();
  const { data: prof } = await sb.from("sentinel_profiles").select("*").eq("user_id", session.user.id).maybeSingle();
  if (prof && prof.work_email) await showResults(prof);
  else show("s-gate");
}

const FREE_MAIL = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|aol|proton|protonmail|gmx|mail|yandex)\./i;
$("gateForm").onsubmit = async (e) => {
  e.preventDefault();
  const v = Object.fromEntries(new FormData(e.target).entries());
  const email = String(v.email || "").trim();
  if (!v.first?.trim() || !v.last?.trim() || !v.title?.trim()) { $("gateErr").textContent = "Fill in every field to continue."; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $("gateErr").textContent = "That email doesn't look right."; return; }
  if (FREE_MAIL.test(email)) { $("gateErr").textContent = "Use your work email. Sentinel is built for organisations."; return; }
  $("gateErr").textContent = ""; $("gateBtn").disabled = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    const prof = {
      user_id: session.user.id, first_name: v.first.trim(), last_name: v.last.trim(), work_email: email,
      job_title: v.title.trim(), marketing_ok: !!v.updates, updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("sentinel_profiles").upsert(prof);
    if (error) throw error;
    await showResults(prof);
  } catch (err) {
    console.error(err);
    $("gateErr").textContent = "Couldn't save your details. Try again.";
  } finally { $("gateBtn").disabled = false; }
};

async function showResults(prof) {
  show("s-loading");
  const { data: rows } = await sb.from("sentinel_agents").select("name, facts, classification").eq("assessment_id", assessmentId).order("created_at");
  const list = (rows || []).map((u) => ({ ...u, classification: classifyAgent(u.facts || {}) }));
  const s = summarise(list);
  show("s-results");

  $("resTitle").textContent = prof?.first_name ? `${prof.first_name}, here's your Sentinel map` : "Your Sentinel map";

  if (!s.total) {
    $("headline").textContent = "We didn't establish enough to map any agents yet. Start a new assessment and name what's actually connected, including the ones nobody registered.";
    $("counts").innerHTML = ""; $("map").innerHTML = ""; $("ucList").innerHTML = ""; $("topFinding").hidden = true;
    return;
  }

  const agentWord = s.total === 1 ? "one agent" : `${s.total} agents`;
  let line = s.exposure
    ? `We mapped ${agentWord}. ${s.exposure === 1 ? "One sits" : `${s.exposure} sit`} in the exposure zone, where the consequence is high and nobody could trace it.`
    : `We mapped ${agentWord}. On what you've told us, none sit in the exposure zone.`;
  if (s.provisional) line += ` ${s.provisional === 1 ? "One result is" : `${s.provisional} results are`} provisional, because some facts are still unknown.`;
  $("headline").textContent = line;

  $("counts").innerHTML = [
    [s.exposure, "Exposure"], [s.controlled, "Controlled"], [s.overbuilt, "Overbuilt"], [s.low_stakes, "Low stakes"],
  ].map(([n, l]) => `<div><strong>${n}</strong><span>${l}</span></div>`).join("");

  drawMap(s.ordered);

  const t = s.top;
  if (t) {
    const c = t.classification;
    $("topFinding").hidden = false;
    $("topFinding").innerHTML = `
      <p class="small" style="margin:0 0 6px">The first thing we'd look at</p>
      <h2>${esc(t.name)}</h2>
      <p><span class="zone-tag z-${c.zone}">${ZONE[c.zone]}</span> Consequence ${c.consequence_exposure.toLowerCase()}, traceability ${c.traceability.toLowerCase()}${c.provisional ? ", provisional" : ""}</p>
      ${c.reasons.length ? `<ul>${c.reasons.slice(0, 4).map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}`;
  }

  $("ucList").innerHTML = s.ordered.map((u, i) => `
    <li><span>${i + 1}. ${esc(u.name)}</span>
    <span><span class="zone-tag z-${u.classification.zone}">${ZONE[u.classification.zone]}</span>${u.classification.provisional ? '<span class="small">provisional</span>' : ""}</span></li>`).join("");
}

function drawMap(items) {
  const W = 640, H = 420, L = 70, T = 20, R = 20, B = 50;
  const pw = W - L - R, ph = H - T - B, mx = L + pw / 2, my = T + ph / 2;
  const ox = { INVISIBLE: 0.18, INFORMAL: 0.38, GOVERNED: 0.78 };
  const ry = { HIGH: 0.2, MEDIUM: 0.4, LOW: 0.78 };
  const quad = (x, y, w, h, fill, label, sub) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>
    <text x="${x + 12}" y="${y + 22}" font-size="13" font-weight="700" fill="#0F2A47">${label}</text>
    <text x="${x + 12}" y="${y + 39}" font-size="11.5" fill="#5B6472">${sub}</text>`;
  let g = `<g font-family="Inter, system-ui, sans-serif">
    ${quad(L, T, pw / 2, ph / 2, "#FBEDEA", "Exposure", "High consequence, weak traceability. Act now.")}
    ${quad(mx, T, pw / 2, ph / 2, "#EEF5F0", "Controlled", "High consequence, well traced.")}
    ${quad(L, my, pw / 2, ph / 2, "#F2F4F7", "Low stakes", "Leave it be.")}
    ${quad(mx, my, pw / 2, ph / 2, "#FAF4E6", "Overbuilt", "Heavy process on low consequence.")}
    <line x1="${L}" y1="${T + ph}" x2="${L + pw}" y2="${T + ph}" stroke="#0F2A47"/>
    <line x1="${L}" y1="${T}" x2="${L}" y2="${T + ph}" stroke="#0F2A47"/>
    <text x="${L + pw / 2}" y="${H - 12}" text-anchor="middle" font-size="12" fill="#3E5871">Traceability: invisible to governed</text>
    <text transform="translate(22 ${T + ph / 2}) rotate(-90)" text-anchor="middle" font-size="12" fill="#3E5871">Consequence: low to high</text>`;
  const seen = {};
  items.forEach((u, i) => {
    const c = u.classification;
    const key = c.traceability + c.consequence_exposure;
    const n = (seen[key] = (seen[key] || 0) + 1) - 1;
    let x = L + ox[c.traceability] * pw + n * 26, y = T + ry[c.consequence_exposure] * ph + n * 8;
    // Keep medium-consequence governed agents on the correct side of the line.
    if (c.zone === "EXPOSURE" && x > mx - 16) x = mx - 20;
    const fill = c.zone === "EXPOSURE" ? "#8A2A1C" : "#0F2A47";
    g += `<g><title>${esc(u.name)}: ${ZONE[c.zone]}</title>
      <circle cx="${x}" cy="${y}" r="12" fill="${fill}" ${c.provisional ? 'stroke-dasharray="3 2" stroke="#B8923F" stroke-width="2"' : ""}/>
      <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#fff">${i + 1}</text></g>`;
  });
  $("map").innerHTML = g + "</g>";
}

// ---------- commercial buttons ----------
$("reportBtn").onclick = async () => {
  const { data: { session } } = await sb.auth.getSession();
  await sb.from("sentinel_report_requests").insert({ assessment_id: assessmentId, user_id: session.user.id, kind: "detailed_report" });
  if (REPORT_PAYMENT_LINK) {
    const u = new URL(REPORT_PAYMENT_LINK);
    u.searchParams.set("client_reference_id", assessmentId);
    const { data: prof } = await sb.from("sentinel_profiles").select("work_email").eq("user_id", session.user.id).maybeSingle();
    if (prof?.work_email) u.searchParams.set("prefilled_email", prof.work_email);
    location.href = u.toString();
  } else {
    $("reportBtn").disabled = true;
    $("reportMsg").textContent = "Requested. We'll email you within two working days with the report and how to pay.";
  }
};

$("fullBtn").onclick = async () => {
  const { data: { session } } = await sb.auth.getSession();
  await sb.from("sentinel_report_requests").insert({ assessment_id: assessmentId, user_id: session.user.id, kind: "full_sentinel" });
  $("fullBtn").disabled = true;
  $("fullMsg").innerHTML = `Noted. Abhinav will be in touch, or email <a href="mailto:${CONTACT_EMAIL}?subject=Full%20Sentinel" style="border-bottom:1px solid var(--gold)">${CONTACT_EMAIL}</a> now.`;
};

boot();
