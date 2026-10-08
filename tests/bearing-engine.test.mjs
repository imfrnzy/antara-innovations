import assert from "node:assert/strict";
import { assess, claimsToTest, summariseSupervisor, compareResults, selectQuestions } from "../tools/bearing/engine.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("PASS", name); };
const profile = { jurisdictions: ["uk", "ch"], sector: "insurer", size: "mid", uses: ["claims"] };
const all = (value) => Object.fromEntries(selectQuestions(profile).map((q) => [q.id, q.type === "written" ? { value, text: "x", critique: "y" } : value]));

t("claims to test: only 'evidence' answers, never written ones, heaviest obligations first, capped", () => {
  const c = claimsToTest(profile, all("evidence"), 3);
  assert.equal(c.length, 3);
  assert.ok(c.every((x) => !["q_reasonable", "q_understanding", "q_explain", "q_investment_oversight"].includes(x.id)));
  assert.ok(c[0].weight >= c[1].weight && c[1].weight >= c[2].weight);
  assert.equal(claimsToTest(profile, all("partly")).length, 0);
  assert.equal(claimsToTest(profile, all("no")).length, 0);
  assert.equal(claimsToTest(profile, all("unknown")).length, 0);
});
t("claims to test is deterministic", () => {
  assert.deepEqual(claimsToTest(profile, all("evidence")), claimsToTest(profile, all("evidence")));
});
t("supervisor summary", () => {
  const s = summariseSupervisor([{ questionId: "a", band: "evidence" }, { questionId: "b", band: "partly" }, { questionId: "c", band: "no" }, { questionId: "d", band: "junk" }]);
  assert.deepEqual([s.tested, s.held, s.partly, s.notHeld], [3, 1, 1, 1]);
  assert.match(s.line, /1 of 3 claims held up/);
  assert.match(summariseSupervisor([{ band: "evidence" }, { band: "evidence" }]).line, /All 2 of the claims/);
  assert.equal(summariseSupervisor([]).line, "");
});
t("compare two runs: improvements, regressions, deltas", () => {
  const before = assess(profile, all("no"));
  const after = assess(profile, all("evidence"));
  const c = compareResults(before, after);
  assert.ok(c.improved.length > 0 && c.worsened.length === 0);
  assert.ok(c.lenses.every((l) => l.delta > 0));
  const back = compareResults(after, before);
  assert.ok(back.worsened.length === c.improved.length);
  assert.equal(c.sameEngine, true);
});
t("compare with nothing returns null; identical runs show no change", () => {
  assert.equal(compareResults(null, assess(profile, all("no"))), null);
  const a = assess(profile, all("partly"));
  const c = compareResults(a, a);
  assert.equal(c.improved.length + c.worsened.length, 0);
  assert.ok(c.unchanged > 0);
});
console.log(n + " passed");
