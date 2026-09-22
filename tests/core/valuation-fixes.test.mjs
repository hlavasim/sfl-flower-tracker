import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildTreasurySection, computeFarmValue, buildTreasuryData } from "../../core/sections/treasury.mjs";
import { buildPricesSection } from "../../core/sections/prices.mjs";
import { valueDiff, diffPriceMap } from "../../core/sections/diff.mjs";
import { pickCoinsPerSFL, nftUnitPrice } from "../../core/engine/prices.mjs";
import { itemMarketValue } from "../../core/engine/item-value.mjs";
import { COOKING_INGREDIENTS } from "../../core/data/cooking.mjs";
import ITEM_NAMES from "../../api/_item-names.js";

/*
 * The Treasury / Diff valuation fixes of the 2026-09-22 review (E1-E9, D8, F). Each test is
 * written so it fails on the code before its fix — the comment above each says what it read then.
 */
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
const quiet = (fn) => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };
const treasury = (nftData = nfts, settings = {}, f = farm) => quiet(() => buildTreasurySection(f, p2p, nftData, null, 97000, settings));

// E1 — before: no `produced` category; the fixture's 92 held dishes (Gumbo, Chowder, ...) were 0.
test("E1: cooked dishes and other off-feed items are valued at the section=prices production cost", () => {
  const { td, value } = treasury();
  const pc = buildPricesSection(farm, p2p, { coinsPerSFL: td.coinsPerSFL_betty }).productionCost;
  const gumbo = (value.produced || []).find((r) => r.name === "Gumbo");
  assert.ok(gumbo, "Gumbo (held ×5, not on the p2p feed) is valued");
  assert.equal(gumbo.qty, 5);
  assert.ok(Math.abs(gumbo.unitPrice - pc.Gumbo) < 1e-12, "at the production cost section=prices serves");
  const dishes = value.produced.filter((r) => COOKING_INGREDIENTS[r.name]);
  assert.ok(dishes.length >= 80, `${dishes.length} held dishes valued`);
  assert.ok(value.totals.produced > 100, `produced total ${value.totals.produced}`);
  const sum = ["resources", "treasures", "collectibles", "produced", "wearables", "pets", "listings", "liquid"]
    .reduce((s, k) => s + value.totals[k], 0);
  assert.ok(Math.abs(sum - value.totals.grand) < 1e-6, "and the grand total includes it");
  // An item already priced elsewhere is not double counted.
  for (const r of value.produced) {
    assert.equal(p2p[r.name], undefined, `${r.name} is on the p2p feed — it belongs to resources`);
    assert.ok(!value.treasures.some((t) => t.name === r.name), `${r.name} is also a treasure`);
  }
});

// E3 — before: rows without a name were keyed "undefined"; Master Chef's Cleaver (wardrobe ×1)
// and Kraken Tentacle (inventory ×8) were missing from the Treasury.
test("E3: nameless sfl.world NFT rows are resolved by id and valued", () => {
  const nameless = {
    collectibles: [{ id: 1533, floor: 12, lastSalePrice: 11, collection: "collectibles" }],
    wearables: [{ id: 500, floor: 1899, lastSalePrice: 1800, collection: "wearables" }],
  };
  const { value, td } = treasury(nameless, { itemNames: ITEM_NAMES });
  assert.ok(td.nftCollectibles["Kraken Tentacle"], "id 1533 resolves to Kraken Tentacle");
  assert.equal(td.nftCollectibles.undefined, undefined, "nothing is keyed 'undefined'");
  const kraken = value.collectibles.find((c) => c.name === "Kraken Tentacle");
  assert.deepEqual([kraken.qty, kraken.total], [8, 96]);
  const cleaver = value.wearables.find((w) => w.name === "Master Chef's Cleaver");
  assert.ok(cleaver && cleaver.total === 1899, "the Cleaver is valued at its 1,899 floor");
});

// E4 — before: the BILANCE farm row was treasury grand × 0.9 — coins, gems and treasures sold
// on a marketplace that does not trade them, and 10 % "fee" taken off the FLOWER balance too.
test("E4: the sellable figure is marketplace items less 10 % plus the FLOWER balance, nothing else", () => {
  const { value } = treasury();
  const t = value.totals, s = value.sellable;
  assert.ok(s, "computeFarmValue returns a sellable breakdown");
  const market = t.resources + t.collectibles + t.wearables + t.pets + t.listings;
  assert.ok(Math.abs(s.marketplace - market) < 1e-9);
  assert.ok(Math.abs(s.total - (market * 0.9 + value.liquid.sflBalance)) < 1e-9, "no fee on FLOWER");
  assert.deepEqual(Object.keys(s.excluded).sort(), ["coins", "gems", "produced", "treasures"]);
  assert.ok(s.total < t.grand * 0.9, "strictly less than the old grand × 0.9 on this farm");
});

// E9 — before: Treasury priced a wearable at its LAST SALE when one existed (Merino Jumper 146)
// while ROI / Power / Sales used the floor (291).
test("E9: a wearable is worth its floor; last sale only when there is no floor", () => {
  assert.equal(nftUnitPrice({ floor: 291, lastSalePrice: 146 }), 291);
  assert.equal(nftUnitPrice({ floor: 0, lastSalePrice: 146 }), 146);
  assert.equal(nftUnitPrice(null), 0);
  const name = Object.keys(farm.wardrobe).find((n) => farm.wardrobe[n] > 0);
  const { value } = treasury({ collectibles: [], wearables: [{ name, floor: 291, lastSalePrice: 146 }] });
  assert.equal(value.wearables.find((w) => w.name === name).unitPrice, 291);
});

// D8 — before: a Camel merely in the inventory still added +30 % to every treasure.
test("D8: the Camel's treasure bonus needs the Camel placed", () => {
  const unplaced = structuredClone(farm);
  for (const m of [unplaced.collectibles, unplaced.home && unplaced.home.collectibles,
    unplaced.interior && unplaced.interior.ground && unplaced.interior.ground.collectibles,
    unplaced.interior && unplaced.interior.level_one && unplaced.interior.level_one.collectibles]) if (m) delete m.Camel;
  assert.equal(unplaced.inventory.Camel, "1", "still owned");
  assert.ok(Math.abs(treasury(nfts, {}, farm).value.treasureBoost - 1.5) < 1e-9, "placed: Treasure Map + Camel");
  assert.ok(Math.abs(treasury(nfts, {}, unplaced).value.treasureBoost - 1.2) < 1e-9, "in the inventory only: Treasure Map alone");
});

// F — before: a missing exchange became a hardcoded 320 coins/FLOWER, the Diff page used its own
// `|| 320`, and the roadmap 1500: three answers to one question.
test("F: one coin-rate fallback — the mode's live source, else the other one, else 0 (unpriced)", () => {
  assert.equal(pickCoinsPerSFL("betty", 1061, 320), 1061);
  assert.equal(pickCoinsPerSFL("api", 1061, 320), 320);
  assert.equal(pickCoinsPerSFL("api", 1061, 0), 1061, "no exchange: the live Betty rate, not 320");
  assert.equal(pickCoinsPerSFL("betty", 0, 320), 320);
  assert.equal(pickCoinsPerSFL("betty", 0, 0), 0, "no source at all is unpriced, never a guess");
  assert.equal(pickCoinsPerSFL("zero", 1061, 320), 0);
  const td = quiet(() => buildTreasuryData(p2p, nfts, null, 0));
  assert.equal(td.coinsPerSFL_api, 0);
  const api = quiet(() => computeFarmValue(farm, td, "api", {}));
  assert.equal(api.rates.coinsPerSFL, td.coinsPerSFL_betty, "api mode without an exchange uses Betty");
});

// E6 — before: Fish Oil's market value summed its PRICEABLE ingredients only (0.028 FLOWER against
// a 5.7 production cost), Oyster / Sea Urchin were pot-only, Sand Drill coins + the rest.
test("E6: an unpriceable ingredient leaves the result unpriced, not a partial sum", () => {
  const rates = { coinsPerSFL: 1061, season: "autumn" };
  for (const n of ["Fish Oil", "Oyster", "Sea Urchin", "Sand Drill"]) {
    assert.equal(itemMarketValue(n, p2p, null, rates), 0, `${n} has an unpriceable input`);
  }
  // ...while a fully priceable recipe still prices.
  assert.ok(itemMarketValue("Anemone", p2p, null, rates) > 5, "Anemone: pot + a priced chum");
});

// E7 — before: section=prices priced Fish Market goods at the cheapest season of the year (Fish
// Flake 1.29) while the cooking section used the farm's own season (2.96).
test("E7: section=prices prices the Fish Market at the season the farm is in", () => {
  const pc = buildPricesSection(farm, p2p, { coinsPerSFL: 1061 }).productionCost;
  const autumn = buildPricesSection(farm, p2p, { coinsPerSFL: 1061, season: "autumn" }).productionCost;
  assert.equal(farm.season.season, "autumn");
  assert.equal(pc["Fish Flake"], autumn["Fish Flake"], "no season given = the farm's season");
  assert.ok(pc["Fish Flake"] > 2.5, `Fish Flake ${pc["Fish Flake"]} — the autumn recipe, not the cheapest season's 1.29`);
});

// E2 — before: the diff map was marketValue only; 63 of 122 dishes had none, so cooking a Gumbo
// booked 50 Potato + 30 Pumpkin + ... as a loss and the Gumbo as nothing.
// E5 — before: wardrobe changes and Oil were never valued, NFT collectible floors not either.
test("E2/E5: the diff map falls back to production cost, NFT floors and the Oil drill cost", () => {
  const prices = buildPricesSection(farm, p2p, { coinsPerSFL: 1061, sflPerXP: 0, season: "autumn" });
  const td = quiet(() => buildTreasuryData(p2p, {
    collectibles: [{ name: "Foreman Beaver", floor: 13000 }],
    wearables: [{ name: "Merino Jumper", floor: 291, lastSalePrice: 146 }],
  }, null, 0));
  const pm = diffPriceMap(prices, td, 0.074);
  const foods = Object.keys(COOKING_INGREDIENTS);
  const unpriced = foods.filter((n) => !pm.items[n] && prices.productionCost[n]);
  assert.deepEqual(unpriced, [], "every dish with a production cost is priced");
  assert.equal(pm.items.Gumbo, prices.productionCost.Gumbo);
  assert.equal(pm.items["Foreman Beaver"], 13000, "a collectible in the inventory at its floor");
  assert.equal(pm.items.Oil, 0.074);
  assert.equal(pm.wearables["Merino Jumper"], 291);

  const rates = { coinsPerSFL: 1061, wearablePrices: pm.wearables };
  const cook = {};
  for (const [ing, q] of Object.entries(COOKING_INGREDIENTS.Gumbo)) cook["inventory." + ing] = -10 * q;
  cook["inventory.Gumbo"] = 10;
  const ingredientsOnly = valueDiff(Object.fromEntries(Object.entries(cook).filter(([k]) => k !== "inventory.Gumbo")), pm.items, rates).netSfl;
  const net = valueDiff(cook, pm.items, rates).netSfl;
  assert.ok(net > ingredientsOnly + 5, `the 10 Gumbo are worth something (${net} vs ${ingredientsOnly})`);
  assert.ok(Math.abs(valueDiff({ "inventory.Oil": -50 }, pm.items, rates).netSfl + 50 * 0.074) < 1e-9, "Oil burned is a cost");
  const buy = valueDiff({ balance: -13000, "inventory.Foreman Beaver": 1 }, pm.items, rates).netSfl;
  assert.ok(Math.abs(buy) < 1e-9, "buying a collectible at its floor is not a 13,000 loss");
  assert.equal(valueDiff({ "wardrobe.Merino Jumper": 1 }, pm.items, rates).netSfl, 291, "a wearable gained is valued");
});
