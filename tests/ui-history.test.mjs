import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serve, launch } from "./ui-harness.mjs";
import { scanText, markCovered } from "../assets/records-scan.js";
import { checkConfig } from "../sentinel/config-check.js";
import { snapshotRecords, snapshotConfig } from "../assets/history.js";

const { server, base } = await serve();
let n = 0; const ok = (m) => { n++; console.log("PASS", m); };

const FREE_USER = { user: { id: "u1", email: "ann@corp.com", is_anonymous: false } };
const ANON = { user: { id: "u2", is_anonymous: true } };
const baseTables = () => ({
  assessments: [{ id: "a1", status: "complete" }],
  profiles: [{ user_id: "u1", first_name: "Ann", work_email: "ann@corp.com" }, { user_id: "u2", first_name: "Ann", work_email: "ann@corp.com" }],
  use_cases: [{ assessment_id: "a1", name: "ChatGPT for drafts", description: "", facts: {}, classification: null }],
});
const MAY = "Date,Description,Amount\n01/05/2026,OPENAI *CHATGPT SUBSCR,20.00\n02/05/2026,OTTER.AI MONTHLY,40.00\n03/05/2026,TESCO STORES,12.00\n";
const JUNE = "Date,Description,Amount\n01/06/2026,OPENAI *CHATGPT SUBSCR,20.00\n03/06/2026,ANTHROPIC CLAUDE.AI SUBSCRIPTION,18.00\n04/06/2026,MIDJOURNEY INC,30.00\n";
const JULY = "Date,Description,Amount\n01/07/2026,OPENAI *CHATGPT SUBSCR,20.00\n03/07/2026,ANTHROPIC CLAUDE.AI SUBSCRIPTION,18.00\n";

async function scan(page, text) {
  await page.fill("#recPaste", text);
  await page.click("#recBtn");
  await page.waitForSelector("#recOut:not([hidden])");
}
const snapOf = (text) => { const s = scanText(text); return snapshotRecords(s, markCovered(s.aiTools, [])); };

// ---------- Soundings, free account ----------
{
  const mock = { session: FREE_USER, tables: { ...baseTables(), scan_history: [] }, appendOnInsert: ["scan_history"], rpc: { my_plan: "free" } };
  const { browser, page, errors, requests } = await launch(base, { mock, localStorage: { "soundings.assessment": "a1" } });
  try {
    await page.goto(base + "/soundings/");
    await page.waitForSelector("#s-results:not([hidden])");
    await page.waitForSelector("#historyPanel .hp h3");
    assert.match(await page.textContent("#historyPanel"), /0 of 3 saved/);
    assert.match(await page.textContent("#historyPanel"), /Run a records check above/);
    assert.equal(await page.locator('#historyPanel [data-hp="save"]').count(), 0); ok("signed-in free account sees 0 of 3 and no save button before a scan");

    await scan(page, MAY);
    await page.fill('#historyPanel input[name="label"]', "May card export");
    await page.click('#historyPanel [data-hp="save"]');
    await page.waitForSelector("#historyPanel .hp-list li");
    const ins = (await page.evaluate(() => window.__mock.log)).filter((l) => l.op === "insert" && l.table === "scan_history");
    assert.equal(ins.length, 1);
    assert.equal(ins[0].payload.tool, "soundings"); assert.equal(ins[0].payload.user_id, "u1");
    assert.ok(ins[0].payload.snapshot.tools.length >= 2);
    assert.ok(!/TESCO|01\/05\/2026|SUBSCR/.test(JSON.stringify(ins[0].payload))); ok("saving sends tool names and counts only, never rows");
    assert.match(await page.textContent("#historyPanel"), /1 of 3 saved/);

    await scan(page, JUNE);
    await page.fill('#historyPanel input[name="label"]', "June <img src=x onerror=window.__x=1>");
    await page.click('#historyPanel [data-hp="save"]');
    await page.waitForFunction(() => document.querySelectorAll("#historyPanel .hp-list li").length === 2);
    assert.equal(await page.evaluate(() => window.__x), undefined);
    assert.match(await page.textContent("#historyPanel .hp-list"), /<img src=x/); ok("a hostile label is shown as text, not run");

    await scan(page, JULY);
    await page.fill('#historyPanel input[name="label"]', "July");
    await page.click('#historyPanel [data-hp="save"]');
    await page.waitForFunction(() => document.querySelectorAll("#historyPanel .hp-list li").length === 3);
    assert.ok(await page.locator('#historyPanel [data-hp="save"]').isDisabled());
    assert.match(await page.textContent("#historyPanel"), /free account keeps 3 saved scans/);
    const mail = await page.getAttribute('#historyPanel [data-hp="pro-mail"]', "href");
    assert.match(mail, /^mailto:hello@antara-innovations\.com/); assert.match(decodeURIComponent(mail), /ann@corp\.com/);
    assert.match(await page.textContent("#historyPanel"), /by hand\. No card form/); ok("at the limit: save disabled, plain Pro prompt, email carries the account address");

    // compare May with June
    const boxes = page.locator('#historyPanel [data-hp="pick"]');
    assert.ok(await page.locator('#historyPanel [data-hp="compare"]').isDisabled());
    await boxes.nth(1).check(); await boxes.nth(2).check();
    await page.click('#historyPanel [data-hp="compare"]');
    await page.waitForSelector('#historyPanel [data-hp="diff"]');
    const diffText = await page.textContent('#historyPanel [data-hp="diff"]');
    assert.match(diffText, /Claude.* is new in your records/i);
    assert.match(diffText, /Otter.* is no longer in your records/i);
    assert.match(diffText, /Downloading the change report is part of Pro/);
    assert.equal(await page.locator('#historyPanel [data-hp="download"]').count(), 0); ok("free account can compare two scans, but the download is Pro");

    // delete frees a slot
    await page.click('#historyPanel [data-hp="delete"] >> nth=0');
    await page.waitForFunction(() => document.querySelectorAll("#historyPanel .hp-list li").length === 2);
    assert.equal(await page.locator('#historyPanel [data-hp="save"]').isDisabled(), false); ok("deleting a scan frees a slot");

    const sent = requests.filter((r) => r.method !== "GET");
    assert.deepEqual(sent, [], "no POST or other writes leave the page: " + sent.map((r) => r.url).join()); ok("no writes leave the page (the stand-in database sees the saves, the network sees nothing)");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

// ---------- Soundings, database refuses ----------
{
  const mock = { session: FREE_USER, tables: { ...baseTables(), scan_history: [] }, rpc: { my_plan: "free" }, insertErrorMessage: { scan_history: "free_limit" } };
  const { browser, page } = await launch(base, { mock, localStorage: { "soundings.assessment": "a1" } });
  try {
    await page.goto(base + "/soundings/");
    await page.waitForSelector("#historyPanel .hp h3");
    await scan(page, MAY);
    await page.click('#historyPanel [data-hp="save"]');
    await page.waitForFunction(() => /free account keeps 3/.test(document.querySelector("#historyPanel").textContent));
    ok("if the database says free_limit the page shows a plain message");
  } finally { await browser.close(); }
}

// ---------- Soundings, not signed in ----------
{
  const mock = { session: ANON, tables: { ...baseTables() } };
  const { browser, page } = await launch(base, { mock, localStorage: { "soundings.assessment": "a1" } });
  try {
    await page.goto(base + "/soundings/");
    await page.waitForSelector("#historyPanel .hp h3");
    assert.equal(await page.locator('#historyPanel [data-hp="save"]').count(), 0);
    assert.match(await page.textContent("#historyPanel"), /Nothing is saved unless you press Save/);
    await scan(page, MAY);
    await page.fill('#historyPanel input[name="email"]', "not-an-email");
    await page.click('#historyPanel [data-hp="signin"] button');
    assert.match(await page.textContent("#historyPanel"), /valid email/); ok("anonymous visitor cannot save, and a bad address is refused");

    await page.fill('#historyPanel input[name="email"]', "ann@corp.com");
    await page.click('#historyPanel [data-hp="signin"] button');
    await page.waitForFunction(() => /sent a link to/.test(document.querySelector("#historyPanel").textContent));
    const log = await page.evaluate(() => window.__mock.log);
    const up = log.find((l) => l.op === "updateUser");
    assert.equal(up.attrs.email, "ann@corp.com"); assert.match(up.opts.emailRedirectTo, /\/soundings\/$/);
    const pending = await page.evaluate(() => localStorage.getItem("hp.pending.soundings"));
    assert.ok(pending && /chatgpt/i.test(pending) && !/TESCO/.test(pending)); ok("anonymous visitor is sent a link, and the scan waits locally without row text");
  } finally { await browser.close(); }
}
{
  // email already has an account: fall back to signing in with a link
  const mock = { session: ANON, tables: { ...baseTables() }, updateUserError: "A user with this email address has already been registered" };
  const { browser, page } = await launch(base, { mock, localStorage: { "soundings.assessment": "a1" } });
  try {
    await page.goto(base + "/soundings/");
    await page.waitForSelector("#historyPanel .hp h3");
    await page.fill('#historyPanel input[name="email"]', "ann@corp.com");
    await page.click('#historyPanel [data-hp="signin"] button');
    await page.waitForFunction(() => /sent a link to/.test(document.querySelector("#historyPanel").textContent));
    const log = await page.evaluate(() => window.__mock.log);
    assert.ok(log.some((l) => l.op === "signInWithOtp" && l.args.email === "ann@corp.com")); ok("existing account falls back to a sign-in link");
  } finally { await browser.close(); }
}
{
  // a link that fails for another reason shows a plain message
  const mock = { session: ANON, tables: { ...baseTables() }, updateUserError: "something unexpected" };
  const { browser, page } = await launch(base, { mock, localStorage: { "soundings.assessment": "a1" } });
  try {
    await page.goto(base + "/soundings/");
    await page.waitForSelector("#historyPanel .hp h3");
    await page.fill('#historyPanel input[name="email"]', "ann@corp.com");
    await page.click('#historyPanel [data-hp="signin"] button');
    await page.waitForFunction(() => /Couldn't send the link/.test(document.querySelector("#historyPanel").textContent)); ok("a failed email shows a plain message");
  } finally { await browser.close(); }
}

// ---------- Soundings, back from the email with a scan waiting ----------
{
  const pending = JSON.stringify({ snapshot: snapOf(MAY), at: Date.now() });
  const mock = { session: FREE_USER, tables: { ...baseTables(), scan_history: [] }, appendOnInsert: ["scan_history"], rpc: { my_plan: "free" } };
  const { browser, page } = await launch(base, { mock, localStorage: { "soundings.assessment": "a1", "hp.pending.soundings": pending } });
  try {
    await page.goto(base + "/soundings/");
    await page.waitForSelector('#historyPanel [data-hp="save-pending"]');
    await page.click('#historyPanel [data-hp="save-pending"]');
    await page.waitForSelector("#historyPanel .hp-list li");
    assert.equal(await page.evaluate(() => localStorage.getItem("hp.pending.soundings")), null); ok("the scan waiting from before sign-in can be saved, then is cleared");
  } finally { await browser.close(); }
}
{
  const stale = JSON.stringify({ snapshot: snapOf(MAY), at: Date.now() - 3 * 24 * 3600 * 1000 });
  const mock = { session: FREE_USER, tables: { ...baseTables(), scan_history: [] }, rpc: { my_plan: "free" } };
  const { browser, page } = await launch(base, { mock, localStorage: { "soundings.assessment": "a1", "hp.pending.soundings": stale } });
  try {
    await page.goto(base + "/soundings/");
    await page.waitForSelector("#historyPanel .hp h3");
    assert.equal(await page.locator('#historyPanel [data-hp="save-pending"]').count(), 0); ok("a waiting scan older than a day is dropped");
  } finally { await browser.close(); }
}

// ---------- Soundings, Pro ----------
{
  const rows = [["row1", "Apr", MAY, "2026-04-01T09:00:00Z"], ["row2", "May", JUNE, "2026-05-01T09:00:00Z"], ["row3", "Jun", JULY, "2026-06-01T09:00:00Z"]]
    .map(([id, label, text, created_at]) => ({ id, label, snapshot: snapOf(text), created_at, tool: "soundings", user_id: "u1" }));
  const mock = { session: FREE_USER, tables: { ...baseTables(), scan_history: rows }, appendOnInsert: ["scan_history"], rpc: { my_plan: "pro" } };
  const { browser, page } = await launch(base, { mock, localStorage: { "soundings.assessment": "a1" }, });
  try {
    await page.goto(base + "/soundings/");
    await page.waitForSelector("#historyPanel .hp-list li");
    assert.match(await page.textContent("#historyPanel .hp-badge"), /Pro/);
    assert.match(await page.textContent("#historyPanel"), /3 of 200 saved/);
    assert.equal(await page.locator('#historyPanel [data-hp="pro-mail"]').count(), 0);
    assert.equal(await page.locator("#historyPanel svg.hp-trend").count(), 1); ok("Pro sees 3 of 200, a timeline, and no sales prompt");
    await scan(page, MAY);
    assert.equal(await page.locator('#historyPanel [data-hp="save"]').isDisabled(), false); ok("Pro can keep saving past three");

    const boxes = page.locator('#historyPanel [data-hp="pick"]');
    await boxes.nth(1).check(); await boxes.nth(2).check();
    await page.click('#historyPanel [data-hp="compare"]');
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('#historyPanel [data-hp="download"]')]);
    const txt = readFileSync(await dl.path(), "utf8");
    assert.match(dl.suggestedFilename(), /soundings-what-changed/);
    assert.match(txt, /what changed/); assert.match(txt, /\[more exposure\]/); assert.ok(!/TESCO/.test(txt)); ok("Pro downloads a plain change report");
  } finally { await browser.close(); }
}

// ---------- Soundings, returning visitor on the intro page ----------
{
  const mock = { session: ANON, tables: {} };
  const { browser, page } = await launch(base, { mock });
  try {
    await page.goto(base + "/soundings/");
    await page.waitForSelector("#s-intro:not([hidden])");
    assert.equal(await page.locator("#historyIntro").isVisible(), false, "collapsed until asked for");
    await page.click("#historyIntroBox summary");
    await page.waitForSelector("#historyIntro .hp h3");
    assert.match(await page.textContent("#historyIntro"), /Already saved a scan\?/);
    assert.equal(await page.locator('#historyIntro [data-hp="signin"]').count(), 1); ok("the intro page offers sign-in for people who already saved scans");
  } finally { await browser.close(); }
}
{
  const rows = [{ id: "r1", label: "Old", snapshot: snapOf(MAY), created_at: "2026-04-01T09:00:00Z", tool: "soundings", user_id: "u1" }];
  const mock = { session: FREE_USER, tables: { scan_history: rows }, rpc: { my_plan: "free" } };
  const { browser, page } = await launch(base, { mock });
  try {
    await page.goto(base + "/soundings/");
    await page.click("#historyIntroBox summary");
    await page.waitForSelector("#historyIntro .hp-list li");
    assert.match(await page.textContent("#historyIntro"), /run the records check on your results page/);
    assert.equal(await page.locator('#historyIntro [data-hp="save"]').count(), 0); ok("signed-in visitor on the intro page sees saved scans but no save box");
  } finally { await browser.close(); }
}

const CFG_A_EARLY = JSON.stringify({ mcpServers: { files: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem@1.0.0", "/srv/project"] } } });

// ---------- the pages still work if the saved-scans files are missing ----------
{
  const mock = { session: FREE_USER, tables: { ...baseTables() }, rpc: { my_plan: "free" } };
  const { browser, page, errors } = await launch(base, { mock, localStorage: { "soundings.assessment": "a1" } });
  try {
    await page.route("**/assets/history-panel.js", (r) => r.fulfill({ status: 404, body: "not found" }));
    await page.goto(base + "/soundings/");
    await page.waitForSelector("#s-results:not([hidden])");
    await scan(page, MAY);
    assert.match(await page.textContent("#recHeadline"), /found 2 AI tools/);
    await page.waitForFunction(() => document.getElementById("historyPanel").hidden === true);
    assert.deepEqual(errors.filter((e) => !e.startsWith("console:")), [], "no uncaught errors"); ok("Soundings: if the panel file is missing, the records check still works and the panel hides itself");
  } finally { await browser.close(); }
}
{
  const mock = { session: FREE_USER, tables: {}, rpc: { my_plan: "free" } };
  const { browser, page, errors } = await launch(base, { mock });
  try {
    await page.route("**/assets/history.js", (r) => r.fulfill({ status: 404, body: "not found" }));
    await page.goto(base + "/sentinel/");
    await page.click("#cfgOpen");
    await page.fill("#cfgText", CFG_A_EARLY);
    await page.click("#cfgRun");
    await page.waitForSelector("#cfgOut:not([hidden])");
    await page.waitForFunction(() => document.getElementById("historyPanel").hidden === true);
    assert.deepEqual(errors.filter((e) => !e.startsWith("console:")), [], "no uncaught errors"); ok("Sentinel: if the history file is missing, the configuration check still works and the panel hides itself");
  } finally { await browser.close(); }
}
// ---------- Sentinel ----------
const CFG_A = JSON.stringify({ mcpServers: { files: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem@1.0.0", "/srv/project"] } } });
const CFG_B = JSON.stringify({ mcpServers: {
  files: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem@1.0.0", "/srv/project"] },
  gmail: { command: "npx", args: ["-y", "gmail-mcp"] },
  github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], env: { GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" } },
} });
async function check(page, text) {
  await page.fill("#cfgText", text);
  await page.click("#cfgRun");
  await page.waitForSelector("#cfgOut:not([hidden])");
}
{
  const mock = { session: FREE_USER, tables: { scan_history: [] }, appendOnInsert: ["scan_history"], rpc: { my_plan: "free" } };
  const { browser, page, errors } = await launch(base, { mock });
  try {
    await page.goto(base + "/sentinel/");
    await page.click("#cfgOpen");
    await page.waitForSelector("#historyPanel .hp h3");
    await check(page, CFG_A);
    await page.fill('#historyPanel input[name="label"]', "Before");
    await page.click('#historyPanel [data-hp="save"]');
    await page.waitForFunction(() => document.querySelectorAll("#historyPanel .hp-list li").length === 1);
    await check(page, CFG_B);
    await page.fill('#historyPanel input[name="label"]', "After adding Gmail and GitHub");
    await page.click('#historyPanel [data-hp="save"]');
    await page.waitForFunction(() => document.querySelectorAll("#historyPanel .hp-list li").length === 2);
    const ins = (await page.evaluate(() => window.__mock.log)).filter((l) => l.op === "insert" && l.table === "scan_history");
    assert.ok(ins.every((i) => i.payload.tool === "sentinel"));
    assert.ok(!/ghp_|abcdefghijklmnopqrstuvwxyz/.test(JSON.stringify(ins))); ok("Sentinel saves never include a secret");

    const boxes = page.locator('#historyPanel [data-hp="pick"]');
    await boxes.nth(0).check(); await boxes.nth(1).check();
    await page.click('#historyPanel [data-hp="compare"]');
    const diff = await page.textContent('#historyPanel [data-hp="diff"]');
    assert.match(diff, /gmail was added/i); assert.match(diff, /Overall result moved from/i);
    assert.match(diff, /add exposure/); ok("Sentinel compare names the new connections and the worse result");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
{
  // anonymous: sign-in stores the waiting check; coming back opens the configuration screen straight away
  const mock = { session: ANON, tables: {} };
  const { browser, page } = await launch(base, { mock });
  try {
    await page.goto(base + "/sentinel/");
    await page.click("#cfgOpen");
    await check(page, CFG_B);
    await page.fill('#historyPanel input[name="email"]', "ann@corp.com");
    await page.click('#historyPanel [data-hp="signin"] button');
    await page.waitForFunction(() => /sent a link to/.test(document.querySelector("#historyPanel").textContent));
    const pending = await page.evaluate(() => localStorage.getItem("hp.pending.sentinel"));
    assert.ok(pending && !/ghp_/.test(pending)); ok("Sentinel keeps the waiting check without secrets");
    // the link is opened: same browser storage, now a confirmed account
    const back = await launch(base, { mock: { session: FREE_USER, tables: { scan_history: [] }, appendOnInsert: ["scan_history"], rpc: { my_plan: "free" } }, localStorage: { "hp.pending.sentinel": pending } });
    try {
      await back.page.goto(base + "/sentinel/");
      await back.page.waitForSelector("#s-config:not([hidden])");
      await back.page.waitForSelector('#historyPanel [data-hp="save-pending"]');
      await back.page.click('#historyPanel [data-hp="save-pending"]');
      await back.page.waitForSelector("#historyPanel .hp-list li");
      ok("coming back from the email lands on the configuration screen with the check ready to save");
    } finally { await back.browser.close(); }
  } finally { await browser.close(); }
}

server.close();
console.log(`\n${n} checks passed`);
