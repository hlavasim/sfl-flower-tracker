import { test, beforeEach } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import handler, { _clearCacheForTests } from "../../api/compute.mjs";

/*
 * B1 (review 2026-09-22): the roadmap state — measured harvest efficiency — is module-level in
 * core/engine/roadmap.mjs and nothing cleared it. On a warm instance a plain section=power after
 * a roadmap/wishlist request valued every boost at THAT request's efficiency (possibly another
 * farm's), and inside section=roadmap the skill ranks were priced at the stale efficiency while
 * the items used the fresh one. C3: the wishlist printed its theoretical/measured columns swapped.
 */
const fixture = readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url), "utf8");
const p2pText = readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url), "utf8");
const nftsText = readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url), "utf8");

function mockFetch() {
  return async (url) => {
    const u = decodeURIComponent(String(url));
    if (u.includes("v1/prices")) return { ok: true, status: 200, json: async () => ({ data: { p2p: JSON.parse(p2pText) } }) };
    if (u.includes("v1/nfts")) return { ok: true, status: 200, json: async () => JSON.parse(nftsText) };
    if (u.includes("exchange")) return { ok: true, status: 200, json: async () => ({ data: {} }) };
    if (u.includes("coingecko")) return { ok: true, status: 200, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(fixture) };
  };
}
function mockRes() {
  return { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; } };
}
async function call(query, body) {
  _clearCacheForTests({ keepLastGood: false });
  const res = mockRes();
  const l = console.log; console.log = () => {};
  try { await handler({ query: { farm: "155498", ...query }, body }, res); } finally { console.log = l; }
  assert.equal(res._status, 200, `${query.section}: ${JSON.stringify(res._json).slice(0, 200)}`);
  return res._json.data;
}
// Four days of history with few tree/stone harvests → measured ratios well below 1.
const snapshots = [
  { captured_at: "2026-07-18T08:00:00.000Z", diff: { "_h.trees": 3, "_h.stones": 2, "_h.iron": 1, "_h.crops": 5 } },
  { captured_at: "2026-07-24T08:00:00.000Z", diff: { "_h.trees": 4, "_h.stones": 2, "_h.iron": 1, "_h.crops": 6 } },
];
const synergies = (d) => {
  const o = {};
  for (const [cat, m] of Object.entries(d.boostValues || {})) for (const [n, v] of Object.entries(m)) o[cat + ":" + n] = v.synergy;
  return o;
};

let orig;
beforeEach(() => { orig = orig || globalThis.fetch; globalThis.fetch = mockFetch(); });

test("B1: a plain section=power is the same before and after a roadmap / wishlist request", async () => {
  try {
    const fresh = synergies(await call({ section: "power" }));
    await call({ section: "wishlist", list: "{}" }, { snapshots });
    const afterWishlist = synergies(await call({ section: "power" }));
    await call({ section: "roadmap" }, { snapshots });
    const afterRoadmap = synergies(await call({ section: "power" }));
    // Not vacuous: measured efficiency really does move these numbers (the POST path).
    const measured = synergies(await call({ section: "power" }, { snapshots }));
    const moved = Object.keys(fresh).filter((k) => Math.abs((measured[k] || 0) - fresh[k]) > 1e-9);
    assert.ok(moved.length > 0, "measured efficiency changes some boost values");
    for (const k of moved) {
      assert.ok(Math.abs(afterWishlist[k] - fresh[k]) < 1e-9, `${k}: leaked from the wishlist request (${afterWishlist[k]} vs ${fresh[k]})`);
      assert.ok(Math.abs(afterRoadmap[k] - fresh[k]) < 1e-9, `${k}: leaked from the roadmap request (${afterRoadmap[k]} vs ${fresh[k]})`);
    }
  } finally { globalThis.fetch = orig; }
});

test("B1: inside section=roadmap, rank rows and items are priced at the same (this request's) efficiency", async () => {
  try {
    // What the rank-ups are worth at this history's efficiency, served by section=power.
    const pw = await call({ section: "power" }, { snapshots });
    // A request with DIFFERENT history in between — what a warm instance serving another page
    // (or another farm) looks like. Its efficiency must not reach the roadmap's rank rows.
    const busy = [
      { captured_at: "2026-07-20T08:00:00.000Z", diff: { "_h.trees": 40, "_h.stones": 30, "_h.iron": 20, "_h.crops": 50 } },
      ...Array.from({ length: 40 }, (_, i) => ({ captured_at: new Date(Date.parse("2026-07-20T09:00:00.000Z") + i * 3 * 3600000).toISOString(), diff: { "_h.trees": 10, "_h.stones": 8, "_h.iron": 5, "_h.crops": 20 } })),
    ];
    await call({ section: "wishlist", list: "{}" }, { snapshots: busy });
    const rm = await call({ section: "roadmap" }, { snapshots });
    const rows = (rm.sim.ranked || []).filter((r) => r.skillRank);
    assert.ok(rows.length > 0, "the buy path offers rank-ups");
    let checked = 0;
    for (const r of rows) {
      const base = r.name.replace(/ → Level \d+$/, "");
      const sr = pw.skillRanks[base];
      const row = sr && sr.rows.find((x) => x.lvl === r.skillRank);
      if (!row || !(row.delta > 0)) continue;
      assert.ok(Math.abs(r.value - row.delta) < 1e-9, `${r.name}: buy path ${r.value} vs measured rank ${row.delta}`);
      checked++;
    }
    assert.ok(checked > 0, "at least one rank row compared");
  } finally { globalThis.fetch = orig; }
});

test("C3: wishlist 'theo' is the theoretical value and 'eff' the measured one", async () => {
  try {
    const list = JSON.stringify({ "collectibles:Test Unowned Statue": 1 });
    const wl = await call({ section: "wishlist", list }, { snapshots });
    const row = wl.rows.find((r) => r.name === "Test Unowned Statue");
    assert.ok(row && row.perDay > 0, "the statue is priced");
    const theo = (await call({ section: "power", roadmap: JSON.stringify({ effMode: "theoretical" }) })).boostValues.trees["Test Unowned Statue"].synergy;
    assert.ok(Math.abs(row.perDay - theo) < 1e-9, `theo column ${row.perDay} = theoretical Power value ${theo}`);
    assert.ok(row.perDayEff < row.perDay, `measured ${row.perDayEff} sits below theoretical ${row.perDay} on a farm harvesting a few times a week`);
    assert.equal(wl.effUnmeasured, false, "history was measured");
  } finally { globalThis.fetch = orig; }
});
