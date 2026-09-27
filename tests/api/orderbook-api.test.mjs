import { test } from "node:test";
import assert from "node:assert";
import { getPool } from "../../api/_db.js";
import handler, { uniqueFloorsFromActivity } from "../../api/marketplace-orderbook.js";
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

/*
 * No game token anywhere (2026-09-27). The game's JWT routes answer 403/500 since RT-001, so the
 * pet/bud floors and the live book moved to the community API key, and the health report stopped
 * warning about a token nothing uses ("game token expires in 0.5d" on every page).
 */
test("health says nothing about a game token", async () => {
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  usePool(fakePool(() => [{ last: hourAgo }]));
  delete process.env.KV_REST_API_URL;
  const res = mockRes();
  await handler({ method: "GET", query: { health: "1" } }, res);
  assert.equal(res._json.ok, true, "all collectors fresh -> ok, whatever a Redis token says");
  assert.ok(!("token" in res._json) && !("token" in res._json.warnings));
});

test("pet and bud floors come from the community catalogue, listed ids only", () => {
  const act = { reports: {
    "2026-09-26": { items: { "buds-1": { floor: 900 } } },
    "2026-09-27": { items: {
      "buds-7": { floor: 1500, latestSale: 1400 }, "buds-8": { bestOffer: 150 },   // 8: nothing listed
      "pets-3": { floor: 250 }, "collectibles-408": { floor: 1460 }, "economies-x-1": { floor: 1 } } },
  } };
  assert.deepEqual(uniqueFloorsFromActivity(act), {
    buds: [{ id: 7, floor: 1500, lastSale: 1400 }],
    pets: [{ id: 3, floor: 250, lastSale: null }],
  });
});

test("live, petfloors and budfloors call the community API with the key, never a Bearer token", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  process.env.SFL_API_KEY = "k-test";
  delete process.env.KV_REST_API_URL;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: (init && init.headers) || {} });
    const data = String(url).includes("tradeable")
      ? { floor: 5, listings: [{ sfl: 6, quantity: 1, listedById: 1 }], offers: [{ sfl: 4, quantity: 2, offeredById: 2 }] }
      : { reports: { "2026-09-27": { items: { "pets-3": { floor: 250 }, "buds-7": { floor: 1500 } } } } };
    return { ok: true, status: 200, json: async () => ({ data }) };
  };
  try {
    const live = mockRes();
    await handler({ method: "GET", query: { live: "1", collection: "collectibles", item_id: "408" } }, live);
    assert.equal(live._status, 200);
    assert.deepEqual(live._json.offers, [{ sfl: 4, qty: 2, by: 2, name: null }]);
    const pets = mockRes();
    await handler({ method: "GET", query: { petfloors: "1" } }, pets);
    assert.deepEqual(pets._json.items, [{ id: 3, floor: 250 }]);
    for (const c of calls) {
      assert.match(c.url, /^https:\/\/api\.sunflower-land\.com\/community\/data\?/);
      assert.equal(c.headers["x-api-key"], "k-test");
      assert.ok(!c.headers.Authorization, "no Bearer token");
    }
  } finally { globalThis.fetch = realFetch; delete process.env.SFL_API_KEY; }
});
