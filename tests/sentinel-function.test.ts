// Runs the real supabase/functions/sentinel-interview/index.ts file with a fake database
// and a fake model. Nothing is changed in the function to make it testable.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { makeFakeSupabase } from "./fake-db.ts";
import { world } from "./fake-module.ts";

let handler: (r: Request) => Promise<Response>;
(Deno as any).serve = (h: any) => { handler = h; return {}; };
for (const [k, v] of Object.entries({ SUPABASE_URL: "http://x", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", ANTHROPIC_API_KEY: "ak", ALLOWED_ORIGIN: "https://t.test" })) Deno.env.set(k, v);

let modelReplies: any[] = [];
let modelRequests: any[] = [];
globalThis.fetch = (async (_u: any, init: any) => {
  modelRequests.push(JSON.parse(init.body));
  const out = modelReplies.shift() ?? { facts: [], next_question: "Anything else?", why_asking: "w", done: false };
  return new Response(JSON.stringify({ content: [{ type: "tool_use", name: "record_and_ask", input: out }] }), { status: 200 });
}) as any;

const users = { u1: { id: "u1" }, u2: { id: "u2" } };
function setup(extra: any = {}) {
  world.fake = makeFakeSupabase({
    sentinel_assessments: [{ id: "a1", user_id: "u1", status: "in_progress", turn_count: 0, sentinel_organisations: { name: "Marlow Mutual", industry: "Insurance", size_band: "250 to 999" }, ...extra }],
    sentinel_agents: [], sentinel_evidence: [], sentinel_interactions: [],
  }, { users });
  modelReplies = []; modelRequests = [];
  return world.fake;
}
await import("../supabase/functions/sentinel-interview/index.ts");
const call = (body: any, user = "u1") => handler(new Request("http://f", { method: "POST", headers: { Authorization: `Bearer ${user}.x.y` }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, json: await r.json() }));

Deno.test("start returns the opening question", async () => {
  setup();
  const r = await call({ assessment_id: "a1", action: "start" });
  assertEquals(r.status, 200); assertStringIncludes(r.json.question, "What AI agents"); assertEquals(r.json.done, false);
});
Deno.test("someone else's assessment is refused", async () => {
  setup();
  const r = await call({ assessment_id: "a1", action: "start" }, "u2");
  assertEquals(r.status, 404);
});
Deno.test("the model is told about the new fact and the rule for it", async () => {
  setup();
  modelReplies = [{ new_agents: [{ name: "Claims agent" }], facts: [], next_question: "Q?", why_asking: "w", done: false }];
  await call({ assessment_id: "a1", action: "answer", message: "We have a claims agent" });
  const req = modelRequests[0];
  assert(req.tools[0].input_schema.properties.facts.items.properties.field.enum.includes("U1_untrusted_input"));
  assertStringIncludes(req.system, "U1_untrusted_input");
  assertStringIncludes(req.system, "A queue that customers feed");
});
Deno.test("an open attack path is classified, stored, and counted in the summary", async () => {
  const fake = setup();
  modelReplies = [{
    new_agents: [{ name: "Claims agent" }],
    facts: [
      { agent: "Claims agent", field: "C1_irreversible_without_approval", value: "yes", quote: "it pays out under 500 on its own" },
      { agent: "Claims agent", field: "C2_sees_sensitive_data", value: "yes", quote: "bank details" },
      { agent: "Claims agent", field: "U1_untrusted_input", value: "yes", quote: "reads mail from anyone" },
    ],
    next_question: "Is it connected to more than one system?", why_asking: "w", done: false,
  }];
  const r = await call({ assessment_id: "a1", action: "answer", message: "it pays out on its own" });
  assertEquals(r.status, 200);
  const agent = fake.tables.sentinel_agents[0];
  assertEquals(agent.classification.engine, "sentinel-rules-2.0");
  assertEquals(agent.classification.attack_path.status, "OPEN");
  assertEquals(agent.facts.U1_untrusted_input.value, "yes");
  const fin = await call({ assessment_id: "a1", action: "finish" });
  assertEquals(fin.json.done, true); assertEquals(fin.json.summary.open_paths, 1); assertEquals(fin.json.summary.exposure, 1);
  assertEquals(fake.tables.sentinel_assessments[0].engine_version, "sentinel-rules-2.0");
});
Deno.test("an invented field name from the model is ignored", async () => {
  const fake = setup();
  modelReplies = [{ new_agents: [{ name: "A" }], facts: [{ agent: "A", field: "X9_made_up", value: "yes", quote: "q" }], next_question: "Q?", why_asking: "w", done: false }];
  await call({ assessment_id: "a1", action: "answer", message: "hello" });
  assertEquals(Object.keys(fake.tables.sentinel_agents[0].facts ?? {}).length, 0);
});
Deno.test("the interview cannot be ended early by the model", async () => {
  setup();
  modelReplies = [{ new_agents: [{ name: "A" }], facts: [], next_question: "Still going?", why_asking: "w", done: true }];
  const r = await call({ assessment_id: "a1", action: "answer", message: "hello" });
  assertEquals(r.json.done, false);
});
Deno.test("U1 is asked after C2 and before C3", async () => {
  const fake = setup();
  modelReplies = [{
    new_agents: [{ name: "A" }],
    facts: [{ agent: "A", field: "C1_irreversible_without_approval", value: "no", quote: "q" }, { agent: "A", field: "C2_sees_sensitive_data", value: "no", quote: "q" }],
    next_question: "Q?", why_asking: "w", done: false,
  }];
  await call({ assessment_id: "a1", action: "answer", message: "hello" });
  await call({ assessment_id: "a1", action: "answer", message: "again" });
  const prompt = modelRequests[1].messages[0].content;
  assertStringIncludes(prompt, "gaps in order: U1_untrusted_input, C3_multi_system_access, C4_writes_system_of_record");
});

Deno.test("repeat guard: a question that repeats an earlier one is retried once, then the interview wraps up", async () => {
  const fake = setup();
  fake.tables.sentinel_interactions.push({ id: 1, assessment_id: "a1", user_id: "u1", role: "assistant", content: "Who is the named owner of the support inbox triage agent? If something goes wrong with it, who would you call first?", meta: {} });
  const same = { facts: [], next_question: "Who would you call first if something went wrong with the support inbox triage agent, who is the named owner?", why_asking: "w", done: false };
  modelReplies = [{ new_agents: [{ name: "Inbox agent" }], ...same }, { ...same }];
  const r = await call({ assessment_id: "a1", action: "answer", message: "Not sure" });
  assertEquals(r.status, 200);
  assertEquals(r.json.done, true);
  assertEquals(modelRequests.length, 2);
  assertStringIncludes(modelRequests[1].messages[0].content, "repeats one that was already asked");
});
Deno.test("repeat guard: if the retry asks something different, that question is shown", async () => {
  const fake = setup();
  fake.tables.sentinel_interactions.push({ id: 1, assessment_id: "a1", user_id: "u1", role: "assistant", content: "Who is the named owner of the support inbox triage agent? If something goes wrong with it, who would you call first?", meta: {} });
  modelReplies = [
    { new_agents: [{ name: "Inbox agent" }], facts: [], next_question: "Who would you call first if something went wrong with the support inbox triage agent, who is the named owner?", why_asking: "w", done: false },
    { facts: [], next_question: "Does the agent read messages that come from people outside the company?", why_asking: "Outside input is the main way agents get tricked.", done: false },
  ];
  const r = await call({ assessment_id: "a1", action: "answer", message: "Not sure" });
  assertEquals(r.json.done, false);
  assertStringIncludes(r.json.question, "outside the company");
});

Deno.test("fact values are read whatever the capitalisation the model used", async () => {
  const fake = setup();
  modelReplies = [{
    new_agents: [{ name: "Claims agent" }],
    facts: [{ agent: "Claims agent", field: "C2_sees_sensitive_data", value: "Yes.", quote: "bank details" }],
    next_question: "Is it connected to more than one system?", why_asking: "w", done: false,
  }];
  await call({ assessment_id: "a1", action: "answer", message: "It sees bank details" });
  const row = fake.tables.sentinel_agents.find((x: any) => x.name === "Claims agent");
  assertEquals(row.facts.C2_sees_sensitive_data.value, "yes");
});

Deno.test("a malformed facts list from the model does not crash the interview", async () => {
  setup();
  modelReplies = [{ new_agents: [{ name: "Claims agent" }], facts: "[{\"agent\": \"Claims agent\"", next_question: "Does it read outside mail?", why_asking: "w", done: false }];
  const r = await call({ assessment_id: "a1", action: "answer", message: "We have a claims agent" });
  assertEquals(r.status, 200);
  assertStringIncludes(r.json.question, "outside mail");
});
