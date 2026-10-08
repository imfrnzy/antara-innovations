import assert from "node:assert/strict";
import { serve, launch } from "./ui-harness.mjs";

const { server, base } = await serve();
let n = 0; const ok = (m) => { n++; console.log("PASS", m); };
const calls = (log, name) => log.filter((l) => l.op === "rpc" && l.name === name);
const logOf = (page) => page.evaluate(() => window.__mock.log);

// ---------- join page: HALO pulse ----------
{
  const mock = { rpc: { team_run_public: [{ tool: "halo", module: "", label: "x", status: "open" }], submit_team_result: "ok" } };
  const { browser, page, requests, errors } = await launch(base, { mock });
  try {
    await page.goto(base + "/team/?code=ab12cd34");
    await page.waitForSelector("#t-intro:not([hidden])");
    assert.match(await page.textContent("#t-intro"), /anonymous/i);
    assert.match(await page.textContent("#t-intro"), /at least three people/); ok("intro states anonymity and the three-person rule");
    const lookup = calls(await logOf(page), "team_run_public")[0];
    assert.equal(lookup.args.p_code, "AB12CD34"); ok("code from the link is cleaned and looked up");
    await page.click("#startBtn");
    for (let i = 0; i < 7; i++) {
      assert.match(await page.textContent("#pCount"), new RegExp(`Question ${i + 1} of 7`));
      await page.locator("#pOptions .opt").nth(i % 3).click();
    }
    await page.waitForSelector("#t-done:not([hidden])");
    const sub = calls(await logOf(page), "submit_team_result")[0];
    assert.equal(Object.keys(sub.args.p_answers).length, 7);
    assert.deepEqual(sub.args.p_answers, { R1_clarity: 2, R2_acknowledgement: 1, R3_decision_transparency: 0, R4_quick_repair: 2, R5_weekly_checkin: 1, R6_ai_disclosure: 0, R7_ai_boundaries: 2 });
    assert.ok(sub.args.p_token.length >= 16); ok("seven numeric answers and a random token are sent, nothing else");
    const body = JSON.stringify(sub.args);
    assert.ok(!/@|name/i.test(body.replace("p_answers", ""))); ok("no name or email in what is sent");
    assert.equal(requests.filter((r) => /supabase\.co/.test(r.url)).length, 0, "stub handles all"); 
    assert.deepEqual(errors, []); ok("no page errors");
  } finally { await browser.close(); }
}

// ---------- join page: Squall rounds with a timeout ----------
{
  const mock = { rpc: { team_run_public: [{ tool: "squall", module: "bank", label: "x", status: "open" }], submit_team_result: "ok" } };
  const { browser, page, errors } = await launch(base, { mock });
  try {
    await page.clock.install();
    await page.goto(base + "/team/?code=ZZZZ1111");
    await page.waitForSelector("#t-intro:not([hidden])");
    await page.click("#startBtn");
    for (let i = 0; i < 5; i++) {
      assert.match(await page.textContent("#rCount"), new RegExp(`Scenario ${i + 1} of 6`));
      await page.locator("#rOptions .opt").nth(0).click();
      assert.ok(await page.locator("#rConf").isVisible());
      await page.locator("#rConfOptions .opt").nth(2).click(); // high confidence
    }
    assert.match(await page.textContent("#rCount"), /Scenario 6 of 6/);
    await page.clock.fastForward(26000);
    await page.waitForSelector("#t-done:not([hidden])");
    const sub = calls(await logOf(page), "submit_team_result")[0];
    const vals = Object.values(sub.args.p_answers);
    assert.equal(vals.length, 6);
    assert.equal(vals[5], 2, "last one timed out");
    assert.ok(vals.slice(0, 5).every((v) => [1, 3].includes(v)), "answers coded correct or overconfident");
    assert.ok(Object.keys(sub.args.p_answers)[0].startsWith("bank_")); ok("Squall rounds send one code per scenario; timeout recorded");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

// ---------- join page: bad states ----------
for (const [name, mock, text] of [
  ["unknown code", { rpc: { team_run_public: [] } }, /not recognised/],
  ["closed link", { rpc: { team_run_public: [{ tool: "halo", status: "closed" }] } }, /closed/],
]) {
  const { browser, page } = await launch(base, { mock });
  try {
    await page.goto(base + "/team/?code=ZZZZ1111");
    await page.waitForFunction(() => document.body.innerText.match(/not recognised|closed/i));
    assert.match(await page.locator("main").innerText(), text); ok(name + " handled in plain words");
  } finally { await browser.close(); }
}
{
  const { browser, page } = await launch(base, { mock: { rpc: { team_run_public: [{ tool: "halo", status: "open" }], submit_team_result: "closed" } } });
  try {
    await page.goto(base + "/team/?code=ZZZZ1111");
    await page.click("#startBtn");
    for (let i = 0; i < 7; i++) await page.locator("#pOptions .opt").first().click();
    await page.waitForSelector("#t-msg:not([hidden])");
    assert.match(await page.textContent("#msgTitle"), /closed/); ok("link closed while answering is explained");
  } finally { await browser.close(); }
}
{
  const { browser, page } = await launch(base, { mock: {} });
  try {
    await page.goto(base + "/team/");
    await page.waitForSelector("#t-code:not([hidden])");
    await page.fill("#codeInput", "abc");
    await page.click("#codeForm button");
    assert.match(await page.textContent("#codeErr"), /8 letters/); ok("no code in the link asks for it; short code rejected");
  } finally { await browser.close(); }
}

// ---------- leader panel on HALO ----------
{
  const levels = { R1_clarity: 2, R2_acknowledgement: 2, R3_decision_transparency: 1, R4_quick_repair: 1, R5_weekly_checkin: 0, R6_ai_disclosure: 0, R7_ai_boundaries: 2 };
  const readiness = Object.entries(levels).map(([field, level]) => ({ field, label: field, level, status: ["Absent", "Partial", "Established"][level], provisional: false }));
  const classification = { readiness, weakest_dimension: readiness[4], established_count: 3, total_dimensions: 7, calibration: { known: false }, provisional: false };
  const mock = {
    tables: {
      halo_assessments: [{ id: "a1", status: "complete", classification, facts: {}, report_md: "## Fine\nBody." }],
      halo_profiles: [{ user_id: "u1", first_name: "Ann", work_email: "ann@corp.com" }],
    },
    rpc: { list_team_runs: [[]], create_team_run: [{ run_id: "r1", join_code: "KCXVHG77" }] },
    rpcQueue: {
      team_run_summary: [
        { n: 1, visible: false, status: "open", join_code: "KCXVHG77" },
        { n: 4, visible: true, status: "open", join_code: "KCXVHG77", questions: {
          R1_clarity: { avg: 0.5, n: 4, counts: { 0: 2, 1: 2 } },
          R2_acknowledgement: { avg: 1.75, n: 4, counts: { 1: 1, 2: 3 } },
          R5_weekly_checkin: { avg: 0, n: 4, counts: { 0: 4 } } } },
      ],
      list_team_runs: [[]],
    },
  };
  const { browser, page, errors } = await launch(base, { mock, localStorage: { "halo.assessment": "a1" } });
  try {
    await page.goto(base + "/halo/");
    await page.waitForSelector("#teamPanel .tp");
    assert.match(await page.textContent("#teamPanel"), /Ask your team the same questions/);
    assert.match(await page.textContent("#teamPanel"), /once three people have replied|only once three/); ok("panel explains the rule before anything is created");
    await page.click('[data-act="create"]');
    await page.waitForSelector(".tp-wait");
    assert.match(await page.textContent(".tp-wait"), /1 person has answered/);
    assert.match(await page.textContent(".tp-wait"), /2 more to go/);
    assert.equal(await page.inputValue(".tp-link input"), base + "/team/?code=KCXVHG77"); ok("link created and the 'not enough answers yet' state shows no numbers");
    assert.equal(await page.locator(".tp-results").count(), 0);
    await page.click('[data-act="refresh"]');
    await page.waitForSelector(".tp-results");
    const txt = await page.textContent(".tp-results");
    assert.match(txt, /biggest gap is on Clarity/);
    assert.match(txt, /clearly higher than your team/);
    assert.match(txt, /Team 0\.5 of 2 · you 2/);
    assert.match(txt, /does not mean your team is right/); ok("results show the gap between leader and team");
    assert.deepEqual(errors, []); ok("no page errors on HALO");
    await page.screenshot({ path: "/tmp/work/build/halo-team.png", fullPage: true });
  } finally { await browser.close(); }
}

// ---------- leader panel on Squall and Ensign (play the six rounds first) ----------
for (const tool of ["squall", "ensign"]) {
  const mock = {
    tables: { [`${tool}_profiles`]: [{ user_id: "u1", first_name: "Ann", work_email: "ann@corp.com" }] },
    rpc: { list_team_runs: [[]], create_team_run: [{ run_id: "r1", join_code: "KCXVHG77" }] },
    rpcQueue: { team_run_summary: [{ n: 0, visible: false, status: "open", join_code: "KCXVHG77" }] },
  };
  const { browser, page, errors } = await launch(base, { mock });
  try {
    await page.goto(base + `/tools/${tool}/`);
    await page.click("#beginBtn");
    if (tool === "squall") { await page.locator('#moduleChoices input').first().check(); await page.click('#setupForm button[type=submit]'); }
    else { const s = await page.$("#setupForm"); if (s && await s.isVisible()) await page.click('#setupForm button[type=submit]'); }
    for (let i = 0; i < 6; i++) {
      await page.waitForSelector("#decisionOptions .opt", { state: "visible" });
      await page.locator("#decisionOptions .opt").first().click();
      await page.locator("#confOptions button").first().click();
      await page.waitForTimeout(400);
    }
    if (tool === "ensign") { await page.waitForSelector("#qWrittenSkip", { state: "visible" }); await page.click("#qWrittenSkip"); }
    await page.waitForSelector("#s-results:not([hidden])");
    await page.waitForSelector("#teamPanel .tp");
    assert.match(await page.textContent("#teamPanel"), /same scenarios/);
    await page.click('[data-act="create"]');
    await page.waitForSelector(".tp-link input");
    assert.match(await page.inputValue(".tp-link input"), /\/team\/\?code=KCXVHG77$/);
    const create = (await logOf(page)).find((l) => l.name === "create_team_run");
    assert.equal(create.args.p_tool, tool); ok(tool + ": results screen offers and creates a team link");
    assert.deepEqual(errors, []); ok(tool + ": no page errors");
  } finally { await browser.close(); }
}
server.close();
console.log(n + " checks passed");
