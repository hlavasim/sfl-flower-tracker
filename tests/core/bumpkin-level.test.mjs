// Pins the Bumpkin level cap, which is feature-flag dependent and was wrong once:
// the code capped every unascended farm at 150, so the WORLD level chart topped out
// there. In the game getMaxBumpkinLevel is 150 only for SWAMP_ASCENSION holders
// (betaFeatureFlag = Beta Pass in inventory), otherwise 200.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { totalBumpkinLevel } = require("../../azure-functions/shared/world-extract.js");

test("anchor — farm 155498 (no Beta Pass, 179,301,665 xp) is level 186", () => {
  // The owner confirmed the game shows 186; the table needs 178,408,176 for it.
  assert.equal(totalBumpkinLevel(179301665, 0), 186);
});

test("unascended level is not capped at 150 and not capped at 200 either", () => {
  assert.equal(totalBumpkinLevel(94333905, 0), 150, "level-150 threshold reads 150");
  assert.ok(totalBumpkinLevel(200000000, 0) > 150, "past 150 must keep climbing");
  assert.equal(totalBumpkinLevel(244206000, 0), 200, "level-200 threshold, end of the table");
  // Past the table the x1.03 curve continues, so whales stay distinguishable instead
  // of all reading 200.
  assert.ok(totalBumpkinLevel(9e9, 0) > 200, "must not clamp at the end of the table");
  assert.equal(totalBumpkinLevel(3.8e9, 0), 300, "3.8B xp extrapolates to level 300");
});

test("extrapolation is monotonic — no gaps or regressions anywhere", () => {
  let prev = 0;
  for (let xp = 0; xp < 6e9; xp += 5e6) {
    const l = totalBumpkinLevel(xp, 0);
    assert.ok(l >= prev, `level went backwards at xp ${xp}: ${prev} -> ${l}`);
    prev = l;
  }
  assert.ok(prev > 300, `should be well past 300 at 6B xp, got ${prev}`);
});

test("level boundaries are exact", () => {
  assert.equal(totalBumpkinLevel(178408175, 0), 185);
  assert.equal(totalBumpkinLevel(178408176, 0), 186);
  assert.equal(totalBumpkinLevel(182259084, 0), 186);
  assert.equal(totalBumpkinLevel(182259085, 0), 187);
});

test("ascension bands stack past 200 as skill points", () => {
  assert.equal(totalBumpkinLevel(94333905, 1), 151, "A1 L1");
  assert.equal(totalBumpkinLevel(94333905 + 50000000, 1), 200, "A1 L50 = full band");
  assert.equal(totalBumpkinLevel(94333905 + 50000000 + 28862974, 2), 225, "A2 L25");
  assert.ok(totalBumpkinLevel(9e9, 5) > 200, "high ascensions exceed 200");
});

test("low xp still reads level 1", () => {
  assert.equal(totalBumpkinLevel(0, 0), 1);
  assert.equal(totalBumpkinLevel(1, 0), 1);
  assert.equal(totalBumpkinLevel(2, 0), 2);
});
