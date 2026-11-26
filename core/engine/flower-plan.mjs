// FLOWERS: what each flower still needs, the beds and the summary — from the farm alone, so the page
// and its widgets on a board compute the same (the page's computeAllTotalNeeded / extractBedDetails,
// without the page's global state: growth boosts come from the farm, not from SEED_DATA mutated by
// applyFlowerBoosts).
import { FLOWER_RECIPES } from "../data/recipes.mjs";
import { SEED_DATA, getCount } from "./power-helpers.mjs";
import { detectFlowerBoosts, computeFlowerMultiplier } from "./gifts-deliveries.mjs";
import { toMs } from "./power-costs.mjs";

export const SEED_ORDER = ["Sunpetal Seed", "Bloom Seed", "Edelweiss Seed", "Gladiolus Seed", "Lavender Seed", "Clover Seed", "Lily Seed"];

const isFlower = (name) => FLOWER_RECIPES[name] !== undefined;

// Flowers in the beds, with their extra yield (criticalHit), soonest first, empty beds last.
function bedsOf(farm) {
  const beds = [];
  for (const [id, bed] of Object.entries((farm.flowers && farm.flowers.flowerBeds) || {})) {
    const f = bed && bed.flower;
    if (f && f.name) {
      const seed = FLOWER_RECIPES[f.name] ? FLOWER_RECIPES[f.name].seed : null;
      const bonus = Object.values(f.criticalHit || {}).reduce((s, c) => s + c, 0);
      const plantedAt = toMs(f.plantedAt);
      beds.push({ id, name: f.name, seed, seedLabel: seed ? SEED_DATA[seed].label : "?", bonus, totalYield: 1 + bonus,
        plantedAt, readyAt: plantedAt + (seed ? SEED_DATA[seed].baseSeconds : 86400) * 1000 });
    } else beds.push({ id, name: null, empty: true });
  }
  return beds.sort((a, b) => (a.empty === b.empty ? (a.empty ? 0 : a.readyAt - b.readyAt) : a.empty ? 1 : -1));
}

/**
 * @param farm  the game farm
 * @param opts  mode "collection" (n of each) | "gifts" (gifts per day of the flower × n days, giftPlan {npc: flower})
 * @returns { rows, beds, summary }
 */
export function flowerPlan(farm, { mode = "collection", n = 2, giftPlan = {}, now = Date.now() } = {}) {
  farm = farm || {};
  const inventory = farm.inventory || {};
  const beds = bedsOf(farm);
  const pend = {};
  for (const b of beds) if (!b.empty) pend[b.name] = (pend[b.name] || 0) + b.totalYield;

  const perDay = {};
  for (const f of Object.values(giftPlan || {})) if (f) perDay[f] = (perDay[f] || 0) + 1;
  const ownOf = (name) => (mode === "gifts" ? (perDay[name] || 0) * n : n);

  const dependents = {};
  for (const [name, r] of Object.entries(FLOWER_RECIPES)) if (isFlower(r.input)) (dependents[r.input] = dependents[r.input] || []).push(name);
  const held = (name) => getCount(inventory, name) + (pend[name] || 0);
  const memo = {}, visiting = new Set();
  const need = (name) => {
    if (memo[name] !== undefined) return memo[name];
    if (visiting.has(name)) return ownOf(name);
    visiting.add(name);
    let total = ownOf(name);
    for (const dep of dependents[name] || []) total += Math.max(0, need(dep) - held(dep));
    visiting.delete(name);
    return (memo[name] = total);
  };

  const boosts = detectFlowerBoosts(farm);
  const multiplier = computeFlowerMultiplier(boosts);
  const bedCount = Math.max(1, Object.keys((farm.flowers && farm.flowers.flowerBeds) || {}).length);

  const rows = Object.entries(FLOWER_RECIPES).map(([name, r]) => {
    const have = getCount(inventory, name), p = pend[name] || 0, total = need(name), own = ownOf(name);
    const missing = Math.max(0, total - have - p);
    const hoursPerGrow = (SEED_DATA[r.seed].baseSeconds * multiplier) / 3600;
    const seedIdx = SEED_ORDER.indexOf(r.seed);
    return {
      name, seed: r.seed, seedLabel: SEED_DATA[r.seed].label, seedColor: SEED_DATA[r.seed].color, seedSeason: SEED_DATA[r.seed].season,
      have, pend: p, own, dep: total - own, need: total, missing, done: missing === 0,
      hoursPerGrow, hoursLeft: missing * hoursPerGrow,
      input: r.input, inputIsFlower: isFlower(r.input), inputAvail: isFlower(r.input) ? held(r.input) : getCount(inventory, r.input),
      usedIn: (dependents[name] || []).map((d) => ({ name: d, need: need(d) })),
      // the page's order: seed by seed, unfinished first, most missing first
      order: seedIdx * 1e6 + (missing === 0 ? 5e5 : 0) - missing,
    };
  }).sort((a, b) => a.order - b.order);

  let hours = 0;
  for (const seed of SEED_ORDER) {
    const rem = rows.filter((r) => r.seed === seed).reduce((s, r) => s + r.missing, 0);
    hours += Math.ceil(rem / bedCount) * (SEED_DATA[seed].baseSeconds * multiplier) / 3600;
  }
  const summary = {
    complete: rows.filter((r) => r.done).length, total: rows.length, remaining: rows.reduce((s, r) => s + r.missing, 0),
    beds: bedCount, hours, multiplier, boosts: boosts.map((b) => ({ name: b.name, multiplier: b.multiplier })),
    season: (farm.season && farm.season.season) || null, now,
  };
  return { rows, beds, summary };
}
