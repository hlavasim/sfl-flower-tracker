import { test } from "node:test";
import assert from "node:assert";
import { parseBoostEffects } from "../../core/engine/power-boosts.mjs";
import { applyBoosts } from "../../core/engine/power-helpers.mjs";

/*
 * Green Amulet: a 10 % chance that the MULTIPLICATIVE part of a crop's yield is multiplied by 10
 * (harvest.ts getMultiplicativeCropYield; Rice and Olive through the same function). Expected
 * value x1.9 on that part, applied before the additive boosts. It was modelled as "+10 flat on
 * a 10 % chance" = +1 per harvest, which ignored the other multipliers it scales.
 */
test("Green Amulet is an expected x1.9 on the multiplicative yield, for crops, Rice and Olive", () => {
  const eff = parseBoostEffects("anything", "Green Amulet").map((e) => [e.type, e.value, e.cat, e.product || null]);
  assert.deepEqual(eff, [["yield_pct", 90, "crops", null], ["yield_pct", 90, "greenhouse", "Rice"], ["yield_pct", 90, "greenhouse", "Olive"]]);
});

test("it scales the other multipliers and leaves the additive boosts alone", () => {
  const cap = { crops: 10 };
  const scarecrow = { type: "yield_pct", value: 20, cat: "crops" };   // x1.2, multiplicative
  const flat = { type: "yield_flat", value: 0.5, cat: "crops" };      // additive
  const amulet = parseBoostEffects("anything", "Green Amulet").filter((e) => e.cat === "crops");
  const perCycle = (effs) => { const ab = applyBoosts("crops", "Wheat", cap, effs); return ab.unitsPerDay / (10 * 86400 / ab.effectiveCycle); };
  const without = perCycle([scarecrow, flat]);
  const withAmulet = perCycle([scarecrow, flat, ...amulet]);
  assert.ok(Math.abs(without - (1.2 + 0.5)) < 1e-9);
  assert.ok(Math.abs(withAmulet - (1.2 * 1.9 + 0.5)) < 1e-9, `got ${withAmulet}`);
});
