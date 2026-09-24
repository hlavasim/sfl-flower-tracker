import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import * as rm from "../../core/engine/roadmap.mjs";
import { POWER_CATEGORIES } from "../../core/engine/power-helpers.mjs";
import { parseBoostEffects } from "../../core/engine/power-boosts.mjs";

/*
 * Capacity boosters and two effects the marketplace text hid.
 *  - Chicken Coop is +5 hen house stalls per level (buyAnimal.ts getBoostedAnimalCapacity) and +1
 *    Egg. The buy path valued only the egg (+0.54/day on the live farm) and not the 15 extra birds.
 *  - Turbo Sprout halves greenhouse growth (plantGreenhouse.ts); Infernal Bullwhip halves cow and
 *    sheep feed (lib/animals.ts). Both parsed as qualitative and were worth 0.
 */
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));

function setup() {
  const pd = buildPowerSection(farm, p2p, nfts, null, {});
  const clones = pd.boostItems.map((b) => ({ ...b }));
  const byName = {}; for (const c of clones) byName[c.name] = c;
  const catBoostsW = {};
  for (const cat of Object.keys(POWER_CATEGORIES)) catBoostsW[cat] = clones.filter((c) => c.categories.includes(cat));
  return { pd, byName, catBoostsW, settings: rm.getRoadmapSettings({}) };
}
const coop = { name: "Chicken Coop", type: "Collectible", has: false, isDisabled: false, categories: ["chickens", "other"],
  effects: [{ type: "yield_flat", value: 1, cat: "chickens", product: "Egg", raw: "+1 Egg" },
    { type: "qualitative", cat: "other", raw: "+5 Base Chickens" }] };

test("Chicken Coop is valued with the stalls it adds, above its egg line alone", () => {
  const { pd, catBoostsW, settings } = setup();
  assert.ok(pd.capacity.animalDetails.chickens.length > 0, "the fixture keeps chickens");
  // Fed for free (a Gold Egg, as on the live farm): each extra bird earns, so the stalls are worth filling.
  pd.capacity.goldenAnimals = { ...(pd.capacity.goldenAnimals || {}), Chicken: true };
  const eggCopy = { ...coop, name: "Egg-only copy" };
  catBoostsW.chickens.push(coop, eggCopy);
  const withStalls = rm.roadmapItemValue(coop, catBoostsW, settings);
  const eggOnly = rm.roadmapItemValue(eggCopy, catBoostsW, settings);
  assert.ok(eggOnly > 0, "the +1 Egg alone pays something");
  assert.ok(withStalls > eggOnly * 1.5, `stalls count: ${withStalls} vs egg-only ${eggOnly}`);
  // and the herd the probe grew is put back
  assert.equal(pd.capacity.animalDetails.chickens.length, Object.keys(farm.henHouse.animals).length);
});

test("Turbo Sprout and Infernal Bullwhip carry real effects, not a qualitative note", () => {
  const eff = (n) => parseBoostEffects("marketplace text that says nothing useful", n).map((e) => [e.type, e.cat, e.value]);
  assert.deepEqual(eff("Turbo Sprout"), [["speed_mult", "greenhouse", 0.5]]);
  assert.deepEqual(eff("Infernal Bullwhip"), [["feed_reduction", "cows", -0.5], ["feed_reduction", "sheep", -0.5]]);
});

test("stalls that would lose money are not filled: the item keeps at least its effect value", () => {
  const { pd, catBoostsW, settings } = setup();
  pd.capacity.goldenAnimals = { ...(pd.capacity.goldenAnimals || {}), Chicken: false };   // paid feed
  const eggCopy = { ...coop, name: "Egg-only copy" };
  catBoostsW.chickens.push(coop, eggCopy);
  assert.ok(rm.roadmapItemValue(coop, catBoostsW, settings) >= rm.roadmapItemValue(eggCopy, catBoostsW, settings) - 1e-9);
});
