// Soundings deterministic engine, v1.
// The AI interviewer only gathers facts. This file alone decides classifications.
// Same facts in, same result out. Runs in the browser and in the Supabase edge function.
//
// Written in a deliberately plain, unabbreviated style: full variable names, no
// chained ternaries, no single-letter shorthand. This file does no network
// requests, no dynamic code execution (no eval, no Function constructor), and
// touches nothing outside the JavaScript object it is given. It only reads
// values out of that object and returns a plain result object.

export const ENGINE_VERSION = "soundings-rules-1.0";

// The fixed checklist. Every fact is answered yes, no, or unknown.
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

const RISK_LEVEL_NAMES = ["LOW", "MEDIUM", "HIGH"];

// Reads one field's recorded value ("yes", "no", or "unknown") out of a
// use case's facts object. Missing or malformed entries default to "unknown".
function getFieldValue(facts, fieldName) {
  if (!facts) return "unknown";
  const entry = facts[fieldName];
  if (!entry || !entry.value) return "unknown";
  return entry.value;
}

function fieldIsYes(facts, fieldName) {
  return getFieldValue(facts, fieldName) === "yes";
}

function fieldIsUnknown(facts, fieldName) {
  return getFieldValue(facts, fieldName) === "unknown";
}

function fieldIsContradiction(facts, fieldName) {
  if (!facts) return false;
  const entry = facts[fieldName];
  if (!entry) return false;
  return entry.status === "contradiction";
}

// Unknown or contradicted risk facts are treated as "yes" for a provisional
// worst case. Absence of evidence is not treated as evidence of safety.
function fieldCountsAsRiskInWorstCaseMode(facts, fieldName) {
  if (fieldIsYes(facts, fieldName)) return true;
  if (fieldIsUnknown(facts, fieldName)) return true;
  if (fieldIsContradiction(facts, fieldName)) return true;
  return false;
}

// Returns the function to use for checking a field's yes/no state,
// depending on whether this use case is being scored in worst-case mode
// (some risk facts are still unknown) or ordinary evidence mode.
function chooseFieldCheck(facts, scoringMode) {
  if (scoringMode === "worst") {
    return (fieldName) => fieldCountsAsRiskInWorstCaseMode(facts, fieldName);
  }
  return (fieldName) => fieldIsYes(facts, fieldName);
}

function scoreRegulatoryExposure(facts, scoringMode) {
  const isTriggered = chooseFieldCheck(facts, scoringMode);
  if (isTriggered("R1_individual_decision") || isTriggered("R2_regulated_activity")) {
    return 2; // HIGH
  }
  if (isTriggered("R3_external_facing")) {
    return 1; // MEDIUM
  }
  return 0; // LOW
}

function scoreDataSensitivity(facts, scoringMode) {
  const isTriggered = chooseFieldCheck(facts, scoringMode);
  let level = 0; // LOW
  if (isTriggered("D1_special_data")) {
    level = 2; // HIGH
  } else if (isTriggered("D2_personal_data") || isTriggered("D3_confidential_data")) {
    level = 1; // MEDIUM
  }
  // Sensitive data handled by a tool outside the organisation's control goes up a level.
  if (level === 1 && isTriggered("D4_outside_control")) {
    level = 2; // HIGH
  }
  return level;
}

function scoreReversibility(facts, scoringMode) {
  const isTriggered = chooseFieldCheck(facts, scoringMode);
  const reachesOutside = isTriggered("R3_external_facing");
  const actsWithoutPerson = isTriggered("V1_acts_without_person");
  const isHardToUndo = isTriggered("V2_hard_to_undo");

  if ((reachesOutside && isHardToUndo) || (reachesOutside && actsWithoutPerson)) {
    return 2; // HIGH
  }
  if (reachesOutside || actsWithoutPerson || isHardToUndo) {
    return 1; // MEDIUM
  }
  return 0; // LOW
}

// Oversight is not scored in worst-case mode: governance that cannot be
// evidenced already counts as informal or invisible, so there is nothing
// further to assume.
function scoreOversight(facts) {
  if (getFieldValue(facts, "O0_known_to_accountable") === "no") {
    return "INVISIBLE";
  }

  const governanceFields = ["O1_approved", "O2_reviewed_with_record", "O3_monitored"];
  const allGovernanceFieldsConfirmed = governanceFields.every(
    (fieldName) => fieldIsYes(facts, fieldName) && !fieldIsContradiction(facts, fieldName)
  );
  if (allGovernanceFieldsConfirmed) {
    return "GOVERNED";
  }

  const accountabilityUnknown = fieldIsUnknown(facts, "O0_known_to_accountable");
  const notApproved = getFieldValue(facts, "O1_approved") !== "yes";
  if (accountabilityUnknown && notApproved) {
    return "INVISIBLE";
  }

  return "INFORMAL";
}

export function classifyUseCase(facts) {
  const riskFieldNames = FIELDS.filter((fieldName) => /^[RDV]/.test(fieldName));
  const unknownRiskFields = riskFieldNames.filter((fieldName) => fieldIsUnknown(facts, fieldName));
  const isProvisional = unknownRiskFields.length > 0;
  const scoringMode = isProvisional ? "worst" : "evidence";

  const regulatoryScore = scoreRegulatoryExposure(facts, scoringMode);
  const dataScore = scoreDataSensitivity(facts, scoringMode);
  const reversibilityScore = scoreReversibility(facts, scoringMode);
  // The overall risk is the highest of the three scores, never an average:
  // one high-risk factor is enough to put the whole use case in the high band.
  const overallScore = Math.max(regulatoryScore, dataScore, reversibilityScore);
  const oversightState = scoreOversight(facts);

  const zone = chooseZone(overallScore, oversightState);
  const contradictedFields = FIELDS.filter((fieldName) => fieldIsContradiction(facts, fieldName));
  const unknownFields = FIELDS.filter((fieldName) => fieldIsUnknown(facts, fieldName));
  const priority = calculatePriority(zone, overallScore, oversightState, contradictedFields, isProvisional);

  return {
    engine: ENGINE_VERSION,
    regulatory: RISK_LEVEL_NAMES[regulatoryScore],
    data_sensitivity: RISK_LEVEL_NAMES[dataScore],
    reversibility: RISK_LEVEL_NAMES[reversibilityScore],
    overall_risk: RISK_LEVEL_NAMES[overallScore],
    oversight: oversightState,
    zone: zone,
    provisional: isProvisional,
    unknown_fields: unknownFields,
    contradictions: contradictedFields,
    priority: priority,
    reasons: buildReasons(facts, { overallScore, oversightState, zone }),
  };
}

function chooseZone(overallScore, oversightState) {
  const isHighRisk = overallScore >= 1;
  const isGoverned = oversightState === "GOVERNED";

  if (isHighRisk && !isGoverned) return "EXPOSURE";
  if (isHighRisk && isGoverned) return "CONTROLLED";
  if (!isHighRisk && isGoverned) return "FRICTION";
  return "LOW_STAKES";
}

// Lower priority number means act on it sooner.
function calculatePriority(zone, overallScore, oversightState, contradictedFields, isProvisional) {
  const zoneRank = { EXPOSURE: 0, FRICTION: 2, CONTROLLED: 3, LOW_STAKES: 4 };
  const oversightUrgency = { INVISIBLE: 0, INFORMAL: 1, GOVERNED: 2 };

  let priority = zoneRank[zone] * 10;
  priority += (2 - overallScore) * 3;
  priority += oversightUrgency[oversightState];

  if (contradictedFields.length > 0) {
    priority -= 1;
  }
  if (isProvisional) {
    priority += 2;
  }
  return priority;
}

function buildReasons(facts, scoringSummary) {
  const reasons = [];

  if (fieldIsYes(facts, "R1_individual_decision")) {
    reasons.push("Its output can shape a decision about a real person.");
  }
  if (fieldIsYes(facts, "R2_regulated_activity")) {
    reasons.push("It is used inside a regulated activity.");
  }
  if (fieldIsYes(facts, "R3_external_facing")) {
    reasons.push("What it produces reaches people outside the organisation.");
  }
  if (fieldIsYes(facts, "D1_special_data")) {
    reasons.push("It sees high-risk personal data.");
  } else if (fieldIsYes(facts, "D2_personal_data")) {
    reasons.push("It sees data that identifies real people.");
  }
  if (fieldIsYes(facts, "D3_confidential_data")) {
    reasons.push("It sees confidential business information.");
  }
  if (fieldIsYes(facts, "D4_outside_control")) {
    reasons.push("The data goes through a tool the organisation has no agreement with.");
  }
  if (fieldIsYes(facts, "V1_acts_without_person")) {
    reasons.push("Its output takes effect with no person in between.");
  }
  if (fieldIsYes(facts, "V2_hard_to_undo")) {
    reasons.push("Mistakes would be slow or costly to put right.");
  }

  if (scoringSummary.oversightState === "INVISIBLE") {
    if (getFieldValue(facts, "O0_known_to_accountable") === "no") {
      reasons.push("Nobody accountable for technology or risk knows it exists.");
    } else {
      reasons.push("Nobody could confirm that anyone accountable knows it exists.");
    }
  }
  if (getFieldValue(facts, "O2_reviewed_with_record") === "no") {
    reasons.push("There is no recorded check before the output takes effect.");
  }

  const hasAnyContradiction = FIELDS.some((fieldName) => fieldIsContradiction(facts, fieldName));
  if (hasAnyContradiction) {
    reasons.push("Answers given during the assessment contradict each other.");
  }

  const hasUnknownRiskField = FIELDS.some(
    (fieldName) => /^[RDV]/.test(fieldName) && fieldIsUnknown(facts, fieldName)
  );
  if (hasUnknownRiskField) {
    reasons.push("Some risk facts are still unknown, so this is a provisional worst case.");
  }

  return reasons;
}

export function summarise(useCases) {
  const classifiedUseCases = useCases.map((useCase) => ({
    ...useCase,
    c: useCase.classification || classifyUseCase(useCase.facts || {}),
  }));

  function countInZone(zoneName) {
    return classifiedUseCases.filter((useCase) => useCase.c.zone === zoneName).length;
  }

  const orderedByPriority = [...classifiedUseCases].sort(
    (a, b) => a.c.priority - b.c.priority
  );

  return {
    total: classifiedUseCases.length,
    exposure: countInZone("EXPOSURE"),
    controlled: countInZone("CONTROLLED"),
    friction: countInZone("FRICTION"),
    low_stakes: countInZone("LOW_STAKES"),
    provisional: classifiedUseCases.filter((useCase) => useCase.c.provisional).length,
    top: orderedByPriority.length > 0 ? orderedByPriority[0] : null,
    ordered: orderedByPriority,
  };
}

// Which field the interviewer should chase next for a given use case.
// Oversight and decision-shaping facts are asked about first, because they
// move the zone the most.
const FIELD_ASK_ORDER = [
  "R1_individual_decision", "R3_external_facing", "O0_known_to_accountable",
  "O2_reviewed_with_record", "D2_personal_data", "D1_special_data", "D4_outside_control",
  "V1_acts_without_person", "V2_hard_to_undo", "R2_regulated_activity",
  "O1_approved", "O3_monitored", "D3_confidential_data",
];

export function nextGaps(facts, maxResults = 3) {
  const contradictedFields = FIELDS.filter((fieldName) => fieldIsContradiction(facts, fieldName));
  const missingFields = FIELD_ASK_ORDER.filter((fieldName) => fieldIsUnknown(facts, fieldName));
  return [...contradictedFields, ...missingFields].slice(0, maxResults);
}
