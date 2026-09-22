import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import handler, { _clearCacheForTests } from "../../api/compute.mjs";
import { mockRes } from "./fake-pool.mjs";

/*
 * compute's stale fallback (farm + nfts). It served the last good copy with no age limit, no
 * `stale` flag and computedAt = now, so a days-old farm read as fresh. Now: max 6 h, and the
 * envelope carries stale / staleAgeMin / staleSources / staleFetchedAt / farmFetchedAt.
 */
const fixtureText = readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url), "utf8");
const p2pText = readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url), "utf8");
const nftsText = readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url), "utf8");

const T0 = Date.parse("2026-09-22T08:00:00Z");
let now = T0;
let origFetch;
beforeEach(() => {
  _clearCacheForTests();
  now = T0;
  mock.method(Date, "now", () => now);
  origFetch = globalThis.fetch;
});
afterEach(() => { mock.restoreAll(); globalThis.fetch = origFetch; });

// failFarm / failNfts switch those upstreams to 429.
function upstream({ failFarm = false, failNfts = false } = {}) {
  return async (url) => {
    const u = decodeURIComponent(String(url));
    if (u.includes("v1/prices")) return { ok: true, status: 200, json: async () => ({ data: { p2p: JSON.parse(p2pText) } }) };
    if (u.includes("v1/nfts")) return failNfts ? { ok: false, status: 429 } : { ok: true, status: 200, json: async () => JSON.parse(nftsText) };
    if (u.includes("exchange")) return { ok: true, status: 200, json: async () => ({ data: {} }) };
    if (u.includes("coingecko")) return { ok: true, status: 200, json: async () => ({}) };
    return failFarm ? { ok: false, status: 429 } : { ok: true, status: 200, json: async () => JSON.parse(fixtureText) };
  };
}

async function call(section) {
  const res = mockRes();
  await handler({ query: { farm: "155498", section } }, res);
  return res;
}

test("a fresh farm is reported fresh, with its real fetch time", async () => {
  globalThis.fetch = upstream();
  const res = await call("cooking");
  assert.equal(res._status, 200);
  assert.equal(res._json.stale, false);
  assert.equal(res._json.farmFetchedAt, new Date(T0).toISOString());
});

test("a stale farm is served with stale:true, its age and its real fetch time", async () => {
  globalThis.fetch = upstream();
  assert.equal((await call("cooking"))._status, 200);
  now = T0 + 90 * 60000;                       // 90 min later, TTL long gone
  globalThis.fetch = upstream({ failFarm: true });
  const res = await call("cooking");
  assert.equal(res._status, 200, "served from the fallback");
  assert.equal(res._json.stale, true);
  assert.deepEqual(res._json.staleSources, ["farm"]);
  assert.equal(res._json.staleAgeMin, 90);
  assert.equal(res._json.farmFetchedAt, new Date(T0).toISOString(), "the farm's own fetch time, not now");
});

test("past 6 hours the fallback is refused and the request fails as it would without one", async () => {
  globalThis.fetch = upstream();
  assert.equal((await call("cooking"))._status, 200);
  now = T0 + 6 * 3600000 + 60000;
  globalThis.fetch = upstream({ failFarm: true });
  const res = await call("cooking");
  assert.equal(res._status, 502);
});

test("stale NFT data is flagged too (section=treasury)", async () => {
  globalThis.fetch = upstream();
  assert.equal((await call("treasury"))._status, 200);
  now = T0 + 30 * 60000;
  globalThis.fetch = upstream({ failNfts: true });
  const res = await call("treasury");
  assert.equal(res._status, 200);
  assert.equal(res._json.stale, true);
  assert.deepEqual(res._json.staleSources, ["nfts"], "the farm itself was fetched fresh");
  assert.equal(res._json.staleAgeMin, 30);
});
