// Ensign's grading function. Deploy with: supabase functions deploy ensign-score
// Secrets needed: ANTHROPIC_API_KEY (and optionally ENSIGN_MODEL, ALLOWED_ORIGIN).
//
// One question, one rubric. The person is asked to write what they'd
// actually send a client to justify a no-disclosure decision. This grades
// whether they named a real, specific basis, not whether they sound sure
// of themselves.

import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_CHARS = 1200;
const MODEL = Deno.env.get("ENSIGN_MODEL") ?? "claude-haiku-4-5-20251001";
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://www.antara-innovations.com";

const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const STANDARD = `A defensible written answer names one specific, real basis for the no-disclosure decision: that the content had genuine human editorial review with a named person taking responsibility for it (the Article 50 exemption), or that the content is not public-facing (internal only, never published), or another specific, checkable fact of that kind. A weak answer asserts confidence, "we checked and it's fine", "our process is thorough", "the client is happy with it", without naming which basis actually applies, or names a basis that doesn't fit the facts (for example, claiming editorial review for something no one actually reviewed).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Sign in again to continue." }, 401);

  let body: { question_text?: string; response_text?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  const questionText = (body.question_text ?? "").toString().slice(0, 600);
  const responseText = (body.response_text ?? "").toString().trim().slice(0, MAX_CHARS);
  if (responseText.length < 15) return json({ error: "Write a specific answer first." }, 400);

  const SYSTEM = `You are grading one written answer for Ensign, an AI-disclosure readiness instrument built by Antara Innovations. You are not a coach and you are not encouraging. You are the test.

The person was asked what they would actually send a client to justify a decision not to disclose AI use on a specific asset. Grade their answer against the standard below.

STANDARD
${STANDARD}

GRADING RULES
- band "evidence": names a specific, real, checkable basis that would actually hold up.
- band "partly": gestures at something real but is vague about which basis applies, or names a basis without the detail that would make it checkable.
- band "no": asserts confidence or process with no specific, checkable basis, is evasive, or names a basis inconsistent with the facts given.
- Never award "evidence" for confident tone alone.

CRITIQUE
One to two sentences, direct and specific to what they actually wrote. Name exactly what basis is missing or unclear. Do not soften the finding. Write in British English.`;

  const TOOL = {
    name: "grade_answer",
    description: "Return the grading band and a specific critique of the written answer.",
    input_schema: {
      type: "object",
      properties: { band: { type: "string", enum: ["evidence", "partly", "no"] }, critique: { type: "string" } },
      required: ["band", "critique"],
    },
  };

  const prompt = `QUESTION ASKED\n${questionText}\n\nPERSON'S WRITTEN ANSWER\n${responseText}\n\nGrade this now.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 400, system: SYSTEM,
        tools: [TOOL], tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await r.json();
    const out = data?.content?.find((b: any) => b.type === "tool_use")?.input;
    if (!out || !out.band || !out.critique) throw new Error(JSON.stringify(data).slice(0, 300));
    return json({ band: out.band, critique: String(out.critique).slice(0, 500) });
  } catch (e) {
    console.error("grading error", e);
    return json({ error: "Couldn't reach the grader. Try again, or answer directly instead." }, 502);
  }
});
