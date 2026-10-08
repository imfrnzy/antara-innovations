import assert from "node:assert/strict";
import { assessQueryRisk } from "../tools/manifest/engine.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("PASS", name); };
const base = { sessions_requested: 6, client_ref: "x", progress: "p" };
const why = (insurer) => assessQueryRisk({ ...base, insurer }, null).find((f) => /outcome measure/.test(f.message))?.why ?? "";
t("the shared outcome-measures flag only names Bupa for a Bupa report (live finding 8 Oct 2026)", () => {
  assert.match(why("bupa"), /Bupa's form/);
  assert.doesNotMatch(why("axa"), /Bupa/);
  assert.doesNotMatch(why("other"), /Bupa/);
  assert.ok(why("axa").length > 40);
});
console.log(n + " passed");
