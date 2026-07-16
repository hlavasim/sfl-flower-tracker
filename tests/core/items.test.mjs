import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { findCollectible, isWearableEquipped, hasItem, hasAny } from "../../core/derive/items.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm;

test("hasItem returns a boolean", () => {
  assert.equal(typeof hasItem(farm, "Observatory"), "boolean");
});
test("hasItem is true for a genuinely-owned item (Observatory)", () => {
  // Observatory appears in the farm's detected cooking XP boosts, so it must be owned.
  assert.equal(hasItem(farm, "Observatory"), true);
});
test("hasItem is false for a non-existent item", () => {
  assert.equal(hasItem(farm, "Definitely Not A Real Item 9999"), false);
});
test("hasAny matches hasItem across name variants", () => {
  assert.equal(
    hasAny(farm, "Master Chefs Cleaver", "Master Chef's Cleaver"),
    hasItem(farm, "Master Chefs Cleaver") || hasItem(farm, "Master Chef's Cleaver")
  );
});
