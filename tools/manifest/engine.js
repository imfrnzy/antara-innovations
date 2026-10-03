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
