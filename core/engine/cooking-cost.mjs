import { findCollectible, isWearableEquipped } from "../derive/items.mjs";
import { COOKING_INGREDIENTS, COOKING_RECIPES_DATA, SALT_BASE_YIELD } from "../data/cooking.mjs";
import { itemProductionCost } from "./item-value.mjs";

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
    const r = itemProductionCost(itemName, p2p, coinsPerSFL, skills, undefined, extras);
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
