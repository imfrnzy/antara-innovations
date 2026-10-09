// Saved scans and "what changed". Pure functions. No network, no storage, no eval.
//
// A snapshot is a small summary of one scan: names, categories, counts and capability labels.
// It never holds file rows, amounts per row, or secret values. Two snapshots of the same kind
// can be compared to say what is new, what has gone and what has changed since last time.

export const HISTORY_VERSION = "history-1.0";
export const FREE_SAVES = 3;       // per tool, mirrors the database trigger
export const PRO_SAVES = 200;

const CAP_ORDER = ["untrusted", "private", "act", "write", "code", "persist"];
const STATUS_RANK = { CLOSED: 0, UNKNOWN: 1, POSSIBLE: 2, OPEN: 3 };
const LEG_RANK = { no: 0, maybe: 1, yes: 2 };

const clean = (s, n = 120) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// ---------- making a snapshot ----------
export function snapshotRecords(scan, marked) {
  if (!scan || scan.error) return null;
  const coveredById = new Map((marked || []).map((m) => [m.id, !!m.covered]));
  const tools = (scan.aiTools || []).map((t) => ({
    id: clean(t.id, 60), name: clean(t.name, 80), category: clean(t.category, 40),
    rows: Number(t.rows) || 0,
    spend: t.spend == null ? null : Math.round(Number(t.spend) * 100) / 100,
    covered: coveredById.has(t.id) ? coveredById.get(t.id) : null,
  })).slice(0, 300);
  return {
    v: 1, kind: "records", catalogue: clean(scan.catalogueVersion, 20),
    rowsScanned: Number(scan.rowsScanned) || 0,
    embedded: (scan.embedded || []).map((t) => clean(t.name, 80)).slice(0, 200),
    tools,
  };
}

export function snapshotConfig(result) {
  if (!result || result.error) return null;
  return {
    v: 1, kind: "config", status: result.status,
    legs: { ...result.legs },
    servers: (result.servers || []).filter((s) => !s.disabled).map((s) => ({
      name: clean(s.name, 80), kinds: (s.kinds || []).map((k) => clean(k, 60)).slice(0, 6),
      caps: [...(s.caps || [])].sort(), maybe: [...(s.maybe || [])].sort(), recognised: !!s.recognised,
    })).slice(0, 200),
    flags: (result.flags || []).map((f) => ({ level: f.level, server: clean(f.server, 80), text: clean(f.text, 300) })).slice(0, 200),
  };
}


// ---------- scored tools: Keel, HALO, Bearing, Squall, Ensign ----------
// One shape for all five. headline = the single number or label people remember.
// measures = a few percentages (Bearing lenses, Squall categories). items = states with a rank,
// higher rank is better (Keel and HALO dimensions, Bearing obligations).
// Never holds answers, free text, names or anything typed by the person.
function scoresShell(tool, headline, measures, items, extra = {}) {
  return {
    v: 1, kind: "scores", tool,
    headline: {
      label: clean(headline.label, 60), value: headline.value == null ? null : Number(headline.value),
      text: clean(headline.text, 120), higherBetter: headline.higherBetter !== false,
    },
    measures: (measures || []).slice(0, 40).map((m) => ({ id: clean(m.id, 60), label: clean(m.label, 80), value: Number(m.value) || 0 })),
    items: (items || []).slice(0, 300).map((i) => ({ id: clean(i.id, 80), label: clean(i.label, 120), rank: Number(i.rank) || 0, text: clean(i.text, 40), group: clean(i.group, 40) })),
    ...extra,
  };
}

export function snapshotKeel(c, dimLabels = {}) {
  if (!c || !c.readiness) return null;
  return scoresShell("keel",
    { label: "Operating model", value: null, text: c.operating_model ? c.operating_model.label : "" },
    [],
    c.readiness.map((r) => ({ id: r.field, label: dimLabels[r.field] || r.field, rank: r.provisional ? 0 : r.level, text: r.label + (r.provisional ? " (not answered)" : "") })),
    { engine: clean(c.engine, 30), provisional: !!c.provisional });
}

export function snapshotHalo(c, dimLabels = {}) {
  if (!c || !c.readiness) return null;
  return scoresShell("halo",
    { label: "Dimensions established", value: c.established_count, text: `${c.established_count} of ${c.total_dimensions}` },
    [],
    c.readiness.map((r) => ({ id: r.field, label: dimLabels[r.field] || r.field, rank: r.provisional ? 0 : r.level, text: r.label + (r.provisional ? " (not answered)" : "") })),
    { engine: clean(c.engine, 30), provisional: !!c.provisional });
}

const BEARING_RANK = { unknown: 0, notyet: 1, partly: 2, ready: 3 };
export function snapshotBearing(r) {
  if (!r || !r.lenses) return null;
  const pct = r.lenses.length ? Math.round(r.lenses.reduce((a, l) => a + l.percent, 0) / r.lenses.length) : 0;
  return scoresShell("bearing",
    { label: "Average readiness", value: pct, text: `${pct}% across ${r.lenses.length} ${r.lenses.length === 1 ? "area" : "areas"}` },
    r.lenses.map((l) => ({ id: l.lens, label: l.label, value: l.percent })),
    r.lenses.flatMap((l) => l.obligations.map((o) => ({ id: `${l.lens}:${o.id}`, label: o.title, rank: BEARING_RANK[o.status] ?? 0, text: o.statusLabel, group: l.label }))),
    { engine: clean(r.engineVersion, 30) });
}

export function snapshotSquall(r) {
  if (!r || typeof r.percent !== "number") return null;
  return scoresShell("squall",
    { label: "Spotted correctly", value: r.percent, text: `${r.correctCount} of ${r.total}` },
    (r.categoryBreakdown || []).map((c) => ({ id: c.category, label: c.label, value: c.percent })),
    [], { engine: clean(r.engineVersion, 30), module: clean(r.module, 40), overconfidentWrong: Number(r.overconfidentWrong) || 0, timeoutCount: Number(r.timeoutCount) || 0 });
}

export function snapshotEnsign(r) {
  if (!r || typeof r.percent !== "number") return null;
  return scoresShell("ensign",
    { label: "Decided correctly", value: r.percent, text: `${r.correctCount} of ${r.total}` },
    (r.truthBreakdown || []).map((c) => ({ id: c.category, label: c.label, value: c.percent })),
    [], { engine: clean(r.engineVersion, 30), overconfidentWrong: Number(r.overconfidentWrong) || 0, timeoutCount: Number(r.timeoutCount) || 0 });
}

export function diffScores(prev, next) {
  if (!prev || !next || prev.kind !== "scores" || next.kind !== "scores" || prev.tool !== next.tool) {
    return { error: "These two saved scans are not the same kind, so they can't be compared." };
  }
  if (prev.module && next.module && prev.module !== next.module) return { error: "These two were taken on different modules, so they can't be compared." };
  const changes = [];
  const hb = next.headline.higherBetter !== false;
  const a = prev.headline.value, b = next.headline.value;
  if (a != null && b != null && a !== b) {
    const better = hb ? b > a : b < a;
    changes.push({ type: "headline", tone: better ? "better" : "worse", text: `${next.headline.label}: ${prev.headline.text || a} before, ${next.headline.text || b} now.` });
  } else if (a == null && b == null && prev.headline.text !== next.headline.text) {
    changes.push({ type: "headline", tone: "info", text: `${next.headline.label}: ${prev.headline.text || "none"} before, ${next.headline.text || "none"} now.` });
  }
  const pm = new Map(prev.measures.map((m) => [m.id, m]));
  for (const m of next.measures) {
    const p = pm.get(m.id);
    if (!p) { changes.push({ type: "measure-new", tone: "info", text: `${m.label} is new: ${m.value}%.` }); continue; }
    if (p.value !== m.value) changes.push({ type: "measure", tone: m.value > p.value ? "better" : "worse", text: `${m.label}: ${p.value}% before, ${m.value}% now.` });
  }
  const nm = new Set(next.measures.map((m) => m.id));
  for (const p of prev.measures) if (!nm.has(p.id)) changes.push({ type: "measure-gone", tone: "info", text: `${p.label} is no longer part of the result.` });

  const pi = new Map(prev.items.map((i) => [i.id, i]));
  const ni = new Map(next.items.map((i) => [i.id, i]));
  for (const i of next.items) {
    const p = pi.get(i.id);
    if (!p) { changes.push({ type: "item-new", tone: "info", text: `${i.label} is new: ${i.text}.` }); continue; }
    if (p.rank !== i.rank) changes.push({ type: "item", tone: i.rank > p.rank ? "better" : "worse", text: `${i.label}: ${p.text} before, ${i.text} now.` });
  }
  for (const p of prev.items) if (!ni.has(p.id)) changes.push({ type: "item-gone", tone: "info", text: `${p.label} no longer applies.` });

  const worse = changes.filter((c) => c.tone === "worse").length;
  const better = changes.filter((c) => c.tone === "better").length;
  const unchanged = next.items.filter((i) => pi.get(i.id) && pi.get(i.id).rank === i.rank).length;
  return { kind: "scores", changes, unchanged, worse, better, headline: scoreHeadline(changes, worse, better) };
}

function scoreHeadline(changes, worse, better) {
  if (!changes.length) return "Nothing has changed between these two results.";
  const parts = [];
  if (better) parts.push(`${better} ${better === 1 ? "thing" : "things"} better`);
  if (worse) parts.push(`${worse} ${worse === 1 ? "thing" : "things"} worse`);
  const rest = changes.length - worse - better;
  if (rest) parts.push(`${rest} other ${rest === 1 ? "change" : "changes"}`);
  return parts.join(", ") + ".";
}

// ---------- comparing ----------
// Each change: { type, tone: "worse" | "better" | "info", text }
// "worse" means more exposure than before. The words are plain on purpose.

const gbp = (n) => n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function diffRecords(prev, next) {
  if (!prev || !next || prev.kind !== "records" || next.kind !== "records") return { error: "These two saved scans are not the same kind, so they can't be compared." };
  const before = new Map(prev.tools.map((t) => [t.id, t]));
  const after = new Map(next.tools.map((t) => [t.id, t]));
  const changes = [];
  for (const t of next.tools) {
    const p = before.get(t.id);
    if (!p) {
      changes.push({ type: "added", tone: t.covered === false || t.covered == null ? "worse" : "info", id: t.id,
        text: `${t.name} is new in your records (${t.rows} ${t.rows === 1 ? "row" : "rows"})${t.covered === false ? " and is not on your map" : ""}.` });
      continue;
    }
    if (t.rows !== p.rows) {
      const up = t.rows > p.rows;
      changes.push({ type: up ? "grew" : "shrank", tone: up ? "info" : "info", id: t.id,
        text: `${t.name}: ${p.rows} ${p.rows === 1 ? "row" : "rows"} before, ${t.rows} now.` });
    }
    if (p.spend != null && t.spend != null && Math.abs(t.spend - p.spend) >= 0.01) {
      changes.push({ type: "spend", tone: "info", id: t.id, text: `${t.name}: amount in your file went from ${gbp(p.spend)} to ${gbp(t.spend)}.` });
    }
    if (p.covered === true && t.covered === false) {
      changes.push({ type: "uncovered", tone: "worse", id: t.id, text: `${t.name} is no longer marked as on your map.` });
    } else if (p.covered === false && t.covered === true) {
      changes.push({ type: "covered", tone: "better", id: t.id, text: `${t.name} is now on your map.` });
    }
  }
  for (const p of prev.tools) {
    if (!after.has(p.id)) changes.push({ type: "removed", tone: "info", id: p.id, text: `${p.name} is no longer in your records.` });
  }
  const unchanged = next.tools.filter((t) => { const p = before.get(t.id); return p && p.rows === t.rows; }).length;
  const worse = changes.filter((c) => c.tone === "worse").length;
  const better = changes.filter((c) => c.tone === "better").length;
  return { kind: "records", changes, unchanged, worse, better, headline: headline(changes, worse, better) };
}

export function diffConfig(prev, next) {
  if (!prev || !next || prev.kind !== "config" || next.kind !== "config") return { error: "These two saved scans are not the same kind, so they can't be compared." };
  const changes = [];
  if (prev.status !== next.status) {
    const worse = (STATUS_RANK[next.status] ?? 1) > (STATUS_RANK[prev.status] ?? 1);
    changes.push({ type: "status", tone: worse ? "worse" : "better", text: `Overall result moved from ${prev.status.toLowerCase()} to ${next.status.toLowerCase()}.` });
  }
  const LEG = { untrusted_input: "Outside content can reach it", private_data: "It can see private data", outward_action: "It can act on other systems" };
  for (const k of Object.keys(LEG)) {
    const a = prev.legs?.[k] ?? "no", b = next.legs?.[k] ?? "no";
    if (a !== b) changes.push({ type: "leg", tone: LEG_RANK[b] > LEG_RANK[a] ? "worse" : "better", text: `${LEG[k]}: ${a} before, ${b} now.` });
  }
  const before = new Map(prev.servers.map((s) => [s.name, s]));
  const after = new Map(next.servers.map((s) => [s.name, s]));
  for (const s of next.servers) {
    const p = before.get(s.name);
    if (!p) { changes.push({ type: "added", tone: "worse", text: `${s.name} was added${s.kinds.length ? " (" + s.kinds.join(", ") + ")" : ""}${s.recognised ? "" : ", and we don't recognise it"}.` }); continue; }
    const gained = s.caps.filter((c) => !p.caps.includes(c)), lost = p.caps.filter((c) => !s.caps.includes(c));
    if (gained.length) changes.push({ type: "gained", tone: "worse", text: `${s.name} can now do more: ${words(gained)}.` });
    if (lost.length) changes.push({ type: "lost", tone: "better", text: `${s.name} can no longer: ${words(lost)}.` });
  }
  for (const p of prev.servers) if (!after.has(p.name)) changes.push({ type: "removed", tone: "better", text: `${p.name} was removed.` });

  const key = (f) => `${f.level}|${f.server}|${f.text}`;
  const pf = new Set(prev.flags.map(key)), nf = new Set(next.flags.map(key));
  for (const f of next.flags) if (!pf.has(key(f))) changes.push({ type: "flag-new", tone: f.level === "LOW" ? "info" : "worse", text: `New finding (${f.level.toLowerCase()}) on ${f.server}: ${f.text}` });
  for (const f of prev.flags) if (!nf.has(key(f))) changes.push({ type: "flag-fixed", tone: f.level === "LOW" ? "info" : "better", text: `Fixed or gone (${f.level.toLowerCase()}) on ${f.server}: ${f.text}` });

  const worse = changes.filter((c) => c.tone === "worse").length;
  const better = changes.filter((c) => c.tone === "better").length;
  return { kind: "config", changes, unchanged: next.servers.filter((s) => before.has(s.name)).length, worse, better, headline: headline(changes, worse, better) };
}

const CAP_WORDS = { untrusted: "read outside content", private: "see private data", act: "act on other systems", write: "change records or files", code: "run commands", persist: "remember what it reads" };
const words = (caps) => [...caps].sort((a, b) => CAP_ORDER.indexOf(a) - CAP_ORDER.indexOf(b)).map((c) => CAP_WORDS[c] || c).join(", ");

function headline(changes, worse, better) {
  if (!changes.length) return "Nothing has changed between these two scans.";
  const parts = [];
  if (worse) parts.push(`${worse} ${worse === 1 ? "change adds" : "changes add"} exposure`);
  if (better) parts.push(`${better} ${better === 1 ? "change reduces" : "changes reduce"} it`);
  const rest = changes.length - worse - better;
  if (rest) parts.push(`${rest} other ${rest === 1 ? "change" : "changes"}`);
  return parts.join(", ") + ".";
}

export function compare(prev, next) {
  if (!prev || !next) return { error: "Pick two saved scans to compare." };
  if (prev.kind === "records") return diffRecords(prev, next);
  if (prev.kind === "config") return diffConfig(prev, next);
  if (prev.kind === "scores") return diffScores(prev, next);
  return { error: "Unknown kind of scan." };
}

// ---------- plan rules, the same numbers the database enforces ----------
export function savesAllowed(plan) { return plan === "pro" ? PRO_SAVES : FREE_SAVES; }

export function describeSaveError(message) {
  const m = String(message || "");
  if (/sign_in_required/.test(m)) return "Confirm your email first, then you can save.";
  if (/free_limit/.test(m)) return `The free account keeps ${FREE_SAVES} saved scans for each tool. Delete one, or ask for Pro.`;
  if (/pro_limit/.test(m)) return "You've reached the limit of saved scans. Delete an old one to make room.";
  if (/snapshot_too_large/.test(m)) return "That scan is too large to save. Check a smaller file.";
  return "Couldn't save that. Try again in a moment.";
}

export function trend(snapshots) {
  // snapshots oldest first. For the Pro timeline: one number per scan.
  return snapshots.map((s) => s.kind === "scores"
    ? { at: s.at, value: s.headline.value ?? (s.items.length ? Math.round(s.items.reduce((a, i) => a + i.rank, 0) / s.items.length * 100) / 100 : 0), label: s.headline.text || s.headline.label }
    : s.kind === "records"
    ? { at: s.at, value: s.tools.length, label: `${s.tools.length} AI ${s.tools.length === 1 ? "tool" : "tools"}` }
    : { at: s.at, value: STATUS_RANK[s.status] ?? 1, label: s.status.toLowerCase() });
}
