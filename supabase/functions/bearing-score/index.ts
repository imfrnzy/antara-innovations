// Bearing's examination grader. Deploy with: supabase functions deploy bearing-score
// Secrets needed: ANTHROPIC_API_KEY (and optionally BEARING_MODEL, ALLOWED_ORIGIN).
//
// This replaces self-report with an actual test, for the three questions in
// Bearing where the real risk is a capable person confidently overestimating
// their own position, not a knowledge gap a checklist could fix. The person
// writes what they would actually hand over. This function is the only
// judge of whether that holds up, graded against what the regulator itself
// has said good evidence looks like, never against the person's own belief
// that it's fine.

import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_CHARS = 1200;
const MODEL = Deno.env.get("BEARING_MODEL") ?? "claude-haiku-4-5-20251001";
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://www.antara-innovations.com";

const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// One rubric per examined question. standard is what the function grades
// against, in the regulator's own terms, not a generic "be more detailed"
// bar. Keeping this server-side, not in the public question bank, is
// deliberate: a rubric visible in page source is a rubric people write to
// pass rather than a genuine test.
const RUBRICS: Record<string, { standard: string }> = {
  q_reasonable: {
    standard: `Under SM&CR, "reasonable steps" is evidenced by dated, contemporaneous records: minutes of a specific meeting, a named challenge raised by a specific person, a dated sign-off. It is not evidenced by a description of a general process, a stated intention, or an appeal to the Senior Manager's seniority or experience. A strong answer names a specific document type, who holds it, and roughly how current it is. A weak answer describes what "should" happen, uses words like "regularly" or "as needed" with no date attached, or names a committee rather than a document.`,
  },
  q_explain: {
    standard: `FINMA's stated expectation is that a named person could explain a specific AI-assisted result in terms a client or auditor would follow, covering what data or factors drove the result and why. A strong answer names who would write the explanation and roughly what it would contain, in plain terms. A weak answer refers to vendor documentation nobody in the firm has read, asserts the system is "explainable" without saying by whom or how, or describes a technical audit log that a client could not actually follow.`,
  },
  q_understanding: {
    standard: `Consumer Duty is judged on customer comprehension, not drafting quality. A strong answer describes an actual test of comprehension with real customers or a close proxy, such as user testing, complaint-pattern analysis showing confusion, or readability testing against a defined standard, and what it found. A weak answer asserts the writing is "clear" or "in plain English" based on the firm's own judgement, with no test of whether a customer actually understood it.`,
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Sign in again to continue." }, 401);

  let body: { question_id?: string; question_text?: string; response_text?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  const questionId = (body.question_id ?? "").toString();
  const questionText = (body.question_text ?? "").toString().slice(0, 600);
  const responseText = (body.response_text ?? "").toString().trim().slice(0, MAX_CHARS);
  const rubric = RUBRICS[questionId];
  if (!rubric) return json({ error: "Unknown question." }, 400);
  if (responseText.length < 15) return json({ error: "Write a specific answer first." }, 400);

  const SYSTEM = `You are grading one written answer for Bearing, a regulatory readiness instrument built by Antara Innovations. You are not a coach and you are not encouraging. You are the test.

The person was asked a specific question about what they would actually be able to produce if a regulator asked. Grade their written answer against the standard below, which reflects what the regulator itself has said counts as evidence, not general good practice.

STANDARD FOR THIS QUESTION
${rubric.standard}

GRADING RULES
- band "evidence": the answer names something specific and dated or attributable to a specific person or document, consistent with the standard.
- band "partly": the answer gestures at something real but is vague on who, what document, or how current it is, or describes something that would take time to assemble rather than being ready now.
- band "no": the answer describes an intention, a general process, a committee, or a belief, with nothing specific enough to hand to a regulator today. This also covers answers that are evasive, off-topic, or that restate the question without answering it.
- Never award "evidence" for confidence alone. Award it only for specificity that matches the standard.

CRITIQUE
Write one to two sentences, direct and specific to what they actually wrote, not a generic template. Name exactly what is missing or what would be asked next. Do not soften the finding and do not add encouragement. Do not use the word "unfortunately". Write in British English.`;

  const TOOL = {
    name: "grade_answer",
    description: "Return the grading band and a specific critique of the written answer.",
    input_schema: {
      type: "object",
      properties: {
        band: { type: "string", enum: ["evidence", "partly", "no"] },
        critique: { type: "string" },
      },
      required: ["band", "critique"],
    },
  };

  const prompt = `QUESTION ASKED\n${questionText}\n\nPERSON'S WRITTEN ANSWER\n${responseText}\n\nGrade this now.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
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
