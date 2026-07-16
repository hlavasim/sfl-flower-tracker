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
