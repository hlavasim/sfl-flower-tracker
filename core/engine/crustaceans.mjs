// One crustacean, the way it is made: a water trap (pot), a chum, and a trap spot for some hours.
// The single copy LEVELING and the FISHING page both price crustaceans with; the recipe table is the
// one the CRUSTACEANS page tracks (CRUSTACEAN_RECIPES).
import { CRUSTACEAN_RECIPES } from "../data/crafting.mjs";
import { hasItem, findCollectible } from "../derive/items.mjs";

// crustaceans.ts WATER_TRAP readyTimeHours.
export const WATER_TRAP_HOURS = { "Crab Pot": 4, "Mariner Pot": 8 };
// Chums that are Fish Market products: the caller costs them its own way (casts, queue time).
const MADE_CHUM = new Set(["Fish Flake", "Fish Stick", "Fish Oil", "Crab Stick"]);

/** The farm's traps: spots (crabTraps.trapSpots), trap time (Speed Trap x0.8, Crystal Altar x0.95), pots kept (Royal Crab Pot). */
export function waterTraps(farm) {
  return {
    spots: Object.keys(((farm && farm.crabTraps) || {}).trapSpots || {}).length,
    timeMult: (hasItem(farm, "Speed Trap") ? 0.8 : 1) * (hasItem(farm, "Crystal Altar") ? 0.95 : 1),
    freePots: findCollectible(farm, "Royal Crab Pot").length > 0,
  };
}

/**
 * One crustacean, priced by `price(item)` (FLOWER): its pot — free when a placed Royal Crab Pot keeps
 * it — plus the cheaper of its bought chums. A chum that only the Fish Market makes (Oyster: 2 Fish
 * Stick) is returned as `made` and not priced here. `hours`: the trap spot it holds. null if `name`
 * is not a crustacean.
 */
export function crustaceanCost(name, price, traps = null) {
  const cr = CRUSTACEAN_RECIPES[name];
  if (!cr) return null;
  const potCost = traps && traps.freePots ? 0 : (price(cr.pot) || 0);
  let chum = null, made = null;
  if (cr.chum && cr.qty > 0) {
    const alt = cr.alt && cr.alt.match(/^(.+?)\s*x(\d+)$/);
    const opts = [[cr.chum, cr.qty], ...(alt ? [[alt[1], +alt[2]]] : [])];
    chum = opts.filter(([n]) => !MADE_CHUM.has(n))
      .map(([n, qty]) => ({ name: n, qty, cost: (price(n) || 0) * qty }))
      .filter((o) => o.cost > 0).sort((a, b) => a.cost - b.cost)[0] || null;
    if (!chum) {
      const m = opts.find(([n]) => MADE_CHUM.has(n));
      if (m) made = { name: m[0], qty: m[1] };
      else chum = { name: cr.chum, qty: cr.qty, cost: 0, unpriced: true };
    }
  }
  return { pot: cr.pot, potCost, chum, made, cost: potCost + (chum ? chum.cost : 0),
    hours: WATER_TRAP_HOURS[cr.pot] * (traps ? traps.timeMult : 1) };
}
