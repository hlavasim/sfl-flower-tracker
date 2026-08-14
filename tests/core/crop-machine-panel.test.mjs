import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { CROP_GROW_DATA } from "../../core/engine/power-boosts.mjs";

/*
 * Crop Machine economics, verified against the game:
 *   - a cycle is pack × base_grow / plots, using the crop's BASE time — ordinary crop speed
 *     boosts do not apply, only machine-specific ones (already isolated by cropMachineSpeedMult);
 *   - the ordinary crop YIELD boosts DO apply to the count (Acre Farm's -0.5, faction quiver, …).
 * The old shared calc used yield=1 and overstated a basic crop under Acre Farm by a third.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wrap = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/farm-155498.json"), "utf8"));
const p2p = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/p2p-prices.json"), "utf8"));
const farm = wrap.farm || wrap;

const out = buildPowerSection(farm, p2p, { collectibles: [], wearables: [] }, null, {});
const cm = out.cropMachine;

test("the fixture farm has a crop machine panel", () => {
  assert.ok(cm && Array.isArray(cm.rows) && cm.rows.length > 0, "cropMachine payload present with rows");
});

test("a cycle is pack × base_grow / plots, at base time", () => {
  for (const r of cm.rows) {
    const expected = r.pack * CROP_GROW_DATA[r.crop] * cm.speedMult / cm.plots;
    assert.ok(Math.abs(r.cycleSec - expected) <= 1, `${r.crop}: cycle ${r.cycleSec}s must equal pack×base÷plots ${Math.round(expected)}s`);
  }
});

test("the Sunflower pack and cycle match the game (960 seeds, 96 min at base)", () => {
  const sun = cm.rows.find((r) => r.crop === "Sunflower");
  assert.ok(sun, "Sunflower is a crop-machine crop");
  assert.equal(sun.pack, 960, "Sunflower pack is 960");
  // 960 × 60s / 10 plots = 5760s = 96 min, at speedMult 1.
  if (cm.speedMult === 1) assert.equal(sun.cycleSec, 5760, "96 minutes at base speed");
});

test("yield boosts move the count, and the breakdown sums to the final", () => {
  for (const r of cm.rows) {
    if (!r.steps.length) { assert.equal(r.yieldPerSeed, r.base, "no yield boosts => count is the base"); continue; }
    // The last running total in the breakdown is the final yield-per-seed.
    assert.ok(Math.abs(r.steps[r.steps.length - 1].to - r.yieldPerSeed) < 1e-3,
      `${r.crop}: the breakdown must arrive at the final yield ${r.yieldPerSeed}, got ${r.steps[r.steps.length - 1].to}`);
  }
});

test("net = revenue − oil − seed, and rows are ranked by net", () => {
  for (const r of cm.rows) {
    assert.ok(Math.abs(r.net - (r.revenue - r.oilCost - r.seedCost)) < 1e-3, `${r.crop}: net must be revenue−oil−seed`);
  }
  for (let i = 1; i < cm.rows.length; i++) {
    assert.ok(cm.rows[i - 1].net >= cm.rows[i].net, "rows are sorted by net, richest first");
  }
});
