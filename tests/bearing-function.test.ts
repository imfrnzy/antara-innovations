import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { makeFakeSupabase } from "./fake-db.ts";
import { world } from "./fake-module.ts";
import { QUESTIONS } from "../tools/bearing/questions.js";

let handler: (r: Request) => Promise<Response>;
(Deno as any).serve = (h: any) => { handler = h; return {}; };
for (const [k, v] of Object.entries({ SUPABASE_URL: "http://x", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", ANTHROPIC_API_KEY: "ak" })) Deno.env.set(k, v);
let seen: any[] = [];
globalThis.fetch = (async (_u: any, init: any) => {
  seen.push(JSON.parse(init.body));
  return new Response(JSON.stringify({ content: [{ type: "tool_use", name: "grade_answer", input: { band: "partly", critique: "No date." } }] }), { status: 200 });
}) as any;
world.fake = makeFakeSupabase({}, { users: { u1: { id: "u1" } } });
await import("../supabase/functions/bearing-score/index.ts");
const call = (body: any, user = "u1") => handler(new Request("http://f", { method: "POST", headers: { Authorization: `Bearer ${user}.x.y` }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, json: await r.json() }));

const plain = QUESTIONS.filter((q: any) => q.type !== "written").map((q: any) => q.id);
const written = QUESTIONS.filter((q: any) => q.type === "written").map((q: any) => q.id);

Deno.test("every plain question has a document request, written ones do not", async () => {
  for (const id of plain) { const r = await call({ mode: "ask", question_id: id }); assertEquals(r.status, 200, id); assert(r.json.request.length > 40, id); }
  for (const id of written) assertEquals((await call({ mode: "ask", question_id: id })).status, 400);
});
Deno.test("ask needs a signed-in user and calls no model", async () => {
  seen = [];
  assertEquals((await call({ mode: "ask", question_id: "q_smf" }, "nobody")).status, 401);
  await call({ mode: "ask", question_id: "q_smf" });
  assertEquals(seen.length, 0);
});
Deno.test("supervisor grading uses the server-side request and standard", async () => {
  seen = [];
  const r = await call({ mode: "supervisor", question_id: "q_smf", response_text: "The SMF24 statement, paragraph 4, updated in March." });
  assertEquals(r.status, 200); assertEquals(r.json.band, "partly");
  assertStringIncludes(seen[0].system, "names the Senior Manager role");
  assertStringIncludes(seen[0].messages[0].content, "Send me the Statement of Responsibilities");
});
Deno.test("supervisor mode rejects short answers, unknown modes and written questions", async () => {
  assertEquals((await call({ mode: "supervisor", question_id: "q_smf", response_text: "yes" })).status, 400);
  assertEquals((await call({ mode: "bogus", question_id: "q_smf", response_text: "long enough answer here" })).status, 400);
  assertEquals((await call({ mode: "supervisor", question_id: "q_reasonable", response_text: "long enough answer here" })).status, 400);
});
Deno.test("the original written-question grading still works", async () => {
  seen = [];
  const r = await call({ question_id: "q_reasonable", question_text: "Q", response_text: "The minutes of the March committee meeting held by the company secretary." });
  assertEquals(r.status, 200); assertEquals(r.json.band, "partly");
});
