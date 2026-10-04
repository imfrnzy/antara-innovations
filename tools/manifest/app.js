import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, FREE_REPORT_LIMIT, PRICE_LABEL, CONTACT_EMAIL } from "./config.js";
import { assessOutcome, outcomeFacts, assessQueryRisk } from "./engine.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const byId = (id) => document.getElementById(id);
const PENDING_KEY = "manifest.pendingForm";

byId("priceLabel").textContent = PRICE_LABEL;
byId("gatePrice").textContent = PRICE_LABEL + ".";
byId("gateContact").href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Manifest — continuing past the free tier")}`;

const SCREENS = ["s-intro", "s-form", "s-riskcheck", "s-authgate", "s-loading", "s-limitgate", "s-draft", "s-reports"];
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

    renderDraft(data);
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
      await openReports();
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
  byId("authTitle").textContent = signin ? "Sign in to see your reports." : AUTH_DEFAULT.title;
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
  if (await isRealSession()) { await openReports(); return; }
  setAuthMode("signin");
  show("s-authgate");
}

byId("signInBtn").addEventListener("click", startSignIn);
byId("myReportsBtn").addEventListener("click", () => openReports());
byId("draftMyReportsBtn").addEventListener("click", () => openReports());
byId("limitMyReportsBtn").addEventListener("click", () => openReports());
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
    actions.appendChild(openBtn);
    actions.appendChild(nextBtn);
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
