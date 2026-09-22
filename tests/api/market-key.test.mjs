import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import handler, { parseItemKey as apiParse } from "../../api/marketplace-orderbook.js";

/*
 * The marketplaceActivity feed is read by three places — the API's book mode and the
 * marketplace-activity and orderbook-snapshot collectors — and they used to split its item keys
 * three different ways (the API on the FIRST dash, so "economies-{slug}-{id}" became collection
 * "economies" with id "{slug}-{id}"). One parser per runtime now; these pin that the two copies
 * agree and what they return.
 */
const require = createRequire(import.meta.url);
const { parseItemKey: azureParse } = require("../../azure-functions/shared/market-key.js");

const CASES = [
  ["collectibles-601", { collection: "collectibles", id: 601 }],
  ["wearables-12", { collection: "wearables", id: 12 }],
  ["buds-933", { collection: "buds", id: 933 }],
  ["pets-4", { collection: "pets", id: 4 }],
  ["economies-sunflower-farmers-17", { collection: "economies-sunflower-farmers", id: 17 }],
  ["economies-abc-0", { collection: "economies-abc", id: 0 }],
  ["collectibles-12abc", null],   // parseInt alone would have read 12
  ["collectibles-", null],
  ["-5", null],
  ["collectibles", null],
  ["", null],
];

test("API and collector parse every key shape identically", () => {
  for (const [key, want] of CASES) {
    assert.deepEqual(apiParse(key), want, `api: ${key}`);
    assert.deepEqual(azureParse(key), want, `azure: ${key}`);
  }
});

function mockRes() {
  return {
    _status: 200, _json: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; },
    end() { return this; },
  };
}

test("book mode names items by the shared parser and drops economies it cannot name", async () => {
  const orig = globalThis.fetch;
  const saved = { key: process.env.SFL_API_KEY, kv: process.env.KV_REST_API_URL };
  process.env.SFL_API_KEY = "test";
  delete process.env.KV_REST_API_URL;
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ data: { flowerPrice: 0.1, reports: { "2026-09-22": { items: {
      "collectibles-601": { floor: 10, bestOffer: 8, listingCount: 2, offerCount: 1 },
      "economies-foo-601": { floor: 99, bestOffer: 1 },
      "collectibles-601x": { floor: 1, bestOffer: 1 },
    } } } } }),
  });
  try {
    const res = mockRes();
    await handler({ method: "GET", query: { book: "1" } }, res);
    assert.equal(res._status, 200);
    const items = Object.values(res._json.items);
    assert.equal(items.length, 1, "only the collectible has a name");
    assert.deepEqual({ c: items[0].c, id: items[0].id, f: items[0].f, b: items[0].b },
      { c: "collectibles", id: 601, f: 10, b: 8 });
  } finally {
    globalThis.fetch = orig;
    if (saved.key === undefined) delete process.env.SFL_API_KEY; else process.env.SFL_API_KEY = saved.key;
    if (saved.kv !== undefined) process.env.KV_REST_API_URL = saved.kv;
  }
});
