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

test("the backfill migration is present and safe to re-run", () => {
  const sql = readFileSync(path.join(ROOT, "azure-functions/migrations/2026-08-12-yakkamon-leaderboard.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS yk_leaderboard/, "table creation is idempotent");
  assert.match(sql, /generated_at\s+TIMESTAMPTZ PRIMARY KEY/,
    "keyed on the BUILD's timestamp — that is what makes a re-read a no-op instead of a duplicate");
  assert.match(sql, /ON CONFLICT \(generated_at\) DO NOTHING/,
    "the backfill never overwrites a row that is already there");
  assert.match(sql, /GRANT SELECT, INSERT ON yk_leaderboard TO sfl_reader/,
    "the API role appends and reads; it must not be able to edit or delete a recorded build");
  const rows = sql.match(/\('2026-[^)]*\)/g) || [];
  assert.ok(rows.length >= 4, `expected the four backfilled builds, got ${rows.length}`);
  assert.equal((sql.match(/TRUE\)/g) || []).length, 2,
    "exactly the two rows with a reconstructed timestamp are flagged derived");
});

test("the collector needs no credentials and cannot double-count", () => {
  const api = readFileSync(path.join(ROOT, "api/farm-history.js"), "utf8");
  const i = api.indexOf('req.query.type === "yk-board"');
  assert.ok(i > 0, "the endpoint mode exists");
  const body = api.slice(i, i + 3500);
  assert.match(body, /api\.yakkamon\.com\/leaderboard/,
    "the SERVER fetches the board — that is what lets the scheduled caller be a bare curl with no secrets");
  assert.match(body, /ON CONFLICT \(generated_at\) DO NOTHING/,
    "a build already recorded is a no-op, so cron + page visit + retry cannot double-count");
  assert.match(body, /collected: ins\.rowCount > 0/, "the caller is told whether it actually wrote");
  assert.ok(!/DELETE|UPDATE yk_leaderboard/.test(body), "recorded builds are append-only");

  const wf = readFileSync(path.join(ROOT, ".github/workflows/yk-leaderboard.yml"), "utf8");
  assert.match(wf, /cron: "10 1,5,9,13,17,21 \* \* \*"/,
    "fires on the same 4h grid as the rebuild, at :10 so it cannot race the :00:57 build");
  assert.ok(!/secrets\./.test(wf), "no secrets — the endpoint does the privileged part");
  assert.match(wf, /workflow_dispatch/, "a missed window can be filled by hand");
});

test("the page survives the history endpoint being unavailable", () => {
  /*
   * The chart went blank in production the moment the DB-backed history shipped ahead of its
   * migration: the endpoint 500s, localStorage is empty on a fresh browser, and with no
   * fallback there was nothing to draw. The pre-collector builds are finished history — they
   * can never gain a row and the migration inserts the identical values — so they stay in the
   * page as bedrock. Growth still belongs in the table, never here.
   */
  for (const name of ["flowers.html", "index.html"]) {
    const src = readFileSync(path.join(ROOT, name), "utf8");
    assert.match(src, /type=yk-board&collect=1/,
      `${name}: reads the recorded history, and records the build it is looking at`);
    const m = src.match(/const ykBoardBackfill = \[([\s\S]*?)\];/);
    assert.ok(m, `${name}: keeps the pre-collector builds so the chart draws without the API`);
    const rows = m[1].match(/\{[^}]*\}/g) || [];
    assert.equal(rows.length, 4,
      `${name}: the backfill is FROZEN at the four pre-collector builds — anything newer belongs in the table, got ${rows.length}`);
    assert.equal((m[1].match(/derived: true/g) || []).length, 2,
      `${name}: the two reconstructed timestamps stay flagged`);
    // Merge order matters: a live read must be able to supersede the same build from the backfill.
    assert.match(src, /ykBoardBackfill\.concat\(_ykHistFile \|\| \[\], Array\.isArray\(saved\)/,
      `${name}: backfill, then table, then this browser — later wins`);
  }
});

test("the backfill and the migration agree, row for row", () => {
  /*
   * Two copies of the same four builds, so they have to be checked against each other or one
   * will quietly rot. They dedupe by build timestamp at runtime, which hides a value mismatch.
   */
  const src = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
  const m = src.match(/const ykBoardBackfill = \[([\s\S]*?)\];/);
  const page = (m[1].match(/\{[^}]*\}/g) || []).map((r) => ({
    players: +r.match(/players: (\d+)/)[1],
    p3: +r.match(/p3: (\d+)/)[1], p10: +r.match(/p10: (\d+)/)[1],
    p50: +r.match(/p50: (\d+)/)[1], p100: +r.match(/p100: (\d+)/)[1],
  }));
  const sql = readFileSync(path.join(ROOT, "azure-functions/migrations/2026-08-12-yakkamon-leaderboard.sql"), "utf8");
  const db = [...sql.matchAll(/\('2026-[^']*',\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),/g)]
    .map((x) => ({ players: +x[1], p3: +x[2], p10: +x[3], p50: +x[4], p100: +x[5] }));
  assert.equal(page.length, db.length, "same number of backfilled builds in both");
  page.forEach((r, i) => assert.deepEqual(r, db[i], `backfill row ${i} differs between the page and the migration`));
});
