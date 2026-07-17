import { FLOWER_RECIPES, DOLL_RECIPES, RECIPE_INGREDIENTS } from "../data/recipes.mjs";
import { SEED_COSTS, POTION_TICKET_COIN_VALUE, EXOTIC_CROPS_TICKET_COST, GIANT_FRUIT_SELL_PRICES, TOOL_COSTS, FLOWER_SEED_COIN_COSTS, ITEM_XP_VALUES, GIANT_ITEM_COIN_PRICES } from "../data/economy.mjs";
import { PET_FETCH_DATA } from "../data/pets.mjs";
import { CRAFTED_INGREDIENT_RECIPES, TREASURE_SELL_PRICES, COMPOST_RECIPES, CRUSTACEAN_RECIPES } from "../data/crafting.mjs";
import { FISH_MARKET_RECIPES, FISH_DATA, FISH_TIER_MAP, BAIT_WORM_YIELD } from "../data/fishing.mjs";
import { COOKING_INGREDIENTS, SALT_RAKE_COST, SALT_BASE_YIELD } from "../data/cooking.mjs";
import { computeRodCostSFL, computeFishEffectiveCost, computeBaitCostSFL } from "./cooking-cost.mjs";

// Market-first item value resolver — moved verbatim from flowers.html's estimateItemSfl
// (~:23110-23300). Prefers a direct P2P market price; falls back through a fixed chain of
// derivations (crafted/food recipes, dolls, tools, exotic crops, seeds, treasure, XP, etc.)
// when no market price exists. 0 means "unknown" — ~29 call sites depend on that contract.
export function itemMarketValue(itemName, p2pPrices, _visited, rates) {
  // Direct P2P price
  if (p2pPrices[itemName]) return p2pPrices[itemName];

  // Prevent infinite recursion
  const visited = _visited || new Set();
  if (visited.has(itemName)) return 0;
  visited.add(itemName);

  // Crafted ingredient (e.g., Cheese = 3 Milk)
  const craftedRecipe = CRAFTED_INGREDIENT_RECIPES[itemName];
  if (craftedRecipe) {
    let total = 0;
    for (const [ing, qty] of Object.entries(craftedRecipe)) {
      const ingPrice = itemMarketValue(ing, p2pPrices, visited, rates);
      if (ingPrice <= 0) return 0;
      total += ingPrice * qty;
    }
    return total;
  }

  // Food recipe
  const foodRecipe = RECIPE_INGREDIENTS[itemName];
  if (foodRecipe) {
    let total = 0;
    for (const [ing, qty] of Object.entries(foodRecipe)) {
      const ingPrice = itemMarketValue(ing, p2pPrices, visited, rates);
      if (ingPrice <= 0) return 0;
      total += ingPrice * qty;
    }
    return total;
  }

  // Barn Delight
  if (itemName === "Barn Delight") {
    const lemon = p2pPrices["Lemon"] || 0;
    const honey = p2pPrices["Honey"] || 0;
    if (lemon > 0 && honey > 0) return 5 * lemon + 3 * honey;
    return 0;
  }

  // Doll recipes
  if (typeof DOLL_RECIPES !== "undefined" && DOLL_RECIPES[itemName]) {
    const recipe = DOLL_RECIPES[itemName];
    if (recipe.length === 0) return 0;
    let total = 0;
    for (const { item, qty } of recipe) {
      const ingPrice = itemMarketValue(item, p2pPrices, visited, rates);
      if (ingPrice <= 0) return 0;
      total += ingPrice * qty;
    }
    return total;
  }

  // Tool costs (coins + materials)
  if (typeof TOOL_COSTS !== "undefined" && TOOL_COSTS[itemName] && rates && rates.coinsPerSFL > 0) {
    const tool = TOOL_COSTS[itemName];
    let total = tool.coins / rates.coinsPerSFL;
    if (tool.materials) {
      for (const [mat, qty] of Object.entries(tool.materials)) {
        const matPrice = itemMarketValue(mat, p2pPrices, visited, rates);
        total += matPrice * qty;
      }
    }
    return total;
  }

  // Exotic crops — buy price at Eins (Potion House) = tickets × 15 coins.
  // This is the acquisition cost: how much you'd spend to get one.
  if (typeof EXOTIC_CROPS_TICKET_COST !== "undefined"
      && EXOTIC_CROPS_TICKET_COST[itemName]
      && rates && rates.coinsPerSFL > 0) {
    return (EXOTIC_CROPS_TICKET_COST[itemName] * POTION_TICKET_COIN_VALUE) / rates.coinsPerSFL;
  }
  // Giant fruits — random chance from fruit trees, not buyable. Approximate
  // via NPC sellPrice as a rough "value to farmer" proxy.
  if (typeof GIANT_FRUIT_SELL_PRICES !== "undefined"
      && GIANT_FRUIT_SELL_PRICES[itemName]
      && rates && rates.coinsPerSFL > 0) {
    return GIANT_FRUIT_SELL_PRICES[itemName] / rates.coinsPerSFL;
  }

  // Seed costs (coins only) — SEED_COSTS keyed by crop name, items come as "X Seed" or "X Plant"
  if (typeof SEED_COSTS !== "undefined" && rates && rates.coinsPerSFL > 0) {
    const cropName = itemName.endsWith(" Seed") ? itemName.slice(0, -5) : itemName.endsWith(" Plant") ? itemName.slice(0, -6) : itemName;
    if (SEED_COSTS[cropName]) return SEED_COSTS[cropName] / rates.coinsPerSFL;
  }

  // Love Charm: 50 LC = 1 SFL
  if (itemName === "Love Charm") return 1 / 50;

  // Flower seed coin costs
  if (typeof FLOWER_SEED_COIN_COSTS !== "undefined" && FLOWER_SEED_COIN_COSTS[itemName] && rates && rates.coinsPerSFL > 0) {
    return FLOWER_SEED_COIN_COSTS[itemName] / rates.coinsPerSFL;
  }

  // Flowers → seed cost (via FLOWER_RECIPES; input flower not counted as it appears separately in diff)
  if (typeof FLOWER_RECIPES !== "undefined" && FLOWER_RECIPES[itemName]) {
    const seedName = FLOWER_RECIPES[itemName].seed;
    if (typeof FLOWER_SEED_COIN_COSTS !== "undefined" && FLOWER_SEED_COIN_COSTS[seedName] && rates && rates.coinsPerSFL > 0) {
      return FLOWER_SEED_COIN_COSTS[seedName] / rates.coinsPerSFL;
    }
  }

  // Treasure sell prices (coins → SFL, with boosts: Treasure Map +20%, Camel +30%)
  if (typeof TREASURE_SELL_PRICES !== "undefined" && TREASURE_SELL_PRICES[itemName] && rates && rates.coinsPerSFL > 0) {
    const tb = rates.treasureBoost || 1;
    return (TREASURE_SELL_PRICES[itemName] * tb) / rates.coinsPerSFL;
  }

  // Fish/food XP-based pricing (sflPerXP from bumpkin best cooking recipe)
  if (typeof ITEM_XP_VALUES !== "undefined" && ITEM_XP_VALUES[itemName] && rates && rates.sflPerXP > 0) {
    return ITEM_XP_VALUES[itemName] * rates.sflPerXP;
  }

  // Giant item coin sell prices
  if (typeof GIANT_ITEM_COIN_PRICES !== "undefined" && GIANT_ITEM_COIN_PRICES[itemName] && rates && rates.coinsPerSFL > 0) {
    return GIANT_ITEM_COIN_PRICES[itemName] / rates.coinsPerSFL;
  }

  // Omnifeed: costs 1 Gem
  if (itemName === "Omnifeed") {
    const gemsPerSFL = rates?.gemsPerSFL || 0;
    if (gemsPerSFL > 0) return 1 / gemsPerSFL;
  }

  // Crustaceans (pot + chum cost from CRUSTACEAN_RECIPES)
  if (typeof CRUSTACEAN_RECIPES !== "undefined" && CRUSTACEAN_RECIPES[itemName]) {
    const cr = CRUSTACEAN_RECIPES[itemName];
    const potPrice = itemMarketValue(cr.pot, p2pPrices, visited, rates);
    let chumCost = 0;
    if (cr.chum && cr.qty > 0) {
      chumCost = itemMarketValue(cr.chum, p2pPrices, visited, rates) * cr.qty;
      if (cr.alt) {
        const altParts = cr.alt.match(/^(.+?)\s*x(\d+)$/);
        if (altParts) {
          const altCost = itemMarketValue(altParts[1], p2pPrices, visited, rates) * parseInt(altParts[2]);
          if (altCost > 0 && (chumCost <= 0 || altCost < chumCost)) chumCost = altCost;
        }
      }
    }
    if (potPrice > 0) return potPrice + chumCost;
  }

  // Mark: fixed 0.01 SFL (from treasury/faction shop)
  if (itemName === "Mark") return 0.01;

  // Acorn: opportunity cost = best pet resource SFL/energy ratio * 100 energy
  if (itemName === "Acorn" && typeof PET_FETCH_DATA !== "undefined") {
    let bestRatio = 0;
    for (const entries of Object.values(PET_FETCH_DATA)) {
      for (const e of entries) {
        if (e.res === "Acorn") continue;
        const p = p2pPrices[e.res] || 0;
        if (p > 0) bestRatio = Math.max(bestRatio, p / e.energy);
      }
    }
    if (bestRatio > 0) return bestRatio * 100;
  }

  // Fish Market recipes (season-dependent: Crab Stick, Fish Flake, Fish Stick, Fish Oil)
  if (typeof FISH_MARKET_RECIPES !== "undefined" && FISH_MARKET_RECIPES[itemName]) {
    const seasonRecipes = FISH_MARKET_RECIPES[itemName];
    const s = rates?.season || "";
    const recipe = seasonRecipes[s] || Object.values(seasonRecipes)[0];
    if (recipe) {
      let total = 0;
      for (const [ing, qty] of Object.entries(recipe)) {
        total += itemMarketValue(ing, p2pPrices, visited, rates) * qty;
      }
      if (total > 0) return total;
    }
  }

  // Compost products (Sprout Mix, Fruitful Blend, Rapid Root, Earthworm, Grub, Red Wiggler)
  if (typeof COMPOST_RECIPES !== "undefined") {
    for (const [composter, data] of Object.entries(COMPOST_RECIPES)) {
      if (data.outputs[itemName] !== undefined) {
        const s = rates?.season || "";
        const inputs = data.inputs[s] || Object.values(data.inputs)[0];
        let batchCost = 0;
        for (const [ing, qty] of Object.entries(inputs)) {
          batchCost += itemMarketValue(ing, p2pPrices, visited, rates) * qty;
        }
        const totalUnits = Object.values(data.outputs).reduce((sum, q) => sum + q, 0);
        if (batchCost > 0 && totalUnits > 0) return batchCost / totalUnits;
      }
    }
  }

  return 0;
}

// Production-cost item resolver — "what does it cost ME to make", not "what is it worth".
// Moved verbatim from core/engine/cooking-cost.mjs's _resolveItemSfl. Deliberately answers
// a different question than itemMarketValue: e.g. Salt is checked first (branch 0, before
// direct P2P) and derived from the Salt Rake's cost / yield-per-rake, ignoring the market —
// you rake your own Salt, so the market price is irrelevant to a cooking cost.
// Resolution order: Salt (rake) → P2P → FISH_DATA → bait worm → Fish Market recipe →
// COOKING_INGREDIENTS recursion → CRAFTED_INGREDIENT_RECIPES → CRUSTACEAN_RECIPES →
// TREASURE_SELL_PRICES → null
export function itemProductionCost(itemName, p2p, coinsPerSFL, skills, _seen, extras) {
  _seen = _seen || new Set();
  if (_seen.has(itemName)) return null;
  _seen.add(itemName);

  // 0. Salt — derived from Salt Rake cost (20 coins + 3 Wood per harvest) / yield-per-rake
  if (itemName === "Salt") {
    const yieldPerRake = (extras && extras.saltYieldPerRake) || SALT_BASE_YIELD;
    const coinMult = (extras && typeof extras.saltRakeCoinMult === "number") ? extras.saltRakeCoinMult : 1;
    const coinSFL = coinsPerSFL > 0 ? (SALT_RAKE_COST.coins * coinMult) / coinsPerSFL : 0;
    let matSFL = 0;
    for (const [m, q] of Object.entries(SALT_RAKE_COST.materials)) {
      matSFL += (parseFloat(p2p[m]) || 0) * q;
    }
    const cost = (coinSFL + matSFL) / yieldPerRake;
    return cost > 0 ? { price: cost, source: "salt" } : null;
  }

  // 1. Direct P2P
  const direct = parseFloat(p2p[itemName]) || 0;
  if (direct > 0) return { price: direct, source: "P2P" };

  // 2. Fish — for Aging Shed (extras.fishAsRod) treat as rod cost / yield-per-cast;
  //    otherwise use empirical fishing cost (rod + bait + chum / probability)
  if (FISH_DATA[itemName]) {
    if (extras && extras.fishAsRod) {
      const rod = computeRodCostSFL(p2p, coinsPerSFL, skills);
      const tier = FISH_TIER_MAP[itemName];
      const yieldByTier = (extras && extras.fishYieldByTier) || {};
      const yieldPerCast = (tier && yieldByTier[tier]) || 1;
      return rod > 0 ? { price: rod / yieldPerCast, source: "fish-rod" } : null;
    }
    const fc = computeFishEffectiveCost(itemName, p2p, coinsPerSFL, skills);
    if (fc) return { price: fc.sfl, source: "fish", fc };
    return null;
  }

  // 3. Worm-bait (Earthworm/Grub/Red Wiggler from COMPOST_RECIPES)
  if (BAIT_WORM_YIELD[itemName]) {
    const c = computeBaitCostSFL(itemName, p2p);
    return c > 0 ? { price: c, source: "bait" } : null;
  }

  // 3b. Fish Market processed (Fish Flake / Fish Stick / Fish Oil / Crab Stick)
  if (typeof FISH_MARKET_RECIPES !== "undefined" && FISH_MARKET_RECIPES[itemName]) {
    const seasonRecipes = FISH_MARKET_RECIPES[itemName];
    // Use cheapest season (best player can do)
    let bestCost = null;
    for (const s of Object.keys(seasonRecipes)) {
      const recipe = seasonRecipes[s];
      let total = 0, missing = false;
      for (const [sub, q] of Object.entries(recipe)) {
        const r = itemProductionCost(sub, p2p, coinsPerSFL, skills, _seen, extras);
        if (!r) { missing = true; break; }
        total += r.price * q;
      }
      if (!missing && (bestCost == null || total < bestCost)) bestCost = total;
    }
    return bestCost != null ? { price: bestCost, source: "fish-market" } : null;
  }

  // 4. Recipe ingredient (chained recipes like Cabbers n Mash → Mashed Potato)
  const recipe = COOKING_INGREDIENTS[itemName];
  if (recipe) {
    let total = 0;
    for (const [sub, q] of Object.entries(recipe)) {
      const r = itemProductionCost(sub, p2p, coinsPerSFL, skills, _seen, extras);
      if (!r) return null;
      total += r.price * q;
    }
    return { price: total, source: "recipe" };
  }

  // 5. Crafted ingredient (Cheese, Kernel Blend, Hay, etc.)
  if (typeof CRAFTED_INGREDIENT_RECIPES !== "undefined" && CRAFTED_INGREDIENT_RECIPES[itemName]) {
    const recipe = CRAFTED_INGREDIENT_RECIPES[itemName];
    let total = 0;
    for (const [sub, q] of Object.entries(recipe)) {
      const r = itemProductionCost(sub, p2p, coinsPerSFL, skills, _seen, extras);
      if (!r) return null;
      total += r.price * q;
    }
    return { price: total, source: "crafted" };
  }

  // 6. Crustacean (Blue Crab, Lobster, etc. via Crab Pot + chum)
  if (typeof CRUSTACEAN_RECIPES !== "undefined" && CRUSTACEAN_RECIPES[itemName]) {
    const cr = CRUSTACEAN_RECIPES[itemName];
    // Pot price (one-time setup, but treat as per-catch since we lack pot-cycle accounting)
    let total = 0;
    if (cr.chum && cr.qty > 0) {
      const chumR = itemProductionCost(cr.chum, p2p, coinsPerSFL, skills, _seen, extras);
      if (chumR) total += chumR.price * cr.qty;
      // Try cheaper alternate chum
      if (cr.alt) {
        const altMatch = cr.alt.match(/^(.+?)\s*x(\d+)$/);
        if (altMatch) {
          const altR = itemProductionCost(altMatch[1], p2p, coinsPerSFL, skills, _seen, extras);
          if (altR) {
            const altCost = altR.price * parseInt(altMatch[2]);
            if (altCost > 0 && (total <= 0 || altCost < total)) total = altCost;
          }
        }
      }
    }
    return total > 0 ? { price: total, source: "crustacean" } : null;
  }

  // 7. Treasure / coin-priced items (Crab, Sea Cucumber, etc. → coins / coinsPerSFL)
  if (typeof TREASURE_SELL_PRICES !== "undefined" && TREASURE_SELL_PRICES[itemName] && coinsPerSFL > 0) {
    return { price: TREASURE_SELL_PRICES[itemName] / coinsPerSFL, source: "treasure" };
  }

  // 8. Generic fish XP-based fallback (if not in FISH_DATA but in ITEM_XP_VALUES)
  // Note: this is a heuristic — uses opportunity cost from XP value.
  // Skipped here since it requires sflPerXP rate which we don't have at call-time.

  return null;
}
