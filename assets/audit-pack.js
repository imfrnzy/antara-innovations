// Bearing audit pack. Pure functions: no network, no storage.
//
// Bearing already says which obligations look ready, partly ready or not yet. The pack adds what an
// auditor or regulator asks next: who owns each one, when it was last looked at, and where the evidence is.
// Owner, review date and evidence note are typed in by the person. We do not check them.
// The pack says so on every page.

export const PACK_VERSION = "audit-pack-1.0";
export const FREE_CONTROLS = 5;     // mirrors the database trigger (migration 031)
export const PRO_CONTROLS = 500;
export const DUE_SOON_DAYS = 30;

const STATUS_ORDER = { notyet: 0, unknown: 1, partly: 2, ready: 3 };
const clean = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export function controlsAllowed(plan) { return plan === "pro" ? PRO_CONTROLS : FREE_CONTROLS; }

export function describeControlError(message) {
  const m = String(message || "");
  if (/sign_in_required/.test(m)) return "Confirm your email first, then you can keep owners and review dates.";
  if (/controls_free_limit/.test(m)) return `The free account keeps owners and review dates for ${FREE_CONTROLS} obligations. Clear one, or ask for Pro.`;
  if (/controls_pro_limit/.test(m)) return "You've reached the limit. Clear an old one to make room.";
  return "Couldn't save that. Try again in a moment.";
}

// "2026-10-09" -> days from today (negative means past). Invalid -> null.
export function daysUntil(isoDate, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ""))) return null;
  const d = Date.parse(isoDate + "T00:00:00Z");
  if (Number.isNaN(d)) return null;
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((d - t) / 86400000);
}

export function flagsFor(row, today = new Date()) {
  const flags = [];
  if (!row.owner) flags.push({ code: "no_owner", level: "high", text: "Nobody named as owner" });
  const left = daysUntil(row.reviewDate, today);
  if (!row.reviewDate) flags.push({ code: "no_review", level: "medium", text: "No review date" });
  else if (left === null) flags.push({ code: "bad_date", level: "medium", text: "Review date is not a valid date" });
  else if (left < 0) flags.push({ code: "overdue", level: "high", text: `Review overdue by ${-left} ${left === -1 ? "day" : "days"}` });
  else if (left <= DUE_SOON_DAYS) flags.push({ code: "due_soon", level: "low", text: `Review due in ${left} ${left === 1 ? "day" : "days"}` });
  if (row.status === "ready" && !row.evidenceNote) flags.push({ code: "no_evidence", level: "medium", text: "Marked ready but no evidence noted" });
  return flags;
}

// result = Bearing assess() output. controls = array or map of { obligation_id, owner, review_date, evidence_note }.
export function buildPack(result, controls, today = new Date()) {
  if (!result || !Array.isArray(result.lenses)) return null;
  const byId = new Map((Array.isArray(controls) ? controls : Object.values(controls || {})).map((c) => [c.obligation_id, c]));
  const lenses = result.lenses.map((lens) => {
    const rows = lens.obligations.map((o) => {
      const c = byId.get(`${lens.lens}:${o.id}`) || byId.get(o.id) || {};
      const row = {
        key: `${lens.lens}:${o.id}`, id: o.id, title: o.title, source: o.source || "", status: o.status, statusLabel: o.statusLabel,
        owner: clean(c.owner, 80), reviewDate: clean(c.review_date, 10), evidenceNote: clean(c.evidence_note, 300),
      };
      row.flags = flagsFor(row, today);
      return row;
    }).sort((a, b) => (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1) || a.title.localeCompare(b.title));
    return { lens: lens.lens, label: lens.label, percent: lens.percent, band: lens.band, rows };
  });
  const all = lenses.flatMap((l) => l.rows);
  const count = (code) => all.filter((r) => r.flags.some((f) => f.code === code)).length;
  const summary = {
    obligations: all.length,
    ready: all.filter((r) => r.status === "ready").length,
    notReady: all.filter((r) => r.status !== "ready").length,
    withOwner: all.filter((r) => r.owner).length,
    noOwner: count("no_owner"),
    overdue: count("overdue"),
    dueSoon: count("due_soon"),
    noEvidence: count("no_evidence"),
    generated: today.toISOString().slice(0, 10),
    engine: clean(result.engineVersion, 30),
  };
  return { version: PACK_VERSION, summary, lenses };
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function packHtml(pack, { orgName = "" } = {}) {
  const s = pack.summary;
  const rows = (l) => l.rows.map((r) => `<tr class="${esc(r.status)}">
    <td><b>${esc(r.title)}</b><div class="src">${esc(r.source)}</div></td>
    <td>${esc(r.statusLabel)}</td>
    <td>${esc(r.owner) || '<i>none</i>'}</td>
    <td>${esc(r.reviewDate) || '<i>none</i>'}</td>
    <td>${esc(r.evidenceNote) || '<i>none</i>'}</td>
    <td>${r.flags.map((f) => `<span class="f ${esc(f.level)}">${esc(f.text)}</span>`).join(" ")}</td></tr>`).join("");
  const body = pack.lenses.map((l) => `<h2>${esc(l.label)} <small>${l.percent}% ready, ${esc(l.band)}</small></h2>
  <table><thead><tr><th>Obligation</th><th>Status</th><th>Owner</th><th>Last reviewed or next review</th><th>Where the evidence is</th><th>Needs attention</th></tr></thead><tbody>${rows(l)}</tbody></table>`).join("\n");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bearing audit pack ${esc(s.generated)}</title>
<style>body{font:14px/1.5 system-ui,Segoe UI,Arial,sans-serif;margin:32px auto;max-width:1000px;padding:0 16px;color:#111}
h1{margin:0 0 4px}h2{margin:28px 0 8px;font-size:1.1rem}h2 small{font-weight:400;color:#555}
table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f3f3f1}
.src{color:#666;font-size:11.5px}.f{display:inline-block;margin:1px 2px;padding:1px 6px;border-radius:9px;border:1px solid #bbb;font-size:11.5px}.f.high{border-color:#b3261e;color:#b3261e}.f.medium{border-color:#9a6700;color:#9a6700}
.sum{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}.sum div{border:1px solid #ccc;border-radius:8px;padding:8px 12px}.sum b{display:block;font-size:1.3rem}
.note{margin-top:28px;font-size:12px;color:#444;border-top:1px solid #ccc;padding-top:10px}tr{page-break-inside:avoid}@media print{body{margin:0}}</style></head><body>
<h1>Bearing audit pack</h1>
<p>${orgName ? esc(orgName) + ". " : ""}Generated ${esc(s.generated)}. Rules version ${esc(s.engine)}.</p>
<div class="sum"><div><b>${s.obligations}</b>obligations checked</div><div><b>${s.ready}</b>look ready</div><div><b>${s.noOwner}</b>with no owner</div><div><b>${s.overdue}</b>reviews overdue</div><div><b>${s.dueSoon}</b>due within ${DUE_SOON_DAYS} days</div><div><b>${s.noEvidence}</b>ready but no evidence noted</div></div>
${body}
<p class="note">How to read this. The status column comes from the answers given in the Bearing assessment. Owner, review date and evidence note were typed in by the person who prepared this pack. Antara has not seen the evidence and has not checked any of it. This is a self-assessment and a working record. It is not legal advice and it is not a compliance certification.</p>
</body></html>`;
}

const csvCell = (v) => {
  let t = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;      // stop spreadsheets running typed text as a formula
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
export function packCsv(pack) {
  const head = ["Area", "Obligation", "Source", "Status", "Owner", "Review date", "Evidence note", "Needs attention"];
  const lines = [head.map(csvCell).join(",")];
  for (const l of pack.lenses) for (const r of l.rows) {
    lines.push([l.label, r.title, r.source, r.statusLabel, r.owner, r.reviewDate, r.evidenceNote, r.flags.map((f) => f.text).join("; ")].map(csvCell).join(","));
  }
  return lines.join("\r\n");
}
