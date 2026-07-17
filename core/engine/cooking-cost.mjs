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
// The optional `trace` sink (an array) makes this EXPLAIN as it computes: when present it
// pushes one {item, method, formula, value, unit, steps} node — the recipe cost as
// Σ (qty × ingredient production cost) — each ingredient step carrying itemProductionCost's
// OWN derivation as its child, so crafted ingredients expand. Absent, value/behaviour are
// unchanged. Mirrors the opt-in trace in item-value.mjs and cooking.mjs.
export function computeRecipeCost(recipeName, p2p, coinsPerSFL, skills, extras, trace) {
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
  const parts = trace ? [] : null;
  const kids = trace ? [] : null;
  for (const [itemName, qty] of Object.entries(ingredients)) {
    const ingTrace = trace ? [] : undefined;
    const r = itemProductionCost(itemName, p2p, coinsPerSFL, skills, undefined, extras, ingTrace);
    if (r) {
      const cost = r.price * qty;
      total += cost;
      items.push({ name: itemName, qty, price: r.price, cost, source: r.source, fc: r.fc });
      if (trace) {
        parts.push(`${qty} × ${itemName} @ ${r.price.toFixed(5)}`);
        kids.push({ item: itemName, method: "ingredient", formula: `${qty} × @ ${r.price.toFixed(5)}`, value: cost, unit: "SFL", steps: ingTrace });
      }
    } else {
      hasUnpriced = true;
      items.push({ name: itemName, qty, price: 0, cost: 0, selfProduced: true });
      if (trace) {
        parts.push(`${itemName} (self)`);
        kids.push({ item: itemName, method: "ingredient", formula: "self-produced (unpriced)", value: 0, unit: "SFL" });
      }
    }
  }
  if (trace) trace.push({ item: recipeName, method: "recipe cost", formula: parts.join(" + "), value: total, unit: "SFL", steps: kids });
  return { total, items, hasUnpriced };
}
