import assert from "node:assert/strict";
import { fundingStatus, scoreTrack, flagsFor, sortCheckins } from "../tools/manifest/agent-rules.js";

let n = 0; const t = (name, fn) => { fn(); n++; console.log("PASS", name); };
const client = (o = {}) => ({ sessions_authorised: 6, sessions_done_before: 0, phq9_baseline: 16, gad7_baseline: 13, ...o });
const ci = (i, d, phq9 = null, gad7 = null) => ({ id: "c" + i, session_date: d, phq9, gad7, created_at: "2026-01-01T00:00:0" + i });

t("funding: 6 authorised, 0 used = 6 left, ok", () => {
  const f = fundingStatus(client(), []); assert.equal(f.left, 6); assert.equal(f.level, "ok"); });
t("funding: counts sessions held before logging started", () => {
  const f = fundingStatus(client({ sessions_done_before: 4 }), [ci(1, "2026-02-01"), ci(2, "2026-02-08")]); assert.equal(f.used, 6); assert.equal(f.left, 0); assert.equal(f.level, "out"); });
t("funding: 2 left is low, 3 left is ok, 1 left is low, 0 is out, over is out", () => {
  const mk = (k) => fundingStatus(client(), Array.from({ length: k }, (_, i) => ci(i, "2026-02-0" + (i + 1))));
  assert.equal(mk(3).level, "ok"); assert.equal(mk(4).level, "low"); assert.equal(mk(5).level, "low"); assert.equal(mk(6).level, "out"); assert.equal(mk(7).level, "out"); assert.equal(mk(7).left, -1); });
t("flags: ok state raises nothing", () => { assert.deepEqual(flagsFor(client(), [ci(1, "2026-02-01", 14, 12)]), []); });
t("flags: low funding raises one amber, keyed to the authorisation", () => {
  const f = flagsFor(client(), Array.from({ length: 4 }, (_, i) => ci(i, "2026-02-0" + (i + 1)))); assert.equal(f.length, 1); assert.equal(f[0].kind, "funding_low"); assert.equal(f[0].key, "low-6"); assert.equal(f[0].severity, "amber"); });
t("flags: new authorisation changes the key so a fresh warning can fire later", () => {
  const a = flagsFor(client({ sessions_authorised: 6 }), Array.from({ length: 5 }, (_, i) => ci(i, "2026-02-0" + (i + 1))));
  const b = flagsFor(client({ sessions_authorised: 12 }), Array.from({ length: 11 }, (_, i) => ci(i, "2026-02-" + String(i + 1).padStart(2, "0"))));
  assert.notEqual(a[0].key, b[0].key); });
t("scores: deterioration needs the full threshold (PHQ-9 +6), +5 is not enough", () => {
  const c = client({ phq9_baseline: 10, gad7_baseline: null });
  assert.equal(scoreTrack(c, [ci(1, "2026-02-01", 15)]).phq9.reliableDeterioration, false);
  assert.equal(scoreTrack(c, [ci(1, "2026-02-01", 16)]).phq9.reliableDeterioration, true); });
t("scores: improvement needs the full threshold (GAD-7 -4)", () => {
  const c = client({ phq9_baseline: null, gad7_baseline: 12 });
  assert.equal(scoreTrack(c, [ci(1, "2026-02-01", null, 9)]).gad7.reliableImprovement, false);
  assert.equal(scoreTrack(c, [ci(1, "2026-02-01", null, 8)]).gad7.reliableImprovement, true); });
t("scores: uses the most recent reading, whatever order they arrive in", () => {
  const c = client({ phq9_baseline: 20, gad7_baseline: null });
  const tr = scoreTrack(c, [ci(2, "2026-03-01", 8), ci(1, "2026-02-01", 18)]); assert.equal(tr.phq9.latest, 8); });
t("scores: no stored baseline, first scored check-in stands in and is not double counted", () => {
  const c = client({ phq9_baseline: null, gad7_baseline: null });
  assert.equal(scoreTrack(c, [ci(1, "2026-02-01", 18)]).phq9, null);
  const tr = scoreTrack(c, [ci(1, "2026-02-01", 18), ci(2, "2026-02-08", 11)]); assert.equal(tr.phq9.baseline, 18); assert.equal(tr.phq9.latest, 11); assert.equal(tr.phq9.readings, 1); });
t("flags: reliable deterioration raises a red flag keyed to the latest scored session", () => {
  const f = flagsFor(client({ gad7_baseline: null }), [ci(1, "2026-02-01", 23)]); const w = f.find((x) => x.kind === "scores_worse");
  assert.ok(w); assert.equal(w.severity, "red"); assert.equal(w.key, "worse-c1"); });
t("flags: flat run only after 4 scored readings, and not when improving", () => {
  const flat = (k) => Array.from({ length: k }, (_, i) => ci(i + 1, "2026-02-0" + (i + 1), 15, 12));
  assert.equal(flagsFor(client(), flat(3)).some((f) => f.kind === "scores_flat"), false);
  assert.equal(flagsFor(client(), flat(4)).some((f) => f.kind === "scores_flat"), true);
  const improving = [ci(1, "2026-02-01", 14, 11), ci(2, "2026-02-02", 12, 10), ci(3, "2026-02-03", 11, 9), ci(4, "2026-02-04", 9, 8)];
  assert.equal(flagsFor(client(), improving).some((f) => f.kind === "scores_flat"), false); });
t("flags: flat alert re-keys every 2 readings, never every night", () => {
  const flat = (k) => Array.from({ length: k }, (_, i) => ci(i + 1, "2026-02-" + String(i + 1).padStart(2, "0"), 15, 12));
  const key = (k) => flagsFor(client({ sessions_authorised: 40 }), flat(k)).find((f) => f.kind === "scores_flat").key;
  assert.equal(key(4), key(4)); assert.equal(key(4), "flat-4"); assert.equal(key(5), "flat-4"); assert.equal(key(6), "flat-6"); });
t("flags: deterioration suppresses the flat alert", () => {
  const f = flagsFor(client({ gad7_baseline: null, phq9_baseline: 8 }), [ci(1, "d1".replace("d", "2026-02-0"), 15), ci(2, "2026-02-02", 16), ci(3, "2026-02-03", 16), ci(4, "2026-02-04", 17)]);
  assert.ok(f.some((x) => x.kind === "scores_worse")); assert.equal(f.some((x) => x.kind === "scores_flat"), false); });
t("flags: texts never contain a client name field, only counts and scores", () => {
  const f = flagsFor(client({ client_ref: "A-07" }), Array.from({ length: 5 }, (_, i) => ci(i, "2026-02-0" + (i + 1), 15, 12)));
  f.forEach((x) => assert.equal(x.text.includes("A-07"), false)); });
t("sortCheckins is stable and does not mutate input", () => {
  const a = [ci(2, "2026-03-01"), ci(1, "2026-02-01")]; const s = sortCheckins(a); assert.equal(s[0].id, "c1"); assert.equal(a[0].id, "c2"); });
console.log(`\n${n} passed`);
