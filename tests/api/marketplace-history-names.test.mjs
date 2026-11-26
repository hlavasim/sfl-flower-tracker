import { test } from "node:test";
import assert from "node:assert";
import { getPool } from "../../api/_db.js";
import handler from "../../api/marketplace-history.js";
import { fakePool, mockRes } from "./fake-pool.mjs";

// SALES showed "Collectibles #601" (Wood) in the volume leaders and the top movers: the page's own
// id table is hand-written and lacks most ids. The API now names its rows from the generated table.
function usePool(fake) {
  const pool = getPool();
  pool.query = fake.query;
  pool.connect = fake.connect;
  return fake;
}

test("top-volume rows carry the generated item name, keyed per collection", async () => {
  usePool(fakePool((sql) => {
    if (/MAX\(date\)/.test(sql)) return [{ latest: new Date("2026-11-25") }];
    if (/MIN\(date\)/.test(sql)) return [{ earliest: new Date("2026-11-18") }];
    return [
      { collection: "collectibles", item_id: 601, total_volume: "10" },
      { collection: "wearables", item_id: 601, total_volume: "5" },
      { collection: "collectibles", item_id: 999999, total_volume: "1" },
    ];
  }));
  const res = mockRes();
  await handler({ method: "GET", query: { top: "volume", days: "7", limit: "10" } }, res);
  assert.equal(res._status, 200);
  const [wood, breeches, unknown] = res._json.items;
  assert.equal(wood.name, "Wood");
  assert.equal(breeches.name, "Vampire Breeches", "the wearable id range overlaps the collectible one");
  assert.equal(unknown.name, undefined, "an unknown id stays unnamed (the page labels it)");
});
