import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, REPORT_PAYMENT_LINK, REPORT_PRICE_LABEL, CONTACT_EMAIL, PRO_PRICE_LABEL } from "./config.js";
import { classifyAgent, summarise, FIELDS } from "./engine.js";
import { checkConfig, summaryText, capLabels } from "./config-check.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const KEY = "sentinel.assessment";
let assessmentId = localStorage.getItem(KEY);
let busy = false;

const screens = ["s-intro", "s-config", "s-setup", "s-interview", "s-gate", "s-results", "s-loading"];
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
  // Back from the sign-in email with a check waiting to be saved: go straight to the configuration screen.
  try { if (localStorage.getItem("hp.pending.sentinel")) { show("s-config"); return; } } catch { /* storage blocked */ }
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
    $("counts").innerHTML = ""; $("map").innerHTML = ""; $("matrixTable").innerHTML = ""; $("findingsList").innerHTML = "";
    return;
  }

  const agentWord = s.total === 1 ? "one agent" : `${s.total} agents`;
  let line = s.exposure
    ? `We mapped ${agentWord}. ${s.exposure === 1 ? "One sits" : `${s.exposure} sit`} in the exposure zone, where the consequence is high and nobody could trace it.`
    : `We mapped ${agentWord}. On what you've told us, none sit in the exposure zone.`;
  if (s.open_paths) line += ` ${s.open_paths === 1 ? "One has" : `${s.open_paths} have`} an open attack path: outside text, sensitive data and an unapproved action all meet in the same agent.`;
  if (s.provisional) line += ` ${s.provisional === 1 ? "One result is" : `${s.provisional} results are`} provisional, because some facts are still unknown.`;
  $("headline").textContent = line;

  $("counts").innerHTML = [
    [s.exposure, "Exposure"], [s.controlled, "Controlled"], [s.overbuilt, "Overbuilt"], [s.low_stakes, "Low stakes"],
  ].map(([n, l]) => `<div><strong>${n}</strong><span>${l}</span></div>`).join("");

  buildMatrix(s.ordered);
  buildFindings(s.ordered);
  drawMap(s.ordered);
}

// ---------- the access matrix: agents down, every checklist fact across ----------
const MATRIX_FIELDS = [
  { key: "C1_irreversible_without_approval", short: "Irrev." },
  { key: "C2_sees_sensitive_data", short: "Data" },
  { key: "U1_untrusted_input", short: "Outside input" },
  { key: "C3_multi_system_access", short: "Multi-sys" },
  { key: "C4_writes_system_of_record", short: "Writes" },
  { key: "T1_named_owner", short: "Owner" },
  { key: "T2_reconstructable", short: "Traced" },
  { key: "T3_known_outside_team", short: "Known" },
];
function buildMatrix(items) {
  const head = `<thead><tr>
    <th class="rowhead">Agent</th>
    ${MATRIX_FIELDS.map((f, i) => `<th${i === 5 ? ' class="divide"' : ""}>${f.short}</th>`).join("")}
    <th class="divide">Zone</th>
  </tr></thead>`;
  const rows = items.map((u, i) => {
    const facts = u.facts || {};
    const cells = MATRIX_FIELDS.map((f, fi) => {
      const entry = facts[f.key];
      const v = entry ? entry.value : "unknown";
      const cls = v === "yes" ? "yes" : v === "no" ? "no" : "unknown";
      const mark = v === "yes" ? "\u2713" : v === "no" ? "\u2013" : "?";
      return `<td${fi === 5 ? ' class="divide"' : ""}><span class="cell ${cls}">${mark}</span></td>`;
    }).join("");
    const c = u.classification;
    return `<tr>
      <td class="rowhead">${esc(u.name)}<span class="idx">SEN-${String(i + 1).padStart(3, "0")}</span></td>
      ${cells}
      <td class="divide zonecell"><span class="sevbadge sev-${c.zone}">${ZONE[c.zone]}</span></td>
    </tr>`;
  }).join("");
  $("matrixTable").innerHTML = head + `<tbody>${rows}</tbody>`;
}

// ---------- findings: structured records, with a real recommendation from the playbook's own remediation table ----------
// Source: Sentinel_Playbook.docx, "The control-by-control remediation table". Picks the
// single highest-priority applicable action, not a generic line.
function recommend(facts, path) {
  const v = (k) => (facts[k] && facts[k].value) || "unknown";
  if (path && path.status === "OPEN")
    return "Break the attack path at its cheapest point: put a person's approval in front of the action that can't be undone, and stop the agent acting directly on outside content.";
  if (v("C1_irreversible_without_approval") === "yes")
    return "Add a human approval gate before this action executes.";
  if (v("C3_multi_system_access") === "yes")
    return "Move to least-privilege, task-scoped authority across every connected system.";
  if (v("C2_sees_sensitive_data") === "yes")
    return "Isolate or validate the data source this agent draws from.";
  if (v("C4_writes_system_of_record") === "yes")
    return "Queue every write for a named reviewer, regardless of size.";
  if (v("T1_named_owner") === "no")
    return "Assign a named agent identity and owner.";
  if (v("T2_reconstructable") === "no")
    return "Add action-level logging so any single action is reconstructable within hours.";
  if (v("T3_known_outside_team") === "no")
    return "Log this as a lesson and route any control change through governance review.";
  return "Keep the current monitoring in place. Nothing here needs an immediate change.";
}

// The attack path: outside text + sensitive data + unapproved action. Inferred, not tested.
function pathBox(p) {
  if (!p) return "";
  const title = { OPEN: "Attack path open", POSSIBLE: "Attack path not ruled out", CLOSED: "Attack path closed" }[p.status];
  const options = p.status === "OPEN" && p.break_options.length
    ? `<ul>${p.break_options.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : "";
  return `<div class="pathbox p-${p.status}"><b>${title}.</b> ${esc(p.narrative)}${options}<span class="inferred">Inferred from your answers. Not tested against the real agent.</span></div>`;
}

function buildFindings(items) {
  $("findingsList").innerHTML = items.map((u, i) => {
    const c = u.classification;
    const id = `SEN-${String(i + 1).padStart(3, "0")}`;
    return `<div class="finding sev-${c.zone}">
      <div class="finding-top">
        <span class="finding-id">${id}</span>
        <span class="sevbadge sev-${c.zone}">${ZONE[c.zone]}</span>
        ${c.provisional ? '<span class="provtag">Provisional</span>' : ""}
      </div>
      <h3>${esc(u.name)}</h3>
      <p class="small" style="margin:0 0 8px">Consequence ${c.consequence_exposure.toLowerCase()}, traceability ${c.traceability.toLowerCase()}.</p>
      ${c.reasons.length ? `<ul>${c.reasons.slice(0, 4).map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      ${pathBox(c.attack_path)}
      <p class="action"><b>Recommended now:</b> ${esc(recommend(u.facts || {}, c.attack_path))}</p>
    </div>`;
  }).join("");
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


// ---------- configuration check: runs entirely in the browser ----------
let lastConfig = null;
let hist = { refresh() {} }; // replaced by the saved-checks panel once it has loaded. The page works without it.
$("cfgOpen").onclick = () => { show("s-config"); };
$("cfgBack").onclick = () => { show("s-intro"); };
$("cfgToInterview").onclick = () => { localStorage.removeItem(KEY); assessmentId = null; show("s-setup"); };

$("cfgFile").onchange = async () => {
  const file = $("cfgFile").files && $("cfgFile").files[0];
  if (!file) return;
  if (file.size > 400000) { $("cfgErr").textContent = "That file is too large. Paste just the part that lists the tools or servers."; return; }
  try { $("cfgText").value = await file.text(); $("cfgErr").textContent = ""; }
  catch { $("cfgErr").textContent = "Couldn't read that file. Paste its contents instead."; }
};

const LEG_TEXT = {
  untrusted_input: ["Outside content can reach it", { yes: "Yes", maybe: "Possibly", no: "Not found" }],
  private_data: ["Can see private data", { yes: "Yes", maybe: "Possibly", no: "Not found" }],
  outward_action: ["Can act on other systems", { yes: "Yes", maybe: "Possibly", no: "Not found" }],
};

function renderConfig(r) {
  $("cfgOut").hidden = false;
  $("cfgVerdict").className = `cfg-verdict st-${r.status}`;
  $("cfgVerdict").innerHTML = `<h2>${esc(r.headline)}</h2><p>${esc(r.narrative)}</p>`;
  $("cfgLegs").innerHTML = Object.entries(r.legs).map(([k, v]) =>
    `<div class="legchip l-${v}"><b>${esc(LEG_TEXT[k][0])}</b>${esc(LEG_TEXT[k][1][v])}</div>`).join("");
  $("cfgBreaks").innerHTML = r.breaks.length
    ? `<div class="breaks"><h3>Ways to break the path</h3><ul>${r.breaks.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></div>` : "";
  $("cfgFlags").innerHTML = r.flags.length
    ? r.flags.map((f) => `<div class="cfgflag"><span class="lvl lvl-${f.level}">${f.level}</span><div><span class="who">${esc(f.server)}:</span> ${esc(f.text)}</div></div>`).join("")
    : '<p class="small">Nothing else stood out in what you pasted.</p>';
  $("cfgServers").innerHTML = `<thead><tr><th class="rowhead">Name</th><th>What it is</th><th>What it can do</th></tr></thead><tbody>${
    r.servers.map((sv) => {
      const caps = capLabels(sv.caps), maybe = capLabels(sv.maybe);
      const can = [...caps, ...maybe.map((m) => m + " (depends on setup)")];
      return `<tr><td class="rowhead">${esc(sv.name)}${sv.disabled ? '<span class="idx">disabled</span>' : ""}</td>
        <td>${sv.recognised ? esc(sv.kinds.join(", ")) : "Not recognised"}</td>
        <td class="notes">${can.length ? esc(can.join("; ")) : (sv.recognised ? "No outside reach on its own" : "Unknown. Assume it can do anything until checked.")}${sv.notes.length ? "<br>" + esc(sv.notes[0]) : ""}</td></tr>`;
    }).join("")}</tbody>`;
  $("cfgVerdict").focus({ preventScroll: true });
  $("cfgVerdict").scrollIntoView({ block: "start", behavior: "smooth" });
}

$("cfgRun").onclick = () => {
  $("cfgErr").textContent = ""; $("cfgCopied").textContent = "";
  const r = checkConfig($("cfgText").value);
  if (r.error) { $("cfgOut").hidden = true; lastConfig = null; $("cfgErr").textContent = r.error; hist.refresh(); return; }
  lastConfig = r;
  renderConfig(r);
  hist.refresh();
};

$("cfgCopy").onclick = async () => {
  if (!lastConfig) return;
  try {
    await navigator.clipboard.writeText(summaryText(lastConfig));
    $("cfgCopied").textContent = "Copied.";
  } catch {
    $("cfgCopied").textContent = "Couldn't copy. Select the text above instead.";
  }
};

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

// ---------- saved checks (account, history, compare) ----------
// Loaded after the page starts and wrapped in try/catch, so a missing file or a failed load
// can never stop the assessment or the configuration check from working.
(async () => {
  try {
    const [{ snapshotConfig }, { mountHistoryPanel }] = await Promise.all([import("../assets/history.js"), import("../assets/history-panel.js")]);
    hist = mountHistoryPanel({
      el: $("historyPanel"), sb, tool: "sentinel", contactEmail: CONTACT_EMAIL, proPriceLabel: PRO_PRICE_LABEL,
      getSnapshot: () => (lastConfig ? snapshotConfig(lastConfig) : null),
    });
  } catch (err) {
    console.error("Saved checks unavailable", err);
    const el = $("historyPanel"); if (el) el.hidden = true;
  }
})();

boot();
