import { hasItem, hasAny } from "../derive/items.mjs";

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

export function detectCookingBoosts(farm, settings = {}) {
  const skills = farm.bumpkin?.skills || {};
  const xpBoosts = [];
  const timeBoosts = [];

  // === XP BOOSTS ===
  // Skills
  if (skills["Munching Mastery"]) xpBoosts.push({ name: "Munching Mastery", multiplier: 1.05 });
  if (skills["Juicy Boost"]) xpBoosts.push({ name: "Juicy Boost", multiplier: 1.1, buildings: ["Smoothie Shack"] });
  if (skills["Drive-Through Deli"]) xpBoosts.push({ name: "Drive-Through Deli", multiplier: 1.15, buildings: ["Deli"] });
  if (skills["Buzzworthy Treats"]) xpBoosts.push({ name: "Buzzworthy Treats", multiplier: 1.1, honeyOnly: true });
  // Items (check both collectibles + wearables)
  if (hasItem(farm, "Golden Spatula")) xpBoosts.push({ name: "Golden Spatula", multiplier: 1.1 });
  if (hasItem(farm, "Pan")) xpBoosts.push({ name: "Pan (+25% Bumpkin XP)", multiplier: 1.25 });
  if (hasItem(farm, "Observatory")) xpBoosts.push({ name: "Observatory", multiplier: 1.05 });
  if (hasItem(farm, "Blossombeard")) xpBoosts.push({ name: "Blossombeard", multiplier: 1.1 });
  if (hasItem(farm, "Grain Grinder")) xpBoosts.push({ name: "Grain Grinder", multiplier: 1.2, buildings: ["Bakery"] });
  if (hasItem(farm, "Lifetime Farmer Banner")) xpBoosts.push({ name: "Lifetime Farmer Banner", multiplier: 1.1 });

  // === PET STREAK (auto-detect from faction) ===
  const faction = farm.faction || {};
  const factionHistory = faction.history || {};
  const sortedWeeks = Object.keys(factionHistory).sort();
  const currentWeekKey = sortedWeeks[sortedWeeks.length - 1] || "";
  const prevWeekKey = sortedWeeks[sortedWeeks.length - 2] || "";
  const currentWeekData = factionHistory[currentWeekKey] || {};
  const prevWeekData = factionHistory[prevWeekKey] || {};
  const petStreak = currentWeekData.collectivePet?.streak || 0;
  const streakMultiplier = petStreak >= 8 ? 1.5 : petStreak >= 6 ? 1.3 : petStreak >= 4 ? 1.2 : petStreak >= 2 ? 1.1 : 1.0;
  const weeksToMax = petStreak >= 8 ? 0 : 8 - petStreak;
  // This week: boost active if player fed pet LAST week (petXP > 0)
  const thisWeekActive = (prevWeekData.petXP || 0) > 0 && streakMultiplier > 1;
  // Next week: qualifiesForBoost = player fed pet THIS week
  const nextWeekQualified = faction.pet?.qualifiesForBoost === true;
  const manualPetStreak = !!settings.petSimulate;

  if (thisWeekActive) {
    xpBoosts.push({ name: "Pet's Streak", multiplier: streakMultiplier, petStreak: true });
  } else if (manualPetStreak) {
    xpBoosts.push({ name: "Pet's Streak (simulate)", multiplier: 1.5, petStreak: true, manual: true });
  }

  const petStreakInfo = { streak: petStreak, multiplier: streakMultiplier, thisWeekActive, nextWeekQualified, weeksToMax, manualOverride: manualPetStreak };

  // === TIME BOOSTS ===
  // Skills
  if (skills["Double Nom"]) timeBoosts.push({ name: "Double Nom", multiplier: 0.5, excludeBuildings: ["Aging Shed"] });
  if (skills["Fast Feasts"]) timeBoosts.push({ name: "Fast Feasts", multiplier: 0.9, buildings: ["Fire Pit", "Kitchen"] });
  if (skills["Frosted Cakes"]) timeBoosts.push({ name: "Frosted Cakes", multiplier: 0.9, buildings: ["Bakery"] });
  // Items
  if (hasItem(farm, "Luna's Hat")) timeBoosts.push({ name: "Luna's Hat", multiplier: 0.5, excludeBuildings: ["Aging Shed"] });
  if (hasItem(farm, "Desert Gnome")) timeBoosts.push({ name: "Desert Gnome", multiplier: 0.9, excludeBuildings: ["Aging Shed"] });
  if (hasAny(farm, "Nightshade Medallion")) timeBoosts.push({ name: "Nightshade Medallion", multiplier: 0.75, excludeBuildings: ["Aging Shed"] });
  if (hasAny(farm, "Master Chefs Cleaver", "Master Chef's Cleaver")) timeBoosts.push({ name: "Master Chefs Cleaver", multiplier: 0.85, excludeBuildings: ["Aging Shed"] });

  // === AGING SHED BOOSTS ===
  const sculptures = farm.sculptures || {};
  const saltSculptLvl = sculptures["Salt Sculpture"]?.level || 0;
  // Time
  if (skills["Speedy Aging"]) timeBoosts.push({ name: "Speedy Aging", multiplier: 0.9, buildings: ["Aging Shed"] });
  if (saltSculptLvl >= 5) timeBoosts.push({ name: "Salt Sculpture L5+", multiplier: 0.95, buildings: ["Aging Shed"] });
  // Prime Aged weighted average. Base 10% chance of prime (×1.3 XP) → factor 1.03.
  // Fish Smoking doubles the chance (→ 20%); Salt Sculpture L2+ adds +4% (→ 14/24%).
  // Recipe XP is stored as the regular-aged value; this single boost folds in the
  // expected uplift from primes for the player's actual farm state.
  {
    const _primePct = +(getAgingPrimeChance(farm) * 100).toFixed(0);
    const _primeFactor = getAgingPrimeFactor(farm);
    xpBoosts.push({
      name: "Prime Aged avg (" + _primePct + "% \u00d7 1.3 XP)",
      multiplier: _primeFactor,
      buildings: ["Aging Shed"]
    });
  }
  // Fish XP boosts — Aging Shed outputs (Aged Fish) count as fish consumables
  if (hasItem(farm, "Skill Shrimpy")) xpBoosts.push({ name: "Skill Shrimpy (+20% Fish XP)", multiplier: 1.20, buildings: ["Aging Shed"] });
  if (skills["Fishy Feast"]) xpBoosts.push({ name: "Fishy Feast (+20% Fish XP)", multiplier: 1.20, buildings: ["Aging Shed"] });
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

  return { xpBoosts, timeBoosts, petStreakInfo };
}

export function computeFoodXP(foodName, food, buildingName, boosts) {
  let xp = food.xp;
  for (const b of boosts.xpBoosts) {
    if (b.buildings && !b.buildings.includes(buildingName)) continue;
    if (b.excludeBuildings && b.excludeBuildings.includes(buildingName)) continue;
    if (b.honeyOnly && !food.usesHoney) continue;
    xp *= b.multiplier;
  }
  return xp;
}

export function computeCookTime(baseSec, buildingName, boosts) {
  let time = baseSec;
  for (const b of boosts.timeBoosts) {
    if (b.buildings && !b.buildings.includes(buildingName)) continue;
    if (b.excludeBuildings && b.excludeBuildings.includes(buildingName)) continue;
    time *= b.multiplier;
  }
  return time;
}
