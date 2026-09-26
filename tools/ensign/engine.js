// Ensign scoring engine. Deterministic for the six rounds; the written
// question's band comes from the grading edge function and is folded in
// here exactly like the rest, not scored separately.

import { SCENARIOS, ENGINE_VERSION } from "./scenarios.js";

export const TRUTH_LABEL = { label: "Needed a disclosure", nolabel: "No disclosure needed", escalate: "Uncertain, should escalate" };
export const BAND_FOR = (percent) => {
  if (percent >= 80) return "Sharp";
  if (percent >= 50) return "Mixed";
  return "Exposed";
};

function isCorrect(scenario, decision) {
  return decision === scenario.truth;
}

// writtenResult, if provided, is { band, critique } from the grading
// function: band is "evidence" (strong, counts as correct), "partly" or
// "no" (both count as not correct, "partly" is not nothing, so it's kept
// distinct in the row detail even though it doesn't earn the point).
export function assess(responses, writtenResult) {
  const byId = {};
  responses.forEach((response) => { byId[response.scenarioId] = response; });

  let correctCount = 0;
  let timeoutCount = 0;
  let overconfidentWrong = 0;
  const byTruth = { label: { correct: 0, total: 0 }, nolabel: { correct: 0, total: 0 }, escalate: { correct: 0, total: 0 } };
  const rows = [];

  for (const scenario of SCENARIOS) {
    const response = byId[scenario.id];
    const timedOut = !response || response.timedOut;
    const decision = timedOut ? null : response.decision;
    const correct = !timedOut && isCorrect(scenario, decision);

    if (timedOut) timeoutCount = timeoutCount + 1;
    if (correct) correctCount = correctCount + 1;
    if (!timedOut && !correct && response.confidence === "high") overconfidentWrong = overconfidentWrong + 1;

    byTruth[scenario.truth].total = byTruth[scenario.truth].total + 1;
    if (correct) byTruth[scenario.truth].correct = byTruth[scenario.truth].correct + 1;

    rows.push({
      scenarioId: scenario.id, truth: scenario.truth, why: scenario.why,
      decision: decision, timedOut: timedOut, correct: correct,
      confidence: timedOut ? null : response.confidence, kind: "round",
    });
  }

  let totalGraded = SCENARIOS.length;
  if (writtenResult) {
    totalGraded = totalGraded + 1;
    const writtenCorrect = writtenResult.band === "evidence";
    if (writtenCorrect) correctCount = correctCount + 1;
    rows.push({
      scenarioId: "q_disclosure_defence", truth: "written", why: writtenResult.critique,
      decision: writtenResult.band, timedOut: false, correct: writtenCorrect,
      confidence: null, kind: "written",
    });
  }

  const percent = Math.round((correctCount / totalGraded) * 100);
  const truthBreakdown = Object.keys(byTruth)
    .filter((key) => byTruth[key].total > 0)
    .map((key) => ({
      category: key, label: TRUTH_LABEL[key],
      correct: byTruth[key].correct, total: byTruth[key].total,
      percent: Math.round((byTruth[key].correct / byTruth[key].total) * 100),
    }))
    .sort((first, second) => first.percent - second.percent);

  return {
    engineVersion: ENGINE_VERSION, total: totalGraded, correctCount: correctCount,
    percent: percent, band: BAND_FOR(percent), timeoutCount: timeoutCount,
    overconfidentWrong: overconfidentWrong, truthBreakdown: truthBreakdown,
    rows: rows, hasWritten: Boolean(writtenResult),
  };
}
