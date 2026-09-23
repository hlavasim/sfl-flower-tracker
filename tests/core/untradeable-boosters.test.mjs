import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { gameExtraEffects } from "../../core/engine/power-helpers.mjs";

/*
 * Immortal Pear, Basic Scarecrow, Bale and Radiant Ray never trade, so the marketplace feed the
 * boost list is built from does not carry them, and nothing added them: an owner who had all four
 * placed got none of their boosts in POWER / ROADMAP. Rules from the game source (2026-09-23):
 * landExpansion/utils.ts getFruitHarvests, plant.ts, lib/animals.ts, ironMine.ts.
 */
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const base = wrap.farm || wrap;
const farmWith = (names, skills = {}) => {
  const f = JSON.parse(JSON.stringify(base));
  f.collectibles = f.collectibles || {};
  const maps = [f.collectibles, f.home && f.home.collectibles, f.interior && f.interior.ground && f.interior.ground.collectibles,
    f.interior && f.interior.level_one && f.interior.level_one.collectibles].filter(Boolean);
  for (const n of ["Immortal Pear", "Basic Scarecrow", "Bale", "Radiant Ray"]) for (const m of maps) delete m[n];
  for (const n of names) f.collectibles[n] = [{ coordinates: { x: 0, y: 0 }, id: n, readyAt: 0, createdAt: 0 }];
  f.bumpkin = { ...(f.bumpkin || {}), skills: { ...skills } };
  return f;
};
const bySource = (farm, src) => gameExtraEffects(farm).filter((e) => e.source === src);

test("none of the four is added when it is not placed", () => {
  const f = farmWith([]);
  for (const n of ["Immortal Pear", "Basic Scarecrow", "Bale", "Radiant Ray"]) assert.equal(bySource(f, n).length, 0, n);
});

test("Immortal Pear: +1 fruit harvest per seed, +2 with Pear Turbocharge", () => {
  assert.deepEqual(bySource(farmWith(["Immortal Pear"]), "Immortal Pear").map((e) => [e.type, e.cat, e.value]), [["extra_harvest", "fruits", 1]]);
  assert.equal(bySource(farmWith(["Immortal Pear"], { "Pear Turbocharge": 1 }), "Immortal Pear")[0].value, 2);
});

test("Basic Scarecrow: ×0.8 growth time on basic crops only, inside its area", () => {
  const [e] = bySource(farmWith(["Basic Scarecrow"]), "Basic Scarecrow");
  assert.equal(e.type, "speed_mult"); assert.equal(e.value, 0.8); assert.equal(e.cropTier, "basic"); assert.equal(e.aoe, true);
});

test("Bale: +0.1 Egg, milk and wool only with Bale Economy, doubled by Double Bale", () => {
  const plain = bySource(farmWith(["Bale"]), "Bale");
  assert.deepEqual(plain.map((e) => [e.cat, e.product, e.value]), [["chickens", "Egg", 0.1]]);
  const full = bySource(farmWith(["Bale"], { "Bale Economy": 1, "Double Bale": 1 }), "Bale");
  assert.deepEqual(full.map((e) => [e.cat, e.product, +e.value.toFixed(6)]),
    [["chickens", "Egg", 0.2], ["sheep", "Wool", 0.2], ["cows", "Milk", 0.2]]);
});

test("Radiant Ray: +0.1 Iron", () => {
  assert.deepEqual(bySource(farmWith(["Radiant Ray"]), "Radiant Ray").map((e) => [e.type, e.cat, e.value]), [["yield_flat", "iron", 0.1]]);
});
