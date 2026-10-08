import assert from "node:assert/strict";
import { serve, launch } from "./ui-harness.mjs";
import { assess, selectQuestions } from "../tools/bearing/engine.js";

const { server, base } = await serve();
let n = 0; const ok = (m) => { n++; console.log("PASS", m); };
const profile = { jurisdictions: ["uk", "ch"], sector: "insurer", size: "mid", uses: ["claims"] };
const answersOf = (value) => Object.fromEntries(selectQuestions(profile).map((q) => [q.id, q.type === "written" ? { value: "partly", text: "t", critique: "c" } : value]));
const nowAnswers = answersOf("evidence"), oldAnswers = answersOf("no");
const mock = {
  tables: {
    bearing_assessments: [
      { id: "a1", user_id: "u1", result: assess(profile, oldAnswers), created_at: "2026-08-01T10:00:00Z" },
      { id: "a2", user_id: "u1", result: assess(profile, nowAnswers), answers: nowAnswers, supervisor: null, jurisdictions: profile.jurisdictions, sector: "insurer", org_size: "mid", ai_uses: ["claims"], created_at: "2026-10-01T10:00:00Z" },
    ],
    bearing_profiles: [{ user_id: "u1", first_name: "Ann", work_email: "ann@corp.com" }],
  },
  invoke: { "bearing-score": { request: "Send me your current inventory of AI systems.", band: "partly", critique: "No update date given." } },
};
const { browser, page, errors } = await launch(base, { mock, localStorage: { "bearing.assessment": "a2" } });
try {
  await page.goto(base + "/tools/bearing/");
  await page.waitForSelector("#s-results:not([hidden])");
  assert.ok(await page.locator("#supPanel").isVisible()); ok("supervisor panel shows when there are 'yes, with evidence' claims");
  assert.equal(await page.locator("#supList li").count(), 3); ok("three claims offered, no more");
  await page.waitForSelector("#cmpPanel:not([hidden])");
  const cmp = await page.textContent("#cmpPanel");
  assert.match(cmp, /Since your last run/); assert.match(cmp, /1 August 2026/); assert.match(cmp, /Improved/); ok("comparison with the earlier run is shown");
  await page.locator(".supgo").first().click();
  await page.waitForSelector(".supreq");
  assert.match(await page.textContent(".supreq"), /Send me your current inventory/); ok("the request comes from the server");
  await page.click(".supsend");
  assert.match(await page.textContent(".supbox .err"), /specific answer/); ok("empty answer is refused");
  await page.fill(".supbox textarea", "The AI register held by the CRO, last updated in September.");
  await page.click(".supsend");
  await page.waitForSelector(".suprs");
  assert.match(await page.textContent(".suprs"), /Partly there/);
  assert.match(await page.textContent("#supLine"), /0 of 1 claims held up/); ok("graded result and summary line shown");
  const log = await page.evaluate(() => window.__mock.log);
  const saved = log.find((l) => l.op === "rpc" && l.name === "save_bearing_supervisor");
  assert.equal(saved.args.p_assessment, "a2"); assert.equal(saved.args.p_data.tests[0].band, "partly"); ok("result saved against the assessment");
  const intro = await page.textContent("#s-intro");
  assert.ok(!/No data leaves your browser/.test(await page.content())); ok("the false privacy claim is gone");
  assert.deepEqual(errors, []); ok("no page errors");
  await page.screenshot({ path: "/tmp/work/build/bearing-results.png", fullPage: true });
} finally { await browser.close(); server.close(); }
console.log(n + " checks passed");
