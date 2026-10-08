// Bearing scoring engine. Deterministic: the same answers always give the
// same readout. Written in a plain, unabbreviated style on purpose.

import { QUESTIONS, OBLIGATIONS, ANSWER_OPTIONS, LENS_LABEL, ENGINE_VERSION } from "./questions.js";

export const STATUS_LABEL = {
  ready: "Ready",
  partly: "Partly",
  notyet: "Not yet",
  unknown: "Can't tell yet",
};

const GAP_FACTOR = { notyet: 1, unknown: 0.8, partly: 0.5, ready: 0 };

function listsOverlap(firstList, secondList) {
  for (const item of firstList) {
    if (secondList.includes(item)) {
      return true;
    }
  }
  return false;
}

export function questionApplies(question, profile) {
  if (!listsOverlap(question.lenses, profile.jurisdictions)) {
    return false;
  }
  if (question.onlyIfSector.length > 0 && !question.onlyIfSector.includes(profile.sector)) {
    return false;
  }
  if (question.onlyIfUse.length > 0 && !listsOverlap(question.onlyIfUse, profile.uses)) {
    return false;
  }
  return true;
}

export function selectQuestions(profile) {
  const selected = [];
  for (const question of QUESTIONS) {
    if (questionApplies(question, profile)) {
      selected.push(question);
    }
  }
  return selected;
}

// An answer is normally the canonical string value (evidence/partly/no/unknown).
// The three written-examination questions store a richer object instead,
// { value, text, critique }, since we keep what was actually written for the
// full report. Every place that scores an answer reads through this first,
// so the rest of the engine never needs to know which kind it has.
function answerValue(rawAnswer) {
  if (rawAnswer && typeof rawAnswer === "object") {
    return rawAnswer.value;
  }
  return rawAnswer;
}

function pointsFor(rawAnswer) {
  const value = answerValue(rawAnswer);
  for (const option of ANSWER_OPTIONS) {
    if (option.value === value) {
      return option.points;
    }
  }
  return null;
}

function scoreObligation(obligation, answers, applicableIds) {
  // An obligation only applies when its main question applies.
  if (!applicableIds.includes(obligation.questions[0])) {
    return null;
  }
  const relevantIds = [];
  for (const questionId of obligation.questions) {
    if (applicableIds.includes(questionId)) {
      relevantIds.push(questionId);
    }
  }
  if (relevantIds.length === 0) {
    return null;
  }

  let hasUnknown = false;
  let total = 0;
  let counted = 0;
  for (const questionId of relevantIds) {
    const points = pointsFor(answers[questionId]);
    if (points === null) {
      hasUnknown = true;
    } else {
      total = total + points;
      counted = counted + 1;
    }
  }

  let status;
  let average = 0;
  if (hasUnknown) {
    status = "unknown";
  } else {
    average = total / counted;
    if (average === 2) {
      status = "ready";
    } else if (average >= 1) {
      status = "partly";
    } else {
      status = "notyet";
    }
  }

  return {
    id: obligation.id,
    lens: obligation.lens,
    title: obligation.title,
    source: obligation.source,
    weight: obligation.weight,
    primaryQuestion: relevantIds[0],
    status: status,
    statusLabel: STATUS_LABEL[status],
    earned: hasUnknown ? 0 : obligation.weight * (average / 2),
  };
}

function bandFor(percent) {
  if (percent >= 80) {
    return "Largely ready";
  }
  if (percent >= 50) {
    return "Partly ready";
  }
  return "Not ready yet";
}

export function assess(profile, answers) {
  const applicableIds = selectQuestions(profile).map((question) => question.id);
  const lensResults = [];
  const allScored = [];

  for (const lens of ["uk", "ch", "eu"]) {
    if (!profile.jurisdictions.includes(lens)) {
      continue;
    }
    const scored = [];
    let earned = 0;
    let possible = 0;
    for (const obligation of OBLIGATIONS) {
      if (obligation.lens !== lens) {
        continue;
      }
      const result = scoreObligation(obligation, answers, applicableIds);
      if (result === null) {
        continue;
      }
      scored.push(result);
      allScored.push(result);
      earned = earned + result.earned;
      possible = possible + result.weight;
    }
    const percent = possible === 0 ? 0 : Math.round((earned / possible) * 100);
    lensResults.push({
      lens: lens,
      label: LENS_LABEL[lens],
      percent: percent,
      band: bandFor(percent),
      obligations: scored,
      readyCount: scored.filter((item) => item.status === "ready").length,
    });
  }

  // Biggest gaps first. One gap per underlying question, so the same weak
  // answer doesn't fill all three slots under different jurisdictions.
  const ranked = allScored
    .filter((item) => item.status !== "ready")
    .map((item) => ({ ...item, priority: item.weight * GAP_FACTOR[item.status] }))
    .sort((first, second) => second.priority - first.priority);
  const topGaps = [];
  const seenQuestions = [];
  for (const item of ranked) {
    if (seenQuestions.includes(item.primaryQuestion)) {
      continue;
    }
    seenQuestions.push(item.primaryQuestion);
    const question = QUESTIONS.find((candidate) => candidate.id === item.primaryQuestion);
    topGaps.push({ ...item, why: question ? question.why : "" });
    if (topGaps.length === 3) {
      break;
    }
  }

  let partlyCount = 0;
  let unknownCount = 0;
  for (const questionId of applicableIds) {
    if (answerValue(answers[questionId]) === "partly") {
      partlyCount = partlyCount + 1;
    }
    if (answerValue(answers[questionId]) === "unknown") {
      unknownCount = unknownCount + 1;
    }
  }

  return {
    engineVersion: ENGINE_VERSION,
    questionCount: applicableIds.length,
    obligationCount: allScored.length,
    lenses: lensResults,
    topGaps: topGaps,
    partlyCount: partlyCount,
    unknownCount: unknownCount,
  };
}

// ---------- claims worth testing, supervisor results, and comparing two runs ----------

// The "yes, and we could show the evidence" answers that matter most, one question each.
// Written questions are left out because they were already examined when answered.
export function claimsToTest(profile, answers, limit = 3) {
  const weightOf = (questionId) => {
    let best = 0;
    for (const obligation of OBLIGATIONS) {
      if (obligation.questions.includes(questionId) && obligation.weight > best) {
        best = obligation.weight;
      }
    }
    return best;
  };
  const candidates = [];
  for (const question of selectQuestions(profile)) {
    if (question.type === "written") {
      continue;
    }
    if (answerValue(answers[question.id]) !== "evidence") {
      continue;
    }
    candidates.push({ id: question.id, text: question.text, weight: weightOf(question.id) });
  }
  candidates.sort((first, second) => second.weight - first.weight || first.id.localeCompare(second.id));
  return candidates.slice(0, limit);
}

// tests: [{ questionId, band }] where band is evidence, partly or no.
export function summariseSupervisor(tests) {
  const done = (tests || []).filter((test) => test && ["evidence", "partly", "no"].includes(test.band));
  const held = done.filter((test) => test.band === "evidence").length;
  const partly = done.filter((test) => test.band === "partly").length;
  const notHeld = done.filter((test) => test.band === "no").length;
  let line = "";
  if (done.length > 0) {
    if (held === done.length) {
      line = `All ${done.length} of the claims you made held up when asked for the document.`;
    } else {
      line = `${held} of ${done.length} claims held up when asked for the document. ${partly} were partly there and ${notHeld} did not hold.`;
    }
  }
  return { tested: done.length, held, partly, notHeld, line };
}

const STATUS_RANK = { unknown: 0, notyet: 1, partly: 2, ready: 3 };

export function compareResults(previous, current) {
  if (!previous || !current || !previous.lenses || !current.lenses) {
    return null;
  }
  const lenses = [];
  const improved = [];
  const worsened = [];
  let unchanged = 0;
  for (const now of current.lenses) {
    const before = previous.lenses.find((lens) => lens.lens === now.lens);
    if (!before) {
      continue;
    }
    lenses.push({ lens: now.lens, label: now.label, before: before.percent, after: now.percent, delta: now.percent - before.percent });
    for (const obligation of now.obligations) {
      const old = before.obligations.find((item) => item.id === obligation.id);
      if (!old) {
        continue;
      }
      const change = STATUS_RANK[obligation.status] - STATUS_RANK[old.status];
      if (change > 0) {
        improved.push({ title: obligation.title, lens: now.label, from: old.statusLabel, to: obligation.statusLabel });
      } else if (change < 0) {
        worsened.push({ title: obligation.title, lens: now.label, from: old.statusLabel, to: obligation.statusLabel });
      } else {
        unchanged = unchanged + 1;
      }
    }
  }
  if (lenses.length === 0) {
    return null;
  }
  return { lenses, improved, worsened, unchanged, sameEngine: previous.engineVersion === current.engineVersion };
}
