import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, REPORT_PAYMENT_LINK, REPORT_PRICE_LABEL, CONTACT_EMAIL } from "./config.js";
import { classify, FIELDS, flipAnalysis, ninetyDayGates, compareKeel } from "./engine.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const KEY = "keel.assessment";
let assessmentId = localStorage.getItem(KEY);
let busy = false;

const screens = ["s-intro", "s-setup", "s-interview", "s-gate", "s-results", "s-loading"];
function show(id) {
  screens.forEach((s) => ($(s).hidden = s !== id));
  window.scrollTo({ top: 0 });
  const h = $(id).querySelector("h1, .question");
  if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- start-up ----------
async function boot() {
  $("reportBtn").textContent = `Get the formalised version (${REPORT_PRICE_LABEL})`;
  const { data: { session } } = await sb.auth.getSession();
  if (!session || !assessmentId) { show("s-intro"); return; }
  const { data: a } = await sb.from("keel_assessments").select("id,status").eq("id", assessmentId).maybeSingle();
  if (!a) { localStorage.removeItem(KEY); assessmentId = null; show("s-intro"); return; }
  if (a.status === "in_progress") { show("s-intro"); $("resumeLink").hidden = false; return; }
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
    const { data: org, error: oe } = await sb.from("keel_organisations").insert({
      created_by: uid, name: vals.org.trim(), industry: vals.industry, size_band: vals.size,
    }).select().single();
    if (oe) throw oe;
    const { error: pe } = await sb.from("keel_profiles").upsert({ user_id: uid, role_category: vals.role, organisation_id: org.id });
    if (pe) throw pe;
    const { data: a, error: ae } = await sb.from("keel_assessments").insert({ user_id: uid, organisation_id: org.id }).select().single();
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
  const { data, error } = await sb.functions.invoke("keel-interview", { body: { assessment_id: assessmentId, action, message } });
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
  drawFoundation(r.progress);
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

// The foundation bar: a keel laid down plank by plank, one tick per fact.
function drawFoundation(p) {
  if (!p) return;
  const ratio = Math.min(1, p.established / p.possible);
  $("fFill").style.width = `${Math.round(ratio * 100)}%`;
  const ticks = Array.from({ length: p.possible }, (_, i) => `<span class="${i < p.established ? "lit" : ""}"></span>`).join("");
  $("fTicks").innerHTML = ticks;
  $("fCaption").textContent = `${p.established} of ${p.possible} established · answer ${p.turns_used} of ${p.turns_max}`;
}

// ---------- gate and results ----------
async function toResultsOrGate() {
  const { data: { session } } = await sb.auth.getSession();
  const { data: prof } = await sb.from("keel_profiles").select("*").eq("user_id", session.user.id).maybeSingle();
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
  if (FREE_MAIL.test(email)) { $("gateErr").textContent = "Use your work email. Keel is built for organisations."; return; }
  $("gateErr").textContent = ""; $("gateBtn").disabled = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    const prof = {
      user_id: session.user.id, first_name: v.first.trim(), last_name: v.last.trim(), work_email: email,
      job_title: v.title.trim(), marketing_ok: !!v.updates, updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("keel_profiles").upsert(prof);
    if (error) throw error;
    await showResults(prof);
  } catch (err) {
    console.error(err);
    $("gateErr").textContent = "Couldn't save your details. Try again.";
  } finally { $("gateBtn").disabled = false; }
};

const MODEL_TITLE = { CENTRALISED: "Centralised", FEDERATED: "Federated", HYBRID: "Hybrid, centre-led" };
const DIM_LABEL = {
  R1_sponsorship: "Sponsorship", R2_team: "Minimum viable team", R3_portfolio: "Portfolio discipline",
  R4_risk_gate: "Risk gate", R5_testing_monitoring: "Testing and monitoring", R6_benefits_proof: "Benefits proof",
};

async function showResults(prof) {
  show("s-loading");
  const { data: a } = await sb.from("keel_assessments").select("facts, classification, report_md").eq("id", assessmentId).single();
  const c = a?.classification || classify(a?.facts || {});
  show("s-results");

  $("resTitle").textContent = prof?.first_name ? `${prof.first_name}, here's your Keel readiness report` : "Your Keel readiness report";

  const cmp = c.comparison;
  const provisionalNote = c.operating_model.provisional ? " Some answers were still unknown, so treat this as provisional." : "";
  if (cmp && cmp.has_existing && cmp.current_label) {
    $("headline").textContent = (cmp.matches
      ? `You're running ${cmp.current_label.toLowerCase()}, and that matches what the score says fits.`
      : `You're running ${cmp.current_label.toLowerCase()}. Based on your answers, ${c.operating_model.label.toLowerCase()} fits better.`) + provisionalNote;
  } else {
    $("headline").textContent = `The recommendation: ${c.operating_model.label.toLowerCase()}.` + provisionalNote;
  }

  if (cmp && cmp.has_existing && cmp.note) {
    $("modelCard").innerHTML = `
      <p class="small" style="margin:0 0 6px">How your current setup compares</p>
      <h2><span class="modeltag" style="${cmp.matches ? "" : "background:#8A2A1C"}">${cmp.matches ? "Matches" : "Mismatch"}</span></h2>
      <p>${esc(cmp.note)}</p>
      <p class="small" style="margin-top:10px">What the score actually says: <b>${esc(MODEL_TITLE[c.operating_model.model])}</b>, score ${c.operating_model.total} of 9.</p>`;
  } else {
    $("modelCard").innerHTML = `
      <p class="small" style="margin:0 0 6px">Operating model</p>
      <h2><span class="modeltag">${MODEL_TITLE[c.operating_model.model]}</span></h2>
      <p>Score ${c.operating_model.total} of 9. ${esc(c.operating_model.reason)}</p>`;
  }

  $("readyList").innerHTML = c.readiness.map((r) => `
    <li><span>${esc(DIM_LABEL[r.field])}</span>
    <span><span class="readytag r-${r.level}">${esc(r.label)}</span>${r.provisional ? '<span class="small">unknown</span>' : ""}</span></li>`).join("");

  renderFlip(a?.facts || {});
  renderGates(c);
  await renderKeelCompare(c);

  await loadReport();
}

// ---------- what would change the answer, the next 90 days, and the last run ----------
function renderFlip(facts) {
  const box = $("flipBox");
  const f = flipAnalysis(facts);
  const parts = [`<h2>How firm is this recommendation?</h2>`];
  parts.push(f.fragile
    ? `<p>It is close to the edge. The score is ${f.total} of 9 and is one point from a different answer, so one changed answer elsewhere could move it.</p>`
    : `<p>The score is ${f.total} of 9, ${f.margin} points clear of the nearest boundary. It would take more than one changed answer to move it.</p>`);
  if (f.flips.length) {
    parts.push(`<p><strong>The smallest changes that would flip it</strong></p><ul>${f.flips.map((x) => `<li>${esc(x.sentence)}</li>`).join("")}</ul>`);
  } else {
    parts.push(`<p>No single answer on its own would flip it.</p>`);
  }
  if (f.unknownNote) parts.push(`<p>${esc(f.unknownNote)}</p>`);
  box.innerHTML = parts.join("");
  box.hidden = false;
}

function renderGates(c) {
  const box = $("gatesBox");
  const gates = ninetyDayGates(c);
  if (!gates.length) { box.hidden = true; return; }
  box.innerHTML = `<h2>Your next 90 days</h2><p>One observable gate for each area that is not yet established, weakest first. A gate is passed when someone else could check it.</p>` +
    gates.map((g) => `<div class="gate"><p><strong>${esc(DIM_LABEL[g.field])}</strong></p><ul>${g.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("");
  box.hidden = false;
}

async function renderKeelCompare(current) {
  const box = $("cmpBox");
  box.hidden = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    const { data } = await sb.from("keel_assessments").select("id, classification, created_at, status").eq("user_id", session.user.id).order("created_at", { ascending: false });
    const prev = (data || []).find((r) => r.id !== assessmentId && r.status === "complete" && r.classification && r.classification.readiness);
    const cmp = prev ? compareKeel(prev.classification, current) : null;
    if (!cmp) return;
    const when = prev.created_at ? new Date(prev.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "your last run";
    const word = (l) => ["absent", "partial", "established"][l];
    const lines = cmp.moved.map((m) => `<li>${esc(DIM_LABEL[m.field])}: ${word(m.from)} to ${word(m.to)} (${m.direction === "up" ? "better" : "worse"})</li>`).join("");
    box.innerHTML = `<h2>Since your last run</h2><p>Compared with ${esc(when)}.${cmp.model.changed ? ` The recommended model changed from ${esc(MODEL_TITLE[cmp.model.before])} to ${esc(MODEL_TITLE[cmp.model.after])}.` : " The recommended model is the same."}${cmp.sameEngine ? "" : " The scoring rules were updated in between, so the operating model result may differ for that reason."}</p>${lines ? `<ul>${lines}</ul>` : "<p>No readiness area changed.</p>"}`;
    box.hidden = false;
  } catch (err) { console.error(err); }
}

// A small, purpose-built markdown renderer, not a general parser: it only
// needs to handle what REPORT_SYSTEM's prompt actually produces, ## headings,
// paragraphs, bullet lists, and **bold**.
function renderReportMarkdown(md) {
  const lines = md.split("\n");
  let html = "", inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    if (line.startsWith("## ")) { closeList(); html += `<h2>${inline(line.slice(3))}</h2>`; continue; }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(line.slice(2))}</li>`;
      continue;
    }
    closeList();
    html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html;
}

// One request at a time. Live tests showed the report being requested twice a fraction of a second apart,
// which doubled the cost and let a slower, plainer copy overwrite a better one.
let reportInFlight = null;
function loadReport() {
  if (!reportInFlight) reportInFlight = loadReportOnce().finally(() => { reportInFlight = null; });
  return reportInFlight;
}
async function loadReportOnce() {
  const { data: existing } = await sb.from("keel_assessments").select("report_md").eq("id", assessmentId).single();
  if (existing?.report_md) {
    $("reportLoading").hidden = true;
    $("reportBody").hidden = false;
    $("reportBody").innerHTML = renderReportMarkdown(existing.report_md);
    return;
  }
  try {
    const data = await call("generate_report");
    $("reportLoading").hidden = true;
    $("reportBody").hidden = false;
    $("reportBody").innerHTML = renderReportMarkdown(data.report_md);
  } catch (err) {
    $("reportLoading").textContent = "Couldn't write the report just now. Refresh this page to try again.";
  }
}

// ---------- commercial buttons ----------
$("reportBtn").onclick = async () => {
  const { data: { session } } = await sb.auth.getSession();
  await sb.from("keel_report_requests").insert({ assessment_id: assessmentId, user_id: session.user.id, kind: "detailed_report" });
  if (REPORT_PAYMENT_LINK) {
    const u = new URL(REPORT_PAYMENT_LINK);
    u.searchParams.set("client_reference_id", assessmentId);
    const { data: prof } = await sb.from("keel_profiles").select("work_email").eq("user_id", session.user.id).maybeSingle();
    if (prof?.work_email) u.searchParams.set("prefilled_email", prof.work_email);
    location.href = u.toString();
  } else {
    $("reportBtn").disabled = true;
    $("reportMsg").textContent = "Requested. We'll email you within two working days with the formalised version and how to pay.";
  }
};

$("fullBtn").onclick = async () => {
  const { data: { session } } = await sb.auth.getSession();
  await sb.from("keel_report_requests").insert({ assessment_id: assessmentId, user_id: session.user.id, kind: "full_keel" });
  $("fullBtn").disabled = true;
  $("fullMsg").innerHTML = `Noted. Abhinav will be in touch, or email <a href="mailto:${CONTACT_EMAIL}?subject=Keel%20strategy" style="border-bottom:1px solid var(--gold)">${CONTACT_EMAIL}</a> now.`;
};

boot();
