import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve, launch } from "./ui-harness.mjs";

const { server, base } = await serve();
let n = 0; const ok = (m) => { n++; console.log("PASS", m); };

const mock = {
  tables: {
    assessments: [{ id: "a1", status: "complete" }],
    profiles: [{ user_id: "u1", first_name: "Ann", work_email: "ann@corp.com" }],
    use_cases: [
      { assessment_id: "a1", name: "ChatGPT for marketing drafts", description: "", facts: {}, classification: null },
      { assessment_id: "a1", name: "Claims summaries", description: "staff use Otter.ai to take notes", facts: {}, classification: null },
    ],
  },
};
const csv = `Date,Description,Amount
03/09/2026,"OPENAI *CHATGPT SUBSCR",20.00
04/09/2026,OTTER.AI MONTHLY,"1,250.50"
05/09/2026,ANTHROPIC CLAUDE.AI SUBSCRIPTION,18.00
06/09/2026,TESCO STORES 4421,32.10
07/09/2026,CANVA* 04123,11.99
08/09/2026,MIDJOURNEY INC,30.00
`;
const dir = mkdtempSync(join(tmpdir(), "rec-"));
writeFileSync(join(dir, "card.csv"), csv);
writeFileSync(join(dir, "empty.csv"), "   ");

const { browser, page, requests, errors } = await launch(base, { mock, localStorage: { "soundings.assessment": "a1" } });
try {
  await page.goto(base + "/soundings/");
  await page.waitForSelector("#s-results:not([hidden])");
  assert.ok(await page.locator("#recordsBox").isVisible()); ok("results page shows the records box");

  // 1. empty input
  await page.click("#recBtn");
  assert.match(await page.textContent("#recErr"), /Choose a file or paste/); ok("empty submit gives a plain message");

  // 2. file scan
  const before = requests.length;
  await page.setInputFiles("#recFile", join(dir, "card.csv"));
  await page.click("#recBtn");
  await page.waitForSelector("#recOut:not([hidden])");
  const headline = await page.textContent("#recHeadline");
  assert.match(headline, /read 6 rows and found 4 AI tools/);
  assert.match(headline, /2 are not on your map yet/); ok("headline counts tools and gaps: " + headline);
  const rows = await page.locator(".rec-row").allTextContents();
  assert.equal(rows.length, 4);
  const chatgpt = page.locator('.rec-row[data-id="chatgpt"]');
  assert.match(await chatgpt.textContent(), /On your map/);
  assert.match(await page.locator('.rec-row[data-id="otter"]').textContent(), /On your map/);
  assert.match(await page.locator('.rec-row[data-id="claude"]').textContent(), /Not on your map/);
  assert.match(await page.locator('.rec-row[data-id="otter"]').textContent(), /1,250\.50/); ok("auto-matching against the person's own use cases works");
  assert.ok(await page.locator("#recEmbeddedBox").isVisible());
  assert.match(await page.textContent("#recEmbeddedSummary"), /1 ordinary tool/); ok("Canva shown as AI inside other software, not as an AI tool");

  // 3. no network at all during the scan
  const during = requests.slice(before).filter((r) => !r.url.startsWith(base) || r.method !== "GET");
  assert.deepEqual(during, [], "requests made during scan: " + JSON.stringify(during)); ok("nothing is sent anywhere while scanning");
  assert.ok(!requests.some((r) => (r.body || "").includes("OPENAI") || r.url.includes("OPENAI"))); ok("file contents never appear in any request");

  // 4. mark as covered
  await page.check('input[data-mark="claude"]');
  assert.match(await page.textContent("#recHeadline"), /1 is not on your map yet/);
  await page.uncheck('input[data-mark="claude"]');
  assert.match(await page.textContent("#recHeadline"), /2 are not on your map yet/); ok("ticking 'covered' updates the count and can be undone");
  await page.check('input[data-mark="claude"]');

  // 5. save csv
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#recSave")]);
  assert.equal(dl.suggestedFilename(), "ai-tools-in-your-records.csv");
  const saved = readFileSync(await dl.path(), "utf8");
  assert.match(saved, /"ChatGPT \/ OpenAI"/); assert.ok(!/TESCO|SUBSCR/.test(saved)); ok("saved CSV has tools only, no raw rows");

  // 6. report request carries names only
  await page.click("#reportBtn");
  await page.waitForTimeout(100);
  const req = await page.evaluate(() => window.__mock.log.filter((l) => l.table === "report_requests"));
  assert.equal(req.length, 1);
  assert.match(req[0].payload.note, /^Records check: 4 AI tools found, 1 not on the map \(Midjourney\)\.$/);
  assert.ok(!/\d+\.\d\d/.test(req[0].payload.note)); ok("report request note: " + req[0].payload.note);

  // 7. paste mode and clear
  await page.click("#recClear");
  assert.equal(await page.locator("#recOut").isHidden(), true);
  await page.fill("#recPaste", "Otter.ai Notetaker\nZoom Workplace\nSlack");
  await page.click("#recBtn");
  await page.waitForSelector("#recOut:not([hidden])");
  assert.match(await page.textContent("#recHeadline"), /found 1 AI tool\./); ok("paste mode and clear work");

  // 8. nothing found
  await page.click("#recClear");
  await page.fill("#recPaste", "Tesco\nShell\nAmazon");
  await page.click("#recBtn");
  await page.waitForSelector("#recOut:not([hidden])");
  assert.match(await page.textContent("#recHeadline"), /no AI tools[\s\S]*not proof/); ok("no-match result is honest that it is not proof");

  // 9. hostile content cannot inject markup
  await page.click("#recClear");
  await page.fill("#recPaste", '<img src=x onerror="window.__pwn=1"> OPENAI');
  await page.click("#recBtn");
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__pwn), undefined); ok("pasted markup is inert");

  // 10. mobile layout
  await page.setViewportSize({ width: 390, height: 800 });
  await page.click("#recClear");
  await page.setInputFiles("#recFile", join(dir, "card.csv"));
  await page.click("#recBtn");
  await page.waitForSelector("#recOut:not([hidden])");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, "horizontal overflow on mobile: " + overflow); ok("no horizontal scroll at 390px");
  await page.locator("#recordsBox").screenshot({ path: "/tmp/work/build/soundings-mobile.png" });
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.locator("#recordsBox").screenshot({ path: "/tmp/work/build/soundings-desktop.png" });

  assert.deepEqual(errors, [], "page errors: " + errors.join(" | ")); ok("no page errors");
} finally { await browser.close(); server.close(); }
console.log(`\n${n} checks passed`);
