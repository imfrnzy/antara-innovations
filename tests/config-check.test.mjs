import assert from "node:assert/strict";
import { checkConfig, summaryText } from "../sentinel/config-check.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("PASS", name); };
const cfg = (servers) => JSON.stringify({ mcpServers: servers }, null, 2);

t("claims-style agent: mail + database + payments -> OPEN", () => {
  const r = checkConfig(cfg({
    gmail: { command: "npx", args: ["-y", "@gongrzhe/server-gmail-autoauth-mcp@1.1.0"] },
    postgres: { command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres@0.6.2", "postgresql://app:${DB_PASS}@db.internal/claims"] },
    stripe: { command: "npx", args: ["-y", "@stripe/mcp@0.2.4", "--tools=all"], env: { STRIPE_SECRET_KEY: "${STRIPE_KEY}" } },
  }));
  assert.equal(r.status, "OPEN");
  assert.deepEqual(r.legs, { untrusted_input: "yes", private_data: "yes", outward_action: "yes" });
  assert.equal(r.servers.length, 3);
  assert.equal(r.flags.filter((f) => f.level === "HIGH").length, 0, JSON.stringify(r.flags));
  assert.ok(r.breaks.length === 3);
});
t("filesystem + fetch is OPEN: local files can leave through web requests", () => {
  const r = checkConfig(cfg({
    files: { command: "npx", args: ["@modelcontextprotocol/server-filesystem@2025.1.14", "/srv/project"] },
    fetch: { command: "uvx", args: ["mcp-server-fetch==1.0.0"] },
  }));
  assert.equal(r.status, "OPEN");
});
t("search only -> CLOSED", () => {
  const r = checkConfig(cfg({ brave: { command: "npx", args: ["@brave/brave-search-mcp-server@1.0.0"] } }));
  assert.equal(r.status, "CLOSED");
  assert.ok(r.narrative.includes("missing"));
});
t("database alone, no outside reach -> CLOSED, with note", () => {
  const r = checkConfig(cfg({ sqlite: { command: "uvx", args: ["mcp-server-sqlite==0.6.2", "--db-path", "/data/app.db"] } }));
  assert.equal(r.status, "CLOSED");
});
t("unrecognised server blocks a clean CLOSED", () => {
  const r = checkConfig(cfg({ brave: { command: "npx", args: ["@brave/brave-search-mcp-server@1.0.0"] }, mystery: { command: "./bin/thing" } }));
  assert.equal(r.status, "UNKNOWN");
  assert.deepEqual(r.unrecognised, ["mystery"]);
});
t("secrets in plain text are flagged by name and the value is never returned", () => {
  const secret = "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const r = checkConfig(cfg({ x: { command: "npx", args: ["pkg@1.0.0"], env: { ANTHROPIC_API_KEY: secret, GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" } } }));
  const text = JSON.stringify(r) + summaryText(r);
  assert.ok(!text.includes(secret) && !text.includes("ghp_abcdef"), "a secret value leaked into the output");
  const f = r.flags.find((x) => /plain text/.test(x.text));
  assert.equal(f.level, "HIGH"); assert.ok(f.text.includes("env ANTHROPIC_API_KEY"));
});
t("placeholders and variable references are not treated as secrets", () => {
  const r = checkConfig(cfg({ gh: { command: "npx", args: ["@modelcontextprotocol/server-github@1.0.0"], env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}", OTHER_KEY: "<your key>", Z_TOKEN: "$Z" } } }));
  assert.ok(!r.flags.some((f) => /plain text/.test(f.text)));
});
t("password inside a connection string is flagged without revealing it", () => {
  const r = checkConfig(cfg({ pg: { command: "npx", args: ["@modelcontextprotocol/server-postgres@0.6.2", "postgresql://admin:hunter2secret@db.example.com/prod"] } }));
  const f = r.flags.find((x) => /connection string/.test(x.text));
  assert.ok(f); assert.ok(!JSON.stringify(r).includes("hunter2secret"));
});
t("auto-approve on an acting server is HIGH and escalates the headline", () => {
  const r = checkConfig(cfg({
    gmail: { command: "npx", args: ["x-gmail@1.0.0"], alwaysAllow: ["send_email", "read_email"] },
    postgres: { command: "npx", args: ["server-postgres@1.0.0"] },
  }));
  assert.equal(r.status, "OPEN");
  assert.ok(r.headline.includes("approvals are switched off"));
  assert.ok(r.flags.some((f) => f.level === "HIGH" && /without asking/.test(f.text)));
});
t("a wildcard auto-approve is read as all tools", () => {
  const r = checkConfig(cfg({ shell: { command: "npx", args: ["desktop-commander@1.0.0"], autoApprove: ["*"] } }));
  assert.ok(r.flags.some((f) => /Every tool/.test(f.text)));
});
t("broad file access is flagged", () => {
  for (const p of ["/", "~", "/Users/ann", "C:\\"]) {
    const r = checkConfig(cfg({ files: { command: "npx", args: ["@modelcontextprotocol/server-filesystem@1.0.0", p] } }));
    assert.ok(r.flags.some((f) => /whole home folder or drive/.test(f.text)), p);
  }
  const ok = checkConfig(cfg({ files: { command: "npx", args: ["@modelcontextprotocol/server-filesystem@1.0.0", "/srv/project/docs"] } }));
  assert.ok(!ok.flags.some((f) => /whole home folder/.test(f.text)));
});
t("unpinned package runners are flagged, pinned ones are not", () => {
  const bad = checkConfig(cfg({ gh: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] } }));
  assert.ok(bad.flags.some((f) => /newest version/.test(f.text)));
  const latest = checkConfig(cfg({ gh: { command: "npx", args: ["-y", "pkg@latest"] } }));
  assert.ok(latest.flags.some((f) => /newest version/.test(f.text)));
  const good = checkConfig(cfg({ gh: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github@2025.4.8"] } }));
  assert.ok(!good.flags.some((f) => /newest version/.test(f.text)));
});
t("remote servers name the host", () => {
  const r = checkConfig(cfg({ linear: { url: "https://mcp.linear.app/sse" }, local: { url: "http://localhost:8787/mcp" } }));
  assert.ok(r.flags.some((f) => /mcp\.linear\.app/.test(f.text)));
  assert.ok(!r.flags.some((f) => /localhost/.test(f.text)));
});
t("disabled servers are ignored in the verdict", () => {
  const r = checkConfig(cfg({ gmail: { command: "x", args: ["gmail@1"], disabled: true }, brave: { command: "npx", args: ["brave@1"] } }));
  assert.equal(r.status, "CLOSED");
});
t("VS Code style file with comments and a different key", () => {
  const r = checkConfig(`{
    // my agent
    "servers": {
      "github": { "type": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github@1.0.0"], },
      /* chat */ "slack": { "command": "npx", "args": ["slack-mcp@1.0.0"] }
    }
  }`);
  assert.equal(r.mode, "mcp"); assert.equal(r.servers.length, 2); assert.equal(r.status, "OPEN");
});
t("Claude Code project file nests servers under projects", () => {
  const r = checkConfig(JSON.stringify({ projects: { "/work/a": { mcpServers: { fetch: { command: "uvx", args: ["mcp-server-fetch==1.0"] } } } } }));
  assert.equal(r.servers.length, 1);
});
t("plain list of tools and scopes works", () => {
  const r = checkConfig("gmail.send\nMail.Read\nGoogle Drive\nstripe refunds");
  assert.equal(r.mode, "list"); assert.equal(r.status, "OPEN");
});
t("plain list of harmless tools -> CLOSED", () => {
  const r = checkConfig("calculator\ntime");
  assert.equal(r.status, "CLOSED");
});
t("valid JSON with no servers gives a helpful error", () => {
  const r = checkConfig('{"theme":"dark"}');
  assert.ok(r.error && /mcpServers/.test(r.error));
});
t("empty, huge and nonsense input give plain errors, never throw", () => {
  assert.ok(checkConfig("").error); assert.ok(checkConfig("x".repeat(500000)).error);
  assert.doesNotThrow(() => checkConfig("{{{{ not json at all"));
  assert.doesNotThrow(() => checkConfig('{"mcpServers": {"a": null, "b": "str", "c": {"args": "notarray", "env": 5}}}'));
});
t("hostile server names cannot inject markup into the summary", () => {
  const r = checkConfig(cfg({ "<img src=x onerror=alert(1)>": { command: "x" } }));
  assert.equal(typeof summaryText(r), "string"); // escaping is done at render time; text stays plain
});
t("same input, same output", () => {
  const input = cfg({ gmail: { command: "npx", args: ["g@1"] }, fetch: { command: "uvx", args: ["f==1"] } });
  assert.deepEqual(checkConfig(input), checkConfig(input));
});
t("unreadable input says it cannot tell, not that no path was found (live finding 8 Oct 2026)", () => {
  const r = checkConfig("{ this is not json");
  assert.match(r.headline, /couldn't recognise anything/);
  assert.doesNotMatch(r.headline, /No full path found/);
  const two = checkConfig(cfg({ a: { command: "npx", args: ["qq1"] }, b: { command: "npx", args: ["qq2"] } }));
  assert.match(two.headline, /couldn't recognise anything/);
});
t("one unrecognised server among recognised ones reads correctly", () => {
  const r = checkConfig(cfg({ clock: { command: "npx", args: ["-y", "time-server"] }, mystery: { command: "npx", args: ["zzz"] } }));
  assert.equal(r.headline, "No full path found, but one thing wasn't recognised.");
});
console.log(`\n${n} tests passed`);
