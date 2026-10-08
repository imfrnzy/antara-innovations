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
  q_investment_oversight: {
    standard: `The FCA's stated position is that firms cannot rely on "the black box made the decision" as a defence for an AI-influenced investment decision. A strong answer names who reviewed the AI-flagged position, roughly when, and what they actually checked, the reasoning behind the flag, the data behind it, or its fit against the client's mandate, with something that could be produced as a record. A weak answer describes a general review process with no named reviewer or record tied to this specific kind of decision, asserts the model is well-tested or validated as a substitute for human review of the individual decision, or implies the position went in without anyone specifically checking it.`,
  },
};


// The supervisor follow-up. After someone claims "yes, and we could show the evidence" on a
// plain question, the supervisor asks for one specific document and grades what they say they
// would hand over. The requests and standards live here, not in the public page source.
const DOC_REQUESTS: Record<string, { request: string; standard: string }> = {
  q_inventory: { request: "Send me your current inventory of AI systems. Tell me when it was last updated, who owns it, and show me one AI feature inside a vendor product that is on it.", standard: "A strong answer names the document or register, its owner, a recent update date, and a concrete example of an embedded vendor feature or an unapproved tool that was found and added. A weak answer says a list exists without an owner, a date or an example, or describes only systems the firm built itself." },
  q_classify: { request: "Show me the written criteria you used to rate AI risk, and the rating you gave one specific AI use. I want to see that the criteria existed before the rating.", standard: "A strong answer names the criteria document, its date, and one rated use with the reasoning. The criteria must predate the rating. A weak answer describes a rating exercise without showing written criteria, or the criteria were written after the ratings." },
  q_vendor: { request: "Take one AI vendor. Show me which model sits underneath, where our data goes, and what the contract says happens when they change the model.", standard: "A strong answer names a specific vendor and states the underlying model, the data location or processing terms, and the change notification or re-check obligation, ideally pointing to a contract clause or due diligence record. A weak answer refers to the vendor being reputable, or to a questionnaire nobody has read." },
  q_oversight: { request: "Show me one record of a person checking an AI output: what was checked, by whom, and when.", standard: "A strong answer names a specific record, the person or role, a date and what was actually examined. A weak answer describes a process where checking is expected but nothing is recorded, or relies on the reviewer's memory." },
  q_literacy: { request: "Send me the training material for people who oversee AI, and the record of who has completed it.", standard: "A strong answer names the training, says what it covers about the limits of AI, and names the completion record with a coverage figure or date. A weak answer describes general awareness, an intranet page, or training with no record of who attended." },
  q_monitor: { request: "Show me the pre-launch test record for one AI system and the latest monitoring report for it.", standard: "A strong answer names one system, a dated test record with pass criteria, and a monitoring output with a date and an owner. A weak answer says testing is done by the vendor or that monitoring happens informally." },
  q_change: { request: "The vendor updated a model last month. Show me what triggered a re-check and the record that it happened.", standard: "A strong answer names the trigger (vendor notice, internal alert, scheduled review), who acted, and the record. A weak answer describes an intention to re-check, or admits updates are only noticed when something goes wrong." },
  q_claims_ai: { request: "Show me the last accuracy and bias check on AI-assisted claims decisions or fraud flags, including what it found and what you did about it.", standard: "A strong answer names the check, its date, the measure used, a finding and an action taken. A weak answer says outcomes are monitored without describing a specific test of fairness across customer groups." },
  q_smf: { request: "Send me the Statement of Responsibilities of the Senior Manager who owns AI, with the paragraph that covers it.", standard: "A strong answer names the Senior Manager role, the document and the specific wording or responsibility that covers AI, and says when it was last updated. A weak answer says AI sits under general technology or risk responsibilities without specific wording." },
  q_outcomes: { request: "Show me your latest report on customer outcomes from AI-involved journeys, including customers showing signs of vulnerability.", standard: "A strong answer names a report or dashboard, the period it covers, a measure used and how vulnerable customers are identified in it. A weak answer says outcomes are monitored in general with no AI-specific cut and no view of vulnerable customers." },
  q_mrm: { request: "Show me the validation report for one AI model, and tell me who validated it and how they are independent of the builders.", standard: "A strong answer names one model, the validation report and date, the validator and the reporting line that makes them independent. A weak answer describes the framework without a validation of an AI model, or the validators are the builders." },
  q_resilience: { request: "Show me the mapping between one important business service and the AI systems it depends on, with the impact tolerance.", standard: "A strong answer names a service, the AI dependencies on the map, the tolerance, and when the mapping was last reviewed. A weak answer says AI is considered in resilience work without a visible mapping." },
  q_governance_ch: { request: "Show me the board or executive minute that assigns responsibility for AI risk, and who has the expertise.", standard: "A strong answer names the decision, its date, the body, and the people with their relevant expertise. A weak answer says responsibility is understood, or sits with a committee with no named experts." },
  q_data: { request: "Show me the documented data quality check for one AI system, including data you do not control.", standard: "A strong answer names the system, the check, the date, and how external data is assessed. A weak answer says data is good because it comes from a trusted source." },
  q_docs: { request: "Send me the documentation for one important AI application: purpose, data, model choice and known limits.", standard: "A strong answer names the document, the application and its sections, with a date and owner. A weak answer describes documentation as being in progress or held by the vendor." },
  q_independent: { request: "Show me the independent review of one important AI application: who did it, when, and what they found.", standard: "A strong answer names the application, the reviewer, their independence from the builders or buyers, the date and a finding. A weak answer describes an internal check by the same team." },
  q_fadp: { request: "Show me the data protection assessment for one AI use of personal data, and the wording that tells people a decision about them is automated.", standard: "A strong answer names the assessment, its date, and the actual notice wording or process. A weak answer says privacy has been considered without an assessment or notice." },
  q_eu_classify: { request: "Show me the record that places one AI use in an EU AI Act risk category, with the reasoning.", standard: "A strong answer names the use, the category, the reasoning written down and the date. A weak answer states a conclusion with no recorded reasoning." },
  q_prohibited: { request: "Show me how you checked that nothing you use falls under the prohibited practices, and who signed it off.", standard: "A strong answer names the check, a date, the practices considered and the sign-off. A weak answer says nothing prohibited is in use without a recorded check." },
  q_art50: { request: "Show me the notice a customer sees when they start an AI chat, and how AI-generated content is marked.", standard: "A strong answer names the actual wording or screen, where it appears and how generated content is labelled. A weak answer says customers know it is AI or that labelling is planned." },
  q_annex3: { request: "Show me your plan or evidence for the high-risk requirements on credit or life and health pricing: risk management, data governance, logging, oversight and documentation.", standard: "A strong answer names the plan or documents, owners and dates against each requirement. A weak answer says work has started with no artefacts." },
  q_fria: { request: "Show me the plan for the fundamental rights impact assessment: who, when, and what it will cover.", standard: "A strong answer names an owner, a date, a scope and a method. A weak answer says it will be done when required." },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Sign in again to continue." }, 401);

  let body: { mode?: string; question_id?: string; question_text?: string; response_text?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  const questionId = (body.question_id ?? "").toString();
  const questionText = (body.question_text ?? "").toString().slice(0, 600);
  const responseText = (body.response_text ?? "").toString().trim().slice(0, MAX_CHARS);
  const mode = (body.mode ?? "grade").toString();
  if (mode === "ask") {
    const doc = DOC_REQUESTS[questionId];
    if (!doc) return json({ error: "Unknown question." }, 400);
    return json({ request: doc.request });
  }
  const supervisor = mode === "supervisor";
  if (mode !== "grade" && !supervisor) return json({ error: "Unknown mode." }, 400);
  const rubric = supervisor ? DOC_REQUESTS[questionId] : RUBRICS[questionId];
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

  const askedText = supervisor ? DOC_REQUESTS[questionId].request : questionText;
  const prompt = `QUESTION ASKED\n${askedText}\n\nPERSON'S WRITTEN ANSWER\n${responseText}\n\nGrade this now.`;

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
