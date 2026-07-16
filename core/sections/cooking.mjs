import { COOKING_RECIPES_DATA, BUMPKIN_DEFAULT_RECIPES } from "../data/cooking.mjs";
import { detectCookingBoosts, computeFoodXP, computeCookTime } from "../engine/cooking.mjs";

const MAIN_BUILDINGS = ["Fire Pit", "Kitchen", "Bakery", "Deli", "Smoothie Shack"];
const rnd = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;

// settings = { savedRecipes?: object, petSimulate?: boolean, coinsPerSFL?: number }
// `prices` is reserved for Wave B (recipe cost); unused here.
export function buildCookingSection(farm, prices = {}, settings = {}) {
  const savedRecipes = settings.savedRecipes || {};
  const boosts = detectCookingBoosts(farm, { petSimulate: !!settings.petSimulate });
  const buildings = {};
  let total = 0;
  for (const bd of MAIN_BUILDINGS) {
    const count = ((farm.buildings || {})[bd] || []).length;
    if (count === 0) continue;
    const selName = (savedRecipes[bd] !== undefined) ? savedRecipes[bd] : (BUMPKIN_DEFAULT_RECIPES[bd] || "");
    const rd = selName ? COOKING_RECIPES_DATA[selName] : null;
    if (!rd) { buildings[bd] = { recipe: null, cookMinutes: null, xpPerCook: 0, buildingCount: count, xpPerDay: 0 }; continue; }
    const xp = computeFoodXP(selName, rd, bd, boosts);
    const time = computeCookTime(rd.cookSec, bd, boosts);
    const cooksPerDay = time > 0 ? (86400 / time) * count : 0;
    const xpPerDay = xp * cooksPerDay;
    buildings[bd] = { recipe: selName, cookMinutes: time > 0 ? Math.round(time / 6) / 10 : null, xpPerCook: rnd(xp), buildingCount: count, xpPerDay: rnd(xpPerDay) };
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
