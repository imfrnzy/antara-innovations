import assert from "node:assert/strict";
import { scanText, parseAmount, markCovered, toCsv, normalise } from "../assets/records-scan.js";
import { AI_TOOLS } from "../assets/ai-catalogue.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("PASS", name); };

const card = `Date,Description,Amount
03/09/2026,"OPENAI *CHATGPT SUBSCR, SAN FRANCISCO",20.00
04/09/2026,OTTER.AI MONTHLY,"1,250.50"
05/09/2026,ANTHROPIC CLAUDE.AI SUBSCRIPTION,18.00
06/09/2026,TESCO STORES 4421,32.10
07/09/2026,GITHUB COPILOT BUSINESS,19.00
08/09/2026,CANVA* 04123,11.99
09/09/2026,AZURE OPENAI SERVICE,432.00
10/09/2026,OPENAI *CHATGPT SUBSCR,20.00
`;
t("finds the obvious tools and counts rows", () => {
  const r = scanText(card);
  const by = Object.fromEntries(r.matches.map((m) => [m.id, m]));
  assert.equal(by.chatgpt.rows, 2);
  assert.equal(by.chatgpt.spend, 40);
  assert.equal(by.otter.spend, 1250.5);
  assert.equal(by.claude.rows, 1);
  assert.equal(by["github-copilot"].rows, 1);
  assert.equal(r.rowsScanned, 8);
  assert.ok(r.hadHeader && r.hasAmountColumn);
});
t("azure openai is not double counted as chatgpt", () => {
  const r = scanText(card);
  const by = Object.fromEntries(r.matches.map((m) => [m.id, m]));
  assert.equal(by["azure-openai"].rows, 1);
  assert.equal(by.chatgpt.rows, 2);
});
t("canva lands in the 'AI inside other software' group, not AI tools", () => {
  const r = scanText(card);
  assert.ok(r.embedded.some((m) => m.id === "e-canva"));
  assert.ok(!r.aiTools.some((m) => m.id === "e-canva"));
});
t("supermarket row matches nothing", () => {
  const r = scanText("Date,Description,Amount\n01/01/2026,TESCO STORES 4421,32.10\n");
  assert.equal(r.matches.length, 0);
});
t("people and places with AI-sounding names do not match", () => {
  const rows = [
    "Salary Claude Dupont", "Gemini Trust Company transfer", "Make Cafe London", "Poe Street Parking",
    "Le Chat Noir restaurant", "Jasper Conran shop", "Cursor Street hotel", "Notion of fun ltd",
    "Gong Cha tea", "Fin Pharmacy", "Sierra Madre Tours", "Lovable Pets Ltd", "Windsurf Club Cornwall",
    "Read a book charity", "Runway Fashion Store", "Grok Cafe", "Pika Pika Toys",
  ].join("\n");
  const r = scanText(rows);
  const ids = r.matches.map((m) => m.id);
  assert.deepEqual(ids, [], "unexpected: " + ids.join(","));
});
t("whole words only: 'thread ai' does not match 'read ai'", () => {
  const r = scanText("thread ai ltd\nspread aid fund");
  assert.equal(r.matches.length, 0);
});
t("single sign-on style list (no header, plain lines)", () => {
  const r = scanText("Otter.ai Notetaker\nSlack\nZoom Workplace\nChatGPT Enterprise\nJira");
  const ids = r.matches.map((m) => m.id).sort();
  assert.ok(ids.includes("otter") && ids.includes("chatgpt"));
  assert.equal(r.hasAmountColumn, false);
  assert.equal(r.matches.find((m) => m.id === "otter").spend, null);
});
t("tab separated and semicolon files", () => {
  assert.equal(scanText("App\tUsers\nChatGPT\t12\nMidjourney\t3").matches.length, 2);
  assert.equal(scanText("Name;Cost\nPerplexity Pro;20,00\nTesco;5,00").matches[0].spend, 20);
});
t("quoted field with commas and escaped quotes", () => {
  const r = scanText('Description,Amount\n"MIDJOURNEY, INC ""PRO""",30\n');
  assert.equal(r.matches[0].id, "midjourney");
  assert.equal(r.matches[0].spend, 30);
});
t("amount parsing", () => {
  assert.equal(parseAmount("£1,234.56"), 1234.56);
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount("(45.00)"), -45);
  assert.equal(parseAmount("-12"), -12);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount(""), null);
});
t("refunds are counted as spend size, not netted to zero", () => {
  const r = scanText("Description,Amount\nOPENAI CHATGPT,20\nOPENAI CHATGPT REFUND,-20\n");
  assert.equal(r.matches[0].spend, 40);
});
t("empty and oversized input give a plain error", () => {
  assert.ok(scanText("   ").error);
  assert.ok(scanText("x".repeat(6_000_001)).error);
});
t("accents and punctuation do not defeat matching", () => {
  assert.equal(normalise("ÉLEVEN-LABS"), "eleven labs");
  assert.equal(scanText("Eleven-Labs subscription").matches[0].id, "elevenlabs");
});
t("covered check uses the person's own descriptions", () => {
  const r = scanText(card);
  const m = markCovered(r.matches, [{ name: "ChatGPT for marketing drafts" }, { name: "Claims triage", description: "uses Otter.ai notes" }]);
  const by = Object.fromEntries(m.map((x) => [x.id, x]));
  assert.equal(by.chatgpt.covered, true);
  assert.equal(by.otter.covered, true);
  assert.equal(by.claude.covered, false);
});
t("csv export has the right columns and no row text", () => {
  const r = scanText(card);
  const csv = toCsv(markCovered(r.matches, []));
  assert.ok(csv.startsWith('"Tool","Vendor"'));
  assert.ok(!/SAN FRANCISCO|TESCO/i.test(csv));
});
t("performance: 150,000 rows under 3 seconds", () => {
  let big = "Date,Description,Amount\n";
  for (let i = 0; i < 150000; i++) big += `01/01/2026,SHOP ${i} LTD,${i % 50}.00\n`;
  big += "01/01/2026,OPENAI CHATGPT,20\n";
  const t0 = Date.now();
  const r = scanText(big);
  const ms = Date.now() - t0;
  assert.equal(r.matches.length, 1);
  assert.ok(ms < 3000, "took " + ms + "ms");
});
t("catalogue hygiene: unique ids, no empty phrases, no bare very common words", () => {
  const ids = new Set();
  const banned = new Set(["claude", "gemini", "make", "poe", "read", "notion", "canva_", "cursor", "gamma", "runway", "pika", "sierra", "fin", "harvey", "glean", "lovable", "windsurf", "jasper", "gong", "zoom", "slack", "meta", "bard"]);
  for (const tool of AI_TOOLS) {
    assert.ok(!ids.has(tool.id), "duplicate id " + tool.id); ids.add(tool.id);
    assert.ok(tool.phrases.length > 0);
    for (const p of tool.phrases) {
      assert.ok(p.trim().length >= 3, "phrase too short: " + p);
      assert.ok(!banned.has(p.trim()), "bare common word as phrase: " + p);
    }
  }
});
console.log(`\n${n} tests passed`);
