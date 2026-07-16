import { COOKING_RECIPES_DATA, BUMPKIN_DEFAULT_RECIPES, COOKING_BUILDING_NAMES } from "../data/cooking.mjs";
import { detectCookingBoosts, computeFoodXP, computeCookTime } from "../engine/cooking.mjs";
import { computeRecipeCost, computeSaltYieldPerRake, computeSaltRakeCoinMult, computeFishYieldPerCast } from "../engine/cooking-cost.mjs";

const rnd = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
// Mirrors flowers.html:6595 (getCount) — inventory quantities can arrive as strings.
const getCount = (inv, name) => {
  const v = inv[name];
  if (v === undefined || v === null) return 0;
  return Math.floor(parseFloat(v));
};

// settings = { savedRecipes?: object, petSimulate?: boolean, coinsPerSFL?: number }
// prices = p2p price map (sfl.world/api/v1/prices .data.p2p), or {} if unavailable —
// recipe costs come back null (unpriced) rather than throwing.
export function buildCookingSection(farm, prices = {}, settings = {}) {
  const savedRecipes = settings.savedRecipes || {};
  const boosts = detectCookingBoosts(farm, { petSimulate: !!settings.petSimulate });
  const p2p = prices;
  const coinsPerSFL = settings.coinsPerSFL || 0;
  const skills = farm?.bumpkin?.skills || {};
  // Mirrors flowers.html:10753-10759 (_saltY/_saltCoinMult/_fishYieldByTier) — these
  // depend only on `farm`, not on building/recipe, so computed once and reused below.
  const extras = {
    saltYieldPerRake: computeSaltYieldPerRake(farm),
    saltRakeCoinMult: computeSaltRakeCoinMult(farm),
    fishYieldByTier: {
      basic: computeFishYieldPerCast(farm, "basic"),
      advanced: computeFishYieldPerCast(farm, "advanced"),
      expert: computeFishYieldPerCast(farm, "expert"),
    },
  };
  const buildings = {};
  let total = 0;
  for (const bd of COOKING_BUILDING_NAMES) {
    // Aging Shed slot count scales with its level (1-6), NOT the placed-building count —
    // verbatim from flowers.html:10743 (Bumpkin page) and the pre-migration power-summary
    // (git show 04de877:flowers.html ~:17561); the two agree (clamp(agingShed.level, 1, 6)).
    const count = (bd === "Aging Shed")
      ? Math.min(Math.max((farm.agingShed && farm.agingShed.level) || 1, 1), 6)
      : ((farm.buildings || {})[bd] || []).length;
    if (count === 0) continue;
    const selName = (savedRecipes[bd] !== undefined) ? savedRecipes[bd] : (BUMPKIN_DEFAULT_RECIPES[bd] || "");
    // Mirrors flowers.html:10746-10764 — per-building recipe list with XP/h + cost.
    const recipes = Object.entries(COOKING_RECIPES_DATA)
      .filter(([, r]) => r.building === bd)
      .map(([name, r]) => {
        const xp = computeFoodXP(name, r, bd, boosts);
        const time = computeCookTime(r.cookSec, bd, boosts);
        const xpPerHour = time > 0 ? (xp / time) * 3600 : 0;
        const isInstant = r.cookSec === 0;
        const rc = p2p ? computeRecipeCost(name, p2p, coinsPerSFL, skills, extras) : null;
        const cost = (rc && rc.total > 0) ? rc.total : null;
        const xpPerSfl = (cost && cost > 0) ? xp / cost : 0;
        // Cost breakdown for the page's Cost/cook tooltip (items) and +self badge
        // (hasUnpriced) — flowers.html:10802 (costTip) and :10854 (+self badge).
        const items = rc ? rc.items : null;
        const hasUnpriced = rc ? rc.hasUnpriced : false;
        return { name, xp, time, xpPerHour, cost, xpPerSfl, isInstant, items, hasUnpriced };
      });
    const rd = selName ? COOKING_RECIPES_DATA[selName] : null;
    if (!rd) { buildings[bd] = { recipe: null, cookMinutes: null, xpPerCook: 0, buildingCount: count, xpPerDay: 0, recipes }; continue; }
    const xp = computeFoodXP(selName, rd, bd, boosts);
    const time = computeCookTime(rd.cookSec, bd, boosts);
    const cooksPerDay = time > 0 ? (86400 / time) * count : 0;
    const xpPerDay = xp * cooksPerDay;
    buildings[bd] = { recipe: selName, cookMinutes: time > 0 ? Math.round(time / 6) / 10 : null, xpPerCook: rnd(xp), buildingCount: count, xpPerDay: rnd(xpPerDay), recipes };
    total += xpPerDay;
  }
  const pi = boosts.petStreakInfo || {};
  // Mirrors flowers.html:10606-10617 — XP banked in the food inventory, summed across
  // ALL recipes (not just the 5 main buildings), attributed to each recipe's own
  // `.building` (not the loop variable above).
  const inventory = farm.inventory || {};
  const foodInInventory = [];
  let bankedXP = 0;
  for (const [foodName, recipe] of Object.entries(COOKING_RECIPES_DATA)) {
    const qty = getCount(inventory, foodName);
    if (qty > 0) {
      const xpEach = computeFoodXP(foodName, recipe, recipe.building, boosts);
      const totalFoodXP = xpEach * qty;
      bankedXP += totalFoodXP;
      foodInInventory.push({ name: foodName, qty, xpEach, totalFoodXP });
    }
  }
  return {
    buildings,
    totalXpPerDay: rnd(total),
    petStreak: { weeks: pi.streak || 0, activeThisWeek: !!pi.thisWeekActive, mult: pi.manualOverride ? 1.5 : (pi.multiplier || 1) },
    xpBoosts: (boosts.xpBoosts || []).filter((b) => !b.petStreak).map((b) => b.name),
    // Full boost objects (unfiltered — includes pet-streak entries), for the Bumpkin
    // page's boost lists (flowers.html:10707-10717) and xpLabel() building/honey tags.
    boosts: { xpBoosts: boosts.xpBoosts || [], timeBoosts: boosts.timeBoosts || [], petStreakInfo: pi },
    bankedFood: { totalXp: bankedXP, items: foodInInventory },
  };
}
