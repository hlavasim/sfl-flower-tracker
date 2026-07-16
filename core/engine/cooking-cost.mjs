import { findCollectible, isWearableEquipped } from "../derive/items.mjs";
import { COOKING_INGREDIENTS, COOKING_RECIPES_DATA, SALT_RAKE_COST, SALT_BASE_YIELD } from "../data/cooking.mjs";
import { FISHING_ROD_COST, FISH_DATA, FISH_TIER_MAP, BAIT_WORM_YIELD, FISH_MARKET_RECIPES } from "../data/fishing.mjs";
import { CRAFTED_INGREDIENT_RECIPES, COMPOST_RECIPES, CRUSTACEAN_RECIPES, TREASURE_SELL_PRICES } from "../data/crafting.mjs";

export function computeSaltYieldPerRake(farm) {
  let y = SALT_BASE_YIELD;
  const skills = farm?.bumpkin?.skills || {};
  if (skills["Wide Rakes"]) y += 2;
  try { if (farm && isWearableEquipped(farm, "Deep Sea Salt Cave Background")) y += 5; } catch {}
  return y;
}

// Salt Rake coin-cost multiplier — Cheap Rakes (-20%) + Salt Sculpture L4+ (-10%), multiplicative
export function computeSaltRakeCoinMult(farm) {
  const skills = farm?.bumpkin?.skills || {};
  const lvl = farm?.sculptures?.["Salt Sculpture"]?.level || 0;
  let m = 1;
  if (skills["Cheap Rakes"]) m *= 0.80;
  if (lvl >= 4) m *= 0.90;
  return m;
}

// Expected fish per cast for a given tier — accounts for +1 yield collectibles & skills
export function computeFishYieldPerCast(farm, tier) {
  let y = 1; // base
  const skills = farm?.bumpkin?.skills || {};
  const season = (farm?.season?.season || "").toLowerCase();
  const has = (n) => findCollectible(farm, n).length > 0;
  // Always-on
  if (has("Walrus")) y += 1;
  // Seasonal +1 fish collectibles
  if (season === "spring" && has("Pink Dolphin")) y += 1;
  if (season === "summer" && has("Jellyfish")) y += 1;
  if (season === "autumn" && has("Poseidon")) y += 1;
  if (season === "winter" && has("Super Star")) y += 1;
  // Tier-specific chance boosts (expected value)
  if (tier === "basic") {
    if (has("Alba")) y += 0.5;                 // 50% chance +1 basic
    if (skills["Fishy Chance"]) y += 0.10;     // 10% chance +1 basic
  } else if (tier === "advanced") {
    if (skills["Fishy Roll"]) y += 0.10;       // 10% chance +1 advanced
  } else if (tier === "expert") {
    if (skills["Fishy Gamble"]) y += 0.20;     // 20% chance +1 expert
  }
  return y;
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

// Recursive ingredient SFL resolver — returns {price, source} or null if unknown.
// Resolution order: P2P → FISH_DATA → bait worm → COOKING_INGREDIENTS recursion → CRAFTED_INGREDIENT_RECIPES → null
function _resolveItemSfl(itemName, p2p, coinsPerSFL, skills, _seen, extras) {
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
        const r = _resolveItemSfl(sub, p2p, coinsPerSFL, skills, _seen, extras);
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
      const r = _resolveItemSfl(sub, p2p, coinsPerSFL, skills, _seen, extras);
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
      const r = _resolveItemSfl(sub, p2p, coinsPerSFL, skills, _seen, extras);
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
      const chumR = _resolveItemSfl(cr.chum, p2p, coinsPerSFL, skills, _seen, extras);
      if (chumR) total += chumR.price * cr.qty;
      // Try cheaper alternate chum
      if (cr.alt) {
        const altMatch = cr.alt.match(/^(.+?)\s*x(\d+)$/);
        if (altMatch) {
          const altR = _resolveItemSfl(altMatch[1], p2p, coinsPerSFL, skills, _seen, extras);
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

// Compute total SFL cost per cook (resolves fish, bait, chained recipes recursively)
// Returns: { total, items, hasUnpriced } where items[i] = { name, qty, price, cost, source, selfProduced? }
export function computeRecipeCost(recipeName, p2p, coinsPerSFL, skills, extras) {
  if (!p2p) return null;
  const ingredients = COOKING_INGREDIENTS[recipeName];
  if (!ingredients) return null;
  let total = 0;
  const items = [];
  let hasUnpriced = false;
  coinsPerSFL = coinsPerSFL || 0;
  skills = skills || {};
  // Auto-derive extras for Aging Shed recipes (fish counted as rod cost)
  const _recData = COOKING_RECIPES_DATA[recipeName];
  if (_recData && _recData.building === "Aging Shed") {
    extras = Object.assign({ fishAsRod: true }, extras || {});
  }
  for (const [itemName, qty] of Object.entries(ingredients)) {
    const r = _resolveItemSfl(itemName, p2p, coinsPerSFL, skills, undefined, extras);
    if (r) {
      const cost = r.price * qty;
      total += cost;
      items.push({ name: itemName, qty, price: r.price, cost, source: r.source, fc: r.fc });
    } else {
      hasUnpriced = true;
      items.push({ name: itemName, qty, price: 0, cost: 0, selfProduced: true });
    }
  }
  return { total, items, hasUnpriced };
}
