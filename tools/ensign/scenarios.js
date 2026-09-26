// Ensign's scenario bank. The judgement being tested is not "can you spot
// AI content", it's "do you know which specific rule applies, and do you
// know that a label doesn't rescue a claim that's misleading regardless."

export const ENGINE_VERSION = "ensign-1.0";
export const ROUND_SECONDS = 25;

export const DECISIONS = [
  { value: "label", label: "Needs a clear disclosure" },
  { value: "nolabel", label: "No disclosure needed" },
  { value: "escalate", label: "Not sure, check with legal or the client" },
];

export const CONFIDENCE = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

// truth: label | nolabel | escalate. Escalate means the honest answer is
// genuine uncertainty, not "I don't know the rule", so guessing either way
// is the failure being tested for, same principle as Squall.
export const SCENARIOS = [
  {
    id: "hero_image", truth: "label",
    text: "A fully AI-generated hero image, a person who doesn't exist wearing the product, runs in a paid Instagram ad. No human retouching beyond the initial generation.",
    why: "Article 50 requires generative AI output to carry a disclosure. A synthetic person wearing a real product is exactly what the rule targets, and \u201Cno one asked for one\u201D isn't a defence once a regulator looks.",
  },
  {
    id: "edited_feature", truth: "nolabel",
    text: "A writer used an AI tool to help draft a sponsored feature, then rewrote and fact-checked every claim personally before publication, putting their own name to the final text.",
    why: "Article 50 carries a specific exemption for exactly this: AI-assisted text that has had genuine human editorial review, with a named person taking responsibility for what's published.",
  },
  {
    id: "internal_pitch", truth: "nolabel",
    text: "An agency uses AI to generate ten rough concept variations for a pitch deck shown only to the client's internal marketing team, never published anywhere external.",
    why: "Both Article 50 and the ASA's test concern content that reaches an audience it could mislead. Internal pitch material isn't public-facing, so the disclosure duty doesn't apply, though it will the moment anything from it goes live.",
  },
  {
    id: "chatbot", truth: "label",
    text: "A brand's customer service chatbot, built on a generative AI model, answers pricing and delivery questions on the website with no indication anywhere that it isn't a person.",
    why: "Article 50(1) is specific and largely settled: a system that interacts directly with people must make clear it's AI, unless that's already obvious from context. Silence on both counts fails it outright.",
  },
  {
    id: "voice_clone", truth: "escalate",
    text: "A well-known actor's voice is recreated with AI for a radio ad, with the actor's agency's written permission, and a brief spoken disclaimer right at the very end of the thirty-second spot.",
    why: "Permission settles the rights question, not the disclosure question. Guidance is explicit that a disclosure buried at the very end of a fast audio spot may not meet the \u201Cclear and distinguishable\u201D bar. Worth a second opinion before it airs, not a confident guess either way.",
  },
  {
    id: "colour_grade", truth: "escalate",
    text: "An influencer posts a genuinely enthusiastic, unscripted product review. The agency also used AI to lightly enhance the video's lighting and colour grading before it went live.",
    why: "The distinction between content that's AI-generated and content that's merely AI-assisted, like colour grading, is still being worked out in the guidance itself. That's precisely why it's worth checking rather than guessing either way.",
  },
];

export const WRITTEN_QUESTION = {
  id: "q_disclosure_defence",
  text: "A client asks you to confirm in writing, for their records, why a specific AI-assisted asset doesn't need a disclosure label. Write what you would actually send them.",
  prompt: "Name the specific basis, editorial review by a named person, or non-public use, not just that you checked and it's fine.",
  why: "\u201CWe checked and it's fine\u201D is not a defensible answer if a regulator or a client's own legal team asks the same question a second time. The basis has to be named.",
};
