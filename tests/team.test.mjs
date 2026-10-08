import assert from "node:assert/strict";
import {
  encodeScenarioAnswers, encodePulseAnswers, analyseScenarioSummary, analysePulseSummary,
  joinUrl, newToken, normaliseCode, SCENARIO_CODE,
} from "../assets/team.js";
import { SCENARIOS as SQ } from "../tools/squall/scenarios.js";
import { SCENARIOS as EN } from "../tools/ensign/scenarios.js";
import { PULSE_QUESTIONS } from "../halo/pulse-questions.js";
import { FIELDS } from "../halo/engine.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("PASS", name); };

t("every scenario and pulse key fits the database key rule", () => {
  for (const s of [...SQ, ...EN]) assert.match(s.id, /^[A-Za-z0-9_]{1,40}$/, s.id);
  for (const q of PULSE_QUESTIONS) assert.match(q.key, /^[A-Za-z0-9_]{1,40}$/);
  assert.ok(new Set([...SQ, ...EN].map((s) => s.id)).size === SQ.length + EN.length, "ids unique");
});
t("pulse questions cover the seven HALO standards exactly", () => {
  const keys = PULSE_QUESTIONS.map((q) => q.key).sort();
  assert.deepEqual(keys, FIELDS.filter((f) => f !== "CALIBRATION").sort());
});
t("scenario encoding: correct, wrong, overconfident, timeout, missing", () => {
  const set = [{ id: "a", truth: "fake" }, { id: "b", truth: "fake" }, { id: "c", truth: "fake" }, { id: "d", truth: "fake" }, { id: "e", truth: "fake" }];
  const out = encodeScenarioAnswers(set, [
    { scenarioId: "a", decision: "fake", confidence: "low" },
    { scenarioId: "b", decision: "genuine", confidence: "medium" },
    { scenarioId: "c", decision: "genuine", confidence: "high" },
    { scenarioId: "d", decision: null, timedOut: true },
  ]);
  assert.deepEqual(out, { a: 1, b: 0, c: 3, d: 2, e: 2 });
});
t("pulse encoding drops anything that is not 0, 1 or 2", () => {
  assert.deepEqual(encodePulseAnswers(PULSE_QUESTIONS, { R1_clarity: 2, R2_acknowledgement: 5, R3_decision_transparency: "1", R4_quick_repair: 0 }), { R1_clarity: 2, R4_quick_repair: 0 });
});

const summary = (qs, n = 4) => ({ visible: true, n, questions: qs });
t("scenario summary: weakest first, overconfidence flagged, gap against leader", () => {
  const set = [{ id: "x", truth: "fake", text: "X", why: "wx" }, { id: "y", truth: "fake", text: "Y", why: "wy" }];
  const a = analyseScenarioSummary(summary({
    x: { counts: { 1: 3, 0: 1 }, n: 4 },
    y: { counts: { 1: 1, 3: 2, 2: 1 }, n: 4 },
  }), set, 100);
  assert.equal(a.weakest[0].id, "y");
  assert.equal(a.weakest[0].correctPct, 25);
  assert.equal(a.teamPercent, 50);
  assert.equal(a.gap.diff, 50);
  assert.match(a.gap.reading, /higher than your team/);
  assert.match(a.watchOut, /2 answers were wrong/);
  assert.equal(a.timeouts, 1);
});
t("hidden summary returns null, no numbers leak", () => {
  assert.equal(analyseScenarioSummary({ visible: false, n: 2 }, SQ), null);
  assert.equal(analysePulseSummary({ visible: false, n: 2 }, PULSE_QUESTIONS), null);
  assert.equal(analyseScenarioSummary(null, SQ), null);
});
t("pulse summary: gap against leader's own rating", () => {
  const a = analysePulseSummary(summary({
    R1_clarity: { avg: 0.5, n: 4, counts: { 0: 2, 1: 2 } },
    R2_acknowledgement: { avg: 1.75, n: 4, counts: { 1: 1, 2: 3 } },
  }), PULSE_QUESTIONS, { R1_clarity: 2, R2_acknowledgement: 2 });
  assert.equal(a.biggestGap.key, "R1_clarity");
  assert.equal(a.biggestGap.gap, 1.5);
  assert.match(a.biggestGap.reading, /clearly higher than your team/);
  assert.equal(a.rows.find((r) => r.key === "R2_acknowledgement").reading, "Close to how you saw it.");
  assert.equal(a.weakestForTeam.key, "R1_clarity");
  assert.deepEqual(a.rows[0].split, { reliably: 0, sometimes: 2, rarely: 2 });
});
t("pulse summary with no leader levels has no gap claims", () => {
  const a = analysePulseSummary(summary({ R1_clarity: { avg: 1, n: 3, counts: { 1: 3 } } }), PULSE_QUESTIONS, null);
  assert.equal(a.biggestGap, null); assert.equal(a.rows[0].gap, null);
});
t("links, tokens, codes", () => {
  assert.equal(joinUrl("https://www.antara-innovations.com/", "AB12CD34"), "https://www.antara-innovations.com/team/?code=AB12CD34");
  assert.equal(newToken((k) => new Uint8Array(k).fill(171)).length, 36);
  assert.equal(normaliseCode(" ab-12 cd34zz "), "AB12CD34");
  assert.equal(SCENARIO_CODE.overconfident, 3);
});
console.log(n + " passed");
import { trendLine } from "../assets/team.js";
{
  assert.equal(trendLine(null, 50), null);
  assert.match(trendLine({ percent: 50, date: "2026-08-01T00:00:00Z", overconfidentWrong: 2 }, 67, 0), /Last run \(1 August 2026\): 50%. This run: 67%, up 17 points. Fewer answers were wrong and sure./);
  assert.match(trendLine({ percent: 80, overconfidentWrong: 0 }, 60, 1), /down 20 points. More answers were wrong and sure./);
  assert.match(trendLine({ percent: 50 }, 50), /no change/);
  console.log("PASS trend line");
}
