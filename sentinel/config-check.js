// Sentinel agent configuration check. Pure functions. No network, no storage, no eval.
// Reads the text of an AI agent's tool configuration (an MCP config file, or a plain list of
// tools and permissions) and works out what that agent can do, using the same three-part test
// as Sentinel's attack path: can outside text reach it, can it see private data, can it act.
//
// It never shows, returns or keeps secret values. It only reports that one exists, and its name.
// Everything it says is inferred from names and settings in the file. It does not run anything
// and it cannot see what the real credentials are allowed to do.

export const CHECK_VERSION = "sentinel-config-1.0";
export const MAX_CHARS = 400_000;

const CAP_LABEL = {
  untrusted: "reads content that outsiders can write",
  private: "can see private data",
  act: "can take actions outside the agent",
  write: "can change records or files",
  code: "can run commands or code",
  persist: "remembers what it reads",
};

// Whole-word phrase matching over a normalised key, same idea as the records scanner.
export function normalise(text) {
  return String(text ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// kind: what it is. caps: definitely true. maybe: true depending on who writes to it or how it is set up.
const KNOWN = [
  { kind: "Files", words: ["filesystem", "file system"], caps: ["private", "write"], note: "Reads and changes files in the folders it is given." },
  { kind: "Web fetch and scraping", words: ["fetch", "web fetch", "http client", "firecrawl", "jina", "scrape", "scraper", "crawl", "crawler", "apify"], caps: ["untrusted", "act"], note: "Reads pages anyone can write, and can request addresses an attacker chooses, which can carry data out." },
  { kind: "Web search", words: ["brave", "brave search", "tavily", "exa", "serper", "serpapi", "duckduckgo", "web search", "google search", "bing search", "searxng"], caps: ["untrusted"], note: "Results include text from sites anyone can publish on." },
  { kind: "Browser control", words: ["puppeteer", "playwright", "browserbase", "browser use", "browseruse", "stagehand", "chrome devtools", "browsermcp", "browser mcp", "selenium", "browser"], caps: ["untrusted", "act"], maybe: ["private"], note: "Can click, type and submit in a real browser, often while logged in." },
  { kind: "Code hosting", words: ["github", "gitlab", "bitbucket"], caps: ["untrusted", "private", "act", "write"], note: "Issues, comments and pull requests are written by other people. What it can change depends on the token it holds." },
  { kind: "Chat", words: ["slack", "teams", "discord", "telegram", "whatsapp", "signal", "mattermost", "chat"], caps: ["untrusted", "private", "act"], note: "Reads messages written by others and can post." },
  { kind: "Email", words: ["gmail", "email", "mail", "imap", "smtp", "outlook", "exchange", "fastmail"], caps: ["untrusted", "private", "act"], note: "Reads mail from anyone and can send as you." },
  { kind: "Documents and drives", words: ["google drive", "gdrive", "google docs", "google sheets", "google workspace", "sharepoint", "onedrive", "dropbox", "box", "confluence", "notion", "obsidian", "evernote"], caps: ["private", "write"], maybe: ["untrusted"], note: "Private documents. Shared files can contain text written by people outside." },
  { kind: "Calendar", words: ["calendar", "gcal", "calendly", "cal com"], caps: ["private", "act"], note: "Sees your diary and can send invitations to others." },
  { kind: "Database", words: ["postgres", "postgresql", "mysql", "mariadb", "sqlite", "mongodb", "redis", "supabase", "bigquery", "snowflake", "clickhouse", "neon", "planetscale", "dynamodb", "firebase", "mssql", "sql server", "oracle", "elasticsearch", "airtable"], caps: ["private"], maybe: ["write"], note: "Holds records. Whether it can change them depends on whether the connection is read-only." },
  { kind: "Payments", words: ["stripe", "paypal", "square", "plaid", "adyen", "revolut", "payments", "payment"], caps: ["private", "act"], note: "Sees financial data and can move money or issue refunds." },
  { kind: "Sending messages", words: ["twilio", "sendgrid", "mailgun", "resend", "postmark", "sms", "vonage", "messagebird"], caps: ["act"], note: "Can send messages to customers or anyone else." },
  { kind: "Shell and code execution", words: ["shell", "terminal", "bash", "powershell", "desktop commander", "ssh", "exec", "code interpreter", "python repl", "jupyter", "run command", "commands"], caps: ["code", "act", "write"], maybe: ["private"], note: "Can run anything the account it runs under can run." },
  { kind: "Infrastructure", words: ["aws", "amazon", "kubernetes", "k8s", "kubectl", "docker", "terraform", "pulumi", "azure", "gcp", "google cloud", "cloudflare", "vercel", "netlify", "heroku", "digitalocean", "ansible"], caps: ["act", "private", "write"], note: "Can change live systems." },
  { kind: "Customer and support systems", words: ["hubspot", "salesforce", "zendesk", "intercom", "freshdesk", "freshservice", "servicenow", "helpscout", "help scout", "pipedrive", "zoho"], caps: ["untrusted", "private", "write"], maybe: ["act"], note: "Customer messages are written by outsiders and the records are sensitive." },
  { kind: "Tickets and projects", words: ["jira", "linear", "asana", "trello", "clickup", "monday", "azure devops", "shortcut"], caps: ["private", "write"], maybe: ["untrusted"], note: "Tickets can be raised by people outside if the board is open to them." },
  { kind: "Finance and HR systems", words: ["workday", "bamboohr", "payroll", "gusto", "rippling", "quickbooks", "xero", "netsuite", "sap", "erp"], caps: ["private", "write"], maybe: ["act"], note: "Some of the most sensitive records the organisation holds." },
  { kind: "Memory and knowledge stores", words: ["memory", "mem0", "knowledge graph", "vector", "chroma", "qdrant", "pinecone", "weaviate", "rag"], caps: ["persist"], note: "Stores what it reads, so one bad instruction can come back in later sessions." },
  { kind: "Public content feeds", words: ["context7", "documentation", "readthedocs", "stackoverflow", "stack overflow", "wikipedia", "arxiv", "pubmed", "reddit", "twitter", "youtube", "rss", "hacker news"], caps: ["untrusted"], note: "Text written by the public." },
  { kind: "Logs and monitoring", words: ["sentry", "datadog", "new relic", "grafana", "loki", "splunk"], caps: ["private"], maybe: ["untrusted"], note: "Logs and errors contain text that users typed." },
  { kind: "Harmless utility", words: ["time", "sequential thinking", "sequentialthinking", "everything", "echo", "calculator", "math"], caps: [], note: "No outside reach on its own." },
];

// Plain list mode: OAuth scopes and permission names people paste.
const SCOPES = [
  { words: ["gmail send", "mail send", "send mail", "send email", "gmail compose", "chat write", "chat postmessage", "post message", "sms send"], caps: ["act"], label: "Can send as you" },
  { words: ["gmail readonly", "gmail modify", "mail read", "mail readwrite", "read mail", "inbox", "channels history", "im history", "groups history", "search read", "messages read"], caps: ["untrusted", "private"], label: "Reads messages written by others" },
  { words: ["drive", "files readwrite", "files read", "sites read", "contacts", "calendars"], caps: ["private"], label: "Reads private files or contacts" },
  { words: ["files readwrite", "drive file", "contents write", "pull requests write", "issues write", "repo", "workflow"], caps: ["write", "act"], label: "Can change files or code" },
  { words: ["admin", "owner", "full access", "full control", "all access", "root", "superuser"], caps: ["private", "write", "act"], label: "Administrator-level access" },
];

const HARMLESS = new Set(["Harmless utility"]);

// ---------- reading the text ----------
function stripJsonComments(text) {
  let out = "", inString = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inString) {
      out += ch;
      if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === "/" && next === "/") { while (i < text.length && text[i] !== "\n") i++; out += "\n"; continue; }
    if (ch === "/" && next === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i++; continue; }
    out += ch;
  }
  return out.replace(/,\s*([}\]])/g, "$1");
}

function tryParseJson(text) {
  const trimmed = text.trim();
  if (!/^[{\[]/.test(trimmed)) return null;
  try { return JSON.parse(trimmed); } catch { /* fall through to the lenient reader */ }
  try { return JSON.parse(stripJsonComments(trimmed)); } catch { return null; }
}

const SERVER_CONTAINERS = new Set(["mcpservers", "servers", "context_servers", "mcp_servers"]);
function looksLikeServer(v) {
  return v && typeof v === "object" && !Array.isArray(v) && ("command" in v || "url" in v || "serverUrl" in v || "httpUrl" in v || "args" in v);
}
function collectServers(node, found = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return found;
  for (const [key, value] of Object.entries(node)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (SERVER_CONTAINERS.has(key.toLowerCase())) {
      for (const [name, def] of Object.entries(value)) if (looksLikeServer(def)) found.push({ name, def });
    } else collectServers(value, found, depth + 1);
  }
  if (!found.length && depth === 0) {
    for (const [name, def] of Object.entries(node)) if (looksLikeServer(def)) found.push({ name, def });
  }
  return found;
}

// ---------- looking at one server ----------
const SECRET_NAME = /(key|token|secret|passw|passwd|credential|auth|bearer|cookie)/i;
const PLACEHOLDER = /^(\$\{?[^}]*\}?|<[^>]*>|\{\{.*\}\}|env:.*|%[^%]+%|\$[A-Za-z_]\w*|your[-_ ].*|xxx+|\*+|changeme|todo)$/i;
const KEY_SHAPES = /\b(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|sk_live_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})/;
const URL_PASSWORD_RE = /[a-z][a-z0-9+.-]*:\/\/[^\/\s:@]+:([^\/\s@]+)@/i;
// A password inside a web or database address, unless it is just a placeholder like ${DB_PASS}.
const URL_PASSWORD = { test(value) { const m = URL_PASSWORD_RE.exec(String(value ?? "")); return !!m && !PLACEHOLDER.test(m[1]); } };

function isLiteralSecretValue(value) {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (PLACEHOLDER.test(v)) return false;
  return true;
}

function secretsIn(def) {
  const found = new Set();
  const env = def.env && typeof def.env === "object" ? def.env : {};
  for (const [k, v] of Object.entries(env)) {
    if ((SECRET_NAME.test(k) && isLiteralSecretValue(v)) || KEY_SHAPES.test(String(v)) || URL_PASSWORD.test(String(v))) found.add(`env ${k}`);
  }
  const headers = def.headers && typeof def.headers === "object" ? def.headers : {};
  for (const [k, v] of Object.entries(headers)) {
    const value = String(v ?? "");
    const literal = isLiteralSecretValue(value.replace(/^(bearer|basic)\s+/i, ""));
    if ((SECRET_NAME.test(k) && literal) || KEY_SHAPES.test(value)) found.add(`header ${k}`);
  }
  const args = Array.isArray(def.args) ? def.args.map(String) : [];
  args.forEach((a, i) => {
    const eq = /^--?([A-Za-z-_]*(?:key|token|secret|password|passwd)[A-Za-z-_]*)=(.+)$/i.exec(a);
    if (eq && isLiteralSecretValue(eq[2])) found.add(`argument --${eq[1].replace(/^-+/, "")}`);
    else if (/^--?[A-Za-z-_]*(key|token|secret|password|passwd)[A-Za-z-_]*$/i.test(a) && isLiteralSecretValue(args[i + 1])) found.add(`argument ${a.replace(/^-+/, "--")}`);
    else if (KEY_SHAPES.test(a)) found.add("a key pasted into the arguments");
    if (URL_PASSWORD.test(a)) found.add("a connection string with a password inside");
  });
  const url = String(def.url ?? def.serverUrl ?? def.httpUrl ?? "");
  if (URL_PASSWORD.test(url) || KEY_SHAPES.test(url)) found.add("a key or password in the server address");
  return [...found];
}

function approvalOff(def) {
  const keys = ["alwaysAllow", "autoApprove", "auto_approve", "autoapprove", "always_allow", "trust"];
  for (const key of keys) {
    const v = def[key];
    if (v === true) return { all: true, tools: [] };
    if (Array.isArray(v) && v.length) return { all: v.includes("*"), tools: v.map(String).slice(0, 12) };
  }
  return null;
}

function packageRunner(def) {
  const command = String(def.command ?? "").split(/[\\/]/).pop().toLowerCase();
  const args = Array.isArray(def.args) ? def.args.map(String) : [];
  if (!["npx", "uvx", "bunx", "pnpm", "yarn", "pipx", "deno"].includes(command)) return null;
  const rest = (command === "pnpm" || command === "yarn") ? args.filter((a) => a !== "dlx" && a !== "exec" && a !== "dlx") : args;
  const pkg = rest.find((a) => !a.startsWith("-"));
  if (!pkg) return null;
  return pkg;
}
function isPinned(pkg) {
  if (/@latest$/i.test(pkg)) return false;
  if (/^(@[^/]+\/)?[^@]+@[^@]+$/.test(pkg)) return true;      // name@1.2.3
  if (/==\d/.test(pkg)) return true;                            // python style
  return false;
}

const BROAD_PATHS = new Set(["/", "~", "~/", "$home", "${home}", "c:\\", "c:/", "/users", "/home", "/users/", "/home/", "%userprofile%"]);
function broadPath(arg) {
  const a = String(arg).trim().toLowerCase();
  if (BROAD_PATHS.has(a)) return true;
  return /^\/(users|home)\/[^/]+\/?$/.test(a) || /^c:[\\/]users[\\/][^\\/]+[\\/]?$/.test(a);
}

function hostOf(def) {
  const raw = String(def.url ?? def.serverUrl ?? def.httpUrl ?? "");
  if (!raw) return null;
  try { return new URL(raw).hostname; } catch { return raw.slice(0, 60); }
}
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

function matchKnown(key) {
  const text = ` ${key} `;
  const hits = [];
  for (const entry of KNOWN) {
    if (entry.words.some((w) => text.includes(` ${normalise(w)} `))) hits.push(entry);
  }
  return hits;
}

function analyseServer({ name, def }) {
  const argsText = Array.isArray(def.args) ? def.args.filter((a) => !a.startsWith?.("-")).join(" ") : "";
  const host = hostOf(def);
  // Look at the server's name first, then at what it runs. A user-chosen name wins if it is recognised.
  let hits = matchKnown(normalise(name));
  if (!hits.length) hits = matchKnown(normalise([def.command, argsText, host].filter(Boolean).join(" ")));
  const caps = new Set(), maybe = new Set();
  for (const h of hits) { h.caps.forEach((c) => caps.add(c)); (h.maybe || []).forEach((c) => maybe.add(c)); }
  for (const c of caps) maybe.delete(c);
  const recognised = hits.length > 0;
  const kinds = hits.map((h) => h.kind);
  const notes = hits.filter((h) => h.note && !HARMLESS.has(h.kind)).map((h) => h.note);

  const flags = [];
  const secrets = secretsIn(def);
  if (secrets.length) flags.push({ level: "HIGH", text: `Secrets are written into the file in plain text (${secrets.join(", ")}). Anyone who can read the file can use them. Move them to environment variables or a secrets store, and treat the exposed ones as compromised.` });
  const approvals = approvalOff(def);
  const canAct = caps.has("act") || caps.has("code");
  if (approvals && (canAct || !recognised)) {
    flags.push({ level: "HIGH", text: approvals.all ? "Every tool on this server is set to run without asking. Nobody approves what it does." : `Some tools are set to run without asking (${approvals.tools.join(", ")}). Nobody approves those actions.` });
  } else if (approvals) {
    flags.push({ level: "LOW", text: `Some tools run without asking (${approvals.tools.join(", ")}). Low impact for this server, but worth knowing.` });
  }
  const args = Array.isArray(def.args) ? def.args.map(String) : [];
  if (hits.some((h) => h.kind === "Files") && args.some(broadPath)) {
    flags.push({ level: "HIGH", text: "File access covers a whole home folder or drive. Limit it to the one folder the task needs." });
  }
  if (host && !LOCAL_HOSTS.has(host)) {
    flags.push({ level: "MEDIUM", text: `Talks to a remote server (${host}). What the agent sends there leaves your control.` });
  }
  const pkg = packageRunner(def);
  if (pkg && !isPinned(pkg)) {
    flags.push({ level: "MEDIUM", text: `Downloads and runs the newest version of ${pkg} each time it starts. A changed or hijacked package would run with this agent's access. Pin a version.` });
  }
  if (def.disabled === true) flags.push({ level: "LOW", text: "Marked disabled in the file, so left out of the result below." });
  if (!recognised) flags.push({ level: "LOW", text: "Not recognised by name. Treat it as able to do anything until you've checked what it connects to." });

  return { name, kinds, caps: [...caps], maybe: [...maybe], notes, flags, recognised, disabled: def.disabled === true, host, secretCount: secrets.length };
}

// ---------- the list of tools and permissions (plain text) ----------
function analyseList(text) {
  const lines = text.split(/\r?\n|,|;/).map((l) => l.trim()).filter(Boolean).slice(0, 400);
  const out = [];
  for (const line of lines) {
    const key = normalise(line);
    if (!key) continue;
    const caps = new Set(), maybe = new Set(), kinds = [], notes = [];
    for (const h of matchKnown(key)) { h.caps.forEach((c) => caps.add(c)); (h.maybe || []).forEach((c) => maybe.add(c)); kinds.push(h.kind); if (h.note && !HARMLESS.has(h.kind)) notes.push(h.note); }
    for (const s of SCOPES) {
      if (s.words.some((w) => ` ${key} `.includes(` ${normalise(w)} `))) { s.caps.forEach((c) => caps.add(c)); kinds.push(s.label); }
    }
    for (const c of caps) maybe.delete(c);
    out.push({ name: line.slice(0, 80), kinds: [...new Set(kinds)], caps: [...caps], maybe: [...maybe], notes, flags: [], recognised: kinds.length > 0, disabled: false, host: null, secretCount: 0 });
  }
  return out;
}

// ---------- putting it together ----------
function legState(servers, cap) {
  if (servers.some((s) => s.caps.includes(cap))) return "yes";
  if (servers.some((s) => s.maybe.includes(cap))) return "maybe";
  return "no";
}

export function checkConfig(text) {
  const input = String(text ?? "");
  if (!input.trim()) return { error: "Paste the configuration first." };
  if (input.length > MAX_CHARS) return { error: "That is too long to read here. Paste just the part that lists the tools or servers." };

  const parsed = tryParseJson(input);
  let servers = [], mode = "list";
  if (parsed) {
    const found = collectServers(parsed);
    if (found.length) { servers = found.map(analyseServer); mode = "mcp"; }
  }
  if (!servers.length) {
    if (parsed) return { error: "That is valid JSON, but I couldn't find a list of servers in it. Look for a section called mcpServers or servers and paste that, or paste a plain list of the tools and permissions the agent has." };
    servers = analyseList(input);
    mode = "list";
  }
  if (!servers.length) return { error: "Nothing to read. Paste the configuration, or a list of the tools and permissions the agent has." };

  const active = servers.filter((s) => !s.disabled);
  const legs = {
    untrusted_input: legState(active, "untrusted"),
    private_data: legState(active, "private"),
    outward_action: (() => {
      const a = legState(active, "act"), c = legState(active, "code");
      if (a === "yes" || c === "yes") return "yes";
      if (a === "maybe" || c === "maybe") return "maybe";
      return "no";
    })(),
  };
  const unrecognised = active.filter((s) => !s.recognised);
  const values = Object.values(legs);
  let status;
  if (values.every((v) => v === "yes")) status = "OPEN";
  else if (values.some((v) => v === "no")) status = unrecognised.length ? "UNKNOWN" : "CLOSED";
  else status = "POSSIBLE";

  const approvalOffAnywhere = active.some((s) => s.flags.some((f) => /without asking|Nobody approves/.test(f.text) && f.level === "HIGH"));

  const missing = Object.entries(legs).filter(([, v]) => v === "no").map(([k]) => ({ untrusted_input: "outside content reaching it", private_data: "private data", outward_action: "an action it can take on its own" }[k]));
  let headline, narrative;
  if (status === "OPEN") {
    headline = approvalOffAnywhere
      ? "All three ingredients are present, and approvals are switched off."
      : "All three ingredients are present.";
    narrative = "This agent can read text that outsiders can write, can see private data, and can act on other systems. That is what a prompt-injection attack needs: a hostile email, web page or ticket carries instructions, and the agent has everything it needs to follow them. " +
      (approvalOffAnywhere ? "Some actions run without anyone approving them, so there is nothing in between."
        : "Whether anyone is stopped depends on your client asking a person to approve each action. This file doesn't show that, so check it.");
  } else if (status === "POSSIBLE") {
    headline = "All three ingredients are possible.";
    narrative = "Some of what this agent connects to can carry outside text, hold private data or act, depending on how it is set up. Find out who can write to those systems and what the credentials allow.";
  } else if (status === "UNKNOWN" && active.every((x) => !x.recognised)) {
    headline = "We couldn't recognise anything in that, so we can't tell you either way.";
    narrative = "Nothing you pasted matched a tool or server we know. That is not the same as safe. If this is a configuration file, check it is complete and paste the part that lists the servers. If it is a list, name each tool and say what it can do, for example reads email, writes to the database, sends messages.";
  } else if (status === "UNKNOWN") {
    headline = `No full path found, but ${unrecognised.length === 1 ? "one thing wasn't" : unrecognised.length + " things weren't"} recognised.`;
    narrative = `On the parts we recognised, ${missing.join(" and ")} is missing, which would break this path. The parts we didn't recognise could change that, so this is not a clear result.`;
  } else {
    headline = "No full attack path found.";
    narrative = `${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} missing from what this agent connects to, so the standard path doesn't complete. Other risks remain, see the notes below.`;
  }

  const breaks = [];
  if (status === "OPEN" || status === "POSSIBLE") {
    if (legs.outward_action !== "no") breaks.push("Require a person to approve every send, write, payment or command. Turn off any auto-approve settings.");
    if (legs.private_data !== "no") breaks.push("Give it the smallest set of data it needs, using separate read-only credentials where you can.");
    if (legs.untrusted_input !== "no") breaks.push("Split the job: one agent reads outside content and can't act, another acts but never reads outside content.");
  }

  const allFlags = [];
  for (const s of active) for (const f of s.flags) allFlags.push({ ...f, server: s.name });
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  allFlags.sort((a, b) => order[a.level] - order[b.level]);

  return {
    version: CHECK_VERSION, mode, status, headline, narrative, legs, breaks,
    servers: servers.map(({ flags, ...rest }) => rest),
    flags: allFlags,
    unrecognised: unrecognised.map((s) => s.name),
    inferred: true,
  };
}

export function capLabels(caps) { return caps.map((c) => CAP_LABEL[c]).filter(Boolean); }

export function summaryText(result) {
  if (!result || result.error) return "";
  const lines = [`Sentinel configuration check: ${result.headline}`, result.narrative, ""];
  lines.push("Outside content can reach it: " + result.legs.untrusted_input);
  lines.push("Can see private data: " + result.legs.private_data);
  lines.push("Can act on other systems: " + result.legs.outward_action);
  if (result.breaks.length) { lines.push("", "Ways to break the path:"); result.breaks.forEach((b) => lines.push("- " + b)); }
  if (result.flags.length) { lines.push("", "Other findings:"); result.flags.forEach((f) => lines.push(`- [${f.level}] ${f.server}: ${f.text}`)); }
  lines.push("", "Inferred from names and settings in the file. Not tested against the real agent or its credentials.");
  return lines.join("\n");
}
