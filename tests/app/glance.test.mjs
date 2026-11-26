import { test } from "node:test";
import assert from "node:assert";
import { big, ring, meter, spark, rows, tiles, compact } from "../../ui/glance.mjs";

// The pieces an iPhone-style glance face is built from: plain HTML strings, escaped text.

test("compact numbers: 142,474 → 142k, 1,712,000 → 1.7M, 87.67 → 87.7, 5 → 5", () => {
  assert.strictEqual(compact(142474), "142k");
  assert.strictEqual(compact(1712000), "1.7M");
  assert.strictEqual(compact(53712), "53.7k");
  assert.strictEqual(compact(87.67), "87.7");
  assert.strictEqual(compact(5), "5");
  assert.strictEqual(compact(-2500), "−2.5k");
  assert.strictEqual(compact(null), "—");
});

test("big: the number, an optional unit and caption, text escaped", () => {
  const h = big("142k", { unit: "🌸", cap: "$18,362 · <b>" });
  assert.match(h, /<div class="g-big">142k<small>🌸<\/small><\/div>/);
  assert.match(h, /<div class="g-cap">\$18,362 · &lt;b&gt;<\/div>/);
  assert.match(big(19, { tone: "ok" }), /class="g-big g-ok"/);
});

test("ring: an SVG arc for the share, clamped to 0-100", () => {
  const h = ring(75, { tone: "ok" });
  assert.match(h, /<svg class="g-ring g-ok"/);
  const full = 2 * Math.PI * 22;
  const off = (s) => Number(s.match(/stroke-dashoffset="([\d.]+)"/)[1]);
  assert.ok(Math.abs(off(h) - full * 0.25) < 0.1);
  assert.ok(Math.abs(off(ring(150)) - 0) < 0.1);
  assert.ok(Math.abs(off(ring(-5)) - full) < 0.1);
});

test("meter: a bar of the share", () => {
  assert.match(meter(40, "warn"), /<div class="g-meter"><i class="g-warn" style="width:40%"><\/i><\/div>/);
  assert.match(meter(400), /width:100%/);
});

test("spark: a line over the values, scaled to the box; nothing for fewer than 2 points", () => {
  const h = spark([1, 2, 3]);
  assert.match(h, /<svg class="g-spark/);
  assert.match(h, /<path d="M0 \d/);
  assert.strictEqual(spark([5]), "");
});

test("rows: icon, name, sub line and a value or a chip", () => {
  const h = rows([{ icon: "<img src=x>", name: "Sturdy Shovel", sub: "52 days", chip: { text: "TAKE NOW", tone: "ok" } },
    { name: "Beetle <Nest>", value: "+4.44/d", tone: "ok" }]);
  assert.match(h, /<div class="g-row"><span class="g-ic"><img src=x><\/span><div class="g-n">Sturdy Shovel<div>52 days<\/div><\/div><span class="g-chip g-ok">TAKE NOW<\/span><\/div>/);
  assert.match(h, /Beetle &lt;Nest&gt;/);
  assert.match(h, /<span class="g-v g-ok">\+4\.44\/d<\/span>/);
});

test("tiles: label, value, sub", () => {
  assert.match(tiles([{ label: "🔥 Fire Pit", value: "6h 11m", sub: "Pizza" }]),
    /<div class="g-tiles"><div><span>🔥 Fire Pit<\/span><b>6h 11m<\/b><small>Pizza<\/small><\/div><\/div>/);
});
