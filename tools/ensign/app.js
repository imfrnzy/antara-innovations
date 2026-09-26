import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, REPORT_PAYMENT_LINK, REPORT_PRICE_LABEL, CONTACT_EMAIL } from "./config.js";
import { SCENARIOS, DECISIONS, CONFIDENCE, ROUND_SECONDS, WRITTEN_QUESTION, ENGINE_VERSION } from "./scenarios.js";
import { assess, TRUTH_LABEL } from "./engine.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const byId = (id) => document.getElementById(id);
const STORAGE_KEY = "ensign.assessment";

const state = {
  index: 0,
  responses: [],
  writtenResult: null,
  result: null,
  assessmentId: localStorage.getItem(STORAGE_KEY),
  currentDecision: null,
};

const SCREENS = ["s-intro", "s-round", "s-written", "s-gate", "s-results", "s-loading"];
function show(screenId) {
  for (const id of SCREENS) {
    byId(id).hidden = id !== screenId;
  }
  window.scrollTo({ top: 0 });
  const heading = byId(screenId).querySelector("h1, .scenario");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
}
function escapeHtml(text) {
  const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(text ?? "").replace(/[&<>"']/g, (character) => replacements[character]);
}

async function boot() {
  byId("reportBtn").textContent = `Request the full report (${REPORT_PRICE_LABEL})`;
  show("s-intro");
}
byId("beginBtn").onclick = () => { state.index = 0; startRound(0); show("s-round"); };
byId("againBtn").onclick = () => {
  localStorage.removeItem(STORAGE_KEY);
  state.assessmentId = null; state.responses = []; state.writtenResult = null; state.index = 0;
  startRound(0); show("s-round");
};

// ---------- rounds ----------
let countdownInterval = null;
let autoTimeout = null;
let roundDeadline = 0;
function clearRoundTimers() { clearInterval(countdownInterval); clearTimeout(autoTimeout); }

function startRound(index) {
  const scenario = SCENARIOS[index];
  state.currentDecision = null;
  byId("roundCount").textContent = `Scenario ${index + 1} of ${SCENARIOS.length}`;
  byId("scenarioText").textContent = scenario.text;
  byId("timedOutNote").hidden = true;
  byId("confWrap").hidden = true;

  byId("decisionOptions").innerHTML = DECISIONS.map((option) =>
    `<button type="button" class="opt" role="radio" aria-checked="false" data-value="${option.value}">${escapeHtml(option.label)}</button>`).join("");
  byId("decisionOptions").querySelectorAll(".opt").forEach((button) => {
    button.onclick = () => onDecision(button.dataset.value);
  });
  byId("confOptions").innerHTML = CONFIDENCE.map((option) =>
    `<button type="button" role="radio" aria-checked="false" data-value="${option.value}">${escapeHtml(option.label)}</button>`).join("");
  byId("confOptions").querySelectorAll("button").forEach((button) => {
    button.onclick = () => onConfidence(button.dataset.value);
  });

  const bar = byId("timerBar");
  bar.classList.remove("running", "low");
  void bar.offsetWidth;
  bar.style.animationDuration = `${ROUND_SECONDS}s`;
  bar.classList.add("running");

  roundDeadline = Date.now() + ROUND_SECONDS * 1000;
  byId("roundTimer").textContent = `${ROUND_SECONDS}s`;
  clearRoundTimers();
  countdownInterval = setInterval(updateCountdown, 250);
  autoTimeout = setTimeout(onTimeout, ROUND_SECONDS * 1000);

  const heading = byId("scenarioText");
  heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}

function updateCountdown() {
  const remaining = Math.max(0, Math.ceil((roundDeadline - Date.now()) / 1000));
  byId("roundTimer").textContent = `${remaining}s`;
  if (remaining <= 5) byId("timerBar").classList.add("low");
}

function onDecision(value) {
  if (state.currentDecision) return;
  clearRoundTimers();
  state.currentDecision = value;
  byId("decisionOptions").querySelectorAll(".opt").forEach((button) => {
    button.setAttribute("aria-checked", String(button.dataset.value === value));
  });
  byId("confWrap").hidden = false;
}

function onConfidence(value) {
  byId("confOptions").querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-checked", String(button.dataset.value === value));
  });
  state.responses.push({ scenarioId: SCENARIOS[state.index].id, decision: state.currentDecision, confidence: value, timedOut: false });
  setTimeout(advanceRound, 260);
}

function onTimeout() {
  if (state.currentDecision) return;
  state.responses.push({ scenarioId: SCENARIOS[state.index].id, decision: null, confidence: null, timedOut: true });
  byId("timedOutNote").hidden = false;
  setTimeout(advanceRound, 1400);
}

function advanceRound() {
  clearRoundTimers();
  state.index = state.index + 1;
  if (state.index < SCENARIOS.length) {
    startRound(state.index);
  } else {
    showWrittenQuestion();
  }
}

// ---------- the graded closing question ----------
function showWrittenQuestion() {
  byId("writtenText").textContent = WRITTEN_QUESTION.text;
  byId("qWrittenPrompt").textContent = WRITTEN_QUESTION.prompt;
  byId("qWrittenInput").value = "";
  byId("qWrittenErr").textContent = "";
  byId("qWrittenGrading").hidden = true;
  byId("qWritten").hidden = false;
  byId("qSting").hidden = true;
  byId("qStingContinue").hidden = true;
  show("s-written");
}

async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return signIn.session;
}

let submitting = false;
byId("qWrittenSubmit").onclick = async () => {
  if (submitting) return;
  const text = byId("qWrittenInput").value.trim();
  if (text.length < 15) {
    byId("qWrittenErr").textContent = "Write a specific answer, a sentence or two, before submitting.";
    return;
  }
  byId("qWrittenErr").textContent = "";
  submitting = true;
  byId("qWrittenSubmit").disabled = true;
  byId("qWrittenSkip").disabled = true;
  byId("qWrittenInput").disabled = true;
  byId("qWrittenGrading").hidden = false;

  try {
    await ensureSession();
    const { data, error } = await supabase.functions.invoke("ensign-score", {
      body: { question_text: WRITTEN_QUESTION.text, response_text: text },
    });
    if (error || !data || !data.band) throw error || new Error("No grading returned");
    state.writtenResult = { band: data.band, text: text, critique: data.critique };
    submitting = false;
    byId("qWritten").hidden = true;
    const stingEl = byId("qSting");
    stingEl.textContent = data.critique;
    stingEl.hidden = false;
    byId("qStingContinue").hidden = false;
  } catch (submitError) {
    console.error(submitError);
    submitting = false;
    byId("qWrittenGrading").hidden = true;
    byId("qWrittenSubmit").disabled = false;
    byId("qWrittenSkip").disabled = false;
    byId("qWrittenInput").disabled = false;
    byId("qWrittenErr").textContent = "Couldn't reach the grader just now. Answer again, or skip and note that you weren't sure.";
  }
};

byId("qWrittenSkip").onclick = () => {
  if (submitting) return;
  state.writtenResult = null;
  finishAssessment();
};
byId("qStingContinue").onclick = () => { finishAssessment(); };

// ---------- finishing ----------
async function finishAssessment() {
  state.result = assess(state.responses, state.writtenResult);
  show("s-loading");
  try {
    const session = await ensureSession();
    const { data: saved, error } = await supabase.from("ensign_assessments").insert({
      user_id: session.user.id,
      responses: state.responses,
      written: state.writtenResult,
      result: state.result,
      engine_version: ENGINE_VERSION,
    }).select("id").single();
    if (error) throw error;
    state.assessmentId = saved.id;
    localStorage.setItem(STORAGE_KEY, saved.id);
    const { data: profile } = await supabase.from("ensign_profiles").select("*").eq("user_id", session.user.id).maybeSingle();
    if (profile && profile.work_email) { showResults(profile); return; }
  } catch (error) {
    console.error(error);
  }
  show("s-gate");
}

const FREE_MAIL = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|aol|proton|protonmail|gmx|mail|yandex)\./i;
byId("gateForm").onsubmit = async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target).entries());
  const email = String(values.email || "").trim();
  const required = [values.first, values.last, values.title, values.company];
  if (required.some((value) => !String(value || "").trim())) {
    byId("gateErr").textContent = "Complete every field to continue.";
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    byId("gateErr").textContent = "Enter a valid email address.";
    return;
  }
  if (FREE_MAIL.test(email)) {
    byId("gateErr").textContent = "Use your work email address. Ensign is intended for people working on agency-side AI content.";
    return;
  }
  byId("gateErr").textContent = "";
  byId("gateBtn").disabled = true;
  try {
    const session = await ensureSession();
    const profile = {
      user_id: session.user.id, first_name: values.first.trim(), last_name: values.last.trim(),
      work_email: email, job_title: values.title.trim(), company: values.company.trim(),
      marketing_ok: Boolean(values.updates), updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("ensign_profiles").upsert(profile);
    if (error) throw error;
    showResults(profile);
  } catch (error) {
    console.error(error);
    byId("gateErr").textContent = "Your details could not be saved. Check your connection and try again.";
  } finally {
    byId("gateBtn").disabled = false;
  }
};

// ---------- results ----------
function showResults(profile) {
  const result = state.result;
  show("s-results");
  byId("resTitle").textContent = profile && profile.first_name ? `${profile.first_name}, your Ensign result` : "Ensign: assessment result";
  byId("resPercent").textContent = `${result.percent}%`;
  byId("resBand").textContent = result.band;
  const writtenNote = result.hasWritten ? "" : " The written question wasn't graded for this run.";
  byId("resMeta").textContent = `${result.correctCount} of ${result.total} correct. ${result.timeoutCount} timed out with no decision recorded.${writtenNote}`;

  byId("catList").innerHTML = result.truthBreakdown.map((category) => `
    <li><span>${escapeHtml(category.label)}</span><span class="pct">${category.correct} of ${category.total}, ${category.percent}%</span></li>`).join("");

  if (result.overconfidentWrong > 0) {
    byId("evidenceNote").hidden = false;
    byId("evidenceNote").textContent = `${result.overconfidentWrong} of your wrong answers were marked high confidence. That combination, confidently wrong, is the pattern most likely to reach a client or a regulator before anyone catches it.`;
  } else {
    byId("evidenceNote").hidden = true;
  }

  byId("rowList").innerHTML = result.rows.map((row) => {
    const tagClass = row.timedOut ? "timeout" : (row.correct ? "right" : "wrong");
    const tagText = row.timedOut ? "Timed out" : (row.correct ? "Correct" : "Missed");
    if (row.kind === "written") {
      const said = `You wrote an answer graded: ${escapeHtml(row.decision)}.`;
      return `<li><div class="rmeta"><span class="tag ${tagClass}">${tagText}</span><span>Written: your disclosure defence</span></div><p>${said} ${escapeHtml(row.why)}</p></li>`;
    }
    const said = row.timedOut ? "No decision made in time." : `You said: ${escapeHtml(TRUTH_LABEL[row.decision])}.`;
    return `<li><div class="rmeta"><span class="tag ${tagClass}">${tagText}</span><span>${escapeHtml(TRUTH_LABEL[row.truth])}</span></div><p>${said} ${escapeHtml(row.why)}</p></li>`;
  }).join("");
}

// ---------- commercial buttons ----------
async function logRequest(kind) {
  const session = await ensureSession();
  const { error } = await supabase.from("ensign_report_requests").insert({
    assessment_id: state.assessmentId, user_id: session.user.id, kind: kind,
  });
  if (error) throw error;
  return session;
}
byId("reportBtn").onclick = async () => {
  byId("reportBtn").disabled = true;
  try {
    const session = await logRequest("detailed_report");
    if (REPORT_PAYMENT_LINK) {
      const paymentUrl = new URL(REPORT_PAYMENT_LINK);
      paymentUrl.searchParams.set("client_reference_id", state.assessmentId);
      const { data: profile } = await supabase.from("ensign_profiles").select("work_email").eq("user_id", session.user.id).maybeSingle();
      if (profile && profile.work_email) paymentUrl.searchParams.set("prefilled_email", profile.work_email);
      location.href = paymentUrl.toString();
      return;
    }
    byId("reportMsg").textContent = "Request received. We will email you within two working days to confirm scope and payment.";
  } catch (error) {
    console.error(error);
    byId("reportBtn").disabled = false;
    byId("reportMsg").innerHTML = `That request could not be sent. Email <a href="mailto:${CONTACT_EMAIL}?subject=Ensign%20full%20report">${CONTACT_EMAIL}</a> instead.`;
  }
};
byId("consultBtn").onclick = async () => {
  byId("consultBtn").disabled = true;
  try {
    await logRequest("consulting");
    byId("reportMsg").innerHTML = `Request received. Abhinav will be in touch, or email <a href="mailto:${CONTACT_EMAIL}?subject=Ensign" style="border-bottom:1px solid var(--signal)">${CONTACT_EMAIL}</a> directly.`;
  } catch (error) {
    console.error(error);
    byId("consultBtn").disabled = false;
    byId("reportMsg").innerHTML = `That request could not be sent. Email <a href="mailto:${CONTACT_EMAIL}?subject=Ensign">${CONTACT_EMAIL}</a> instead.`;
  }
};
byId("printBtn").onclick = () => window.print();

boot();
