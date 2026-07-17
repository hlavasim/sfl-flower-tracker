import { COOKING_INGREDIENTS } from "../data/cooking.mjs";
import {
  SEED_COSTS, EXOTIC_CROPS_TICKET_COST, GIANT_FRUIT_SELL_PRICES, TOOL_COSTS,
  FLOWER_SEED_COIN_COSTS, ITEM_XP_VALUES, GIANT_ITEM_COIN_PRICES,
} from "../data/economy.mjs";
import { FLOWER_RECIPES, DOLL_RECIPES, RECIPE_INGREDIENTS } from "../data/recipes.mjs";
import { CRAFTED_INGREDIENT_RECIPES, TREASURE_SELL_PRICES, COMPOST_RECIPES, CRUSTACEAN_RECIPES } from "../data/crafting.mjs";
import { FISH_MARKET_RECIPES, FISH_DATA, FISH_TIER_MAP, BAIT_WORM_YIELD } from "../data/fishing.mjs";
import { itemMarketValue, itemProductionCost } from "../engine/item-value.mjs";
import { computeSaltYieldPerRake, computeSaltRakeCoinMult, computeFishYieldPerCast } from "../engine/cooking-cost.mjs";

// Every item-name-keyed table item-value.mjs's two resolvers dispatch on directly.
// COMPOST_RECIPES is deliberately excluded here — its top-level keys are composter
// names ("Compost Bin"), not items; its items are the nested `.outputs` (handled below).
const ITEM_KEYED_TABLES = [
  COOKING_INGREDIENTS, RECIPE_INGREDIENTS, FLOWER_RECIPES, DOLL_RECIPES,
  CRAFTED_INGREDIENT_RECIPES, TREASURE_SELL_PRICES, CRUSTACEAN_RECIPES,
  FISH_MARKET_RECIPES, FISH_DATA, FISH_TIER_MAP, BAIT_WORM_YIELD,
  TOOL_COSTS, EXOTIC_CROPS_TICKET_COST, GIANT_FRUIT_SELL_PRICES,
  FLOWER_SEED_COIN_COSTS, ITEM_XP_VALUES, GIANT_ITEM_COIN_PRICES, SEED_COSTS,
];

// item-value.mjs's two resolvers also price some items through hardcoded
// `itemName === "X"` branches that have no table backing at all — grep item-value.mjs
// for `itemName === "` to see them. Those names can never enter the universe via
// ITEM_KEYED_TABLES/COMPOST_RECIPES, and must not rely on the live P2P market
// happening to also trade them (Salt used to "work" only because the fixture p2p
// data includes it — an empty/different market would have silently dropped it too).
// So they are listed here explicitly. tests/core/price-universe-drift.test.mjs scans
// item-value.mjs by regex for every `itemName === "..."` literal and fails if this
// list falls out of sync with the branches that actually exist there — do not let
// this list and that file's branches drift apart.
const HARDCODED_BRANCH_ITEM_NAMES = [
  "Barn Delight", "Love Charm", "Omnifeed", "Mark", "Acorn", "Salt",
];

// Some resolver branches accept an item under a SUFFIXED alias and strip it before
// looking up the base table. item-value.mjs's SEED_COSTS branch prices "Pumpkin Seed"
// and "Pumpkin Plant" by stripping " Seed"/" Plant" and reading SEED_COSTS["Pumpkin"].
// The base table's keys ("Pumpkin") are already unioned via ITEM_KEYED_TABLES, but the
// ALIAS forms the caller actually passes ("Pumpkin Seed") are not — so the map had no
// entry for them and dashboard chore costs (which query "<crop> Seed") silently read 0.
// Generate both alias forms for every SEED_COSTS key. tests/core/price-universe-drift.test.mjs
// pins that these suffixes match the branch in item-value.mjs.
const SEED_ALIAS_SUFFIXES = [" Seed", " Plant"];

// Unions the keys of every core/data table the resolvers can key an item by, the
// hardcoded-branch names above, plus the live P2P market's own keys (items priced
// ONLY on the market, e.g. Tuna, Rod).
export function buildItemUniverse(prices) {
  const names = new Set();
  for (const table of ITEM_KEYED_TABLES) {
    for (const name of Object.keys(table)) names.add(name);
  }
  for (const data of Object.values(COMPOST_RECIPES)) {
    for (const name of Object.keys(data.outputs)) names.add(name);
  }
  for (const name of HARDCODED_BRANCH_ITEM_NAMES) names.add(name);
  // Seed/Plant aliases: the resolver prices "<crop> Seed"/"<crop> Plant" via SEED_COSTS[<crop>].
  for (const crop of Object.keys(SEED_COSTS)) {
    for (const suffix of SEED_ALIAS_SUFFIXES) names.add(crop + suffix);
  }
  for (const name of Object.keys(prices || {})) names.add(name);
  return names;
}

// settings = { coinsPerSFL?, ...anyOtherRate } — forwarded VERBATIM as `rates` to
// itemMarketValue, so it is not limited to coinsPerSFL: sflPerXP, treasureBoost,
// gemsPerSFL, season all reach the resolver the same way (item-value.mjs reads them off
// `rates.*`). This is how api/compute.mjs's `?rates=` query param takes effect for
// section=prices — it is merged into `settings` before this function runs. Only
// `coinsPerSFL` is also read directly below, for productionCost, which takes a bare
// number rather than a rates object. Absent extra fields reproduces today's map
// byte-for-byte (the existing tests pin this) — nothing about that contract changed.
// prices = p2p price map (sfl.world/api/v1/prices .data.p2p), or {} if unavailable.
export function buildPricesSection(farm, prices = {}, settings = {}) {
  const p2p = prices || {};
  const coinsPerSFL = settings.coinsPerSFL || 0;
  const skills = farm?.bumpkin?.skills || {};
  // Mirrors core/sections/cooking.mjs — these depend only on `farm`, not on the
  // item being priced, so computed once and reused across the whole universe.
  const extras = {
    saltYieldPerRake: computeSaltYieldPerRake(farm),
    saltRakeCoinMult: computeSaltRakeCoinMult(farm),
    fishYieldByTier: {
      basic: computeFishYieldPerCast(farm, "basic"),
      advanced: computeFishYieldPerCast(farm, "advanced"),
      expert: computeFishYieldPerCast(farm, "expert"),
    },
  };
  const universe = buildItemUniverse(p2p);
  const marketValue = {};
  const productionCost = {};
  for (const name of universe) {
    // Absence means "cannot price" — 0/null must NOT be written as 0, or a
    // consumer could not tell "unpriced" from "free".
    const mv = itemMarketValue(name, p2p, null, settings);
    if (mv > 0) marketValue[name] = mv;
    const pc = itemProductionCost(name, p2p, coinsPerSFL, skills, undefined, extras);
    if (pc && pc.price > 0) productionCost[name] = pc.price;
  }
  return { marketValue, productionCost };
}
