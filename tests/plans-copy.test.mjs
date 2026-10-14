// The demonstration-versus-deployment panel on each tool page must be there, sit before the begin button, and must not promise what is not built.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
let n = 0; const t = (m, f) => { f(); n++; console.log("PASS", m); };
const pages = ["soundings", "sentinel", "keel", "halo", "tools/bearing", "tools/squall", "tools/ensign"];
for (const p of pages) {
  const html = readFileSync(new URL(`../${p}/index.html`, import.meta.url), "utf8");
  const start = html.indexOf('id="s-intro"'); const intro = html.slice(start, html.indexOf("<section id=", start + 10));
  t(`${p}: intro says this is a demonstration, before the begin button`, () => {
    assert.match(intro, /class="plans"/); assert.ok(intro.indexOf('class="plans"') < intro.indexOf('id="beginBtn"'));
    assert.match(intro, /Demonstration version/); assert.match(intro, /Deployed in your organisation/);
    assert.match(intro, /mailto:hello@antara-innovations\.com\?subject=Deployment/);
  });
  t(`${p}: no Pro tier, no pricing language`, () => {
    assert.ok(!/\bPro\b|up to 200|per month|\/month|invoice|billing/i.test(intro));
  });
  const tour = readFileSync(new URL(`../${p}/tour/index.html`, import.meta.url), "utf8");
  t(`${p}: tour has an agent scene and no Free-to-run or Pro wording`, () => {
    assert.match(tour, /class="scene agentscene"/); assert.match(tour, /Designed with you in an engagement/);
    assert.ok(!/Free to run|\bPro keeps\b|free assessment/i.test(tour));
  });
}
console.log(n + " checks passed");
