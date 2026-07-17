import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { itemMarketValue, itemProductionCost } from "../../core/engine/item-value.mjs";

const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const RATES = { coinsPerSFL: 1061.0079575596817 };

// Why the market-first tests below have to SYNTHESISE their input:
// no item in the fixture is both market-priced and derivable from a recipe —
// CRAFTED_INGREDIENT_RECIPES, RECIPE_INGREDIENTS and COMPOST_RECIPES have zero
// overlap with the 64 market entries. So with real data, market-first is
// unobservable, and a test written against real data cannot pin it. The first
// draft of this suite (from the plan) tried, and the whole 4-test suite still
// passed with the direct-P2P check moved to the BOTTOM of the function — i.e.
// with market-first destroyed, which is the entire reason itemMarketValue and
// itemProductionCost are separate functions.

test("market-first: a market price WINS over the recipe derivation", () => {
  // Cheese = 3 Milk, and Cheese is absent from the market, so both paths are
  // live and produce different numbers: derived 0.33021 vs a planted 0.5.
  // Move the direct-P2P check below the recipe branch and this fails.
  const derived = itemMarketValue("Cheese", p2p, null, RATES);
  assert.ok(Math.abs(derived - 3 * p2p["Milk"]) < 1e-9, `derived ${derived}`);

  const withMarket = { ...p2p, Cheese: 0.5 };
  assert.equal(itemMarketValue("Cheese", withMarket, null, RATES), 0.5,
    "a listed market price must win over the recipe — that IS market-first");
  assert.notEqual(derived, 0.5, "the two paths must differ or this test proves nothing");
});

test("market-first beats a derivation even when the market is CHEAPER", () => {
  // Guards against a 'take the best price' reading: the rule is market-first,
  // not market-lowest. Planted price is well under the 0.33021 derivation.
  assert.equal(itemMarketValue("Cheese", { ...p2p, Cheese: 0.001 }, null, RATES), 0.001);
});

test("an unpriced craftable is derived from its recipe", () => {
  // Cheese = 3 Milk (CRAFTED_INGREDIENT_RECIPES). Recursion into Milk really happens:
  // Milk is market-priced, so this exercises derive -> recurse -> market.
  assert.ok(Math.abs(itemMarketValue("Cheese", p2p, null, RATES) - 3 * p2p["Milk"]) < 1e-9);
});

test("an item nothing can price returns 0, not null", () => {
  // The 0-means-unknown contract is what ~29 existing call sites rely on via `|| 0`.
  assert.equal(itemMarketValue("Definitely Not An Item", p2p, null, RATES), 0);
});

test("a recipe whose ingredient is unpriceable collapses to 0, not a partial sum", () => {
  // The `if (ingPrice <= 0) return 0;` rule: one unknown ingredient voids the whole
  // recipe rather than under-reporting it. Strip Milk and Cheese must go to 0, NOT
  // to some smaller number. (The old suite's "cycle" test asserted only
  // `typeof x === "number"`, which is true on every return path in this function —
  // it passed even with the `visited` guard deleted entirely.)
  const noMilk = { ...p2p };
  delete noMilk["Milk"];
  assert.equal(itemMarketValue("Cheese", noMilk, null, RATES), 0);
});

test("productionCost ignores the market for Salt; marketValue does not — on purpose", () => {
  // Salt is on the market (0.00416071) but you rake your own, so a cooking cost must use
  // the rake's cost, not the price. This asymmetry IS the feature; if it ever collapses,
  // one of the two questions has been silently answered with the other's answer.
  const market = itemMarketValue("Salt", p2p, null, RATES);
  const cost = itemProductionCost("Salt", p2p, RATES.coinsPerSFL, {}, undefined, {});
  assert.equal(market, p2p["Salt"]);
  assert.equal(cost.source, "salt");
  assert.ok(cost.price > market, `production ${cost.price} should exceed market ${market}`);
});

test("productionCost returns null for something you cannot make", () => {
  assert.equal(itemProductionCost("Definitely Not An Item", p2p, RATES.coinsPerSFL, {}, undefined, {}), null);
});
