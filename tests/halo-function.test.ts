// Runs the real halo-interview function with a fake database and a fake model, for the report guard.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { makeFakeSupabase } from "./fake-db.ts";
import { world } from "./fake-module.ts";

let handler: (r: Request) => Promise<Response>;
(Deno as any).serve = (h: any) => { handler = h; return {}; };
for (const [k, v] of Object.entries({ SUPABASE_URL: "http://x", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", ANTHROPIC_API_KEY: "ak", ALLOWED_ORIGIN: "https://t.test" })) Deno.env.set(k, v);

let replies: any[] = [];
let requests: any[] = [];
globalThis.fetch = (async (_u: any, init: any) => {
  requests.push(JSON.parse(init.body));
  const next = replies.shift() ?? "";
  const block = typeof next === "object" ? { type: "tool_use", input: next } : { type: "text", text: next };
  return new Response(JSON.stringify({ content: [block] }), { status: 200 });
}) as any;

const readiness = [
  { field: "R1_clarity", label: "Clarity", level: 2, status: "Established", provisional: false },
  { field: "R5_weekly_checkin", label: "Weekly check-in", level: 0, status: "Absent", provisional: false },
];
const classification = { readiness, weakest_dimension: readiness[1], established_count: 1, total_dimensions: 7 };
function setup() {
  world.fake = makeFakeSupabase({
    halo_assessments: [{ id: "a1", user_id: "u1", status: "complete", classification, team_size: "6", tenure: "2 years", report_md: null }],
    halo_profiles: [{ user_id: "u1", first_name: "Ann", job_title: "Head of Claims" }],
    halo_evidence: [{ assessment_id: "a1", field: "R1_clarity", value: "established", quote: "I told Priya on Tuesday the budget call came from above me", created_at: "1" }],
  }, { users: { u1: { id: "u1" } } });
  replies = []; requests = [];
  return world.fake;
}
await import("../supabase/functions/halo-interview/index.ts");
const call = (body: any) => handler(new Request("http://f", { method: "POST", headers: { Authorization: "Bearer u1.x.y" }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, json: await r.json() }));

const good = "## Where you stand today\nClarity is strong. You said \"I told Priya on Tuesday the budget call came from above me\". 1 of 7 standards are established.\n\n## Fix this one first\nWeekly check-in is the gap. Book one this week with each person, no agenda about their tasks, and keep it to twenty minutes.\n\n## Then build the rhythm\nDaily two minute signal check. Keep it small and keep it regular so it survives a busy week and a bad one.";
const invented = good.replace("I told Priya on Tuesday the budget call came from above me", "I always sit down with the whole team after every single decision");

Deno.test("a faithful report is stored as written", async () => {
  const fake = setup(); replies = [good];
  const r = await call({ assessment_id: "a1", action: "generate_report" });
  assertEquals(r.status, 200); assertEquals(r.json.report_md, good); assertEquals(requests.length, 1);
  assertEquals(fake.tables.halo_assessments[0].report_md, good);
});
Deno.test("an invented quote is sent back once, then the corrected draft is used", async () => {
  setup(); replies = [invented, good];
  const r = await call({ assessment_id: "a1", action: "generate_report" });
  assertEquals(r.json.report_md, good); assertEquals(requests.length, 2);
  assertStringIncludes(requests[1].messages[0].content, "failed these checks");
  assertStringIncludes(requests[1].messages[0].content, "not one of their own words");
});
Deno.test("two bad drafts give the plain accurate fallback, never the bad text", async () => {
  setup(); replies = [invented, invented];
  const r = await call({ assessment_id: "a1", action: "generate_report" });
  assert(!r.json.report_md.includes("sit down with the whole team"));
  assertStringIncludes(r.json.report_md, "1 of 7 standards are established");
  assertStringIncludes(r.json.report_md, "Weekly check-in");
});

const suggested = good.replace("keep it to twenty minutes.", 'keep it to twenty minutes. A good opener is "How are things actually feeling for you this week?" and then stop talking.');
Deno.test("wording the report only suggests does not trip the guard (live finding 8 Oct 2026)", async () => {
  setup(); replies = [suggested];
  const r = await call({ assessment_id: "a1", action: "generate_report" });
  assertEquals(requests.length, 1); assertEquals(r.json.report_md, suggested);
});
Deno.test("evidence that is not the leader's own words is stored as a note and sent to the writer marked NOTE", async () => {
  const fake = world.fake = makeFakeSupabase({
    halo_assessments: [{ id: "a2", user_id: "u1", status: "in_progress", turn_count: 1, facts: {}, team_size: "6", tenure: "2 years" }],
    halo_profiles: [{ user_id: "u1", first_name: "Ann", job_title: "Head of Claims" }],
    halo_interactions: [{ id: 1, assessment_id: "a2", role: "assistant", content: "Tell me about the last time something landed badly." }],
    halo_evidence: [],
  }, { users: { u1: { id: "u1" } } });
  requests = [];
  replies = [{ facts: [
    { field: "R2_acknowledgement", value: "established", quote: "I apologised in the channel that morning" },
    { field: "R3_decision_transparency", value: "absent", quote: "Person did not give a specific recent decision" },
  ], next_question: "Can you think of another time?", why_asking: "One story could be a good day.", done: false }];
  const r = await call({ assessment_id: "a2", action: "answer", message: "I apologised in the channel that morning and moved the deadline back two days." });
  assertEquals(r.status, 200);
  const rows = fake.tables.halo_evidence;
  assertEquals(rows.find((x: any) => x.field === "R2_acknowledgement").quote, "I apologised in the channel that morning");
  assertEquals(rows.find((x: any) => x.field === "R3_decision_transparency").quote, "[note] Person did not give a specific recent decision");
  // and the report writer is told which is which
  fake.tables.halo_assessments[0].status = "complete"; fake.tables.halo_assessments[0].classification = classification;
  replies = [good.replace("I told Priya on Tuesday the budget call came from above me", "I apologised in the channel that morning")]; requests = [];
  const rep = await call({ assessment_id: "a2", action: "generate_report" });
  assertEquals(rep.status, 200); assertEquals(requests.length, 1);
  const sent = requests[0].messages[0].content;
  assertStringIncludes(sent, '"I apologised in the channel that morning"');
  assertStringIncludes(sent, "NOTE (the interviewer's summary");
});
