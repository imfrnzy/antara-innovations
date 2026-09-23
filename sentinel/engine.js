// Sentinel deterministic engine, v1.
// Built directly from Sentinel_Playbook.docx (Steps 3 and 4). The AI interviewer
// only gathers facts about agents. This file alone decides classifications.
// Same facts in, same result out. No network calls, no dynamic code execution.

export const ENGINE_VERSION = "sentinel-rules-1.0";

// The fixed checklist, taken directly from the playbook's scoring questions.
// Every fact is answered yes, no, or unknown.
export const CHECKLIST = {
  // Consequence exposure (playbook Step 3)
  C1_irreversible_without_approval: "Can it take an action that can't be undone without a human already having approved it: sending, deleting, publishing, moving money, closing or escalating a case, triggering another agent?",
  C2_sees_sensitive_data: "Does what it can see include customer data, financial account details, health information, or anyone's login credentials?",
  C3_multi_system_access: "Is it connected to more than one system at once, so what it can access and what it can do compound together?",
  C4_writes_system_of_record: "Does it write or update a system of record, even if that write is reversible?",
  // Traceability (playbook Step 3, three factual questions)
  T1_named_owner: "Is there a named person, not \"the team\", who owns this agent and would be the first call if something went wrong?",
  T2_reconstructable: "Can you reconstruct, within a few hours, exactly what it saw, decided and did for any single action, not just that an action happened?",
  T3_known_outside_team: "Did anyone outside the team, IT, security, a manager, know this agent existed before this conversation?",
};

export const FIELDS = Object.keys(CHECKLIST);
const CONSEQUENCE_FIELDS = ["C1_irreversible_without_approval", "C2_sees_sensitive_data", "C3_multi_system_access", "C4_writes_system_of_record"];
const TRACEABILITY_FIELDS = ["T1_named_owner", "T2_reconstructable", "T3_known_outside_team"];
const CONSEQUENCE_LEVEL_NAMES = ["LOW", "MEDIUM", "HIGH"];

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

// Unknown or contradicted consequence facts are treated as "yes" for a
// provisional worst case. Absence of evidence is not treated as evidence of safety.
function fieldCountsAsRiskInWorstCaseMode(facts, fieldName) {
  if (fieldIsYes(facts, fieldName)) return true;
  if (fieldIsUnknown(facts, fieldName)) return true;
  if (fieldIsContradiction(facts, fieldName)) return true;
  return false;
}

function chooseFieldCheck(facts, scoringMode) {
  if (scoringMode === "worst") {
    return (fieldName) => fieldCountsAsRiskInWorstCaseMode(facts, fieldName);
  }
  return (fieldName) => fieldIsYes(facts, fieldName);
}

// Consequence exposure: playbook Step 3. Stop at the first yes, in order.
function scoreConsequenceExposure(facts, scoringMode) {
  const isTriggered = chooseFieldCheck(facts, scoringMode);
  if (isTriggered("C1_irreversible_without_approval") || isTriggered("C2_sees_sensitive_data") || isTriggered("C3_multi_system_access")) {
    return 2; // HIGH
  }
  if (isTriggered("C4_writes_system_of_record")) {
    return 1; // MEDIUM
  }
  return 0; // LOW
}

// Traceability: playbook Step 3. A plain count of yes answers to three
// factual questions, never inferred, never scored by feel.
// Three yes: Governed. One or two: Informal. Zero: Invisible.
// Unknown answers do not count as yes: governance can't be assumed from
// missing evidence, the same principle the playbook applies to the amnesty.
function scoreTraceability(facts) {
  const yesCount = TRACEABILITY_FIELDS.filter((fieldName) => fieldIsYes(facts, fieldName)).length;
  if (yesCount === 3) return "GOVERNED";
  if (yesCount >= 1) return "INFORMAL";
  return "INVISIBLE";
}

export function classifyAgent(facts) {
  const unknownConsequenceFields = CONSEQUENCE_FIELDS.filter((fieldName) => fieldIsUnknown(facts, fieldName));
  const isProvisional = unknownConsequenceFields.length > 0;
  const scoringMode = isProvisional ? "worst" : "evidence";

  const consequenceScore = scoreConsequenceExposure(facts, scoringMode);
  const traceabilityState = scoreTraceability(facts);
  const zone = chooseZone(consequenceScore, traceabilityState);

  const contradictedFields = FIELDS.filter((fieldName) => fieldIsContradiction(facts, fieldName));
  const unknownFields = FIELDS.filter((fieldName) => fieldIsUnknown(facts, fieldName));
  const priority = calculatePriority(zone, consequenceScore, traceabilityState, contradictedFields, isProvisional);

  return {
    engine: ENGINE_VERSION,
    consequence_exposure: CONSEQUENCE_LEVEL_NAMES[consequenceScore],
    traceability: traceabilityState,
    zone: zone,
    provisional: isProvisional,
    unknown_fields: unknownFields,
    contradictions: contradictedFields,
    priority: priority,
    reasons: buildReasons(facts, { consequenceScore, traceabilityState }),
  };
}

// Zone names and quadrant logic are the playbook's own (Step 4):
// Exposure zone / Controlled / Low stakes / Overbuilt.
function chooseZone(consequenceScore, traceabilityState) {
  const isHighConsequence = consequenceScore >= 1;
  const isGoverned = traceabilityState === "GOVERNED";

  if (isHighConsequence && !isGoverned) return "EXPOSURE";
  if (isHighConsequence && isGoverned) return "CONTROLLED";
  if (!isHighConsequence && isGoverned) return "OVERBUILT";
  return "LOW_STAKES";
}

// Lower priority number means act on it sooner.
function calculatePriority(zone, consequenceScore, traceabilityState, contradictedFields, isProvisional) {
  const zoneRank = { EXPOSURE: 0, OVERBUILT: 2, CONTROLLED: 3, LOW_STAKES: 4 };
  const traceabilityUrgency = { INVISIBLE: 0, INFORMAL: 1, GOVERNED: 2 };

  let priority = zoneRank[zone] * 10;
  priority += (2 - consequenceScore) * 3;
  priority += traceabilityUrgency[traceabilityState];

  if (contradictedFields.length > 0) priority -= 1;
  if (isProvisional) priority += 2;
  return priority;
}

function buildReasons(facts, scoringSummary) {
  const reasons = [];

  if (fieldIsYes(facts, "C1_irreversible_without_approval")) {
    reasons.push("It can take an irreversible action with no human approval already in place.");
  }
  if (fieldIsYes(facts, "C2_sees_sensitive_data")) {
    reasons.push("It can see customer, financial, health or credential data.");
  }
  if (fieldIsYes(facts, "C3_multi_system_access")) {
    reasons.push("It's connected to more than one system, so access and authority compound.");
  }
  if (fieldIsYes(facts, "C4_writes_system_of_record")) {
    reasons.push("It writes to a system of record, even if that write is reversible.");
  }

  if (scoringSummary.traceabilityState === "INVISIBLE") {
    reasons.push("Nobody outside the team knew this agent existed before now.");
  } else if (scoringSummary.traceabilityState === "INFORMAL") {
    reasons.push("Some traceability exists, but not all three checks are confirmed.");
  }
  if (getFieldValue(facts, "T2_reconstructable") === "no") {
    reasons.push("What it did in any single action can't be reconstructed within a few hours.");
  }

  const hasAnyContradiction = FIELDS.some((fieldName) => fieldIsContradiction(facts, fieldName));
  if (hasAnyContradiction) {
    reasons.push("Answers given during the assessment contradict each other.");
  }

  const hasUnknownConsequenceField = CONSEQUENCE_FIELDS.some((fieldName) => fieldIsUnknown(facts, fieldName));
  if (hasUnknownConsequenceField) {
    reasons.push("Some consequence facts are still unknown, so this is a provisional worst case.");
  }

  return reasons;
}

export function summarise(agents) {
  const classifiedAgents = agents.map((agent) => ({
    ...agent,
    c: agent.classification || classifyAgent(agent.facts || {}),
  }));

  function countInZone(zoneName) {
    return classifiedAgents.filter((agent) => agent.c.zone === zoneName).length;
  }

  const orderedByPriority = [...classifiedAgents].sort((a, b) => a.c.priority - b.c.priority);

  return {
    total: classifiedAgents.length,
    exposure: countInZone("EXPOSURE"),
    controlled: countInZone("CONTROLLED"),
    overbuilt: countInZone("OVERBUILT"),
    low_stakes: countInZone("LOW_STAKES"),
    provisional: classifiedAgents.filter((agent) => agent.c.provisional).length,
    top: orderedByPriority.length > 0 ? orderedByPriority[0] : null,
    ordered: orderedByPriority,
  };
}

// Which field the interviewer should chase next for a given agent.
// Consequence facts first, since they move the zone most; traceability last,
// since the playbook notes people round these up unless asked plainly.
const FIELD_ASK_ORDER = [
  "C1_irreversible_without_approval", "C2_sees_sensitive_data", "C3_multi_system_access",
  "C4_writes_system_of_record", "T1_named_owner", "T3_known_outside_team", "T2_reconstructable",
];

export function nextGaps(facts, maxResults = 3) {
  const contradictedFields = FIELDS.filter((fieldName) => fieldIsContradiction(facts, fieldName));
  const missingFields = FIELD_ASK_ORDER.filter((fieldName) => fieldIsUnknown(facts, fieldName));
  return [...contradictedFields, ...missingFields].slice(0, maxResults);
}
