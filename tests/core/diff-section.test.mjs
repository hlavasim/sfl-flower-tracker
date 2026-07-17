import { test } from "node:test";
import assert from "node:assert";
import { valueDiff } from "../../core/sections/diff.mjs";

// A synthetic delta map exercising every valuation branch, with hand-computed SFL values.
const priceMap = { Wood: 0.01, Cheese: 0.33 };
const rates = { coinsPerSFL: 1000, gemsPerSFL: 50 };
const diff = {
  balance: 2,                  // +2 SFL (1:1)
  coins: 5000,                 // 5000 / 1000 = 5 SFL
  gems: 100,                   // 100 / 50 = 2 SFL
  "inventory.Wood": 30,        // 30 × 0.01 = 0.3 SFL
  "inventory.Cheese": 4,       // 4 × 0.33 = 1.32 SFL
  "inventory.Gem": 25,         // routed to gems: 25 / 50 = 0.5 SFL
  "inventory.Unpriced": 10,    // 10 × 0 = 0 SFL (absent from map)
  "wardrobe.Cap": 1,           // categorized, unvalued (0)
  "stock.Axe": 3,              // skipped entirely
  nodes: { Tree: 1 },          // skipped
  _v: 2,                       // skipped
  "_h.Tree": 4,                // skipped
  "balance_noise": 0.00001,    // below the |0.0001| threshold → skipped
};

test("valueDiff values every branch and sums netSfl to the hand-computed total", () => {
  const { items, netSfl } = valueDiff(diff, priceMap, rates);
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(byKey["balance"].sflValue, 2);
  assert.equal(byKey["coins"].sflValue, 5);
  assert.equal(byKey["gems"].sflValue, 2);
  assert.ok(Math.abs(byKey["inventory.Wood"].sflValue - 0.3) < 1e-9);
  assert.ok(Math.abs(byKey["inventory.Cheese"].sflValue - 1.32) < 1e-9);
  assert.ok(Math.abs(byKey["inventory.Gem"].sflValue - 0.5) < 1e-9);
  assert.equal(byKey["inventory.Gem"].category, "gems");
  assert.equal(byKey["inventory.Unpriced"].sflValue, 0);
  assert.equal(byKey["wardrobe.Cap"].category, "wardrobe");
  assert.equal(byKey["wardrobe.Cap"].sflValue, 0);
  assert.ok(!("stock.Axe" in byKey), "stock is skipped");
  assert.ok(!("nodes" in byKey) && !("_v" in byKey) && !("_h.Tree" in byKey), "meta keys skipped");
  assert.ok(!("balance_noise" in byKey), "sub-threshold delta skipped");
  // net = 2 + 5 + 2 + 0.3 + 1.32 + 0.5 = 11.12
  assert.ok(Math.abs(netSfl - 11.12) < 1e-9, `netSfl was ${netSfl}`);
});

test("items are sorted by |sflValue| desc, then name", () => {
  const { items } = valueDiff(diff, priceMap, rates);
  for (let i = 1; i < items.length; i++) {
    assert.ok(Math.abs(items[i - 1].sflValue) >= Math.abs(items[i].sflValue) - 1e-12, "descending by |sflValue|");
  }
  assert.equal(items[0].key, "coins");   // 5 is the largest magnitude
});

test("no-rate coins/gems degrade to 0, not NaN (matches inline `> 0` guards)", () => {
  const { netSfl, items } = valueDiff({ coins: 5000, gems: 100 }, {}, {});
  assert.equal(netSfl, 0);
  assert.ok(items.every((i) => i.sflValue === 0));
});

test("explain trace: top value equals netSfl, children are the priced changes", () => {
  const plain = valueDiff(diff, priceMap, rates);
  const trace = [];
  const traced = valueDiff(diff, priceMap, rates, trace);
  assert.equal(traced.netSfl, plain.netSfl, "trace must not change the value");
  assert.equal(trace.length, 1);
  const node = trace[0];
  assert.equal(node.item, "net SFL");
  assert.equal(node.unit, "SFL");
  assert.ok(Math.abs(node.value - plain.netSfl) < 1e-9, "trace top == netSfl");
  // one child per non-zero contribution: balance, coins, gems, Wood, Cheese, Gem = 6
  assert.equal(node.steps.length, 6);
  const cheese = node.steps.find((s) => s.item === "Cheese");
  assert.equal(cheese.formula, "4 × 0.33000 SFL");
  assert.ok(Math.abs(cheese.value - 1.32) < 1e-9);
});

test("the trace parameter is inert when absent (value unchanged)", () => {
  assert.equal(valueDiff(diff, priceMap, rates).netSfl, valueDiff(diff, priceMap, rates, undefined).netSfl);
});
