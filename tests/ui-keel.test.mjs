import assert from "node:assert/strict";
import { serve, launch } from "./ui-harness.mjs";
import { classify } from "../keel/engine.js";
const { server, base } = await serve();
let n = 0; const ok = (m) => { n++; console.log("PASS", m); };
const F = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v, status: "confirmed", quote: "q" }]));
const facts = F({ EXISTING_COE: "no", OM1_regulatory_exposure: "high", OM2_existing_capability: "low", OM3_spend_model: "low", R1_sponsorship: "absent", R2_team: "partial", R3_portfolio: "established", R4_risk_gate: "established", R5_testing_monitoring: "established", R6_benefits_proof: "established" });
const oldFacts = F({ ...Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, v.value])), R1_sponsorship: "absent", R2_team: "absent" });
const mock = { tables: {
  keel_assessments: [
    { id: "k1", user_id: "u1", status: "complete", classification: { ...classify(oldFacts), engine: "keel-rules-2.0" }, created_at: "2026-08-01T10:00:00Z" },
    { id: "k2", user_id: "u1", status: "complete", facts, classification: classify(facts), report_md: "## Fine\nBody.", created_at: "2026-10-01T10:00:00Z" },
  ],
  keel_profiles: [{ user_id: "u1", first_name: "Ann", work_email: "ann@corp.com" }],
} };
const { browser, page, errors } = await launch(base, { mock, localStorage: { "keel.assessment": "k2" } });
try {
  await page.goto(base + "/keel/");
  await page.waitForSelector("#flipBox:not([hidden])");
  const flip = await page.textContent("#flipBox");
  assert.match(flip, /How firm is this recommendation/); assert.match(flip, /one point from a different answer/); assert.match(flip, /would move from centralised to/); ok("flip box shows margin and the smallest flips");
  const gates = await page.textContent("#gatesBox");
  assert.match(gates, /Sponsorship/); assert.match(gates, /Within 30 days/); assert.match(gates, /Minimum viable team/); ok("90-day gates for the two weak areas");
  assert.ok(gates.indexOf("Sponsorship") < gates.indexOf("Minimum viable team")); ok("weakest first");
  await page.waitForSelector("#cmpBox:not([hidden])");
  const cmp = await page.textContent("#cmpBox");
  assert.match(cmp, /1 August 2026/); assert.match(cmp, /Minimum viable team: absent to partial \(better\)/); assert.match(cmp, /scoring rules were updated/); ok("comparison with the previous run");
  assert.deepEqual(errors, []); ok("no page errors");
} finally { await browser.close(); }

// The report is requested once, and shown when it arrives.
{
  const mock2 = { tables: { keel_assessments: [{ id: "k3", user_id: "u1", status: "complete", facts, classification: classify(facts), report_md: null, created_at: "2026-10-01T10:00:00Z" }], keel_profiles: mock.tables.keel_profiles }, invoke: { "keel-interview": { report_md: "## Written now\nBody text for the report." } } };
  const b2 = await launch(base, { mock: mock2, localStorage: { "keel.assessment": "k3" } });
  try {
    await b2.page.goto(base + "/keel/");
    await b2.page.waitForSelector("#reportBody:not([hidden])");
    assert.match(await b2.page.textContent("#reportBody"), /Written now/); ok("a report that is not saved yet is written and shown");
    const log = await b2.page.evaluate(() => window.__mock.log);
    assert.equal(log.filter((l) => l.op === "invoke" && l.body && l.body.action === "generate_report").length, 1); ok("the report is requested exactly once");
    assert.deepEqual(b2.errors, []); ok("no page errors on the report path");
  } finally { await b2.browser.close(); }
}
server.close();
console.log(n + " checks passed");
