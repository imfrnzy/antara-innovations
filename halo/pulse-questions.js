// HALO team pulse: the same seven standards, asked of the people who work for the leader.
// Answers are 0, 1 or 2, the same scale the leader's own result uses
// (0 absent, 1 partial, 2 established). Nothing here is free text.

export const PULSE_VERSION = "halo-pulse-1.0";

export const PULSE_OPTIONS = [
  { value: 2, label: "Yes, reliably" },
  { value: 1, label: "Sometimes" },
  { value: 0, label: "Rarely or never" },
];

export const PULSE_QUESTIONS = [
  { key: "R1_clarity", q: "When a decision affects your work, do you get the context for it, and do you hear back within about two days if something has gone wrong?" },
  { key: "R2_acknowledgement", q: "When you raise something with your leader, do you get a response within a day, even if it is only “seen, I'll come back to you”?" },
  { key: "R3_decision_transparency", q: "When a decision changes your role or workload, is a reason given, even a short one?" },
  { key: "R4_quick_repair", q: "When something lands badly between you and your leader, does it get put right within a couple of days?" },
  { key: "R5_weekly_checkin", q: "Do you get a regular check-in each week that is not about your tasks?" },
  { key: "R6_ai_disclosure", q: "When AI has shaped a judgement about you or your work, are you told?" },
  { key: "R7_ai_boundaries", q: "Is AI kept out of being the deciding voice on sensitive things like hiring, pay, promotion or letting someone go?" },
];
