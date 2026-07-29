import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SKILL_POINTS_PER_TIER, SKILL_TREE_DATA } from "../../core/engine/power-helpers.mjs";

/*
 * Tier gate thresholds, verbatim from the game's SKILL_POINTS_PER_TIER
 * (src/features/game/events/landExpansion/choseSkill.ts). The roadmap's
 * "Best next tiers" advice is only buyable if these are right — get them wrong and it
 * recommends a tier the player cannot actually open.
 */
const GAME = {
  "Crops": { 2: 3, 3: 7 }, "Trees": { 2: 2, 3: 5 }, "Fishing": { 2: 2, 3: 5 },
  "Mining": { 2: 3, 3: 7 }, "Cooking": { 2: 2, 3: 5 }, "Compost": { 2: 3, 3: 7 },
  "Fruit Patch": { 2: 2, 3: 5 }, "Animals": { 2: 4, 3: 8 }, "Bees & Flowers": { 2: 2, 3: 5 },
  "Greenhouse": { 2: 2, 3: 5 }, "Machinery": { 2: 2, 3: 5 }, "Aging": { 2: 3, 3: 7 },
};

test("tier thresholds match the game, per tree", () => {
  assert.deepEqual(SKILL_POINTS_PER_TIER, GAME);
  // Not a uniform rule — three distinct shapes. A single global constant would be wrong.
  const shapes = new Set(Object.values(GAME).map((t) => `${t[2]}/${t[3]}`));
  assert.deepEqual([...shapes].sort(), ["2/5", "3/7", "4/8"]);
  assert.equal(GAME["Animals"][2], 4, "Animals is the strict one");
});

test("every tree that has skills has a threshold, and vice versa", () => {
  const treesWithSkills = new Set(Object.values(SKILL_TREE_DATA).map((s) => s.tree));
  const treesWithGates = new Set(Object.keys(SKILL_POINTS_PER_TIER));
  assert.deepEqual([...treesWithSkills].sort(), [...treesWithGates].sort());
});

test("the page's copy of the table is identical to core's", () => {
  // The panel runs client-side, so flowers.html carries its own copy; the twin-drift sweep
  // only compares FUNCTIONS, which would miss this table entirely.
  const page = readFileSync(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), "flowers.html"), "utf8");
  const grab = (src) => {
    const m = src.match(/SKILL_POINTS_PER_TIER\s*=\s*\{([\s\S]*?)\n\s*\};/);
    assert.ok(m, "table not found");
    const out = {};
    for (const line of m[1].split("\n")) {
      const e = line.match(/"([^"]+)":\s*\{\s*2:\s*(\d+),\s*3:\s*(\d+)\s*\}/);
      if (e) out[e[1]] = { 2: Number(e[2]), 3: Number(e[3]) };
    }
    return out;
  };
  assert.deepEqual(grab(page), GAME, "flowers.html copy");
});

test("a tier-3 skill's points never count towards a gate", () => {
  /*
   * The game's getUnlockedTierForTree sums only `requirements.tier !== 3`. The advice panel
   * mirrors that when it tracks per-tree spending; if it did not, it would think buying one
   * expensive tier-3 skill helps unlock the next, and hand out an unbuyable order.
   */
  const page = readFileSync(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), "flowers.html"), "utf8");
  const fn = page.slice(page.indexOf("function roadmapNextTiersHtml("));
  const body = fn.slice(0, fn.indexOf("\n    // recomputing each step"));
  assert.ok(body.length > 500, "sliced the panel body");
  // Both places that add to the per-tree total must exclude tier 3.
  const adds = body.match(/inTree\[[^\]]+\]\s*=\s*\(inTree\[[^\]]+\]\s*\|\|\s*0\)\s*\+/g) || [];
  assert.equal(adds.length, 2, "two places accumulate per-tree points");
  for (const m of body.matchAll(/tierOf\((\w+)\) !== 3/g)) assert.ok(m, "guard present");
  assert.equal((body.match(/tierOf\(\w+\) !== 3/g) || []).length, 3,
    "each accumulation, and the filler pool, must exclude tier 3");
});
