// Team runs: shared logic for HALO, Squall and Ensign.
// A leader makes a run, shares a code, people answer anonymously. The leader sees results only
// once three people have answered, as counts per question. Nothing here keeps names or free text.

export const MIN_RESPONSES = 3;
export const TEAM_VERSION = "team-1.0";

// ---------- encoding what a person answered ----------
// Scenario tools (Squall, Ensign): one small number per scenario.
//   0 wrong, 1 correct, 2 ran out of time, 3 wrong and marked high confidence.
export const SCENARIO_CODE = { wrong: 0, correct: 1, timeout: 2, overconfident: 3 };

export function encodeScenarioAnswers(scenarios, responses) {
  const byId = new Map((responses || []).map((r) => [r.scenarioId, r]));
  const out = {};
  for (const s of scenarios) {
    const r = byId.get(s.id);
    if (!r || r.timedOut) out[s.id] = SCENARIO_CODE.timeout;
    else if (r.decision === s.truth) out[s.id] = SCENARIO_CODE.correct;
    else out[s.id] = r.confidence === "high" ? SCENARIO_CODE.overconfident : SCENARIO_CODE.wrong;
  }
  return out;
}

// HALO pulse: answers are already 0, 1 or 2 per standard.
export function encodePulseAnswers(questions, answers) {
  const out = {};
  for (const q of questions) {
    const v = answers?.[q.key];
    if (v === 0 || v === 1 || v === 2) out[q.key] = v;
  }
  return out;
}

// ---------- reading the summary the database returns ----------
function countOf(q, code) {
  return Number(q?.counts?.[String(code)] ?? 0);
}

// Squall and Ensign. Returns null when the summary is not visible yet.
export function analyseScenarioSummary(summary, scenarios, leaderPercent = null) {
  if (!summary || !summary.visible) return null;
  const rows = [];
  let correct = 0, answered = 0, over = 0, timeouts = 0, wrong = 0;
  for (const s of scenarios) {
    const q = summary.questions?.[s.id];
    if (!q) continue;
    const c = countOf(q, 1), w = countOf(q, 0), t = countOf(q, 2), o = countOf(q, 3);
    const n = c + w + t + o;
    if (!n) continue;
    correct += c; wrong += w; timeouts += t; over += o; answered += n;
    rows.push({
      id: s.id, truth: s.truth, text: s.text, why: s.why,
      n, correctPct: Math.round((c / n) * 100),
      overconfident: o, timedOut: t, wrong: w,
    });
  }
  rows.sort((a, b) => a.correctPct - b.correctPct || b.overconfident - a.overconfident);
  const teamPercent = answered ? Math.round((correct / answered) * 100) : 0;
  const overconfidentShare = answered ? Math.round((over / answered) * 100) : 0;
  let gap = null;
  if (typeof leaderPercent === "number") {
    const diff = leaderPercent - teamPercent;
    gap = {
      leaderPercent, teamPercent, diff,
      reading: Math.abs(diff) < 10
        ? "Your result and your team's are close."
        : diff > 0
          ? "You scored higher than your team did. The people closest to the day-to-day calls are the ones with the lower score."
          : "Your team scored higher than you did.",
    };
  }
  return {
    n: summary.n, teamPercent, overconfidentShare, timeouts, wrong,
    weakest: rows.slice(0, 3), all: rows, gap,
    watchOut: over > 0
      ? `${over} answer${over === 1 ? " was" : "s were"} wrong and held with high confidence. Those are the ones nobody double-checks.`
      : null,
  };
}

// HALO pulse. leaderLevels is {R1_clarity: 0|1|2, ...} from the leader's own result.
export function analysePulseSummary(summary, questions, leaderLevels = null) {
  if (!summary || !summary.visible) return null;
  const rows = [];
  for (const q of questions) {
    const s = summary.questions?.[q.key];
    if (!s) continue;
    const avg = Number(s.avg);
    const n = Number(s.n);
    const leader = leaderLevels && typeof leaderLevels[q.key] === "number" ? leaderLevels[q.key] : null;
    const gap = leader === null ? null : Math.round((leader - avg) * 100) / 100;
    let reading = null;
    if (gap !== null) {
      if (gap >= 0.75) reading = "You rated yourself clearly higher than your team did.";
      else if (gap <= -0.75) reading = "Your team rated this clearly higher than you did.";
      else reading = "Close to how you saw it.";
    }
    rows.push({
      key: q.key, q: q.q, n, avg, leader, gap, reading,
      split: { reliably: countOf(s, 2), sometimes: countOf(s, 1), rarely: countOf(s, 0) },
    });
  }
  const gapped = rows.filter((r) => r.gap !== null).sort((a, b) => b.gap - a.gap);
  const biggest = gapped[0] && gapped[0].gap >= 0.75 ? gapped[0] : null;
  const weakestForTeam = [...rows].sort((a, b) => a.avg - b.avg)[0] || null;
  return { n: summary.n, rows, biggestGap: biggest, weakestForTeam };
}

// ---------- links, tokens ----------
export function joinUrl(origin, code) {
  return `${String(origin).replace(/\/$/, "")}/team/?code=${encodeURIComponent(code)}`;
}

export function newToken(randomBytes) {
  const bytes = randomBytes(18);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function normaliseCode(raw) {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

// ---------- database calls (a supabase-js client is passed in) ----------
export async function createRun(sb, { tool, module = "", label = "" }) {
  const { data, error } = await sb.rpc("create_team_run", { p_tool: tool, p_module: module, p_label: label });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { runId: row.run_id, code: row.join_code };
}
export async function listRuns(sb, tool) {
  const { data, error } = await sb.rpc("list_team_runs", { p_tool: tool });
  if (error) throw error;
  return data || [];
}
export async function getSummary(sb, runId) {
  const { data, error } = await sb.rpc("team_run_summary", { p_run: runId });
  if (error) throw error;
  return data;
}
export async function closeRun(sb, runId) {
  const { data, error } = await sb.rpc("close_team_run", { p_run: runId });
  if (error) throw error;
  return data;
}
export async function lookupRun(sb, code) {
  const { data, error } = await sb.rpc("team_run_public", { p_code: code });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) || null;
}
export async function submitAnswers(sb, code, token, answers) {
  const { data, error } = await sb.rpc("submit_team_result", { p_code: code, p_token: token, p_answers: answers });
  if (error) throw error;
  return data;
}

// ---------- trend against the last run (Squall, Ensign) ----------
export function trendLine(previous, nowPercent, nowOverconfident = null) {
  if (!previous || typeof previous.percent !== "number") return null;
  const diff = nowPercent - previous.percent;
  const when = previous.date ? new Date(previous.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "last time";
  let move = "no change";
  if (diff > 0) move = `up ${diff} points`;
  else if (diff < 0) move = `down ${-diff} points`;
  let line = `Last run (${when}): ${previous.percent}%. This run: ${nowPercent}%, ${move}.`;
  if (typeof nowOverconfident === "number" && typeof previous.overconfidentWrong === "number" && nowOverconfident !== previous.overconfidentWrong) {
    line += nowOverconfident < previous.overconfidentWrong
      ? " Fewer answers were wrong and sure."
      : " More answers were wrong and sure.";
  }
  return line;
}
