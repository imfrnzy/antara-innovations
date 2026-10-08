// Manifest agent. Runs every night from a Supabase scheduled job (see
// supabase/manifest-agent-schedule.sql). Checks every active client against the
// funding and score rules, and sends each clinician ONE email listing what needs
// a look. Never contacts an insurer. Never emails anyone but the clinician.
// Emails carry only the short client code and a headline, never scores, never a
// name. The detail lives behind the sign-in, in Manifest.
//
// Name the function exactly: manifest-agent. In the dashboard turn OFF
// "Verify JWT" for this function: it is called by the scheduler, not a signed-in
// user, and protects itself with the x-cron-secret header instead.
// Secrets needed: CRON_SECRET, RESEND_API_KEY, MANIFEST_FROM
//   MANIFEST_FROM example: Manifest <manifest@your-verified-domain>  (same sender
//   domain you already verified in Resend for the sign-in codes)
// Optional: SITE_URL (default https://www.antara-innovations.com)
// Test without sending anything: POST with header x-cron-secret and body {"dry":true}

import { createClient } from "npm:@supabase/supabase-js@2";

// ---- rules, copied verbatim from tools/manifest/agent-rules.js (tests check they agree) ----
// Manifest agent rules. Pure functions, no network, no AI: same inputs give the
// same answer every time. The browser uses this file to show each client's
// status. The nightly edge function (supabase/functions/manifest-agent) carries
// an identical copy, and tests/agent-rules.test.mjs checks the two agree.
//
// Facts only. Nothing here decides anything clinical. Alerts report what the
// numbers do against NHS Talking Therapies' published point-change thresholds
// and leave the clinical judgement to the clinician.

const MEASURES = {
  phq9: { label: "PHQ-9", reliableChangeThreshold: 6, casenessThreshold: 10 },
  gad7: { label: "GAD-7", reliableChangeThreshold: 4, casenessThreshold: 8 },
};

// Funding warning points. LOW_AT sessions left or fewer triggers the early
// warning, because Bupa says its decision can take up to three working days.
const LOW_AT = 2;
// Trajectory review starts once this many scored check-ins exist after baseline.
const REVIEW_AFTER = 4;

// checkins: [{ id, session_date: "YYYY-MM-DD", phq9: number|null, gad7: number|null }]
function sortCheckins(checkins) {
  return [...(checkins ?? [])].sort((a, b) =>
    a.session_date === b.session_date ? String(a.created_at ?? a.id).localeCompare(String(b.created_at ?? b.id)) : a.session_date < b.session_date ? -1 : 1);
}

function fundingStatus(client, checkins) {
  const used = (client.sessions_done_before ?? 0) + (checkins?.length ?? 0);
  const left = (client.sessions_authorised ?? 0) - used;
  let level = "ok";
  if (left <= 0) level = "out";
  else if (left <= LOW_AT) level = "low";
  return { used, authorised: client.sessions_authorised, left, level };
}

// Latest score per measure and the baseline it is compared with. The baseline
// is the one stored on the client; if none, the first scored check-in stands in.
function scoreTrack(client, checkins) {
  const sorted = sortCheckins(checkins);
  const out = {};
  for (const key of Object.keys(MEASURES)) {
    const scored = sorted.filter((c) => c[key] !== null && c[key] !== undefined);
    const stored = client[`${key}_baseline`];
    let baseline = stored !== null && stored !== undefined ? stored : (scored[0] ? scored[0][key] : null);
    // When the first scored check-in is standing in as the baseline it must
    // not also count as a later reading.
    const later = (stored !== null && stored !== undefined) ? scored : scored.slice(1);
    if (baseline === null || later.length === 0) { out[key] = null; continue; }
    const latest = later[later.length - 1][key];
    const change = baseline - latest;
    const m = MEASURES[key];
    out[key] = {
      measure: m.label, baseline, latest, change, readings: later.length,
      reliableImprovement: change >= m.reliableChangeThreshold,
      reliableDeterioration: change <= -m.reliableChangeThreshold,
      startedAboveCaseness: baseline >= m.casenessThreshold,
      nowBelowCaseness: latest < m.casenessThreshold,
    };
  }
  return out;
}

// Returns the flags the agent would raise right now. Each has a stable key so
// the nightly job can tell whether it has already emailed about it.
function flagsFor(client, checkins) {
  const flags = [];
  const f = fundingStatus(client, checkins);
  const auth = client.sessions_authorised;
  if (f.level === "out") {
    flags.push({ kind: "funding_out", key: `out-${auth}`, severity: "red",
      text: `Funded sessions used up (${f.used} of ${auth}). A further session may not be funded until the insurer approves more.` });
  } else if (f.level === "low") {
    flags.push({ kind: "funding_low", key: `low-${auth}`, severity: "amber",
      text: `${f.left} funded session${f.left === 1 ? "" : "s"} left of ${auth}. Worth sending the extension request soon, insurers can take a few working days to decide.` });
  }

  const track = scoreTrack(client, checkins);
  const scored = Object.values(track).filter(Boolean);
  const latestScoredId = (() => {
    const s = sortCheckins(checkins).filter((c) => c.phq9 != null || c.gad7 != null);
    return s.length ? s[s.length - 1].id : null;
  })();

  const worse = scored.filter((r) => r.reliableDeterioration);
  if (worse.length) {
    flags.push({ kind: "scores_worse", key: `worse-${latestScoredId}`, severity: "red",
      text: worse.map((r) => `${r.measure} is ${r.latest}, up ${-r.change} from a baseline of ${r.baseline}, which meets the NHS reliable-change threshold for deterioration.`).join(" ") + " For your clinical review." });
  }

  const readings = scored.length ? Math.max(...scored.map((r) => r.readings)) : 0;
  if (!worse.length && readings >= REVIEW_AFTER && scored.every((r) => !r.reliableImprovement)) {
    // One alert per even number of readings from the review point, so a long
    // flat run raises a reminder now and then and never every night.
    const bucket = readings - (readings % 2);
    flags.push({ kind: "scores_flat", key: `flat-${bucket}`, severity: "amber",
      text: `After ${readings} scored sessions, no measure has reached the NHS reliable-change threshold for improvement (${scored.map((r) => `${r.measure} ${r.baseline} to ${r.latest}`).join(", ")}). Worth thinking about before the next review. For your clinical judgement.` });
  }
  return flags;
}

function worstSeverity(flags) {
  if (flags.some((f) => f.severity === "red")) return "red";
  if (flags.some((f) => f.severity === "amber")) return "amber";
  return "ok";
}

// ---- end rules ----

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const HEADLINE = {
  funding_low: (c, f) => `${c}: funded sessions running low (${f.left} left)`,
  funding_out: (c) => `${c}: funded sessions used up`,
  scores_worse: (c) => `${c}: scores worth a look`,
  scores_flat: (c) => `${c}: scores worth a look`,
};

export function makeHandler(deps = {}) {
  const env = deps.env ?? ((k) => Deno.env.get(k));
  const mk = deps.createClient ?? createClient;
  const doFetch = deps.fetch ?? fetch;

  return async function handler(req) {
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);
    const secret = env("CRON_SECRET");
    if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Not allowed." }, 401);

    let body = {};
    try { body = await req.json(); } catch { /* an empty body is fine */ }
    const dry = body?.dry === true;

    const resendKey = env("RESEND_API_KEY");
    const from = env("MANIFEST_FROM");
    if (!dry && (!resendKey || !from)) return json({ ok: false, reason: "email_not_configured" });
    const site = (env("SITE_URL") ?? "https://www.antara-innovations.com").replace(/\/$/, "");

    const db = mk(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

    const { data: clients, error: cErr } = await db.from("manifest_clients").select("*").eq("status", "active").eq("reminders", true);
    if (cErr) return json({ ok: false, reason: "clients_read_failed", detail: String(cErr.message ?? cErr) }, 500);
    if (!clients?.length) return json({ ok: true, dry, clients: 0, emails: 0, items: 0 });

    const ids = clients.map((c) => c.id);
    const { data: checkins, error: kErr } = await db.from("manifest_checkins").select("id,client_id,session_date,phq9,gad7,created_at").in("client_id", ids);
    if (kErr) return json({ ok: false, reason: "checkins_read_failed" }, 500);
    const { data: sent, error: aErr } = await db.from("manifest_alerts").select("client_id,kind,dedupe_key").in("client_id", ids);
    if (aErr) return json({ ok: false, reason: "alerts_read_failed" }, 500);
    const already = new Set((sent ?? []).map((a) => `${a.client_id}|${a.kind}|${a.dedupe_key}`));

    // Work out what is new, per clinician.
    const perUser = new Map();
    for (const c of clients) {
      const mine = (checkins ?? []).filter((k) => k.client_id === c.id);
      const f = fundingStatus(c, mine);
      for (const flag of flagsFor(c, mine)) {
        if (already.has(`${c.id}|${flag.kind}|${flag.key}`)) continue;
        if (!perUser.has(c.user_id)) perUser.set(c.user_id, []);
        perUser.get(c.user_id).push({ client_id: c.id, user_id: c.user_id, kind: flag.kind, dedupe_key: flag.key, line: HEADLINE[flag.kind](c.client_ref, f) });
      }
    }

    let emails = 0, items = 0, failed = 0, skipped = 0;
    const preview = [];
    for (const [userId, list] of perUser) {
      const { data: u } = await db.auth.admin.getUserById(userId);
      const email = u?.user?.email;
      if (!email || u.user.is_anonymous) { skipped++; continue; }

      if (dry) { preview.push({ to: email, lines: list.map((l) => l.line) }); items += list.length; emails++; continue; }

      // Claim first, send second. If two runs overlap, only one gets the rows.
      const { data: claimed, error: claimErr } = await db.from("manifest_alerts")
        .upsert(list.map(({ client_id, user_id, kind, dedupe_key }) => ({ client_id, user_id, kind, dedupe_key })),
          { onConflict: "client_id,kind,dedupe_key", ignoreDuplicates: true })
        .select("id,client_id,kind,dedupe_key");
      if (claimErr || !claimed?.length) { if (claimErr) failed++; continue; }
      const claimedKeys = new Set(claimed.map((r) => `${r.client_id}|${r.kind}|${r.dedupe_key}`));
      const toSend = list.filter((l) => claimedKeys.has(`${l.client_id}|${l.kind}|${l.dedupe_key}`));

      const subject = toSend.length === 1 ? "Manifest: one thing needs a look" : `Manifest: ${toSend.length} things need a look`;
      const text = `${toSend.map((l) => "- " + l.line).join("\n")}\n\nOpen Manifest to see the detail and decide what to do:\n${site}/tools/manifest/\n\nManifest only ever emails you, never your client's insurer. You can switch these reminders off for any client under My clients.`;
      const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1A2420;max-width:520px"><ul>${toSend.map((l) => `<li>${esc(l.line)}</li>`).join("")}</ul><p><a href="${site}/tools/manifest/">Open Manifest</a> to see the detail and decide what to do.</p><p style="font-size:12px;color:#5B6960">Manifest only ever emails you, never your client's insurer. You can switch these reminders off for any client under My clients.</p></div>`;

      let ok = false;
      try {
        const r = await doFetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [email], subject, text, html }),
        });
        ok = r.ok;
      } catch { ok = false; }

      if (ok) { emails++; items += toSend.length; }
      else {
        failed++;
        // Give the claim back so tomorrow's run tries again.
        await db.from("manifest_alerts").delete().in("id", claimed.map((r) => r.id));
      }
    }
    return json({ ok: failed === 0, dry, clients: clients.length, emails, items, failed, skipped, ...(dry ? { preview } : {}) });
  };
}

if (!Deno.env.get("MANIFEST_TEST")) Deno.serve(makeHandler());
