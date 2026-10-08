import assert from "node:assert/strict";
import { outcomeRow, practiceSummary, outcomesCsv, summaryLines } from "../tools/manifest/outcomes.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("PASS", name); };
const c1 = { id: "1", client_ref: "A1", insurer: "axa", status: "active", sessions_authorised: 6, sessions_done_before: 0, phq9_baseline: 16, gad7_baseline: 12 };
const k1 = [
  { id: "a", session_date: "2026-09-01", phq9: 14, gad7: 10 },
  { id: "b", session_date: "2026-09-15", phq9: 8, gad7: 6 },
];
const c2 = { id: "2", client_ref: "=B2", insurer: "bupa", status: "active", sessions_authorised: 8, sessions_done_before: 2, phq9_baseline: 12, gad7_baseline: null };
const k2 = [{ id: "c", session_date: "2026-09-02", phq9: 20, gad7: null }];
const c3 = { id: "3", client_ref: "C3", insurer: "other", status: "closed", sessions_authorised: 6, sessions_done_before: 0, phq9_baseline: null, gad7_baseline: null };

t("a client who improved and recovered", () => {
  const r = outcomeRow(c1, k1);
  assert.equal(r.phq9_baseline, 16); assert.equal(r.phq9_latest, 8); assert.equal(r.phq9_change, 8);
  assert.equal(r.phq9_reliable_improvement, "yes"); assert.equal(r.phq9_recovered, "yes");
  assert.equal(r.gad7_reliable_improvement, "yes"); // 12 -> 6 is 6 points, threshold 4
  assert.equal(r.sessions_used_of_authorised, "2 of 6");
  assert.equal(r.first_logged_session, "2026-09-01");
});
t("a client who got worse is marked, not hidden", () => {
  const r = outcomeRow(c2, k2);
  assert.equal(r.phq9_reliable_deterioration, "yes"); assert.equal(r.phq9_change, -8);
  assert.equal(r.gad7_baseline, "");
});
t("a client with no scores has blanks, not zeros", () => {
  const r = outcomeRow(c3, []);
  assert.equal(r.phq9_latest, ""); assert.equal(r.sessions_logged, 0);
});
t("practice summary counts only clients with later readings", () => {
  const s = practiceSummary([c1, c2, c3], { 1: k1, 2: k2, 3: [] });
  assert.deepEqual(s.measures.phq9, { tracked: 2, improved: 1, deteriorated: 1, startedCase: 2, recovered: 1, reliableRecovery: 1 });
  const lines = summaryLines(s);
  assert.match(lines[0], /PHQ-9: 2 clients with a later reading. 1 reliably improved, 1 reliably worse/);
  assert.match(lines[0], /2 started above the clinical threshold, 1 of those are now below it/);
});
t("csv: header, one row per client, quotes escaped, formula-looking codes defused", () => {
  const csv = outcomesCsv([c1, c2, c3], { 1: k1, 2: k2, 3: [] }).split("\r\n");
  assert.equal(csv.length, 4);
  assert.match(csv[0], /^"client_code","insurer"/);
  assert.match(csv[2], /^"'=B2"/);
  assert.equal(outcomesCsv([], {}), "");
});
t("no notes, goals or free text in the export", () => {
  const csv = outcomesCsv([{ ...c1, goals: "secret goal", presenting_issue: "secret issue" }], { 1: [{ ...k1[0], note: "secret note" }, k1[1]] });
  assert.ok(!/secret/.test(csv));
});
console.log(n + " passed");
