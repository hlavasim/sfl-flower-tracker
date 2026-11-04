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
// FISH_BASE_XP entry at runtime; the page's live table is 125 recipes (87 static + 38 generated).
//
// 38, not 35: consumables.ts builds AGED_FISH from the WHOLE FISH record, which has 38 fish.
// Whale Shark / Saw Shark / White Shark were missing from FISH_BASE_XP, so the shed's three
// biggest recipes did not exist here and their Aged stacks banked no XP at all.
test("recipe table has all 87 static recipes plus 38 generated Aged Fish recipes (125 total)", () => {
  const keys = Object.keys(COOKING_RECIPES_DATA);
  assert.equal(keys.length, 125, `expected 125 recipes, got ${keys.length}`);
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
// timeSec=((3750-750)/1000)*3600=10800. The PRODUCT is named in the game's spelling —
// consumables.ts:1261 "Hammerhead shark", AGED_FISH = `Aged ${name}` — so it matches the inventory
// key; the ingredient keeps the fishing tables' spelling, which prices it.
test("Aged Hammerhead shark matches the page's generator formula (independently computed)", () => {
  const r = COOKING_RECIPES_DATA["Aged Hammerhead shark"];
  assert.ok(r, "Aged Hammerhead shark should exist in COOKING_RECIPES_DATA");
  assert.equal(COOKING_RECIPES_DATA["Aged Hammerhead Shark"], undefined, "not under the tracker's spelling");
  assert.equal(r.xp, 3750);
  assert.equal(r.cookSec, 10800);
  assert.deepEqual(COOKING_INGREDIENTS["Aged Hammerhead shark"], { "Hammerhead Shark": 1, Salt: 75 });
  assert.ok(COOKING_RECIPES_DATA["Aged Football fish"], "Football fish follows the game spelling too");
});

// Chapter 16's Truffle ladder (consumables.ts at a2b369373): 1,000 / 2,000 / 4,000 XP per Truffle.
test("the three Truffle recipes are cookable, as the game lists them", () => {
  assert.deepEqual(COOKING_RECIPES_DATA["Ember-Roasted Truffle Potatoes"], { building: "Fire Pit", xp: 1000, cookSec: 3600, usesHoney: false });
  assert.deepEqual(COOKING_INGREDIENTS["Ember-Roasted Truffle Potatoes"], { Truffle: 1, Potato: 30 });
  assert.deepEqual(COOKING_RECIPES_DATA["Truffle Cake"], { building: "Bakery", xp: 30000, cookSec: 93600, usesHoney: true });
  assert.deepEqual(COOKING_INGREDIENTS["Truffle Cake"], { Truffle: 15, Wheat: 30, Egg: 30, Honey: 5 });
  assert.deepEqual(COOKING_RECIPES_DATA["Creamy Truffle Risotto"], { building: "Kitchen", xp: 32000, cookSec: 172800, usesHoney: false });
  assert.deepEqual(COOKING_INGREDIENTS["Creamy Truffle Risotto"], { Truffle: 8, Rice: 3, "Wild Mushroom": 5 });
});
