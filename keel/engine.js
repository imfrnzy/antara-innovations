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

export const ENGINE_VERSION = "keel-rules-2.2";

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
  OM3_spend_model: "How scattered is AI spend today? High means it is spread across several business units. Low means it sits in one place.",
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
// Version 2.1 read OM2 and OM3 the other way round. Version 2.2 keeps that for OM2 only.
// OM2 is recorded as "how much capability": high capability does not push towards central control.
// OM3 is now defined as "how scattered is the spend": high means scattered, which does push towards
// central control. Live tests showed the interviewer already recorded "scattered" as high, so 2.1
// read it backwards. The question and the interviewer's rule now say the same thing as the score.
// An unknown answer still counts as 3, the cautious reading.
const OM_PUSH_REVERSED = ["OM2_existing_capability"];
export function omPush(field, value) {
  const raw = OM_SCORE_MAP[value];
  if (raw === undefined) return 3;
  return OM_PUSH_REVERSED.includes(field) ? 4 - raw : raw;
}
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
  const scores = OM_FIELDS.map((k) => omPush(k, getField(facts, k)));
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


// ---------- what would change the recommendation ----------
const OM_LABEL = {
  OM1_regulatory_exposure: "how exposed your AI use is to regulation",
  OM2_existing_capability: "how much AI build capability already exists across the organisation",
  OM3_spend_model: "how scattered your AI spend is",
};
const LEVELS = ["low", "medium", "high"];
const modelFor = (total) => (total >= 7 ? "CENTRALISED" : total <= 4 ? "FEDERATED" : "HYBRID");

// How far the score is from the nearest boundary, and the smallest single answers that would
// flip the recommendation. Pure arithmetic on the same rule classify() uses.
export function flipAnalysis(facts) {
  const om = scoreOperatingModel(facts);
  const margin = om.model === "CENTRALISED" ? om.total - 6
    : om.model === "FEDERATED" ? 5 - om.total
    : Math.min(om.total - 4, 7 - om.total);
  const flips = [];
  for (const field of OM_FIELDS) {
    const current = getField(facts, field);
    const currentPush = omPush(field, current);
    for (const level of LEVELS) {
      if (level === current) continue;
      const total = om.total - currentPush + omPush(field, level);
      const model = modelFor(total);
      if (model !== om.model) {
        flips.push({
          field, label: OM_LABEL[field], from: current && current !== "unknown" ? current : "unknown",
          to: level, newModel: model, newTotal: total,
          sentence: `If ${OM_LABEL[field]} were ${level}${current && current !== "unknown" ? ` instead of ${current}` : ""}, the recommendation would move from ${MODEL_TITLE_PLAIN[om.model]} to ${MODEL_TITLE_PLAIN[model]}.`,
        });
      }
    }
  }
  flips.sort((a, b) => Math.abs(a.newTotal - om.total) - Math.abs(b.newTotal - om.total) || a.field.localeCompare(b.field));
  const unknownNote = om.unknown_fields.length
    ? `${om.unknown_fields.length === 1 ? "One answer was" : om.unknown_fields.length + " answers were"} unknown and counted at the cautious end. Answering ${om.unknown_fields.length === 1 ? "it" : "them"} could move the recommendation.`
    : null;
  return { model: om.model, total: om.total, margin, fragile: margin <= 1, flips: flips.slice(0, 4), unknownNote };
}
const MODEL_TITLE_PLAIN = { CENTRALISED: "centralised", FEDERATED: "federated", HYBRID: "hybrid, centre-led" };

// ---------- the next 90 days, one observable gate per weak dimension ----------
const GATES = {
  R1_sponsorship: [
    "Within 30 days, a named executive confirms in writing that they sponsor AI and what budget authority they hold.",
    "Within 90 days, the sponsor has made at least one funding or stop decision on a named AI initiative, on the record.",
  ],
  R2_team: [
    "Within 30 days, name a CoE lead and one contact each for Risk, Compliance and InfoSec, even part-time.",
    "Within 90 days, those people have met on a fixed rhythm at least twice and kept a note of what they decided.",
  ],
  R3_portfolio: [
    "Within 30 days, one list holds every AI idea and its status, owned by one person.",
    "Within 90 days, every team has put its ideas on that list, and the list is reviewed on a fixed date each month.",
  ],
  R4_risk_gate: [
    "Within 30 days, write down the scored questions every new AI idea must pass, before the next idea arrives.",
    "Within 90 days, at least three ideas have been put through the same gate, and the scores are filed.",
  ],
  R5_testing_monitoring: [
    "Within 30 days, each live AI tool has a named person who checks it and a date for the next check.",
    "Within 90 days, two checks have happened on schedule and each has a short written result.",
  ],
  R6_benefits_proof: [
    "Within 30 days, pick one live AI tool and write down the number that would show it is working, with who will check it.",
    "Within 90 days, someone outside the team has checked that number against source data.",
  ],
};
export function ninetyDayGates(classification) {
  const rows = (classification?.readiness || []).filter((r) => r.level < 2);
  rows.sort((a, b) => a.level - b.level);
  return rows.map((r) => ({
    field: r.field,
    level: r.level,
    steps: r.level === 0 ? GATES[r.field] : [GATES[r.field][1]],
  }));
}

// ---------- compare two runs ----------
export function compareKeel(previous, current) {
  if (!previous || !current || !previous.readiness || !current.readiness) return null;
  const moved = [];
  let unchanged = 0;
  for (const now of current.readiness) {
    const before = previous.readiness.find((r) => r.field === now.field);
    if (!before) continue;
    if (now.level > before.level) moved.push({ field: now.field, direction: "up", from: before.level, to: now.level });
    else if (now.level < before.level) moved.push({ field: now.field, direction: "down", from: before.level, to: now.level });
    else unchanged += 1;
  }
  const model = {
    before: previous.operating_model?.model || null,
    after: current.operating_model?.model || null,
  };
  model.changed = !!model.before && !!model.after && model.before !== model.after;
  return {
    moved, unchanged, model,
    scoreBefore: previous.operating_model?.total ?? null, scoreAfter: current.operating_model?.total ?? null,
    sameEngine: previous.engine === current.engine,
  };
}
