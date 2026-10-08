import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../tools/squall/config.js";
import { lookupRun, submitAnswers, newToken, normaliseCode, encodeScenarioAnswers, encodePulseAnswers } from "../assets/team.js";
import { PULSE_QUESTIONS, PULSE_OPTIONS } from "../halo/pulse-questions.js";
import { SCENARIOS as SQUALL, DECISIONS as SQ_DEC, CONFIDENCE, ROUND_SECONDS } from "../tools/squall/scenarios.js";
import { scenariosFor } from "../tools/squall/engine.js";
import { SCENARIOS as ENSIGN, DECISIONS as EN_DEC } from "../tools/ensign/scenarios.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SECTIONS = ["t-code", "t-intro", "t-pulse", "t-round", "t-done", "t-msg"];
function show(id) { SECTIONS.forEach((s) => ($(s).hidden = s !== id)); window.scrollTo({ top: 0 }); }
function message(title, body) { $("msgTitle").textContent = title; $("msgBody").textContent = body; show("t-msg"); }

let code = "";
let run = null;

function tokenFor(c) {
  const key = `team.token.${c}`;
  try {
    let t = localStorage.getItem(key);
    if (!t) { t = newToken((n) => crypto.getRandomValues(new Uint8Array(n))); localStorage.setItem(key, t); }
    return t;
  } catch { return newToken((n) => crypto.getRandomValues(new Uint8Array(n))); }
}
function alreadyDone(c) { try { return localStorage.getItem(`team.done.${c}`) === "1"; } catch { return false; } }
function markDone(c) { try { localStorage.setItem(`team.done.${c}`, "1"); } catch {} }

async function boot() {
  const fromUrl = normaliseCode(new URLSearchParams(location.search).get("code"));
  if (!fromUrl) { show("t-code"); $("codeInput").focus(); return; }
  await openCode(fromUrl);
}
$("codeForm").onsubmit = async (e) => {
  e.preventDefault();
  const c = normaliseCode($("codeInput").value);
  if (c.length < 8) { $("codeErr").textContent = "The code has 8 letters and numbers."; return; }
  $("codeErr").textContent = "";
  await openCode(c);
};

async function openCode(c) {
  code = c;
  try { run = await lookupRun(sb, c); }
  catch (e) { console.error(e); return message("Could not check the code", "Check your connection and try again."); }
  if (!run) { show("t-code"); $("codeErr").textContent = "That code was not recognised. Check it with the person who sent it."; return; }
  if (run.status !== "open") return message("This link is closed", "The person who sent it has stopped taking answers.");
  if (alreadyDone(c)) $("doneMsg").textContent = "You have answered this already. Starting again will replace your earlier answers.";
  if (run.tool === "halo") {
    $("tiTitle").textContent = "Seven questions about how your leader works";
    $("tiLead").textContent = "Your leader has asked for honest answers on seven everyday habits. It takes about two minutes. There are no wrong answers, and the most useful ones are the accurate ones.";
  } else {
    $("tiTitle").textContent = run.tool === "squall" ? "Six scenarios, 25 seconds each" : "Six scenarios, 25 seconds each";
    $("tiLead").textContent = "You will see short, realistic situations with a countdown on each. Decide what you would do. If you are really not sure, choosing to escalate is a valid answer. It takes about five minutes.";
  }
  show("t-intro");
}

$("startBtn").onclick = () => (run.tool === "halo" ? startPulse() : startRounds());

// ---------- HALO pulse ----------
function startPulse() {
  const answers = {};
  let i = 0;
  const draw = () => {
    const q = PULSE_QUESTIONS[i];
    $("pCount").textContent = `Question ${i + 1} of ${PULSE_QUESTIONS.length}`;
    $("pQuestion").textContent = q.q;
    $("pOptions").innerHTML = PULSE_OPTIONS.map((o) => `<button type="button" class="opt" role="radio" aria-checked="false" data-v="${o.value}">${esc(o.label)}</button>`).join("");
    $("pOptions").querySelectorAll(".opt").forEach((b) => {
      b.onclick = async () => {
        answers[q.key] = Number(b.dataset.v);
        i += 1;
        if (i < PULSE_QUESTIONS.length) draw();
        else await finish(encodePulseAnswers(PULSE_QUESTIONS, answers));
      };
    });
    $("pQuestion").focus({ preventScroll: true });
  };
  show("t-pulse"); draw();
}

// ---------- scenario rounds (Squall, Ensign) ----------
function startRounds() {
  const set = run.tool === "squall" ? scenariosFor(run.module || "bank") : ENSIGN;
  const decisions = run.tool === "squall" ? SQ_DEC : EN_DEC;
  const responses = [];
  let i = 0, deadline = 0, tick = null, auto = null, chosen = null;
  const stop = () => { clearInterval(tick); clearTimeout(auto); };
  const next = async () => {
    stop(); i += 1;
    if (i < set.length) round(); else await finish(encodeScenarioAnswers(set, responses));
  };
  const round = () => {
    const s = set[i]; chosen = null;
    $("rCount").textContent = `Scenario ${i + 1} of ${set.length}`;
    $("rText").textContent = s.text;
    $("rConf").hidden = true;
    $("rOptions").innerHTML = decisions.map((o) => `<button type="button" class="opt" role="radio" aria-checked="false" data-v="${o.value}">${esc(o.label)}</button>`).join("");
    $("rConfOptions").innerHTML = CONFIDENCE.map((o) => `<button type="button" class="opt" role="radio" aria-checked="false" data-v="${o.value}">${esc(o.label)}</button>`).join("");
    $("rOptions").querySelectorAll(".opt").forEach((b) => {
      b.onclick = () => {
        if (chosen) return; chosen = b.dataset.v; stop();
        b.setAttribute("aria-checked", "true"); $("rConf").hidden = false;
      };
    });
    $("rConfOptions").querySelectorAll(".opt").forEach((b) => {
      b.onclick = () => { responses.push({ scenarioId: s.id, decision: chosen, confidence: b.dataset.v, timedOut: false }); next(); };
    });
    const bar = $("rBar"); bar.style.transition = "none"; bar.style.transform = "scaleX(1)"; void bar.offsetWidth;
    bar.style.transition = `transform ${ROUND_SECONDS}s linear`; bar.style.transform = "scaleX(0)";
    deadline = Date.now() + ROUND_SECONDS * 1000;
    $("rTimer").textContent = `${ROUND_SECONDS}s`;
    tick = setInterval(() => { $("rTimer").textContent = `${Math.max(0, Math.ceil((deadline - Date.now()) / 1000))}s`; }, 250);
    auto = setTimeout(() => { if (!chosen) { responses.push({ scenarioId: s.id, decision: null, confidence: null, timedOut: true }); next(); } }, ROUND_SECONDS * 1000);
    $("rText").focus({ preventScroll: true });
  };
  show("t-round"); round();
}

async function finish(answers) {
  let result;
  try { result = await submitAnswers(sb, code, tokenFor(code), answers); }
  catch (e) { console.error(e); return message("Your answers were not sent", "Check your connection and try again by opening the link again."); }
  if (result === "ok") { markDone(code); $("doneMsg").textContent = "Your answers were sent. You can close this page."; return show("t-done"); }
  if (result === "closed") return message("This link is closed", "The person who sent it has stopped taking answers.");
  if (result === "full") return message("This link is full", "It has reached the number of answers it can take.");
  return message("Your answers were not accepted", "Open the link again and try once more.");
}

boot();
