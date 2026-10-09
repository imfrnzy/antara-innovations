// Bearing audit pack panel. Sits under the saved-results panel on the Bearing results page.
//   Not signed in: shows what the pack is and points to the sign-in box above. Nothing is kept.
//   Free account:  keep owner, next review date and an evidence note for up to 5 obligations. Pack shown on screen.
//   Pro:           up to 500 obligations, and the pack downloads as a print-ready page and as a spreadsheet file.
// Limits are enforced by the database (migration 031), not by this page.

import { buildPack, packHtml, packCsv, controlsAllowed, describeControlError, FREE_CONTROLS, PRO_CONTROLS } from "./audit-pack.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function mountAuditPanel({ el, sb, getResult, getOrg = () => "", contactEmail = "", proPriceLabel = "" }) {
  let acct = { email: null, anonymous: true, plan: "free" };
  let controls = [];
  let editing = null;
  let msg = "", err = "", loading = true, busy = false;

  async function load() {
    loading = true; draw();
    try {
      const { data: { session } } = await sb.auth.getSession();
      const u = session && session.user;
      acct = { email: u && u.email ? u.email : null, anonymous: !u || u.is_anonymous === true || !u.email, plan: "free", id: u && u.id };
      controls = [];
      if (!acct.anonymous) {
        const { data: plan } = await sb.rpc("my_plan");
        acct.plan = plan === "pro" ? "pro" : "free";
        const { data, error } = await sb.from("bearing_controls").select("obligation_id,owner,review_date,evidence_note");
        if (error) throw error;
        controls = data || [];
      }
    } catch (e) { console.error(e); err = "Couldn't load your audit pack details. Refresh the page and try again."; }
    loading = false; draw();
  }

  async function saveRow(key, owner, date, note) {
    busy = true; err = ""; msg = ""; draw();
    try {
      let error;
      if (!owner && !date && !note) ({ error } = await sb.from("bearing_controls").delete().eq("obligation_id", key));
      else ({ error } = await sb.from("bearing_controls").upsert({ user_id: acct.id, obligation_id: key, owner, review_date: date || null, evidence_note: note }, { onConflict: "user_id,obligation_id" }));
      if (error) err = describeControlError(error.message); else { msg = "Saved."; editing = null; }
    } catch (e) { console.error(e); err = describeControlError(e && e.message); }
    busy = false; await load();
  }

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function row(r) {
    const open = editing === r.key;
    return `<li class="ap-row ${esc(r.status)}">
      <div class="ap-main"><b>${esc(r.title)}</b> <span class="chip s-${esc(r.status)}">${esc(r.statusLabel)}</span>
        <div class="hp-small">${esc(r.source)}</div>
        ${r.owner || r.reviewDate || r.evidenceNote ? `<div class="hp-small">Owner: ${esc(r.owner) || "none"} · Next review: ${esc(r.reviewDate) || "none"}${r.evidenceNote ? " · Evidence: " + esc(r.evidenceNote) : ""}</div>` : ""}
        ${r.flags.length ? `<div class="ap-flags">${r.flags.map((f) => `<span class="ap-flag ${esc(f.level)}">${esc(f.text)}</span>`).join("")}</div>` : ""}
      </div>
      ${acct.anonymous ? "" : `<button class="linkish" type="button" data-ap="edit" data-key="${esc(r.key)}">${open ? "Close" : r.owner || r.reviewDate || r.evidenceNote ? "Edit" : "Add owner"}</button>`}
      ${open ? `<form class="ap-form" data-ap="form" data-key="${esc(r.key)}">
        <label>Owner (a name or a role)<input type="text" name="owner" maxlength="80" value="${esc(r.owner)}"></label>
        <label>Next review due<input type="date" name="date" value="${esc(r.reviewDate)}"></label>
        <label>Where the evidence is (a place, not the document itself)<input type="text" name="note" maxlength="300" value="${esc(r.evidenceNote)}"></label>
        <div class="hp-row"><button class="btn btn-solid" type="submit"${busy ? " disabled" : ""}>Save</button>
          <button class="linkish" type="button" data-ap="cancel">Cancel</button></div>
        <p class="hp-small">Leave all three empty and press Save to clear this one.</p></form>` : ""}
    </li>`;
  }

  function draw() {
    const result = getResult ? getResult() : null;
    if (loading || !result) { el.innerHTML = ""; return; }
    const pack = buildPack(result, controls);
    if (!pack) { el.innerHTML = ""; return; }
    const s = pack.summary;
    const allowed = controlsAllowed(acct.plan);
    const tracked = controls.length;
    const full = tracked >= allowed;
    const lensHtml = pack.lenses.map((l, i) => `<details class="ap-lens"${i === 0 ? " open" : ""}><summary>${esc(l.label)} <span class="hp-small">${l.rows.filter((r) => r.status !== "ready").length} not ready</span></summary>
      <ul class="ap-list">${l.rows.map(row).join("")}</ul></details>`).join("");
    el.innerHTML = `<div class="hp ap">
      <h3>Audit pack: who owns each obligation${acct.anonymous ? "" : `<span class="hp-badge ${acct.plan}">${acct.plan === "pro" ? "Pro" : "Free"}</span>`}</h3>
      <p>Your result says which obligations look ready. An auditor then asks who owns each one, when it was last reviewed and where the evidence is. Keep that here, and the pack builds itself.</p>
      ${acct.anonymous
        ? `<p class="hp-small">To keep owners and review dates, sign in with the saved results box above. Nothing is kept until you do.</p>`
        : `<p class="hp-small">${tracked} of ${allowed} obligations tracked. ${s.noOwner} of ${s.obligations} have no owner yet${s.overdue ? `, ${s.overdue} reviews are overdue` : ""}.</p>
           ${full && acct.plan !== "pro" ? `<p class="hp-err" role="alert">The free account keeps owners for ${FREE_CONTROLS} obligations. Clear one to add another, or ask for Pro.</p>` : `<p class="hp-err" role="alert">${esc(err)}</p>`}
           <p class="hp-ok" role="status">${esc(msg)}</p>`}
      ${lensHtml}
      ${acct.anonymous ? "" : acct.plan === "pro"
        ? `<div class="hp-row"><button class="btn btn-solid" type="button" data-ap="html">Download the audit pack</button><button class="btn" type="button" data-ap="csv">Download as a spreadsheet file</button></div>
           <p class="hp-small">The pack opens in any browser. Use Print, then Save as PDF. Owners, dates and notes are what you typed, we have not checked them, and the pack says so on every page.</p>`
        : `<div class="hp-lock"><p class="hp-head">Pro</p><p>Up to ${PRO_CONTROLS} obligations, and the full pack as a print-ready page and a spreadsheet file, ready for your auditor or your board.</p>
           <p>${proPriceLabel ? esc(proPriceLabel) + ". " : ""}Email us and we'll set it up on your account by hand. No card form, no automatic charge.</p>
           <p><a class="btn" href="mailto:${esc(contactEmail)}?subject=${encodeURIComponent("Pro access for Antara scans")}&body=${encodeURIComponent("Hello,\n\nI'd like Pro access for Bearing.\n\nAccount email: " + (acct.email || "(sign in first)") + "\nOrganisation:\n\nThanks")}" data-ap="pro-mail">Ask for Pro access</a></p></div>`}
    </div>`;
    bind(pack);
  }

  function bind(pack) {
    el.querySelectorAll('[data-ap="edit"]').forEach((b) => { b.onclick = () => { editing = editing === b.dataset.key ? null : b.dataset.key; err = ""; msg = ""; draw(); }; });
    el.querySelectorAll('[data-ap="cancel"]').forEach((b) => { b.onclick = () => { editing = null; draw(); }; });
    el.querySelectorAll('[data-ap="form"]').forEach((f) => {
      f.onsubmit = (e) => {
        e.preventDefault();
        const v = new FormData(f);
        saveRow(f.dataset.key, String(v.get("owner") || "").trim(), String(v.get("date") || "").trim(), String(v.get("note") || "").trim());
      };
    });
    const h = el.querySelector('[data-ap="html"]');
    if (h) h.onclick = () => download(`antara-bearing-audit-pack-${pack.summary.generated}.html`, packHtml(pack, { orgName: getOrg() }), "text/html;charset=utf-8");
    const c = el.querySelector('[data-ap="csv"]');
    if (c) c.onclick = () => download(`antara-bearing-audit-pack-${pack.summary.generated}.csv`, packCsv(pack), "text/csv;charset=utf-8");
  }

  load();
  return { refresh: () => draw(), reload: load };
}
