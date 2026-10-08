// Tiny in-memory stand-in for supabase-js, just enough for the Manifest functions.
// Row level security is simulated: a user-scoped client only sees its own user_id rows.
export function makeFakeSupabase(seed: Record<string, any[]>, opts: { users?: Record<string, any> } = {}) {
  const tables: Record<string, any[]> = JSON.parse(JSON.stringify(seed));
  let idn = 1000;
  const users = opts.users ?? {};
  const log: any[] = [];

  function client(scope: { userId?: string } = {}) {
    const rls = (t: string, rows: any[]) =>
      scope.userId && rows.length && "user_id" in (rows[0] ?? {}) ? rows.filter((r) => r.user_id === scope.userId) : rows;
    return {
      auth: {
        getUser: async () => ({ data: { user: scope.userId ? users[scope.userId] ?? null : null } }),
        admin: { getUserById: async (id: string) => ({ data: { user: users[id] ?? null } }) },
      },
      from(t: string) {
        tables[t] ??= [];
        const st: any = { t, filters: [] as ((r: any) => boolean)[], mode: "select", payload: null, head: false, count: null, ord: null, lim: null, opts: {} };
        const run = () => {
          let rows = rls(t, tables[t]).filter((r) => st.filters.every((f: any) => f(r)));
          if (st.mode === "select") {
            if (st.ord) rows = [...rows].sort((a, b) => (a[st.ord.c] < b[st.ord.c] ? 1 : -1) * (st.ord.asc ? -1 : 1));
            if (st.lim) rows = rows.slice(0, st.lim);
            return { data: st.head ? null : rows.map((r) => ({ ...r })), error: null, count: st.count ? rows.length : null };
          }
          if (st.mode === "insert") {
            const add = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((r: any) => ({ id: "id" + ++idn, ...r }));
            tables[t].push(...add); log.push(["insert", t, add]);
            return { data: add, error: null };
          }
          if (st.mode === "upsert") {
            const keys = String(st.opts.onConflict ?? "id").split(",");
            const added: any[] = [];
            const list = Array.isArray(st.payload) ? st.payload : [st.payload];
            for (const r of list) {
              const hit = tables[t].find((x) => keys.every((k) => x[k] === r[k]));
              if (!hit) { const row = { id: "id" + ++idn, ...r }; tables[t].push(row); added.push(row); }
              else if (!st.opts.ignoreDuplicates) { Object.assign(hit, r); added.push(hit); }
            }
            return { data: added, error: null };
          }
          if (st.mode === "update") {
            for (const r of rows) Object.assign(r, st.payload);
            log.push(["update", t, rows.length]);
            return { data: rows, error: null };
          }
          if (st.mode === "delete") {
            const gone = new Set(rows); tables[t] = tables[t].filter((r) => !gone.has(r)); log.push(["delete", t, rows.length]);
            return { data: null, error: null };
          }
          return { data: null, error: null };
        };
        const b: any = {
          select(_c?: string, o?: any) { if (st.mode === "select" || st.mode === "upsert" || st.mode === "insert") { if (st.mode === "select") { st.head = !!o?.head; st.count = o?.count ?? null; } } return b; },
          eq(k: string, v: any) { st.filters.push((r: any) => r[k] === v); return b; },
          in(k: string, arr: any[]) { st.filters.push((r: any) => arr.includes(r[k])); return b; },
          gte(k: string, v: any) { st.filters.push((r: any) => r[k] >= v); return b; },
          order(c: string, o: any) { st.ord = { c, asc: o?.ascending !== false }; return b; },
          limit(n: number) { st.lim = n; return b; },
          insert(p: any) { st.mode = "insert"; st.payload = p; return b; },
          upsert(p: any, o: any) { st.mode = "upsert"; st.payload = p; st.opts = o ?? {}; return b; },
          delete() { st.mode = "delete"; return b; },
          update(p: any) { st.mode = "update"; st.payload = p; return b; },
          single() { const r: any = run(); return Promise.resolve({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }); },
          maybeSingle() { const r: any = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: null }); },
          then(res: any, rej: any) { return Promise.resolve(run()).then(res, rej); },
        };
        return b;
      },
    };
  }
  return {
    createClient: (_url: string, key: string, o?: any) => {
      if (key === "service") return client();
      const auth = o?.global?.headers?.Authorization ?? "";
      const m = /^Bearer ([0-9a-zA-Z-]+)\./.exec(auth);
      return client({ userId: m?.[1] });
    },
    tables, log,
  };
}
export const jwt = (uid: string, methods: string[] = ["otp"]) =>
  `Bearer ${uid}.` + btoa(JSON.stringify({ amr: methods.map((method) => ({ method })) })).replace(/=+$/, "") + ".sig";
