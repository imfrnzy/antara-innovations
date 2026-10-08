// Manifest reliable-change engine, v1.
// This file computes "reliable improvement" and "recovery" the same way
// NHS Talking Therapies (IAPT) outcome reporting does: a fixed point-change
// threshold per measure, and a fixed caseness threshold per measure. The AI
// drafting the report is given these computed facts and is never allowed to
// invent or soften them; this file is the only thing that decides what
// counts as reliable change. No network calls, no AI, same facts in, same
// result out, every time.

export const MEASURES = {
  phq9: {
    label: "PHQ-9",
    max: 27,
    reliableChangeThreshold: 6,   // NHS Talking Therapies reliable change threshold for PHQ-9
    casenessThreshold: 10,        // score at or above this counts as clinical "caseness"
  },
  gad7: {
    label: "GAD-7",
    max: 21,
    reliableChangeThreshold: 4,   // NHS Talking Therapies reliable change threshold for GAD-7
    casenessThreshold: 8,
  },
};

// A single measure's reliable-change result.
function scoreMeasure(key, baseline, latest) {
  const m = MEASURES[key];
  if (!m || baseline === null || baseline === undefined || latest === null || latest === undefined) {
    return null;
  }
  const change = baseline - latest; // positive = improvement (score went down)
  const reliableImprovement = change >= m.reliableChangeThreshold;
  const reliableDeterioration = change <= -m.reliableChangeThreshold;
  const startedAboveCaseness = baseline >= m.casenessThreshold;
  const nowBelowCaseness = latest < m.casenessThreshold;
  return {
    measure: m.label,
    baseline, latest, change,
    reliableImprovement,
    reliableDeterioration,
    noReliableChange: !reliableImprovement && !reliableDeterioration,
    movedBelowCaseness: startedAboveCaseness && nowBelowCaseness,
  };
}

// facts = { phq9: {baseline, latest} | null, gad7: {baseline, latest} | null }
// Recovery (NHS Talking Therapies definition): started at or above caseness
// on at least one measure, and now below caseness on every measure scored.
export function assessOutcome(facts) {
  const results = {};
  let anyStartedAboveCaseness = false;
  let allScoredBelowCaseness = true;
  let anyScored = false;

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

  if (!anyScored) {
    return { scored: false, results: {}, recovery: null, reliableImprovementAny: null };
  }

  const recovery = anyStartedAboveCaseness && allScoredBelowCaseness;
  const reliableImprovementAny = Object.values(results).some((r) => r.reliableImprovement);
  const reliableDeteriorationAny = Object.values(results).some((r) => r.reliableDeterioration);

  return {
    scored: true,
    results,
    recovery,
    reliableImprovementAny,
    reliableDeteriorationAny,
  };
}

// Plain-English, factual summary lines for the given outcome, used both in
// the on-screen preview and passed to the drafting function as ground truth.
// These sentences are deliberately plain and literal; the drafting step may
// rephrase them but must not change what they assert.
export function outcomeFacts(outcome) {
  if (!outcome.scored) return ["No outcome measure scores were provided."];
  const lines = [];
  for (const key of Object.keys(outcome.results)) {
    const r = outcome.results[key];
    const dir = r.change > 0 ? "a decrease of" : r.change < 0 ? "an increase of" : "no change,";
    lines.push(
      `${r.measure}: baseline ${r.baseline}, latest ${r.latest} (${dir} ${Math.abs(r.change)} point${Math.abs(r.change) === 1 ? "" : "s"}). ` +
      `${r.reliableImprovement ? "This meets the threshold for reliable improvement." : r.reliableDeterioration ? "This meets the threshold for reliable deterioration." : "This does not meet the threshold for reliable change in either direction."}`
    );
  }
  lines.push(
    outcome.recovery
      ? "Recovery: the client has moved from at-or-above clinical caseness to below caseness on every measure scored."
      : "Recovery: the client has not moved from clinical caseness to below caseness on every measure scored."
  );
  return lines;
}

// ---- Query-risk check, v1 ----
// A deterministic check against what AXA and Bupa are actually documented
// to ask for, run entirely client side, before anything is sent to the AI
// or to the insurer. Each rule exists because of something specific found
// in an insurer's own form or published guidance, not a guess at what
// "might" matter. Flags are "red" (a documented, named requirement is
// unmet) or "amber" (a gap that commonly invites a query, per the research,
// but isn't a named hard requirement). This never blocks sending, a
// clinician's judgement always overrides a flag, it only makes sure
// nothing gets missed by accident.
//
// Sources: Bupa "Further treatment for a mental health condition" patient
// progress form (UNI-113944, June 2026); AXA session-extension guidance via
// HelloSelf provider help centre (16 Sept 2025).

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export function assessQueryRisk(data, outcome) {
  const flags = [];
  const insurer = data.insurer;

  // Shared across insurers
  if (!data.sessions_requested || data.sessions_requested < 1) {
    flags.push({
      severity: "red",
      message: "No exact number of further sessions given.",
      why: "AXA's own guidance says to \"mention the exact number of extra sessions\" requested, not a range or an open-ended ask.",
    });
  }

  const hasMeasures = !!(data.phq9_baseline || data.gad7_baseline);
  if (!hasMeasures && !data.no_measures_reason) {
    flags.push({
      severity: "amber",
      message: "No outcome measure scores given, and no reason stated for that.",
      why: insurer === "bupa"
        ? "Bupa's form asks directly whether outcome measures are collected, and if not, asks why not. Leaving this blank rather than answered is more likely to draw a query than a clear \"not used for this modality\" would be."
        : "A reviewer looks for outcome scores, or a stated reason none are used. Leaving it blank rather than answered is more likely to draw a query than a clear \"not used for this modality\" would be.",
    });
  }

  if (outcome && outcome.scored && !outcome.recovery && !outcome.reliableImprovementAny && !data.risk && !data.deterioration_rationale) {
    flags.push({
      severity: "amber",
      message: "Scores show no reliable improvement, with no explanation offered for why.",
      why: "Insurers reviewing a flat or worsening score without any stated clinical reasoning, a formulation change, a life event, a modality switch, tend to query it. One sentence of rationale here is usually enough to pre-empt that.",
    });
  }

  if (insurer === "axa") {
    if (data.sessions_completed >= 10) {
      flags.push({
        severity: "red",
        message: "10 or more sessions completed on an AXA referral.",
        why: "AXA's guidance says therapy should pause beyond 10 sessions until written approval is received, and sessions delivered without that approval may not be funded.",
      });
    } else if (data.sessions_completed >= 6 && data.sessions_completed < 10) {
      flags.push({
        severity: "amber",
        message: "6 or more sessions completed on an AXA referral.",
        why: "How many sessions are funded depends on the client's policy, and AXA asks for approval before treatment goes past a set number. Worth confirming how many this client's policy funds, and that the request goes in before they run out.",
      });
    }
  }

  if (insurer === "bupa") {
    if (!data.diagnosis) {
      flags.push({ severity: "red", message: "No diagnosis or working diagnosis given.", why: "Bupa's progress form asks for this by name." });
    }
    if (!data.modality) {
      flags.push({ severity: "red", message: "No therapy modality stated.", why: "Bupa's form asks what modality is being used, and whether it has changed." });
    }
    const riskDays = daysSince(data.risk_assessment_date);
    if (!data.risk_assessment_date) {
      flags.push({
        severity: "red",
        message: "No risk assessment date given.",
        why: "Bupa's form requires the risk assessment to have been completed within the last 7 to 10 days, and asks for that date directly.",
      });
    } else if (riskDays !== null && riskDays > 10) {
      flags.push({
        severity: "red",
        message: `Risk assessment is ${riskDays} days old.`,
        why: "Bupa's form states the risk assessment needs to have been completed within the last 7 to 10 days.",
      });
    }
    if (data.risk_level && data.risk_level !== "none" && !data.risk_plan) {
      flags.push({
        severity: "red",
        message: "A risk level is recorded but no risk management plan is given.",
        why: "Bupa's form asks for a risk management plan wherever a risk level above none is recorded, and asks why not if there isn't one.",
      });
    }
    if (!data.concludes_treatment) {
      flags.push({
        severity: "amber",
        message: "No answer given on whether these further sessions are expected to conclude treatment.",
        why: "This is a direct question on Bupa's form. Answering it, even with \"not yet, here's why\", reads as more complete than leaving it open.",
      });
    }
  }

  return flags;
}
