import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { detectCookingBoosts, computeFoodXP, computeCookTime } from "../../core/engine/cooking.mjs";
import { COOKING_RECIPES_DATA } from "../../core/data/cooking.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm;

test("detectCookingBoosts returns the three sections", () => {
  const b = detectCookingBoosts(farm, {});
  assert.ok(Array.isArray(b.xpBoosts) && Array.isArray(b.timeBoosts) && b.petStreakInfo);
});

test("Pizza Margherita matches the v4.74-verified Bumpkin numbers (Simulate x1.5)", () => {
  const boosts = detectCookingBoosts(farm, { petSimulate: true });
  const r = COOKING_RECIPES_DATA["Pizza Margherita"];
  const xp = computeFoodXP("Pizza Margherita", r, "Fire Pit", boosts);
  const timeMin = computeCookTime(r.cookSec, "Fire Pit", boosts) / 60;
  assert.ok(Math.abs(xp - 50025.94) < 0.1, `xp was ${xp}, expected ~50025.94`);
  assert.ok(Math.abs(timeMin - 309.8) < 0.3, `cook minutes was ${timeMin}, expected ~309.8`);
});

test("petSimulate false does NOT inject the x1.5 pet boost", () => {
  const boosts = detectCookingBoosts(farm, { petSimulate: false });
  assert.ok(!boosts.xpBoosts.some((b) => b.manual === true));
});

// ── Luminous Anglerfish Topper (+50% Fish XP) — Marine Marvel Master milestone reward ──
// Game (expansion/lib/boosts.ts): ×1.5 XP on FISH_CONSUMABLES, which includes Aged and
// Prime Aged fish, but ONLY while the topper is worn (isWearableActive = bumpkin or any
// farm hand). Wardrobe ownership alone must not count.
const clone = (o) => JSON.parse(JSON.stringify(o));

test("topper equipped on the bumpkin gives Aging Shed ×1.5, other buildings untouched", () => {
  const f = clone(farm);
  f.bumpkin.equipped.hat = "Luminous Anglerfish Topper";
  const plain = detectCookingBoosts(farm, {});
  const worn = detectCookingBoosts(f, {});
  const aged = COOKING_RECIPES_DATA["Aged Tuna"];
  const xpPlain = computeFoodXP("Aged Tuna", aged, "Aging Shed", plain);
  const xpWorn = computeFoodXP("Aged Tuna", aged, "Aging Shed", worn);
  assert.ok(Math.abs(xpWorn / xpPlain - 1.5) < 1e-9, `Aged Tuna ${xpPlain} → ${xpWorn}, expected ×1.5`);
  const pizza = COOKING_RECIPES_DATA["Pizza Margherita"];
  assert.equal(computeFoodXP("Pizza Margherita", pizza, "Fire Pit", worn),
               computeFoodXP("Pizza Margherita", pizza, "Fire Pit", plain),
               "a non-fish dish must not get the topper");
});

test("topper equipped on a farm hand counts too (isWearableActive covers hands)", () => {
  const f = clone(farm);
  f.farmHands = { bumpkins: { "1": { equipped: { hat: "Luminous Anglerfish Topper" } } } };
  const b = detectCookingBoosts(f, {});
  assert.ok(b.xpBoosts.some((x) => x.name.includes("Anglerfish") && x.multiplier === 1.5),
    "farm-hand-worn topper detected");
});

test("topper merely owned in the wardrobe does NOT count", () => {
  const f = clone(farm);
  f.wardrobe = { ...(f.wardrobe || {}), "Luminous Anglerfish Topper": 1 };
  const b = detectCookingBoosts(f, {});
  assert.ok(!b.xpBoosts.some((x) => x.name.includes("Anglerfish")),
    "unworn topper must not boost");
});
