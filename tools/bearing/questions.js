// Bearing question bank. Plain data, no logic.
// Regulatory references checked as of September 2026. Paid-report content
// (evidence lists, fixes, owners, timelines) is deliberately NOT stored here,
// because anything in this file is readable by anyone who views the page source.

export const ENGINE_VERSION = "bearing-1.0";

export const ANSWER_OPTIONS = [
  { value: "evidence", label: "Yes, and we could show the evidence", points: 2 },
  { value: "partly", label: "Partly, or we'd struggle to show it", points: 1 },
  { value: "no", label: "No", points: 0 },
  { value: "unknown", label: "I don't know", points: null },
];

export const JURISDICTIONS = [
  { value: "uk", label: "United Kingdom" },
  { value: "ch", label: "Switzerland" },
  { value: "eu", label: "European Union" },
];

export const SECTORS = [
  { value: "bank", label: "Bank or building society" },
  { value: "insurer", label: "Insurer, MGA or broker" },
  { value: "wealth", label: "Private bank or wealth manager" },
  { value: "asset", label: "Asset manager" },
  { value: "payments", label: "Payments or e-money firm" },
  { value: "other", label: "Other regulated financial firm" },
];

export const SIZES = [
  { value: "small", label: "Under 250 people" },
  { value: "mid", label: "250 to 2,000 people" },
  { value: "large", label: "More than 2,000 people" },
];

export const AI_USES = [
  { value: "chatbot", label: "Customer chatbots or virtual assistants" },
  { value: "credit", label: "Credit or affordability decisions" },
  { value: "lifehealth", label: "Pricing or underwriting for life or health insurance" },
  { value: "otherpricing", label: "Pricing or underwriting for other insurance" },
  { value: "claims", label: "Claims handling" },
  { value: "fincrime", label: "Fraud or financial crime detection" },
  { value: "content", label: "Generating marketing or customer content" },
  { value: "productivity", label: "Internal productivity, such as copilots and drafting" },
];

export const LENS_LABEL = { uk: "UK", ch: "Switzerland", eu: "EU AI Act" };

// Each question is asked once, even when several lenses rely on it.
// "lenses" says which jurisdictions need it. "onlyIfSector" and "onlyIfUse"
// narrow it further; an empty list means no narrowing.
export const QUESTIONS = [
  {
    id: "q_inventory", lenses: ["uk", "ch", "eu"], onlyIfSector: [], onlyIfUse: [],
    text: "Do you keep a current list of every AI system in use, including AI features inside vendor software and tools staff use without formal approval?",
    why: "The list is the first thing any supervisor asks for. If a tool isn't on it, nobody is governing it.",
  },
  {
    id: "q_classify", lenses: ["uk", "ch"], onlyIfSector: [], onlyIfUse: [],
    text: "Is each AI use given a risk rating, using criteria you wrote down before doing the rating?",
    why: "Criteria set in advance stop ratings drifting towards whatever suits the project.",
  },
  {
    id: "q_vendor", lenses: ["uk", "ch"], onlyIfSector: [], onlyIfUse: [],
    text: "For AI that comes from vendors, do you know which model sits underneath, where your data goes, and what happens when the vendor changes it?",
    why: "A lot of AI in financial firms arrives inside someone else's software. Your outsourcing duties don't stop at the vendor's door.",
  },
  {
    id: "q_oversight", lenses: ["uk"], onlyIfSector: [], onlyIfUse: [],
    text: "Where a person is meant to check AI output, is that check recorded, so you could show what was checked, by whom and when?",
    why: "\"A human reviews it\" is the most common claim and the hardest to prove. Without a record, it's a belief rather than a control.",
  },
  {
    id: "q_literacy", lenses: ["uk", "eu"], onlyIfSector: [], onlyIfUse: [],
    text: "Do the people who use or oversee AI get training on its limits, and do you keep a record of who has had it?",
    why: "Knowing where a tool tends to be wrong is what makes a human check worth anything.",
  },
  {
    id: "q_monitor", lenses: ["uk", "ch"], onlyIfSector: [], onlyIfUse: [],
    text: "Are AI systems tested before going live, and monitored afterwards for errors or changes in behaviour?",
    why: "A system that was accurate at launch can drift as data and customers change.",
  },
  {
    id: "q_change", lenses: ["uk", "ch"], onlyIfSector: [], onlyIfUse: [],
    text: "When a model or a vendor's AI feature is updated, does something trigger a re-check before it keeps running?",
    why: "Models change underneath you. A check done at launch says little about the version running today.",
  },
  {
    id: "q_claims_ai", lenses: ["uk", "ch"], onlyIfSector: ["insurer"], onlyIfUse: [],
    text: "Are AI-assisted claims decisions and fraud flags checked for accuracy and unfair bias before they affect a payout?",
    why: "Claims and underwriting AI usually isn't \"high-risk\" under the EU AI Act, but EIOPA and the FCA both treat it as high-impact regardless.",
  },

  {
    id: "q_smf", lenses: ["uk"], onlyIfSector: [], onlyIfUse: [],
    text: "Is responsibility for AI written into a named Senior Manager's Statement of Responsibilities?",
    why: "If no one is named, accountability is usually split across several people, which in practice means nobody.",
  },
  {
    id: "q_reasonable", lenses: ["uk"], onlyIfSector: [], onlyIfUse: [],
    text: "If the FCA asked that Senior Manager what reasonable steps they've taken over AI, could they show records such as minutes, challenges raised and sign-offs, rather than just describe them?",
    why: "Under SM&CR the test is what a person did and can show, not what they intended.",
  },
  {
    id: "q_outcomes", lenses: ["uk"], onlyIfSector: [], onlyIfUse: [],
    text: "Do you monitor customer outcomes from journeys where AI plays a part, including for customers showing signs of vulnerability?",
    why: "Consumer Duty is judged on outcomes. If AI is part of the journey, its effect has to show up in what you measure.",
  },
  {
    id: "q_understanding", lenses: ["uk"], onlyIfSector: [], onlyIfUse: [],
    text: "Have you tested whether customers actually understand communications that AI wrote or helped write?",
    why: "Clear to the person who wrote it is not the same as understood by the person who reads it.",
  },
  {
    id: "q_mrm", lenses: ["uk"], onlyIfSector: ["bank"], onlyIfUse: [],
    text: "Are AI and machine-learning models inside your model risk framework, with validation by someone independent of the people who built them?",
    why: "The PRA's model risk principles expressly cover AI and machine learning.",
  },
  {
    id: "q_resilience", lenses: ["uk"], onlyIfSector: [], onlyIfUse: [],
    text: "Are the AI systems that your important business services depend on mapped against your impact tolerances?",
    why: "If an AI system fails, would the service it supports stay within tolerance? Most firms haven't checked.",
  },

  {
    id: "q_governance_ch", lenses: ["ch"], onlyIfSector: [], onlyIfUse: [],
    text: "Has the board or executive management given clear responsibility for AI risk to people with the right expertise?",
    why: "FINMA expects AI risk to be owned inside governance, not left with the teams using the tools.",
  },
  {
    id: "q_data", lenses: ["ch"], onlyIfSector: [], onlyIfUse: [],
    text: "Are there documented checks on the quality and suitability of the data AI systems use, including data you don't control?",
    why: "An AI system can't be better than what it's fed, and much of that data comes from outside.",
  },
  {
    id: "q_docs", lenses: ["ch"], onlyIfSector: [], onlyIfUse: [],
    text: "For your important AI applications, is there documentation of purpose, data, model choice and known limits?",
    why: "Documentation is what lets someone other than the builder understand and challenge the system.",
  },
  {
    id: "q_explain", lenses: ["ch"], onlyIfSector: [], onlyIfUse: [],
    text: "Could you explain a specific AI-assisted result to FINMA, an auditor or a client, in terms they would follow?",
    why: "FINMA has said it often found results were not understood or explained. This is where it will look.",
  },
  {
    id: "q_independent", lenses: ["ch"], onlyIfSector: [], onlyIfUse: [],
    text: "Has someone independent of the people who built or bought an important AI application reviewed it?",
    why: "The people closest to a system are the least likely to see its blind spots.",
  },
  {
    id: "q_fadp", lenses: ["ch"], onlyIfSector: [], onlyIfUse: [],
    text: "Where AI processes personal data, have you assessed it under the revised Data Protection Act, including telling people when a decision about them is made automatically?",
    why: "The Swiss data protection regulator has said the revised Act applies directly to AI.",
  },

  {
    id: "q_eu_classify", lenses: ["eu"], onlyIfSector: [], onlyIfUse: [],
    text: "Have you placed each AI use in the EU AI Act's risk categories, and recorded the reasoning?",
    why: "Your obligations depend on the category. Recording the reasoning is what makes the choice defensible.",
  },
  {
    id: "q_prohibited", lenses: ["eu"], onlyIfSector: [], onlyIfUse: [],
    text: "Have you checked that nothing you use falls under the Act's prohibited practices, such as emotion recognition at work or exploiting people's vulnerabilities?",
    why: "These bans have applied since February 2025 and carry the Act's highest fines.",
  },
  {
    id: "q_art50", lenses: ["eu"], onlyIfSector: [], onlyIfUse: ["chatbot", "content"],
    text: "Do customer-facing AI chats tell people they're dealing with AI, and is AI-generated content marked or labelled where the Act requires it?",
    why: "The transparency duties have applied since 2 August 2026. This is the AI Act deadline that is already live.",
  },
  {
    id: "q_annex3", lenses: ["eu"], onlyIfSector: [], onlyIfUse: ["credit", "lifehealth"],
    text: "For AI used in creditworthiness or life and health insurance pricing, have you started on the high-risk requirements: risk management, data governance, logging, human oversight and documentation?",
    why: "These uses are high-risk under the Act. The deadline moved to 2 December 2027, which is still a short runway for this much work.",
  },
  {
    id: "q_fria", lenses: ["eu"], onlyIfSector: [], onlyIfUse: ["credit", "lifehealth"],
    text: "For those same uses, have you planned a fundamental rights impact assessment?",
    why: "Firms using AI for credit scoring or life and health pricing must do one before first use.",
  },
];

// Obligations are what the readout shows. Each one is scored from the
// questions it lists. Weight (1 to 3) reflects exposure and urgency.
export const OBLIGATIONS = [
  { id: "uk_named", lens: "uk", weight: 3, title: "Named accountability for AI", source: "SM&CR", questions: ["q_smf"] },
  { id: "uk_steps", lens: "uk", weight: 3, title: "Evidence of reasonable steps", source: "SM&CR", questions: ["q_reasonable", "q_oversight"] },
  { id: "uk_inventory", lens: "uk", weight: 2, title: "Knowing what AI you run, including vendors'", source: "SYSC, outsourcing", questions: ["q_inventory", "q_vendor"] },
  { id: "uk_outcomes", lens: "uk", weight: 3, title: "Customer outcomes where AI is involved", source: "Consumer Duty", questions: ["q_outcomes"] },
  { id: "uk_understanding", lens: "uk", weight: 2, title: "Customers understand AI-assisted communication", source: "Consumer Duty", questions: ["q_understanding"] },
  { id: "uk_models", lens: "uk", weight: 2, title: "Model risk management covering AI", source: "PRA SS1/23", questions: ["q_classify", "q_monitor", "q_change", "q_mrm"] },
  { id: "uk_resilience", lens: "uk", weight: 2, title: "AI inside operational resilience", source: "Operational resilience rules", questions: ["q_resilience"] },
  { id: "uk_competence", lens: "uk", weight: 1, title: "Staff know the limits of the AI they use", source: "SYSC, Consumer Duty", questions: ["q_literacy"] },
  { id: "uk_claims", lens: "uk", weight: 2, title: "Claims and underwriting AI checked for bias", source: "Consumer Duty, EIOPA", questions: ["q_claims_ai"] },

  { id: "ch_governance", lens: "ch", weight: 3, title: "Governance and responsibility", source: "FINMA Guidance 08/2024", questions: ["q_governance_ch"] },
  { id: "ch_inventory", lens: "ch", weight: 3, title: "AI inventory", source: "FINMA Guidance 08/2024", questions: ["q_inventory"] },
  { id: "ch_classify", lens: "ch", weight: 2, title: "Risk classification", source: "FINMA Guidance 08/2024", questions: ["q_classify"] },
  { id: "ch_data", lens: "ch", weight: 2, title: "Data quality", source: "FINMA Guidance 08/2024", questions: ["q_data"] },
  { id: "ch_testing", lens: "ch", weight: 2, title: "Testing and ongoing monitoring", source: "FINMA Guidance 08/2024", questions: ["q_monitor", "q_change"] },
  { id: "ch_docs", lens: "ch", weight: 2, title: "Documentation", source: "FINMA Guidance 08/2024", questions: ["q_docs"] },
  { id: "ch_explain", lens: "ch", weight: 3, title: "Explainability", source: "FINMA Guidance 08/2024", questions: ["q_explain"] },
  { id: "ch_independent", lens: "ch", weight: 2, title: "Independent review", source: "FINMA Guidance 08/2024", questions: ["q_independent"] },
  { id: "ch_outsourced", lens: "ch", weight: 2, title: "AI from third parties", source: "FINMA Guidance 08/2024, outsourcing", questions: ["q_vendor"] },
  { id: "ch_fadp", lens: "ch", weight: 2, title: "Personal data and automated decisions", source: "Revised FADP", questions: ["q_fadp"] },
  { id: "ch_claims", lens: "ch", weight: 2, title: "Claims and underwriting AI checked for bias", source: "FINMA Guidance 08/2024, EIOPA", questions: ["q_claims_ai"] },

  { id: "eu_classify", lens: "eu", weight: 2, title: "Risk classification of every AI use", source: "AI Act, Art. 6 and Annex III", questions: ["q_eu_classify", "q_inventory"] },
  { id: "eu_prohibited", lens: "eu", weight: 3, title: "No prohibited practices", source: "AI Act, Art. 5", questions: ["q_prohibited"] },
  { id: "eu_literacy", lens: "eu", weight: 1, title: "AI literacy measures", source: "AI Act, Art. 4", questions: ["q_literacy"] },
  { id: "eu_transparency", lens: "eu", weight: 3, title: "Transparency and labelling", source: "AI Act, Art. 50", questions: ["q_art50"] },
  { id: "eu_highrisk", lens: "eu", weight: 2, title: "High-risk requirements for credit and life/health pricing", source: "AI Act, Annex III", questions: ["q_annex3"] },
  { id: "eu_fria", lens: "eu", weight: 2, title: "Fundamental rights impact assessment", source: "AI Act, Art. 27", questions: ["q_fria"] },
];
