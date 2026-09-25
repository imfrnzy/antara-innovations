// Squall scoring engine. Deterministic: the same responses always give the
// same readout. A response is {scenarioId, decision, confidence, timedOut}.

import { SCENARIOS, ENGINE_VERSION } from "./scenarios.js";

export const CATEGORY_LABEL = { genuine: "Genuine", fake: "Fake or manipulated", escalate: "Uncertain, should escalate" };
export const BAND_FOR = (percent) => {
  if (percent >= 80) return "Sharp";
  if (percent >= 50) return "Mixed";
  return "Exposed";
};

export function scenariosFor(module) {
  return SCENARIOS.filter((scenario) => scenario.module === module);
}

function isCorrect(scenario, decision) {
  return decision === scenario.truth;
}

export function assess(module, responses) {
  const set = scenariosFor(module);
  const byId = {};
  responses.forEach((response) => { byId[response.scenarioId] = response; });

  let correctCount = 0;
  let timeoutCount = 0;
  let overconfidentWrong = 0;
  const byCategory = { genuine: { correct: 0, total: 0 }, fake: { correct: 0, total: 0 }, escalate: { correct: 0, total: 0 } };
  const rows = [];

  for (const scenario of set) {
    const response = byId[scenario.id];
    const timedOut = !response || response.timedOut;
    const decision = timedOut ? null : response.decision;
    const correct = !timedOut && isCorrect(scenario, decision);

    if (timedOut) timeoutCount = timeoutCount + 1;
    if (correct) correctCount = correctCount + 1;
    if (!timedOut && !correct && response.confidence === "high") overconfidentWrong = overconfidentWrong + 1;

    byCategory[scenario.truth].total = byCategory[scenario.truth].total + 1;
    if (correct) byCategory[scenario.truth].correct = byCategory[scenario.truth].correct + 1;

    rows.push({
      scenarioId: scenario.id,
      truth: scenario.truth,
      why: scenario.why,
      decision: decision,
      timedOut: timedOut,
      correct: correct,
      confidence: timedOut ? null : response.confidence,
    });
  }

  const total = set.length;
  const percent = total === 0 ? 0 : Math.round((correctCount / total) * 100);

  const categoryBreakdown = Object.keys(byCategory)
    .filter((key) => byCategory[key].total > 0)
    .map((key) => ({
      category: key,
      label: CATEGORY_LABEL[key],
      correct: byCategory[key].correct,
      total: byCategory[key].total,
      percent: Math.round((byCategory[key].correct / byCategory[key].total) * 100),
    }))
    .sort((first, second) => first.percent - second.percent);

  return {
    engineVersion: ENGINE_VERSION,
    module: module,
    total: total,
    correctCount: correctCount,
    percent: percent,
    band: BAND_FOR(percent),
    timeoutCount: timeoutCount,
    overconfidentWrong: overconfidentWrong,
    categoryBreakdown: categoryBreakdown,
    weakestCategory: categoryBreakdown[0] || null,
    rows: rows,
  };
}
