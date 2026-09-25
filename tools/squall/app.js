import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, REPORT_PAYMENT_LINK, REPORT_PRICE_LABEL, CONTACT_EMAIL } from "./config.js";
import { MODULES, DECISIONS, CONFIDENCE, ROUND_SECONDS, ENGINE_VERSION } from "./scenarios.js";
import { scenariosFor, assess, CATEGORY_LABEL } from "./engine.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const byId = (id) => document.getElementById(id);
const STORAGE_KEY = "squall.assessment";

const state = {
  module: null,
  set: [],
  index: 0,
  responses: [],
  result: null,
  assessmentId: localStorage.getItem(STORAGE_KEY),
  currentDecision: null,
};

const SCREENS = ["s-intro", "s-setup", "s-round", "s-gate", "s-results", "s-loading"];
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

// Someone can arrive from the Instruments hub, or a future deep link, as
// ?from=bank / ?from=insurer. It preselects the module and reframes the
// opening line; it never skips the setup step itself.
const ENTRY_COPY = {
  bank: { lead: "Six short scenarios drawn from banking and payments, a countdown on each. Decide genuine, fake or manipulated, or escalate it. It takes about five minutes." },
  insurer: { lead: "Six short scenarios drawn from claims and underwriting, a countdown on each. Decide genuine, fake or manipulated, or escalate it. It takes about five minutes." },
};
const entryFrom = new URLSearchParams(location.search).get("from");
if (entryFrom && ENTRY_COPY[entryFrom]) {
  byId("introLead").textContent = ENTRY_COPY[entryFrom].lead;
}

// ---------- start-up ----------
async function boot() {
  byId("reportBtn").textContent = `Request the full report (${REPORT_PRICE_LABEL})`;
  buildSetupForm();
  show("s-intro");
}

function buildSetupForm() {
  byId("moduleChoices").innerHTML = MODULES.map((item) =>
    `<label class="pill"><input type="radio" name="module" value="${item.value}" ${item.value === entryFrom ? "checked" : ""}> ${escapeHtml(item.label)}</label>`).join("");
}

byId("beginBtn").onclick = () => show("s-setup");
byId("againBtn").onclick = () => {
  localStorage.removeItem(STORAGE_KEY);
  state.assessmentId = null;
  state.responses = [];
  state.index = 0;
  byId("setupForm").reset();
  show("s-setup");
};

byId("setupForm").onsubmit = (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const module = form.get("module");
  if (!module) {
    byId("setupErr").textContent = "Select one to continue.";
    return;
  }
  byId("setupErr").textContent = "";
  state.module = module;
  state.set = scenariosFor(module);
  state.responses = [];
  state.index = 0;
  startRound(0);
  show("s-round");
};

// ---------- rounds ----------
let countdownInterval = null;
let autoTimeout = null;
let roundDeadline = 0;

function clearRoundTimers() {
  clearInterval(countdownInterval);
  clearTimeout(autoTimeout);
}

function startRound(index) {
  const scenario = state.set[index];
  state.currentDecision = null;
  byId("roundCount").textContent = `Scenario ${index + 1} of ${state.set.length}`;
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
  if (remaining <= 5) {
    byId("timerBar").classList.add("low");
  }
}

function onDecision(value) {
  if (state.currentDecision) {
    return;
  }
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
  recordResponse({ scenarioId: state.set[state.index].id, decision: state.currentDecision, confidence: value, timedOut: false });
  setTimeout(advance, 260);
}

function onTimeout() {
  if (state.currentDecision) {
    return;
  }
  recordResponse({ scenarioId: state.set[state.index].id, decision: null, confidence: null, timedOut: true });
  byId("timedOutNote").hidden = false;
  setTimeout(advance, 1400);
}

function recordResponse(response) {
  state.responses.push(response);
}

function advance() {
  clearRoundTimers();
  state.index = state.index + 1;
  if (state.index < state.set.length) {
    startRound(state.index);
  } else {
    finishRounds();
  }
}

// ---------- finishing: score, save, then ask who it's for ----------
async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    return data.session;
  }
  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw error;
  }
  return signIn.session;
}

async function finishRounds() {
  state.result = assess(state.module, state.responses);
  show("s-loading");
  try {
    const session = await ensureSession();
    const { data: saved, error } = await supabase.from("squall_assessments").insert({
      user_id: session.user.id,
      module: state.module,
      responses: state.responses,
      result: state.result,
      engine_version: ENGINE_VERSION,
    }).select("id").single();
    if (error) {
      throw error;
    }
    state.assessmentId = saved.id;
    localStorage.setItem(STORAGE_KEY, saved.id);
    const { data: profile } = await supabase.from("squall_profiles").select("*").eq("user_id", session.user.id).maybeSingle();
    if (profile && profile.work_email) {
      showResults(profile);
      return;
    }
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
    byId("gateErr").textContent = "Use your work email address. Squall is intended for individuals within regulated firms.";
    return;
  }
  byId("gateErr").textContent = "";
  byId("gateBtn").disabled = true;
  try {
    const session = await ensureSession();
    const profile = {
      user_id: session.user.id,
      first_name: values.first.trim(),
      last_name: values.last.trim(),
      work_email: email,
      job_title: values.title.trim(),
      company: values.company.trim(),
      marketing_ok: Boolean(values.updates),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("squall_profiles").upsert(profile);
    if (error) {
      throw error;
    }
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
  byId("resTitle").textContent = profile && profile.first_name ? `${profile.first_name}, your Squall result` : "Squall: assessment result";
  byId("resPercent").textContent = `${result.percent}%`;
  byId("resBand").textContent = result.band;
  byId("resMeta").textContent = `${result.correctCount} of ${result.total} correct. ${result.timeoutCount} timed out with no decision recorded.`;

  byId("catList").innerHTML = result.categoryBreakdown.map((category) => `
    <li><span>${escapeHtml(category.label)}</span><span class="pct">${category.correct} of ${category.total}, ${category.percent}%</span></li>`).join("");

  if (result.overconfidentWrong > 0) {
    byId("evidenceNote").hidden = false;
    byId("evidenceNote").textContent = `${result.overconfidentWrong} of your incorrect answers were marked high confidence. This combination, confidently incorrect, is the pattern most likely to result in a financial loss, more so than an incorrect answer alone.`;
  } else {
    byId("evidenceNote").hidden = true;
  }

  byId("rowList").innerHTML = result.rows.map((row) => {
    const tagClass = row.timedOut ? "timeout" : (row.correct ? "right" : "wrong");
    const tagText = row.timedOut ? "Timed out" : (row.correct ? "Correct" : "Missed");
    const said = row.timedOut ? "No decision made in time." : `You said: ${escapeHtml(CATEGORY_LABEL[row.decision])}.`;
    return `<li><div class="rmeta"><span class="tag ${tagClass}">${tagText}</span><span>${escapeHtml(CATEGORY_LABEL[row.truth])}</span></div>
      <p>${said} ${escapeHtml(row.why)}</p></li>`;
  }).join("");
}

// ---------- commercial buttons ----------
async function logRequest(kind) {
  const session = await ensureSession();
  const { error } = await supabase.from("squall_report_requests").insert({
    assessment_id: state.assessmentId, user_id: session.user.id, kind: kind,
  });
  if (error) {
    throw error;
  }
  return session;
}

byId("reportBtn").onclick = async () => {
  byId("reportBtn").disabled = true;
  try {
    const session = await logRequest("detailed_report");
    if (REPORT_PAYMENT_LINK) {
      const paymentUrl = new URL(REPORT_PAYMENT_LINK);
      paymentUrl.searchParams.set("client_reference_id", state.assessmentId);
      const { data: profile } = await supabase.from("squall_profiles").select("work_email").eq("user_id", session.user.id).maybeSingle();
      if (profile && profile.work_email) {
        paymentUrl.searchParams.set("prefilled_email", profile.work_email);
      }
      location.href = paymentUrl.toString();
      return;
    }
    byId("reportMsg").textContent = "Request received. We will email you within two working days to confirm scope and payment.";
  } catch (error) {
    console.error(error);
    byId("reportBtn").disabled = false;
    byId("reportMsg").innerHTML = `That request could not be sent. Email <a href="mailto:${CONTACT_EMAIL}?subject=Squall%20full%20report">${CONTACT_EMAIL}</a> instead.`;
  }
};

byId("consultBtn").onclick = async () => {
  byId("consultBtn").disabled = true;
  try {
    await logRequest("consulting");
    byId("reportMsg").innerHTML = `Request received. Abhinav will be in touch, or email <a href="mailto:${CONTACT_EMAIL}?subject=Squall" style="border-bottom:1px solid var(--storm)">${CONTACT_EMAIL}</a> directly.`;
  } catch (error) {
    console.error(error);
    byId("consultBtn").disabled = false;
    byId("reportMsg").innerHTML = `That request could not be sent. Email <a href="mailto:${CONTACT_EMAIL}?subject=Squall">${CONTACT_EMAIL}</a> instead.`;
  }
};

byId("printBtn").onclick = () => window.print();

boot();
