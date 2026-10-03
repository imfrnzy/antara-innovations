import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, FREE_REPORT_LIMIT, PRICE_LABEL, CONTACT_EMAIL } from "./config.js";
import { assessOutcome, outcomeFacts } from "./engine.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const byId = (id) => document.getElementById(id);

byId("priceLabel").textContent = PRICE_LABEL;
byId("gatePrice").textContent = PRICE_LABEL + ".";
byId("gateContact").href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Manifest — continuing past the free tier")}`;

const SCREENS = ["s-intro", "s-form", "s-loading", "s-gate", "s-draft"];
function show(id) {
  SCREENS.forEach((s) => byId(s).classList.toggle("on", s === id));
  window.scrollTo(0, 0);
}

async function ensureSession() {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
  return session;
}

byId("beginBtn").addEventListener("click", async () => {
  try {
    await ensureSession();
    show("s-form");
  } catch (e) {
    console.error(e);
    alert("Couldn't start a session. Try reloading the page.");
  }
});

byId("reportForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = byId("formError");
  errEl.hidden = true;

  const fd = new FormData(e.target);
  const val = (k) => (fd.get(k) ?? "").toString().trim();
  const num = (k) => (val(k) === "" ? null : Number(val(k)));

  const sessionsCompleted = num("sessions_completed");
  const sessionsRequested = num("sessions_requested");
  if (sessionsCompleted === null || sessionsRequested === null) {
    errEl.textContent = "Sessions completed and sessions requested are both required.";
    errEl.hidden = false;
    return;
  }

  // Show the computed facts immediately, client-side, before the draft call
  // returns, so the practitioner sees the real numbers straight away. The
  // edge function recomputes the same thing server-side independently and
  // that recomputed version is what actually gets used in the draft and the
  // saved record, this is only for the instant on-screen preview.
  const outcome = assessOutcome({
    phq9: (val("phq9_baseline") !== "" && val("phq9_latest") !== "") ? { baseline: num("phq9_baseline"), latest: num("phq9_latest") } : null,
    gad7: (val("gad7_baseline") !== "" && val("gad7_latest") !== "") ? { baseline: num("gad7_baseline"), latest: num("gad7_latest") } : null,
  });

  show("s-loading");

  try {
    const session = await ensureSession();
    const { data, error } = await supabase.functions.invoke("manifest-draft", {
      body: {
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
      },
    });

    // manifest-draft always returns 200, ok:true with a draft or ok:false
    // with a reason, same proven pattern as bearing-score and ensign-score:
    // read the returned data directly, don't rely on how supabase-js
    // chooses to surface a non-2xx response.
    if (error || !data) throw error || new Error("No response from the drafting function.");
    if (data.ok === false && data.reason === "limit_reached") {
      show("s-gate");
      return;
    }
    if (!data.ok || !data.draft) throw new Error("Draft generation did not return a draft.");

    renderDraft(data);
  } catch (err) {
    console.error(err);
    show("s-form");
    errEl.textContent = "Couldn't generate the draft just now. Your answers are still filled in, try again.";
    errEl.hidden = false;
  }
});

function renderDraft(data) {
  byId("draftText").value = data.draft ?? "";
  byId("usedCount").textContent = `${data.used} of ${FREE_REPORT_LIMIT} free reports used`;
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
  show("s-form");
});
