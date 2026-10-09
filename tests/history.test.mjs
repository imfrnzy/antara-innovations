import assert from "node:assert/strict";
import { scanText, markCovered } from "../assets/records-scan.js";
import { checkConfig } from "../sentinel/config-check.js";
import { snapshotRecords, snapshotConfig, diffRecords, diffConfig, compare, describeSaveError, savesAllowed, trend, FREE_SAVES, PRO_SAVES } from "../assets/history.js";

let n = 0; const ok = (m) => { n++; console.log("PASS", m); };

// ---------- records ----------
const may = `Date,Description,Amount
01/05/2026,OPENAI *CHATGPT SUBSCR,20.00
02/05/2026,OTTER.AI MONTHLY,40.00
03/05/2026,TESCO STORES,12.00
`;
const june = `Date,Description,Amount
01/06/2026,OPENAI *CHATGPT SUBSCR,20.00
02/06/2026,OPENAI *CHATGPT SUBSCR,20.00
03/06/2026,ANTHROPIC CLAUDE.AI SUBSCRIPTION,18.00
04/06/2026,MIDJOURNEY INC,30.00
`;
const a = scanText(may), b = scanText(june);
const sa = snapshotRecords(a, markCovered(a.aiTools, [{ name: "ChatGPT", description: "" }, { name: "Otter", description: "" }]));
const sb = snapshotRecords(b, markCovered(b.aiTools, [{ name: "ChatGPT", description: "" }]));
assert.equal(sa.kind, "records");
assert.ok(sa.tools.length === 2 && sb.tools.length === 3);
ok("snapshots hold names and counts");

const text = JSON.stringify(sa);
assert.ok(!/TESCO|01\/05\/2026|SUBSCR/.test(text)); ok("snapshot keeps no row text");

const d = diffRecords(sa, sb);
const ids = (t) => d.changes.filter((c) => c.type === t).map((c) => c.id);
assert.deepEqual(ids("added").sort(), ["claude", "midjourney"]);
assert.deepEqual(ids("removed"), ["otter"]);
assert.deepEqual(ids("grew"), ["chatgpt"]);
assert.ok(d.worse >= 2, "new tools not on the map count as more exposure");
assert.match(d.headline, /add exposure/);
ok("records diff finds added, removed and grown tools: " + d.headline);

const same = diffRecords(sb, sb);
assert.equal(same.changes.length, 0);
assert.equal(same.headline, "Nothing has changed between these two scans."); ok("same scan twice reports no change");

assert.ok(diffRecords(sa, snapshotConfig(checkConfig('{"mcpServers":{"fetch":{"command":"uvx","args":["mcp-server-fetch"]}}}'))).error); ok("different kinds refuse to compare");

// covered flips
const flip = { ...sb, tools: sb.tools.map((t) => (t.id === "chatgpt" ? { ...t, covered: true } : t)) };
const flipped = { ...sb, tools: sb.tools.map((t) => (t.id === "chatgpt" ? { ...t, covered: false } : t)) };
assert.equal(diffRecords(flip, flipped).changes.some((c) => c.type === "uncovered" && c.tone === "worse"), true);
assert.equal(diffRecords(flipped, flip).changes.some((c) => c.type === "covered" && c.tone === "better"), true); ok("on-map flips are labelled worse and better");

// ---------- config ----------
const cfgA = checkConfig(JSON.stringify({ mcpServers: { files: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem@1.0.0", "/srv/project"] } } }));
const cfgB = checkConfig(JSON.stringify({ mcpServers: {
  files: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem@1.0.0", "/srv/project"] },
  gmail: { command: "npx", args: ["-y", "gmail-mcp"] },
  github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], env: { GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" } },
} }));
const ca = snapshotConfig(cfgA), cb = snapshotConfig(cfgB);
const sec = JSON.stringify(cb);
assert.ok(!/ghp_/.test(sec)); ok("config snapshot never holds a secret value");

const cd = diffConfig(ca, cb);
assert.ok(cd.changes.some((c) => c.type === "added" && /gmail/i.test(c.text)));
assert.ok(cd.changes.some((c) => c.type === "status" && c.tone === "worse"), "closed to open is worse");
assert.ok(cd.worse >= 2);
assert.ok(cd.changes.every((c) => !/\b(untrusted|persist)\b/.test(c.text) || c.type === "flag-new"), "capability codes are written as words");
ok("config diff: new connections and a worse overall result: " + cd.headline);

const back = diffConfig(cb, ca);
assert.ok(back.changes.some((c) => c.type === "removed" && c.tone === "better"));
assert.ok(back.changes.some((c) => c.type === "status" && c.tone === "better"));
assert.ok(back.changes.some((c) => c.type === "flag-fixed")); ok("going back reports removals, a better result and fixed findings");

// a capability gained on the same server
const g1 = { ...ca, servers: [{ name: "files", kinds: ["Files"], caps: ["private"], maybe: [], recognised: true }], flags: [] };
const g2 = { ...ca, servers: [{ name: "files", kinds: ["Files"], caps: ["private", "write"], maybe: [], recognised: true }], flags: [] };
const gd = diffConfig(g1, g2);
assert.match(gd.changes.find((c) => c.type === "gained").text, /change records or files/); ok("gained capability is named in plain words");

// compare() routes by kind
assert.equal(compare(sa, sb).kind, "records");
assert.equal(compare(ca, cb).kind, "config");
assert.ok(compare(null, sb).error); ok("compare routes by kind and rejects missing input");

// ---------- plan rules ----------
assert.equal(FREE_SAVES, 3); assert.equal(PRO_SAVES, 200);
assert.equal(savesAllowed("free"), 3); assert.equal(savesAllowed("pro"), 200); assert.equal(savesAllowed(undefined), 3);
assert.match(describeSaveError("free_limit"), /3 saved scans/);
assert.match(describeSaveError("sign_in_required"), /Confirm your email/);
assert.match(describeSaveError("pro_limit"), /limit/);
assert.match(describeSaveError("snapshot_too_large"), /too large/);
assert.match(describeSaveError("weird"), /Couldn't save/); ok("plan numbers and error messages");

const tr = trend([{ kind: "records", at: "1", tools: [1, 2] }, { kind: "records", at: "2", tools: [1, 2, 3] }]);
assert.deepEqual(tr.map((t) => t.value), [2, 3]);
assert.equal(trend([{ kind: "config", at: "1", status: "OPEN" }])[0].value, 3); ok("trend values");

// hostile text in names stays text (the page escapes it); length is capped
const long = "x".repeat(500);
const hostile = snapshotRecords({ aiTools: [{ id: "a", name: "<img src=x onerror=alert(1)>" + long, category: "assistant", rows: 1 }], embedded: [], rowsScanned: 1, catalogueVersion: "t" }, []);
assert.ok(hostile.tools[0].name.length <= 80); ok("long names are cut to a safe length");

console.log(`\n${n} checks passed`);
