// The interviewer prompts cannot be run offline, but the rules found necessary in live testing must not be lost.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("PASS", name); };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
for (const p of ["supabase/functions/soundings-interview/index.ts", "supabase/functions/sentinel-interview/index.ts"]) {
  t(p + ": never swaps one tool for another", () => assert.match(read(p), /Never swap one tool for another/));
  t(p + ": does not ask the same unanswered fact a third time", () => assert.match(read(p), /do not ask a third time/));
}
t("keel: scattered spend is recorded as high", () => assert.match(read("supabase/functions/keel-interview/index.ts"), /Never record scattered spend as "low"/));
t("halo: notes are marked and never shown as quotes", () => { const s = read("supabase/functions/halo-interview/index.ts"); assert.match(s, /NOTE \(the interviewer's summary/); assert.match(s, /never show them as a quote/); });
console.log(n + " passed");
