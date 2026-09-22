import { test, beforeEach } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import handler, { _clearCacheForTests } from "../../api/compute.mjs";

/*
 * /api/compute's treasury and diff sections after the 2026-09-22 valuation review: what they
 * report about their own inputs (E8, B4 stale farm), the id-resolved NFT names (E3) and the diff
 * price map (E2 / E5). Upstreams are mocked; nothing leaves the process.
 */
const fixtureText = readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url), "utf8");
const p2pText = readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url), "utf8");
const nftsSample = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url), "utf8"));

beforeEach(() => _clearCacheForTests());

function mockRes() {
  return { _status: 200, _json: null, _headers: {},
    status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; }, setHeader(k, v) { this._headers[k] = v; } };
}
// Routes every upstream by the DECODED proxied url. `o` switches individual upstreams off.
function upstream(o = {}) {
  return async (url) => {
    const u = decodeURIComponent(String(url));
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    const fail = (status) => ({ ok: false, status, json: async () => ({}) });
    if (u.includes("v1/prices")) return o.pricesDown ? fail(503) : ok({ data: { p2p: JSON.parse(p2pText) } });
    if (u.includes("v1/nfts")) return ok(o.nfts || nftsSample);
    if (u.includes("exchange")) return ok({ sfl: { usd: 0.15 }, coins: { a: { coin: 64000, sfl: 200 } }, gems: { a: { gem: 100, sfl: 1 } } });
    if (u.includes("coingecko")) return ok({ bitcoin: { usd: 86000 } });
    if (o.farmDown) return fail(429);
    return ok(JSON.parse(fixtureText));
  };
}
async function call(query, body, o) {
  const orig = globalThis.fetch;
  globalThis.fetch = upstream(o);
  try {
    const res = mockRes();
    await handler({ query: { farm: "155498", ...query }, body }, res);
    return res;
  } finally { globalThis.fetch = orig; }
}

// E8 — before: section=treasury said nothing about its best-effort upstreams; a failed p2p
// fetch came back 200 with about half the farm valued at 0.
test("E8: section=treasury reports what its numbers stand on", async () => {
  const good = await call({ section: "treasury" });
  assert.equal(good._status, 200);
  assert.equal(good._json.pricesOk, true);
  assert.deepEqual(good._json.data.status, { pricesOk: true, nftsStale: false, exchangeOk: true, btcOk: true });
  _clearCacheForTests();
  const bad = await call({ section: "treasury" }, undefined, { pricesDown: true });
  assert.equal(bad._status, 200, "still served");
  assert.equal(bad._json.pricesOk, false, "but flagged");
  assert.equal(bad._json.data.status.pricesOk, false);
});

// B4 / E8 — before: when the live farm fetch failed the last good farm was served with no flag
// and computedAt = now, so a stale farm passed for a live one.
test("E8: a stale farm is flagged with its age", async () => {
  const live = await call({ section: "treasury" });
  assert.equal(live._json.stale, undefined, "a live farm carries no stale flag");
  _clearCacheForTests({ keepLastGood: true });
  const stale = await call({ section: "treasury" }, undefined, { farmDown: true });
  assert.equal(stale._status, 200, "the stale fallback still serves");
  assert.equal(stale._json.stale, true);
  assert.ok(stale._json.farmAgeSec >= 0 && typeof stale._json.farmFetchedAt === "string");
});

// E3 — before: the NFT rows sfl.world ships without a name were keyed "undefined" and dropped.
test("E3: section=treasury resolves nameless NFT rows by id", async () => {
  const nfts = { collectibles: [...nftsSample.collectibles, { id: 1533, floor: 12, collection: "collectibles" }], wearables: [{ id: 500, floor: 1899, collection: "wearables" }] };
  const res = await call({ section: "treasury" }, undefined, { nfts });
  const td = res._json.data.td;
  assert.ok(td.nftCollectibles["Kraken Tentacle"], "id 1533 → Kraken Tentacle");
  assert.ok(td.nftWearables["Master Chef's Cleaver"], "wearable id 500 → Master Chef's Cleaver");
  assert.ok(res._json.data.value.collectibles.some((c) => c.name === "Kraken Tentacle" && c.qty === 8));
});

// E2 / E5 — before: section=diff priced with marketValue only: a dish with no market value, Oil
// and every wardrobe change read 0.
test("E2/E5: section=diff values dishes at production cost, Oil at its drill cost and wearables at their floor", async () => {
  const nfts = { collectibles: nftsSample.collectibles, wearables: [{ name: "Merino Jumper", floor: 291, lastSalePrice: 146 }] };
  const body = { snapshots: [{ diff: { "inventory.Gumbo": 2, "inventory.Oil": -10, "wardrobe.Merino Jumper": 1 } }] };
  const res = await call({ section: "diff", rates: JSON.stringify({ coinsPerSFL: 1061, season: "autumn" }) }, body, { nfts });
  assert.equal(res._status, 200);
  const d = res._json.data;
  const item = (n) => d.snapshots[0].items.find((i) => i.itemName === n);
  assert.ok(d.oilPrice > 0, `Oil is priced (${d.oilPrice})`);
  assert.ok(item("Gumbo").hasPrice && item("Gumbo").sflValue > 0, "a dish with no market value is priced");
  assert.ok(Math.abs(item("Oil").sflValue + 10 * d.oilPrice) < 1e-9, "10 Oil burned costs 10 × its price");
  assert.equal(item("Merino Jumper").sflValue, 291, "a wearable gained is worth its floor");
  assert.equal(res._json.pricesOk, true);
});
