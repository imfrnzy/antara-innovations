// Soundings deterministic engine, v1.
// The AI interviewer only gathers facts. This file alone decides classifications.
// Same facts in, same result out. Runs in the browser and in the Supabase edge function.

export const ENGINE_VERSION = "soundings-rules-1.0";

// The fixed checklist. Every fact is yes / no / unknown.
export const CHECKLIST = {
  // Regulatory exposure
  R1_individual_decision: "Does the output influence a decision about a specific person (a customer, employee, applicant or patient), for example eligibility, pricing, hiring, claims or complaint escalation?",
  R2_regulated_activity: "Is the output used inside a regulated activity, for example credit, insurance, financial advice, health, employment, education, legal work or safety?",
  R3_external_facing: "Does the output reach customers, the public or partners directly?",
  // Data sensitivity
  D1_special_data: "Does the tool see special or high-risk data: health, biometric, financial account details, children's data, criminal records, ethnicity, religion or sexuality?",
  D2_personal_data: "Does the tool see information that identifies a real person (customer, employee or anyone else)?",
  D3_confidential_data: "Does the tool see confidential business information: strategy, financials, contracts, source code or unreleased plans?",
  D4_outside_control: "Is the data processed by a tool the organisation has no enterprise agreement with (personal accounts, free tiers, browser plug-ins)?",
  // Reversibility
  V1_acts_without_person: "Is the output sent, published or acted on without a person in between?",
  V2_hard_to_undo: "If the output is wrong, would it be hard, slow or costly to put right (more than a same-day fix by the team)?",
  // Oversight: the three factual questions, plus whether anyone accountable knows at all
  O0_known_to_accountable: "Does someone responsible for technology, data or risk know this use exists?",
  O1_approved: "Has someone with authority formally approved this use, with a record of that approval?",
  O2_reviewed_with_record: "Is the output checked by a named person or role before it has an effect, with a record that the check happened?",
  O3_monitored: "Is someone tracking whether it goes wrong over time (errors, complaints, drift)?",
};

export const FIELDS = Object.keys(CHECKLIST);
const LEVEL = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const NAME = ["LOW", "MEDIUM", "HIGH"];

const v = (facts, k) => (facts && facts[k] && facts[k].value) || "unknown";
const yes = (f, k) => v(f, k) === "yes";
const unk = (f, k) => v(f, k) === "unknown";
const contra = (f, k) => !!(f && f[k] && f[k].status === "contradiction");

// Unknown risk facts are treated as "yes" for a provisional worst case,
// and the result is marked provisional. Absence of evidence is not safety.
function worst(f, k) { return yes(f, k) || unk(f, k) || contra(f, k); }

function regulatory(f, mode) {
  const y = mode === "worst" ? (k) => worst(f, k) : (k) => yes(f, k);
  if (y("R1_individual_decision") || y("R2_regulated_activity")) return 2;
  if (y("R3_external_facing")) return 1;
  return 0;
}

function dataSensitivity(f, mode) {
  const y = mode === "worst" ? (k) => worst(f, k) : (k) => yes(f, k);
  let base = 0;
  if (y("D1_special_data")) base = 2;
  else if (y("D2_personal_data") || y("D3_confidential_data")) base = 1;
  // Sensitive data in a tool outside the organisation's control goes up a level.
  if (base === 1 && y("D4_outside_control")) base = 2;
  return base;
}

function reversibility(f, mode) {
  const y = mode === "worst" ? (k) => worst(f, k) : (k) => yes(f, k);
  const external = y("R3_external_facing");
  const auto = y("V1_acts_without_person");
  const hard = y("V2_hard_to_undo");
  if ((external && hard) || (external && auto)) return 2;
  if (external || auto || hard) return 1;
  return 0;
}

// Oversight: governance that cannot be evidenced counts as informal.
function oversight(f) {
  if (v(f, "O0_known_to_accountable") === "no") return "INVISIBLE";
  const all = ["O1_approved", "O2_reviewed_with_record", "O3_monitored"];
  if (all.every((k) => yes(f, k) && !contra(f, k))) return "GOVERNED";
  if (unk(f, "O0_known_to_accountable") && v(f, "O1_approved") !== "yes") return "INVISIBLE";
  return "INFORMAL";
}

export function classifyUseCase(facts) {
  const riskFields = FIELDS.filter((k) => /^[RDV]/.test(k));
  const unknownRisk = riskFields.filter((k) => unk(facts, k));
  const provisional = unknownRisk.length > 0;
  const mode = provisional ? "worst" : "evidence";

  const reg = regulatory(facts, mode);
  const data = dataSensitivity(facts, mode);
  const rev = reversibility(facts, mode);
  const overall = Math.max(reg, data, rev); // highest wins, never averaged
  const ov = oversight(facts);

  let zone;
  if (overall >= 1 && ov !== "GOVERNED") zone = "EXPOSURE";
  else if (overall >= 1 && ov === "GOVERNED") zone = "CONTROLLED";
  else if (overall === 0 && ov === "GOVERNED") zone = "FRICTION";
  else zone = "LOW_STAKES";

  const contradictions = FIELDS.filter((k) => contra(facts, k));
  const unknown = FIELDS.filter((k) => unk(facts, k));

  // Priority: lower number = act first.
  const zoneRank = { EXPOSURE: 0, FRICTION: 2, CONTROLLED: 3, LOW_STAKES: 4 };
  let priority = zoneRank[zone] * 10 + (2 - overall) * 3 + (ov === "INVISIBLE" ? 0 : ov === "INFORMAL" ? 1 : 2);
  if (contradictions.length) priority -= 1;
  if (provisional) priority += 2;

  return {
    engine: ENGINE_VERSION,
    regulatory: NAME[reg],
    data_sensitivity: NAME[data],
    reversibility: NAME[rev],
    overall_risk: NAME[overall],
    oversight: ov,
    zone,
    provisional,
    unknown_fields: unknown,
    contradictions,
    priority,
    reasons: reasons(facts, { reg, data, rev, ov, zone }),
  };
}

function reasons(f, c) {
  const r = [];
  if (yes(f, "R1_individual_decision")) r.push("Its output can shape a decision about a real person.");
  if (yes(f, "R2_regulated_activity")) r.push("It is used inside a regulated activity.");
  if (yes(f, "R3_external_facing")) r.push("What it produces reaches people outside the organisation.");
  if (yes(f, "D1_special_data")) r.push("It sees high-risk personal data.");
  else if (yes(f, "D2_personal_data")) r.push("It sees data that identifies real people.");
  if (yes(f, "D3_confidential_data")) r.push("It sees confidential business information.");
  if (yes(f, "D4_outside_control")) r.push("The data goes through a tool the organisation has no agreement with.");
  if (yes(f, "V1_acts_without_person")) r.push("Its output takes effect with no person in between.");
  if (yes(f, "V2_hard_to_undo")) r.push("Mistakes would be slow or costly to put right.");
  if (c.ov === "INVISIBLE") {
    if (v(f, "O0_known_to_accountable") === "no") r.push("Nobody accountable for technology or risk knows it exists.");
    else r.push("Nobody could confirm that anyone accountable knows it exists.");
  }
  if (v(f, "O2_reviewed_with_record") === "no") r.push("There is no recorded check before the output takes effect.");
  if (FIELDS.some((k) => contra(f, k))) r.push("Answers given during the assessment contradict each other.");
  if (FIELDS.some((k) => /^[RDV]/.test(k) && unk(f, k))) r.push("Some risk facts are still unknown, so this is a provisional worst case.");
  return r;
}

export function summarise(useCases) {
  const classified = useCases.map((u) => ({ ...u, c: u.classification || classifyUseCase(u.facts || {}) }));
  const count = (z) => classified.filter((u) => u.c.zone === z).length;
  const ordered = [...classified].sort((a, b) => a.c.priority - b.c.priority);
  return {
    total: classified.length,
    exposure: count("EXPOSURE"),
    controlled: count("CONTROLLED"),
    friction: count("FRICTION"),
    low_stakes: count("LOW_STAKES"),
    provisional: classified.filter((u) => u.c.provisional).length,
    top: ordered[0] || null,
    ordered,
  };
}

// Which field should the interviewer chase next for a use case.
// Oversight and decision-shaping facts first, because they move the zone most.
const ASK_ORDER = [
  "R1_individual_decision", "R3_external_facing", "O0_known_to_accountable",
  "O2_reviewed_with_record", "D2_personal_data", "D1_special_data", "D4_outside_control",
  "V1_acts_without_person", "V2_hard_to_undo", "R2_regulated_activity",
  "O1_approved", "O3_monitored", "D3_confidential_data",
];
export function nextGaps(facts, n = 3) {
  const contradicted = FIELDS.filter((k) => contra(facts, k));
  const missing = ASK_ORDER.filter((k) => unk(facts, k));
  return [...contradicted, ...missing].slice(0, n);
}
