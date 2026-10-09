import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serve, launch } from "./ui-harness.mjs";
import { assess, selectQuestions } from "../tools/bearing/engine.js";

const { server, base } = await serve();
let n = 0; const ok = (m) => { n++; console.log("PASS", m); };
const USER = { user: { id: "u1", email: "ann@corp.com", is_anonymous: false } };
const ANON = { user: { id: "u1", is_anonymous: true } };
const profile = { jurisdictions: ["uk", "ch"], sector: "insurer", size: "mid", uses: ["claims"] };
const answers = Object.fromEntries(selectQuestions(profile).map((q) => [q.id, q.type === "written" ? { value: "partly", text: "t", critique: "c" } : "partly"]));
const mockFor = (extra = {}, controls = []) => ({
  session: USER, appendOnInsert: ["scan_history", "bearing_controls"], rpc: { my_plan: "free" },
  tables: { scan_history: [], bearing_controls: controls,
    bearing_assessments: [{ id: "a2", user_id: "u1", result: assess(profile, answers), answers, jurisdictions: profile.jurisdictions, sector: "insurer", org_size: "mid", ai_uses: ["claims"], created_at: "2026-10-01T10:00:00Z" }],
    bearing_profiles: [{ user_id: "u1", first_name: "Ann", last_name: "Lee", work_email: "ann@corp.com", company: "Acme <Re>" }] },
  ...extra,
});
const LS = { "bearing.assessment": "a2" };
const logOf = (page) => page.evaluate(() => window.__mock.log);

// ---------- free account ----------
{
  const { browser, page, errors } = await launch(base, { mock: mockFor(), localStorage: LS });
  try {
    await page.goto(base + "/tools/bearing/");
    await page.waitForSelector("#s-results:not([hidden])");
    await page.waitForSelector("#auditPanel .ap");
    assert.match(await page.textContent("#auditPanel"), /0 of 5 obligations tracked/);
    assert.equal(await page.locator('#auditPanel [data-ap="html"]').count(), 0);
    assert.match(await page.textContent("#auditPanel"), /Ask for Pro access/); ok("free account sees the register, and Pro is offered instead of the downloads");

    await page.locator('#auditPanel [data-ap="edit"]').first().click();
    await page.fill('#auditPanel input[name="owner"]', "Priya Shah, CRO");
    await page.fill('#auditPanel input[name="date"]', "2026-09-01");
    await page.fill('#auditPanel input[name="note"]', "AI register, SharePoint /risk");
    await page.click('#auditPanel form button[type="submit"]');
    await page.waitForFunction(() => /1 of 5 obligations tracked/.test(document.getElementById("auditPanel").textContent));
    const up = (await logOf(page)).find((l) => l.op === "upsert" && l.table === "bearing_controls");
    assert.equal(up.payload.user_id, "u1"); assert.equal(up.payload.owner, "Priya Shah, CRO"); assert.equal(up.payload.review_date, "2026-09-01");
    assert.match(up.payload.obligation_id, /^(uk|ch|eu):/); ok("saving an owner stores one small row for that obligation");
    const panel = await page.textContent("#auditPanel");
    assert.match(panel, /Priya Shah, CRO/); assert.match(panel, /Review overdue by/); ok("an old review date is flagged as overdue");

    await page.locator('#auditPanel [data-ap="edit"]').first().click();
    await page.fill('#auditPanel input[name="owner"]', ""); await page.fill('#auditPanel input[name="date"]', ""); await page.fill('#auditPanel input[name="note"]', "");
    await page.click('#auditPanel form button[type="submit"]');
    await page.waitForFunction(() => /0 of 5 obligations tracked/.test(document.getElementById("auditPanel").textContent));
    assert.ok((await logOf(page)).some((l) => l.op === "delete" && l.table === "bearing_controls")); ok("saving all three empty clears the row");
    assert.deepEqual(errors, []); ok("no page errors");
  } finally { await browser.close(); }
}
// ---------- the database's limit is explained ----------
{
  const { browser, page } = await launch(base, { mock: mockFor({ insertErrorMessage: { bearing_controls: "controls_free_limit" } }), localStorage: LS });
  try {
    await page.goto(base + "/tools/bearing/");
    await page.waitForSelector('#auditPanel [data-ap="edit"]');
    await page.locator('#auditPanel [data-ap="edit"]').first().click();
    await page.fill('#auditPanel input[name="owner"]', "X");
    await page.click('#auditPanel form button[type="submit"]');
    await page.waitForFunction(() => /owners for 5 obligations|owners and review dates for 5/.test(document.getElementById("auditPanel").textContent));
    ok("free limit is explained in plain words");
  } finally { await browser.close(); }
}
// ---------- not signed in ----------
{
  const { browser, page } = await launch(base, { mock: mockFor({ session: ANON }), localStorage: LS });
  try {
    await page.goto(base + "/tools/bearing/");
    await page.waitForSelector("#auditPanel .ap");
    assert.equal(await page.locator('#auditPanel [data-ap="edit"]').count(), 0);
    assert.match(await page.textContent("#auditPanel"), /sign in with the saved results box above/);
    ok("anonymous visitors cannot edit and are pointed to sign-in");
  } finally { await browser.close(); }
}
// ---------- Pro: downloads ----------
{
  const controls = [{ id: "c1", user_id: "u1", obligation_id: "uk:__first__", owner: "=cmd|' /C calc'!A0", review_date: "2027-01-01", evidence_note: "<img src=x onerror=alert(1)>" }];
  const mock = mockFor({ rpc: { my_plan: "pro" } }, controls);
  const { browser, page, errors } = await launch(base, { mock, localStorage: LS });
  try {
    await page.goto(base + "/tools/bearing/");
    await page.waitForSelector('#auditPanel [data-ap="html"]');
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('#auditPanel [data-ap="html"]')]);
    assert.match(dl.suggestedFilename(), /^antara-bearing-audit-pack-\d{4}-\d{2}-\d{2}\.html$/);
    const html = readFileSync(await dl.path(), "utf8");
    assert.match(html, /Bearing audit pack/); assert.match(html, /Acme &lt;Re&gt;/); assert.match(html, /has not checked any of it/);
    ok("Pro downloads a print-ready pack that names the organisation and says nothing was checked");
    const [dl2] = await Promise.all([page.waitForEvent("download"), page.click('#auditPanel [data-ap="csv"]')]);
    const csv = readFileSync(await dl2.path(), "utf8");
    assert.match(csv, /^Area,Obligation,Source,Status,Owner/); ok("Pro also gets a spreadsheet file");
    assert.deepEqual(errors, []); ok("no page errors for Pro");
  } finally { await browser.close(); }
}
// ---------- Missing file: Bearing still works ----------
{
  const { browser, context, page, errors } = await launch(base, { mock: mockFor(), localStorage: LS });
  try {
    await context.route("**/assets/audit-panel.js", (r) => r.fulfill({ status: 404, body: "" }));
    await page.goto(base + "/tools/bearing/");
    await page.waitForSelector("#s-results:not([hidden])");
    assert.match(await page.textContent("#resSummary"), /./);
    assert.deepEqual(errors.filter((e) => !/dynamically imported|Failed to fetch|404|MIME/.test(e)), []);
    ok("results still work if the audit pack file is missing");
  } finally { await browser.close(); }
}
server.close();
console.log(n + " checks passed");
