// The free-versus-Pro wording on each tool page must match what is really built, and must not promise what is not.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
let n = 0; const t = (m, f) => { f(); n++; console.log("PASS", m); };
const pages = ["soundings", "sentinel", "keel", "halo", "tools/bearing", "tools/squall", "tools/ensign"];
const FREE = 3, PRO = 200;
for (const p of pages) {
  const html = readFileSync(new URL(`../${p}/index.html`, import.meta.url), "utf8");
  const start = html.indexOf('id="s-intro"'); const intro = html.slice(start, html.indexOf("<section id=", start + 10));
  t(`${p}: intro explains free and Pro before the begin button`, () => {
    assert.match(intro, /class="plans"/); assert.ok(intro.indexOf('class="plans"') < intro.indexOf('id="beginBtn"'));
    assert.match(intro, new RegExp(`up to ${FREE} saved`)); assert.match(intro, new RegExp(`up to ${PRO} saved`));
    assert.match(intro, /mailto:hello@antara-innovations\.com/); assert.match(intro, /example, made-up numbers/);
  });
  t(`${p}: promises nothing that is not built`, () => {
    const a = intro.indexOf('class="plans"'); const plans = intro.slice(a, intro.indexOf("</section>", a)); assert.ok(plans.length > 400); assert.ok(!/automatic(ally)? (re-?)?scan|connector|network log|inside (your|the) (email|company)|continuous|scheduled|billing|invoice/i.test(plans));
  });
}
t("only Bearing promises an audit pack, and with the real limits", () => {
  for (const p of pages) { const h = readFileSync(new URL(`../${p}/index.html`, import.meta.url), "utf8"); assert.equal(/audit pack/i.test(h.slice(h.indexOf('class="plans"'), h.indexOf('class="plans"') + 1800)), p === "tools/bearing", p); }
  const b = readFileSync(new URL("../tools/bearing/index.html", import.meta.url), "utf8");
  assert.match(b, /up to 5 obligations/); assert.match(b, /up to 500 obligations/);
});
t("the tools page has the general explanation", () => {
  const h = readFileSync(new URL("../tools/index.html", import.meta.url), "utf8");
  assert.match(h, /class="plans"/); assert.match(h, /history\.css/); assert.match(h, /3 saved results per tool/);
});
console.log(n + " checks passed");
