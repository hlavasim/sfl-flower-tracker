import { FLOWER_RECIPES, DOLL_RECIPES, RECIPE_INGREDIENTS } from "../data/recipes.mjs";
import { SEED_COSTS, POTION_TICKET_COIN_VALUE, EXOTIC_CROPS_TICKET_COST, GIANT_FRUIT_SELL_PRICES, TOOL_COSTS, FLOWER_SEED_COIN_COSTS, ITEM_XP_VALUES, GIANT_ITEM_COIN_PRICES } from "../data/economy.mjs";
import { PET_FETCH_DATA } from "../data/pets.mjs";
import { CRAFTED_INGREDIENT_RECIPES, TREASURE_SELL_PRICES, COMPOST_RECIPES, CRUSTACEAN_RECIPES } from "../data/crafting.mjs";
import { FISH_MARKET_RECIPES, FISH_DATA, FISH_TIER_MAP, BAIT_WORM_YIELD, FISHING_ROD_COST } from "../data/fishing.mjs";
import { COOKING_INGREDIENTS, SALT_RAKE_COST, SALT_BASE_YIELD } from "../data/cooking.mjs";

// Trace sink for the item-value resolvers. When a caller passes a `trace` array as the
// last argument, each traced function pushes ONE node per return path describing how
// that value was derived: { item, method, formula, value, steps? } — steps are child
// nodes from recursive ingredient calls, so the tree mirrors the actual recursion.
// Every call site only builds the node (and any child sink) inside `if (trace)`, so the
// hot, no-trace path is unchanged: the same value computation, plus a single falsy check
// per return, with no extra string/array allocation.
function emit(trace, node) { if (trace) trace.push(node); return node.value; }

// Market-first item value resolver — moved verbatim from flowers.html's estimateItemSfl
// (~:23110-23300). Prefers a direct P2P market price; falls back through a fixed chain of
// derivations (crafted/food recipes, dolls, tools, exotic crops, seeds, treasure, XP, etc.)
// when no market price exists. 0 means "unknown" — ~29 call sites depend on that contract.
export function itemMarketValue(itemName, p2pPrices, _visited, rates, trace) {
  // Direct P2P price
  if (p2pPrices[itemName]) {
    const value = p2pPrices[itemName];
    if (trace) return emit(trace, { item: itemName, method: "market price", formula: "P2P", value });
    return value;
  }

  // Prevent infinite recursion
  const visited = _visited || new Set();
  if (visited.has(itemName)) {
    if (trace) return emit(trace, { item: itemName, method: "cycle", formula: "circular reference (already visited)", value: 0 });
    return 0;
  }
  visited.add(itemName);

  // Crafted ingredient (e.g., Cheese = 3 Milk)
  const craftedRecipe = CRAFTED_INGREDIENT_RECIPES[itemName];
  if (craftedRecipe) {
    let total = 0;
    const kids = trace ? [] : undefined;
    const parts = trace ? [] : undefined;
    for (const [ing, qty] of Object.entries(craftedRecipe)) {
      const ingPrice = itemMarketValue(ing, p2pPrices, visited, rates, kids);
      if (ingPrice <= 0) {
        if (trace) return emit(trace, { item: itemName, method: "crafted recipe", formula: `unpriceable ingredient: ${ing}`, value: 0, steps: kids });
        return 0;
      }
      total += ingPrice * qty;
      if (trace) parts.push(`${qty} × ${ing} @ ${ingPrice.toFixed(5)}`);
    }
    if (trace) return emit(trace, { item: itemName, method: "crafted recipe", formula: parts.join(" + "), value: total, steps: kids });
    return total;
  }

  // Food recipe
  const foodRecipe = RECIPE_INGREDIENTS[itemName];
  if (foodRecipe) {
    let total = 0;
    const kids = trace ? [] : undefined;
    const parts = trace ? [] : undefined;
    for (const [ing, qty] of Object.entries(foodRecipe)) {
      const ingPrice = itemMarketValue(ing, p2pPrices, visited, rates, kids);
      if (ingPrice <= 0) {
        if (trace) return emit(trace, { item: itemName, method: "food recipe", formula: `unpriceable ingredient: ${ing}`, value: 0, steps: kids });
        return 0;
      }
      total += ingPrice * qty;
      if (trace) parts.push(`${qty} × ${ing} @ ${ingPrice.toFixed(5)}`);
    }
    if (trace) return emit(trace, { item: itemName, method: "food recipe", formula: parts.join(" + "), value: total, steps: kids });
    return total;
  }

  // Barn Delight
  if (itemName === "Barn Delight") {
    const lemon = p2pPrices["Lemon"] || 0;
    const honey = p2pPrices["Honey"] || 0;
    if (lemon > 0 && honey > 0) {
      const value = 5 * lemon + 3 * honey;
      if (trace) return emit(trace, { item: itemName, method: "food recipe", formula: `5 × Lemon @ ${lemon.toFixed(5)} + 3 × Honey @ ${honey.toFixed(5)}`, value });
      return value;
    }
    if (trace) return emit(trace, { item: itemName, method: "food recipe", formula: "Lemon or Honey unpriced", value: 0 });
    return 0;
  }

  // Doll recipes
  if (typeof DOLL_RECIPES !== "undefined" && DOLL_RECIPES[itemName]) {
    const recipe = DOLL_RECIPES[itemName];
    if (recipe.length === 0) {
      if (trace) return emit(trace, { item: itemName, method: "doll recipe", formula: "empty recipe", value: 0 });
      return 0;
    }
    let total = 0;
    const kids = trace ? [] : undefined;
    const parts = trace ? [] : undefined;
    for (const { item, qty } of recipe) {
      const ingPrice = itemMarketValue(item, p2pPrices, visited, rates, kids);
      if (ingPrice <= 0) {
        if (trace) return emit(trace, { item: itemName, method: "doll recipe", formula: `unpriceable ingredient: ${item}`, value: 0, steps: kids });
        return 0;
      }
      total += ingPrice * qty;
      if (trace) parts.push(`${qty} × ${item} @ ${ingPrice.toFixed(5)}`);
    }
    if (trace) return emit(trace, { item: itemName, method: "doll recipe", formula: parts.join(" + "), value: total, steps: kids });
    return total;
  }

  // Tool costs (coins + materials)
  if (typeof TOOL_COSTS !== "undefined" && TOOL_COSTS[itemName] && rates && rates.coinsPerSFL > 0) {
    const tool = TOOL_COSTS[itemName];
    let total = tool.coins / rates.coinsPerSFL;
    const kids = trace ? [] : undefined;
    const parts = trace ? [`${tool.coins}c / ${rates.coinsPerSFL.toFixed(0)} c/SFL`] : undefined;
    if (tool.materials) {
      for (const [mat, qty] of Object.entries(tool.materials)) {
        const matPrice = itemMarketValue(mat, p2pPrices, visited, rates, kids);
        total += matPrice * qty;
        if (trace) parts.push(`${qty} × ${mat} @ ${matPrice.toFixed(5)}`);
      }
    }
    if (trace) return emit(trace, { item: itemName, method: "tool cost", formula: parts.join(" + "), value: total, steps: kids });
    return total;
  }

  // Exotic crops — buy price at Eins (Potion House) = tickets × 15 coins.
  // This is the acquisition cost: how much you'd spend to get one.
  if (typeof EXOTIC_CROPS_TICKET_COST !== "undefined"
      && EXOTIC_CROPS_TICKET_COST[itemName]
      && rates && rates.coinsPerSFL > 0) {
    const tickets = EXOTIC_CROPS_TICKET_COST[itemName];
    const value = (tickets * POTION_TICKET_COIN_VALUE) / rates.coinsPerSFL;
    if (trace) return emit(trace, { item: itemName, method: "exotic crop", formula: `${tickets} tickets × ${POTION_TICKET_COIN_VALUE}c / ${rates.coinsPerSFL.toFixed(0)} c/SFL`, value });
    return value;
  }
  // Giant fruits — random chance from fruit trees, not buyable. Approximate
  // via NPC sellPrice as a rough "value to farmer" proxy.
  if (typeof GIANT_FRUIT_SELL_PRICES !== "undefined"
      && GIANT_FRUIT_SELL_PRICES[itemName]
      && rates && rates.coinsPerSFL > 0) {
    const coins = GIANT_FRUIT_SELL_PRICES[itemName];
    const value = coins / rates.coinsPerSFL;
    if (trace) return emit(trace, { item: itemName, method: "giant fruit", formula: `${coins}c / ${rates.coinsPerSFL.toFixed(0)} c/SFL`, value });
    return value;
  }

  // Seed costs (coins only) — SEED_COSTS keyed by crop name, items come as "X Seed" or "X Plant"
  if (typeof SEED_COSTS !== "undefined" && rates && rates.coinsPerSFL > 0) {
    const cropName = itemName.endsWith(" Seed") ? itemName.slice(0, -5) : itemName.endsWith(" Plant") ? itemName.slice(0, -6) : itemName;
    if (SEED_COSTS[cropName]) {
      const coins = SEED_COSTS[cropName];
      const value = coins / rates.coinsPerSFL;
      if (trace) return emit(trace, { item: itemName, method: "seed cost", formula: `${coins}c / ${rates.coinsPerSFL.toFixed(0)} c/SFL`, value });
      return value;
    }
  }

  // Love Charm: 50 LC = 1 SFL
  if (itemName === "Love Charm") {
    if (trace) return emit(trace, { item: itemName, method: "love charm", formula: "50 LC / SFL", value: 1 / 50 });
    return 1 / 50;
  }

  // Flower seed coin costs
  if (typeof FLOWER_SEED_COIN_COSTS !== "undefined" && FLOWER_SEED_COIN_COSTS[itemName] && rates && rates.coinsPerSFL > 0) {
    const coins = FLOWER_SEED_COIN_COSTS[itemName];
    const value = coins / rates.coinsPerSFL;
    if (trace) return emit(trace, { item: itemName, method: "flower seed", formula: `${coins}c / ${rates.coinsPerSFL.toFixed(0)} c/SFL`, value });
    return value;
  }

  // Flowers → seed cost (via FLOWER_RECIPES; input flower not counted as it appears separately in diff)
  if (typeof FLOWER_RECIPES !== "undefined" && FLOWER_RECIPES[itemName]) {
    const seedName = FLOWER_RECIPES[itemName].seed;
    if (typeof FLOWER_SEED_COIN_COSTS !== "undefined" && FLOWER_SEED_COIN_COSTS[seedName] && rates && rates.coinsPerSFL > 0) {
      const coins = FLOWER_SEED_COIN_COSTS[seedName];
      const value = coins / rates.coinsPerSFL;
      if (trace) return emit(trace, { item: itemName, method: "flower", formula: `${seedName} seed: ${coins}c / ${rates.coinsPerSFL.toFixed(0)} c/SFL`, value });
      return value;
    }
  }

  // Treasure sell prices (coins → SFL, with boosts: Treasure Map +20%, Camel +30%)
  if (typeof TREASURE_SELL_PRICES !== "undefined" && TREASURE_SELL_PRICES[itemName] && rates && rates.coinsPerSFL > 0) {
    const tb = rates.treasureBoost || 1;
    const coins = TREASURE_SELL_PRICES[itemName];
    const value = (coins * tb) / rates.coinsPerSFL;
    if (trace) return emit(trace, { item: itemName, method: "treasure", formula: `${coins}c × ${tb.toFixed(2)} boost / ${rates.coinsPerSFL.toFixed(0)} c/SFL`, value });
    return value;
  }

  // Fish/food XP-based pricing (sflPerXP from bumpkin best cooking recipe)
  if (typeof ITEM_XP_VALUES !== "undefined" && ITEM_XP_VALUES[itemName] && rates && rates.sflPerXP > 0) {
    const xp = ITEM_XP_VALUES[itemName];
    const value = xp * rates.sflPerXP;
    if (trace) return emit(trace, { item: itemName, method: "XP value", formula: `${xp} XP × ${rates.sflPerXP.toFixed(6)} SFL/XP`, value });
    return value;
  }

  // Giant item coin sell prices
  if (typeof GIANT_ITEM_COIN_PRICES !== "undefined" && GIANT_ITEM_COIN_PRICES[itemName] && rates && rates.coinsPerSFL > 0) {
    const coins = GIANT_ITEM_COIN_PRICES[itemName];
    const value = coins / rates.coinsPerSFL;
    if (trace) return emit(trace, { item: itemName, method: "giant", formula: `${coins}c / ${rates.coinsPerSFL.toFixed(0)} c/SFL`, value });
    return value;
  }

  // Omnifeed: costs 1 Gem
  if (itemName === "Omnifeed") {
    const gemsPerSFL = rates?.gemsPerSFL || 0;
    if (gemsPerSFL > 0) {
      const value = 1 / gemsPerSFL;
      if (trace) return emit(trace, { item: itemName, method: "gem", formula: `1 gem / ${gemsPerSFL.toFixed(4)} gems/SFL`, value });
      return value;
    }
  }

  // Crustaceans (pot + chum cost from CRUSTACEAN_RECIPES)
  if (typeof CRUSTACEAN_RECIPES !== "undefined" && CRUSTACEAN_RECIPES[itemName]) {
    const cr = CRUSTACEAN_RECIPES[itemName];
    const kids = trace ? [] : undefined;
    const potPrice = itemMarketValue(cr.pot, p2pPrices, visited, rates, kids);
    let chumCost = 0;
    let chumLabel = trace ? "" : undefined;
    if (cr.chum && cr.qty > 0) {
      const chumPrice = itemMarketValue(cr.chum, p2pPrices, visited, rates, kids);
      chumCost = chumPrice * cr.qty;
      if (trace) chumLabel = ` + ${cr.qty} × ${cr.chum} @ ${chumPrice.toFixed(5)}`;
      if (cr.alt) {
        const altParts = cr.alt.match(/^(.+?)\s*x(\d+)$/);
        if (altParts) {
          const altPrice = itemMarketValue(altParts[1], p2pPrices, visited, rates, kids);
          const altCost = altPrice * parseInt(altParts[2]);
          if (altCost > 0 && (chumCost <= 0 || altCost < chumCost)) {
            chumCost = altCost;
            if (trace) chumLabel = ` + ${altParts[2]} × ${altParts[1]} @ ${altPrice.toFixed(5)} (alt)`;
          }
        }
      }
    }
    if (potPrice > 0) {
      const value = potPrice + chumCost;
      if (trace) return emit(trace, { item: itemName, method: "crustacean", formula: `${cr.pot} @ ${potPrice.toFixed(5)}${chumLabel}`, value, steps: kids });
      return value;
    }
  }

  // Mark: fixed 0.01 SFL (from treasury/faction shop)
  if (itemName === "Mark") {
    if (trace) return emit(trace, { item: itemName, method: "mark", formula: "fixed 0.01 SFL", value: 0.01 });
    return 0.01;
  }

  // Acorn: opportunity cost = best pet resource SFL/energy ratio * 100 energy
  if (itemName === "Acorn" && typeof PET_FETCH_DATA !== "undefined") {
    let bestRatio = 0;
    let bestRes = trace ? "" : undefined;
    for (const entries of Object.values(PET_FETCH_DATA)) {
      for (const e of entries) {
        if (e.res === "Acorn") continue;
        const p = p2pPrices[e.res] || 0;
        if (p > 0) {
          const ratio = p / e.energy;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            if (trace) bestRes = e.res;
          }
        }
      }
    }
    if (bestRatio > 0) {
      const value = bestRatio * 100;
      if (trace) return emit(trace, { item: itemName, method: "acorn", formula: `best pet ratio ${bestRes} @ ${bestRatio.toFixed(5)}/energy × 100 energy`, value });
      return value;
    }
  }

  // Fish Market recipes (season-dependent: Crab Stick, Fish Flake, Fish Stick, Fish Oil)
  if (typeof FISH_MARKET_RECIPES !== "undefined" && FISH_MARKET_RECIPES[itemName]) {
    const seasonRecipes = FISH_MARKET_RECIPES[itemName];
    const s = rates?.season || "";
    const recipe = seasonRecipes[s] || Object.values(seasonRecipes)[0];
    if (recipe) {
      let total = 0;
      const kids = trace ? [] : undefined;
      const parts = trace ? [] : undefined;
      for (const [ing, qty] of Object.entries(recipe)) {
        const p = itemMarketValue(ing, p2pPrices, visited, rates, kids);
        total += p * qty;
        if (trace) parts.push(`${qty} × ${ing} @ ${p.toFixed(5)}`);
      }
      if (total > 0) {
        if (trace) return emit(trace, { item: itemName, method: "fish market", formula: parts.join(" + "), value: total, steps: kids });
        return total;
      }
    }
  }

  // Compost products (Sprout Mix, Fruitful Blend, Rapid Root, Earthworm, Grub, Red Wiggler)
  if (typeof COMPOST_RECIPES !== "undefined") {
    for (const [composter, data] of Object.entries(COMPOST_RECIPES)) {
      if (data.outputs[itemName] !== undefined) {
        const s = rates?.season || "";
        const inputs = data.inputs[s] || Object.values(data.inputs)[0];
        let batchCost = 0;
        const kids = trace ? [] : undefined;
        const parts = trace ? [] : undefined;
        for (const [ing, qty] of Object.entries(inputs)) {
          const p = itemMarketValue(ing, p2pPrices, visited, rates, kids);
          batchCost += p * qty;
          if (trace) parts.push(`${qty} × ${ing} @ ${p.toFixed(5)}`);
        }
        const totalUnits = Object.values(data.outputs).reduce((sum, q) => sum + q, 0);
        if (batchCost > 0 && totalUnits > 0) {
          const value = batchCost / totalUnits;
          if (trace) return emit(trace, { item: itemName, method: "compost", formula: `(${parts.join(" + ")}) / ${totalUnits} units`, value, steps: kids });
          return value;
        }
      }
    }
  }

  if (trace) return emit(trace, { item: itemName, method: "unpriced", formula: "no derivation available", value: 0 });
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
//
// Returns {price, source}|null — that shape is unchanged by tracing. A null return means
// "unpriceable" and is never traced (there is no value to explain); every return that
// resolves to a real object records ONE trace node, when a sink is passed, describing how
// `price` was derived (value: result.price).
export function itemProductionCost(itemName, p2p, coinsPerSFL, skills, _seen, extras, trace) {
  _seen = _seen || new Set();
  if (_seen.has(itemName)) return null;
  _seen.add(itemName);

  // 0. Salt — derived from Salt Rake cost (20 coins + 3 Wood per harvest) / yield-per-rake
  if (itemName === "Salt") {
    const yieldPerRake = (extras && extras.saltYieldPerRake) || SALT_BASE_YIELD;
    const coinMult = (extras && typeof extras.saltRakeCoinMult === "number") ? extras.saltRakeCoinMult : 1;
    const coinSFL = coinsPerSFL > 0 ? (SALT_RAKE_COST.coins * coinMult) / coinsPerSFL : 0;
    let matSFL = 0;
    const matParts = trace ? [] : undefined;
    for (const [m, q] of Object.entries(SALT_RAKE_COST.materials)) {
      const mp = parseFloat(p2p[m]) || 0;
      matSFL += mp * q;
      if (trace) matParts.push(`${q} × ${m} @ ${mp.toFixed(5)}`);
    }
    const cost = (coinSFL + matSFL) / yieldPerRake;
    if (!(cost > 0)) return null;
    const result = { price: cost, source: "salt" };
    if (trace) emit(trace, { item: itemName, method: "salt rake", formula: `Salt Rake: (${SALT_RAKE_COST.coins}c × ${coinMult.toFixed(2)} / ${coinsPerSFL.toFixed(0)} c/SFL + ${matParts.join(" + ")}) / ${yieldPerRake} yield`, value: cost });
    return result;
  }

  // 1. Direct P2P
  const direct = parseFloat(p2p[itemName]) || 0;
  if (direct > 0) {
    const result = { price: direct, source: "P2P" };
    if (trace) emit(trace, { item: itemName, method: "market price", formula: "P2P", value: direct });
    return result;
  }

  // 2. Fish — for Aging Shed (extras.fishAsRod) treat as rod cost / yield-per-cast;
  //    otherwise use empirical fishing cost (rod + bait + chum / probability)
  if (FISH_DATA[itemName]) {
    if (extras && extras.fishAsRod) {
      const rod = computeRodCostSFL(p2p, coinsPerSFL, skills);
      const tier = FISH_TIER_MAP[itemName];
      const yieldByTier = (extras && extras.fishYieldByTier) || {};
      const yieldPerCast = (tier && yieldByTier[tier]) || 1;
      if (!(rod > 0)) return null;
      const result = { price: rod / yieldPerCast, source: "fish-rod" };
      if (trace) emit(trace, { item: itemName, method: "fish rod", formula: `rod ${rod.toFixed(5)} SFL / ${yieldPerCast} yield`, value: result.price });
      return result;
    }
    const fc = computeFishEffectiveCost(itemName, p2p, coinsPerSFL, skills);
    if (!fc) return null;
    const result = { price: fc.sfl, source: "fish", fc };
    if (trace) emit(trace, { item: itemName, method: "fish rod+bait", formula: `rod ${fc.rodSFL.toFixed(5)} + bait ${fc.baitSFL.toFixed(5)}${fc.chumCostPerCast ? ` + chum ${fc.chumCostPerCast.toFixed(5)}` : ""} / ${fc.prob} prob`, value: result.price });
    return result;
  }

  // 3. Worm-bait (Earthworm/Grub/Red Wiggler from COMPOST_RECIPES)
  if (BAIT_WORM_YIELD[itemName]) {
    const c = computeBaitCostSFL(itemName, p2p);
    if (!(c > 0)) return null;
    const result = { price: c, source: "bait" };
    if (trace) emit(trace, { item: itemName, method: "bait", formula: `avg composter cost / ${BAIT_WORM_YIELD[itemName]} worm yield`, value: c });
    return result;
  }

  // 3b. Fish Market processed (Fish Flake / Fish Stick / Fish Oil / Crab Stick)
  if (typeof FISH_MARKET_RECIPES !== "undefined" && FISH_MARKET_RECIPES[itemName]) {
    const seasonRecipes = FISH_MARKET_RECIPES[itemName];
    // Use cheapest season (best player can do)
    let bestCost = null;
    let bestFormula = trace ? null : undefined;
    let bestKids;
    for (const s of Object.keys(seasonRecipes)) {
      const recipe = seasonRecipes[s];
      let total = 0, missing = false;
      const seasonKids = trace ? [] : undefined;
      const parts = trace ? [] : undefined;
      for (const [sub, q] of Object.entries(recipe)) {
        const r = itemProductionCost(sub, p2p, coinsPerSFL, skills, _seen, extras, seasonKids);
        if (!r) { missing = true; break; }
        total += r.price * q;
        if (trace) parts.push(`${q} × ${sub} @ ${r.price.toFixed(5)}`);
      }
      if (!missing && (bestCost == null || total < bestCost)) {
        bestCost = total;
        if (trace) { bestFormula = `${s}: ${parts.join(" + ")}`; bestKids = seasonKids; }
      }
    }
    if (bestCost == null) return null;
    const result = { price: bestCost, source: "fish-market" };
    if (trace) emit(trace, { item: itemName, method: "fish market", formula: bestFormula, value: bestCost, steps: bestKids });
    return result;
  }

  // 4. Recipe ingredient (chained recipes like Cabbers n Mash → Mashed Potato)
  const recipe = COOKING_INGREDIENTS[itemName];
  if (recipe) {
    let total = 0;
    const kids = trace ? [] : undefined;
    const parts = trace ? [] : undefined;
    for (const [sub, q] of Object.entries(recipe)) {
      const r = itemProductionCost(sub, p2p, coinsPerSFL, skills, _seen, extras, kids);
      if (!r) return null;
      total += r.price * q;
      if (trace) parts.push(`${q} × ${sub} @ ${r.price.toFixed(5)}`);
    }
    const result = { price: total, source: "recipe" };
    if (trace) emit(trace, { item: itemName, method: "cooking recipe", formula: parts.join(" + "), value: total, steps: kids });
    return result;
  }

  // 5. Crafted ingredient (Cheese, Kernel Blend, Hay, etc.)
  if (typeof CRAFTED_INGREDIENT_RECIPES !== "undefined" && CRAFTED_INGREDIENT_RECIPES[itemName]) {
    const recipe = CRAFTED_INGREDIENT_RECIPES[itemName];
    let total = 0;
    const kids = trace ? [] : undefined;
    const parts = trace ? [] : undefined;
    for (const [sub, q] of Object.entries(recipe)) {
      const r = itemProductionCost(sub, p2p, coinsPerSFL, skills, _seen, extras, kids);
      if (!r) return null;
      total += r.price * q;
      if (trace) parts.push(`${q} × ${sub} @ ${r.price.toFixed(5)}`);
    }
    const result = { price: total, source: "crafted" };
    if (trace) emit(trace, { item: itemName, method: "crafted recipe", formula: parts.join(" + "), value: total, steps: kids });
    return result;
  }

  // 6. Crustacean (Blue Crab, Lobster, etc. via Crab Pot + chum)
  if (typeof CRUSTACEAN_RECIPES !== "undefined" && CRUSTACEAN_RECIPES[itemName]) {
    const cr = CRUSTACEAN_RECIPES[itemName];
    // Pot price (one-time setup, but treat as per-catch since we lack pot-cycle accounting)
    let total = 0;
    const kids = trace ? [] : undefined;
    let chumLabel = trace ? "" : undefined;
    if (cr.chum && cr.qty > 0) {
      const chumR = itemProductionCost(cr.chum, p2p, coinsPerSFL, skills, _seen, extras, kids);
      if (chumR) {
        total += chumR.price * cr.qty;
        if (trace) chumLabel = `${cr.qty} × ${cr.chum} @ ${chumR.price.toFixed(5)}`;
      }
      // Try cheaper alternate chum
      if (cr.alt) {
        const altMatch = cr.alt.match(/^(.+?)\s*x(\d+)$/);
        if (altMatch) {
          const altR = itemProductionCost(altMatch[1], p2p, coinsPerSFL, skills, _seen, extras, kids);
          if (altR) {
            const altCost = altR.price * parseInt(altMatch[2]);
            if (altCost > 0 && (total <= 0 || altCost < total)) {
              total = altCost;
              if (trace) chumLabel = `${altMatch[2]} × ${altMatch[1]} @ ${altR.price.toFixed(5)} (alt)`;
            }
          }
        }
      }
    }
    if (!(total > 0)) return null;
    const result = { price: total, source: "crustacean" };
    if (trace) emit(trace, { item: itemName, method: "crustacean", formula: chumLabel || "no priceable chum", value: total, steps: kids });
    return result;
  }

  // 7. Treasure / coin-priced items (Crab, Sea Cucumber, etc. → coins / coinsPerSFL)
  if (typeof TREASURE_SELL_PRICES !== "undefined" && TREASURE_SELL_PRICES[itemName] && coinsPerSFL > 0) {
    const coins = TREASURE_SELL_PRICES[itemName];
    const value = coins / coinsPerSFL;
    const result = { price: value, source: "treasure" };
    if (trace) emit(trace, { item: itemName, method: "treasure", formula: `${coins}c / ${coinsPerSFL.toFixed(0)} c/SFL`, value });
    return result;
  }

  // 8. Generic fish XP-based fallback (if not in FISH_DATA but in ITEM_XP_VALUES)
  // Note: this is a heuristic — uses opportunity cost from XP value.
  // Skipped here since it requires sflPerXP rate which we don't have at call-time.

  return null;
}

// SFL cost per worm-bait, averaged across seasons (uses existing COMPOST_RECIPES)
export function computeBaitCostSFL(baitName, p2pPrices) {
  const data = Object.values(COMPOST_RECIPES || {}).find(d => d.outputs && d.outputs[baitName] !== undefined);
  if (!data) return 0;
  const seasons = Object.keys(data.inputs);
  let total = 0, n = 0;
  for (const s of seasons) {
    let seasonCost = 0, missing = false;
    for (const [ing, qty] of Object.entries(data.inputs[s])) {
      const p = p2pPrices[ing] || 0;
      if (p === 0) { missing = true; break; }
      seasonCost += p * qty;
    }
    if (!missing) { total += seasonCost; n++; }
  }
  if (n === 0) return 0;
  const avgComposterCost = total / n;
  const wormYield = BAIT_WORM_YIELD[baitName] || 1;
  return avgComposterCost / wormYield;
}

// SFL rod cost per cast — Reel Deal skill applies to COIN part only (skill text: "-50% rod coin cost")
export function computeRodCostSFL(p2pPrices, coinsPerSFL, skills) {
  const reelDealCoinMult = (skills && skills["Reel Deal"]) ? 0.5 : 1;
  const coinSFL = coinsPerSFL > 0 ? (FISHING_ROD_COST.coins * reelDealCoinMult) / coinsPerSFL : 0;
  let matSFL = 0;
  for (const [m, q] of Object.entries(FISHING_ROD_COST.materials)) {
    matSFL += (p2pPrices[m] || 0) * q;
  }
  return coinSFL + matSFL;
}

// Effective SFL cost per 1 fish: cheapest of all paths (no-chum vs guaranteed-chum).
// Each path: per-cast cost (rod + bait + optional chum*qty) / prob.
// Empirical no-chum probs from sfl.world; guaranteed-chum prob = 1.0 (likes mechanic).
export function computeFishEffectiveCost(fishName, p2pPrices, coinsPerSFL, skills) {
  const fd = FISH_DATA[fishName];
  if (!fd || !fd.paths || fd.paths.length === 0) return null;
  const rodSFL = computeRodCostSFL(p2pPrices, coinsPerSFL, skills);

  let best = null;
  for (const p of fd.paths) {
    const baitSFL = computeBaitCostSFL(p.bait, p2pPrices);
    if (baitSFL <= 0) continue;
    const chumP = p.chum ? (p2pPrices[p.chum] || 0) : 0;
    if (p.chum && chumP <= 0) continue;  // can't price chum
    const chumCostPerCast = chumP * (p.chumQty || 0);
    const prob = p.chum ? 1.0 : (p.prob || 0);
    if (prob <= 0) continue;
    const costPerCast = rodSFL + baitSFL + chumCostPerCast;
    const sfl = costPerCast / prob;
    if (best === null || sfl < best.sfl) {
      best = { sfl, path: p, baitSFL, rodSFL, chumCostPerCast, prob, useChum: !!p.chum };
    }
  }
  if (!best) return null;
  // Backwards-compat shape: expose fd-like fields used by detail card
  return {
    sfl: best.sfl,
    useChum: best.useChum,
    fd: { bait: best.path.bait, chum: best.path.chum || null, chumQty: best.path.chumQty || 0 },
    baitSFL: best.baitSFL,
    rodSFL: best.rodSFL,
    chumCostPerCast: best.chumCostPerCast,
    prob: best.prob,
  };
}
