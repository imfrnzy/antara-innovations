import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, FREE_REPORT_LIMIT, PRICE_LABEL, CONTACT_EMAIL } from "./config.js";
import { assessOutcome, outcomeFacts, assessQueryRisk } from "./engine.js";
import { fundingStatus, scoreTrack, flagsFor, sortCheckins, worstSeverity } from "./agent-rules.js";
import { practiceSummary, summaryLines, outcomesCsv } from "./outcomes.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const byId = (id) => document.getElementById(id);
const PENDING_KEY = "manifest.pendingForm";

byId("priceLabel").textContent = PRICE_LABEL;
byId("gatePrice").textContent = PRICE_LABEL + ".";
byId("gateContact").href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Manifest — continuing past the free tier")}`;

const SCREENS = ["s-intro", "s-form", "s-riskcheck", "s-authgate", "s-loading", "s-limitgate", "s-draft", "s-reports", "s-clients", "s-clientform", "s-client"];
function show(id) {
  SCREENS.forEach((s) => byId(s).classList.toggle("on", s === id));
  window.scrollTo(0, 0);
}

// ensureSession is for the test-taking / form-filling part of the flow only,
// it never needs to be a real identity, an anonymous session is fine there.
// Whether this person is *allowed* to generate a report is decided later,
// at the gate, by checking isRealSession, never by this.
async function ensureSession() {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
  return session;
}

// True only once someone has actually verified an email via the code gate
// below (or returns with that verification already on file in this browser).
// Supabase marks a still-anonymous session explicitly, this is never
// inferred from anything else.
async function isRealSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return !!(session && session.user && session.user.is_anonymous === false);
}

async function upsertProfile(email) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from("manifest_profiles").upsert({ user_id: session.user.id, work_email: email });
}

byId("beginBtn").addEventListener("click", async () => {
  try {
    await ensureSession();
    setPrefillNote(null);
    show("s-form");
  } catch (e) {
    console.error(e);
    alert("Couldn't start a session. Try reloading the page.");
  }
});

byId("insurerSelect").addEventListener("change", (e) => {
  byId("bupaFields").hidden = e.target.value !== "bupa";
});

byId("reportForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = byId("formError");
  errEl.hidden = true;

  const fd = new FormData(e.target);
  const val = (k) => (fd.get(k) ?? "").toString().trim();
  const num = (k) => (val(k) === "" ? null : Number(val(k)));

  // reportForm carries novalidate (added so the range check below can show
  // a styled message instead of a silent native block), which also turns
  // off the native "required" prompts, so this is now the only thing
  // enforcing those two fields, not just the numeric range check below.
  if (!val("client_ref")) {
    errEl.textContent = "Client reference is required.";
    errEl.hidden = false;
    return;
  }
  if (!val("progress")) {
    errEl.textContent = "Progress against goals is required.";
    errEl.hidden = false;
    return;
  }

  const sessionsCompleted = num("sessions_completed");
  const sessionsRequested = num("sessions_requested");
  if (sessionsCompleted === null || sessionsRequested === null) {
    errEl.textContent = "Sessions completed and sessions requested are both required.";
    errEl.hidden = false;
    return;
  }
  if (sessionsCompleted < 0 || sessionsCompleted > 200) {
    errEl.textContent = "Sessions completed so far should be 200 or fewer.";
    errEl.hidden = false;
    return;
  }
  if (sessionsRequested < 1 || sessionsRequested > 52) {
    errEl.textContent = "Further sessions requested should be between 1 and 52.";
    errEl.hidden = false;
    return;
  }

  const formPayload = {
    insurer: val("insurer"),
    client_ref: val("client_ref"),
    sessions_completed: sessionsCompleted,
    sessions_requested: sessionsRequested,
    presenting_issue: val("presenting_issue"),
    goals: val("goals"),
    progress: val("progress"),
    risk: val("risk"),
    phq9_baseline: val("phq9_baseline") || null,
    phq9_latest: val("phq9_latest") || null,
    gad7_baseline: val("gad7_baseline") || null,
    gad7_latest: val("gad7_latest") || null,
    no_measures_reason: val("no_measures_reason"),
    deterioration_rationale: val("deterioration_rationale"),
    diagnosis: val("diagnosis"),
    modality: val("modality"),
    modality_change_reason: val("modality_change_reason"),
    session_frequency: val("session_frequency"),
    last_session_date: val("last_session_date"),
    treatment_break: val("treatment_break"),
    other_professionals: val("other_professionals"),
    concludes_treatment: val("concludes_treatment"),
    further_goals: val("further_goals"),
    risk_assessment_date: val("risk_assessment_date"),
    risk_level: val("risk_level"),
    risk_plan: val("risk_plan"),
  };

  // The risk check runs entirely here, client side, against fixed rules,
  // before anything is sent anywhere, so it costs nothing and needs no
  // session. pendingFormPayload is read by the Continue/Back buttons below.
  const outcomeForCheck = assessOutcome({
    phq9: (formPayload.phq9_baseline && formPayload.phq9_latest) ? { baseline: +formPayload.phq9_baseline, latest: +formPayload.phq9_latest } : null,
    gad7: (formPayload.gad7_baseline && formPayload.gad7_latest) ? { baseline: +formPayload.gad7_baseline, latest: +formPayload.gad7_latest } : null,
  });
  const flags = assessQueryRisk(formPayload, outcomeForCheck);
  pendingFormPayload = formPayload;
  renderRiskCheck(flags, formPayload.insurer);
  show("s-riskcheck");
});

let pendingFormPayload = null;

function renderRiskCheck(flags, insurer) {
  const insurerLabel = insurer === "axa" ? "AXA" : insurer === "bupa" ? "Bupa" : "this insurer";
  byId("riskCheckLead").textContent = flags.length === 0
    ? `Checked against what ${insurerLabel} is documented to ask for. Nothing stood out.`
    : `Checked against what ${insurerLabel} is documented to ask for, ${flags.length} thing${flags.length === 1 ? "" : "s"} worth a look before this goes anywhere.`;

  const list = byId("riskFlagsList");
  list.innerHTML = "";
  if (flags.length === 0) {
    const clean = document.createElement("p");
    clean.className = "flag-clean";
    clean.textContent = "No gaps found against the documented requirements for this insurer. Your own clinical judgement still comes first, this is a check, not a guarantee.";
    list.appendChild(clean);
  } else {
    flags.forEach((f) => {
      const item = document.createElement("div");
      item.className = `flag-item ${f.severity}`;
      const dot = document.createElement("span");
      dot.className = "flag-dot";
      const text = document.createElement("div");
      const msg = document.createElement("p");
      msg.className = "flag-message";
      msg.textContent = f.message;
      const why = document.createElement("p");
      why.className = "flag-why";
      why.textContent = f.why;
      text.appendChild(msg);
      text.appendChild(why);
      item.appendChild(dot);
      item.appendChild(text);
      list.appendChild(item);
    });
  }
  byId("riskContinueBtn").textContent = flags.length === 0 ? "Continue" : "I've reviewed this, draft it anyway";
}

byId("riskBackBtn").addEventListener("click", () => {
  show("s-form");
});

byId("riskContinueBtn").addEventListener("click", async () => {
  const formPayload = pendingFormPayload;
  if (!formPayload) { show("s-form"); return; }
  const errEl = byId("formError");

  try {
    await ensureSession();
  } catch (e2) {
    console.error(e2);
    show("s-form");
    errEl.textContent = "Couldn't start a session. Try reloading the page.";
    errEl.hidden = false;
    return;
  }

  // A real, verified identity is what the free-report count is actually
  // checked against server side. First time through in this browser, that
  // doesn't exist yet, so the form is parked exactly as filled in and the
  // email-and-code gate runs once. Already verified, from this report or an
  // earlier one, this skips straight through every time after.
  if (await isRealSession()) {
    await generateDraft(formPayload, errEl);
  } else {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(formPayload));
    setAuthMode("report");
    show("s-authgate");
  }
});

let lastDraftPayload = null;
async function generateDraft(formPayload, errEl) {
  show("s-loading");
  try {
    const { data, error } = await supabase.functions.invoke("manifest-draft", { body: formPayload });

    // manifest-draft always returns 200, ok:true with a draft or ok:false
    // with a reason, same proven pattern as bearing-score and ensign-score:
    // read the returned data directly, don't rely on how supabase-js
    // chooses to surface a non-2xx response.
    if (error || !data) throw error || new Error("No response from the drafting function.");
    if (data.ok === false && data.reason === "limit_reached") {
      show("s-limitgate");
      return;
    }
    if (!data.ok || !data.draft) throw new Error("Draft generation did not return a draft.");

    lastDraftPayload = formPayload;
    renderDraft({ ...data, fromForm: true });
  } catch (err) {
    console.error(err);
    show("s-form");
    if (errEl) {
      errEl.textContent = "Couldn't generate the draft just now. Your answers are still filled in, try again.";
      errEl.hidden = false;
    }
  }
}

// ---- the email + code gate ----
let pendingEmail = "";

byId("authEmailForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = byId("authEmailError");
  errEl.hidden = true;
  const email = new FormData(e.target).get("email").toString().trim();
  const btn = byId("authEmailBtn");
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = "Sending...";
  try {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw error;
    pendingEmail = email;
    byId("authCodeSentTo").textContent = `We've sent a code to ${email}.`;
    byId("authEmailForm").hidden = true;
    byId("authCodeForm").hidden = false;
    byId("authCodeForm").querySelector('input[name="code"]').focus();
  } catch (err) {
    console.error(err);
    errEl.textContent = "Couldn't send a code just now. Check the address and try again.";
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

byId("authCodeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = byId("authCodeError");
  errEl.hidden = true;
  const code = new FormData(e.target).get("code").toString().trim();
  const btn = byId("authCodeBtn");
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = "Verifying...";
  try {
    const { data, error } = await supabase.auth.verifyOtp({ email: pendingEmail, token: code, type: "email" });
    if (error || !data.session) throw error || new Error("Verification failed.");

    await upsertProfile(pendingEmail);

    byId("authEmailForm").reset();
    byId("authCodeForm").reset();
    byId("authEmailForm").hidden = false;
    byId("authCodeForm").hidden = true;

    const pending = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    const intent = authIntent;
    authIntent = "report";
    refreshReturningUi();
    if (pending) {
      await generateDraft(JSON.parse(pending), null);
    } else if (intent === "signin") {
      await routeAfterSignIn();
    } else {
      show("s-form");
    }
  } catch (err) {
    console.error(err);
    errEl.textContent = "That code didn't work. Double check it, or send a new one below.";
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

byId("authResendBtn").addEventListener("click", async () => {
  if (!pendingEmail) return;
  const btn = byId("authResendBtn");
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = "Sending...";
  try {
    const { error } = await supabase.auth.signInWithOtp({ email: pendingEmail, options: { shouldCreateUser: true } });
    if (error) throw error;
  } catch (err) {
    console.error(err);
  } finally {
    setTimeout(() => { btn.disabled = false; btn.textContent = originalLabel; }, 2000);
  }
});

// If someone verified in this browser already (an earlier report this
// session, or a previous visit whose session is still valid) but somehow
// still has a parked form, usually from closing the tab mid-verification,
// pick it straight back up rather than asking them to start over.
(async () => {
  const pending = sessionStorage.getItem(PENDING_KEY);
  if (pending && (await isRealSession())) {
    sessionStorage.removeItem(PENDING_KEY);
    show("s-loading");
    await generateDraft(JSON.parse(pending), null);
  }
})();

function renderDraft(data) {
  byId("draftText").value = data.draft ?? "";
  const usedLabel = data.used <= FREE_REPORT_LIMIT ? `${data.used} of ${FREE_REPORT_LIMIT} free reports used` : `${data.used} reports`;
  byId("usedCount").textContent = data.savedOn ? `Saved ${data.savedOn}, ${usedLabel}` : usedLabel;
  const factsPanel = byId("factsPanel");
  factsPanel.innerHTML = "";
  const title = document.createElement("p");
  title.className = "panel-label";
  title.textContent = "The calculated facts behind this draft";
  factsPanel.appendChild(title);
  (data.facts ?? []).forEach((line) => {
    const p = document.createElement("p");
    p.className = "fact-line";
    p.textContent = line;
    factsPanel.appendChild(p);
  });
  byId("trackCard").hidden = !(data.fromForm && lastDraftPayload);
  show("s-draft");
}

byId("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(byId("draftText").value);
  const btn = byId("copyBtn");
  const original = btn.textContent;
  btn.textContent = "Copied";
  setTimeout(() => { btn.textContent = original; }, 1500);
});

byId("downloadBtn").addEventListener("click", () => {
  const blob = new Blob([byId("draftText").value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "manifest-report.txt";
  a.click();
  URL.revokeObjectURL(url);
});

byId("anotherBtn").addEventListener("click", () => {
  byId("reportForm").reset();
  byId("bupaFields").hidden = true;
  setPrefillNote(null);
  show("s-form");
});

// ===================================================================
// Returning clinicians: sign in without filling a form, see every
// saved report, reopen a draft, or start the next review from the last.
// Reads only the signed-in person's own rows (row level security).
// ===================================================================
const AUTH_DEFAULT = { title: byId("authTitle").textContent, lead: byId("authLead").textContent };
let authIntent = "report";
let savedReports = [];

function setAuthMode(mode) {
  authIntent = mode;
  const signin = mode === "signin";
  byId("authTitle").textContent = signin ? "Sign in to see your clients and reports." : AUTH_DEFAULT.title;
  byId("authLead").textContent = signin
    ? "Enter the email you used before and we'll send you a code. No password needed."
    : AUTH_DEFAULT.lead;
  byId("authBackBtn").hidden = !signin;
  byId("authEmailForm").hidden = false;
  byId("authCodeForm").hidden = true;
}

async function refreshReturningUi() {
  const real = await isRealSession();
  byId("signInBtn").hidden = real;
  byId("myReportsBtn").hidden = !real;
  byId("returningLead").textContent = real ? "Welcome back." : "Been here before?";
}

async function startSignIn() {
  // A parked, half-finished form from an earlier visit must never be turned
  // into a report by signing in, so it is dropped here.
  sessionStorage.removeItem(PENDING_KEY);
  if (await isRealSession()) { await openClients(); return; }
  setAuthMode("signin");
  show("s-authgate");
}

byId("signInBtn").addEventListener("click", startSignIn);
byId("myReportsBtn").addEventListener("click", () => openClients());
byId("draftMyReportsBtn").addEventListener("click", () => openClients());
byId("limitMyReportsBtn").addEventListener("click", () => openClients());
byId("authBackBtn").addEventListener("click", () => { setAuthMode("report"); show("s-intro"); });
byId("reportsNewBtn").addEventListener("click", () => {
  byId("reportForm").reset();
  byId("bupaFields").hidden = true;
  setPrefillNote(null);
  show("s-form");
});
byId("reportsSignOutBtn").addEventListener("click", async () => {
  // scope "local" ends this browser's session only. The default would end
  // every session for this account, on every device and in every other app
  // that shares this login.
  try { await supabase.auth.signOut({ scope: "local" }); } catch (e) { console.error(e); }
  sessionStorage.removeItem(PENDING_KEY);
  savedReports = [];
  await refreshReturningUi();
  show("s-intro");
});

refreshReturningUi();

const INSURER_LABEL = { axa: "AXA", bupa: "Bupa", other: "Other insurer" };
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function openReports() {
  if (!(await isRealSession())) { await startSignIn(); return; }
  const errEl = byId("reportsError");
  errEl.hidden = true;
  byId("reportsList").innerHTML = "";
  show("s-reports");
  const { data, error } = await supabase
    .from("manifest_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    console.error(error);
    errEl.textContent = "Couldn't load your reports just now. Try again in a moment.";
    errEl.hidden = false;
    return;
  }
  savedReports = data ?? [];
  renderReports();
}

function renderReports() {
  const list = byId("reportsList");
  list.innerHTML = "";
  if (savedReports.length === 0) {
    const empty = document.createElement("p");
    empty.className = "reports-empty";
    empty.textContent = "No reports yet on this email. Draft your first one and it will be kept here.";
    list.appendChild(empty);
    return;
  }

  // One card per client reference, newest report first. Case and spacing are
  // ignored so "A-07" and "a-07 " count as the same client.
  const groups = new Map();
  savedReports.forEach((r) => {
    const key = (r.client_ref || "").trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });

  groups.forEach((reports) => {
    const latest = reports[0];
    const card = document.createElement("div");
    card.className = "client-card";

    const title = document.createElement("h3");
    title.textContent = latest.client_ref;
    card.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "client-meta";
    meta.textContent = `${INSURER_LABEL[latest.insurer] ?? "Insurer"}, last report ${fmtDate(latest.created_at)}, ` +
      `${reports.length} report${reports.length === 1 ? "" : "s"}`;
    card.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "client-actions";
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "btn-secondary";
    openBtn.textContent = "Open latest draft";
    openBtn.addEventListener("click", () => openSavedReport(latest));
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn-primary";
    nextBtn.textContent = "Update for next review";
    nextBtn.addEventListener("click", () => prefillFromReport(latest));
    const trackBtn = document.createElement("button");
    trackBtn.type = "button";
    trackBtn.className = "btn-secondary";
    trackBtn.textContent = "Start tracking this client";
    trackBtn.addEventListener("click", () => trackFromReport(latest));
    actions.appendChild(openBtn);
    actions.appendChild(nextBtn);
    actions.appendChild(trackBtn);
    card.appendChild(actions);

    if (reports.length > 1) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `Earlier reports (${reports.length - 1})`;
      details.appendChild(summary);
      reports.slice(1).forEach((r) => {
        const row = document.createElement("div");
        row.className = "earlier-row";
        const label = document.createElement("span");
        label.textContent = fmtDate(r.created_at);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "link-btn";
        btn.textContent = "Open";
        btn.addEventListener("click", () => openSavedReport(r));
        row.appendChild(label);
        row.appendChild(btn);
        details.appendChild(row);
      });
      card.appendChild(details);
    }
    list.appendChild(card);
  });
}

function openSavedReport(r) {
  if (!r.draft_text) {
    const errEl = byId("reportsError");
    errEl.textContent = "That report has no saved draft. Use Update for next review to make a fresh one.";
    errEl.hidden = false;
    window.scrollTo(0, 0);
    return;
  }
  renderDraft({
    draft: r.draft_text,
    used: savedReports.length,
    facts: Array.isArray(r.outcome_facts) ? r.outcome_facts : [],
    savedOn: fmtDate(r.created_at),
  });
}

function setPrefillNote(text) {
  byId("prefillNote").hidden = !text;
  byId("prefillNoteText").textContent = text ?? "";
}

// Starts the next review from a saved report. What stays true between
// reviews is carried over. Anything that goes stale (session counts, latest
// scores, progress, dates, risk) is left empty on purpose: a carried-over
// risk assessment date would otherwise quietly pass the insurer's "within
// the last 10 days" check, and a carried-over session count would be wrong.
function prefillFromReport(r) {
  const form = byId("reportForm");
  form.reset();
  const set = (name, value) => { const el = form.elements[name]; if (el) el.value = value ?? ""; };
  [
    "insurer", "client_ref", "presenting_issue", "goals", "no_measures_reason",
    "deterioration_rationale", "diagnosis", "modality", "modality_change_reason",
    "session_frequency", "treatment_break", "other_professionals",
    "concludes_treatment", "further_goals", "risk_plan",
  ].forEach((k) => set(k, r[k]));

  // Baseline scores are only kept inside the saved calculated facts, in the
  // fixed wording the engine writes: "PHQ-9: baseline 16, latest 9 (...".
  const facts = Array.isArray(r.outcome_facts) ? r.outcome_facts : [];
  facts.forEach((line) => {
    const m = /^(PHQ-9|GAD-7): baseline (\d+),/.exec(String(line));
    if (m) set(m[1] === "PHQ-9" ? "phq9_baseline" : "gad7_baseline", m[2]);
  });

  byId("bupaFields").hidden = form.elements["insurer"].value !== "bupa";
  setPrefillNote(
    `Kept from your report of ${fmtDate(r.created_at)}: goals, diagnosis, modality, baseline scores and the other settled details. ` +
    `Left empty for you, because they change every time: sessions, latest scores, progress, last session date, and the risk fields. ` +
    `Check the risk management plan still applies.`
  );
  show("s-form");
  const first = form.elements["sessions_completed"];
  if (first) first.focus();
}

// ===================================================================
// Clients: the case file, session check-ins, and the agent's watch on
// funding and scores. Rules live in agent-rules.js and are the same ones
// the nightly emailer uses. All reads and writes go through row level
// security: a clinician only ever touches their own rows.
// ===================================================================
let clients = [];            // active and closed, newest first
let checkinsByClient = {};   // client_id -> rows
let currentClientId = null;
let editingClientId = null;

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const intOrNull = (v) => { const s = String(v ?? "").trim(); if (s === "") return null; const n = Number(s); return Number.isInteger(n) ? n : NaN; };
const fmtShort = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
function showErr(id, msg) { const e = byId(id); e.textContent = msg; e.hidden = !msg; }

async function routeAfterSignIn() {
  // Brand new email: nothing to look at, so go straight to starting. Never
  // park a first-time clinician on an empty account page.
  try {
    const [c, r] = await Promise.all([
      supabase.from("manifest_clients").select("id", { count: "exact", head: true }),
      supabase.from("manifest_reports").select("id", { count: "exact", head: true }),
    ]);
    if (c.error && r.error) throw c.error;
    const nClients = c.error ? 0 : (c.count ?? 0);
    const nReports = r.error ? 0 : (r.count ?? 0);
    if (nClients > 0 || (!c.error && nReports > 0)) { await openClients(); return; }
    if (c.error && nReports > 0) { await openReports(); return; }
  } catch (e) {
    // Couldn't tell what is on this email. Never claim it is new: show the
    // clients page, which says plainly it couldn't load and lets them retry.
    console.error(e);
    await openClients();
    return;
  }
  byId("reportForm").reset();
  byId("bupaFields").hidden = true;
  setPrefillNote("You're signed in. This email is new to Manifest, so there is nothing saved on it yet. Start with your first report here, and afterwards you can track the client to get funding reminders.");
  show("s-form");
}

async function loadClients() {
  const { data: cs, error } = await supabase.from("manifest_clients").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  clients = cs ?? [];
  const ids = clients.map((c) => c.id);
  checkinsByClient = {};
  if (ids.length) {
    const { data: ks, error: kErr } = await supabase.from("manifest_checkins").select("*").in("client_id", ids).limit(5000);
    if (kErr) throw kErr;
    (ks ?? []).forEach((k) => { (checkinsByClient[k.client_id] ??= []).push(k); });
  }
}

async function openClients() {
  if (!(await isRealSession())) { await startSignIn(); return; }
  showErr("clientsError", "");
  byId("clientsList").innerHTML = "";
  byId("clientsAttention").innerHTML = "";
  byId("clientsPastNote").hidden = true;
  byId("clientsList").appendChild(el("p", "fine-print", "Loading your clients..."));
  show("s-clients");
  try {
    await loadClients();
  } catch (e) {
    console.error(e);
    showErr("clientsError", "Couldn't load your clients just now. Try again in a moment.");
    return;
  }
  renderClients();
  renderOutcomes();
}

function renderOutcomes() {
  const box = byId("clientsOutcomes");
  const lines = summaryLines(practiceSummary(clients, checkinsByClient));
  if (!clients.length || !lines.length) { box.hidden = true; return; }
  const holder = byId("outcomesLines");
  holder.innerHTML = "";
  lines.forEach((line) => holder.appendChild(el("p", "", line)));
  box.hidden = false;
}

byId("outcomesBtn").addEventListener("click", () => {
  const csv = outcomesCsv(clients, checkinsByClient);
  if (!csv) return;
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `manifest-outcomes-${todayLocal()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function fundingLine(f) {
  if (f.level === "out") return `Funded sessions used up: ${f.used} of ${f.authorised}`;
  return `${f.used} of ${f.authorised} funded sessions used, ${f.left} left`;
}

function fundingBar(f) {
  const bar = el("div", `funding-bar ${f.level === "ok" ? "" : f.level}`);
  const fill = el("span");
  fill.style.width = `${Math.max(0, Math.min(100, Math.round((f.used / Math.max(1, f.authorised)) * 100)))}%`;
  bar.appendChild(fill);
  return bar;
}

function renderFlagChips(flags) {
  const wrap = el("div");
  flags.forEach((fl) => wrap.appendChild(el("span", `chip ${fl.severity}`, fl.text)));
  return wrap;
}

async function renderClients() {
  const list = byId("clientsList");
  list.innerHTML = "";
  const active = clients.filter((c) => c.status === "active");
  const closed = clients.filter((c) => c.status === "closed");

  if (clients.length === 0) {
    list.appendChild(el("p", "reports-empty", "No clients yet. Add one and log each session, and Manifest will count your funded sessions and email you before they run out."));
  }

  // Needs attention first.
  const rows = active.map((c) => {
    const ks = checkinsByClient[c.id] ?? [];
    return { c, f: fundingStatus(c, ks), flags: flagsFor(c, ks) };
  }).sort((x, y) => {
    const rank = { red: 0, amber: 1, ok: 2 };
    return rank[worstSeverity(x.flags)] - rank[worstSeverity(y.flags)];
  });
  const needAttention = rows.filter((r) => r.flags.length).length;
  const att = byId("clientsAttention");
  att.innerHTML = "";
  if (needAttention) att.appendChild(el("p", "reports-empty", `${needAttention} client${needAttention === 1 ? "" : "s"} need${needAttention === 1 ? "s" : ""} a look.`));

  rows.forEach(({ c, f, flags }) => {
    const sev = worstSeverity(flags);
    const card = el("div", `client-card${sev === "ok" ? "" : " attention " + sev}`);
    card.appendChild(el("h3", "", c.client_ref));
    card.appendChild(el("p", "client-meta", `${INSURER_LABEL[c.insurer] ?? "Insurer"}, ${fundingLine(f)}`));
    card.appendChild(fundingBar(f));
    if (flags.length) card.appendChild(renderFlagChips(flags));
    const actions = el("div", "client-actions");
    const open = el("button", "btn-primary", "Open");
    open.type = "button";
    open.addEventListener("click", () => openClient(c.id));
    actions.appendChild(open);
    card.appendChild(actions);
    list.appendChild(card);
  });

  if (closed.length) {
    const d = el("details", "sessions-box");
    d.appendChild(el("summary", "", `Closed clients (${closed.length})`));
    closed.forEach((c) => {
      const row = el("div", "earlier-row");
      row.appendChild(el("span", "", c.client_ref));
      const b = el("button", "link-btn", "Reopen");
      b.type = "button";
      b.addEventListener("click", async () => {
        const { error } = await supabase.from("manifest_clients").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", c.id);
        if (error) { showErr("clientsError", "Couldn't reopen that client."); return; }
        await openClients();
      });
      row.appendChild(b);
      d.appendChild(row);
    });
    list.appendChild(d);
  }

  // Past reports that were never turned into tracked clients.
  const note = byId("clientsPastNote");
  note.hidden = true;
  if (clients.length === 0) {
    const { count } = await supabase.from("manifest_reports").select("id", { count: "exact", head: true });
    if (count) {
      note.textContent = `You also have ${count} past report${count === 1 ? "" : "s"} on this email. Open Past reports and choose "Start tracking this client" to bring one in.`;
      note.hidden = false;
    }
  }
}

byId("addClientBtn").addEventListener("click", () => openClientForm(null));
byId("pastReportsBtn").addEventListener("click", () => openReports());
byId("reportsBackBtn").addEventListener("click", () => openClients());
byId("clientsSignOutBtn").addEventListener("click", () => byId("reportsSignOutBtn").click());

// ---- add / edit a client ----
function fillClientForm(values) {
  const f = byId("clientForm");
  f.reset();
  const set = (n, v) => { const x = f.elements[n]; if (x) x.value = v ?? ""; };
  ["client_ref", "insurer", "sessions_authorised", "sessions_done_before", "phq9_baseline", "gad7_baseline",
    "presenting_issue", "goals", "diagnosis", "modality", "session_frequency", "other_professionals"].forEach((k) => set(k, values[k]));
  f.elements["reminders"].checked = values.reminders !== false;
  if (!f.elements["insurer"].value) f.elements["insurer"].value = "axa";
}

function openClientForm(clientId, prefill) {
  editingClientId = clientId;
  showErr("clientFormError", "");
  const c = clientId ? clients.find((x) => x.id === clientId) : null;
  fillClientForm(c ?? prefill ?? { sessions_done_before: 0 });
  byId("cfEyebrow").textContent = c ? "Edit client" : "Add a client";
  byId("cfTitle").textContent = c ? c.client_ref : (prefill ? "Check these, then save." : "Set the client up once.");
  byId("clientDanger").hidden = !c;
  byId("clientCloseBtn").textContent = c && c.status === "closed" ? "Reopen this client" : "Close this client";
  show("s-clientform");
}

byId("clientCancelBtn").addEventListener("click", () => { if (editingClientId) openClient(editingClientId); else openClients(); });

byId("clientForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  showErr("clientFormError", "");
  const f = e.target;
  const v = (n) => f.elements[n].value.trim();
  const ref = v("client_ref");
  const authorised = intOrNull(f.elements["sessions_authorised"].value);
  const before = intOrNull(f.elements["sessions_done_before"].value);
  const phq = intOrNull(f.elements["phq9_baseline"].value);
  const gad = intOrNull(f.elements["gad7_baseline"].value);
  if (!ref) return showErr("clientFormError", "Client reference is required. A code or initials, never a full name.");
  if (authorised === null || Number.isNaN(authorised) || authorised < 1 || authorised > 300) return showErr("clientFormError", "Sessions funded in total should be a number from 1 to 300.");
  if (before === null || Number.isNaN(before) || before < 0 || before > 300) return showErr("clientFormError", "Sessions already held should be a number from 0 to 300. Enter 0 for a new client.");
  if (Number.isNaN(phq) || (phq !== null && (phq < 0 || phq > 27))) return showErr("clientFormError", "PHQ-9 should be between 0 and 27.");
  if (Number.isNaN(gad) || (gad !== null && (gad < 0 || gad > 21))) return showErr("clientFormError", "GAD-7 should be between 0 and 21.");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return showErr("clientFormError", "You've been signed out. Sign in again to save.");
  const row = {
    client_ref: ref, insurer: v("insurer"), sessions_authorised: authorised, sessions_done_before: before,
    phq9_baseline: phq, gad7_baseline: gad,
    presenting_issue: v("presenting_issue") || null, goals: v("goals") || null, diagnosis: v("diagnosis") || null,
    modality: v("modality") || null, session_frequency: v("session_frequency") || null, other_professionals: v("other_professionals") || null,
    reminders: f.elements["reminders"].checked, updated_at: new Date().toISOString(),
  };
  const btn = byId("clientSaveBtn");
  btn.disabled = true;
  try {
    let res;
    if (editingClientId) res = await supabase.from("manifest_clients").update(row).eq("id", editingClientId).select("id").single();
    else res = await supabase.from("manifest_clients").insert({ ...row, user_id: session.user.id }).select("id").single();
    if (res.error) {
      if (res.error.code === "23505") return showErr("clientFormError", "You already have a client with that reference. Open them from My clients instead.");
      throw res.error;
    }
    await loadClients();
    await openClient(res.data.id);
  } catch (err) {
    console.error(err);
    showErr("clientFormError", "Couldn't save just now. Check your connection and try again.");
  } finally {
    btn.disabled = false;
  }
});

byId("clientCloseBtn").addEventListener("click", async () => {
  const c = clients.find((x) => x.id === editingClientId);
  if (!c) return;
  const next = c.status === "closed" ? "active" : "closed";
  const { error } = await supabase.from("manifest_clients").update({ status: next, updated_at: new Date().toISOString() }).eq("id", c.id);
  if (error) return showErr("clientFormError", "Couldn't update that client.");
  await openClients();
});
byId("clientDeleteBtn").addEventListener("click", async () => {
  const c = clients.find((x) => x.id === editingClientId);
  if (!c) return;
  if (!confirm(`Delete ${c.client_ref} and every session logged for them? This can't be undone. Saved reports are kept.`)) return;
  const { error } = await supabase.from("manifest_clients").delete().eq("id", c.id);
  if (error) return showErr("clientFormError", "Couldn't delete that client.");
  await openClients();
});

// Start tracking from something already drafted.
async function trackFromReport(r) {
  try { await loadClients(); } catch (e) { console.error(e); showErr("reportsError", "Couldn't reach client tracking just now."); return; }
  const existing = clients.find((c) => c.client_ref.trim().toLowerCase() === (r.client_ref || "").trim().toLowerCase());
  if (existing) { await openClient(existing.id); return; }
  const base = {};
  (Array.isArray(r.outcome_facts) ? r.outcome_facts : []).forEach((line) => {
    const m = /^(PHQ-9|GAD-7): baseline (\d+),/.exec(String(line));
    if (m) base[m[1] === "PHQ-9" ? "phq9_baseline" : "gad7_baseline"] = m[2];
  });
  openClientForm(null, {
    client_ref: r.client_ref, insurer: r.insurer, presenting_issue: r.presenting_issue, goals: r.goals,
    diagnosis: r.diagnosis, modality: r.modality, session_frequency: r.session_frequency, other_professionals: r.other_professionals,
    sessions_done_before: r.sessions_completed,
    sessions_authorised: (r.sessions_completed ?? 0) + (r.sessions_requested ?? 0),
    ...base,
  });
  byId("cfTitle").textContent = "Check these, then save.";
}
byId("trackBtn").addEventListener("click", async () => {
  const p = lastDraftPayload;
  if (!p) return;
  await trackFromReport({
    client_ref: p.client_ref, insurer: p.insurer, presenting_issue: p.presenting_issue, goals: p.goals, diagnosis: p.diagnosis,
    modality: p.modality, session_frequency: p.session_frequency, other_professionals: p.other_professionals,
    sessions_completed: p.sessions_completed, sessions_requested: p.sessions_requested,
    outcome_facts: [
      ...(p.phq9_baseline ? [`PHQ-9: baseline ${p.phq9_baseline},`] : []),
      ...(p.gad7_baseline ? [`GAD-7: baseline ${p.gad7_baseline},`] : []),
    ],
  });
});

// ---- one client ----
async function openClient(id) {
  currentClientId = id;
  showErr("cdError", "");
  byId("cdReplyOut").hidden = true;
  byId("cdReplyText").value = "";
  showErr("cdReplyError", "");
  show("s-client");
  try {
    if (!clients.find((c) => c.id === id)) await loadClients();
    const { data: ks, error } = await supabase.from("manifest_checkins").select("*").eq("client_id", id).limit(2000);
    if (error) throw error;
    checkinsByClient[id] = ks ?? [];
  } catch (e) {
    console.error(e);
    showErr("cdError", "Couldn't load this client just now. Try again in a moment.");
    return;
  }
  renderClient();
}

function renderClient() {
  const c = clients.find((x) => x.id === currentClientId);
  if (!c) { openClients(); return; }
  const ks = sortCheckins(checkinsByClient[c.id] ?? []);
  const f = fundingStatus(c, ks);
  byId("cdInsurer").textContent = INSURER_LABEL[c.insurer] ?? "Insurer";
  byId("cdTitle").textContent = c.client_ref;
  byId("cdFunding").textContent = fundingLine(f);

  const flagsEl = byId("cdFlags");
  flagsEl.innerHTML = "";
  flagsEl.appendChild(fundingBar(f));
  flagsEl.appendChild(renderFlagChips(flagsFor(c, ks)));

  const form = byId("checkinForm");
  if (!form.elements["session_date"].value) form.elements["session_date"].value = todayLocal();
  showErr("checkinError", "");

  const box = byId("cdSessions");
  box.innerHTML = "";
  if (ks.length) {
    const d = el("details", "sessions-box");
    d.open = true;
    d.appendChild(el("summary", "", `Sessions logged here (${ks.length})`));
    [...ks].reverse().forEach((k) => {
      const row = el("div", "session-row");
      row.appendChild(el("span", "when", fmtShort(k.session_date)));
      const what = el("div", "what");
      const scores = [k.phq9 != null ? `PHQ-9 ${k.phq9}` : null, k.gad7 != null ? `GAD-7 ${k.gad7}` : null].filter(Boolean).join(", ");
      if (scores) what.appendChild(el("div", "scores", scores));
      if (k.note) what.appendChild(el("div", "", k.note));
      if (!scores && !k.note) what.appendChild(el("div", "scores", "Session counted, nothing else logged"));
      row.appendChild(what);
      const rm = el("button", "link-btn danger", "Remove");
      rm.type = "button";
      rm.addEventListener("click", async () => {
        if (!confirm("Remove this session? Your funded-session count will go back up by one.")) return;
        const { error } = await supabase.from("manifest_checkins").delete().eq("id", k.id);
        if (error) return showErr("cdError", "Couldn't remove that session.");
        await openClient(c.id);
      });
      row.appendChild(rm);
      d.appendChild(row);
    });
    box.appendChild(d);
  }
}

byId("checkinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  showErr("checkinError", "");
  const c = clients.find((x) => x.id === currentClientId);
  if (!c) return;
  const f = e.target;
  const date = f.elements["session_date"].value;
  const phq = intOrNull(f.elements["phq9"].value);
  const gad = intOrNull(f.elements["gad7"].value);
  const note = f.elements["note"].value.trim();
  if (!date) return showErr("checkinError", "Pick the session date.");
  if (date > todayLocal()) return showErr("checkinError", "That date is in the future.");
  if (Number.isNaN(phq) || (phq !== null && (phq < 0 || phq > 27))) return showErr("checkinError", "PHQ-9 should be between 0 and 27.");
  if (Number.isNaN(gad) || (gad !== null && (gad < 0 || gad > 21))) return showErr("checkinError", "GAD-7 should be between 0 and 21.");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return showErr("checkinError", "You've been signed out. Sign in again to save.");
  const btn = byId("checkinBtn");
  btn.disabled = true;
  try {
    const { error } = await supabase.from("manifest_checkins").insert({ client_id: c.id, user_id: session.user.id, session_date: date, phq9: phq, gad7: gad, note: note || null });
    if (error) throw error;
    f.elements["phq9"].value = ""; f.elements["gad7"].value = ""; f.elements["note"].value = "";
    await openClient(c.id);
  } catch (err) {
    console.error(err);
    showErr("checkinError", "Couldn't save that session. Check your connection and try again.");
  } finally {
    btn.disabled = false;
  }
});

byId("cdBackBtn").addEventListener("click", () => openClients());
byId("cdEditBtn").addEventListener("click", () => openClientForm(currentClientId));

// Build the report form from the client file and the logged sessions.
byId("cdDraftBtn").addEventListener("click", () => {
  const c = clients.find((x) => x.id === currentClientId);
  if (!c) return;
  const requested = intOrNull(byId("cdRequested").value);
  if (requested === null || Number.isNaN(requested) || requested < 1 || requested > 52) return showErr("cdError", "Further sessions requested should be between 1 and 52.");
  showErr("cdError", "");
  const ks = sortCheckins(checkinsByClient[c.id] ?? []);
  const f = fundingStatus(c, ks);
  const track = scoreTrack(c, ks);

  // Progress is the clinician's own session lines, oldest to newest, trimmed to
  // what the drafting step accepts. If it must be cut, the newest are kept.
  const lines = ks.filter((k) => k.note).map((k) => `${fmtShort(k.session_date)}: ${k.note}`);
  let progress = lines.join("\n");
  if (progress.length > 1450) {
    let kept = [];
    let len = 0;
    for (let i = lines.length - 1; i >= 0; i--) { if (len + lines[i].length + 1 > 1450) break; kept.unshift(lines[i]); len += lines[i].length + 1; }
    progress = kept.join("\n");
  }

  const form = byId("reportForm");
  form.reset();
  const set = (n, v) => { const x = form.elements[n]; if (x) x.value = v ?? ""; };
  set("insurer", c.insurer); set("client_ref", c.client_ref);
  set("sessions_completed", f.used); set("sessions_requested", requested);
  set("presenting_issue", c.presenting_issue); set("goals", c.goals); set("progress", progress);
  set("diagnosis", c.diagnosis); set("modality", c.modality); set("session_frequency", c.session_frequency); set("other_professionals", c.other_professionals);
  if (ks.length) set("last_session_date", ks[ks.length - 1].session_date);
  if (track.phq9) { set("phq9_baseline", track.phq9.baseline); set("phq9_latest", track.phq9.latest); }
  if (track.gad7) { set("gad7_baseline", track.gad7.baseline); set("gad7_latest", track.gad7.latest); }
  byId("bupaFields").hidden = c.insurer !== "bupa";
  setPrefillNote(
    `Built from ${c.client_ref}'s file and ${ks.length} logged session${ks.length === 1 ? "" : "s"}: the session count, latest scores, last session date and your session notes. ` +
    `The risk details and risk assessment date are left for you, because they have to be current. Read the progress section, it is your own lines joined together.`
  );
  show("s-form");
  const risk = form.elements["risk"];
  if (risk) risk.focus();
});

// Draft a reply to an insurer's query.
byId("cdReplyBtn").addEventListener("click", async () => {
  showErr("cdReplyError", "");
  const query = byId("cdQuery").value.trim();
  if (query.length < 10) return showErr("cdReplyError", "Paste the insurer's query first.");
  const btn = byId("cdReplyBtn");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Drafting...";
  try {
    const { data, error } = await supabase.functions.invoke("manifest-reply", { body: { client_id: currentClientId, query_text: query } });
    if (error || !data) throw error || new Error("No response.");
    if (data.ok !== true) {
      const msg = {
        verify_required: "Sign in again with your email code to use this.",
        query_too_short: "Paste the insurer's query first.",
        client_not_found: "Couldn't find that client. Go back to My clients and open them again.",
        daily_cap: "That's the limit of replies for one day. Try again tomorrow.",
        draft_failed: "Couldn't draft a reply just now. Try again in a moment.",
      }[data.reason] ?? "Couldn't draft a reply just now.";
      throw Object.assign(new Error(msg), { shown: true });
    }
    byId("cdReplyText").value = data.reply;
    const miss = byId("cdReplyMissing");
    miss.innerHTML = "";
    if ((data.missing ?? []).length) {
      miss.appendChild(el("p", "panel-label", "Manifest couldn't find these in the file. Add them before you send."));
      const ul = el("ul", "check-list");
      data.missing.forEach((m) => ul.appendChild(el("li", "", m)));
      miss.appendChild(ul);
    } else {
      miss.appendChild(el("p", "", "Everything the query asks for was in the file. Read it through before you send."));
    }
    byId("cdReplyOut").hidden = false;
  } catch (err) {
    console.error(err);
    showErr("cdReplyError", err.shown ? err.message : "Couldn't draft a reply just now. Try again in a moment.");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});
byId("cdReplyCopy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(byId("cdReplyText").value);
  const b = byId("cdReplyCopy"); const o = b.textContent; b.textContent = "Copied"; setTimeout(() => { b.textContent = o; }, 1500);
});
