import { COOKING_RECIPES_DATA, BUMPKIN_DEFAULT_RECIPES } from "../data/cooking.mjs";
import { detectCookingBoosts, computeFoodXP, computeCookTime } from "../engine/cooking.mjs";
import { computeRecipeCost, computeSaltYieldPerRake, computeSaltRakeCoinMult, computeFishYieldPerCast } from "../engine/cooking-cost.mjs";

const MAIN_BUILDINGS = ["Fire Pit", "Kitchen", "Bakery", "Deli", "Smoothie Shack"];
const rnd = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;

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
  for (const bd of MAIN_BUILDINGS) {
    const count = ((farm.buildings || {})[bd] || []).length;
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
        return { name, xp, time, xpPerHour, cost, xpPerSfl, isInstant };
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
  return {
    buildings,
    totalXpPerDay: rnd(total),
    petStreak: { weeks: pi.streak || 0, activeThisWeek: !!pi.thisWeekActive, mult: pi.manualOverride ? 1.5 : (pi.multiplier || 1) },
    xpBoosts: (boosts.xpBoosts || []).filter((b) => !b.petStreak).map((b) => b.name),
  };
}
