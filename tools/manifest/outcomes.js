// Practice outcomes export. Pure functions on the clients and check-ins already loaded in the
// page. Nothing is sent anywhere. Uses the same scoring as the rest of Manifest (agent-rules.js).
import { fundingStatus, scoreTrack, sortCheckins } from "./agent-rules.js";

export const OUTCOMES_VERSION = "manifest-outcomes-1.0";

const yn = (value) => (value ? "yes" : "no");

export function outcomeRow(client, checkins) {
  const sorted = sortCheckins(checkins);
  const funding = fundingStatus(client, checkins);
  const track = scoreTrack(client, checkins);
  const row = {
    client_code: client.client_ref,
    insurer: client.insurer,
    status: client.status,
    sessions_logged: sorted.length,
    sessions_used_of_authorised: `${funding.used} of ${funding.authorised}`,
    first_logged_session: sorted[0]?.session_date ?? "",
    last_logged_session: sorted[sorted.length - 1]?.session_date ?? "",
  };
  for (const key of ["phq9", "gad7"]) {
    const t = track[key];
    row[`${key}_baseline`] = t ? t.baseline : "";
    row[`${key}_latest`] = t ? t.latest : "";
    row[`${key}_change`] = t ? t.change : "";
    row[`${key}_reliable_improvement`] = t ? yn(t.reliableImprovement) : "";
    row[`${key}_reliable_deterioration`] = t ? yn(t.reliableDeterioration) : "";
    row[`${key}_recovered`] = t ? yn(t.startedAboveCaseness && t.nowBelowCaseness) : "";
  }
  return row;
}

// Counts across the practice. Only clients with at least one later reading on a measure count for it.
export function practiceSummary(clients, checkinsByClient) {
  const out = { clients: clients.length, measures: {} };
  for (const key of ["phq9", "gad7"]) {
    let tracked = 0, improved = 0, deteriorated = 0, startedCase = 0, recovered = 0, reliableRecovery = 0;
    for (const client of clients) {
      const t = scoreTrack(client, checkinsByClient[client.id] ?? [])[key];
      if (!t) continue;
      tracked++;
      if (t.reliableImprovement) improved++;
      if (t.reliableDeterioration) deteriorated++;
      if (t.startedAboveCaseness) {
        startedCase++;
        if (t.nowBelowCaseness) { recovered++; if (t.reliableImprovement) reliableRecovery++; }
      }
    }
    out.measures[key] = { tracked, improved, deteriorated, startedCase, recovered, reliableRecovery };
  }
  return out;
}

// CSV safe to open in a spreadsheet: a cell that starts like a formula gets a leading apostrophe.
function cell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function outcomesCsv(clients, checkinsByClient) {
  const rows = clients.map((c) => outcomeRow(c, checkinsByClient[c.id] ?? []));
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  return [columns.map(cell).join(","), ...rows.map((r) => columns.map((k) => cell(r[k])).join(","))].join("\r\n");
}

export function summaryLines(summary) {
  const lines = [];
  for (const [key, m] of Object.entries(summary.measures)) {
    if (!m.tracked) continue;
    const label = key === "phq9" ? "PHQ-9" : "GAD-7";
    let line = `${label}: ${m.tracked} client${m.tracked === 1 ? "" : "s"} with a later reading. ${m.improved} reliably improved, ${m.deteriorated} reliably worse.`;
    if (m.startedCase) line += ` ${m.startedCase} started above the clinical threshold, ${m.recovered} of those are now below it.`;
    lines.push(line);
  }
  return lines;
}
