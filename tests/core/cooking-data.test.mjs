import { test } from "node:test";
import assert from "node:assert";
import { COOKING_RECIPES_DATA, COOKING_BUILDING_NAMES, BUMPKIN_DEFAULT_RECIPES } from "../../core/data/cooking.mjs";

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
