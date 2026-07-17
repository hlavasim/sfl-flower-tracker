import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { itemMarketValue, itemProductionCost } from "../../core/engine/item-value.mjs";
import { CRAFTED_INGREDIENT_RECIPES, TREASURE_SELL_PRICES, CRUSTACEAN_RECIPES } from "../../core/data/crafting.mjs";
import { FLOWER_RECIPES, DOLL_RECIPES, RECIPE_INGREDIENTS } from "../../core/data/recipes.mjs";
import { SEED_COSTS, EXOTIC_CROPS_TICKET_COST, GIANT_FRUIT_SELL_PRICES, TOOL_COSTS, FLOWER_SEED_COIN_COSTS, ITEM_XP_VALUES, GIANT_ITEM_COIN_PRICES } from "../../core/data/economy.mjs";
import { FISH_MARKET_RECIPES, FISH_DATA, BAIT_WORM_YIELD } from "../../core/data/fishing.mjs";
import { COOKING_INGREDIENTS, SALT_RAKE_COST, SALT_BASE_YIELD } from "../../core/data/cooking.mjs";

const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const R = { coinsPerSFL: 1061.0079575596817 };

// ---------------------------------------------------------------------------
// Task 1: itemMarketValue trace sink
// ---------------------------------------------------------------------------

test("a trace's top value equals the plain return, and mirrors the recursion", () => {
  const plain = itemMarketValue("Cheese", p2p, null, R);              // Cheese = 3 Milk (derived)
  const trace = [];
  const traced = itemMarketValue("Cheese", p2p, null, R, trace);
  assert.equal(traced, plain, "traced return must equal untraced return");
  assert.equal(trace.length, 1, "one top-level step");
  const node = trace[0];
  assert.equal(node.item, "Cheese");
  assert.equal(node.value, plain);
  assert.ok(node.steps && node.steps.some((s) => s.item === "Milk"), "recursion captured as child steps");
  assert.match(node.formula, /Milk/);                                 // human formula names the ingredient
});

test("the trace parameter is inert when absent (value unchanged)", () => {
  assert.equal(itemMarketValue("Cheese", p2p, null, R), itemMarketValue("Cheese", p2p, null, R, undefined));
});

// ---------------------------------------------------------------------------
// Task 2: itemProductionCost trace sink
// ---------------------------------------------------------------------------

test("productionCost trace explains the Salt rake derivation, value matches", () => {
  const plain = itemProductionCost("Salt", p2p, R.coinsPerSFL, {}, undefined, {});
  const trace = [];
  const traced = itemProductionCost("Salt", p2p, R.coinsPerSFL, {}, undefined, {}, trace);
  assert.equal(traced.price, plain.price);
  assert.equal(trace[0].value, plain.price);
  assert.equal(trace[0].method, "salt rake");
  assert.match(trace[0].formula, /rake/i);
});

test("the trace parameter is inert for itemProductionCost when absent (value unchanged)", () => {
  const a = itemProductionCost("Salt", p2p, R.coinsPerSFL, {}, undefined, {});
  const b = itemProductionCost("Salt", p2p, R.coinsPerSFL, {}, undefined, {}, undefined);
  assert.equal(a.price, b.price);
  assert.equal(a.source, b.source);
});

test("a null (unpriceable) production result emits no trace node", () => {
  const trace = [];
  const result = itemProductionCost("Definitely Not An Item", p2p, R.coinsPerSFL, {}, undefined, {}, trace);
  assert.equal(result, null);
  assert.equal(trace.length, 0, "no value to explain, so nothing is pushed");
});

// ---------------------------------------------------------------------------
// Hand-computed formula pins — the value-equals test below is tautological (two
// calls of the same function); it does NOT prove the FORMULA text reflects the
// real numbers. These pin the exact string for two known, hand-computed derivations.
// ---------------------------------------------------------------------------

test("Cheese market trace formula pins the real numbers: 3 x Milk @ market price", () => {
  const trace = [];
  const value = itemMarketValue("Cheese", p2p, null, R, trace);
  assert.equal(value, 3 * p2p["Milk"]);
  assert.equal(trace[0].method, "crafted recipe");
  assert.equal(trace[0].formula, `3 × Milk @ ${p2p["Milk"].toFixed(5)}`);
  assert.equal(trace[0].steps.length, 1);
  assert.equal(trace[0].steps[0].item, "Milk");
  assert.equal(trace[0].steps[0].method, "market price");
  assert.equal(trace[0].steps[0].formula, "P2P");
  assert.equal(trace[0].steps[0].value, p2p["Milk"]);
});

test("Salt production trace formula pins the rake numbers: coins + Wood material / yield", () => {
  const trace = [];
  const result = itemProductionCost("Salt", p2p, R.coinsPerSFL, {}, undefined, {}, trace);
  const coinSFL = SALT_RAKE_COST.coins / R.coinsPerSFL;
  const wood = p2p["Wood"];
  const expectedPrice = (coinSFL + wood * 3) / SALT_BASE_YIELD;
  assert.ok(Math.abs(result.price - expectedPrice) < 1e-9);
  const expectedFormula = `Salt Rake: (${SALT_RAKE_COST.coins}c × 1.00 / ${R.coinsPerSFL.toFixed(0)} c/SFL + 3 × Wood @ ${wood.toFixed(5)}) / ${SALT_BASE_YIELD} yield`;
  assert.equal(trace[0].formula, expectedFormula);
  assert.equal(trace[0].value, result.price);
});

// ---------------------------------------------------------------------------
// Value-can't-lie: over MANY items (built from the raw data tables — an
// independent source, not from calling the resolvers themselves), the traced
// call's top-level value must equal the untraced return. Zero mismatches.
// ---------------------------------------------------------------------------

const RATES_FULL = { coinsPerSFL: 1061.0079575596817, sflPerXP: 0.001, gemsPerSFL: 100, treasureBoost: 1.2, season: "spring" };

const marketItems = new Set([
  ...Object.keys(p2p),
  ...Object.keys(CRAFTED_INGREDIENT_RECIPES),
  ...Object.keys(RECIPE_INGREDIENTS),
  ...Object.keys(DOLL_RECIPES),
  ...Object.keys(FLOWER_RECIPES),
  ...Object.keys(TOOL_COSTS),
  ...Object.keys(SEED_COSTS).map((c) => `${c} Seed`),
  ...Object.keys(FLOWER_SEED_COIN_COSTS),
  ...Object.keys(ITEM_XP_VALUES),
  ...Object.keys(GIANT_ITEM_COIN_PRICES),
  ...Object.keys(EXOTIC_CROPS_TICKET_COST),
  ...Object.keys(GIANT_FRUIT_SELL_PRICES),
  ...Object.keys(TREASURE_SELL_PRICES),
  ...Object.keys(CRUSTACEAN_RECIPES),
  ...Object.keys(FISH_MARKET_RECIPES),
  ...Object.keys(BAIT_WORM_YIELD),
  "Love Charm", "Mark", "Barn Delight", "Omnifeed", "Acorn", "Definitely Not An Item",
]);

test(`itemMarketValue: trace[0].value equals the untraced return, across ${marketItems.size} items spanning every branch`, () => {
  let checked = 0;
  for (const item of marketItems) {
    const plain = itemMarketValue(item, p2p, null, RATES_FULL);
    const trace = [];
    const traced = itemMarketValue(item, p2p, null, RATES_FULL, trace);
    assert.equal(traced, plain, `traced return mismatch for ${item}`);
    assert.equal(trace.length, 1, `expected exactly one top-level trace node for ${item}`);
    assert.equal(trace[0].value, plain, `trace[0].value mismatch for ${item}`);
    assert.equal(trace[0].item, item, `trace[0].item mismatch for ${item}`);
    checked++;
  }
  assert.ok(checked > 100, `expected a broad item spread, only checked ${checked}`);
});

const productionItems = new Set([
  "Salt",
  ...Object.keys(p2p),
  ...Object.keys(FISH_DATA),
  ...Object.keys(BAIT_WORM_YIELD),
  ...Object.keys(FISH_MARKET_RECIPES),
  ...Object.keys(COOKING_INGREDIENTS),
  ...Object.keys(CRAFTED_INGREDIENT_RECIPES),
  ...Object.keys(CRUSTACEAN_RECIPES),
  ...Object.keys(TREASURE_SELL_PRICES),
  "Definitely Not An Item",
]);

test(`itemProductionCost: trace[0].value equals plain.price across ${productionItems.size} items, null stays untraced`, () => {
  let checked = 0, priced = 0;
  for (const item of productionItems) {
    const plain = itemProductionCost(item, p2p, RATES_FULL.coinsPerSFL, {}, undefined, {});
    const trace = [];
    const traced = itemProductionCost(item, p2p, RATES_FULL.coinsPerSFL, {}, undefined, {}, trace);
    if (plain === null) {
      assert.equal(traced, null, `expected null for ${item}`);
      assert.equal(trace.length, 0, `expected no trace node for unpriceable ${item}`);
    } else {
      assert.equal(traced.price, plain.price, `traced price mismatch for ${item}`);
      assert.equal(trace.length, 1, `expected exactly one top-level trace node for ${item}`);
      assert.equal(trace[0].value, plain.price, `trace[0].value mismatch for ${item}`);
      priced++;
    }
    checked++;
  }
  assert.ok(checked > 50, `expected a broad item spread, only checked ${checked}`);
  assert.ok(priced > 10, `expected a good number of items to actually price, only ${priced} did`);
});
