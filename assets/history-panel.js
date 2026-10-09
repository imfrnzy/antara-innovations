// Saved scans panel, shared by Soundings (records check) and Sentinel (configuration check).
// Draws into one element. Talks to the database only through the scan_history table and my_plan().
//
// What the visitor gets
//   Not signed in: an explanation and an email box. Nothing is saved without an email we have confirmed.
//   Free account:  keeps 3 saved scans per tool and can compare any two of them.
//   Pro:           keeps up to 200, sees a timeline across all of them, downloads the change report.
// The limits are enforced by the database (migration 030), not by this page.

import { compare, describeSaveError, savesAllowed, trend, FREE_SAVES, PRO_SAVES } from "./history.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => {
  try { return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return String(iso || ""); }
};
const PENDING_MAX_AGE = 24 * 60 * 60 * 1000;

const COPY = {
  soundings: {
    name: "Soundings", noun: "records check",
    keeps: "the names of the AI tools it found, their categories and how many rows matched",
    never: "your file, any row from it, or the text you pasted",
    teaser: "Run it again next month and see which AI tools are new, which have gone, and which are still not on your map.",
  },
  sentinel: {
    name: "Sentinel", noun: "configuration check",
    keeps: "the names of the connections it found, what each can do, and the findings",
    never: "your file, command lines, or any secret value",
    teaser: "Check the agent again after a change and see exactly what it can now reach, see or do that it couldn't before.",
  },
  keel: {
    name: "Keel", noun: "readiness report", scored: true,
    keeps: "your operating model and how each readiness area scored",
    never: "your answers, the conversation, or anything you typed",
    teaser: "Come back after a quarter and see which readiness areas moved, and whether the operating model still fits.",
  },
  halo: {
    name: "HALO", noun: "practice report", scored: true,
    keeps: "how each practice area scored",
    never: "your answers, the conversation, or anything you typed",
    teaser: "Come back in a month and see which habits got stronger and which slipped.",
  },
  bearing: {
    name: "Bearing", noun: "assessment", scored: true,
    keeps: "the readiness score for each area and the status of each obligation",
    never: "your answers or anything you typed",
    teaser: "Run it again after you fix something and see exactly which obligations moved from not yet to ready.",
  },
  squall: {
    name: "Squall", noun: "result", scored: true,
    keeps: "your score and your score for each type of message",
    never: "your individual answers",
    teaser: "Run it again after training and see whether people really got better at spotting the fakes.",
  },
  ensign: {
    name: "Ensign", noun: "result", scored: true,
    keeps: "your score and your score for each type of decision",
    never: "your individual answers or your written reply",
    teaser: "Run it again after a briefing and see whether decisions about labelling AI content got sharper.",
  },
};

export function mountHistoryPanel(opts) {
  const { el, sb, tool, getSnapshot, viewOnly = false, contactEmail = "", proPriceLabel = "", redirectTo = location.origin + location.pathname } = opts;
  const copy = COPY[tool];
  const pendingKey = `hp.pending.${tool}`;
  let acct = { email: null, anonymous: true, plan: "free" };
  let saved = [];
  let picked = [];
  let diff = null;
  let msg = "", err = "", sentTo = "", labelDraft = "";
  let loading = true, busy = false;

  const readPending = () => {
    try {
      const raw = localStorage.getItem(pendingKey);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p || !p.snapshot || Date.now() - p.at > PENDING_MAX_AGE) { localStorage.removeItem(pendingKey); return null; }
      return p;
    } catch { return null; }
  };
  const writePending = (snapshot) => { try { localStorage.setItem(pendingKey, JSON.stringify({ snapshot, at: Date.now() })); } catch { /* storage can be blocked */ } };
  const clearPending = () => { try { localStorage.removeItem(pendingKey); } catch { /* ignore */ } };

  async function load() {
    loading = true; draw();
    try {
      const { data: { session } } = await sb.auth.getSession();
      const u = session && session.user;
      acct = { email: u && u.email ? u.email : null, anonymous: !u || u.is_anonymous === true || !u.email, plan: "free" };
      saved = [];
      if (!acct.anonymous) {
        const { data: plan } = await sb.rpc("my_plan");
        acct.plan = plan === "pro" ? "pro" : "free";
        const { data: rows, error } = await sb.from("scan_history").select("id,label,snapshot,created_at").eq("tool", tool);
        if (error) throw error;
        saved = (rows || []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      }
      picked = picked.filter((id) => saved.some((r) => r.id === id));
      if (picked.length < 2) diff = null;
    } catch (e) {
      console.error(e);
      err = "Couldn't load your saved scans. Refresh the page and try again.";
    }
    loading = false; draw();
  }

  async function sendLink(email) {
    // Always a real email link. The person proves they own the address by opening it.
    // (Adding an email to the anonymous visitor would apply it instantly when "Confirm email" is off, with no proof.)
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
    if (error) throw error;
  }

  async function save(snapshot, label) {
    busy = true; err = ""; msg = ""; draw();
    try {
      const { data: { session } } = await sb.auth.getSession();
      const { error } = await sb.from("scan_history").insert({ user_id: session.user.id, tool, label: String(label || "").slice(0, 80), snapshot });
      if (error) { err = describeSaveError(error.message); }
      else { msg = "Saved."; clearPending(); }
    } catch (e) {
      console.error(e);
      err = describeSaveError(e && e.message);
    }
    busy = false;
    await load();
  }

  async function remove(id) {
    busy = true; err = ""; msg = ""; draw();
    try {
      const { error } = await sb.from("scan_history").delete().eq("id", id);
      if (error) err = "Couldn't delete that. Try again.";
      else { msg = "Deleted."; picked = picked.filter((p) => p !== id); diff = null; }
    } catch (e) { console.error(e); err = "Couldn't delete that. Try again."; }
    busy = false;
    await load();
  }

  function runCompare() {
    const rows = picked.map((id) => saved.find((r) => r.id === id)).filter(Boolean)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (rows.length !== 2) { err = "Tick two saved scans to compare."; draw(); return; }
    const d = compare(rows[0].snapshot, rows[1].snapshot);
    if (d.error) { err = d.error; diff = null; } else { err = ""; diff = { ...d, from: rows[0], to: rows[1] }; }
    draw();
  }

  function reportText(d) {
    const lines = [`Antara ${copy.noun}: what changed`, `From ${fmtDate(d.from.created_at)}${d.from.label ? " (" + d.from.label + ")" : ""}`, `To ${fmtDate(d.to.created_at)}${d.to.label ? " (" + d.to.label + ")" : ""}`, "", d.headline, ""];
    for (const c of d.changes) lines.push(`- ${c.tone === "worse" ? (copy.scored ? "[worse] " : "[more exposure] ") : c.tone === "better" ? (copy.scored ? "[better] " : "[less exposure] ") : ""}${c.text}`);
    lines.push("", copy.scored ? "Built from saved summaries of two results. It compares scores, it does not re-check anything." : "Built from saved summaries of two scans. Inferred from names and settings, not tested against the real systems.");
    return lines.join("\r\n");
  }
  function download(name, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function proPitch() {
    const subject = encodeURIComponent("Pro access for Antara scans");
    const body = encodeURIComponent(`Hello,\n\nI'd like Pro access for ${copy.name}.\n\nAccount email: ${acct.email || "(sign in first)"}\nOrganisation:\n\nThanks`);
    return `<div class="hp-lock"><p class="hp-head">Pro</p>
      <p>Up to ${PRO_SAVES} saved scans for each tool, a timeline across all of them, and a downloadable change report. ${esc(copy.teaser)}</p>
      <p>${proPriceLabel ? esc(proPriceLabel) + ". " : ""}Email us and we'll set it up on your account by hand. No card form, no automatic charge.</p>
      <p><a class="btn" href="mailto:${esc(contactEmail)}?subject=${subject}&body=${body}" data-hp="pro-mail">Ask for Pro access</a></p></div>`;
  }

  function timelineSvg() {
    const rows = saved.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map((r) => ({ ...r.snapshot, at: r.created_at }));
    if (rows.length < 2) return "<p class=\"hp-small\">Save at least two scans to see a timeline.</p>";
    const t = trend(rows);
    const max = Math.max(...t.map((p) => p.value), 1);
    const w = 520, h = 90, pad = 14;
    const x = (i) => pad + (i * (w - pad * 2)) / (t.length - 1);
    const y = (v) => h - 22 - (v / max) * (h - 40);
    const pts = t.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    const dots = t.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5" fill="currentColor"><title>${esc(fmtDate(p.at))}: ${esc(p.label)}</title></circle>`).join("");
    const first = t[0], last = t[t.length - 1];
    return `<svg class="hp-trend" viewBox="0 0 ${w} ${h}" role="img" aria-label="Timeline of your saved scans, from ${esc(first.label)} to ${esc(last.label)}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5"/>${dots}
      <text x="${pad}" y="${h - 4}">${esc(first.label)}</text><text x="${w - pad}" y="${h - 4}" text-anchor="end">${esc(last.label)}</text></svg>`;
  }

  function draw() {
    if (loading) { el.innerHTML = `<div class="hp"><p class="hp-small">Loading…</p></div>`; return; }
    const snap = getSnapshot ? getSnapshot() : null;
    const pending = readPending();
    let body = "";

    if (acct.anonymous) {
      body = `
        <h3>${viewOnly ? "Already saved a scan?" : "Keep this and see what changes next time"}</h3>
        <p>${viewOnly ? "Sign in with the email you used and your saved scans appear here." : esc(copy.teaser)}</p>
        <p class="hp-small">Saving keeps ${esc(copy.keeps)}. It never keeps ${esc(copy.never)}. Nothing is saved unless you press Save.</p>
        ${sentTo ? `<p class="hp-ok" role="status">We've sent a link to <b>${esc(sentTo)}</b>. Open it on this device and you'll come back to this page.${snap ? " Your scan is kept here until then." : ""}</p>` : `
        <form class="hp-row" data-hp="signin" novalidate>
          <input type="email" name="email" placeholder="Your work email" autocomplete="email" maxlength="120" aria-label="Your work email" required>
          <button class="btn btn-solid" type="submit"${busy ? " disabled" : ""}>Email me a sign-in link</button>
        </form>`}
        <p class="hp-err" role="alert">${esc(err)}</p>`;
    } else {
      const allowed = savesAllowed(acct.plan);
      const full = saved.length >= allowed;
      const pct = Math.min(100, Math.round((saved.length / allowed) * 100));
      body = `
        <h3>Your saved ${esc(copy.noun)}s<span class="hp-badge ${acct.plan}">${acct.plan === "pro" ? "Pro" : "Free"}</span></h3>
        <p class="hp-small">Signed in as ${esc(acct.email)}. <button class="linkish" type="button" data-hp="signout">Sign out</button></p>
        <div class="hp-meter" aria-hidden="true"><span style="width:${pct}%"></span></div>
        <p class="hp-small">${saved.length} of ${allowed} saved</p>
        ${pending && !snap ? `<div class="hp-lock"><p>You ran a ${esc(copy.noun)} before signing in.</p><div class="hp-row"><button class="btn" type="button" data-hp="save-pending"${busy || full ? " disabled" : ""}>Save that one</button><button class="linkish" type="button" data-hp="drop-pending">Discard it</button></div></div>` : ""}
        ${snap ? `<div class="hp-row">
            <input type="text" name="label" value="${esc(labelDraft)}" maxlength="80" placeholder="Label, e.g. September card export" aria-label="Label for this scan">
            <button class="btn btn-solid" type="button" data-hp="save"${busy || full ? " disabled" : ""}>Save this scan</button></div>
          <p class="hp-small">Keeps ${esc(copy.keeps)}. Never keeps ${esc(copy.never)}.</p>`
          : `<p class="hp-small">${viewOnly ? `To save a new one, run the ${esc(copy.noun)} on your results page.` : `Run a ${esc(copy.noun)} above, then save it here.`}</p>`}
        ${full && acct.plan !== "pro" ? `<p class="hp-err" role="alert">The free account keeps ${FREE_SAVES} saved scans for each tool. Delete one to save another, or ask for Pro.</p>` : `<p class="hp-err" role="alert">${esc(err)}</p>`}
        <p class="hp-ok" role="status">${esc(msg)}</p>
        ${saved.length ? `<h4>Saved scans</h4><ul class="hp-list">${saved.map((r) => `
          <li><label><input type="checkbox" data-hp="pick" value="${esc(r.id)}"${picked.includes(r.id) ? " checked" : ""}> <b>${esc(r.label || "Untitled")}</b></label>
          <span class="hp-when">${esc(fmtDate(r.created_at))}</span>
          <button class="linkish" type="button" data-hp="delete" data-id="${esc(r.id)}" aria-label="Delete ${esc(r.label || "this scan")}">Delete</button></li>`).join("")}</ul>
          <div class="hp-row"><button class="btn" type="button" data-hp="compare"${picked.length === 2 ? "" : " disabled"}>Compare the two ticked</button><span class="hp-small">Tick two to see what changed.</span></div>`
          : ""}
        ${diff ? `<div data-hp="diff"><h4>What changed</h4>
          <p class="hp-head">${esc(diff.headline)}</p>
          <p class="hp-small">${esc(fmtDate(diff.from.created_at))} to ${esc(fmtDate(diff.to.created_at))}</p>
          ${diff.changes.length ? `<ul class="hp-diff">${diff.changes.map((c) => `<li class="${esc(c.tone)}">${esc(c.text)}</li>`).join("")}</ul>` : ""}
          ${acct.plan === "pro" ? `<button class="btn" type="button" data-hp="download">Download the change report</button>` : `<p class="hp-small">Downloading the change report is part of Pro.</p>`}
        </div>` : ""}
        ${acct.plan === "pro" ? `<h4>Timeline</h4>${timelineSvg()}` : proPitch()}`;
    }
    el.innerHTML = `<div class="hp">${body}</div>`;
    bind();
  }

  function bind() {
    const q = (s) => el.querySelector(`[data-hp="${s}"]`);
    const form = q("signin");
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      const email = String(new FormData(form).get("email") || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err = "Enter a valid email address."; draw(); return; }
      busy = true; err = ""; draw();
      try {
        const snap = getSnapshot ? getSnapshot() : null;
        if (snap) writePending(snap);
        await sendLink(email);
        sentTo = email;
      } catch (ex) {
        console.error(ex);
        err = /rate|too many|seconds/i.test(String(ex && ex.message)) ? "Too many attempts. Wait a few minutes and try again." : "Couldn't send the link. Check the address and try again.";
      }
      busy = false; draw();
    };
    const saveBtn = q("save");
    if (saveBtn) saveBtn.onclick = () => {
      const snap = getSnapshot && getSnapshot();
      if (!snap) { err = "Run a check first."; draw(); return; }
      const label = (el.querySelector('input[name="label"]') || {}).value || "";
      labelDraft = "";
      save(snap, label);
    };
    const lb = el.querySelector('input[name="label"]');
    if (lb) lb.oninput = () => { labelDraft = lb.value; };
    const sp = q("save-pending");
    if (sp) sp.onclick = () => { const p = readPending(); if (p) save(p.snapshot, "Before sign-in"); };
    const dp = q("drop-pending");
    if (dp) dp.onclick = () => { clearPending(); draw(); };
    const so = q("signout");
    if (so) so.onclick = async () => { await sb.auth.signOut(); sentTo = ""; picked = []; diff = null; msg = ""; err = ""; await load(); };
    el.querySelectorAll('[data-hp="pick"]').forEach((box) => {
      box.onchange = () => {
        if (box.checked) { picked = [...picked, box.value].slice(-2); } else picked = picked.filter((p) => p !== box.value);
        diff = null; err = ""; draw();
      };
    });
    el.querySelectorAll('[data-hp="delete"]').forEach((b) => { b.onclick = () => remove(b.dataset.id); });
    const cmp = q("compare");
    if (cmp) cmp.onclick = runCompare;
    const dl = q("download");
    if (dl) dl.onclick = () => { if (diff) download(`antara-${tool}-what-changed.txt`, reportText(diff)); };
  }

  load();
  return { refresh: () => draw(), reload: load };
}
