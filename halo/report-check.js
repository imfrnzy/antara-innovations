// HALO report guard. The AI writes the report text. This file checks it against the scored facts
// and the evidence quotes before the leader sees it, and writes a plain fallback if it fails twice.
// Pure functions. The same block is pasted into supabase/functions/halo-interview/index.ts,
// and tests/halo-report-check.test.mjs fails if the two copies differ.

export const REPORT_CHECK_VERSION = "halo-report-check-1.0";

const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

export function squash(s) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Returns a list of problems. Empty list means the report passes.
export function checkReport(report, classification, evidenceRows) {
  const problems = [];
  const text = String(report ?? "");
  if (text.trim().length < 200) problems.push("The report is empty or far too short.");
  if (/[—–]/.test(text)) problems.push("The report contains a dash that is not allowed. Use commas or full stops.");

  // 1. Every longer quoted span must really be something the leader said.
  const said = (evidenceRows || []).filter((r) => r && r.quote).map((r) => squash(r.quote));
  const re = /["“]([^"”\n]{20,})["”]/g;
  let m;
  while ((m = re.exec(text))) {
    const q = squash(m[1]);
    if (q.length >= 20 && !said.some((s) => s.includes(q))) {
      problems.push(`The quoted text "${m[1].slice(0, 60)}" is not in the evidence. Quote only the evidence lines, word for word, or do not quote.`);
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
  return problems;
}

// Always accurate, deliberately plain. Used only when the written report fails the check twice.
export function fallbackReport(classification, evidenceRows, firstName) {
  const c = classification || { readiness: [], established_count: 0, total_dimensions: 7 };
  const quoteFor = (field) => (evidenceRows || []).find((r) => r.field === field && r.quote)?.quote;
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
