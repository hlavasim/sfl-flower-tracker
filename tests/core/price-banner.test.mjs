import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

// Every /api/compute answer passes one place that shows a banner when prices were missing (all 0)
// or only an older copy was available — instead of zeros passing for real numbers.
const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
const start = SRC.indexOf("function _priceBanner(");
const body = SRC.slice(start, SRC.indexOf("\n    }\n", start) + 6);

function run(payload) {
  const el = { style: {}, innerHTML: "" };
  const document = { getElementById: (id) => (id === "price-banner" ? el : null) };
  new Function("document", body + "\n_priceBanner(" + JSON.stringify(payload) + ");")(document);
  return el;
}

test("hooked into fetch for /api/compute", () => {
  assert.ok(start > 0);
  assert.match(SRC, /u\.includes\("\/api\/compute"\) && r\.ok\) r\.clone\(\)\.json\(\)\.then\(_priceBanner\)/);
  assert.match(SRC, /<div id="price-banner"/);
});

test("no prices: a red banner; stale prices: a note with the age; fine: hidden", () => {
  const a = run({ pricesOk: false });
  assert.equal(a.style.display, "block");
  assert.match(a.innerHTML, /nenačetly/);
  const b = run({ pricesOk: true, stale: true, staleSources: ["prices"], staleAgeMin: 95 });
  assert.equal(b.style.display, "block");
  assert.match(b.innerHTML, /95 min/);
  const c = run({ pricesOk: true, stale: false });
  assert.equal(c.style.display, "none");
});
