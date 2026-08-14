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

test("every machine crop is listed, with locked ones flagged and their unlock skill", () => {
  assert.equal(cm.rows.length, 9, "all nine crop-machine crops are shown, locked or not");
  const locked = cm.rows.filter((r) => r.locked);
  for (const r of locked) assert.ok(r.unlockSkill, `${r.crop} is locked, so it must name the module that unlocks it`);
  // Sunflower is a basic crop — never locked.
  assert.equal(cm.rows.find((r) => r.crop === "Sunflower").locked, false);
});

test("each crop carries an active and an available boost list, split by ownership", () => {
  for (const r of cm.rows) {
    assert.ok(Array.isArray(r.active) && Array.isArray(r.available), `${r.crop}: has both lists`);
    // No boost is both active and available, and none is listed twice.
    const activeNames = new Set(r.active.map((e) => e.name));
    for (const e of r.available) assert.ok(!activeNames.has(e.name), `${r.crop}: ${e.name} cannot be active and available at once`);
    const all = r.active.concat(r.available).map((e) => e.name);
    assert.equal(all.length, new Set(all).size, `${r.crop}: no boost appears twice`);
  }
});

test("boosts respect the crop's tier — a medium crop sees medium boosts, a basic one does not", () => {
  const cabbage = cm.rows.find((r) => r.crop === "Cabbage");   // medium
  const sunflower = cm.rows.find((r) => r.crop === "Sunflower"); // basic
  const names = (r) => r.active.concat(r.available).map((e) => e.name);
  assert.ok(names(cabbage).includes("Cabbage Boy"), "Cabbage lists its Cabbage-specific NFT");
  assert.ok(!names(sunflower).includes("Cabbage Boy"), "Sunflower does not");
  assert.ok(names(cabbage).some((n) => /Scary Mike|Experienced Farmer/.test(n)), "Cabbage lists a medium-tier boost");
});

test("net = revenue − oil − seed, and unlocked crops are ranked richest first", () => {
  for (const r of cm.rows) {
    assert.ok(Math.abs(r.net - (r.revenue - r.oilCost - r.seedCost)) < 1e-3, `${r.crop}: net must be revenue−oil−seed`);
  }
  const unlocked = cm.rows.filter((r) => !r.locked);
  for (let i = 1; i < unlocked.length; i++) {
    assert.ok(unlocked[i - 1].net >= unlocked[i].net, "unlocked crops are sorted by net, richest first");
  }
  // Locked crops come after all unlocked ones.
  const firstLocked = cm.rows.findIndex((r) => r.locked);
  if (firstLocked >= 0) for (let i = firstLocked; i < cm.rows.length; i++) assert.ok(cm.rows[i].locked, "locked crops are grouped at the end");
});
