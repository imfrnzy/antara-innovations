import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkReport, fallbackReport, squash, isVerbatim, isNote, NOTE_PREFIX } from "../halo/report-check.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("PASS", name); };
const readiness = [
  { field: "R1_clarity", label: "Clarity", level: 2, status: "Established", provisional: false },
  { field: "R5_weekly_checkin", label: "Weekly check-in", level: 0, status: "Absent", provisional: false },
  { field: "R4_quick_repair", label: "Quick repair", level: 0, status: "Absent", provisional: true },
];
const cls = { readiness, weakest_dimension: readiness[1], established_count: 1, total_dimensions: 7 };
const ev = [{ field: "R1_clarity", value: "established", quote: "I told Priya on Tuesday the budget call came from above me" }];
const good = "## Where you stand today\nClarity is strong. You said \"I told Priya on Tuesday the budget call came from above me\". 1 of 7 standards are established.\n\n## Fix this one first\nWeekly check-in is the gap. Book one this week with each person, no agenda about their tasks, and keep it to twenty minutes.\n\n## Then build the rhythm\nDaily two minute signal check. Keep it small and keep it regular so it survives a busy week and a bad one.";
t("a faithful report passes", () => assert.deepEqual(checkReport(good, cls, ev), []));
t("an invented quote fails", () => assert.equal(checkReport(good.replace("I told Priya on Tuesday the budget call came from above me", "I always explain every single decision to the whole team"), cls, ev).length, 1));
t("wrong count fails", () => assert.match(checkReport(good.replace("1 of 7", "5 of 7"), cls, ev)[0], /5 of 7/));
t("count in words fails", () => assert.equal(checkReport(good.replace("1 of 7", "five of seven"), cls, ev).length, 1));
t("fix-first about the wrong dimension fails", () => assert.match(checkReport(good.replace("Weekly check-in is the gap", "Clarity needs work").replace("agenda about their tasks", "agenda"), cls, ev).join(), /weakest dimension/));
t("dashes fail", () => assert.ok(checkReport(good.replace("Clarity is strong.", "Clarity is strong — mostly."), cls, ev).length > 0));
t("too short fails", () => assert.ok(checkReport("Fine.", cls, ev).length > 0));
t("curly quotes and punctuation differences are tolerated", () => {
  const r = good.replace('"I told Priya on Tuesday the budget call came from above me"', "“I told Priya on Tuesday, the budget call came from above me.”");
  assert.deepEqual(checkReport(r, cls, ev), []);
});
t("fallback is accurate and passes its own check", () => {
  const f = fallbackReport(cls, ev, "Ann");
  assert.match(f, /1 of 7 standards are established/);
  assert.match(f, /was not covered in the conversation/);
  assert.match(f, /weakest standard is \*\*Weekly check-in\*\*/);
  assert.deepEqual(checkReport(f, cls, ev).filter((p) => !/too short/.test(p)), []);
});
t("squash", () => assert.equal(squash("  Hello, WORLD! "), "hello world"));

// ---- 8 Oct 2026: live runs showed the guard rejecting every real draft, and notes shown as "You said" ----
t("wording the report only suggests is not treated as something the leader said", () => {
  const r = good.replace("keep it to twenty minutes.", 'keep it to twenty minutes. A good opener is "How are things actually feeling for you this week?" and then stop talking.');
  assert.deepEqual(checkReport(r, cls, ev), []);
});
t("a quote shown as the leader's own words still has to be real", () => {
  const r = good.replace("Clarity is strong.", 'Clarity is strong. As you put it, "I explain every decision to the whole team before it happens".');
  assert.equal(checkReport(r, cls, ev).length, 1);
});
t("quoting another person is not checked against the leader's words", () => {
  const r = good.replace("Clarity is strong.", 'Clarity is strong. Priya would hear "the budget call came from above me" and relax.');
  assert.deepEqual(checkReport(r, cls, ev), []);
});
const note = [{ field: "R3_decision_transparency", value: "absent", quote: NOTE_PREFIX + "Person described team context and pressure but did not give a specific recent decision." }];
t("an interviewer note can never be shown as what the leader said", () => {
  const r = good.replace("Clarity is strong.", 'Clarity is strong. You said "Person described team context and pressure but did not give a specific recent decision".');
  assert.equal(checkReport(r, cls, [...ev, ...note]).length, 1);
  assert.ok(isNote(note[0])); assert.ok(!isNote(ev[0]));
});
t("the fallback shows 'You said' only for the leader's own words", () => {
  const cl = { ...cls, readiness: [...readiness, { field: "R3_decision_transparency", label: "Decision transparency", level: 0, status: "Absent", provisional: false }] };
  const f = fallbackReport(cl, [...ev, ...note], "Ann");
  assert.match(f, /You said: "I told Priya on Tuesday/);
  assert.ok(!/Person described/.test(f));
  assert.match(f, /Decision transparency\*\*: absent\.$/m);
});
t("isVerbatim: real quotes, editing marks, and summaries", () => {
  const typed = "I apologised in the channel that morning and moved the deadline back two days. In August I snapped at Raj in a review, I found him within two hours.";
  assert.equal(isVerbatim("I apologised in the channel that morning", typed), true);
  assert.equal(isVerbatim("I apologised in the channel that morning [Monday, after Aisha raised it]. In August I snapped at Raj in a review", typed), true);
  assert.equal(isVerbatim("I apologised in the channel ... I found him within two hours", typed), true);
  assert.equal(isVerbatim("Person described team context but gave no instance", typed), false);
  assert.equal(isVerbatim("", typed), false);
});
console.log(n + " passed");
// parity: the pasted copy in the edge function must equal halo/report-check.js
{
  const src = readFileSync(new URL("../halo/report-check.js", import.meta.url), "utf8")
    .replace(/export const/g, "const").replace(/export function/g, "function");
  const want = src.slice(src.indexOf("const REPORT_CHECK_VERSION")).trim();
  const fn = readFileSync(new URL("../supabase/functions/halo-interview/index.ts", import.meta.url), "utf8");
  const got = fn.slice(fn.indexOf("// ---- HALO report guard"), fn.indexOf("// ---- end report guard ----"));
  assert.ok(got.includes(want), "edge function copy differs from halo/report-check.js");
  console.log("PASS edge function copy matches halo/report-check.js");
}

// regression: internal field codes must not reach the reader
{
  const mod = await import("../halo/report-check.js");
  const cls = { established_count: 6, total_dimensions: 7, weakest_dimension: { label: "Clarity", level: 1 } };
  const bad = "## Where you stand today\nSix of 7 standards. In sharp contrast to R7, you hold a boundary.\n## Fix this one first\nClarity matters.";
  const good = bad.replace("R7", "AI boundaries");
  const p1 = mod.checkReport ? mod.checkReport(bad, cls, []) : null;
  const p2 = mod.checkReport ? mod.checkReport(good, cls, []) : null;
  if (!p1) throw new Error("checkReport export not found, adjust test");
  if (!p1.some((x) => /internal code/.test(x))) throw new Error("R7 not caught");
  if (p2.some((x) => /internal code/.test(x))) throw new Error("false positive on plain names");
  console.log("PASS field codes are caught and plain names are not");
}
