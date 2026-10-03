// Manifest drafting function. Paste this whole file into the Supabase
// dashboard's Edge Function editor. Name the function exactly: manifest-draft
// Secrets needed (same ones the other five already use): ANTHROPIC_API_KEY, ALLOWED_ORIGIN.
//
// This drafts a UK insurer progress/extension report for a therapist,
// counsellor or psychologist. The reliable-improvement and recovery facts
// are computed here, server-side, from the raw baseline/latest scores the
// client sends, using the same fixed NHS Talking Therapies methodology as
// tools/manifest/engine.js. The client never gets to assert "this counts as
// reliable improvement" directly, it only sends raw numbers, and this
// function is the only thing that decides what those numbers mean. The
// drafting model is given the computed facts as fixed ground truth and is
// instructed never to alter what they assert, only to write the prose
// around them. Three free reports per person, enforced here by counting
// existing rows before drafting, never by trusting the client.

import { createClient } from "npm:@supabase/supabase-js@2";

// ---- Manifest reliable-change engine, inlined so this whole function is one file ----
// Mirrors tools/manifest/engine.js exactly. Keep the two in sync if either changes.
const MEASURES = {
  phq9: { label: "PHQ-9", reliableChangeThreshold: 6, casenessThreshold: 10 },
  gad7: { label: "GAD-7", reliableChangeThreshold: 4, casenessThreshold: 8 },
};
function scoreMeasure(key, baseline, latest) {
  const m = MEASURES[key];
  if (!m || baseline === null || baseline === undefined || latest === null || latest === undefined) return null;
  const change = baseline - latest;
  const reliableImprovement = change >= m.reliableChangeThreshold;
  const reliableDeterioration = change <= -m.reliableChangeThreshold;
  return {
    measure: m.label, baseline, latest, change,
    reliableImprovement, reliableDeterioration,
    noReliableChange: !reliableImprovement && !reliableDeterioration,
  };
}
function assessOutcome(facts) {
  const results = {};
  let anyStartedAboveCaseness = false, allScoredBelowCaseness = true, anyScored = false;
  for (const key of Object.keys(MEASURES)) {
    const f = facts[key];
    if (!f) continue;
    const r = scoreMeasure(key, f.baseline, f.latest);
    if (!r) continue;
    anyScored = true;
    results[key] = r;
    if (r.baseline >= MEASURES[key].casenessThreshold) anyStartedAboveCaseness = true;
    if (r.latest >= MEASURES[key].casenessThreshold) allScoredBelowCaseness = false;
  }
  if (!anyScored) return { scored: false, results: {}, recovery: null, reliableImprovementAny: null, reliableDeteriorationAny: null };
  const recovery = anyStartedAboveCaseness && allScoredBelowCaseness;
  const reliableImprovementAny = Object.values(results).some((r) => r.reliableImprovement);
  const reliableDeteriorationAny = Object.values(results).some((r) => r.reliableDeterioration);
  return { scored: true, results, recovery, reliableImprovementAny, reliableDeteriorationAny };
}
function outcomeFacts(outcome) {
  if (!outcome.scored) return ["No outcome measure scores were provided for this report."];
  const lines = [];
  for (const key of Object.keys(outcome.results)) {
    const r = outcome.results[key];
    const dir = r.change > 0 ? "a decrease of" : r.change < 0 ? "an increase of" : "no change,";
    lines.push(`${r.measure}: baseline ${r.baseline}, latest ${r.latest} (${dir} ${Math.abs(r.change)} point${Math.abs(r.change) === 1 ? "" : "s"}). ${r.reliableImprovement ? "This meets the NHS Talking Therapies threshold for reliable improvement." : r.reliableDeterioration ? "This meets the threshold for reliable deterioration." : "This does not meet the threshold for reliable change in either direction."}`);
  }
  lines.push(outcome.recovery ? "Recovery: the client has moved from at-or-above clinical caseness to below caseness on every measure scored." : "Recovery: the client has not moved from clinical caseness to below caseness on every measure scored, or no caseness threshold was crossed.");
  return lines;
}
// ---- end engine ----

const FREE_REPORT_LIMIT = 3;
const MAX_CHARS = 1500;
const MODEL = Deno.env.get("MANIFEST_MODEL") ?? "claude-sonnet-4-6";
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://www.antara-innovations.com";

const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const trim = (s, n) => (s ?? "").toString().trim().slice(0, n);

const INSURER_SHAPE = {
  axa: `Structure the draft under these exact headings, matching AXA's expected format for a session-extension request:
- Clinical summary
- Signs of reliable improvement or recovery
- Key goals achieved and areas still being worked on
- Why additional sessions are clinically appropriate
- Risk or safeguarding concerns
- Number of further sessions requested`,
  bupa: `Structure the draft under these exact headings, matching Bupa's own "Further treatment for a mental health condition" progress form (UNI-113944):
- Diagnosis or working diagnosis
- Presenting problem, symptom onset and current medication
- Outcome measures (state the scores and dates given, or the stated reason none are used)
- Other professionals involved
- Therapy modality, and whether it has changed and why
- Sessions so far, frequency, date of last session, and any break in treatment
- Risk assessment: date completed, risk level, and the risk management plan
- Why the sessions requested are clinically appropriate, and whether they are expected to conclude treatment
- Number of further sessions requested`,
  other: `Structure the draft under these exact headings, a generally applicable format:
- Presenting problem and treatment so far
- Progress against agreed goals, including outcome measure evidence
- Current risk assessment
- Clinical rationale for continuing treatment
- Number of further sessions requested`,
};

const SYSTEM = `You draft UK insurer progress and session-extension reports for therapists, counsellors and psychologists, for Antara Innovations' Manifest tool.

You are not a clinician and you never decide anything clinical. Every clinical fact you need is given to you directly in the prompt: the outcome-measure results and the recovery/reliable-improvement findings are computed by fixed, separate code before you ever see them, using the NHS Talking Therapies reliable-change methodology. These facts are ground truth. You must never soften, strengthen, omit, or recalculate any of them. If the facts say reliable improvement was not met, the draft must say that plainly, not imply otherwise through word choice.

Write in a register a clinician would actually use: plain, factual, professional UK clinical English, no padding, no marketing language, no hedging words that aren't in the source material. Use the practitioner's own words from the goals, progress and risk fields wherever they are given, rather than inventing clinical language the practitioner didn't use. Where a field was left blank or says "none", state that plainly, e.g. "No risk or safeguarding concerns were identified at this review," never invent detail to fill a gap.

Never include the client's name or any identifying detail beyond the reference the practitioner gave you. Never include information not present in what you were given.

Output the draft only, under the exact headings specified, as plain text with headings on their own line. No preamble, no sign-off, no explanation of what you did.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } } });
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Sign in again to continue." }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  // Enforce the free-report limit server-side, by counting real rows, never by trusting the client.
  const { count, error: countErr } = await db
    .from("manifest_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (countErr) return json({ error: "Could not check your usage. Try again." }, 500);
  if ((count ?? 0) >= FREE_REPORT_LIMIT) {
    // Returned as a normal 200 with ok:false, deliberately not a 4xx status.
    // supabase-js's handling of non-2xx function responses isn't something
    // this codebase relies on anywhere else (bearing-score and ensign-score
    // both just throw on any error and fall back), so this stays on the
    // same, already-proven path: a 200 body the client reads directly.
    return json({ ok: false, reason: "limit_reached", limit: FREE_REPORT_LIMIT, used: count });
  }

  const insurer = ["axa", "bupa", "other"].includes(body.insurer) ? body.insurer : "other";
  const clientRef = trim(body.client_ref, 40) || "Client";
  const presentingIssue = trim(body.presenting_issue, MAX_CHARS);
  const sessionsCompleted = Number.isFinite(+body.sessions_completed) ? Math.max(0, Math.min(200, +body.sessions_completed)) : null;
  const sessionsRequested = Number.isFinite(+body.sessions_requested) ? Math.max(1, Math.min(52, +body.sessions_requested)) : null;
  const goals = trim(body.goals, MAX_CHARS);
  const progress = trim(body.progress, MAX_CHARS);
  const risk = trim(body.risk, MAX_CHARS) || "None identified.";
  const noMeasuresReason = trim(body.no_measures_reason, 200);
  const deteriorationRationale = trim(body.deterioration_rationale, 800);

  // Bupa-specific fields. Harmless, unused strings for AXA/Other, this
  // function doesn't branch on insurer to decide whether to read them, the
  // prompt below only surfaces what each insurer's own heading list asks for.
  const diagnosis = trim(body.diagnosis, 200);
  const modality = trim(body.modality, 100);
  const modalityChangeReason = trim(body.modality_change_reason, 200);
  const sessionFrequency = trim(body.session_frequency, 60);
  const lastSessionDate = trim(body.last_session_date, 20);
  const treatmentBreak = trim(body.treatment_break, 200);
  const otherProfessionals = trim(body.other_professionals, 200);
  const concludesTreatment = trim(body.concludes_treatment, 60);
  const furtherGoals = trim(body.further_goals, 800);
  const riskAssessmentDate = trim(body.risk_assessment_date, 20);
  const riskLevel = trim(body.risk_level, 20);
  const riskPlan = trim(body.risk_plan, 800);

  const rawFacts = {
    phq9: (body.phq9_baseline !== undefined && body.phq9_baseline !== null && body.phq9_baseline !== "")
      ? { baseline: +body.phq9_baseline, latest: +body.phq9_latest } : null,
    gad7: (body.gad7_baseline !== undefined && body.gad7_baseline !== null && body.gad7_baseline !== "")
      ? { baseline: +body.gad7_baseline, latest: +body.gad7_latest } : null,
  };
  const outcome = assessOutcome(rawFacts);
  const facts = outcomeFacts(outcome);

  if (sessionsCompleted === null || sessionsRequested === null) {
    return json({ error: "Sessions completed and sessions requested are required." }, 400);
  }

  const prompt = `INSURER: ${insurer.toUpperCase()}
CLIENT REFERENCE: ${clientRef}
SESSIONS COMPLETED SO FAR: ${sessionsCompleted}
FURTHER SESSIONS BEING REQUESTED: ${sessionsRequested}

PRESENTING ISSUE (practitioner's own words):
${presentingIssue || "Not provided."}

GOALS SET AT OUTSET (practitioner's own words):
${goals || "Not provided."}

PROGRESS AGAINST GOALS (practitioner's own words):
${progress || "Not provided."}

RISK OR SAFEGUARDING (practitioner's own words):
${risk}

IF NO OUTCOME MEASURES WERE GIVEN, THE STATED REASON:
${noMeasuresReason || "No reason given."}

IF PROGRESS IS FLAT OR WORSE, THE PRACTITIONER'S OWN RATIONALE:
${deteriorationRationale || "No rationale given."}

COMPUTED OUTCOME FACTS (fixed, do not alter, do not recalculate):
${facts.join("\n")}

${insurer === "bupa" ? `BUPA-SPECIFIC FIELDS (use these for the headings that ask for them, state plainly whatever is "Not given" rather than inventing it):
Diagnosis or working diagnosis: ${diagnosis || "Not given."}
Therapy modality: ${modality || "Not given."}
Modality change and reason: ${modalityChangeReason || "No change stated."}
Session frequency: ${sessionFrequency || "Not given."}
Date of last session: ${lastSessionDate || "Not given."}
Break in treatment: ${treatmentBreak || "None stated."}
Other professionals involved: ${otherProfessionals || "None stated."}
Expected to conclude treatment: ${concludesTreatment || "Not stated."}
Goals for this further course: ${furtherGoals || "Not given."}
Risk assessment date: ${riskAssessmentDate || "Not given."}
Risk level: ${riskLevel || "Not given."}
Risk management plan: ${riskPlan || "Not given."}` : ""}

${INSURER_SHAPE[insurer]}

Write the draft now.`;

  let draftText;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, system: SYSTEM, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await r.json();
    draftText = data?.content?.find((b) => b.type === "text")?.text;
    if (!draftText) throw new Error(JSON.stringify(data).slice(0, 300));
  } catch (e) {
    console.error("draft generation error", e);
    return json({ error: "Couldn't generate the draft just now. Try again." }, 502);
  }

  const { data: saved, error: saveErr } = await db.from("manifest_reports").insert({
    user_id: user.id,
    insurer, client_ref: clientRef,
    sessions_completed: sessionsCompleted, sessions_requested: sessionsRequested,
    presenting_issue: presentingIssue, goals, progress, risk,
    no_measures_reason: noMeasuresReason, deterioration_rationale: deteriorationRationale,
    diagnosis, modality, modality_change_reason: modalityChangeReason,
    session_frequency: sessionFrequency, last_session_date: lastSessionDate || null,
    treatment_break: treatmentBreak, other_professionals: otherProfessionals,
    concludes_treatment: concludesTreatment, further_goals: furtherGoals,
    risk_assessment_date: riskAssessmentDate || null, risk_level: riskLevel, risk_plan: riskPlan,
    outcome_facts: facts, draft_text: draftText,
  }).select("id, created_at").single();
  if (saveErr) {
    console.error("save error", saveErr);
    // The draft was generated; return it even if saving the record failed, but log it as the free-count will be wrong.
  }

  return json({
    ok: true,
    draft: draftText,
    facts,
    report_id: saved?.id ?? null,
    used: (count ?? 0) + 1,
    limit: FREE_REPORT_LIMIT,
  });
});
