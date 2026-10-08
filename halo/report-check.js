// HALO report guard. The AI writes the report text. This file checks it against the scored facts
// and the evidence quotes before the leader sees it, and writes a plain fallback if it fails twice.
// Pure functions. The same block is pasted into supabase/functions/halo-interview/index.ts,
// and tests/halo-report-check.test.mjs fails if the two copies differ.

export const REPORT_CHECK_VERSION = "halo-report-check-1.1";

const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

export function squash(s) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Evidence lines the interviewer could not match to the leader's own words are stored with this
// prefix. They are the interviewer's summary, so the report may use what they say but must never
// show them as something the leader said.
export const NOTE_PREFIX = "[note] ";
export function isNote(row) { return !!row && typeof row.quote === "string" && row.quote.startsWith(NOTE_PREFIX); }
export function noteText(row) { return isNote(row) ? row.quote.slice(NOTE_PREFIX.length) : (row?.quote ?? ""); }

// Is this quote really something the leader typed? Brackets and "..." are editing marks the
// interviewer adds, so each remaining piece has to appear in what they wrote.
export function isVerbatim(quote, userText) {
  const hay = squash(userText);
  const pieces = String(quote ?? "").replace(/\[[^\]]*\]/g, "...").split(/\.\.\.|…/).map(squash).filter((x) => x.length > 0);
  const long = pieces.filter((x) => x.length >= 12);
  if (long.length) return long.every((x) => hay.includes(x));
  return pieces.length > 0 && pieces.every((x) => hay.includes(x));
}

// Returns a list of problems. Empty list means the report passes.
export function checkReport(report, classification, evidenceRows) {
  const problems = [];
  const text = String(report ?? "");
  if (text.trim().length < 200) problems.push("The report is empty or far too short.");
  if (/[—–]/.test(text)) problems.push("The report contains a dash that is not allowed. Use commas or full stops.");

  // 1. A quote the report attributes to the leader ("you said ...", "you told ...") must really be
  // something they wrote. Wording the report only suggests ("try saying ...") is not checked here.
  const said = (evidenceRows || []).filter((r) => r && r.quote && !isNote(r)).map((r) => squash(r.quote));
  const re = /["“]([^"”\n]{20,})["”]/g;
  const attributed = /\b(?:you|your)\b[^.\n"“]{0,70}\b(?:said|say|says|told|tell|described|wrote|write|put it|mentioned|answered|explained|words|called)\b[^"“\n]{0,25}$/i;
  let m;
  while ((m = re.exec(text))) {
    const q = squash(m[1]);
    const before = text.slice(Math.max(0, m.index - 110), m.index);
    if (q.length >= 20 && attributed.test(before) && !said.some((s) => s.includes(q))) {
      problems.push(`The quoted text "${m[1].slice(0, 60)}" is shown as something the leader said, but it is not one of their own words in the evidence. Quote only evidence lines that are not marked NOTE, word for word, or do not quote.`);
    }
  }

  // 2. Counts must match the scored classification.
  if (classification && typeof classification.established_count === "number") {
    const countRe = /\b(\d|one|two|three|four|five|six|seven)\s+of\s+(?:the\s+)?(?:7|seven)\b/gi;
    let c;
    while ((c = countRe.exec(text))) {
      const said = /^\d$/.test(c[1]) ? Number(c[1]) : NUM_WORDS[c[1].toLowerCase()];
      if (said !== classification.established_count) {
        problems.push(`The report says "${c[0]}" but ${classification.established_count} of 7 standards are established.`);
      }
    }
  }

  // 3. The "fix first" section must name the scored weakest dimension.
  const weakest = classification?.weakest_dimension;
  if (weakest && weakest.label && weakest.level < 2) {
    const i = text.search(/##\s*Fix this one first/i);
    if (i >= 0) {
      const rest = text.slice(i + 5);
      const next = rest.search(/\n##\s/);
      const section = (next >= 0 ? rest.slice(0, next) : rest).toLowerCase();
      if (!section.includes(String(weakest.label).toLowerCase())) {
        problems.push(`The "Fix this one first" section must be about the weakest dimension, ${weakest.label}.`);
      }
    } else problems.push('The report is missing the "Fix this one first" section.');
  }
  // 4. Internal field codes (R1 to R7, R6_ai_disclosure) are for the engine, never for the reader.
  const codeHit = text.match(/\bR[1-7](?:_[a-z_]+)?\b/);
  if (codeHit) {
    problems.push(`The report uses the internal code "${codeHit[0]}". Use the plain dimension name instead (for example AI boundaries, Clarity) and never write codes like R7.`);
  }
  return problems;
}

// Always accurate, deliberately plain. Used only when the written report fails the check twice.
export function fallbackReport(classification, evidenceRows, firstName) {
  const c = classification || { readiness: [], established_count: 0, total_dimensions: 7 };
  const quoteFor = (field) => (evidenceRows || []).find((r) => r.field === field && r.quote && !isNote(r))?.quote;
  const lines = [];
  lines.push("## Where you stand today");
  lines.push(`${firstName ? firstName + ", " : ""}${c.established_count} of ${c.total_dimensions} standards are established.`);
  for (const r of c.readiness || []) {
    const q = quoteFor(r.field);
    const status = r.provisional ? "was not covered in the conversation" : r.status.toLowerCase();
    lines.push(`- **${r.label}**: ${status}.${q ? ` You said: "${q}"` : ""}`);
  }
  const w = c.weakest_dimension;
  if (w && w.level < 2) {
    lines.push("", "## Fix this one first");
    lines.push(`The weakest standard is **${w.label}**. Pick one moment this week where it applies and do it deliberately, then ask one person how it landed.`);
  }
  lines.push("", "## Then build the rhythm");
  lines.push("A two-minute signal check each day, and one weekly check-in with each person that has no agenda about their tasks.");
  return lines.join("\n");
}
