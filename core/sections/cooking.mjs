import { COOKING_RECIPES_DATA, BUMPKIN_DEFAULT_RECIPES, COOKING_BUILDING_NAMES } from "../data/cooking.mjs";
import { findCollectible } from "../derive/items.mjs";
import { detectCookingBoosts, computeFoodXP, computeCookTime, computeCookAmount, computeBankedFoodXp } from "../engine/cooking.mjs";
import { computeRecipeCost, computeSaltYieldPerRake, computeSaltRakeCoinMult, computeFishYieldPerCast } from "../engine/cooking-cost.mjs";

const rnd = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;

// settings = { savedRecipes?: object, petSimulate?: boolean, coinsPerSFL?: number, now?: ms }
// prices = p2p price map (sfl.world/api/v1/prices .data.p2p), or {} if unavailable —
// recipe costs come back null (unpriced) rather than throwing.
export function buildCookingSection(farm, prices = {}, settings = {}) {
  const savedRecipes = settings.savedRecipes || {};
  const boosts = detectCookingBoosts(farm, { petSimulate: !!settings.petSimulate, now: settings.now });
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
    // A Fish Market bait's recipe changes with the season, so the bait route has to be priced at
    // the season the farm is actually in — the cheapest season is a price you cannot pay today.
    season: (farm?.season?.season || "").toLowerCase(),
    // A water trap is consumed per catch, so it is charged per crustacean — unless a Royal Crab
    // Pot is PLACED, which is the one thing that stops placeWaterTrap decrementing the pot.
    freeWaterTraps: findCollectible(farm, "Royal Crab Pot").length > 0,
  };
  const buildings = {};
  const cookingTrace = {};   // per-building xp/day derivation, only filled when settings.explain
  const costTrace = {};      // per-building selected-recipe cost/cook derivation (explain only)
  let total = 0;
  for (const bd of COOKING_BUILDING_NAMES) {
    // The Aging Shed must still be PLACED to count, but once placed its slots scale with its
    // level (1-6) rather than with how many are placed — flowers.html:10588-10592 builds
    // `ownedBuildings` from placed count > 0, then :10743 overrides the count with the level.
    // The pre-migration power-summary (git show 04de877:flowers.html ~:17561) got this WRONG:
    // it used clamp(level, 1, 6) unguarded, which is always >= 1, so it served a phantom Aging
    // Shed to every farm that does not own one. The Bumpkin page is the correct copy; follow it.
    const placed = ((farm.buildings || {})[bd] || []).length;
    const count = (bd === "Aging Shed")
      ? (placed > 0 ? Math.min(Math.max((farm.agingShed && farm.agingShed.level) || 1, 1), 6) : 0)
      : placed;
    if (count === 0) continue;
    const selName = (savedRecipes[bd] !== undefined) ? savedRecipes[bd] : (BUMPKIN_DEFAULT_RECIPES[bd] || "");
    // Mirrors flowers.html:10746-10764 — per-building recipe list with XP/h + cost.
    const recipes = Object.entries(COOKING_RECIPES_DATA)
      .filter(([, r]) => r.building === bd)
      .map(([name, r]) => {
        const xp = computeFoodXP(name, r, bd, boosts);
        const time = computeCookTime(r.cookSec, bd, boosts, undefined, name);
        // Dishes per cook: Double Nom's +1 and the Fiery Jackpot / Cleaver chances.
        const amount = computeCookAmount(name, bd, boosts);
        const xpPerHour = time > 0 ? (xp * amount / time) * 3600 : 0;
        const isInstant = r.cookSec === 0;
        const rc = p2p ? computeRecipeCost(name, p2p, coinsPerSFL, skills, extras) : null;
        const cost = (rc && rc.total > 0) ? rc.total : null;
        // Double Nom doubles the ingredients too (getCookingRequirements, cook.ts:174-176), so only
        // the chance-based extras make a dish cheaper; cost stays the one-set recipe cost.
        const ingSets = (skills["Double Nom"] && bd !== "Aging Shed") ? 2 : 1;
        const xpPerSfl = (cost && cost > 0) ? (xp * amount) / (cost * ingSets) : 0;
        // Cost breakdown for the page's Cost/cook tooltip (items) and +self badge
        // (hasUnpriced) — flowers.html:10802 (costTip) and :10854 (+self badge).
        const items = rc ? rc.items : null;
        const hasUnpriced = rc ? rc.hasUnpriced : false;
        return { name, xp, time, amount, xpPerHour, cost, xpPerSfl, isInstant, items, hasUnpriced };
      });
    const rd = selName ? COOKING_RECIPES_DATA[selName] : null;
    if (!rd) { buildings[bd] = { recipe: null, cookMinutes: null, xpPerCook: 0, buildingCount: count, xpPerDay: 0, recipes }; continue; }
    const xp = computeFoodXP(selName, rd, bd, boosts);
    const time = computeCookTime(rd.cookSec, bd, boosts, undefined, selName);
    const amount = computeCookAmount(selName, bd, boosts);
    const cooksPerDay = time > 0 ? (86400 / time) * count : 0;
    // XP one cook pays = XP per dish × dishes per cook.
    const xpPerDay = xp * amount * cooksPerDay;
    buildings[bd] = { recipe: selName, cookMinutes: time > 0 ? Math.round(time / 6) / 10 : null, xpPerCook: rnd(xp * amount), dishesPerCook: rnd(amount), buildingCount: count, xpPerDay: rnd(xpPerDay), recipes };
    total += xpPerDay;
    if (settings.explain) {
      // Recompute the SAME xp/time with a trace sink so the derivation mirrors the value
      // exactly (same code path); mirrors item-value.mjs's opt-in trace. Children carry the
      // boost breakdown; the top formula multiplies xp/cook by cooks/day.
      const xpTrace = [], timeTrace = [];
      computeFoodXP(selName, rd, bd, boosts, xpTrace);
      computeCookTime(rd.cookSec, bd, boosts, timeTrace, selName);
      cookingTrace[bd] = {
        item: bd,
        method: "xp/day",
        formula: `${rnd(xp)} XP/dish × ${rnd(amount)} dishes/cook × ${rnd(cooksPerDay)} cooks/day` + (count > 1 ? ` (${count} buildings)` : ""),
        value: xpPerDay,
        unit: "XP/day",
        steps: [
          xpTrace[0],
          timeTrace[0],
          { item: "dishes/cook", method: "bonus food", formula: ["1"].concat((boosts.amountBoosts || []).filter((b) => (!b.buildings || b.buildings.includes(bd)) && !(b.excludeBuildings || []).includes(bd)).map((b) => `+ ${b.extra} (${b.name})`)).join(" "), value: amount, unit: "dishes/cook" },
          { item: "cooks/day", method: "throughput", formula: `86400s / ${Math.round(time)}s` + (count > 1 ? ` × ${count} buildings` : ""), value: cooksPerDay, unit: "cooks/day" },
        ],
      };
      // Cost/cook derivation for the selected recipe (Σ ingredient production costs). p2p may
      // be {} (unavailable) → computeRecipeCost returns null and no cost trace is attached.
      const costSink = [];
      if (p2p) computeRecipeCost(selName, p2p, coinsPerSFL, skills, extras, costSink);
      if (costSink.length) costTrace[bd] = costSink[0];
    }
  }
  const pi = boosts.petStreakInfo || {};
  // XP banked in the food inventory: every recipe plus Prime Aged fish, each attributed to its
  // own `.building` — computeBankedFoodXp, shared with the ascension section.
  const banked = computeBankedFoodXp(farm, boosts);
  return {
    buildings,
    totalXpPerDay: rnd(total),
    petStreak: { weeks: pi.streak || 0, activeThisWeek: !!pi.thisWeekActive, mult: pi.manualOverride ? 1.5 : (pi.multiplier || 1) },
    xpBoosts: (boosts.xpBoosts || []).filter((b) => !b.petStreak).map((b) => b.name),
    // Full boost objects (unfiltered — includes pet-streak entries), for the Bumpkin
    // page's boost lists (flowers.html:10707-10717) and xpLabel() building/honey tags.
    boosts: { xpBoosts: boosts.xpBoosts || [], timeBoosts: boosts.timeBoosts || [], amountBoosts: boosts.amountBoosts || [], petStreakInfo: pi },
    bankedFood: { totalXp: banked.totalXp, items: banked.items },
    ...(settings.explain ? { cookingTrace, costTrace } : {}),
  };
}
