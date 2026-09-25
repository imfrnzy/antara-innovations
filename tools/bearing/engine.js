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

function pointsFor(answerValue) {
  for (const option of ANSWER_OPTIONS) {
    if (option.value === answerValue) {
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
    if (answers[questionId] === "partly") {
      partlyCount = partlyCount + 1;
    }
    if (answers[questionId] === "unknown") {
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
