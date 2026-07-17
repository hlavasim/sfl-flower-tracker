import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { itemMarketValue } from "../../core/engine/item-value.mjs";
import { CRAFTED_INGREDIENT_RECIPES, TREASURE_SELL_PRICES, CRUSTACEAN_RECIPES } from "../../core/data/crafting.mjs";
import { FLOWER_RECIPES, DOLL_RECIPES, RECIPE_INGREDIENTS } from "../../core/data/recipes.mjs";
import { SEED_COSTS, EXOTIC_CROPS_TICKET_COST, GIANT_FRUIT_SELL_PRICES, TOOL_COSTS, FLOWER_SEED_COIN_COSTS, ITEM_XP_VALUES, GIANT_ITEM_COIN_PRICES } from "../../core/data/economy.mjs";
import { FISH_MARKET_RECIPES, BAIT_WORM_YIELD } from "../../core/data/fishing.mjs";

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
// Hand-computed formula pin — the value-equals test below is tautological (two
// calls of the same function); it does NOT prove the FORMULA text reflects the
// real numbers. This pins the exact string for a known, hand-computed derivation.
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

// ---------------------------------------------------------------------------
// Value-can't-lie: over MANY items (built from the raw data tables — an
// independent source, not from calling the resolver itself), the traced
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
