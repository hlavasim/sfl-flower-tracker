import { test } from "node:test";
import assert from "node:assert";
import { getPool } from "../../api/_db.js";
import handler from "../../api/farm-history.js";
import { buildSeasonCalendar } from "../../core/sections/seasons.mjs";
import { fakePool, mockRes } from "./fake-pool.mjs";

/*
 * Two unbounded GETs of farm-history:
 *   - the SPECULATION calendar read every price change ever recorded for 32 crops;
 *   - Insights' include=game_data pulled ~60 whole farms (~12.7 MB).
 */
function usePool(answer) {
  const fake = fakePool(answer);
  getPool().query = fake.query;
  return fake;
}

test("calendar reads one price per item per UTC day, not every change", async () => {
  const fake = usePool((sql) => (/FROM price_changes/.test(sql) ? [] : []));
  const res = mockRes();
  await handler({ method: "GET", query: { type: "spec", what: "calendar", farm: "155498" } }, res);
  assert.equal(res._status, 200);
  const sql = fake.sqlMatching(/FROM price_changes/)[0].sql.replace(/\s+/g, " ");
  assert.match(sql, /DISTINCT ON \(item_name, date_trunc\('day', captured_at AT TIME ZONE 'UTC'\)\)/);
  assert.match(sql, /price > 0/);
  assert.match(sql, /captured_at DESC/);
});

test("the day-last reduction gives the calendar exactly what every change gives it", () => {
  // Deterministic pseudo-random intraday ticks over ~200 days for two items.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const start = Date.UTC(2026, 1, 1);
  const raw = { Potato: [], Kale: [] };
  for (const item of Object.keys(raw)) {
    for (let d = 0; d < 200; d++) {
      const ticks = 1 + Math.floor(rnd() * 6);
      for (let k = 0; k < ticks; k++) {
        const t = start + d * 86400000 + Math.floor(rnd() * 86400000);
        raw[item].push([t, rnd() < 0.03 ? 0 : 0.01 + rnd() * 0.02 + 0.01 * Math.sin(d / 4.5)]);
      }
    }
  }
  // What the new SQL returns: per item and UTC day, the last positive point.
  const reduced = {};
  for (const [item, pts] of Object.entries(raw)) {
    const byDay = new Map();
    for (const p of pts.filter((x) => x[1] > 0).sort((a, b) => a[0] - b[0])) byDay.set(Math.floor(p[0] / 86400000), p);
    reduced[item] = [...byDay.values()];
  }
  const now = start + 210 * 86400000;
  const full = buildSeasonCalendar(raw, { now });
  assert.equal(full.items.length, 2, "both items are long enough to be scored");
  assert.deepEqual(buildSeasonCalendar(reduced, { now }), full);
});

test("include=game_value returns the valuation projection, not the whole farm", async () => {
  const fake = usePool((sql) => (/COUNT\(\*\)/.test(sql) ? [{ count: "0" }] : []));
  const res = mockRes();
  await handler({ method: "GET", query: { farm: "155498", from: "2026-08-01", bucket_hours: "12", limit: "100", include: "game_value" } }, res);
  assert.equal(res._status, 200);
  const sql = fake.calls[0].sql;
  assert.match(sql, /jsonb_build_object\(\s*'inventory', game_data -> 'inventory'/);
  for (const key of ["wardrobe", "balance", "coins", "gems", "bank", "pets", "trades", "collectibles", "home", "interior"]) {
    assert.ok(sql.includes(`'${key}'`), `projection carries ${key}`);
  }
  assert.doesNotMatch(sql, /THEN game_data ELSE/, "the full farm is not selected");
});

test("rows carrying game_data are capped at 100; diff-only rows keep 1000", async () => {
  const fake = usePool((sql) => (/COUNT\(\*\)/.test(sql) ? [{ count: "0" }] : []));
  await handler({ method: "GET", query: { farm: "155498", limit: "1000", include: "game_data" } }, mockRes());
  assert.equal(fake.calls[0].params[3], 100);
  await handler({ method: "GET", query: { farm: "155498", limit: "1000" } }, mockRes());
  assert.equal(fake.calls[2].params[3], 1000);
});
