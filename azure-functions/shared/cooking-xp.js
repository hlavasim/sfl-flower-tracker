// Boost-aware banked-food XP: the XP a farm would gain by eating everything it has
// already cooked and is holding in its inventory.
//
// This delegates to core/engine/cooking.mjs rather than reimplementing it. Those
// boosts are conditional logic over skills, wearables, collectibles, sculptures and
// the faction pet streak — a hand-written CJS copy would drift from core/ silently,
// and this number feeds the level gates behind two charts. core/ is vendored into the
// function app at deploy time by scripts/copy-core.mjs.
//
// petSimulate: true matches core/sections/ascension.mjs — a player eats their banked
// food with the x1.5 pet streak active (they wait for it), so that is what the bank is
// worth. Anything else undervalues it.

let cache = null;

/**
 * Loads the ESM cooking engine out of the vendored core/. CJS cannot require() ESM,
 * so this is an async dynamic import, resolved once per process.
 * @returns {Promise<{ok: boolean, bankedFoodXp: (farm:any)=>number, error?: string}>}
 */
async function loadCookingEngine() {
  if (cache) return cache;
  try {
    const [engine, data] = await Promise.all([
      import("../core/engine/cooking.mjs"),
      import("../core/data/cooking.mjs"),
    ]);
    const { detectCookingBoosts, computeFoodXP } = engine;
    const RECIPES = data.COOKING_RECIPES_DATA;
    if (typeof detectCookingBoosts !== "function" || typeof computeFoodXP !== "function" || !RECIPES) {
      throw new Error("vendored core/ is missing detectCookingBoosts/computeFoodXP/COOKING_RECIPES_DATA");
    }
    cache = {
      ok: true,
      bankedFoodXp(farm) {
        const inv = (farm && farm.inventory) || {};
        const boosts = detectCookingBoosts(farm || {}, { petSimulate: true });
        let total = 0;
        for (const [food, recipe] of Object.entries(RECIPES)) {
          const raw = inv[food];
          if (raw === undefined || raw === null) continue;
          const n = Math.floor(parseFloat(raw));
          if (!Number.isFinite(n) || n <= 0) continue;
          total += n * computeFoodXP(food, recipe, recipe.building, boosts);
        }
        return total;
      },
    };
  } catch (err) {
    // Deliberately does NOT fall back to unboosted XP: quietly writing understated
    // levels and expansion reaches for every farm would be worse than a visible
    // failure, because nothing downstream could tell the numbers were wrong.
    cache = { ok: false, error: err.message, bankedFoodXp: () => { throw err; } };
  }
  return cache;
}

module.exports = { loadCookingEngine };
