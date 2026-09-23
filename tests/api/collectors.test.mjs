import { test, beforeEach } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import { fakePool, fakeContext } from "./fake-pool.mjs";

/*
 * Azure collectors (CommonJS). They destructure getPool / the fetchers at require time, so the
 * shared modules are patched with delegates BEFORE the collectors are required, and each test
 * points the delegates at its own fakes.
 */
const require = createRequire(import.meta.url);
const db = require("../../azure-functions/shared/db.js");
const api = require("../../azure-functions/shared/api.js");
const { _resetSchemaCache } = require("../../azure-functions/shared/schema-check.js");

const cur = {};
db.getPool = () => cur.pool;
api.fetchMarketplaceActivity = (...a) => cur.activity(...a);
api.fetchNfts = (...a) => cur.nfts(...a);
api.fetchCollectionItem = (...a) => cur.item(...a);

const marketplaceActivity = require("../../azure-functions/marketplace-activity/index.js");
const orderbookSnapshot = require("../../azure-functions/orderbook-snapshot/index.js");
const nftSnapshot = require("../../azure-functions/nft-snapshot/index.js");
const cleanup = require("../../azure-functions/cleanup/index.js");

beforeEach(() => {
  _resetSchemaCache();
  cur.nfts = async () => ({ collectibles: [], wearables: [] });
  cur.item = async () => { throw new Error("no deep sweep in tests"); };
});

const oneReport = (items) => async () => ({ flowerPrice: 0.1, reports: { "2026-09-22": { totals: { volume: 1, trades: 1 }, items } } });

// ── marketplace-activity: safe with or without migration 2026-09-11 ─────────────────────
function activityPool(haveCols) {
  return fakePool((sql) => {
    if (/information_schema\.columns/.test(sql)) return haveCols.map((c) => ({ column_name: c }));
    return [];
  });
}

test("marketplace-activity without the 2026-09-11 columns writes trade stats and says so", async () => {
  cur.pool = activityPool([]);
  cur.activity = oneReport({ "collectibles-601": { low: 1, high: 2, volume: 3, trades: 4, quantity: 5, latestSale: 1.5, floor: 2, bestOffer: 1 } });
  const ctx = fakeContext();
  await marketplaceActivity(ctx);
  const ins = cur.pool.sqlMatching(/INSERT INTO marketplace_daily/)[0];
  assert.ok(ins, "marketplace_daily still written");
  assert.doesNotMatch(ins.sql, /floor|best_offer|listing_count|offer_count/);
  assert.equal(ins.params.length, 9);
  assert.equal(cur.pool.sqlMatching(/^COMMIT$/).length, 1, "committed, not rolled back");
  assert.equal(cur.pool.sqlMatching(/^ROLLBACK$/).length, 0);
  assert.ok(ctx.lines.some(([lvl, m]) => lvl === "error" && /MIGRATION MISSING/.test(m) && /2026-09-11/.test(m)));
});

test("marketplace-activity with the migration writes the book snapshot and parses economies keys", async () => {
  cur.pool = activityPool(["floor", "best_offer", "listing_count", "offer_count"]);
  cur.activity = oneReport({
    "collectibles-601": { volume: 3, floor: 2, bestOffer: 1, listingCount: 4, offerCount: 5 },
    "economies-my-farm-7": { volume: 1 },
    "collectibles-9x": { volume: 1 },
  });
  const ctx = fakeContext();
  await marketplaceActivity(ctx);
  const ins = cur.pool.sqlMatching(/INSERT INTO marketplace_daily/)[0];
  assert.match(ins.sql, /latest_sale, floor, best_offer, listing_count, offer_count\)/);
  assert.equal(ins.params.length, 26, "two rows of 13 — the malformed key is skipped");
  assert.deepEqual(ins.params.slice(13, 16), ["2026-09-22", "economies-my-farm", 7]);
  assert.deepEqual(ins.params.slice(9, 13), [2, 1, 4, 5]);
  assert.ok(!ctx.lines.some(([lvl]) => lvl === "error"));
});

// ── orderbook-snapshot pass 1: emptied books are cleared ───────────────────────────────
function catalogue(n) {
  const items = {};
  for (let i = 1; i <= n; i++) items[`collectibles-${i}`] = { floor: 10 + i, bestOffer: 5, listingCount: 1, offerCount: 1 };
  return items;
}

function obPool({ cleared = [] } = {}) {
  return fakePool((sql) => {
    if (/information_schema\.columns/.test(sql)) return [{ column_name: "deep_ts" }];
    if (/^\s*UPDATE ob_last/.test(sql)) return cleared;
    return [];
  });
}

test("pass 1 clears ob_last books that emptied and historizes the emptying", async () => {
  cur.pool = obPool({ cleared: [{ collection: "collectibles", item_id: 999 }] });
  cur.activity = oneReport({
    ...catalogue(250),
    // Traded before, nothing on the market now: an empty book.
    "collectibles-999": { latestSale: 3, listingCount: 0, offerCount: 0 },
  });
  await orderbookSnapshot(fakeContext());
  const upd = cur.pool.sqlMatching(/^\s*UPDATE ob_last/)[0];
  assert.ok(upd, "stale books are cleared");
  assert.match(upd.sql, /best_offer = NULL, best_listing = NULL/);
  const live = upd.params[0];
  assert.equal(live.length, 250);
  assert.ok(live.includes("collectibles-1") && !live.includes("collectibles-999"));
  const snap = cur.pool.sqlMatching(/INSERT INTO ob_snap/).filter((c) => c.params[0] === "collectibles" && c.params[1] === 999);
  assert.equal(snap.length, 1, "the emptied book is recorded in ob_snap");
});

test("pass 1 does not clear anything from a report that is not the whole catalogue", async () => {
  cur.pool = obPool();
  cur.activity = oneReport(catalogue(20));
  const ctx = fakeContext();
  await orderbookSnapshot(ctx);
  assert.equal(cur.pool.sqlMatching(/^\s*UPDATE ob_last/).length, 0);
  assert.ok(ctx.lines.some(([lvl, m]) => lvl === "warn" && /not clearing/.test(m)));
});

test("orderbook-snapshot without deep_ts logs the missing migration", async () => {
  cur.pool = fakePool(() => []);   // information_schema reports no deep_ts
  cur.activity = oneReport(catalogue(3));
  const ctx = fakeContext();
  await orderbookSnapshot(ctx);
  assert.ok(ctx.lines.some(([lvl, m]) => lvl === "error" && /MIGRATION MISSING: ob_last\.deep_ts/.test(m)));
  assert.equal(cur.pool.sqlMatching(/deep_ts/).filter((c) => !/information_schema/.test(c.sql)).length, 0);
});

// ── nft-snapshot: bud/pet prices no longer from the owner-only orderbook ─────────────────
test("bud and pet prices come from marketplace_daily, never from marketplace_orderbook", async () => {
  cur.pool = fakePool((sql, p) => {
    if (/information_schema\.columns/.test(sql)) return [{ column_name: "floor" }];
    if (/FROM marketplace_daily/.test(sql)) {
      return p[0] === "buds" ? [{ item_id: 220, floor: "35", latest_sale: "30" }, { item_id: 5, floor: null, latest_sale: null }] : [];
    }
    return [];
  });
  await nftSnapshot(fakeContext());
  assert.equal(cur.pool.sqlMatching(/marketplace_orderbook|marketplace_trades/).length, 0);
  const changes = cur.pool.sqlMatching(/INSERT INTO nft_changes/).map((c) => c.params);
  assert.deepEqual(changes.map((p) => [p[0], p[2], p[3], p[4]]).sort(),
    [[220, "buds", "floor", 35], [220, "buds", "lastSalePrice", 30]]);
  const upserts = cur.pool.sqlMatching(/INSERT INTO last_known_nft_values/);
  assert.ok(upserts.every((c) => /ON CONFLICT \(nft_id, collection, field\)/.test(c.sql)));
});

// ── cleanup: one retained snapshot per day, whole days only ──────────────────────────────
test("cleanup cuts at a day boundary and never retains a second snapshot for a day", async () => {
  cur.pool = fakePool(() => []);
  await cleanup(fakeContext());
  const mark = cur.pool.sqlMatching(/SET is_retained = TRUE/)[0].sql.replace(/\s+/g, " ");
  const del = cur.pool.sqlMatching(/DELETE FROM farm_snapshots/)[0].sql.replace(/\s+/g, " ");
  const cutoff = "date_trunc('day', NOW() - INTERVAL '30 days')";
  assert.ok(mark.includes(`captured_at < ${cutoff}`), "mark uses the midnight cutoff");
  assert.ok(del.includes(`captured_at < ${cutoff}`), "delete uses the same cutoff");
  assert.match(mark, /NOT EXISTS \( SELECT 1 FROM farm_snapshots k WHERE k\.farm_id = s\.farm_id AND k\.is_retained/);
});
