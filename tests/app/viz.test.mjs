import { test } from "node:test";
import assert from "node:assert";
import { bar, kpis, bigBar, pill, ring, toneOf } from "../../ui/viz.mjs";

// The small graphics every widget shares: a progress bar per row, the summary tiles with a big bar,
// a status pill, a progress ring.

test("tone follows how far along: red below half, yellow below full, green at full", () => {
  assert.deepStrictEqual([toneOf(0), toneOf(49), toneOf(50), toneOf(99), toneOf(100), toneOf(140)], ["bad", "bad", "mid", "mid", "ok", "ok"]);
});

test("bar: clamped width, tone class; a broken value reads as empty", () => {
  assert.match(bar(35), /class="v-bar"><i class="v-bad" style="width:35%"><\/i>/);
  assert.match(bar(250), /style="width:100%"/);
  assert.match(bar(NaN), /style="width:0%"/);
  assert.match(bar(60, "ok"), /class="v-ok"/);
});

test("kpis and the big bar; values and labels escaped", () => {
  const html = kpis([{ v: "38 / 53", l: "at <target>" }, { v: 51, l: "left" }]);
  assert.match(html, /<div class="v-kpis"><div class="v-kpi"><b>38 \/ 53<\/b><span>at &lt;target&gt;<\/span><\/div>/);
  assert.match(bigBar(72), /class="v-big"><i style="width:72%">/);
});

test("pill and ring", () => {
  assert.strictEqual(pill("READY", "ok"), '<span class="v-pill v-ok">READY</span>');
  assert.match(pill("<x>", "run"), /&lt;x&gt;/);
  assert.match(ring(60, "🌼"), /class="v-ring" style="--p:60"><span>🌼<\/span>/);
});
