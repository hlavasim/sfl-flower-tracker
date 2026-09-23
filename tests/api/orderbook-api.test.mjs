import { test } from "node:test";
import assert from "node:assert";
import { getPool } from "../../api/_db.js";
import handler from "../../api/marketplace-orderbook.js";
import { fakePool, mockRes } from "./fake-pool.mjs";

// The handler takes its pool from api/_db.js; swap the singleton's query for a fake.
function usePool(fake) {
  const pool = getPool();
  pool.query = fake.query;
  pool.connect = fake.connect;
  return fake;
}

test("health watches nft_changes again and the marketplace-activity tables", async () => {
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  usePool(fakePool((sql) => {
    // nft_changes a week old: with the feed live again that must alarm, not hide behind `paused`.
    if (/FROM nft_changes/.test(sql)) return [{ last: weekAgo }];
    return [{ last: hourAgo }];
  }));
  delete process.env.KV_REST_API_URL;
  const res = mockRes();
  await handler({ method: "GET", query: { health: "1" } }, res);
  assert.equal(res._status, 200);
  const byTable = Object.fromEntries(res._json.collectors.map((c) => [c.table, c]));
  assert.equal(byTable.nft_changes.paused, false);
  assert.equal(byTable.nft_changes.stale, true);
  assert.ok(res._json.warnings.staleCollectors.includes("NFT values"));
  assert.equal(byTable.ob_snap.paused, true, "orderbook stays paused");
  assert.equal(byTable.marketplace_trades.paused, true, "trades stay paused");
  for (const t of ["marketplace_daily", "marketplace_totals"]) {
    assert.ok(byTable[t], `${t} is watched`);
    assert.equal(byTable[t].paused, false);
    assert.equal(byTable[t].stale, false);
  }
});

test("flips ignore ob_last rows the collector has not confirmed recently", async () => {
  const fake = usePool(fakePool(() => []));
  const res = mockRes();
  await handler({ method: "GET", query: { flips: "1" } }, res);
  assert.equal(res._status, 200);
  const q = fake.sqlMatching(/FROM ob_last/)[0];
  assert.match(q.sql, /ol\.ts > NOW\(\) - make_interval\(hours => \$1\)/);
  assert.deepEqual(q.params, [res._json.maxAgeHours]);
  assert.ok(res._json.maxAgeHours > 0 && res._json.maxAgeHours <= 6);
});
