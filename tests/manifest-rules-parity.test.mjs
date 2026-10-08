// The two edge functions carry a copy of tools/manifest/agent-rules.js. If they ever drift, this fails.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const src = readFileSync("tools/manifest/agent-rules.js", "utf8").replace(/^export /gm, "");
for (const f of ["manifest-agent", "manifest-reply"]) {
  const fn = readFileSync(`supabase/functions/${f}/index.ts`, "utf8");
  const a = fn.indexOf("// ---- rules, copied verbatim"), b = fn.indexOf("// ---- end rules ----");
  assert.ok(a > -1 && b > a, f + ": markers missing");
  const block = fn.slice(fn.indexOf("\n", a) + 1, b).trim();
  assert.equal(block, src.trim(), f + ": rules copy differs from tools/manifest/agent-rules.js");
  console.log("PASS", f, "carries an identical copy of the rules");
}
