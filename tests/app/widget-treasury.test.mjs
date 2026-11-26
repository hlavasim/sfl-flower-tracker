import { test } from "node:test";
import assert from "node:assert";
import { looksFor, renderLook } from "../../ui/glance-templates.mjs";
import { treasuryValue } from "../../widgets/treasury-value.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { createStore } from "../../app/store.mjs";

// TREASURY · farm value: the total in SFL / USD / BTC and the share of each category as a pie, from
// the server's section=treasury valuation (the same numbers as the TREASURY page).

const VALUE = {
  totals: { grand: 1000, resources: 500, treasures: 0, collectibles: 250, produced: 0, wearables: 150, pets: 0, listings: 0, liquid: 100 },
  rates: { sflUsd: 0.5, btcUsd: 100000 },
};
const T = { value: VALUE, pricesOk: true };
const COLORS = { resources: "#a00", collectibles: "#0a0", wearables: "#00a", liquid: "#aa0" };

test("registered; needs the treasury valuation of the farm", () => {
  assert.strictEqual(WIDGETS["treasury-value"], treasuryValue);
  assert.deepStrictEqual(treasuryValue.needs(4), { treasury: { res: "treasury", farm: 4 } });
});

test("total in SFL, USD and BTC; a pie with each category's share, tiny ones left out of the slices", () => {
  const { html } = treasuryValue.view({ treasury: T }, { catColors: COLORS });
  assert.match(html, /1[\s ,.]?000/);
  assert.match(html, /\$500/);
  assert.match(html, /0\.00500000 BTC/);
  assert.match(html, /conic-gradient\(#a00 0% 50%, #0a0 50% 75%, #00a 75% 90%, #aa0 90% 100%\)/);
  assert.match(html, /Resources: 50\.0 %/);
  assert.doesNotMatch(html, /Treasures:/);
});

test("prices missing: the total is flagged, not passed off as real", () => {
  assert.match(treasuryValue.view({ treasury: { ...T, pricesOk: false } }, {}).html, /prices did not load/);
});

test("no valuation yet → an explanation", () => {
  assert.match(treasuryValue.view({ treasury: null }, {}).empty, /Treasury/);
});

test("store: treasury asks section=treasury with the page's coin mode and pet prices", async () => {
  const calls = [];
  const f = async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ data: { value: VALUE, coinMode: "api" }, pricesOk: true }) }; };
  const prev = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => ({ sfl_coin_mode: "api", sfl_pet_prices_v1: '{"Pet":3}' })[k] ?? null };
  try {
    const r = await createStore({ fetch: f }).get({ res: "treasury", farm: 8 });
    assert.strictEqual(r.status, "ok");
    assert.deepStrictEqual(r.data, { value: VALUE, coinMode: "api", pricesOk: true });
    assert.match(calls[0], /section=treasury/);
    assert.match(calls[0], /coinMode=api/);
    assert.match(calls[0], /petprices=%7B%22Pet%22%3A3%7D/);
  } finally { globalThis.localStorage = prev; }
});

test("📱 glance model: the total with USD and BTC; each category's share, biggest first; incomplete prices flagged", () => {
  const m = treasuryValue.glanceModel({ treasury: T });
  assert.strictEqual(treasuryValue.look, "number");
  assert.deepStrictEqual(m.head, { value: "1k", unit: " 🌸", cap: "$500.00 · 0.00500000 BTC", hero: "💰" });
  assert.deepStrictEqual(m.items.map((i) => [i.name, i.value]), [["Resources", "50 %"], ["Collectibles", "25 %"], ["Wearables", "15 %"], ["Liquid", "10 %"]]);
  assert.deepStrictEqual(m.items[0], { icon: "⛏️", name: "Resources", sub: "500 🌸", value: "50 %", pct: 50 });
  assert.deepStrictEqual(m.tiles.map((t) => t.label), ["SFL", "USD", "BTC", "1 SFL"]);
  assert.strictEqual(m.foot, undefined);
  assert.match(renderLook(m, "number").html, /<div class="gx-num(?: gx-num-long)?">1k<small> 🌸<\/small><\/div><div class="gx-cap">\$500\.00 · 0\.00500000 BTC<\/div>/);
  assert.ok(looksFor(m).length >= 3);
  assert.strictEqual(treasuryValue.glanceModel({ treasury: { ...T, pricesOk: false } }).foot, "⚠ incomplete valuation");
  assert.deepStrictEqual(treasuryValue.glanceModel({}), { empty: "The Treasury valuation did not load." });
  assert.strictEqual(treasuryValue.glance, undefined, "the hand-written face is gone");
});
