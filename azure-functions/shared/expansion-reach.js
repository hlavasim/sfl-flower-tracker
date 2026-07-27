// How far a farm could expand RIGHT NOW with what it already has banked.
//
// This is deliberately not "where the farm currently sits" — it walks forward from
// the current position buying one expansion at a time, deducting cumulatively, until
// something runs out. Islands upgrade and ascensions roll over along the way.
//
// The result is encoded as an integer SLOT so it sorts numerically. Encoding it as a
// label would sort textually and put "A1-10" before "A1-2".
//
//   slot = phase * 1000 + expansions
//   phase 0..3 = basic / spring / desert / volcano   (pre-ascension islands)
//   phase 3+a  = ascension a (a >= 1)                (swamp bands)
//
// Cost data comes from expansion-data.generated.json — derived from core/ by
// azure-functions/scripts/gen-expansion-data.mjs, never hand-edited.

const DATA = require("./expansion-data.generated.json");
const { totalBumpkinLevel, withinAscensionLevel } = require("./world-extract");

const PHASES = ["basic", "spring", "desert", "volcano"];
const PROG = new Map(DATA.islandProgression.map((i) => [i.island, i]));

/**
 * Resources that gate the reach: the ones a farm actually has to mine for itself.
 * Everything else an expansion costs — Wood, Stone, Iron, Gold, Crimstone, Gem — is
 * treated as freely obtainable and ignored, because a farm short on those can just buy
 * them and the metric would then measure spending power rather than progress.
 *
 * Coins are ignored for the same reason (GATE_COINS below).
 *
 * These rules are not guesses; they are pinned to a real farm. Farm 155498 sits at
 * Volcano-30 and its owner expected a reach of A1-40. Measured 2026-07-27 against its
 * live state (Oil 1935, Obsidian 119, Crimstone 179, 230,633 coins, 179.3M xp):
 *
 *   gate every resource + coins        -> A1-37  (stops on Crimstone)
 *   gate Oil/Gem/Sunstone + coins      -> A1-38  (stops on coins)
 *   gate Oil + Obsidian, coins ignored -> A1-40  (stops on Oil, 359 needed / 193 left)
 *
 * Only the last matches, so that is the rule. Changing either constant changes what
 * the chart means — tests/core/expansion-reach.test.mjs fails loudly if it drifts.
 */
const GATING_RESOURCES = new Set(["Oil", "Obsidian"]);

/** Coins are earned freely enough that capping on them would measure income, not progress. */
const GATE_COINS = false;

// Hard stop so a data or logic error can never spin forever on one farm.
const MAX_STEPS = 400;

// Ascending is gated on level, not just on paying the upgrade cost: the game's
// isReadyToAscend is `experience >= LEVEL_EXPERIENCE[cap]` — the pre-ascension cap of
// 150 to enter ascension 1, and a completed 50-level band to move from one ascension to
// the next (src/features/game/lib/level.ts). Without these a 0-XP farm would happily
// ascend on materials alone.
const PRE_ASCENSION_MAX_LEVEL = 150;
const LEVELS_PER_ASCENSION = 50;

const qty = (inv, name) => {
  const v = inv[name];
  if (v === undefined || v === null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? Math.floor(n) : 0;
};

/** slot -> { phase, expansions, ascension, island, label } */
function decodeSlot(slot) {
  if (slot == null) return null;
  const phase = Math.floor(slot / 1000);
  const expansions = slot % 1000;
  if (phase < PHASES.length) {
    const island = PHASES[phase];
    return { phase, expansions, ascension: 0, island, label: `${island[0].toUpperCase()}${island.slice(1)}-${expansions}` };
  }
  const ascension = phase - (PHASES.length - 1);
  return { phase, expansions, ascension, island: "swamp", label: `A${ascension}-${expansions}` };
}

function encodeSlot(island, ascension, expansions) {
  const phase = ascension >= 1 ? PHASES.length - 1 + ascension : Math.max(0, PHASES.indexOf(island));
  return phase * 1000 + expansions;
}

/**
 * Bumpkin XP including food already cooked and sitting in the inventory but not yet
 * eaten, since eating it is a formality.
 *
 * `bankedFoodXp` is injected (see shared/cooking-xp.js) so the real, boost-aware
 * value from core/engine/cooking.mjs is used — the farm's cooking skills, items,
 * sculptures and a simulated x1.5 pet streak all change what the bank is worth.
 * If no function is passed, this falls back to BASE recipe XP, which understates
 * every boosted farm; callers that care pass the real one.
 */
function effectiveXp(farm, bankedFoodXp) {
  const base = Number(farm.bumpkin?.experience) || 0;
  if (typeof bankedFoodXp === "function") return base + bankedFoodXp(farm);
  const inv = farm.inventory || {};
  let xp = base;
  for (const [food, foodXp] of Object.entries(DATA.cookingXp)) {
    const n = qty(inv, food);
    if (n > 0) xp += n * foodXp;
  }
  return xp;
}

/** Can `stock` cover `cost`, counting only gating resources (and coins)? */
function canAfford(stock, coins, cost) {
  if (GATE_COINS && (cost.coins || 0) > coins) return false;
  for (const [res, need] of Object.entries(cost.resources || {})) {
    if (!GATING_RESOURCES.has(res)) continue;
    if ((stock[res] || 0) < need) return false;
  }
  return true;
}

function spend(stock, cost) {
  for (const [res, need] of Object.entries(cost.resources || {})) {
    if (!GATING_RESOURCES.has(res)) continue;
    stock[res] = (stock[res] || 0) - need;
  }
  return cost.coins || 0;
}

/**
 * @param {object} farm  the farm game_data
 * @param {(farm:any)=>number} [bankedFoodXp]  boost-aware banked-food XP; omit only
 *        where an understated, unboosted floor is acceptable
 * @returns {{slot:number, startSlot:number, steps:number, blockedBy:string, xp:number}}
 */
function computeReach(farm, bankedFoodXp) {
  const inv = farm.inventory || {};
  const island0 = farm.island?.type || "basic";
  let ascension = Math.max(0, Math.floor(farm.island?.ascensionLevel || 0));
  let island = ascension >= 1 ? "swamp" : (PHASES.includes(island0) ? island0 : "basic");
  let expansions = qty(inv, "Basic Land");

  const xp = effectiveXp(farm, bankedFoodXp);
  // Pre-ascension gates read the plain Bumpkin level; swamp gates read the level
  // WITHIN the current band, which drops when a farm ascends (the band baseline
  // moves up while xp stays put), so it is recomputed per ascension below.
  const flatLevel = totalBumpkinLevel(xp, 0);

  const stock = {};
  for (const res of GATING_RESOURCES) stock[res] = qty(inv, res);
  let coins = Number(farm.coins) || 0;

  const startSlot = encodeSlot(island, ascension, expansions);
  let steps = 0;
  let blockedBy = "level";

  while (steps < MAX_STEPS) {
    if (ascension >= 1) {
      const band = DATA.ascension[String(ascension)];
      if (!band) { blockedBy = "beyond precomputed ascensions"; break; }
      const next = expansions + 1;
      const req = band.expansions[String(next)];
      if (req) {
        if (withinAscensionLevel(xp, ascension) < req.levelRequired) { blockedBy = "level"; break; }
        if (!canAfford(stock, coins, req)) { blockedBy = "resources"; break; }
        coins -= spend(stock, req);
        expansions = next;
        steps++;
        continue;
      }
      // Band exhausted — ascend again. Requires the band to be fully earned (level 50
      // within it), and the within-band level then resets against the higher baseline.
      if (withinAscensionLevel(xp, ascension) < LEVELS_PER_ASCENSION) { blockedBy = "level"; break; }
      const nextA = ascension + 1;
      const upgrade = DATA.ascension[String(nextA)];
      if (!upgrade) { blockedBy = "beyond precomputed ascensions"; break; }
      const cost = { resources: upgrade.upgradeCost?.items || upgrade.upgradeCost?.resources || {}, coins: upgrade.upgradeCost?.coins || 0 };
      if (!canAfford(stock, coins, cost)) { blockedBy = "ascension cost"; break; }
      coins -= spend(stock, cost);
      ascension = nextA;
      expansions = DATA.swamp.baseExpansion;
      steps++;
      continue;
    }

    // Pre-ascension island chain.
    const prog = PROG.get(island);
    if (!prog) { blockedBy = "unknown island"; break; }
    if (expansions < prog.max) {
      const next = expansions + 1;
      const req = (DATA.preIslands[island] || {})[String(next)];
      if (!req) { blockedBy = "no cost data"; break; }
      if (flatLevel < (req.level || 1)) { blockedBy = "level"; break; }
      if (!canAfford(stock, coins, req)) { blockedBy = "resources"; break; }
      coins -= spend(stock, req);
      expansions = next;
      steps++;
      continue;
    }
    // At the island cap: upgrade to the next island, or ascend past volcano.
    if (prog.next) {
      const cost = { resources: prog.upgradeItems || {}, coins: 0 };
      if (!canAfford(stock, coins, cost)) { blockedBy = "island upgrade cost"; break; }
      coins -= spend(stock, cost);
      island = prog.next;
      expansions = prog.nextStart;
      steps++;
      continue;
    }
    // Past volcano the only way forward is ascending, which needs the level cap.
    if (flatLevel < PRE_ASCENSION_MAX_LEVEL) { blockedBy = "level"; break; }
    const first = DATA.ascension["1"];
    if (!first) { blockedBy = "no ascension data"; break; }
    const cost = { resources: first.upgradeCost?.items || first.upgradeCost?.resources || {}, coins: first.upgradeCost?.coins || 0 };
    if (!canAfford(stock, coins, cost)) { blockedBy = "ascension cost"; break; }
    coins -= spend(stock, cost);
    ascension = 1;
    island = "swamp";
    expansions = DATA.swamp.baseExpansion;
    steps++;
  }

  return { slot: encodeSlot(island, ascension, expansions), startSlot, steps, blockedBy, xp };
}

module.exports = { computeReach, decodeSlot, encodeSlot, effectiveXp, GATING_RESOURCES, GATE_COINS };
