// Keel deterministic engine, v2.
// The AI interviewer only gathers facts. This file alone decides the operating
// model recommendation, the seven-dimension readiness read, and, when the
// organisation already has something running, whether it matches what the
// score says fits. Same facts in, same result out. No network calls, no
// dynamic code execution.
//
// Two things this engine does NOT do, on purpose:
// - It never writes prose. The report narrative is a separate, grounded Claude
//   call that receives this engine's output as its only source of numbers.
// - It never invents a threshold that isn't stated here in plain code, so the
//   basis for "why centralised, not federated" can always be shown to a user.

export const ENGINE_VERSION = "keel-rules-2.0";

// ---- The checklist ----
// EXISTING_COE and CURRENT_MODEL are asked first, before anything else, since
// the answer changes how every later question should be framed: discovering
// readiness for something new, versus auditing something already running.
// Three operating-model factors (Section 10.3 of the Keel playbook), each
// scored 1 to 3 on how strongly it pushes toward central control.
// Six readiness dimensions, each read as absent / partial / established.
export const CHECKLIST = {
  EXISTING_COE: "Does this organisation already have some kind of AI governance function or CoE in place, even informally?",
  CURRENT_MODEL: "Thinking about what exists today, would you describe it as centralised, federated, hybrid, or informal and ad hoc with no consistent model?",
  OM1_regulatory_exposure: "How exposed is this organisation's likely AI use to regulation: customer-facing decisions, regulated sectors, personal data at scale?",
  OM2_existing_capability: "How much in-house AI build capability already exists across the organisation, not just one team?",
  OM3_spend_model: "Is AI spend today concentrated in one place, or already scattered across business units?",
  R1_sponsorship: "Is there a named executive sponsor for an AI programme, with actual budget authority, confirmed in writing?",
  R2_team: "Is there a CoE lead, an architect, and named Risk, Compliance and InfoSec contacts, even informally?",
  R3_portfolio: "Is there one place that tracks every AI idea and its status, or does each team keep its own list?",
  R4_risk_gate: "Does a new AI idea go through a scored, consistent process, or does every case get argued individually?",
  R5_testing_monitoring: "Once something's live, does a named person actually check on it against a set cadence?",
  R6_benefits_proof: "Could this organisation prove an AI tool's benefit with numbers someone outside the team checked?",
};

export const FIELDS = Object.keys(CHECKLIST);
const OM_FIELDS = ["OM1_regulatory_exposure", "OM2_existing_capability", "OM3_spend_model"];
const READINESS_FIELDS = ["R1_sponsorship", "R2_team", "R3_portfolio", "R4_risk_gate", "R5_testing_monitoring", "R6_benefits_proof"];

const OM_SCORE_MAP = { low: 1, medium: 2, high: 3 };
const READINESS_ORDER = { absent: 0, partial: 1, established: 2 };
const READINESS_LABEL = ["Absent", "Partial", "Established"];

function getField(facts, key) {
  if (!facts) return null;
  const entry = facts[key];
  if (!entry || !entry.value) return null;
  return entry.value;
}

function fieldIsUnknown(facts, key) {
  const v = getField(facts, key);
  return v === null || v === "unknown";
}

// ---- Operating model score ----
// Each factor 1 (favours federating) to 3 (favours centralising). Summed
// across three factors: range 3 to 9. Thresholds below are a stated,
// visible rule, not a hidden judgement call.
function scoreOperatingModel(facts) {
  const unknownFields = OM_FIELDS.filter((k) => fieldIsUnknown(facts, k));
  const scores = OM_FIELDS.map((k) => {
    const v = getField(facts, k);
    return OM_SCORE_MAP[v] ?? 3;
  });
  const total = scores.reduce((a, b) => a + b, 0);

  let model;
  if (total >= 7) model = "CENTRALISED";
  else if (total <= 4) model = "FEDERATED";
  else model = "HYBRID";

  return {
    total,
    model,
    factor_scores: {
      OM1_regulatory_exposure: scores[0],
      OM2_existing_capability: scores[1],
      OM3_spend_model: scores[2],
    },
    provisional: unknownFields.length > 0,
    unknown_fields: unknownFields,
  };
}

const MODEL_LABEL = {
  CENTRALISED: "Centralised delivery for the first 12 to 18 months",
  FEDERATED: "Federated, with a light central standards function",
  HYBRID: "Hybrid, centre-led",
};

const MODEL_REASON = {
  CENTRALISED: "High regulatory exposure, limited existing capability, or spend still scattered, all point the same direction: build the first track record centrally before distributing control.",
  FEDERATED: "Lower regulatory exposure and genuine capability already sitting in more than one team mean the centre's job is standards and review, not building everything itself.",
  HYBRID: "The signals point in different directions. That's usually not evidence of readiness for a sophisticated split, it's evidence the organisation hasn't yet resolved which work is which. A hybrid model only holds if there's an explicit, written rule for what goes where.",
};

// ---- Readiness read: six dimensions, each independently scored ----
function scoreReadiness(facts) {
  return READINESS_FIELDS.map((key) => {
    const v = getField(facts, key);
    const level = READINESS_ORDER[v];
    const isUnknown = level === undefined;
    return {
      field: key,
      level: isUnknown ? 0 : level,
      label: isUnknown ? "Absent" : READINESS_LABEL[level],
      provisional: isUnknown,
    };
  });
}

// ---- Existing CoE comparison ----
// Only produced when the person told us they already have something running
// AND told us what shape it takes. "Informal" is treated as its own state,
// not mapped onto one of the three models, since ad hoc governance isn't a
// fourth operating model, it's the absence of one.
const CURRENT_MODEL_MAP = { centralised: "CENTRALISED", federated: "FEDERATED", hybrid: "HYBRID" };

function buildComparison(facts, recommendedModel) {
  const hasExisting = getField(facts, "EXISTING_COE");
  if (hasExisting !== "yes") {
    return { has_existing: hasExisting === "no" ? false : null };
  }
  const current = getField(facts, "CURRENT_MODEL");
  if (!current || current === "unknown") {
    return { has_existing: true, current_model: null };
  }
  if (current === "informal") {
    return {
      has_existing: true, current_model: "informal", current_label: "Informal, no consistent model",
      matches: false,
      note: "There's something running, but it isn't any of the three models, it's ad hoc. That's worth treating as a finding on its own, independent of which model eventually fits.",
    };
  }
  const currentUpper = CURRENT_MODEL_MAP[current];
  if (!currentUpper) return { has_existing: true, current_model: current, matches: null };
  const matches = currentUpper === recommendedModel;
  return {
    has_existing: true,
    current_model: current,
    current_label: MODEL_LABEL[currentUpper],
    matches,
    note: matches
      ? "What's running today matches what the score says fits. The gaps below are about strengthening it, not changing its shape."
      : `What's running today (${current}) doesn't match what the score says fits (${recommendedModel.toLowerCase()}). That mismatch is worth understanding before anything else here.`,
  };
}

export function classify(facts) {
  const om = scoreOperatingModel(facts);
  const readiness = scoreReadiness(facts);
  const sponsorship = getField(facts, "R1_sponsorship");
  const weakest = [...readiness].sort((a, b) => a.level - b.level)[0];
  const comparison = buildComparison(facts, om.model);

  return {
    engine: ENGINE_VERSION,
    operating_model: {
      ...om,
      label: MODEL_LABEL[om.model],
      reason: MODEL_REASON[om.model],
    },
    readiness,
    weakest_dimension: weakest,
    sponsorship_confirmed: sponsorship === "established",
    comparison,
    provisional: om.provisional || readiness.some((r) => r.provisional),
  };
}

// Which field the interviewer should chase next. EXISTING_COE always first,
// since it decides how every later question should be framed. CURRENT_MODEL
// only matters if they said yes to having something already, so it's skipped
// as not-applicable rather than chased forever when the answer was no.
const FIELD_ASK_ORDER = [
  "EXISTING_COE", "CURRENT_MODEL",
  "R1_sponsorship", "OM1_regulatory_exposure", "OM2_existing_capability", "OM3_spend_model",
  "R2_team", "R4_risk_gate", "R3_portfolio", "R5_testing_monitoring", "R6_benefits_proof",
];

export function nextGaps(facts, maxResults = 3) {
  const missing = FIELD_ASK_ORDER.filter((k) => {
    if (k === "CURRENT_MODEL" && getField(facts, "EXISTING_COE") !== "yes") return false;
    return fieldIsUnknown(facts, k);
  });
  return missing.slice(0, maxResults);
}
