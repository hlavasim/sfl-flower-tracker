// Generates azure-functions/shared/expansion-data.generated.json from core/.
//
// The Azure function app is deployed on its own (func publish zips only
// azure-functions/), so it cannot import core/ at runtime. Rather than hand-copying
// cost tables — which would silently drift from core/ — this script derives them by
// CALLING the verified core implementations, including the fiddly swamp cost curve
// with its exact-rational 1.3^(a-1) multiplier and game rounding rules.
//
// Regenerate whenever core/data/expansions.mjs, core/engine/ascension.mjs or
// core/data/cooking.mjs change:
//   node azure-functions/scripts/gen-expansion-data.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const url = (p) => "file:///" + path.resolve(root, p).replace(/\\/g, "/");

const { PRE_EXPANSION_REQUIREMENTS, ISLAND_PROGRESSION } = await import(url("core/data/expansions.mjs"));
const asc = await import(url("core/engine/ascension.mjs"));
const { COOKING_RECIPES_DATA } = await import(url("core/data/cooking.mjs"));

// How many ascension bands to precompute. Costs grow 1.3^(a-1), so nobody is
// reaching anywhere near the top of this; it only has to outrun the data.
const MAX_ASCENSION = 20;

const preIslands = {};
for (const [island, exps] of Object.entries(PRE_EXPANSION_REQUIREMENTS)) {
  preIslands[island] = {};
  for (const [e, r] of Object.entries(exps)) {
    preIslands[island][e] = { resources: r.resources || {}, coins: r.coins || 0, level: r.level || 1 };
  }
}

const ascension = {};
for (let a = 1; a <= MAX_ASCENSION; a++) {
  const band = {};
  for (let e = 1; e <= asc.SWAMP_EXPANSIONS_PER_ASCENSION; e++) {
    const req = asc.getAscensionExpansionRequirements(a, asc.SWAMP_BASE_EXPANSION + e);
    if (!req) continue;
    band[asc.SWAMP_BASE_EXPANSION + e] = {
      resources: req.resources,
      coins: req.coins,
      levelRequired: req.levelRequired,
    };
  }
  ascension[a] = { expansions: band, upgradeCost: asc.getAscensionUpgradeCost(a) };
}

const cookingXp = {};
for (const [food, d] of Object.entries(COOKING_RECIPES_DATA)) {
  if (d && typeof d.xp === "number") cookingXp[food] = d.xp;
}

const out = {
  _generated: "by azure-functions/scripts/gen-expansion-data.mjs — do not hand-edit",
  _source: "core/data/expansions.mjs, core/engine/ascension.mjs, core/data/cooking.mjs",
  islandProgression: ISLAND_PROGRESSION.map((i) => ({
    island: i.island, max: i.max, upgradeItems: i.upgradeItems || {},
    next: i.next, nextStart: i.nextStart,
  })),
  preIslands,
  swamp: {
    baseExpansion: asc.SWAMP_BASE_EXPANSION,
    expansionsPerAscension: asc.SWAMP_EXPANSIONS_PER_ASCENSION,
    maxAscension: MAX_ASCENSION,
  },
  ascension,
  cookingXp,
};

const dest = path.resolve(root, "azure-functions/shared/expansion-data.generated.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 1));
console.log(`wrote ${dest}`);
console.log(`  islands: ${out.islandProgression.map((i) => i.island + ":" + i.max).join(" ")}`);
console.log(`  pre-ascension rows: ${Object.values(preIslands).reduce((a, o) => a + Object.keys(o).length, 0)}`);
console.log(`  ascension bands: ${Object.keys(ascension).length} x ${asc.SWAMP_EXPANSIONS_PER_ASCENSION}`);
console.log(`  cooking recipes: ${Object.keys(cookingXp).length}`);
console.log(`  A1 expansion 37 cost: ${JSON.stringify(ascension[1].expansions[37])}`);
