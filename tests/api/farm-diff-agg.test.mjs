import { test } from "node:test";
import assert from "node:assert";
import { getPool } from "../../api/_db.js";
import handler from "../../api/farm-diff-agg.js";
import { fakePool, mockRes } from "./fake-pool.mjs";

/*
 * A long range (e.g. group=day over 3 years) holds more periods than the 500 cap. The query
 * ordered ASC and then limited, so it kept the OLDEST 500 and dropped the newest data. It must
 * keep the newest, still return them oldest-first, and say it truncated.
 */
test("a range past the cap keeps the NEWEST periods, oldest-first, and flags truncation", async () => {
  const day0 = Date.parse("2023-01-01T00:00:00Z");
  // What the database returns for the fixed query: the newest 501 periods, ordered ASC.
  const rows = Array.from({ length: 501 }, (_, i) => ({
    period: new Date(day0 + (1000 - 500 + i) * 86400000).toISOString(),
    snapshot_count: "3", agg_diff: { "inventory.Wood": i },
  }));
  const fake = fakePool(() => rows);
  const pool = getPool();
  pool.query = fake.query;

  const res = mockRes();
  await handler({ method: "GET", query: { farm: "155498", group: "day", days: "3650" } }, res);
  assert.equal(res._status, 200);
  assert.equal(res._json.periods.length, 500);
  assert.equal(res._json.truncated, true);
  assert.equal(res._json.periods[499].period, rows[500].period, "the newest period is kept");
  assert.equal(res._json.periods[0].period, rows[1].period, "the extra, oldest one is dropped");

  // The SQL must pick the newest periods BEFORE limiting.
  const sql = fake.calls[0].sql.replace(/\s+/g, " ");
  assert.match(sql, /counts AS \(.*GROUP BY 1 ORDER BY 1 DESC LIMIT 501 \)/);
  assert.match(sql, /ORDER BY c\.period ASC\s*$/);
});

test("a range within the cap is returned whole and not flagged", async () => {
  const rows = [{ period: "2026-09-21T00:00:00.000Z", snapshot_count: "5", agg_diff: {} }];
  getPool().query = fakePool(() => rows).query;
  const res = mockRes();
  await handler({ method: "GET", query: { farm: "155498", group: "day" } }, res);
  assert.equal(res._json.truncated, false);
  assert.equal(res._json.periods.length, 1);
});
