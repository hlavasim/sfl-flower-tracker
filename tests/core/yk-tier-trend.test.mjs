import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/*
 * The Yakkamon tier thresholds STEP, they do not drift: one deposit lands and #10 jumps 50,000
 * points in a single 4-hour build, then sits still for a day. The first version of this panel
 * fitted a least-squares line through that and reported "#10 rising +39,627/day", projecting
 * 410,895 a week out — an artefact of one whale. The median across intervals is what makes the
 * number survivable, so this pins it.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function extract(name) {
  const src = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} present in flowers.html`);
  let depth = 0, i = src.indexOf("{", start);
  const open = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  assert.ok(i > open, `${name} body is brace-balanced`);
  return new Function(`${src.slice(start, i + 1)}; return ${name};`)();
}

const DAY = 86400000;
// Flat, flat, one 50k step, flat — the real shape of #10 over the first four snapshots.
const stepSeries = [
  { t: 0 * DAY, p10: 79000 },
  { t: 1 * DAY, p10: 79000 },
  { t: 2 * DAY, p10: 129000 },
  { t: 3 * DAY, p10: 129000 },
];

test("a single step does not become a trend", () => {
  const trend = extract("_ykTrend");
  const r = trend(stepSeries, "p10");
  assert.ok(r, "returns a trend for a 4-point series");
  assert.equal(r.k, 3, "three intervals between four snapshots");
  // Least squares on this series gives ~23,000/day. The median must not.
  assert.ok(Math.abs(r.slope) < 1000,
    `median must ignore the lone step, got ${r.slope}/day — a regression would report ~23,000`);
  assert.equal(r.hi, 50000, "the step is still reported, as the top of the range");
  assert.equal(r.lo, 0, "and the flat intervals as the bottom");
});

test("the range is what exposes a spiky series", () => {
  const trend = extract("_ykTrend");
  const r = trend(stepSeries, "p10");
  assert.ok(r.hi - r.lo > Math.abs(r.slope) * 10,
    "a series whose range dwarfs its median is one the median cannot summarise — the panel prints both");
});

test("a genuinely steady climb is reported as one", () => {
  const trend = extract("_ykTrend");
  const steady = [0, 1, 2, 3].map((d) => ({ t: d * DAY, p50: 20000 + d * 500 }));
  const r = trend(steady, "p50");
  assert.equal(r.slope, 500, "even spacing, even growth => the median is the growth");
  assert.equal(r.lo, 500);
  assert.equal(r.hi, 500);
  assert.equal(Math.round(r.at(3 * DAY + 7 * DAY)), 21500 + 3500, "projection carries the median forward");
});

test("the tier chart is small multiples, never a second y-axis", () => {
  /*
   * The first version put #10/#50/#100 on one scale and pushed #3 to a second. Two y-scales on
   * one plot align arbitrarily: #3 had moved 39 points and was drawn climbing across the whole
   * panel, while #50 and #100 were crushed into one flat line. Four series spanning 17k..380k
   * get four panels — that is the only honest option, and a log scale is not a substitute.
   */
  for (const name of ["flowers.html", "index.html"]) {
    const src = readFileSync(path.join(ROOT, name), "utf8");
    const start = src.indexOf("function _ykTierSvg(");
    assert.ok(start > 0, `${name}: the small-multiples renderer exists`);
    const body = src.slice(start, start + 6000);
    assert.ok(!/priceScaleId/.test(body), `${name}: no second price scale`);
    assert.ok(!/scaleType|logarithmic/i.test(body), `${name}: linear only — a log scale flattens exactly the differences being read`);
    // One <svg> holding a panel per tier, each with its own computed y-range.
    assert.match(body, /const tiers = \[/, `${name}: draws a panel per tier`);
    assert.match(body, /const Y = \(v\) =>/, `${name}: each panel derives its own y scale`);
    assert.ok(!/_ykDrawTierChart/.test(src), `${name}: the old single-plot renderer is gone`);
  }
});

test("the seeded history is present and well formed", () => {
  const src = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
  const m = src.match(/const ykBoardSeed = \[([\s\S]*?)\];/);
  assert.ok(m, "ykBoardSeed present");
  const rows = m[1].match(/\{[^}]*\}/g) || [];
  assert.ok(rows.length >= 4, `expected the four backfilled snapshots, got ${rows.length}`);
  for (const r of rows) {
    for (const k of ["t:", "players:", "p3:", "p10:", "p50:", "p100:", "derived:"]) {
      assert.ok(r.includes(k), `every seeded row carries ${k} — got ${r}`);
    }
  }
  // The two reconstructed timestamps must stay flagged: their content is observed, their
  // timing is not, and a reader has to be able to tell.
  assert.equal((m[1].match(/derived: true/g) || []).length, 2, "exactly the two reconstructed rows are flagged");
});
