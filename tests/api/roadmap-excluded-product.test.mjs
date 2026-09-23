import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import handler, { _clearCacheForTests } from "../../api/compute.mjs";

/*
 * A boost is valued on the category's chosen product — the POWER choice, else the default
 * (Grape for the greenhouse). With Grape UNCHECKED in the roadmap filter, Vinny (+0.25 Grape)
 * still read IN PLAN, because only the category was checked against the filter, not the product.
 */
const fixture = readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url), "utf8");
const p2pText = readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url), "utf8");
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url), "utf8"));
nfts.collectibles = nfts.collectibles.concat([{ id: 900001, name: "Vinny", floor: 54, lastSalePrice: 50, supply: 1000, collection: "collectibles", have_boost: 1, boost_text: "+0.25 Grape" }]);

async function roadmap(roadmapSettings) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    if (u.includes("v1/prices")) return { ok: true, status: 200, json: async () => ({ data: { p2p: JSON.parse(p2pText) } }) };
    if (u.includes("v1/nfts")) return { ok: true, status: 200, json: async () => nfts };
    if (u.includes("exchange")) return { ok: true, status: 200, json: async () => ({ data: {} }) };
    if (u.includes("coingecko")) return { ok: true, status: 200, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(fixture) };
  };
  _clearCacheForTests({});
  const res = { status(c) { this.c = c; return this; }, json(o) { this.o = o; return this; } };
  const l = console.log; console.log = () => {};
  try { await handler({ query: { farm: "155498", section: "roadmap", products: "{}", roadmap: JSON.stringify(roadmapSettings) }, body: { snapshots: [] } }, res); }
  finally { console.log = l; globalThis.fetch = real; }
  assert.equal(res.c ?? 200, 200);
  return (res.o.data.sim.ranked || []).find((r) => r.name === "Vinny");
}

test("a Grape boost is in the plan while Grape is grown (the default greenhouse product)", async () => {
  const v = await roadmap({});
  assert.ok(v && v.status === "plan" && v.value > 0, JSON.stringify(v));
});

test("with Grape unchecked in the filter the same boost counts nothing toward the plan", async () => {
  const v = await roadmap({ excludeCats: ["Grape"] });
  assert.ok(!v || v.status !== "plan", `Vinny must not be IN PLAN with Grape unchecked: ${JSON.stringify(v)}`);
});
