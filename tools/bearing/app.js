import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, REPORT_PAYMENT_LINK, REPORT_PRICE_LABEL, CONTACT_EMAIL } from "./config.js";
import { JURISDICTIONS, SECTORS, SIZES, AI_USES, ANSWER_OPTIONS, LENS_LABEL, ENGINE_VERSION } from "./questions.js";
import { selectQuestions, assess } from "./engine.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const byId = (id) => document.getElementById(id);
const STORAGE_KEY = "bearing.assessment";

const state = {
  profile: null,
  questions: [],
  answers: {},
  position: 0,
  result: null,
  assessmentId: localStorage.getItem(STORAGE_KEY),
};

// Someone can arrive from the Instruments hub's Banking or Insurance
// section, carried as ?from=bank / ?from=insurer. Same tool, same questions,
// underneath, this only adjusts the opening line and preselects their
// sector, so the entry point they clicked feels like it was heard.
const ENTRY_COPY = {
  bank: {
    lead: "Tell Bearing where you operate. It then asks only the questions that apply, across SM&CR and Consumer Duty in the UK, FINMA's guidance in Switzerland, and the EU AI Act, for credit decisions, chatbots and everything else your bank runs on AI. It takes about ten minutes.",
  },
  insurer: {
    lead: "Tell Bearing where you operate. It then asks only the questions that apply, across Consumer Duty in the UK, FINMA's guidance in Switzerland, and the EU AI Act, for AI in pricing, underwriting and claims. It takes about ten minutes.",
  },
};
const entryFrom = new URLSearchParams(location.search).get("from");
if (entryFrom && ENTRY_COPY[entryFrom]) {
  byId("introLead").textContent = ENTRY_COPY[entryFrom].lead;
}

const SCREENS = ["s-intro", "s-setup", "s-questions", "s-gate", "s-results", "s-loading"];
function show(screenId) {
  for (const id of SCREENS) {
    byId(id).hidden = id !== screenId;
  }
  window.scrollTo({ top: 0 });
  const heading = byId(screenId).querySelector("h1, .question");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
}

function escapeHtml(text) {
  const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(text ?? "").replace(/[&<>"']/g, (character) => replacements[character]);
}

// ---------- start-up ----------
async function boot() {
  byId("reportBtn").textContent = `Request the full report (${REPORT_PRICE_LABEL})`;
  buildSetupForm();
  if (!state.assessmentId) {
    show("s-intro");
    return;
  }
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      show("s-intro");
      return;
    }
    const { data: assessment } = await supabase
      .from("bearing_assessments").select("id, result").eq("id", state.assessmentId).maybeSingle();
    const { data: profile } = await supabase
      .from("bearing_profiles").select("*").eq("user_id", sessionData.session.user.id).maybeSingle();
    if (assessment && assessment.result && profile && profile.work_email) {
      state.result = assessment.result;
      showResults(profile);
      return;
    }
  } catch (error) {
    console.error(error);
  }
  show("s-intro");
}

// ---------- setup ----------
function buildSetupForm() {
  byId("jurisdictionChoices").innerHTML = JURISDICTIONS.map((item) =>
    `<label class="pill"><input type="checkbox" name="jurisdiction" value="${item.value}"> ${escapeHtml(item.label)}</label>`).join("");
  byId("useChoices").innerHTML = AI_USES.map((item) =>
    `<label class="pill"><input type="checkbox" name="use" value="${item.value}"> ${escapeHtml(item.label)}</label>`).join("");
  byId("sectorSelect").innerHTML += SECTORS.map((item) => `<option value="${item.value}">${escapeHtml(item.label)}</option>`).join("");
  byId("sizeSelect").innerHTML += SIZES.map((item) => `<option value="${item.value}">${escapeHtml(item.label)}</option>`).join("");
  if (entryFrom && SECTORS.some((item) => item.value === entryFrom)) {
    byId("sectorSelect").value = entryFrom;
  }
}

byId("beginBtn").onclick = () => show("s-setup");
byId("againBtn").onclick = () => {
  localStorage.removeItem(STORAGE_KEY);
  state.assessmentId = null;
  state.answers = {};
  state.position = 0;
  byId("setupForm").reset();
  show("s-setup");
};

byId("setupForm").onsubmit = (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const jurisdictions = form.getAll("jurisdiction");
  const uses = form.getAll("use");
  const sector = form.get("sector");
  const size = form.get("size");
  if (jurisdictions.length === 0) {
    byId("setupErr").textContent = "Select at least one location where you operate.";
    return;
  }
  if (!sector || !size) {
    byId("setupErr").textContent = "Select your type of firm and size.";
    return;
  }
  byId("setupErr").textContent = "";
  state.profile = { jurisdictions: jurisdictions, sector: sector, size: size, uses: uses };
  state.questions = selectQuestions(state.profile);
  state.answers = {};
  state.position = 0;
  drawCompassTicks();
  showQuestion();
  show("s-questions");
};

// ---------- questions ----------
function drawCompassTicks() {
  const total = state.questions.length;
  let ticks = "";
  for (let index = 0; index < total; index = index + 1) {
    const angle = (index / total) * Math.PI * 2;
    const innerX = Math.sin(angle) * 52;
    const innerY = -Math.cos(angle) * 52;
    const outerX = Math.sin(angle) * 58;
    const outerY = -Math.cos(angle) * 58;
    ticks += `<line class="tick" data-index="${index}" x1="${innerX.toFixed(2)}" y1="${innerY.toFixed(2)}" x2="${outerX.toFixed(2)}" y2="${outerY.toFixed(2)}"></line>`;
  }
  byId("compassTicks").innerHTML = ticks;
}

function updateCompass() {
  const total = state.questions.length;
  const answered = Object.keys(state.answers).filter((id) => state.questions.some((question) => question.id === id)).length;
  const degrees = (answered / total) * 360;
  byId("needle").style.transform = `rotate(${degrees}deg)`;
  byId("compassTicks").querySelectorAll(".tick").forEach((tick) => {
    const index = Number(tick.dataset.index);
    tick.classList.toggle("done", index < answered);
  });
  const caption = `Question ${state.position + 1} of ${total}`;
  byId("compassCap").textContent = caption;
  byId("mobileCount").textContent = caption;
}

function showQuestion() {
  const question = state.questions[state.position];
  const lensNames = question.lenses.filter((lens) => state.profile.jurisdictions.includes(lens)).map((lens) => LENS_LABEL[lens]);
  byId("qLenses").textContent = `Counts towards: ${lensNames.join(", ")}`;
  byId("qText").textContent = question.text;
  byId("qWhy").textContent = question.why;
  byId("qWhy").hidden = true;
  byId("qErr").textContent = "";
  byId("backBtn").style.visibility = state.position === 0 ? "hidden" : "visible";

  const current = state.answers[question.id];
  byId("qOptions").innerHTML = ANSWER_OPTIONS.map((option) =>
    `<button type="button" class="opt" role="radio" aria-checked="${current === option.value}" data-value="${option.value}">${escapeHtml(option.label)}</button>`).join("");
  byId("qOptions").querySelectorAll(".opt").forEach((button) => {
    button.onclick = () => chooseAnswer(button.dataset.value);
  });
  updateCompass();
  const heading = byId("qText");
  heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}

let advancing = false;
function chooseAnswer(value) {
  if (advancing) {
    return;
  }
  const question = state.questions[state.position];
  state.answers[question.id] = value;
  byId("qOptions").querySelectorAll(".opt").forEach((button) => {
    button.setAttribute("aria-checked", String(button.dataset.value === value));
  });
  updateCompass();
  advancing = true;
  setTimeout(() => {
    advancing = false;
    if (state.position < state.questions.length - 1) {
      state.position = state.position + 1;
      showQuestion();
    } else {
      finishQuestions();
    }
  }, 280);
}

byId("whyBtn").onclick = () => { byId("qWhy").hidden = !byId("qWhy").hidden; };
byId("backBtn").onclick = () => {
  if (state.position > 0) {
    state.position = state.position - 1;
    showQuestion();
  }
};

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

async function finishQuestions() {
  state.result = assess(state.profile, state.answers);
  show("s-loading");
  try {
    const session = await ensureSession();
    const { data: saved, error } = await supabase.from("bearing_assessments").insert({
      user_id: session.user.id,
      jurisdictions: state.profile.jurisdictions,
      sector: state.profile.sector,
      org_size: state.profile.size,
      ai_uses: state.profile.uses,
      answers: state.answers,
      result: state.result,
      engine_version: ENGINE_VERSION,
    }).select("id").single();
    if (error) {
      throw error;
    }
    state.assessmentId = saved.id;
    localStorage.setItem(STORAGE_KEY, saved.id);
    const { data: profile } = await supabase.from("bearing_profiles").select("*").eq("user_id", session.user.id).maybeSingle();
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
    byId("gateErr").textContent = "Use your work email address. Bearing is intended for individuals within regulated firms.";
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
    const { error } = await supabase.from("bearing_profiles").upsert(profile);
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
function summarySentence(result) {
  const parts = result.lenses.map((lens) => `${lens.label} ${lens.percent}%`);
  const weakest = result.lenses.slice().sort((first, second) => first.percent - second.percent)[0];
  if (result.lenses.length === 1) {
    return `This assessment is ${weakest.band.toLowerCase()} for ${weakest.label}: ${weakest.readyCount} of ${weakest.obligations.length} obligations are fully in place.`;
  }
  return `Readiness by jurisdiction: ${parts.join(", ")}. ${weakest.lens === "uk" ? "The UK" : weakest.label} requires the most attention.`;
}

function showResults(profile) {
  const result = state.result;
  show("s-results");
  byId("resTitle").textContent = profile && profile.first_name ? `${profile.first_name}, your Bearing result` : "Bearing: assessment result";
  byId("resSummary").textContent = summarySentence(result);
  byId("resMeta").textContent = `Based on ${result.questionCount} answers, checked against ${result.obligationCount} obligations.`;

  byId("lensBlocks").innerHTML = result.lenses.map((lens) => `
    <div class="lens">
      <div class="lens-head">
        <h2>${escapeHtml(lens.label)}</h2>
        <span class="lens-score"><strong>${lens.percent}%</strong>${escapeHtml(lens.band)}</span>
      </div>
      <div class="bar" role="img" aria-label="${lens.percent} percent ready"><span style="width:${lens.percent}%"></span><i style="left:calc(${lens.percent}% - 1px)"></i></div>
      <ul class="obls">
        ${lens.obligations.map((item) => `
          <li><span>${escapeHtml(item.title)}<span class="src">${escapeHtml(item.source)}</span></span>
          <span class="chip s-${item.status}">${escapeHtml(item.statusLabel)}</span></li>`).join("")}
      </ul>
    </div>`).join("");

  const notes = [];
  if (result.partlyCount > 0) {
    notes.push(`In ${result.partlyCount === 1 ? "one instance" : result.partlyCount + " instances"}, a control was reported as only partly in place, or one the firm would struggle to evidence. This is typically the first gap a supervisor identifies: the control is understood informally but not recorded.`);
  }
  if (result.unknownCount > 0) {
    notes.push(`${result.unknownCount === 1 ? "One question" : result.unknownCount + " questions"} could not be answered with confidence. This is a finding in its own right: if the person completing this assessment cannot say, a supervisor asking the same question is unlikely to receive a clear answer.`);
  }
  byId("evidenceNote").hidden = notes.length === 0;
  byId("evidenceNote").innerHTML = notes.map((text) => `<p style="margin:0 0 8px">${escapeHtml(text)}</p>`).join("");

  if (result.topGaps.length === 0) {
    byId("gapList").innerHTML = `<li><h3>No priority gaps identified</h3><p>Every obligation assessed is in place and evidenced. The full report would test whether that evidence would withstand a supervisor's questions.</p></li>`;
  } else {
    byId("gapList").innerHTML = result.topGaps.map((gap) => `
      <li><h3>${escapeHtml(gap.title)}</h3>
      <p class="tag">${escapeHtml(LENS_LABEL[gap.lens])}, ${escapeHtml(gap.source)}: ${escapeHtml(gap.statusLabel.toLowerCase())}</p>
      <p>${escapeHtml(gap.why)}</p></li>`).join("");
  }
  byId("lockedCount").textContent = String(result.obligationCount);
}

// ---------- commercial buttons ----------
async function logRequest(kind) {
  const session = await ensureSession();
  const { error } = await supabase.from("bearing_report_requests").insert({
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
      const { data: profile } = await supabase.from("bearing_profiles").select("work_email").eq("user_id", session.user.id).maybeSingle();
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
    byId("reportMsg").innerHTML = `That request could not be sent. Email <a href="mailto:${CONTACT_EMAIL}?subject=Bearing%20full%20report">${CONTACT_EMAIL}</a> instead.`;
  }
};

byId("consultBtn").onclick = async () => {
  byId("consultBtn").disabled = true;
  try {
    await logRequest("consulting");
    byId("reportMsg").innerHTML = `Request received. Abhinav will be in touch, or email <a href="mailto:${CONTACT_EMAIL}?subject=Bearing" style="border-bottom:1px solid var(--chart)">${CONTACT_EMAIL}</a> directly.`;
  } catch (error) {
    console.error(error);
    byId("consultBtn").disabled = false;
    byId("reportMsg").innerHTML = `That request could not be sent. Email <a href="mailto:${CONTACT_EMAIL}?subject=Bearing">${CONTACT_EMAIL}</a> instead.`;
  }
};

byId("printBtn").onclick = () => window.print();

boot();
