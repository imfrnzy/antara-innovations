// Shared helpers for browser tests: a static server, a stand-in for supabase-js, and a browser launcher.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { chromium } from "/tmp/work/build/node_modules/playwright-core/index.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json" };

export function serve(port = 0) {
  const server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    let f = join(ROOT, p);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
    if (!existsSync(f)) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": TYPES[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

// A tiny stand-in for supabase-js. The page gets window.__mock = { session, tables, log }.
const STUB = `
const m = () => window.__mock;
function query(table) {
  const st = { table, filters: [], order: null, mode: "select", payload: null };
  const rows = () => { let r = (m().tables[table] || []).filter((x) => st.filters.every(([k, v, isIn]) => (isIn ? v.includes(x[k]) : x[k] === v))); return r; };
  const done = (single) => {
    if (st.mode === "insert" || st.mode === "upsert") { m().log.push({ op: st.mode, table, payload: st.payload }); return { data: st.payload, error: m().errors && m().errors[table] ? { message: "err" } : null }; }
    const r = rows();
    return { data: single ? (r[0] || null) : r, error: null };
  };
  const b = {
    select() { return b; }, eq(k, v) { st.filters.push([k, v]); return b; }, in(k, vals) { st.filters.push([k, vals, true]); return b; }, order() { return b; }, limit() { return b; },
    insert(p) { st.mode = "insert"; st.payload = p; return b; }, upsert(p) { st.mode = "upsert"; st.payload = p; return b; },
    maybeSingle() { return Promise.resolve(done(true)); }, single() { return Promise.resolve(done(true)); },
    then(res, rej) { return Promise.resolve(done(false)).then(res, rej); },
  };
  return b;
}
export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: m().session } }),
      signInAnonymously: async () => ({ data: { session: m().session }, error: null }),
    },
    from: (t) => query(t),
    rpc: async (name, args) => { m().log.push({ op: "rpc", name, args }); const q = (m().rpcQueue || {})[name]; const data = q && q.length ? q.shift() : (m().rpc || {})[name]; return { data: data === undefined ? null : data, error: (m().rpcErrors || {})[name] ? { message: "err" } : null }; },
    functions: { invoke: async (name, o) => { m().log.push({ op: "invoke", name, body: o && o.body }); return { data: (m().invoke || {})[name] || {}, error: null }; } },
  };
}
`;

export async function launch(base, { mock, viewport = { width: 1100, height: 900 }, localStorage = {} } = {}) {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  const page = await context.newPage();
  const requests = [];
  page.on("request", (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errors.push("console: " + m.text()); });
  await page.route("**/cdn.jsdelivr.net/**", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: STUB }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.addInitScript(([mockData, ls]) => {
    window.__mock = Object.assign({ session: { user: { id: "u1" } }, tables: {}, log: [] }, mockData);
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
  }, [mock || {}, localStorage]);
  return { browser, context, page, requests, errors };
}
