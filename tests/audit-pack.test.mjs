import assert from "node:assert/strict";
import { assess, selectQuestions } from "../tools/bearing/engine.js";
import { buildPack, flagsFor, daysUntil, packHtml, packCsv, controlsAllowed, describeControlError, FREE_CONTROLS, PRO_CONTROLS } from "../assets/audit-pack.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("PASS", name); };
const TODAY = new Date(Date.UTC(2026, 9, 9));
const profile = { jurisdictions: ["uk", "ch"], sector: "insurer", size: "mid", uses: ["claims"] };
const answers = (v) => Object.fromEntries(selectQuestions(profile).map((q) => [q.id, q.type === "written" ? { value: v, text: "x", critique: "y" } : v]));
const result = assess(profile, answers("evidence"));
const weak = assess(profile, answers("no"));

t("days until works on plain dates and refuses junk", () => {
  assert.equal(daysUntil("2026-10-09", TODAY), 0); assert.equal(daysUntil("2026-10-10", TODAY), 1); assert.equal(daysUntil("2026-10-01", TODAY), -8);
  assert.equal(daysUntil("tomorrow", TODAY), null); assert.equal(daysUntil("", TODAY), null); assert.equal(daysUntil("2026-13-45", TODAY), null);
});
t("flags: no owner, overdue, due soon, no evidence", () => {
  const f = (o) => flagsFor({ owner: "", reviewDate: "", evidenceNote: "", status: "partly", ...o }, TODAY).map((x) => x.code);
  assert.deepEqual(f({}), ["no_owner", "no_review"]);
  assert.deepEqual(f({ owner: "CRO", reviewDate: "2026-09-01" }), ["overdue"]);
  assert.deepEqual(f({ owner: "CRO", reviewDate: "2026-10-20" }), ["due_soon"]);
  assert.deepEqual(f({ owner: "CRO", reviewDate: "2027-03-01" }), []);
  assert.deepEqual(f({ owner: "CRO", reviewDate: "2027-03-01", status: "ready" }), ["no_evidence"]);
  assert.deepEqual(f({ owner: "CRO", reviewDate: "2027-03-01", status: "ready", evidenceNote: "register" }), []);
  assert.deepEqual(f({ owner: "CRO", reviewDate: "31/12/2026" }), ["bad_date"]);
});
t("pack: every obligation appears once, worst first, with no controls everything lacks an owner", () => {
  const p = buildPack(weak, [], TODAY);
  const total = weak.lenses.reduce((a, l) => a + l.obligations.length, 0);
  assert.equal(p.summary.obligations, total); assert.equal(p.summary.noOwner, total); assert.equal(p.summary.withOwner, 0);
  const order = { notyet: 0, unknown: 1, partly: 2, ready: 3 };
  for (const l of p.lenses) for (let i = 1; i < l.rows.length; i++) assert.ok(order[l.rows[i - 1].status] <= order[l.rows[i].status]);
});
t("pack: controls attach by area and obligation, and change the counts", () => {
  const o = result.lenses[0].obligations[0];
  const key = `${result.lenses[0].lens}:${o.id}`;
  const p = buildPack(result, [{ obligation_id: key, owner: "Priya, CRO", review_date: "2026-09-01", evidence_note: "AI register v4" }], TODAY);
  const row = p.lenses[0].rows.find((r) => r.key === key);
  assert.equal(row.owner, "Priya, CRO"); assert.ok(row.flags.some((f) => f.code === "overdue"));
  assert.equal(p.summary.withOwner, 1); assert.equal(p.summary.overdue, 1);
});
t("pack: same obligation in two areas keeps separate owners", () => {
  const ids = result.lenses.flatMap((l) => l.obligations.map((o) => `${l.lens}:${o.id}`));
  assert.equal(new Set(ids).size, ids.length);
});
t("pack: junk input gives null", () => { assert.equal(buildPack(null, []), null); assert.equal(buildPack({}, []), null); });
t("html: escapes typed text and says it is unchecked", () => {
  const o = result.lenses[0].obligations[0], key = `${result.lenses[0].lens}:${o.id}`;
  const p = buildPack(result, [{ obligation_id: key, owner: "<script>alert(1)</script>", review_date: "2027-01-01", evidence_note: "a & b \"quoted\"" }], TODAY);
  const html = packHtml(p, { orgName: "<b>Acme</b>" });
  assert.ok(!/<script>alert/.test(html)); assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;b&gt;Acme/);
  assert.match(html, /has not checked any of it/); assert.match(html, /not legal advice/);
  assert.match(html, /<html lang="en-GB">/);
});
t("csv: quotes cells and neutralises formulas", () => {
  const o = result.lenses[0].obligations[0], key = `${result.lenses[0].lens}:${o.id}`;
  const p = buildPack(result, [{ obligation_id: key, owner: "=HYPERLINK(\"http://x\")", review_date: "", evidence_note: "line, with comma" }], TODAY);
  const csv = packCsv(p);
  assert.match(csv, /'=HYPERLINK/); assert.ok(!/(^|,)=HYPERLINK/m.test(csv)); assert.match(csv, /"line, with comma"/);
  assert.equal(csv.split("\r\n").length, p.summary.obligations + 1);
});
t("plan numbers match the database", () => {
  assert.equal(controlsAllowed("free"), 5); assert.equal(controlsAllowed("pro"), 500); assert.equal(FREE_CONTROLS, 5); assert.equal(PRO_CONTROLS, 500);
  assert.match(describeControlError("controls_free_limit"), /5 obligations/); assert.match(describeControlError("sign_in_required"), /Confirm your email/);
});
console.log(n + " checks passed");
