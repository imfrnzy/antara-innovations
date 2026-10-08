// The "ask my team" panel, shared by HALO, Squall and Ensign.
// It draws into one element and talks to the database only through assets/team.js.
import {
  MIN_RESPONSES, createRun, listRuns, getSummary, closeRun, joinUrl,
  analyseScenarioSummary, analysePulseSummary,
} from "./team.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const INTRO = {
  halo: {
    title: "Ask your team the same questions",
    body: "Your result above is how you see your own practice. This asks the people who work for you the same seven things, anonymously. You see the answers only once three people have replied, and only as totals. Nobody can tell who said what, and you cannot see one person's answers.",
    button: "Create a link for my team",
  },
  squall: {
    title: "See how your team does on the same scenarios",
    body: "Send your team a link. Each person takes the same timed scenarios, anonymously. You see the answers only once three people have finished, and only as totals per scenario. Nobody is named and nobody can be picked out.",
    button: "Create a link for my team",
  },
  ensign: {
    title: "See how your team does on the same scenarios",
    body: "Send your team or your account leads a link. Each person takes the same timed scenarios, anonymously. You see the answers only once three people have finished, and only as totals per scenario.",
    button: "Create a link for my team",
  },
};

export function mountTeamPanel(opts) {
  const { el, sb, tool, module = "", label = "", ensureSession, origin = location.origin, questions, scenarios, leaderPercent = null, leaderLevels = null } = opts;
  let current = null; // { runId, code }
  let busy = false;
  const copy = INTRO[tool];

  function shell(inner) { el.innerHTML = `<div class="tp">${inner}</div>`; }

  function renderStart(errMsg = "") {
    shell(`
      <h3>${esc(copy.title)}</h3>
      <p>${esc(copy.body)}</p>
      <p class="tp-err" role="alert">${esc(errMsg)}</p>
      <button type="button" class="btn btn-solid" data-act="create">${esc(copy.button)}</button>`);
    el.querySelector('[data-act="create"]').onclick = onCreate;
  }

  function renderRun(summary, errMsg = "") {
    const link = joinUrl(origin, current.code);
    const n = summary?.n ?? 0;
    const closed = summary?.status === "closed";
    let body = "";
    if (!summary || !summary.visible) {
      const left = Math.max(0, MIN_RESPONSES - n);
      body = `<p class="tp-wait"><strong>${n} ${n === 1 ? "person has" : "people have"} answered.</strong> Results appear once ${MIN_RESPONSES} have, so nobody can be picked out. ${left > 0 ? `${left} more to go.` : ""}</p>`;
    } else if (tool === "halo") {
      body = renderPulse(analysePulseSummary(summary, questions, leaderLevels));
    } else {
      body = renderScenarios(analyseScenarioSummary(summary, scenarios, leaderPercent));
    }
    shell(`
      <h3>${esc(copy.title)}</h3>
      <p>Send this link to your team. They need no account.</p>
      <div class="tp-link"><input readonly value="${esc(link)}" aria-label="Link for your team"><button type="button" class="btn" data-act="copy">Copy</button></div>
      <p class="tp-code">Or give them the code <strong>${esc(current.code)}</strong> at ${esc(origin.replace(/^https?:\/\//, ""))}/team/</p>
      ${body}
      <p class="tp-err" role="alert">${esc(errMsg)}</p>
      <div class="tp-actions">
        <button type="button" class="btn" data-act="refresh">Refresh results</button>
        ${closed ? '<span class="small">This link is closed.</span>' : '<button type="button" class="linkish" data-act="close">Close the link</button>'}
        <button type="button" class="linkish" data-act="new">Start a different run</button>
      </div>`);
    el.querySelector('[data-act="copy"]').onclick = async () => {
      try { await navigator.clipboard.writeText(link); } catch { el.querySelector(".tp-link input").select(); }
      el.querySelector('[data-act="copy"]').textContent = "Copied";
    };
    el.querySelector('[data-act="refresh"]').onclick = refresh;
    const c = el.querySelector('[data-act="close"]');
    if (c) c.onclick = onClose;
    el.querySelector('[data-act="new"]').onclick = () => { current = null; renderStart(); };
  }

  function renderPulse(a) {
    if (!a) return "";
    const head = a.biggestGap
      ? `<p class="tp-head">The biggest gap is on <strong>${esc(label_for(a.biggestGap.key))}</strong>. ${esc(a.biggestGap.reading)}</p>`
      : `<p class="tp-head">${a.n} people answered. No standard shows a large gap between your view and theirs.</p>`;
    const rows = a.rows.map((r) => `
      <li>
        <div class="tp-q">${esc(label_for(r.key))}</div>
        <div class="tp-bar" role="img" aria-label="Team average ${r.avg.toFixed(1)} out of 2${r.leader === null ? "" : ", your rating " + r.leader}">
          <span class="tp-fill" style="width:${Math.round((r.avg / 2) * 100)}%"></span>
          ${r.leader === null ? "" : `<span class="tp-mark" style="left:${Math.round((r.leader / 2) * 100)}%" title="Your rating"></span>`}
        </div>
        <div class="tp-meta">Team ${r.avg.toFixed(1)} of 2${r.leader === null ? "" : ` · you ${r.leader}`} · ${r.split.reliably} reliably, ${r.split.sometimes} sometimes, ${r.split.rarely} rarely${r.reading ? ` · ${esc(r.reading)}` : ""}</div>
      </li>`).join("");
    return `<div class="tp-results">${head}<ul class="tp-list">${rows}</ul>
      <p class="small">${a.n} responses. A gap does not mean your team is right and you are wrong. It shows where a conversation is worth having.</p></div>`;
  }

  function label_for(key) {
    const q = (questions || []).find((x) => x.key === key);
    return q?.short || key.replace(/^R\d_/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  }

  function renderScenarios(a) {
    if (!a) return "";
    const gap = a.gap ? `<p class="tp-head">${esc(a.gap.reading)} You: ${a.gap.leaderPercent}%. Team: ${a.gap.teamPercent}%.</p>` : `<p class="tp-head">Team score: ${a.teamPercent}%.</p>`;
    const weak = a.weakest.map((r) => `
      <li><div class="tp-q">${r.correctPct}% got this right <span class="small">(${r.n} answers)</span></div>
      <p>${esc(r.text)}</p><p class="small">${esc(r.why)}</p></li>`).join("");
    return `<div class="tp-results">${gap}
      ${a.watchOut ? `<p class="tp-watch">${esc(a.watchOut)}</p>` : ""}
      <h4>Where the team got caught out most</h4><ul class="tp-list">${weak}</ul>
      <p class="small">${a.n} people. ${a.timeouts} answers timed out.</p></div>`;
  }

  async function onCreate() {
    if (busy) return; busy = true;
    try {
      await ensureSession();
      current = await createRun(sb, { tool, module, label });
      renderRun(await getSummary(sb, current.runId));
    } catch (e) {
      console.error(e);
      renderStart("Could not create the link. Check your connection and try again.");
    } finally { busy = false; }
  }
  async function refresh() {
    if (busy || !current) return; busy = true;
    try { renderRun(await getSummary(sb, current.runId)); }
    catch (e) { console.error(e); renderRun(null, "Could not refresh. Try again."); }
    finally { busy = false; }
  }
  async function onClose() {
    if (busy || !current) return; busy = true;
    try { await closeRun(sb, current.runId); renderRun(await getSummary(sb, current.runId)); }
    catch (e) { console.error(e); renderRun(null, "Could not close the link."); }
    finally { busy = false; }
  }

  // Pick up the most recent open run for this tool, so a refresh of the page does not lose the link.
  (async () => {
    try {
      await ensureSession();
      const runs = await listRuns(sb, tool);
      const mine = runs.find((r) => r.status === "open" && (r.module || "") === (module || "")) || null;
      if (mine) { current = { runId: mine.id, code: mine.join_code }; renderRun(await getSummary(sb, mine.id)); return; }
    } catch (e) { console.error(e); }
    renderStart();
  })();
}
