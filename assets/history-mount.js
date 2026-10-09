// One small helper so each tool page adds saved history with three lines.
//   const hist = await mountSaved({ tool: "keel", sb, resultEl: "historyPanel", introEl: "historyIntro", introBox: "historyIntroBox", contactEmail, proPriceLabel });
//   hist.setResult(snapshot)   // call when a result is on screen
// If anything here fails to load or run, the tool page carries on exactly as before.

export async function mountSaved({ tool, sb, resultEl = "historyPanel", introEl = "historyIntro", introBox = "historyIntroBox", contactEmail = "", proPriceLabel = "" }) {
  const none = { setResult() {}, clear() {} };
  try {
    const { mountHistoryPanel } = await import("./history-panel.js");
    let current = null;
    const result = document.getElementById(resultEl);
    const intro = document.getElementById(introEl);
    const panels = [];
    if (result) panels.push(mountHistoryPanel({ el: result, sb, tool, getSnapshot: () => current, contactEmail, proPriceLabel }));
    if (intro) {
      panels.push(mountHistoryPanel({ el: intro, sb, tool, getSnapshot: null, viewOnly: true, contactEmail, proPriceLabel }));
      try {
        const box = document.getElementById(introBox);
        // Coming back from the email link with a result waiting: open the box so they can save it.
        if (box && localStorage.getItem(`hp.pending.${tool}`)) box.open = true;
      } catch { /* storage can be blocked */ }
    }
    return {
      setResult(snapshot) { current = snapshot || null; panels.forEach((p) => p.refresh()); },
      clear() { current = null; panels.forEach((p) => p.refresh()); },
    };
  } catch (e) {
    console.error(e);
    return none;
  }
}

export { snapshotKeel, snapshotHalo, snapshotBearing, snapshotSquall, snapshotEnsign } from "./history.js";
