// Manifest agent rules. Pure functions, no network, no AI: same inputs give the
// same answer every time. The browser uses this file to show each client's
// status. The nightly edge function (supabase/functions/manifest-agent) carries
// an identical copy, and tests/agent-rules.test.mjs checks the two agree.
//
// Facts only. Nothing here decides anything clinical. Alerts report what the
// numbers do against NHS Talking Therapies' published point-change thresholds
// and leave the clinical judgement to the clinician.

export const MEASURES = {
  phq9: { label: "PHQ-9", reliableChangeThreshold: 6, casenessThreshold: 10 },
  gad7: { label: "GAD-7", reliableChangeThreshold: 4, casenessThreshold: 8 },
};

// Funding warning points. LOW_AT sessions left or fewer triggers the early
// warning, because Bupa says its decision can take up to three working days.
export const LOW_AT = 2;
// Trajectory review starts once this many scored check-ins exist after baseline.
export const REVIEW_AFTER = 4;

// checkins: [{ id, session_date: "YYYY-MM-DD", phq9: number|null, gad7: number|null }]
export function sortCheckins(checkins) {
  return [...(checkins ?? [])].sort((a, b) =>
    a.session_date === b.session_date ? String(a.created_at ?? a.id).localeCompare(String(b.created_at ?? b.id)) : a.session_date < b.session_date ? -1 : 1);
}

export function fundingStatus(client, checkins) {
  const used = (client.sessions_done_before ?? 0) + (checkins?.length ?? 0);
  const left = (client.sessions_authorised ?? 0) - used;
  let level = "ok";
  if (left <= 0) level = "out";
  else if (left <= LOW_AT) level = "low";
  return { used, authorised: client.sessions_authorised, left, level };
}

// Latest score per measure and the baseline it is compared with. The baseline
// is the one stored on the client; if none, the first scored check-in stands in.
export function scoreTrack(client, checkins) {
  const sorted = sortCheckins(checkins);
  const out = {};
  for (const key of Object.keys(MEASURES)) {
    const scored = sorted.filter((c) => c[key] !== null && c[key] !== undefined);
    const stored = client[`${key}_baseline`];
    let baseline = stored !== null && stored !== undefined ? stored : (scored[0] ? scored[0][key] : null);
    // When the first scored check-in is standing in as the baseline it must
    // not also count as a later reading.
    const later = (stored !== null && stored !== undefined) ? scored : scored.slice(1);
    if (baseline === null || later.length === 0) { out[key] = null; continue; }
    const latest = later[later.length - 1][key];
    const change = baseline - latest;
    const m = MEASURES[key];
    out[key] = {
      measure: m.label, baseline, latest, change, readings: later.length,
      reliableImprovement: change >= m.reliableChangeThreshold,
      reliableDeterioration: change <= -m.reliableChangeThreshold,
      startedAboveCaseness: baseline >= m.casenessThreshold,
      nowBelowCaseness: latest < m.casenessThreshold,
    };
  }
  return out;
}

// Returns the flags the agent would raise right now. Each has a stable key so
// the nightly job can tell whether it has already emailed about it.
export function flagsFor(client, checkins) {
  const flags = [];
  const f = fundingStatus(client, checkins);
  const auth = client.sessions_authorised;
  if (f.level === "out") {
    flags.push({ kind: "funding_out", key: `out-${auth}`, severity: "red",
      text: `Funded sessions used up (${f.used} of ${auth}). A further session may not be funded until the insurer approves more.` });
  } else if (f.level === "low") {
    flags.push({ kind: "funding_low", key: `low-${auth}`, severity: "amber",
      text: `${f.left} funded session${f.left === 1 ? "" : "s"} left of ${auth}. Worth sending the extension request soon, insurers can take a few working days to decide.` });
  }

  const track = scoreTrack(client, checkins);
  const scored = Object.values(track).filter(Boolean);
  const latestScoredId = (() => {
    const s = sortCheckins(checkins).filter((c) => c.phq9 != null || c.gad7 != null);
    return s.length ? s[s.length - 1].id : null;
  })();

  const worse = scored.filter((r) => r.reliableDeterioration);
  if (worse.length) {
    flags.push({ kind: "scores_worse", key: `worse-${latestScoredId}`, severity: "red",
      text: worse.map((r) => `${r.measure} is ${r.latest}, up ${-r.change} from a baseline of ${r.baseline}, which meets the NHS reliable-change threshold for deterioration.`).join(" ") + " For your clinical review." });
  }

  const readings = scored.length ? Math.max(...scored.map((r) => r.readings)) : 0;
  if (!worse.length && readings >= REVIEW_AFTER && scored.every((r) => !r.reliableImprovement)) {
    // One alert per even number of readings from the review point, so a long
    // flat run raises a reminder now and then and never every night.
    const bucket = readings - (readings % 2);
    flags.push({ kind: "scores_flat", key: `flat-${bucket}`, severity: "amber",
      text: `After ${readings} scored sessions, no measure has reached the NHS reliable-change threshold for improvement (${scored.map((r) => `${r.measure} ${r.baseline} to ${r.latest}`).join(", ")}). Worth thinking about before the next review. For your clinical judgement.` });
  }
  return flags;
}

export function worstSeverity(flags) {
  if (flags.some((f) => f.severity === "red")) return "red";
  if (flags.some((f) => f.severity === "amber")) return "amber";
  return "ok";
}
