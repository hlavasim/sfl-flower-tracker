import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildCookingSection } from "../../core/sections/cooking.mjs";
import { computeRecipeCost } from "../../core/engine/cooking-cost.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const R = 1061.0079575596817;   // coinsPerSFL

// ---------------------------------------------------------------------------
// computeRecipeCost trace sink — a cost is Σ (qty × ingredient production cost).
// Mashed Potato = 8 Potato: a single-ingredient recipe, hand-computable.
// ---------------------------------------------------------------------------

test("computeRecipeCost trace pins the Σ ingredient formula and value", () => {
  const trace = [];
  const rc = computeRecipeCost("Mashed Potato", p2p, R, {}, undefined, trace);
  assert.equal(rc.total, 8 * p2p["Potato"]);              // hand-computed
  assert.equal(trace.length, 1);
  const node = trace[0];
  assert.equal(node.item, "Mashed Potato");
  assert.equal(node.method, "recipe cost");
  assert.equal(node.value, rc.total);
  assert.equal(node.unit, "SFL");
  assert.equal(node.formula, `8 × Potato @ ${p2p["Potato"].toFixed(5)}`);
  // one child per ingredient, itself carrying the ingredient's production derivation
  assert.equal(node.steps.length, 1);
  assert.equal(node.steps[0].item, "Potato");
  assert.equal(node.steps[0].value, 8 * p2p["Potato"]);
  assert.ok(node.steps[0].steps && node.steps[0].steps.length >= 1, "ingredient's own production trace present");
});

test("computeRecipeCost is inert when no trace sink is passed (value unchanged)", () => {
  const a = computeRecipeCost("Mashed Potato", p2p, R, {}, undefined);
  const b = computeRecipeCost("Mashed Potato", p2p, R, {}, undefined, undefined);
  assert.equal(a.total, b.total);
  assert.equal(a.items.length, b.items.length);
});

// ---------------------------------------------------------------------------
// section: costTrace — opt-in, top value equals the selected recipe's cost/cook
// ---------------------------------------------------------------------------

test("explain attaches a costTrace whose top value equals the selected recipe's cost", () => {
  const explained = buildCookingSection(farm, p2p, { savedRecipes: {}, petSimulate: true, coinsPerSFL: R, explain: true });
  assert.ok(explained.costTrace, "costTrace present when explain");
  let checked = 0;
  for (const [bd, b] of Object.entries(explained.buildings)) {
    const sel = b.recipe && (b.recipes || []).find((r) => r.name === b.recipe);
    if (!sel || !(sel.cost > 0)) continue;              // unpriced/no-recipe buildings have no cost trace
    const node = explained.costTrace[bd];
    assert.ok(node, `cost trace for ${bd}`);
    assert.ok(Math.abs(node.value - sel.cost) < 1e-9, `${bd}: cost trace ${node.value} vs card cost ${sel.cost}`);
    assert.equal(node.unit, "SFL");
    checked++;
  }
  assert.ok(checked >= 1, `expected at least one priced building traced, got ${checked}`);
});

test("cooking payload has no costTrace key when explain is absent", () => {
  const plain = buildCookingSection(farm, p2p, { savedRecipes: {}, petSimulate: true, coinsPerSFL: R });
  assert.equal(plain.costTrace, undefined);
});
