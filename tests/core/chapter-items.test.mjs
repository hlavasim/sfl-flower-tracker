import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { calcSeedCostPerDay } from "../../core/engine/power-costs.mjs";
import { CHAPTER_BOOST_ITEMS } from "../../core/data/chapter-items.mjs";

/*
 * POWER and ROADMAP took their boost items from the sfl.world marketplace feed, and an item of the
 * running chapter is not tradeable until the chapter ends (withdrawables.ts tradeAt), so it is not
 * in that feed. Rice Shirt — +1 Rice and half the Oil to plant Rice — was owned and counted nowhere.
 * CHAPTER_BOOST_ITEMS carries those items from the game source; these tests pin that they reach the
 * boost engine, that an owned one counts, and that the price follows how the item is obtained.
 */
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const baseFarm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
const withShirt = { ...baseFarm, wardrobe: { ...(baseFarm.wardrobe || {}), "Rice Shirt": 1 } };
const item = (out, name) => out.boostItems.find((b) => b.name === name);

test("chapter items that the marketplace feed lacks are boost items", () => {
  const out = buildPowerSection(baseFarm, p2p, nfts, null, {});
  for (const name of ["Rice Shirt", "Otty the Otter", "Surfer Hair", "Salt Worker Gnome", "Moon Hair", "Ascended Chicken"]) {
    const b = item(out, name);
    assert.ok(b, `${name} is a boost item`);
    assert.equal(b.has, false, `${name}: the fixture farm does not own it`);
  }
  // The fixture farm DOES own a Trident — a fishing boost that was counted nowhere before.
  const t = item(out, "Trident");
  assert.equal(t.has, true);
  assert.ok(t.categories.includes("fishing"));
});

test("an owned Rice Shirt counts: +1 Rice in the greenhouse and half the Oil to plant Rice", () => {
  const b = item(buildPowerSection(withShirt, p2p, nfts, null, {}), "Rice Shirt");
  assert.equal(b.has, true);
  assert.ok(b.effects.some((e) => e.type === "yield_flat" && e.value === 1 && e.cat === "greenhouse" && e.product === "Rice"));
  assert.ok(b.effects.some((e) => e.type === "oil_consumption_pct" && e.value === -50 && e.product === "Rice"),
    "the Oil line is a planting cost on Rice, not a -50% Oil YIELD");
  assert.ok(!b.effects.some((e) => e.cat === "oil"), "it must not read as a penalty on the oil reserves");
  assert.ok(b.categories.includes("greenhouse"));
});

test("a product-scoped oil effect halves Rice's oil and leaves Olive alone", () => {
  const cap = { greenhouse: 4 }, xr = { coinsPerSFL: 320 }, mods = {}, prices = { ...p2p, Oil: 0.5 };
  const eff = [{ type: "oil_consumption_pct", value: -50, cat: "greenhouse", product: "Rice" }];
  const rice0 = calcSeedCostPerDay("greenhouse", "Rice", cap, xr, mods, [], prices);
  const rice1 = calcSeedCostPerDay("greenhouse", "Rice", cap, xr, mods, eff, prices);
  const olive0 = calcSeedCostPerDay("greenhouse", "Olive", cap, xr, mods, [], prices);
  const olive1 = calcSeedCostPerDay("greenhouse", "Olive", cap, xr, mods, eff, prices);
  assert.ok(rice0.oilPerSeed > 0, "Rice burns oil to plant");
  assert.equal(rice1.oilPerSeed, rice0.oilPerSeed * 0.5);
  assert.equal(olive1.oilPerSeed, olive0.oilPerSeed, "a Rice-only effect must not touch Olive");
  // An unscoped one (Greasy Plants) still applies to every greenhouse product.
  const all = [{ type: "oil_consumption_pct", value: 20, cat: "greenhouse" }];
  assert.ok(Math.abs(calcSeedCostPerDay("greenhouse", "Olive", cap, xr, mods, all, prices).oilPerSeed - olive0.oilPerSeed * 1.2) < 1e-12);
});

test("shop items are priced in tickets × the ticket value; auction and drop items carry no price", () => {
  const out = buildPowerSection(baseFarm, p2p, nfts, null, { roadmapSettings: { ticketValueSfl: 0.05 } });
  assert.equal(item(out, "Moon Hair").floor, 9000 * 0.05, "Moon Hair: 9,000 Shiny Feather");
  const rice = item(out, "Rice Shirt");
  assert.equal(rice.floor, 0);
  assert.equal(rice.priceUnknown, true, "auction: no fixed price");
  assert.equal(rice.source, "auction");
  // Without a ticket value a shop item is unpriced too, never free.
  assert.equal(item(buildPowerSection(baseFarm, p2p, nfts, null, {}), "Moon Hair").priceUnknown, true);
});

test("the roadmap's candidate list gets the priced chapter items and never an unpriced one", () => {
  const out = buildPowerSection(baseFarm, p2p, nfts, null, { roadmapSettings: { ticketValueSfl: 0.05 } });
  const names = [...out.nftData.collectibles, ...out.nftData.wearables].map((x) => x.name);
  assert.ok(names.includes("Moon Hair"), "priced shop item is a roadmap candidate");
  assert.ok(!names.includes("Rice Shirt"), "an auction item has no price, so it cannot be ranked by payback");
});

test("every chapter item names its source, and shop items their ticket cost", () => {
  for (const c of CHAPTER_BOOST_ITEMS) {
    assert.ok(["auction", "shop", "drop", "reward"].includes(c.source), `${c.name}: source`);
    assert.ok(c.type === "Wearable" || c.type === "Collectible", `${c.name}: type`);
    if (c.source === "shop") assert.ok(c.ticket && c.ticket.qty > 0, `${c.name}: ticket cost`);
  }
});
