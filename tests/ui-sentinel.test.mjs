import assert from "node:assert/strict";
import { serve, launch } from "./ui-harness.mjs";

const { server, base } = await serve();
let n = 0; const ok = (m) => { n++; console.log("PASS", m); };
const F = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v, status: "confirmed", quote: "q" }]));
const mock = {
  tables: {
    sentinel_assessments: [{ id: "a1", status: "complete" }],
    sentinel_profiles: [{ user_id: "u1", first_name: "Ann", work_email: "ann@corp.com" }],
    sentinel_agents: [
      { assessment_id: "a1", name: "Claims triage agent", facts: F({ C1_irreversible_without_approval: "yes", C2_sees_sensitive_data: "yes", U1_untrusted_input: "yes", C3_multi_system_access: "yes", C4_writes_system_of_record: "yes", T1_named_owner: "no", T2_reconstructable: "no", T3_known_outside_team: "no" }) },
      { assessment_id: "a1", name: "Internal summariser", facts: F({ C1_irreversible_without_approval: "no", C2_sees_sensitive_data: "yes", U1_untrusted_input: "no", C3_multi_system_access: "no", C4_writes_system_of_record: "no", T1_named_owner: "yes", T2_reconstructable: "yes", T3_known_outside_team: "yes" }) },
      { assessment_id: "a1", name: "Old agent without the new fact", facts: F({ C1_irreversible_without_approval: "yes", C2_sees_sensitive_data: "yes", C3_multi_system_access: "no", C4_writes_system_of_record: "no", T1_named_owner: "no", T2_reconstructable: "no", T3_known_outside_team: "no" }) },
    ],
  },
};

// ---- results ----
{
  const { browser, page, errors } = await launch(base, { mock, localStorage: { "sentinel.assessment": "a1" } });
  try {
    await page.goto(base + "/sentinel/");
    await page.waitForSelector("#s-results:not([hidden])");
    const head = await page.textContent("#headline");
    assert.match(head, /One has an open attack path/); ok("headline mentions the open path: " + head);
    const ths = await page.locator("#matrixTable thead th").allTextContents();
    assert.deepEqual(ths, ["Agent", "Irrev.", "Data", "Outside input", "Multi-sys", "Writes", "Owner", "Traced", "Known", "Zone"]); ok("matrix has the new column in the right place");
    const first = page.locator(".finding").first();
    assert.match(await first.textContent(), /Claims triage agent/); ok("open path agent is listed first");
    assert.match(await first.locator(".pathbox").textContent(), /Attack path open/);
    assert.match(await first.locator(".action").textContent(), /Break the attack path at its cheapest point/); ok("open finding shows path and the right recommendation");
    const boxes = await page.locator(".pathbox").allTextContents();
    assert.equal(boxes.length, 3);
    assert.ok(boxes.some((b) => /closed/i.test(b)) && boxes.some((b) => /not ruled out/i.test(b))); ok("closed and not-ruled-out agents are labelled honestly");
    assert.ok(boxes.every((b) => /Inferred from your answers/.test(b))); ok("every path says it is inferred, not tested");
    assert.deepEqual(errors, []); ok("no page errors on results");
    await page.screenshot({ path: "/tmp/work/build/sentinel-results.png", fullPage: true });
  } finally { await browser.close(); }
}

// ---- config check ----
{
  const { browser, page, requests, errors } = await launch(base, { mock: { tables: {} }, localStorage: {} });
  try {
    await page.goto(base + "/sentinel/");
    await page.waitForSelector("#s-intro:not([hidden])");
    await page.click("#cfgOpen");
    assert.ok(await page.locator("#s-config").isVisible()); ok("intro opens the config check");

    await page.click("#cfgRun");
    assert.match(await page.textContent("#cfgErr"), /Paste the configuration first/); ok("empty input gives a plain message");

    const secret = "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const cfg = JSON.stringify({ mcpServers: {
      gmail: { command: "npx", args: ["-y", "gmail-mcp"], alwaysAllow: ["send_email"], env: { GMAIL_TOKEN: secret } },
      postgres: { command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres@0.6.2", "postgresql://u:${PASS}@db/claims"] },
      "<img src=x onerror=window.__pwn=1>": { command: "./thing" },
    } });
    const before = requests.length;
    await page.fill("#cfgText", cfg);
    await page.click("#cfgRun");
    await page.waitForSelector("#cfgOut:not([hidden])");
    const verdict = await page.textContent("#cfgVerdict");
    assert.match(verdict, /All three ingredients are present, and approvals are switched off/); ok("verdict: " + verdict.slice(0, 70));
    const legs = await page.locator(".legchip").allTextContents();
    assert.equal(legs.length, 3); assert.ok(legs.every((l) => /Yes/.test(l))); ok("three legs shown");
    const html = await page.content();
    assert.ok(!html.includes(secret) && !(await page.evaluate(() => document.body.innerText)).includes(secret)); ok("secret value never appears on the page");
    assert.match(await page.textContent("#cfgFlags"), /env GMAIL_TOKEN/); ok("secret is flagged by name");
    assert.equal(await page.evaluate(() => window.__pwn), undefined);
    assert.equal(await page.locator("#cfgServers img").count(), 0); ok("hostile server name is shown as text, not run");
    assert.match(await page.textContent("#cfgServers"), /Not recognised/);
    const sent = requests.slice(before).filter((r) => r.method !== "GET" || !r.url.startsWith(base));
    assert.deepEqual(sent, [], "network during check: " + JSON.stringify(sent)); ok("nothing is sent anywhere during the check");

    await page.click("#cfgCopy");
    await page.waitForTimeout(200);
    assert.match(await page.textContent("#cfgCopied"), /Copied/);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(clip.includes("Sentinel configuration check") && !clip.includes(secret)); ok("copied summary has no secret");

    // closed result
    await page.fill("#cfgText", JSON.stringify({ mcpServers: { brave: { command: "npx", args: ["@brave/brave-search-mcp-server@1.0.0"] } } }));
    await page.click("#cfgRun");
    assert.match(await page.textContent("#cfgVerdict"), /No full attack path found/); ok("a safer config shows a closed result");

    // plain list
    await page.fill("#cfgText", "gmail.send\nMail.Read\nstripe refunds");
    await page.click("#cfgRun");
    assert.match(await page.textContent("#cfgVerdict"), /All three ingredients are present/); ok("plain list works");

    // error
    await page.fill("#cfgText", '{"theme":"dark"}');
    await page.click("#cfgRun");
    assert.match(await page.textContent("#cfgErr"), /mcpServers/);
    assert.ok(await page.locator("#cfgOut").isHidden()); ok("unreadable input shows an error and hides old results");

    // back, and to interview
    await page.click("#cfgBack");
    assert.ok(await page.locator("#s-intro").isVisible()); ok("back returns to intro");
    await page.click("#cfgOpen");
    await page.fill("#cfgText", "gmail.send\nMail.Read\nstripe refunds");
    await page.click("#cfgRun");
    await page.click("#cfgToInterview");
    assert.ok(await page.locator("#s-setup").isVisible()); ok("config result leads into the interview");

    // mobile
    await page.setViewportSize({ width: 390, height: 800 });
    await page.click("#beginBtn").catch(() => {});
    await page.goto(base + "/sentinel/");
    await page.waitForSelector("#s-intro:not([hidden])");
    await page.click("#cfgOpen");
    await page.fill("#cfgText", cfg);
    await page.click("#cfgRun");
    await page.waitForSelector("#cfgOut:not([hidden])");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, "overflow " + overflow); ok("no horizontal scroll at 390px");
    await page.screenshot({ path: "/tmp/work/build/sentinel-config-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.screenshot({ path: "/tmp/work/build/sentinel-config-desktop.png", fullPage: true });
    assert.deepEqual(errors, [], errors.join("|")); ok("no page errors on config check");
  } finally { await browser.close(); }
}
server.close();
console.log(`\n${n} checks passed`);
