import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { itemMarketValue } from "../../core/engine/item-value.mjs";

const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const RATES = { coinsPerSFL: 1061.0079575596817 };

test("a market-priced item returns the market price, not a derivation", () => {
  // Salt IS listed on the market; itemMarketValue must prefer it. This is the whole
  // reason itemMarketValue and itemProductionCost are separate functions.
  assert.equal(itemMarketValue("Salt", p2p, null, RATES), p2p["Salt"]);
});

test("an unpriced craftable is derived from its recipe", () => {
  // Cheese = 3 Milk (CRAFTED_INGREDIENT_RECIPES) when Cheese has no market price.
  const noCheese = { ...p2p }; delete noCheese["Cheese"];
  assert.ok(Math.abs(itemMarketValue("Cheese", noCheese, null, RATES) - 3 * p2p["Milk"]) < 1e-9);
});

test("an item nothing can price returns 0, not null", () => {
  // The 0-means-unknown contract is what ~29 existing call sites rely on via `|| 0`.
  assert.equal(itemMarketValue("Definitely Not An Item", p2p, null, RATES), 0);
});

test("a recipe cycle terminates instead of blowing the stack", () => {
  assert.equal(typeof itemMarketValue("Barn Delight", p2p, null, RATES), "number");
});
