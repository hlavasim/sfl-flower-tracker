import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import * as rm from "../../core/engine/roadmap.mjs";
import { POWER_CATEGORIES } from "../../core/engine/power-helpers.mjs";

/*
 * A tier-gated skill is dearer, not unreachable. The roadmap dropped every skill whose tier was
 * still closed, so on the live farm (22 free points, none in Fruit Patch) Short Pickings, worth
 * +0.77 FLOWER/day, never showed up. Now the points that open the tier are added to its cost.
 */
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = JSON.parse(JSON.stringify(wrap.farm || wrap));
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));

test("a skill behind a closed tier is offered with the unlock points in its cost", () => {
  const pd0 = buildPowerSection(farm, p2p, nfts, null, {});
  const fruitSkills = pd0.boostItems.filter((b) => b.type === "Skill" && b.skillTree === "Fruit Patch").map((b) => b.name);
  for (const n of fruitSkills) delete farm.bumpkin.skills[n];          // nothing in Fruit Patch: tiers 2 and 3 closed
  const pd = buildPowerSection(farm, p2p, nfts, null, {});
  const clones = pd.boostItems.map((b) => ({ ...b }));
  const byName = {}; for (const c of clones) byName[c.name] = c;
  const catBoostsW = {};
  for (const cat of Object.keys(POWER_CATEGORIES)) catBoostsW[cat] = clones.filter((c) => c.categories.includes(cat));
  const cands = rm.roadmapSkillCandidates(rm.getRoadmapSettings({}), byName, catBoostsW);
  const sp = pd.skillCostInfo.sflPerPoint;

  const worth = (n) => rm.roadmapItemValue(byName[n], catBoostsW, rm.getRoadmapSettings({})) > 0;
  const t3 = pd.boostItems.find((b) => b.skillTree === "Fruit Patch" && Number(b.skillTier) === 3 && worth(b.name));
  assert.ok(t3, "the fixture has a tier-3 Fruit Patch skill that pays");
  const c = cands.find((x) => x.name === t3.name);
  assert.ok(c, `${t3.name} is offered although tier 3 is closed`);
  // Tier 3 in Fruit Patch opens at 5 points in tiers 1-2; the skill itself costs its own points.
  assert.equal(c.skillPoints, t3.skillPoints + 5);
  assert.ok(Math.abs(c.floor - (t3.skillPoints + 5) * sp) < 1e-9, "priced with the unlock points");
});
