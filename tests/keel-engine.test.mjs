import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classify, flipAnalysis, ninetyDayGates, compareKeel, omPush, ENGINE_VERSION } from "../keel/engine.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("PASS", name); };
const F = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));

t("version", () => assert.equal(ENGINE_VERSION, "keel-rules-2.2"));
t("high capability pushes away from central control, scattered spend pushes towards it", () => {
  assert.equal(omPush("OM2_existing_capability", "high"), 1);
  assert.equal(omPush("OM2_existing_capability", "low"), 3);
  assert.equal(omPush("OM3_spend_model", "high"), 3);
  assert.equal(omPush("OM3_spend_model", "low"), 1);
  assert.equal(omPush("OM1_regulatory_exposure", "high"), 3);
  assert.equal(omPush("OM1_regulatory_exposure", "unknown"), 3);
  assert.equal(omPush("OM2_existing_capability", undefined), 3);
});
t("the reason text now matches the result", () => {
  // Low exposure, capability in many teams, spend already in one place (low = not scattered): the Federated reason.
  const fed = classify(F({ OM1_regulatory_exposure: "low", OM2_existing_capability: "high", OM3_spend_model: "low" }));
  assert.equal(fed.operating_model.model, "FEDERATED");
  // High exposure, little capability, spend scattered (high = scattered): the Centralised reason.
  const cen = classify(F({ OM1_regulatory_exposure: "high", OM2_existing_capability: "low", OM3_spend_model: "high" }));
  assert.equal(cen.operating_model.model, "CENTRALISED");
});
t("all unknown stays on the cautious side", () => assert.equal(classify({}).operating_model.model, "CENTRALISED"));

t("flip analysis: margin and what would change it", () => {
  const f = flipAnalysis(F({ OM1_regulatory_exposure: "high", OM2_existing_capability: "low", OM3_spend_model: "medium" }));
  assert.equal(f.model, "CENTRALISED"); assert.equal(f.total, 8); assert.equal(f.margin, 2); assert.equal(f.fragile, false);
  assert.ok(f.flips.length > 0);
  assert.ok(f.flips.every((x) => x.newModel !== "CENTRALISED"));
  assert.match(f.flips[0].sentence, /would move from centralised to/);
});
t("regression: a team that says its spend is scattered is pushed towards central control, not away", () => {
  // Live finding, 8 Oct 2026: "each business unit buys its own tools" was recorded as high. Under 2.1 that scored 1.
  const scattered = classify(F({ OM1_regulatory_exposure: "medium", OM2_existing_capability: "medium", OM3_spend_model: "high" }));
  const oneplace = classify(F({ OM1_regulatory_exposure: "medium", OM2_existing_capability: "medium", OM3_spend_model: "low" }));
  assert.ok(scattered.operating_model.total > oneplace.operating_model.total);
  assert.equal(scattered.operating_model.factor_scores.OM3_spend_model, 3);
});
t("the function copy of the rules says the same thing", () => {
  const fn = readFileSync(new URL("../supabase/functions/keel-interview/index.ts", import.meta.url), "utf8");
  assert.match(fn, /ENGINE_VERSION = "keel-rules-2\.2"/);
  assert.match(fn, /OM_PUSH_REVERSED = \["OM2_existing_capability"\]/);
  assert.match(fn, /Never record scattered spend as "low"/);
});
t("flip analysis flags a recommendation one point from the edge", () => {
  const f = flipAnalysis(F({ OM1_regulatory_exposure: "high", OM2_existing_capability: "low", OM3_spend_model: "low" }));
  assert.equal(f.total, 7); assert.equal(f.margin, 1); assert.equal(f.fragile, true);
});
t("every flip really changes the classification", () => {
  const base = { OM1_regulatory_exposure: "medium", OM2_existing_capability: "medium", OM3_spend_model: "medium" };
  const f = flipAnalysis(F(base));
  for (const x of f.flips) {
    const changed = classify(F({ ...base, [x.field]: x.to }));
    assert.equal(changed.operating_model.model, x.newModel);
  }
});
t("unknown answers are called out", () => {
  assert.match(flipAnalysis(F({ OM1_regulatory_exposure: "low" })).unknownNote, /2 answers were unknown/);
  assert.equal(flipAnalysis(F({ OM1_regulatory_exposure: "low", OM2_existing_capability: "low", OM3_spend_model: "low" })).unknownNote, null);
});
t("90-day gates: only weak dimensions, weakest first, partial gets the later step only", () => {
  const c = classify(F({ R1_sponsorship: "established", R2_team: "partial", R3_portfolio: "absent", R4_risk_gate: "established", R5_testing_monitoring: "established", R6_benefits_proof: "established" }));
  const g = ninetyDayGates(c);
  assert.deepEqual(g.map((x) => x.field), ["R3_portfolio", "R2_team"]);
  assert.equal(g[0].steps.length, 2); assert.equal(g[1].steps.length, 1);
  assert.match(g[1].steps[0], /Within 90 days/);
  assert.deepEqual(ninetyDayGates(classify(F({ R1_sponsorship: "established", R2_team: "established", R3_portfolio: "established", R4_risk_gate: "established", R5_testing_monitoring: "established", R6_benefits_proof: "established" }))), []);
});
t("compare two runs", () => {
  const a = classify(F({ R1_sponsorship: "absent", R2_team: "partial", OM1_regulatory_exposure: "high", OM2_existing_capability: "low", OM3_spend_model: "high" }));
  const b = classify(F({ R1_sponsorship: "established", R2_team: "absent", OM1_regulatory_exposure: "low", OM2_existing_capability: "high", OM3_spend_model: "low" }));
  const c = compareKeel(a, b);
  assert.ok(c.moved.find((m) => m.field === "R1_sponsorship" && m.direction === "up"));
  assert.ok(c.moved.find((m) => m.field === "R2_team" && m.direction === "down"));
  assert.equal(c.model.changed, true); assert.equal(c.model.before, "CENTRALISED"); assert.equal(c.model.after, "FEDERATED");
  assert.equal(compareKeel(null, b), null);
});

// Parity: the copy pasted into the edge function must score exactly like keel/engine.js
t("edge function copy scores identically to keel/engine.js", () => {
  const fn = readFileSync(new URL("../supabase/functions/keel-interview/index.ts", import.meta.url), "utf8");
  const block = fn.slice(fn.indexOf("// ---- Keel scoring rules"), fn.indexOf("// ---- end scoring rules ----"));
  const copy = new Function(block + "\nreturn { classify, nextGaps, ENGINE_VERSION };")();
  assert.equal(copy.ENGINE_VERSION, ENGINE_VERSION);
  const vals = ["low", "medium", "high", "unknown", undefined];
  const lv = ["absent", "partial", "established", "unknown", undefined];
  let checked = 0;
  for (const a of vals) for (const b of vals) for (const c of vals) for (const r of lv) {
    const facts = F({ OM1_regulatory_exposure: a, OM2_existing_capability: b, OM3_spend_model: c, R1_sponsorship: r, R2_team: lv[(lv.indexOf(r) + 1) % 5], EXISTING_COE: "yes", CURRENT_MODEL: "hybrid" });
    assert.deepEqual(copy.classify(facts), classify(facts)); checked++;
  }
  assert.ok(checked > 600);
});
console.log(n + " passed");
