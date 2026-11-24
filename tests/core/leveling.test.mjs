import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { applyWhatIf, ownedLevelingItems } from "../../core/engine/leveling-whatif.mjs";
import { LEVELING_ITEMS } from "../../core/data/leveling-items.mjs";
import { computeFishYieldPerCast } from "../../core/engine/cooking-cost.mjs";
import { detectCookingBoosts } from "../../core/engine/cooking.mjs";
import { findCollectible, isWearableEquipped } from "../../core/derive/items.mjs";

const farm = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url))).farm;

test("applyWhatIf places Walrus: fish per cast +1", () => {
  const w = applyWhatIf(farm, ["Walrus"]);
  assert.equal(computeFishYieldPerCast(w, "basic") - computeFishYieldPerCast(farm, "basic"), 1);
});

test("applyWhatIf wears a wearable (Surfer Hair) on a what-if farm hand", () => {
  assert.equal(isWearableEquipped(farm, "Surfer Hair"), false);
  assert.equal(isWearableEquipped(applyWhatIf(farm, ["Surfer Hair"]), "Surfer Hair"), true);
});

test("applyWhatIf Port bud: cooking boosts gain Port Bud ×1.1", () => {
  const b = detectCookingBoosts(applyWhatIf(farm, ["Port bud"]), {});
  const port = b.xpBoosts.find((x) => x.name === "Port Bud (Fish XP)");
  assert.ok(port && Math.abs(port.multiplier - 1.1) < 1e-9);
});

test("a skill rank row raises the skill to that rank, never lowers it", () => {
  const w = applyWhatIf({ ...farm, bumpkin: { ...farm.bumpkin, skills: { ...farm.bumpkin.skills, "Salty Seas": 1 } } }, ["Salty Seas 2"]);
  assert.equal(w.bumpkin.skills["Salty Seas"], 2);
  const w3 = applyWhatIf({ ...farm, bumpkin: { ...farm.bumpkin, skills: { ...farm.bumpkin.skills, "Salty Seas": 3 } } }, ["Salty Seas 2"]);
  assert.equal(w3.bumpkin.skills["Salty Seas"], 3);
});

test("unknown names are ignored", () => {
  assert.doesNotThrow(() => applyWhatIf(farm, ["No Such Thing", "Walrus 7"]));
});

test("an item the farm already has is not added twice", () => {
  const w = applyWhatIf(farm, ["Skill Shrimpy"]);
  assert.equal(findCollectible(w, "Skill Shrimpy").length, findCollectible(farm, "Skill Shrimpy").length);
});

test("applyWhatIf does not mutate the farm", () => {
  const before = JSON.stringify(farm);
  applyWhatIf(farm, ["Walrus", "Surfer Hair", "Port bud", "Ager 2"]);
  assert.equal(JSON.stringify(farm), before);
});

test("ownedLevelingItems: the fixture has Skill Shrimpy and Wide Rakes, not Walrus", () => {
  const owned = ownedLevelingItems(farm);
  assert.ok(owned.has("Skill Shrimpy"));
  assert.ok(owned.has("Wide Rakes"));
  assert.ok(!owned.has("Walrus"));
  assert.ok(!owned.has("Wide Rakes 3"));
});

test("catalogue names are unique", () => {
  assert.equal(new Set(LEVELING_ITEMS.map((i) => i.name)).size, LEVELING_ITEMS.length);
});
