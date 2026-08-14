import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildPowerSection } from "../../core/sections/power.mjs";

/*
 * A boost you own but are not getting: a wearable in the wardrobe unequipped, a collectible in
 * inventory unplaced. The user found a +0.1 crimstone wearable that had never been worn, and the
 * income engine — which reads `has` (owned), not equipped/placed — was counting it as active.
 * This pins the owned≠active distinction so the detector cannot quietly regress to `has`.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wrap = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/farm-155498.json"), "utf8"));
const p2p = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/p2p-prices.json"), "utf8"));

function farmWith(over) {
  // Clone the fixture farm so buildPowerSection has a real, complete shape, then override just
  // the ownership/activation fields this test cares about.
  const f = JSON.parse(JSON.stringify(wrap.farm || wrap));
  f.wardrobe = over.wardrobe || {};
  f.inventory = Object.assign({}, f.inventory, over.inventory || {});
  f.bumpkin = f.bumpkin || {};
  f.bumpkin.equipped = over.equipped || {};
  // Placed collectibles live under home.collectibles / collectibles; clear then set.
  f.collectibles = over.placed || {};
  if (f.home) f.home.collectibles = {};
  return f;
}

// A boost-bearing wearable and collectible the detector should reason about.
const nftData = {
  wearables: [{ name: "Crimstone Armor", have_boost: 1, boost_text: "+0.1 Crimstones", floor: 1, supply: 100 }],
  collectibles: [{ name: "Iron Idol", have_boost: 1, boost_text: "+1 Iron", floor: 1, supply: 100 }],
};

test("an unequipped wearable and an unplaced collectible are dormant", () => {
  const out = buildPowerSection(farmWith({
    wardrobe: { "Crimstone Armor": 1 },      // owned, not equipped
    inventory: { "Iron Idol": "1" },          // owned, not placed
  }), p2p, nftData, null, {});
  const names = out.dormantBoosts.map((d) => d.name);
  assert.ok(names.includes("Crimstone Armor"), "unequipped wearable is dormant");
  assert.ok(names.includes("Iron Idol"), "unplaced collectible is dormant");
});

test("an equipped wearable and a placed collectible are NOT dormant", () => {
  const out = buildPowerSection(farmWith({
    wardrobe: { "Crimstone Armor": 1 },
    equipped: { coat: "Crimstone Armor" },    // now worn
    placed: { "Iron Idol": [{ x: 0, y: 0 }] }, // now placed
  }), p2p, nftData, null, {});
  const names = out.dormantBoosts.map((d) => d.name);
  assert.ok(!names.includes("Crimstone Armor"), "equipped wearable is active, not dormant");
  assert.ok(!names.includes("Iron Idol"), "placed collectible is active, not dormant");
});

test("a wearable owned AND worn on a farm hand is not dormant", () => {
  const f = farmWith({ wardrobe: { "Crimstone Armor": 1 } });
  f.farmHands = { bumpkins: { "1": { equipped: { coat: "Crimstone Armor" } } } };
  const out = buildPowerSection(f, p2p, nftData, null, {});
  assert.ok(!out.dormantBoosts.some((d) => d.name === "Crimstone Armor"),
    "a wearable worn on a farm hand counts as active");
});

test("owning nothing means nothing dormant", () => {
  // The fixture farm genuinely holds an unplaced Iron Idol, so clear both items to test the
  // not-owned case cleanly. (That the fixture flags it at all is the detector working.)
  const f = farmWith({});
  delete f.inventory["Iron Idol"];
  delete f.wardrobe["Crimstone Armor"];
  const out = buildPowerSection(f, p2p, nftData, null, {});
  assert.equal(out.dormantBoosts.filter((d) => ["Crimstone Armor", "Iron Idol"].includes(d.name)).length, 0);
});
