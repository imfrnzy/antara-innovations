// Records scanner. Reads an expense export, card statement, single sign-on app list or
// browser extension list and finds AI tools in it. Pure functions, no network, no storage.
// Everything runs in the visitor's browser. Nothing in here sends the file anywhere.
//
// What it keeps: tool name, category, how many rows matched, and an approximate total from an
// amount column if one exists. It does not keep or show the row text.

import { AI_TOOLS, CATEGORIES, CATALOGUE_VERSION } from "./ai-catalogue.js";

export { CATALOGUE_VERSION, CATEGORIES };

export const LIMITS = { maxChars: 6_000_000, maxRows: 200_000 };

// Lowercase, strip accents, turn every run of non-letters/digits into one space.
export function normalise(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// A small CSV/TSV reader. Handles quotes, doubled quotes, commas/tabs/semicolons, and plain lines.
export function parseTable(text) {
  const raw = String(text ?? "").replace(/^﻿/, "");
  if (!raw.trim()) return { rows: [], delimiter: null };
  const firstLines = raw.split(/\r?\n/).slice(0, 5).join("\n");
  const counts = { "\t": 0, ",": 0, ";": 0 };
  for (const ch of firstLines) if (ch in counts) counts[ch]++;
  let delimiter = null;
  let best = 0;
  for (const d of Object.keys(counts)) if (counts[d] > best) { best = counts[d]; delimiter = d; }

  if (!delimiter) {
    // Plain list: one entry per line.
    return { rows: raw.split(/\r?\n/).filter((l) => l.trim()).map((l) => [l.trim()]), delimiter: null };
  }

  const rows = [];
  let row = [], cell = "", inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && raw[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return { rows, delimiter };
}

const HEADER_WORDS = /\b(date|description|merchant|payee|vendor|supplier|app|application|name|amount|total|cost|price|debit|credit|paid|category|reference|details|narrative|transaction|extension)\b/i;
const AMOUNT_HEADER = /\b(amount|total|cost|price|debit|paid|value|gross|net)\b/i;

export function detectHeader(rows) {
  if (rows.length < 2) return null;
  const first = rows[0];
  const looksLikeHeader = first.length > 1 && first.every((c) => c.trim() !== "" && Number.isNaN(Number(c.replace(/[£$€,]/g, "")))) &&
    first.some((c) => HEADER_WORDS.test(c));
  return looksLikeHeader ? first : null;
}

export function parseAmount(cell) {
  const s = String(cell ?? "").trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s);
  const cleaned = s.replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;
  // Decide which mark is the decimal point: the last one, if followed by 1 or 2 digits.
  let normalised = cleaned;
  const lastDot = cleaned.lastIndexOf("."), lastComma = cleaned.lastIndexOf(",");
  const last = Math.max(lastDot, lastComma);
  if (last > -1 && cleaned.length - last - 1 <= 2 && cleaned.length - last - 1 >= 1) {
    normalised = cleaned.slice(0, last).replace(/[.,]/g, "") + "." + cleaned.slice(last + 1);
  } else normalised = cleaned.replace(/[.,]/g, "");
  const n = Number(normalised);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

// Build matchers once.
function compile(tools) {
  return tools.map((tool) => ({
    tool,
    phrases: tool.phrases.map((p) => ` ${normalise(p)} `),
    unless: (tool.unless || []).map((p) => ` ${normalise(p)} `),
  }));
}
const COMPILED = compile(AI_TOOLS);

export function scanRows(rows, options = {}) {
  const compiled = options.catalogue ? compile(options.catalogue) : COMPILED;
  const header = detectHeader(rows);
  const body = header ? rows.slice(1) : rows;
  let amountColumn = -1;
  if (header) amountColumn = header.findIndex((h) => AMOUNT_HEADER.test(h));

  const found = new Map();
  let scanned = 0;
  for (const row of body) {
    if (scanned >= LIMITS.maxRows) break;
    scanned++;
    const text = ` ${normalise(row.join(" "))} `;
    const amount = amountColumn > -1 ? parseAmount(row[amountColumn]) : null;
    for (const c of compiled) {
      if (c.unless.some((u) => text.includes(u))) continue;
      if (!c.phrases.some((p) => text.includes(p))) continue;
      let entry = found.get(c.tool.id);
      if (!entry) {
        entry = { id: c.tool.id, name: c.tool.name, vendor: c.tool.vendor, category: c.tool.category,
          personalAccountsCommon: !!c.tool.personalAccountsCommon, rows: 0, spend: 0, spendRows: 0 };
        found.set(c.tool.id, entry);
      }
      entry.rows++;
      if (amount !== null) { entry.spend += Math.abs(amount); entry.spendRows++; }
    }
  }
  const matches = [...found.values()].map((e) => ({
    ...e,
    spend: e.spendRows ? Math.round(e.spend * 100) / 100 : null,
  }));
  matches.sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name));
  return {
    rowsScanned: scanned,
    hadHeader: !!header,
    hasAmountColumn: amountColumn > -1,
    matches,
    aiTools: matches.filter((m) => m.category !== "embedded"),
    embedded: matches.filter((m) => m.category === "embedded"),
    catalogueVersion: CATALOGUE_VERSION,
    truncated: body.length > LIMITS.maxRows,
  };
}

export function scanText(text, options = {}) {
  const s = String(text ?? "");
  if (s.length > LIMITS.maxChars) {
    return { error: "That file is too large to read here. Export a smaller date range and try again." };
  }
  const { rows } = parseTable(s);
  if (!rows.length) return { error: "Nothing to read. Paste the list or choose a file." };
  return scanRows(rows, options);
}

// Which tools has the person already described? A tool counts as covered when its name
// or a short alias appears in the name or description of something on their map.
export function markCovered(matches, describedItems) {
  const haystacks = (describedItems || []).map((d) => ` ${normalise([d.name, d.description].filter(Boolean).join(" "))} `);
  const tools = new Map(AI_TOOLS.map((t) => [t.id, t]));
  return matches.map((m) => {
    const tool = tools.get(m.id);
    const words = new Set();
    words.add(normalise(m.name));
    if (tool) for (const p of tool.phrases) words.add(normalise(p));
    // Short brand word, e.g. "chatgpt" from "ChatGPT / OpenAI".
    for (const part of String(m.name).split(/[\/(]/)) {
      const n = normalise(part);
      if (n.length >= 4) words.add(n);
    }
    const covered = haystacks.some((h) => [...words].some((w) => w && h.includes(` ${w} `)));
    return { ...m, covered };
  });
}

// A CSV the person can keep or bring to a conversation. Neutral columns, no row text.
export function toCsv(matches) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Tool", "Vendor", "Category", "Rows matched", "Approx. amount (as in your file)", "On your map"].map(q).join(",")];
  for (const m of matches) {
    lines.push([m.name, m.vendor, CATEGORIES[m.category]?.label ?? m.category, m.rows, m.spend ?? "", m.covered === undefined ? "" : (m.covered ? "yes" : "no")].map(q).join(","));
  }
  return lines.join("\r\n");
}
