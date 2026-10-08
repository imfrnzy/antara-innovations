import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyAgent, assessAttackPath, summarise, nextGaps, ENGINE_VERSION, FIELDS } from "../sentinel/engine.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("PASS", name); };
const f = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v, status: v === "unknown" ? "unknown" : "confirmed" }]));
const all = (v, extra = {}) => f({ C1_irreversible_without_approval: v, C2_sees_sensitive_data: v, C3_multi_system_access: v, C4_writes_system_of_record: v, U1_untrusted_input: v, T1_named_owner: "no", T2_reconstructable: "no", T3_known_outside_team: "no", ...extra });

t("version bumped", () => assert.equal(ENGINE_VERSION, "sentinel-rules-2.0"));
t("U1 is in the checklist and in the ask order after C2", () => {
  assert.ok(FIELDS.includes("U1_untrusted_input"));
  const gaps = nextGaps({}, 8);
  assert.deepEqual(gaps.slice(0, 3), ["C1_irreversible_without_approval", "C2_sees_sensitive_data", "U1_untrusted_input"]);
});
t("all three legs yes -> OPEN", () => {
  const p = assessAttackPath(all("yes"));
  assert.equal(p.status, "OPEN");
  assert.ok(p.narrative.includes("prompt-injection"));
  assert.equal(p.break_options.length, 3);
  assert.ok(p.inferred);
});
t("any leg no -> CLOSED, says which", () => {
  for (const [field, leg] of [["U1_untrusted_input", "untrusted_input"], ["C2_sees_sensitive_data", "sensitive_data"], ["C1_irreversible_without_approval", "unapproved_action"]]) {
    const p = assessAttackPath(all("yes", { [field]: "no" }));
    assert.equal(p.status, "CLOSED", field);
    assert.deepEqual(p.closed_by, [leg]);
    assert.equal(p.break_options.length, 0);
  }
});
t("unknown legs with no 'no' -> POSSIBLE, names what is missing", () => {
  const p = assessAttackPath(all("yes", { U1_untrusted_input: "unknown" }));
  assert.equal(p.status, "POSSIBLE");
  assert.ok(p.narrative.includes("whether outside content reaches it"));
});
t("nothing known -> POSSIBLE, not OPEN and not CLOSED", () => {
  assert.equal(assessAttackPath({}).status, "POSSIBLE");
});
t("a contradiction counts as unknown, never as a confident yes", () => {
  const facts = all("yes"); facts.U1_untrusted_input = { value: "yes", status: "contradiction" };
  assert.equal(assessAttackPath(facts).status, "POSSIBLE");
});
t("closed path still mentions that writes are possible", () => {
  const p = assessAttackPath(all("yes", { C1_irreversible_without_approval: "no" }));
  assert.equal(p.status, "CLOSED"); assert.ok(p.narrative.includes("corrupt data"));
});
t("v1 zone logic is unchanged by U1", () => {
  const withU = classifyAgent(all("yes"));
  const withoutU = classifyAgent(all("yes", { U1_untrusted_input: "unknown" }));
  assert.equal(withU.zone, withoutU.zone);
  assert.equal(withU.consequence_exposure, withoutU.consequence_exposure);
  assert.equal(withU.provisional, false);
  assert.equal(withoutU.provisional, false, "unknown U1 must not make a result provisional");
});
t("old assessments without U1 still classify", () => {
  const old = f({ C1_irreversible_without_approval: "yes", C2_sees_sensitive_data: "yes", C3_multi_system_access: "yes", C4_writes_system_of_record: "yes", T1_named_owner: "no", T2_reconstructable: "no", T3_known_outside_team: "no" });
  const c = classifyAgent(old);
  assert.equal(c.zone, "EXPOSURE"); assert.equal(c.attack_path.status, "POSSIBLE");
});
t("open path moves an agent up the priority list", () => {
  const open = classifyAgent(all("yes"));
  const closed = classifyAgent(all("yes", { U1_untrusted_input: "no" }));
  assert.ok(open.priority < closed.priority);
  const s = summarise([{ name: "closed", facts: all("yes", { U1_untrusted_input: "no" }) }, { name: "open", facts: all("yes") }]);
  assert.equal(s.top.name, "open"); assert.equal(s.open_paths, 1);
});
t("reasons mention the path only when open", () => {
  assert.ok(classifyAgent(all("yes")).reasons.some((r) => r.includes("prompt-injection")));
  assert.ok(!classifyAgent(all("yes", { U1_untrusted_input: "no" })).reasons.some((r) => r.includes("prompt-injection")));
});
t("same facts in, same result out", () => {
  assert.deepEqual(classifyAgent(all("yes")), classifyAgent(JSON.parse(JSON.stringify(all("yes")))));
});
t("edge function carries an identical copy of the engine", () => {
  const eng = readFileSync("sentinel/engine.js", "utf8").replace(/^export /gm, "").trim();
  const fn = readFileSync("supabase/functions/sentinel-interview/index.ts", "utf8");
  assert.ok(fn.includes(eng), "engine copy in the edge function differs from sentinel/engine.js");
});
console.log(`\n${n} tests passed`);
