import { test } from "node:test";
import assert from "node:assert";
import {
  COOKING_RECIPES_DATA,
  COOKING_INGREDIENTS,
  COOKING_BUILDING_NAMES,
  BUMPKIN_DEFAULT_RECIPES,
  FISH_BASE_XP,
} from "../../core/data/cooking.mjs";

test("recipe table is populated", () => {
  assert.ok(Object.keys(COOKING_RECIPES_DATA).length > 20);
});
test("Pizza Margherita has the expected shape", () => {
  const r = COOKING_RECIPES_DATA["Pizza Margherita"];
  assert.ok(r && typeof r.xp === "number" && typeof r.cookSec === "number" && r.building === "Fire Pit");
});
test("building list and defaults are consistent", () => {
  assert.ok(COOKING_BUILDING_NAMES.includes("Fire Pit"));
  assert.equal(BUMPKIN_DEFAULT_RECIPES["Fire Pit"], "Pizza Margherita");
});

// ── Aged Fish generator (Task 5b) — flowers.html generates one "Aged <fish>" recipe per
// FISH_BASE_XP entry at runtime; the page's live table is 122 recipes (84 static + 38 generated).
//
// 38, not 35: consumables.ts builds AGED_FISH from the WHOLE FISH record, which has 38 fish.
// Whale Shark / Saw Shark / White Shark were missing from FISH_BASE_XP, so the shed's three
// biggest recipes did not exist here and their Aged stacks banked no XP at all.
test("recipe table has all 84 static recipes plus 38 generated Aged Fish recipes (122 total)", () => {
  const keys = Object.keys(COOKING_RECIPES_DATA);
  assert.equal(keys.length, 122, `expected 122 recipes, got ${keys.length}`);
  const aged = keys.filter((k) => k.startsWith("Aged "));
  assert.equal(aged.length, 38, `expected 38 Aged recipes, got ${aged.length}`);
  assert.equal(Object.keys(FISH_BASE_XP).length, 38);
  // The sharks age at 5x (base > 330) and are the biggest XP items in the game.
  assert.deepEqual(COOKING_RECIPES_DATA["Aged White Shark"],
    { building: "Aging Shed", xp: 10000, cookSec: 28800, usesHoney: false });
  assert.deepEqual(COOKING_INGREDIENTS["Aged White Shark"], { "White Shark": 1, Salt: 200 });
});

// Spot-check one generated recipe against values independently computed from the
// page's formulas (flowers.html:4876-4886), not from core's own output:
// Aged Tuna: baseXP=200 (<=200) -> maxXP=200*3=600; saltCost=round(600/50)=12;
// timeSec=((600-200)/300)*3600=4800.
test("Aged Tuna matches the page's generator formula (independently computed)", () => {
  const r = COOKING_RECIPES_DATA["Aged Tuna"];
  assert.ok(r, "Aged Tuna should exist in COOKING_RECIPES_DATA");
  assert.equal(r.building, "Aging Shed");
  assert.equal(r.xp, 600);
  assert.equal(r.cookSec, 4800);
  assert.equal(r.usesHoney, false);
  assert.deepEqual(COOKING_INGREDIENTS["Aged Tuna"], { Tuna: 1, Salt: 12 });
});

// Second spot-check with a fish that crosses the >330 tier boundary:
// Hammerhead Shark: baseXP=750 (>330) -> maxXP=750*5=3750; saltCost=round(3750/50)=75;
// timeSec=((3750-750)/1000)*3600=10800.
test("Aged Hammerhead Shark matches the page's generator formula (independently computed)", () => {
  const r = COOKING_RECIPES_DATA["Aged Hammerhead Shark"];
  assert.ok(r, "Aged Hammerhead Shark should exist in COOKING_RECIPES_DATA");
  assert.equal(r.xp, 3750);
  assert.equal(r.cookSec, 10800);
  assert.deepEqual(COOKING_INGREDIENTS["Aged Hammerhead Shark"], { "Hammerhead Shark": 1, Salt: 75 });
});
