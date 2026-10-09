// Saved results and "what changed" on Keel, HALO, Bearing, Squall and Ensign, driven in a real browser.
import assert from "node:assert/strict";
import { serve, launch } from "./ui-harness.mjs";
import { classify as keelClassify } from "../keel/engine.js";
import { classify as haloClassify } from "../halo/engine.js";
import { assess as bearingAssess, selectQuestions } from "../tools/bearing/engine.js";

const { server, base } = await serve();
let n = 0; const ok = (m) => { n++; console.log("PASS", m); };
const USER = { user: { id: "u1", email: "ann@corp.com", is_anonymous: false } };
const ANON = { user: { id: "u1", is_anonymous: true } };
const F = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v, status: "confirmed", quote: "SECRET-QUOTE" }]));
const logOf = (page) => page.evaluate(() => window.__mock.log);

async function runRounds(page, tool) {
  await page.click("#beginBtn");
  if (tool === "squall") { await page.locator("#moduleChoices input").first().check(); await page.click("#setupForm button[type=submit]"); }
  else { const s = await page.$("#setupForm"); if (s && await s.isVisible()) await page.click("#setupForm button[type=submit]"); }
  for (let i = 0; i < 6; i++) {
    await page.waitForSelector("#decisionOptions .opt", { state: "visible" });
    await page.locator("#decisionOptions .opt").first().click();
    await page.locator("#confOptions button").first().click();
    await page.waitForTimeout(400);
  }
  if (tool === "ensign") { await page.waitForSelector("#qWrittenSkip", { state: "visible" }); await page.click("#qWrittenSkip"); }
  await page.waitForSelector("#s-results:not([hidden])");
}

// Save, add an older and weaker copy, save again, tick the oldest and newest, compare.
async function saveAndCompare(page, tool) {
  await page.waitForSelector("#historyPanel .hp h3");
  assert.match(await page.textContent("#historyPanel"), /0 of 3 saved/);
  await page.fill('#historyPanel input[name="label"]', "First run");
  await page.click('#historyPanel [data-hp="save"]');
  await page.waitForSelector("#historyPanel .hp-list li");
  const ins = (await logOf(page)).filter((l) => l.op === "insert" && l.table === "scan_history");
  assert.equal(ins.length, 1);
  const p = ins[0].payload;
  assert.equal(p.tool, tool); assert.equal(p.user_id, "u1");
  assert.equal(p.snapshot.kind, "scores"); assert.equal(p.snapshot.tool, tool);
  const raw = JSON.stringify(p);
  assert.ok(!/SECRET-QUOTE|secret words|private critique/.test(raw), "no answers or free text in what is saved");
  assert.ok(raw.length < 55000, "fits the database size limit");
  ok(tool + ": saves a small summary of the result, no answers");

  const older = JSON.parse(JSON.stringify(p.snapshot));
  older.items.forEach((i) => { if (i.rank > 0) i.rank -= 1; });
  older.measures.forEach((m) => { m.value = Math.max(0, m.value - 10); });
  if (older.headline.value != null) { older.headline.value = Math.max(0, older.headline.value - 10); older.headline.text = "older"; }
  await page.evaluate((row) => window.__mock.tables.scan_history.push(row), { id: "old1", user_id: "u1", tool, label: "Older", snapshot: older, created_at: "2026-01-01T10:00:00Z" });

  await page.fill('#historyPanel input[name="label"]', "Second run");
  await page.click('#historyPanel [data-hp="save"]');
  await page.waitForFunction(() => document.querySelectorAll("#historyPanel .hp-list li").length === 3);
  const boxes = page.locator('#historyPanel [data-hp="pick"]');
  await boxes.nth(0).check(); await boxes.nth(2).check();
  await page.click('#historyPanel [data-hp="compare"]');
  await page.waitForSelector('#historyPanel [data-hp="diff"] .hp-diff li');
  const diff = await page.textContent('#historyPanel [data-hp="diff"]');
  assert.ok(!/Nothing has changed/.test(diff), diff);
  assert.ok(await page.locator("#historyPanel .hp-diff li.better").count() >= 1);
  assert.equal(await page.locator('#historyPanel [data-hp="download"]').count(), 0);
  assert.match(await page.textContent("#historyPanel"), /Pro/);
  ok(tool + ": compares an older and a newer result and shows what got better; download is Pro only");
}

// ---------- Keel ----------
{
  const facts = F({ EXISTING_COE: "no", OM1_regulatory_exposure: "high", OM2_existing_capability: "low", OM3_spend_model: "low", R1_sponsorship: "partial", R2_team: "partial", R3_portfolio: "established", R4_risk_gate: "established", R5_testing_monitoring: "established", R6_benefits_proof: "established" });
  const mock = { session: USER, appendOnInsert: ["scan_history"], rpc: { my_plan: "free" }, tables: { scan_history: [],
    keel_assessments: [{ id: "k2", user_id: "u1", status: "complete", facts, classification: keelClassify(facts), report_md: "## Fine\nBody.", created_at: "2026-10-01T10:00:00Z" }],
    keel_profiles: [{ user_id: "u1", first_name: "Ann", work_email: "ann@corp.com" }] } };
  const { browser, page, errors } = await launch(base, { mock, localStorage: { "keel.assessment": "k2" } });
  try {
    await page.goto(base + "/keel/");
    await page.waitForSelector("#s-results:not([hidden])");
    await saveAndCompare(page, "keel");
    assert.deepEqual(errors, []); ok("keel: no page errors");
  } finally { await browser.close(); }
}
// ---------- HALO ----------
{
  const facts = F({ R1_clarity: "partial", R2_acknowledgement: "established", R3_decision_transparency: "partial", R4_quick_repair: "absent", R5_weekly_checkin: "partial", R6_ai_disclosure: "established", R7_ai_boundaries: "partial" });
  const mock = { session: USER, appendOnInsert: ["scan_history"], rpc: { my_plan: "free" }, tables: { scan_history: [],
    halo_assessments: [{ id: "h1", user_id: "u1", status: "complete", facts, classification: haloClassify(facts), report_md: "## Fine\nBody.", created_at: "2026-10-01T10:00:00Z" }],
    halo_profiles: [{ user_id: "u1", first_name: "Ann", work_email: "ann@corp.com" }] } };
  const { browser, page, errors } = await launch(base, { mock, localStorage: { "halo.assessment": "h1" } });
  try {
    await page.goto(base + "/halo/");
    await page.waitForSelector("#s-results:not([hidden])");
    await saveAndCompare(page, "halo");
    assert.deepEqual(errors, []); ok("halo: no page errors");
  } finally { await browser.close(); }
}
// ---------- Bearing ----------
{
  const profile = { jurisdictions: ["uk", "ch"], sector: "insurer", size: "mid", uses: ["claims"] };
  const answers = Object.fromEntries(selectQuestions(profile).map((q) => [q.id, q.type === "written" ? { value: "partly", text: "secret words", critique: "private critique" } : "evidence"]));
  const mock = { session: USER, appendOnInsert: ["scan_history"], rpc: { my_plan: "free" }, tables: { scan_history: [],
    bearing_assessments: [{ id: "a2", user_id: "u1", result: bearingAssess(profile, answers), answers, supervisor: null, jurisdictions: profile.jurisdictions, sector: "insurer", org_size: "mid", ai_uses: ["claims"], created_at: "2026-10-01T10:00:00Z" }],
    bearing_profiles: [{ user_id: "u1", first_name: "Ann", work_email: "ann@corp.com" }] } };
  const { browser, page, errors } = await launch(base, { mock, localStorage: { "bearing.assessment": "a2" } });
  try {
    await page.goto(base + "/tools/bearing/");
    await page.waitForSelector("#s-results:not([hidden])");
    await saveAndCompare(page, "bearing");
    assert.deepEqual(errors, []); ok("bearing: no page errors");
  } finally { await browser.close(); }
}
// ---------- Squall and Ensign ----------
for (const tool of ["squall", "ensign"]) {
  const mock = { session: USER, appendOnInsert: ["scan_history"], rpc: { my_plan: "free", list_team_runs: [[]] }, tables: { scan_history: [], [`${tool}_profiles`]: [{ user_id: "u1", first_name: "Ann", work_email: "ann@corp.com" }] } };
  const { browser, page, errors } = await launch(base, { mock });
  try {
    await page.goto(base + `/tools/${tool}/`);
    await runRounds(page, tool);
    await saveAndCompare(page, tool);
    assert.deepEqual(errors, []); ok(tool + ": no page errors");
  } finally { await browser.close(); }
}

// ---------- Not signed in: email form on the results page and on the landing page ----------
{
  const facts = F({ EXISTING_COE: "no", R1_sponsorship: "partial" });
  const mock = { session: ANON, rpc: {}, tables: { scan_history: [],
    keel_assessments: [{ id: "k2", user_id: "u1", status: "complete", facts, classification: keelClassify(facts), report_md: "## Fine\nBody.", created_at: "2026-10-01T10:00:00Z" }],
    keel_profiles: [{ user_id: "u1", first_name: "Ann", work_email: "ann@corp.com" }] } };
  const { browser, page, errors } = await launch(base, { mock, localStorage: { "keel.assessment": "k2" } });
  try {
    await page.goto(base + "/keel/");
    await page.waitForSelector("#s-results:not([hidden])");
    await page.waitForSelector('#historyPanel [data-hp="signin"]');
    await page.fill('#historyPanel input[name="email"]', "ann@corp.com");
    await page.click('#historyPanel [data-hp="signin"] button');
    await page.waitForSelector("#historyPanel .hp-ok");
    const log = await logOf(page);
    assert.ok(log.some((l) => l.op === "signInWithOtp" && l.args.email === "ann@corp.com"));
    const pend = await page.evaluate(() => JSON.parse(localStorage.getItem("hp.pending.keel")));
    assert.equal(pend.snapshot.kind, "scores");
    ok("keel: an anonymous visitor gets a sign-in link, and the result is kept for after they confirm");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
  // Coming back from the email link: the landing page opens the sign-in box and offers to save it.
  const mock2 = { session: USER, rpc: { my_plan: "free" }, appendOnInsert: ["scan_history"], tables: { scan_history: [] } };
  const b2 = await launch(base, { mock: mock2, localStorage: { "hp.pending.keel": JSON.stringify({ at: Date.now(), snapshot: { v: 1, kind: "scores", tool: "keel", headline: { label: "Operating model", value: null, text: "Centralised", higherBetter: true }, measures: [], items: [] } }) } });
  try {
    await b2.page.goto(base + "/keel/");
    await b2.page.waitForSelector("#s-intro:not([hidden])");
    assert.equal(await b2.page.evaluate(() => document.getElementById("historyIntroBox").open), true);
    await b2.page.waitForSelector('#historyIntro [data-hp="save-pending"]');
    await b2.page.click('#historyIntro [data-hp="save-pending"]');
    await b2.page.waitForSelector("#historyIntro .hp-list li");
    assert.equal(await b2.page.evaluate(() => localStorage.getItem("hp.pending.keel")), null);
    ok("keel: back from the email link, the waiting result is saved from the landing page");
    assert.deepEqual(b2.errors, []);
  } finally { await b2.browser.close(); }
}
// ---------- Free limit message ----------
{
  const profile = { jurisdictions: ["uk"], sector: "insurer", size: "mid", uses: ["claims"] };
  const answers = Object.fromEntries(selectQuestions(profile).map((q) => [q.id, q.type === "written" ? { value: "partly", text: "t", critique: "c" } : "evidence"]));
  const mock = { session: USER, appendOnInsert: ["scan_history"], rpc: { my_plan: "free" }, insertErrorMessage: { scan_history: "free_limit" }, tables: { scan_history: [],
    bearing_assessments: [{ id: "a2", user_id: "u1", result: bearingAssess(profile, answers), answers, jurisdictions: profile.jurisdictions, sector: "insurer", org_size: "mid", ai_uses: ["claims"], created_at: "2026-10-01T10:00:00Z" }],
    bearing_profiles: [{ user_id: "u1", first_name: "Ann", work_email: "ann@corp.com" }] } };
  const { browser, page } = await launch(base, { mock, localStorage: { "bearing.assessment": "a2" } });
  try {
    await page.goto(base + "/tools/bearing/");
    await page.waitForSelector('#historyPanel [data-hp="save"]');
    await page.click('#historyPanel [data-hp="save"]');
    await page.waitForFunction(() => /keeps 3 saved scans/.test(document.getElementById("historyPanel").textContent));
    ok("bearing: the database's free limit is explained in plain words");
  } finally { await browser.close(); }
}
// ---------- Missing files: the tool still works ----------
{
  const profile = { jurisdictions: ["uk"], sector: "insurer", size: "mid", uses: ["claims"] };
  const answers = Object.fromEntries(selectQuestions(profile).map((q) => [q.id, q.type === "written" ? { value: "partly", text: "t", critique: "c" } : "partly"]));
  const mock = { session: USER, rpc: { my_plan: "free" }, tables: { scan_history: [],
    bearing_assessments: [{ id: "a2", user_id: "u1", result: bearingAssess(profile, answers), answers, jurisdictions: profile.jurisdictions, sector: "insurer", org_size: "mid", ai_uses: ["claims"], created_at: "2026-10-01T10:00:00Z" }],
    bearing_profiles: [{ user_id: "u1", first_name: "Ann", work_email: "ann@corp.com" }] } };
  const { browser, context, page, errors } = await launch(base, { mock, localStorage: { "bearing.assessment": "a2" } });
  try {
    await context.route("**/assets/history-mount.js", (r) => r.fulfill({ status: 404, body: "" }));
    await page.goto(base + "/tools/bearing/");
    await page.waitForSelector("#s-results:not([hidden])");
    assert.match(await page.textContent("#resSummary"), /./);
    const real = errors.filter((e) => !/dynamically imported|Failed to fetch|404|MIME/.test(e));
    assert.deepEqual(real, []);
    ok("bearing: results still work if the saved-results files are missing");
  } finally { await browser.close(); }
}
server.close();
console.log(n + " checks passed");
