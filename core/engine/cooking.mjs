import { hasItem, hasAny, findCollectible } from "../derive/items.mjs";
import { dashHasVipAccess } from "./gifts-deliveries.mjs";
import { BUD_AURA_MULTIPLIERS } from "./buds.mjs";
import {
  COOKING_RECIPES_DATA, COOKING_INGREDIENTS, FISH_COOKABLE_NAMES, COOKABLE_CAKES, PRIME_AGED_FISH_XP,
} from "../data/cooking.mjs";

const AGING_PRIME_BASE = 0.10, AGING_PRIME_MULT = 1.3;   // from flowers.html:4861

// Per-farm prime-aged chance (0..1). Mirrors getPrimeAgedChance in the SFL repo.
export function getAgingPrimeChance(farm) {
  const skills = farm?.bumpkin?.skills || {};
  const saltSculptLvl = farm?.sculptures?.["Salt Sculpture"]?.level || 0;
  let chance = AGING_PRIME_BASE * 100;  // percent
  if (skills["Fish Smoking"]) chance *= 2;       // ×2  → 20
  if (saltSculptLvl >= 2) chance += 4;            // +4% → 14 / 24
  return chance / 100;
}
export function getAgingPrimeFactor(farm) {
  return 1 + getAgingPrimeChance(farm) * (AGING_PRIME_MULT - 1);
}

/**
 * FISH_CONSUMABLES membership (types/consumables.ts:1457-1470) for anything the cooking engine
 * values: the fish dishes, the instant fish recipes, and every Aged / Prime Aged fish. The fish
 * XP boosts (Skill Shrimpy, Fishy Feast, Luminous Anglerfish Topper, the Port bud) key on this
 * set — not on the Aging Shed, which is only a part of it.
 */
export function isFishConsumable(name) {
  return FISH_COOKABLE_NAMES.includes(name) || /^(Prime )?Aged /.test(name);
}

// isFoodMadeWithCheese (expansion/lib/boosts.ts:55-58): Cheese is a DIRECT ingredient.
const CHEESE_RECIPES = Object.keys(COOKING_INGREDIENTS).filter((n) => (COOKING_INGREDIENTS[n] || {}).Cheese > 0);

// Faction week key — getWeekKey (lib/factions.ts:22-47), weeks counted from START_DATE (:15).
const FACTION_START_MS = Date.UTC(2024, 5, 24);
export function factionWeekKey(ms) {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  const week = Math.floor(Math.floor((d.getTime() - FACTION_START_MS) / 86400000) / 7);
  return new Date(FACTION_START_MS + week * 7 * 86400000).toISOString().slice(0, 10);
}

// BUILDING_OIL_BOOSTS (events/landExpansion/cook.ts:48-55): the share of a recipe's time an
// oiled building takes off, with the three skills that raise it.
function buildingOilBoost(skills, building) {
  const t = {
    "Fire Pit": skills["Swift Sizzle"] ? 0.4 : 0.2,
    "Kitchen": skills["Turbo Fry"] ? 0.5 : 0.25,
    "Smoothie Shack": 0.3,
    "Bakery": 0.35,
    "Deli": skills["Fry Frenzy"] ? 0.6 : 0.4,
  };
  return t[building] || 0;
}

export function detectCookingBoosts(farm, settings = {}) {
  const skills = farm.bumpkin?.skills || {};
  const now = settings.now || Date.now();
  const xpBoosts = [];
  const timeBoosts = [];
  // Extra FOOD per cook (getCookingAmount, events/landExpansion/collectRecipe.ts:27-78) —
  // `extra` is the expected number of additional dishes, a certainty or a chance.
  const amountBoosts = [];

  // === XP BOOSTS === (getFoodExpBoost, expansion/lib/boosts.ts:295-430)
  // Multipliers first; the flat Swiss Whiskers +500 is added after them, and the bud and the
  // faction-pet multipliers apply to the whole sum — so those two go last, in that order.
  if (skills["Munching Mastery"]) xpBoosts.push({ name: "Munching Mastery", multiplier: 1.05 });
  if (skills["Juicy Boost"]) xpBoosts.push({ name: "Juicy Boost", multiplier: 1.1, buildings: ["Smoothie Shack"] });
  if (skills["Drive-Through Deli"]) xpBoosts.push({ name: "Drive-Through Deli", multiplier: 1.15, buildings: ["Deli"] });
  if (skills["Buzzworthy Treats"]) xpBoosts.push({ name: "Buzzworthy Treats", multiplier: 1.1, honeyOnly: true });
  // Items (check both collectibles + wearables)
  if (hasItem(farm, "Golden Spatula")) xpBoosts.push({ name: "Golden Spatula", multiplier: 1.1 });
  if (hasItem(farm, "Pan")) xpBoosts.push({ name: "Pan (+25% Bumpkin XP)", multiplier: 1.25 });
  if (hasItem(farm, "Observatory")) xpBoosts.push({ name: "Observatory", multiplier: 1.05 });
  if (hasItem(farm, "Blossombeard")) xpBoosts.push({ name: "Blossombeard", multiplier: 1.1 });
  // Cakes (+ Pirate Cake) only, not everything the Bakery makes — boosts.ts:347-353.
  if (hasItem(farm, "Grain Grinder")) xpBoosts.push({ name: "Grain Grinder", multiplier: 1.2, foods: COOKABLE_CAKES.concat(["Pirate Cake"]) });
  // VIP x1.1 — hasVipAccess (lib/vipAccess.ts:11-32): trial, paid expiry OR the Lifetime Farmer
  // Banner. Detecting only the banner missed every paid/trial VIP.
  if (dashHasVipAccess(farm, now)) xpBoosts.push({ name: "VIP Access", multiplier: 1.1 });
  // Hungry Hare x2 on Fermented Carrots only — boosts.ts:377-383.
  if (findCollectible(farm, "Hungry Hare").length > 0) xpBoosts.push({ name: "Hungry Hare", multiplier: 2, foods: ["Fermented Carrots"] });

  // === PET STREAK — getFactionPetBoostMultiplier (lib/factions.ts:582-611) ===
  // The multiplier comes from LAST week's collective-pet streak, and pays only if the farm
  // qualified (fed every request of last week — faction.pet.qualifiesForBoost, set at rollover)
  // and is not in a faction-switch cooldown. Reading the newest history week and the previous
  // week's petXP was a week late and keyed on the wrong flag.
  const faction = farm.faction || {};
  const factionHistory = faction.history || {};
  const weekKey = factionWeekKey(now);
  const lastWeekKey = factionWeekKey(Date.parse(weekKey + "T00:00:00Z") - 7 * 86400000);
  const lastWeekStreak = factionHistory[lastWeekKey]?.collectivePet?.streak || 0;
  const currentStreak = factionHistory[weekKey]?.collectivePet?.streak || 0;
  const streakMultiplier = lastWeekStreak >= 8 ? 1.5 : lastWeekStreak >= 6 ? 1.3 : lastWeekStreak >= 4 ? 1.2 : lastWeekStreak >= 2 ? 1.1 : 1.0;
  const onCooldown = !!(faction.boostCooldownUntil && now < faction.boostCooldownUntil);
  const qualifies = faction.pet?.qualifiesForBoost === true;
  const thisWeekActive = !onCooldown && qualifies && streakMultiplier > 1;
  // Next week pays only if every one of THIS week's pet requests gets fed at least once
  // (qualifiesForFactionPetBoostFromPriorWeekRequests, lib/factionPetQualifiesForBoost.ts).
  const reqs = Array.isArray(faction.pet?.requests) ? faction.pet.requests : [];
  const nextWeekQualified = reqs.length > 0 && reqs.every((r) => Object.keys(r.dailyFulfilled || {}).length > 0);
  const weeksToMax = currentStreak >= 8 ? 0 : 8 - currentStreak;
  const manualPetStreak = !!settings.petSimulate;

  const petStreakInfo = { streak: lastWeekStreak, currentStreak, multiplier: streakMultiplier, thisWeekActive, qualifies, onCooldown, nextWeekQualified, weeksToMax, manualOverride: manualPetStreak };

  // === TIME BOOSTS === (getCookingTime, expansion/lib/boosts.ts:159-285)
  if (skills["Fast Feasts"]) timeBoosts.push({ name: "Fast Feasts", multiplier: 0.9, buildings: ["Fire Pit", "Kitchen"] });
  // Cakes only (item in COOKABLE_CAKES) — boosts.ts:279-283, not every Bakery recipe.
  if (skills["Frosted Cakes"]) timeBoosts.push({ name: "Frosted Cakes", multiplier: 0.9, foods: COOKABLE_CAKES });
  // Items
  if (hasItem(farm, "Luna's Hat")) timeBoosts.push({ name: "Luna's Hat", multiplier: 0.5, excludeBuildings: ["Aging Shed"] });
  if (hasItem(farm, "Desert Gnome")) timeBoosts.push({ name: "Desert Gnome", multiplier: 0.9, excludeBuildings: ["Aging Shed"] });
  if (hasAny(farm, "Nightshade Medallion")) timeBoosts.push({ name: "Nightshade Medallion", multiplier: 0.75, excludeBuildings: ["Aging Shed"] });
  if (hasAny(farm, "Master Chefs Cleaver", "Master Chef's Cleaver")) timeBoosts.push({ name: "Master Chefs Cleaver", multiplier: 0.85, excludeBuildings: ["Aging Shed"] });
  /*
   * Building oil — getCookingOilBoost (events/landExpansion/cook.ts:64-103): an oiled building
   * cooks in (1 - boost) of the time. Whether the owner keeps a building oiled is read from the
   * farm itself: `buildings[b][0].oil > 0` means oil is sitting in it now, i.e. they run it
   * oiled, and it is modelled at the full boost (the partial-oil branch of the game only bites
   * on the one cook that drains it). A dry building gets nothing.
   */
  for (const bd of ["Fire Pit", "Kitchen", "Bakery", "Deli", "Smoothie Shack"]) {
    const oiled = ((farm.buildings || {})[bd] || []).some((b) => (Number(b && b.oil) || 0) > 0);
    const boost = buildingOilBoost(skills, bd);
    if (oiled && boost > 0) timeBoosts.push({ name: "Building Oil", multiplier: +(1 - boost).toFixed(2), buildings: [bd] });
  }

  // === BONUS FOOD === (getCookingAmount, collectRecipe.ts:27-78)
  // Double Nom: +1 dish on every cook in a cooking building (cook.ts isCookingBuilding — not the
  // Aging Shed). It was modelled as half the cook TIME, which gives the same XP/day on its own but
  // multiplies wrongly with the chance-based extras below.
  if (skills["Double Nom"]) amountBoosts.push({ name: "Double Nom", extra: 1, excludeBuildings: ["Aging Shed"] });
  // Fiery Jackpot: 20% chance of +1 on the Fire Pit.
  if (skills["Fiery Jackpot"]) amountBoosts.push({ name: "Fiery Jackpot (20% +1)", extra: 0.2, buildings: ["Fire Pit"] });
  // Master Chef's Cleaver worn: 10% chance of +1 on any recipe.
  if (hasAny(farm, "Master Chefs Cleaver", "Master Chef's Cleaver")) amountBoosts.push({ name: "Master Chef's Cleaver (10% +1)", extra: 0.1, excludeBuildings: ["Aging Shed"] });

  // === AGING SHED BOOSTS ===
  const sculptures = farm.sculptures || {};
  const saltSculptLvl = sculptures["Salt Sculpture"]?.level || 0;
  // Time
  if (skills["Speedy Aging"]) timeBoosts.push({ name: "Speedy Aging", multiplier: 0.9, buildings: ["Aging Shed"] });
  if (saltSculptLvl >= 5) timeBoosts.push({ name: "Salt Sculpture L5+", multiplier: 0.95, buildings: ["Aging Shed"] });
  // Prime Aged weighted average. Base 10% chance of prime (×1.3 XP) → factor 1.03.
  // Fish Smoking doubles the chance (→ 20%); Salt Sculpture L2+ adds +4% (→ 14/24%).
  // Recipe XP is stored as the regular-aged value; this single boost folds in the
  // expected uplift from primes for the player's actual farm state. `primeAvg` marks it
  // as an EXPECTATION: banked fish are known to be regular or prime, so it skips them.
  {
    const _primePct = +(getAgingPrimeChance(farm) * 100).toFixed(0);
    const _primeFactor = getAgingPrimeFactor(farm);
    xpBoosts.push({
      name: "Prime Aged avg (" + _primePct + "% × 1.3 XP)",
      multiplier: _primeFactor,
      buildings: ["Aging Shed"],
      primeAvg: true,
    });
  }
  // Fish XP boosts — every FISH consumable (fish dishes and instant fish recipes as well as
  // Aged / Prime Aged fish): boosts.ts:320-328 (topper), :355-367 (Shrimpy, Fishy Feast).
  if (hasItem(farm, "Skill Shrimpy")) xpBoosts.push({ name: "Skill Shrimpy (+20% Fish XP)", multiplier: 1.20, fishOnly: true });
  if (skills["Fishy Feast"]) xpBoosts.push({ name: "Fishy Feast (+20% Fish XP)", multiplier: 1.20, fishOnly: true });
  // Marine Marvel Master milestone wearable. The game applies it to FISH_CONSUMABLES
  // (Aged + Prime Aged included) but only while WORN — hasItem's equipped check
  // (bumpkin or farm hand) is exactly isWearableActive; wardrobe ownership is not.
  if (hasItem(farm, "Luminous Anglerfish Topper")) xpBoosts.push({ name: "Luminous Anglerfish Topper (+50% Fish XP)", multiplier: 1.5, fishOnly: true });
  // Salt yield & rake-cost (informational — affect salt cost rather than recipe XP/time)
  if (skills["Wide Rakes"]) xpBoosts.push({ name: "Wide Rakes (+2 salt/rake)", multiplier: 1, buildings: ["Aging Shed"], salt: true });
  if (skills["Cheap Rakes"]) xpBoosts.push({ name: "Cheap Rakes (-20% rake coin cost)", multiplier: 1, buildings: ["Aging Shed"], salt: true });
  if (saltSculptLvl >= 4) xpBoosts.push({ name: "Salt Sculpture L4+ (-10% rake coin cost)", multiplier: 1, buildings: ["Aging Shed"], salt: true });
  // Fish-yield boosts (informational — affect fish/rod cost in Aged Fish recipes)
  const _season = (farm?.season?.season || "").toLowerCase();
  if (hasItem(farm, "Walrus")) xpBoosts.push({ name: "Walrus (+1 Fish)", multiplier: 1, buildings: ["Aging Shed"], salt: true });
  if (_season === "spring" && hasItem(farm, "Pink Dolphin")) xpBoosts.push({ name: "Pink Dolphin (+1 Fish, Spring)", multiplier: 1, buildings: ["Aging Shed"], salt: true });
  if (_season === "summer" && hasItem(farm, "Jellyfish")) xpBoosts.push({ name: "Jellyfish (+1 Fish, Summer)", multiplier: 1, buildings: ["Aging Shed"], salt: true });
  if (_season === "autumn" && hasItem(farm, "Poseidon")) xpBoosts.push({ name: "Poseidon (+1 Fish, Autumn)", multiplier: 1, buildings: ["Aging Shed"], salt: true });
  if (_season === "winter" && hasItem(farm, "Super Star")) xpBoosts.push({ name: "Super Star (+1 Fish, Winter)", multiplier: 1, buildings: ["Aging Shed"], salt: true });
  if (hasItem(farm, "Alba")) xpBoosts.push({ name: "Alba (+0.5 expected Basic Fish)", multiplier: 1, buildings: ["Aging Shed"], salt: true });
  if (skills["Fishy Chance"]) xpBoosts.push({ name: "Fishy Chance (+0.1 expected Basic)", multiplier: 1, buildings: ["Aging Shed"], salt: true });
  if (skills["Fishy Roll"]) xpBoosts.push({ name: "Fishy Roll (+0.1 expected Advanced)", multiplier: 1, buildings: ["Aging Shed"], salt: true });
  if (skills["Fishy Gamble"]) xpBoosts.push({ name: "Fishy Gamble (+0.2 expected Expert)", multiplier: 1, buildings: ["Aging Shed"], salt: true });

  // Swiss Whiskers placed: +500 XP on every recipe made with Cheese — boosts.ts:396-403. Flat,
  // so it lands after the multipliers above and before the two below.
  if (findCollectible(farm, "Swiss Whiskers").length > 0) xpBoosts.push({ name: "Swiss Whiskers (+500 XP, cheese recipes)", multiplier: 1, add: 500, foods: CHEESE_RECIPES });
  // Port bud, placed: x(1 + aura x 0.1) on fish consumables, best bud only —
  // getBudExperienceBoosts (lib/getBudExperienceBoosts.ts:237-270).
  {
    let best = 1;
    for (const bud of Object.values(farm.buds || {})) {
      if (!bud || !bud.coordinates || bud.type !== "Port") continue;
      best = Math.max(best, 1 + (BUD_AURA_MULTIPLIERS[bud.aura] || 1) * 0.1);
    }
    if (best > 1) xpBoosts.push({ name: "Port Bud (Fish XP)", multiplier: +best.toFixed(4), fishOnly: true });
  }
  if (thisWeekActive) {
    xpBoosts.push({ name: "Pet's Streak", multiplier: streakMultiplier, petStreak: true });
  } else if (manualPetStreak) {
    xpBoosts.push({ name: "Pet's Streak (simulate)", multiplier: 1.5, petStreak: true, manual: true });
  }

  return { xpBoosts, timeBoosts, amountBoosts, petStreakInfo };
}

// Does boost `b` reach this food in this building? One gate for XP, time and amount boosts.
function cookBoostApplies(b, foodName, food, buildingName) {
  if (b.buildings && !b.buildings.includes(buildingName)) return false;
  if (b.excludeBuildings && b.excludeBuildings.includes(buildingName)) return false;
  if (b.honeyOnly && !(food && food.usesHoney)) return false;
  if (b.foods && !(foodName && b.foods.includes(foodName))) return false;
  if (b.fishOnly && !(foodName && isFishConsumable(foodName))) return false;
  return true;
}

// The optional `trace` sink (an array) makes this function EXPLAIN as it computes:
// when present it pushes ONE node {item, method, formula, value, steps} describing the
// base XP and every value-affecting boost, mirroring core/engine/item-value.mjs. Absent,
// behaviour and value are exactly as before (a single skipped null check per boost). ×1
// informational boosts (salt/fish-yield entries) don't change XP and are left out of the
// trace so it shows only steps that actually move the number.
export function computeFoodXP(foodName, food, buildingName, boosts, trace) {
  let xp = food.xp;
  const parts = trace ? [`${food.xp} base`] : null;
  const kids = trace ? [{ item: `${foodName} base`, method: "recipe base", formula: "recipe base XP", value: food.xp, unit: "XP" }] : null;
  for (const b of boosts.xpBoosts) {
    if (!cookBoostApplies(b, foodName, food, buildingName)) continue;
    if (b.add) xp += b.add;
    else xp *= b.multiplier;
    if (trace && (b.add || b.multiplier !== 1)) {
      const f = b.add ? `+ ${b.add}` : `× ${b.multiplier}`;
      parts.push(`${f} (${b.name})`);
      kids.push({ item: b.name, method: "xp boost", formula: f, value: xp, unit: "XP" });
    }
  }
  if (trace) trace.push({ item: foodName, method: "food xp", formula: parts.join(" "), value: xp, unit: "XP", steps: kids });
  return xp;
}

// `foodName` (optional, last so existing callers keep working) lets a recipe-scoped time boost
// — Frosted Cakes — reach exactly the dishes it targets.
export function computeCookTime(baseSec, buildingName, boosts, trace, foodName) {
  let time = baseSec;
  const parts = trace ? [`${baseSec}s base`] : null;
  const kids = trace ? [{ item: "base time", method: "recipe base", formula: `${baseSec}s`, value: baseSec, unit: "s" }] : null;
  for (const b of boosts.timeBoosts) {
    if (!cookBoostApplies(b, foodName, null, buildingName)) continue;
    time *= b.multiplier;
    if (trace && b.multiplier !== 1) {
      parts.push(`× ${b.multiplier} (${b.name})`);
      kids.push({ item: b.name, method: "time boost", formula: `× ${b.multiplier}`, value: time, unit: "s" });
    }
  }
  if (trace) trace.push({ item: "cook time", method: "cook time", formula: parts.join(" "), value: time, unit: "s", steps: kids });
  return time;
}

// Expected dishes one cook yields: 1 + Double Nom + the chance-based extras (getCookingAmount).
export function computeCookAmount(foodName, buildingName, boosts) {
  let n = 1;
  for (const b of (boosts.amountBoosts || [])) {
    if (!cookBoostApplies(b, foodName, null, buildingName)) continue;
    n += b.extra;
  }
  return n;
}

/**
 * XP sitting in the inventory as cooked food — every recipe, plus Prime Aged fish (not a recipe:
 * the shed rolls prime on collect, so they were never counted). A banked fish is KNOWN to be
 * regular or prime, so the expected-prime uplift (`primeAvg`) is left off both.
 */
export function computeBankedFoodXp(farm, boosts) {
  const b = { ...boosts, xpBoosts: (boosts.xpBoosts || []).filter((x) => !x.primeAvg) };
  const inv = (farm && farm.inventory) || {};
  const items = [];
  let totalXp = 0;
  const add = (name, recipe) => {
    const qty = Math.floor(parseFloat(inv[name]) || 0);
    if (!(qty > 0)) return;
    const xpEach = computeFoodXP(name, recipe, recipe.building, b);
    totalXp += xpEach * qty;
    items.push({ name, qty, xpEach, totalFoodXP: xpEach * qty });
  };
  for (const [name, recipe] of Object.entries(COOKING_RECIPES_DATA)) add(name, recipe);
  for (const [name, xp] of Object.entries(PRIME_AGED_FISH_XP)) add(name, { building: "Aging Shed", xp, cookSec: 0, usesHoney: false });
  return { totalXp, items };
}

