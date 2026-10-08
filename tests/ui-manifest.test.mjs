import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serve, launch } from "./ui-harness.mjs";
const { server, base } = await serve();
let n = 0; const ok = (m) => { n++; console.log("PASS", m); };
const mock = {
  session: { user: { id: "u1", email: "t@clinic.co.uk", is_anonymous: false } },
  tables: {
    manifest_clients: [
      { id: "c1", user_id: "u1", client_ref: "A1", insurer: "axa", status: "active", sessions_authorised: 6, sessions_done_before: 0, phq9_baseline: 16, gad7_baseline: 12, reminders: true, created_at: "2026-09-01T00:00:00Z" },
      { id: "c2", user_id: "u1", client_ref: "B2", insurer: "bupa", status: "active", sessions_authorised: 8, sessions_done_before: 2, phq9_baseline: 12, gad7_baseline: null, reminders: true, created_at: "2026-09-02T00:00:00Z", goals: "private goal" },
    ],
    manifest_checkins: [
      { id: "k1", client_id: "c1", user_id: "u1", session_date: "2026-09-01", phq9: 14, gad7: 10, note: "private note" },
      { id: "k2", client_id: "c1", user_id: "u1", session_date: "2026-09-15", phq9: 8, gad7: 6 },
      { id: "k3", client_id: "c2", user_id: "u1", session_date: "2026-09-02", phq9: 20, gad7: null },
    ],
  },
};
const { browser, page, errors } = await launch(base, { mock });
try {
  await page.goto(base + "/tools/manifest/");
  await page.waitForSelector("#myReportsBtn:not([hidden])");
  await page.click("#myReportsBtn");
  await page.waitForSelector("#clientsOutcomes:not([hidden])");
  const text = await page.textContent("#clientsOutcomes");
  assert.match(text, /PHQ-9: 2 clients with a later reading. 1 reliably improved, 1 reliably worse/); ok("practice summary shows on the clients page");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#outcomesBtn")]);
  assert.match(download.suggestedFilename(), /^manifest-outcomes-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync(await download.path(), "utf8");
  assert.match(csv, /"client_code","insurer"/); assert.match(csv, /"A1","axa"/); assert.match(csv, /"B2","bupa"/); ok("CSV downloads with one row per client");
  assert.ok(!/private/.test(csv)); ok("no notes or goals in the file");
  assert.deepEqual(errors, []); ok("no page errors");
} finally { await browser.close(); server.close(); }
console.log(n + " checks passed");
