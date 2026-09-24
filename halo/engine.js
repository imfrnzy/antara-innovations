// HALO deterministic engine, v1.
// The AI interviewer only gathers facts. This file alone decides the score.
// Same facts in, same result out. No network calls, no dynamic code execution.
//
// Unlike Soundings, Sentinel and Keel, there is no branching recommendation
// here, no "which model fits you." Every leader is held to the same seven
// standards, all drawn directly from HALO's own stated minimums, not
// invented. The eighth field, CALIBRATION, is never scored good or bad, it's
// a captured fact used only to write the report's closing paragraph.

export const ENGINE_VERSION = "halo-rules-1.0";

export const CHECKLIST = {
  R1_clarity: "When a decision affects someone's work, is there always a stated context, and does silence after something goes wrong ever run past 48 hours?",
  R2_acknowledgement: "Does anything raised get a response inside 24 hours, even without a solution?",
  R3_decision_transparency: "Does a decision affecting someone's role or workload come with a stated reason, even a brief one?",
  R4_quick_repair: "When something lands badly, does a reset actually happen inside 48 hours?",
  R5_weekly_checkin: "Does every person get one agenda-free check-in a week, not about their tasks?",
  R6_ai_disclosure: "When AI genuinely shapes a judgement call, is that said out loud, or does it pass as the leader's own unaided read?",
  R7_ai_boundaries: "Has AI ever been the deciding word, not just an input, on hiring, firing, pay, promotion, or another sensitive human moment?",
  CALIBRATION: "If the leader's own team were asked these same things, does the leader believe they'd describe it the same way?",
};

export const FIELDS = Object.keys(CHECKLIST);
const READINESS_FIELDS = ["R1_clarity", "R2_acknowledgement", "R3_decision_transparency", "R4_quick_repair", "R5_weekly_checkin", "R6_ai_disclosure", "R7_ai_boundaries"];
const READINESS_ORDER = { absent: 0, partial: 1, established: 2 };
const READINESS_LABEL = ["Absent", "Partial", "Established"];

export const DIM_LABEL = {
  R1_clarity: "Clarity",
  R2_acknowledgement: "Acknowledgement",
  R3_decision_transparency: "Decision transparency",
  R4_quick_repair: "Quick repair",
  R5_weekly_checkin: "Weekly check-in",
  R6_ai_disclosure: "AI disclosure",
  R7_ai_boundaries: "AI boundaries",
};

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

function scoreReadiness(facts) {
  return READINESS_FIELDS.map((key) => {
    const v = getField(facts, key);
    const level = READINESS_ORDER[v];
    const isUnknown = level === undefined;
    return {
      field: key, label: DIM_LABEL[key],
      level: isUnknown ? 0 : level,
      status: isUnknown ? "Absent" : READINESS_LABEL[level],
      provisional: isUnknown,
    };
  });
}

// Calibration is never scored, only captured. "matches" means the leader
// believes their team would describe things the same way. "differs" means
// they've already sensed a gap. "unsure" means they haven't considered it.
function readCalibration(facts) {
  const v = getField(facts, "CALIBRATION");
  if (!v || v === "unknown") return { value: null, known: false };
  return { value: v, known: true };
}

export function classify(facts) {
  const readiness = scoreReadiness(facts);
  const weakest = [...readiness].sort((a, b) => a.level - b.level)[0];
  const establishedCount = readiness.filter((r) => r.level === 2 && !r.provisional).length;
  const calibration = readCalibration(facts);

  return {
    engine: ENGINE_VERSION,
    readiness,
    weakest_dimension: weakest,
    established_count: establishedCount,
    total_dimensions: readiness.length,
    calibration,
    provisional: readiness.some((r) => r.provisional),
  };
}

// Which field the interviewer should chase next. The two AI dimensions sit
// deliberately in the middle, not tacked on at the end, and calibration comes
// last, since it lands better once the leader has already talked through
// their own specifics.
const FIELD_ASK_ORDER = [
  "R1_clarity", "R2_acknowledgement", "R3_decision_transparency",
  "R6_ai_disclosure", "R7_ai_boundaries",
  "R4_quick_repair", "R5_weekly_checkin", "CALIBRATION",
];

export function nextGaps(facts, maxResults = 3) {
  return FIELD_ASK_ORDER.filter((k) => fieldIsUnknown(facts, k)).slice(0, maxResults);
}
