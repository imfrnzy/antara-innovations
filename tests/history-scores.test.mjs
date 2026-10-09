import assert from "node:assert/strict";
import { classify as keelClassify } from "../keel/engine.js";
import { classify as haloClassify, DIM_LABEL as HALO_DIM } from "../halo/engine.js";
import { assess as bearingAssess, selectQuestions } from "../tools/bearing/engine.js";
import { assess as squallAssess, scenariosFor } from "../tools/squall/engine.js";
import { assess as ensignAssess } from "../tools/ensign/engine.js";
import { SCENARIOS as ENS } from "../tools/ensign/scenarios.js";
import { snapshotKeel, snapshotHalo, snapshotBearing, snapshotSquall, snapshotEnsign, diffScores, compare, trend } from "../assets/history.js";

let n = 0; const t = (name, fn) => { fn(); n++; console.log("PASS", name); };
const F = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));
const KEEL_LABEL = { R1_sponsorship: "Sponsorship", R2_team: "Minimum viable team", R3_portfolio: "Portfolio discipline", R4_risk_gate: "Risk gate", R5_testing_monitoring: "Testing and monitoring", R6_benefits_proof: "Benefits proof" };

t("Keel: a better quarter shows what moved, and the snapshot holds no answers", () => {
  const a = snapshotKeel(keelClassify(F({ R1_sponsorship: "absent", R2_team: "partial", OM1_regulatory_exposure: "high", OM2_existing_capability: "low", OM3_spend_model: "high" })), KEEL_LABEL);
  const b = snapshotKeel(keelClassify(F({ R1_sponsorship: "established", R2_team: "established", OM1_regulatory_exposure: "high", OM2_existing_capability: "low", OM3_spend_model: "high" })), KEEL_LABEL);
  assert.equal(a.kind, "scores"); assert.equal(a.tool, "keel");
  const d = diffScores(a, b);
  assert.ok(d.better >= 2, d.headline);
  assert.equal(d.worse, 0);
  assert.ok(d.changes.some((c) => /Sponsorship/.test(c.text) && c.tone === "better"));
  assert.match(JSON.stringify(a), /Operating model/);
  assert.ok(JSON.stringify(a).length < 4000);
});
t("Keel: same result twice says nothing changed", () => {
  const a = snapshotKeel(keelClassify(F({ R1_sponsorship: "partial" })), KEEL_LABEL);
  const d = compare(a, a);
  assert.equal(d.changes.length, 0); assert.match(d.headline, /Nothing has changed/);
});
t("Keel: an operating model change is reported as information, not good or bad", () => {
  const a = snapshotKeel(keelClassify(F({ OM1_regulatory_exposure: "high", OM2_existing_capability: "low", OM3_spend_model: "high" })), KEEL_LABEL);
  const b = snapshotKeel(keelClassify(F({ OM1_regulatory_exposure: "low", OM2_existing_capability: "high", OM3_spend_model: "low" })), KEEL_LABEL);
  const d = diffScores(a, b);
  const c = d.changes.find((x) => x.type === "headline");
  assert.ok(c && c.tone === "info");
});
t("HALO: counts established practices and finds slips", () => {
  const good = snapshotHalo(haloClassify(F({ R1_clarity: "established", R2_acknowledgement: "established" })), HALO_DIM);
  const worse = snapshotHalo(haloClassify(F({ R1_clarity: "established", R2_acknowledgement: "absent" })), HALO_DIM);
  const d = diffScores(good, worse);
  assert.ok(d.worse >= 1);
  assert.ok(d.changes.some((c) => c.type === "item" && c.tone === "worse"));
});
const profile = { jurisdictions: ["uk", "ch"], sector: "insurer", size: "mid", uses: ["claims"] };
const all = (value) => Object.fromEntries(selectQuestions(profile).map((q) => [q.id, q.type === "written" ? { value, text: "secret words", critique: "y" } : value]));
t("Bearing: obligations that move from not yet to ready are found, free text never saved", () => {
  const a = snapshotBearing(bearingAssess(profile, all("no")));
  const b = snapshotBearing(bearingAssess(profile, all("evidence")));
  assert.equal(a.tool, "bearing");
  assert.ok(a.items.length > 5 && a.measures.length === 2);
  const d = diffScores(a, b);
  assert.ok(d.better > 5 && d.worse === 0, d.headline);
  assert.ok(d.changes.some((c) => c.type === "headline" && c.tone === "better"));
  assert.ok(!/secret words/.test(JSON.stringify(a)));
  assert.ok(JSON.stringify(b).length < 50000, "fits the database size limit");
  const back = diffScores(b, a);
  assert.ok(back.worse > 5 && back.better === 0);
});
t("Bearing: adding a country adds items, does not break the comparison", () => {
  const p2 = { ...profile, jurisdictions: ["uk", "ch", "eu"] };
  const a = snapshotBearing(bearingAssess(profile, all("evidence")));
  const ans2 = Object.fromEntries(selectQuestions(p2).map((q) => [q.id, q.type === "written" ? { value: "evidence", text: "x", critique: "y" } : "evidence"]));
  const b = snapshotBearing(bearingAssess(p2, ans2));
  const d = diffScores(a, b);
  assert.ok(!d.error);
  assert.ok(d.changes.some((c) => c.type === "item-new" || c.type === "measure-new"));
});
const squallAnswers = (mod, rightEvery) => scenariosFor(mod).map((s, i) => ({ scenarioId: s.id, decision: i % rightEvery === 0 ? s.truth : (s.truth === "fake" ? "genuine" : "fake"), confidence: "high", timedOut: false }));
t("Squall: score and per-type scores compare, with the module kept", () => {
  const a = snapshotSquall(squallAssess("bank", squallAnswers("bank", 3)));
  const b = snapshotSquall(squallAssess("bank", squallAnswers("bank", 1)));
  assert.equal(b.headline.value, 100);
  const d = diffScores(a, b);
  assert.ok(d.better >= 1 && d.worse === 0, d.headline);
  assert.match(d.changes[0].text, /Spotted correctly/);
});
t("Ensign: score compares and the written reply is not stored", () => {
  const resp = (ok) => ENS.map((s) => ({ scenarioId: s.id, decision: ok ? s.truth : "escalate", confidence: "low", timedOut: false }));
  const a = snapshotEnsign(ensignAssess(resp(false), { band: "no", critique: "private critique text" }));
  const b = snapshotEnsign(ensignAssess(resp(true), { band: "evidence", critique: "private critique text" }));
  const d = diffScores(a, b);
  assert.ok(d.better >= 1);
  assert.ok(!/private critique/.test(JSON.stringify(a) + JSON.stringify(b)));
});
t("different tools or kinds refuse to compare", () => {
  const k = snapshotKeel(keelClassify(F({})), KEEL_LABEL), h = snapshotHalo(haloClassify(F({})), HALO_DIM);
  assert.ok(diffScores(k, h).error);
  assert.ok(compare({ kind: "records", tools: [] }, k).error);
});
t("bad input gives null, not a crash", () => {
  assert.equal(snapshotKeel(null), null); assert.equal(snapshotHalo({}), null);
  assert.equal(snapshotBearing(undefined), null); assert.equal(snapshotSquall({}), null); assert.equal(snapshotEnsign(null), null);
});
t("timeline gives one point per saved result", () => {
  const mk = (p) => ({ ...snapshotSquall(squallAssess("bank", squallAnswers("bank", p))), at: "2026-01-01" });
  const tr = trend([mk(3), mk(1)]);
  assert.equal(tr.length, 2); assert.ok(tr[1].value > tr[0].value);
  const k = { ...snapshotKeel(keelClassify(F({ R1_sponsorship: "established" })), KEEL_LABEL), at: "x" };
  assert.ok(Number.isFinite(trend([k])[0].value));
});
console.log(n + " checks passed");
