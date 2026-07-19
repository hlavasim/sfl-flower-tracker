// Power cost + per-category production layer — extracted VERBATIM from flowers.html
// (ranges marked) for the section=power `categories` block. Two deviations, same policy
// as power-helpers.mjs: activeShrineEffects takes `farm` as a parameter instead of the
// page's powerState global; everything else is byte-for-byte.
import {
  ANIMAL_CYCLE_DATA, ANIMAL_LEVELS, GOLDEN_ANIMALS, isAnimalCat, getAnimalData,
  ANIMAL_CAT_MAP,
  getAnimalLevel, RESOURCE_RESPAWN_DATA, TOOL_TO_CAT, BASE_STOCK,
  getCycleSec, getCapacityCount, getDefaultProduct, getBaseYield, applyBoosts,
  getEffectiveStock, calcToolCostPerDay, getEffectsForCategory, SEED_DATA,
} from "./power-helpers.mjs";
import { PRODUCT_TO_CATEGORY, FRUIT_HARVEST_COUNT } from "./power-boosts.mjs";
import { SEED_COSTS, TOOL_COSTS } from "../data/economy.mjs";


    // ── flowers.html 3777-3792: FEED_RECIPES + FEED_QTY + FEED_XP_TABLE ──
    const FEED_RECIPES = {
      "Kernel Blend": { Corn: 1 },
      "Hay":          { Wheat: 1 },
      "NutriBarley":  { Barley: 1 },
      "Mixed Grain":  { Wheat: 1, Corn: 1, Barley: 1 },
    };
    // Feed items consumed per animal per feeding
    const FEED_QTY = { Chicken: 1, Cow: 5, Sheep: 3 };
    // XP per food item by level range (same for all animal types)
    const FEED_XP_TABLE = [
      { min: 0,  max: 2,  xp: { "Kernel Blend": 60, "Hay": 10, "NutriBarley": 20, "Mixed Grain": 30 }},
      { min: 3,  max: 5,  xp: { "Kernel Blend": 10, "Hay": 60, "NutriBarley": 20, "Mixed Grain": 30 }},
      { min: 6,  max: 9,  xp: { "Kernel Blend": 10, "Hay": 20, "NutriBarley": 60, "Mixed Grain": 30 }},
      { min: 10, max: 15, xp: { "Kernel Blend": 10, "Hay": 20, "NutriBarley": 30, "Mixed Grain": 80 }},
    ];
    // Golden animals: collectible → free feeding for that animal type


    // ── flowers.html 3808-3833: SICKNESS_RATE_BY_LEVEL + BARN_DELIGHT recipes + SICKNESS_PREVENTION ──
    const SICKNESS_RATE_BY_LEVEL = [
      0,      // Lv 0  (unused)
      0,      // Lv 1  — new animal
      0,      // Lv 2  — still safe
      0.015,  // Lv 3  — 1.5%
      0.025,  // Lv 4  — 2.5%
      0.035,  // Lv 5  — 3.5%
      0.04,   // Lv 6  — 4%
      0.05,   // Lv 7  — 5%
      0.06,   // Lv 8  — 6%
      0.07,   // Lv 9  — 7%
      0.10,   // Lv 10 — 10%
      0.10,   // Lv 11
      0.10,   // Lv 12
      0.10,   // Lv 13
      0.10,   // Lv 14
      0.10,   // Lv 15
    ];
    const BARN_DELIGHT_RECIPE = { Lemon: 5, Honey: 3 };
    const BARN_DELIGHT_RECIPE_ALT = { Lemon: 4, Honey: 2 }; // with Alternate Medicine skill
    // Items that fully prevent sickness for a specific animal category
    const SICKNESS_PREVENTION = {
      "Frozen Cow": "cows", "Frozen Sheep": "sheep",
      "Summer Chicken": "chickens", "Nurse Sheep": "sheep", "Sleepy Chicken": "chickens",
    };
    // Sickness-reducing skills/items and their effects

    // ── flowers.html 3770-3775: ANIMAL_RESOURCE_DROP ──
    // Production per level: [primaryQty, secondaryQty] — products from ANIMAL_CYCLE_DATA
    const ANIMAL_RESOURCE_DROP = {
      Chicken: [[0,0],[1,0],[1,0],[1,1],[2,1],[2,1],[2,1],[2,1],[3,1],[3,2],[3,2],[3,2],[3,2],[4,2],[4,2],[5,3]],
      Cow:     [[0,0],[1,1],[1,1],[1,1],[2,1],[2,1],[2,2],[2,2],[3,2],[3,2],[3,3],[3,3],[3,3],[3,3],[3,3],[4,4]],
      Sheep:   [[0,0],[1,1],[1,1],[1,1],[2,1],[2,1],[2,2],[2,2],[3,2],[3,2],[3,3],[3,3],[3,3],[3,3],[3,3],[4,4]],
    };

    // ── flowers.html 3851-3870: getAnimalDropsPerCycle + getAnimalLevelDistribution ──
    function getAnimalDropsPerCycle(animalType, level) {
      const drops = ANIMAL_RESOURCE_DROP[animalType];
      const data = ANIMAL_CYCLE_DATA[animalType];
      if (!drops || !data) return {};
      const row = drops[Math.min(level, 15)] || [0, 0];
      const result = {};
      data.products.forEach((prod, i) => { result[prod] = row[i] || 0; });
      return result;
    }
    // Get level distribution summary from an animal detail list
    function getAnimalLevelDistribution(animals) {
      if (!animals || animals.length === 0) return { levels: {}, avgLevel: 0 };
      const levels = {};
      let sum = 0;
      for (const a of animals) {
        levels[a.level] = (levels[a.level] || 0) + 1;
        sum += a.level;
      }
      return { levels, avgLevel: sum / animals.length };
    }

    // ── flowers.html 3885-3901: SHRINE_DATA ──
    const SHRINE_DATA = {
      "Boar Shrine":      { duration_d: 7,  ingredients: { Acorn: 15 },                                                catId: "cooking",   effect: "−20% cook time (faster)",                       effectKind: "indirect" },
      "Hound Shrine":     { duration_d: 7,  ingredients: { Acorn: 50 },                                                catId: "pets",      effect: "+100 Pet XP per feed (faster pet level-ups)",   effectKind: "xp_only" },
      "Sparrow Shrine":   { duration_d: 7,  ingredients: { Acorn: 15, "Wild Grass": 10, "Ruffroot": 10 },              catId: "crops",     effect: "−25% Crop growth time (faster)",                effectKind: "speed", speed: 0.75 },
      "Fox Shrine":       { duration_d: 7,  ingredients: { Acorn: 15, "Chewed Bone": 10, "Ribbon": 10 },               catId: "crafting",  effect: "Free first craft, −25% time afterwards",         effectKind: "indirect" },
      "Toucan Shrine":    { duration_d: 7,  ingredients: { Acorn: 15, "Heart Leaf": 10, "Frost Pebble": 10 },          catId: "fruits",    effect: "−25% Fruit growth time (faster)",                effectKind: "speed", speed: 0.75 },
      "Collie Shrine":    { duration_d: 7,  ingredients: { Acorn: 15, "Frost Pebble": 10, "Chewed Bone": 10 },         catId: "cows",      effect: "−5% / −25% Cow & Sheep sleep (stacked, faster)", effectKind: "speed", speed: 0.75, alsoCats: ["sheep"] },
      "Moth Shrine":      { duration_d: 7,  ingredients: { Acorn: 15, "Frost Pebble": 10, "Ribbon": 10 },              catId: "flowers",   effect: "−25% Flower grow + 25% chance +1 flower",        effectKind: "speed_and_yield", speed: 0.75, chance: 0.25 },
      "Badger Shrine":    { duration_d: 7,  ingredients: { Acorn: 15, "Dewberry": 10, "Heart Leaf": 10 },              catId: "trees",     effect: "−25% Tree & Stone recovery (faster)",            effectKind: "speed", speed: 0.75, alsoCats: ["stone"] },
      "Mole Shrine":      { duration_d: 7,  ingredients: { Acorn: 15, "Dewberry": 10, "Ribbon": 10 },                  catId: "iron",      effect: "−25% Iron / Gold / Crimstone recovery (faster)", effectKind: "speed", speed: 0.75, alsoCats: ["gold","crimstone"] },
      "Tortoise Shrine":  { duration_d: 7,  ingredients: { Acorn: 15, "Wild Grass": 10, "Chewed Bone": 10 },           catId: "greenhouse", effect: "−33% Greenhouse + −10% Crop Machine (faster)",   effectKind: "speed", speed: 0.67 },
      "Stag Shrine":      { duration_d: 7,  ingredients: { Acorn: 15, "Heart Leaf": 10, "Wild Grass": 10 },            catId: "oil",       effect: "−25% Oil time + +15 Oil on every 3rd drill",     effectKind: "speed_and_yield", speed: 0.75, oil3rdDrillBonus: 15 },
      "Bear Shrine":      { duration_d: 7,  ingredients: { Acorn: 15, "Chewed Bone": 10, "Ruffroot": 10 },             catId: "bees",      effect: "+0.5 Honey per beehive cycle",                   effectKind: "yield_flat", flat: 0.5 },
      "Bantam Shrine":    { duration_d: 7,  ingredients: { Acorn: 15, "Ruffroot": 10, "Dewberry": 10 },                catId: "chickens",  effect: "−5% / −25% Chicken sleep (stacked, faster)",     effectKind: "speed", speed: 0.75 },
      "Legendary Shrine": { duration_d: 1,  ingredients: { Obsidian: 1, Moonfur: 10, Acorn: 15 },                       catId: "multi",    effect: "+1 to Crop, Fruit, Wood, Flower, Stone harvests", effectKind: "yield_flat_multi", flat: 1, targets: ["crops","fruits","trees","flowers","stone"] },
      "Trading Shrine":   { duration_d: 30, ingredients: { Acorn: 15, Moonfur: 5, Obsidian: 3 },                       catId: "trading",   effect: "−2.5% Resources Tax (Marketplace)",              effectKind: "trading" },
    };

    // ── flowers.html 3975-4020: LAVA_PIT_REQUIREMENTS + GREENHOUSE_OIL_COSTS ──
    const LAVA_PIT_REQUIREMENTS = {
      autumn: [
        { item: "Artichoke", qty: 30 },
        { item: "Broccoli", qty: 750 },
        { item: "Yam", qty: 1000 },
        { item: "Gold", qty: 5 },
        { item: "Crimstone", qty: 6 },
      ],
      winter: [
        { item: "Merino Wool", qty: 150 },
        { item: "Onion", qty: 400 },
        { item: "Turnip", qty: 200 },
        { item: "Crimstone", qty: 5 },
      ],
      spring: [
        { item: "Celestine", qty: 2 },
        { item: "Lunara", qty: 2 },
        { item: "Duskberry", qty: 2 },
        { item: "Rhubarb", qty: 2000 },
        { item: "Crimstone", qty: 10 },
      ],
      summer: [
        { item: "Oil", qty: 70 },
        { item: "Pepper", qty: 750 },
        { item: "Zucchini", qty: 1000 },
        { item: "Crimstone", qty: 4 },
      ],
    };

    // (inline SEED_COSTS omitted — verified identical to core/data/economy.mjs import)
    const GREENHOUSE_OIL_COSTS = { "Grape": 3, "Rice": 4, "Olive": 5 };

    // ── flowers.html 7126-7129: toMs ──
    function toMs(ts) {
      // SFL API timestamps may be in seconds or milliseconds
      return ts < 1e12 ? ts * 1000 : ts;
    }

    // ── flowers.html 14474-14478: unitToSfl ──
    function unitToSfl(unitsPerDay, product, p2pPrices) {
      const price = p2pPrices[product] || 0;
      return unitsPerDay * price;
    }


    // ── flowers.html 14658-14700: calcSeedCostPerDay ──
    function calcSeedCostPerDay(catId, product, capacity, exchangeRates, stockMods, boostEffects, p2pPrices) {
      const coinCost = SEED_COSTS[product];
      if (!coinCost || exchangeRates.coinsPerSFL <= 0) return { costPerDay: 0, seedSfl: 0, restockPerDay: 0 };
      const seedSfl = coinCost / exchangeRates.coinsPerSFL;
      const n = getCapacityCount(catId, capacity);
      if (n === 0) return { costPerDay: 0, seedSfl, restockPerDay: 0 };

      // Apply speed boosts to get effective cycles/day
      const result = applyBoosts(catId, product, capacity, boostEffects);
      const effectiveCycle = result.effectiveCycle || getCycleSec(catId, product);
      const cyclesPerDay = effectiveCycle > 0 ? 86400 / effectiveCycle : 0;

      // Fruit harvest count: one seed produces multiple harvests
      let effectiveHarvests = 1;
      if (catId === "fruits") {
        const baseHarvests = FRUIT_HARVEST_COUNT[product] || 4;
        effectiveHarvests = baseHarvests + (result.extraHarvest || 0);
      }

      // Seed consumption: for fruits, 1 seed per (harvestCount × growCycle)
      const seedsPerDay = cyclesPerDay * n / effectiveHarvests;
      let costPerDay = seedSfl * seedsPerDay;

      // Greenhouse oil cost per seed
      let oilPerSeed = 0, oilSflPerSeed = 0, oilCostPerDay = 0;
      if (catId === "greenhouse" && GREENHOUSE_OIL_COSTS[product]) {
        oilPerSeed = GREENHOUSE_OIL_COSTS[product];
        if (stockMods.slickSaver) oilPerSeed = Math.max(0, oilPerSeed - 1);
        // "+N% Oil consumption" debuffs (e.g. Greasy Plants) multiply greenhouse oil use — a real cost.
        const _oilConsPct = (boostEffects || []).filter(e => e && e.type === "oil_consumption_pct").reduce((s, e) => s + (e.value || 0), 0);
        if (_oilConsPct) oilPerSeed *= (1 + _oilConsPct / 100);
        oilSflPerSeed = oilPerSeed * ((p2pPrices && p2pPrices["Oil"]) || 0);
        oilCostPerDay = oilSflPerSeed * seedsPerDay;
        costPerDay += oilCostPerDay;
      }

      // Stock info (restock cost calculated separately in shared restock system)
      const seedName = product + " Seed";
      const stock = getEffectiveStock(seedName, stockMods);
      const daysUntilEmpty = seedsPerDay > 0 ? stock / seedsPerDay : Infinity;

      return { costPerDay, seedSfl, restockPerDay: 0, cyclesPerDay, seedsPerDay, stock, daysUntilEmpty, oilPerSeed, oilSflPerSeed, oilCostPerDay, effectiveHarvests };
    }

    // ── flowers.html 14839-14960: feed cost helpers + calcAnimalFeedCost ──
    function getFeedCostPerUnit(foodName, p2pPrices, stockMods) {
      if (foodName === "Mixed Grain" && stockMods?.hasKaleMix) {
        return (p2pPrices["Kale"] || 0) * 3;
      }
      const recipe = FEED_RECIPES[foodName];
      if (!recipe) return 0;
      let cost = 0;
      for (const [item, qty] of Object.entries(recipe)) {
        cost += (p2pPrices[item] || 0) * qty;
      }
      return cost;
    }

    // Compute feed reduction multiplier from boost effects for a specific animal category
    function getFeedReductionMult(catId, boostEffects) {
      let mult = 1;
      for (const eff of boostEffects) {
        if (eff.type === "feed_reduction" && eff.cat === catId) {
          mult *= (1 + eff.value); // value is negative for reductions (e.g. -0.25)
        }
      }
      return Math.max(0, mult);
    }

    // Highest-XP ("favourite") food for a level + its XP — the food used to complete a cycle.
    function getFavFoodForLevel(level) {
      for (const row of FEED_XP_TABLE) {
        if (level >= row.min && level <= row.max) {
          let best = null, bestXp = 0;
          for (const [f, xp] of Object.entries(row.xp)) { if (xp > bestXp) { bestXp = xp; best = f; } }
          return { food: best || "Mixed Grain", xp: bestXp || 1 };
        }
      }
      return { food: "Mixed Grain", xp: 80 };
    }

    // Cheapest-TOTAL feed for an animal's cycle: try every food (favourite minimises feedings but may cost
    // more per unit; a cheap low-XP food needs more feedings) and pick min noOfFeed x qty x cost. Matches the
    // feed advisor, so the income net and the advisor agree.
    function getOptimalFeedForLevel(level, xpPerCycle, feedQty, p2pPrices, stockMods) {
      let row = null;
      for (const r of FEED_XP_TABLE) { if (level >= r.min && level <= r.max) { row = r; break; } }
      const foods = row ? Object.keys(row.xp) : ["Mixed Grain"];
      let bestFood = null, bestCost = Infinity, bestN = 1;
      for (const food of foods) {
        const xp = (row && row.xp[food]) || 1; if (!(xp > 0)) continue;
        const noOfFeed = Math.max(1, Math.ceil(xpPerCycle / xp));
        const cost = noOfFeed * feedQty * getFeedCostPerUnit(food, p2pPrices, stockMods);
        if (cost < bestCost) { bestCost = cost; bestFood = food; bestN = noOfFeed; }
      }
      return { food: bestFood || "Mixed Grain", costPerCycle: bestCost === Infinity ? 0 : bestCost, noOfFeed: bestN };
    }

    // Main animal feed cost function (analogous to calcSeedCostPerDay / calcToolCostPerDay)
    function calcAnimalFeedCost(catId, capacity, p2pPrices, boostEffects, stockMods) {
      const animalType = ANIMAL_CAT_MAP[catId];
      if (!animalType) return { costPerDay: 0 };

      const animals = capacity.animalDetails?.[catId] || [];
      if (animals.length === 0) return { costPerDay: 0, animalCount: 0 };

      // Check golden animal → free feeding
      if (capacity.goldenAnimals?.[animalType]) {
        const goldenItem = Object.keys(GOLDEN_ANIMALS).find(k => GOLDEN_ANIMALS[k] === animalType);
        return { costPerDay: 0, isGolden: true, goldenItem, animalCount: animals.length };
      }

      // Speed multiplier affects feeding frequency
      let speedMult = 1;
      for (const eff of boostEffects) {
        if (eff.cat !== catId) continue;
        if (eff.type === "speed_pct") speedMult *= (1 + eff.value / 100);
        else if (eff.type === "speed_mult") speedMult *= eff.value;
      }
      const cycleSec = ANIMAL_CYCLE_DATA[animalType].cycleSec * speedMult;
      const cyclesPerDay = cycleSec > 0 ? 86400 / cycleSec : 0;

      // Feed reduction from boosts
      const feedReductionMult = getFeedReductionMult(catId, boostEffects);
      const baseFeedQty = FEED_QTY[animalType] || 1;
      const effectiveFeedQty = baseFeedQty * feedReductionMult;

      const levelDist = getAnimalLevelDistribution(animals);

      // Compute per-animal feed cost
      let totalCostPerCycle = 0;
      const feedBreakdown = {}; // { foodName: { count, costPerUnit, totalUnits } }

      // Food per PRODUCTION cycle scales with level: completing a cycle needs `xpPerCycle` XP,
      // each feeding grants the food's XP, so noOfFeed = ceil(xpPerCycle / foodXp) and total food =
      // noOfFeed x REQUIRED_FOOD_QTY. (game: feedAnimal.ts). At L15 a cow eats 12x5=60 Mixed Grain/cycle.
      const lvls = ANIMAL_LEVELS[animalType];
      for (const animal of animals) {
        const lvl = animal.level;
        let xpPerCycle;
        if (lvl >= 15) xpPerCycle = (lvls[15] - lvls[14]);
        else xpPerCycle = ((lvls[lvl + 1] || lvls[15]) - lvls[lvl]);
        const opt = getOptimalFeedForLevel(lvl, xpPerCycle, effectiveFeedQty, p2pPrices, stockMods);
        const foodName = opt.food;
        const costPerUnit = getFeedCostPerUnit(foodName, p2pPrices, stockMods);
        const unitsThisAnimal = opt.noOfFeed * effectiveFeedQty;
        totalCostPerCycle += opt.costPerCycle;

        if (!feedBreakdown[foodName]) feedBreakdown[foodName] = { count: 0, costPerUnit, totalUnits: 0 };
        feedBreakdown[foodName].count++;
        feedBreakdown[foodName].totalUnits += unitsThisAnimal;
      }

      const costPerDay = totalCostPerCycle * cyclesPerDay;

      return {
        costPerDay,
        feedBreakdown,
        feedReductionMult,
        animalCount: animals.length,
        cyclesPerDay,
        baseFeedQty,
        effectiveFeedQty,
        levelDist,
        speedMult,
      };
    }

    // ── flowers.html 14967-15036: calcSicknessCost ──
    function calcSicknessCost(catId, capacity, p2pPrices, boostItems, skills) {
      const animals = capacity.animalDetails?.[catId] || [];
      if (animals.length === 0) return { costPerDay: 0, avgRate: 0, barnDelightSfl: 0, reductions: [], perLevel: [] };

      const reductions = [];

      // Base Barn Delight cost in SFL
      const hasAltMedicine = !!(skills && skills["Alternate Medicine"]);
      const recipe = hasAltMedicine ? BARN_DELIGHT_RECIPE_ALT : BARN_DELIGHT_RECIPE;
      if (hasAltMedicine) reductions.push({ name: "Alternate Medicine", desc: "Recipe: -1 Lemon & Honey" });
      const lemonPrice = p2pPrices["Lemon"] || 0;
      const honeyPrice = p2pPrices["Honey"] || 0;
      const barnDelightSfl = (recipe.Lemon * lemonPrice) + (recipe.Honey * honeyPrice);

      // Check prevention items (full immunity for this category)
      let prevented = false;
      if (boostItems) {
        for (const item of boostItems) {
          if (!item.has) continue;
          const prevCat = SICKNESS_PREVENTION[item.name];
          if (prevCat === catId) {
            prevented = true;
            reductions.push({ name: item.name, desc: "Full prevention" });
            break;
          }
        }
      }
      if (prevented) return { costPerDay: 0, avgRate: 0, barnDelightSfl, prevented: true, reductions, perLevel: [] };

      // Rate multiplier from Healthy Livestock
      let rateMult = 1;
      const hasHealthyLivestock = !!(skills && skills["Healthy Livestock"]);
      if (hasHealthyLivestock) {
        rateMult = 0.5;
        reductions.push({ name: "Healthy Livestock", desc: "-50% sickness rate" });
      }

      // Cure cost modifiers
      let cureCostMult = 1;
      const hasOracleSyringe = boostItems && boostItems.some(b => b.name === "Oracle Syringe" && b.has);
      if (hasOracleSyringe) {
        cureCostMult = 0;
        reductions.push({ name: "Oracle Syringe", desc: "Free cure" });
      }
      if (cureCostMult > 0) {
        const hasMedicApron = boostItems && boostItems.some(b => b.name === "Medic Apron" && b.has);
        if (hasMedicApron) {
          cureCostMult *= 0.5;
          reductions.push({ name: "Medic Apron", desc: "-50% Barn Delight cost" });
        }
      }

      // Per-animal level-based sickness rate
      let totalExpectedSick = 0;
      const perLevel = {};  // { level: { count, rate, cost } }
      for (const animal of animals) {
        const lvl = Math.min(animal.level || 1, SICKNESS_RATE_BY_LEVEL.length - 1);
        const baseRate = SICKNESS_RATE_BY_LEVEL[lvl] || 0;
        const effectiveRate = baseRate * rateMult;
        totalExpectedSick += effectiveRate;

        if (!perLevel[lvl]) perLevel[lvl] = { count: 0, rate: effectiveRate, baseRate };
        perLevel[lvl].count++;
      }

      const costPerDay = totalExpectedSick * barnDelightSfl * cureCostMult;
      const avgRate = animals.length > 0 ? totalExpectedSick / animals.length : 0;

      return { costPerDay, avgRate, totalExpectedSick, barnDelightSfl, cureCostMult, rateMult, reductions, animalCount: animals.length, perLevel };
    }

    // ── flowers.html 15160-15184: calcLavaPitCostPerDay ──
    function calcLavaPitCostPerDay(capacity, p2pPrices, season, costMult) {
      const n = capacity.lavaPits || 0;
      if (n === 0 || !season) return { costPerDay: 0, costPerIgnition: 0, requirements: [], season };
      const reqs = LAVA_PIT_REQUIREMENTS[season];
      if (!reqs) return { costPerDay: 0, costPerIgnition: 0, requirements: [], season };

      const mult = costMult !== undefined ? costMult : 1;
      let costPerIgnition = 0;
      const breakdown = [];
      for (const r of reqs) {
        const price = p2pPrices[r.item] || 0;
        const effectiveQty = r.qty * mult;
        const cost = price * effectiveQty;
        costPerIgnition += cost;
        breakdown.push({ item: r.item, qty: effectiveQty, baseQty: r.qty, price, cost });
      }

      const d = RESOURCE_RESPAWN_DATA["Obsidian"];
      const cyclesPerDay = 86400 / d.respawnSec;
      const ignitionsPerDay = n * cyclesPerDay;
      const costPerDay = costPerIgnition * ignitionsPerDay;

      return { costPerDay, costPerIgnition, ignitionsPerDay, requirements: breakdown, season, costMult: mult };
    }


    // ── flowers.html 15186-15241: getAnimalCatSfl ──
    function getAnimalCatSfl(catId, capacity, boostEffects, p2pPrices) {
      const animalType = ANIMAL_CAT_MAP[catId];
      const animal = getAnimalData(catId);
      if (!animal) return { totalSfl: 0, breakdown: [] };

      const animals = capacity.animalDetails?.[catId];
      // If we have per-animal level data, use level-based drops
      if (animals && animals.length > 0) {
        // Extract speed multiplier from boosts (same for all products)
        let speedMult = 1;
        for (const eff of boostEffects) {
          if (eff.cat !== catId) continue;
          if (eff.type === "speed_pct") speedMult *= (1 + eff.value / 100);
          else if (eff.type === "speed_mult") speedMult *= eff.value;
        }
        const effectiveCycle = animal.cycleSec * speedMult;
        const cyclesPerDay = effectiveCycle > 0 ? 86400 / effectiveCycle : 0;

        let totalSfl = 0;
        const breakdown = [];
        for (const prod of animal.products) {
          // Collect yield modifiers for this specific product
          let yieldMult = 1, yieldFlat = 0;
          for (const eff of boostEffects) {
            if (eff.cat !== catId) continue;
            if (eff.product && PRODUCT_TO_CATEGORY[eff.product] === catId && eff.product !== prod) continue;
            if (eff.type === "yield_pct") yieldMult *= (1 + eff.value / 100);
            else if (eff.type === "yield_flat") { if (eff.product || prod === animal.products[0]) yieldFlat += eff.value; } // product-less flat = primary product only
            else if (eff.type === "chance") yieldFlat += (eff.pct / 100) * eff.extra;
          }
          // Sum production across all animals at their individual levels
          let totalUnits = 0;
          for (const a of animals) {
            const drops = getAnimalDropsPerCycle(animalType, a.level);
            const baseDrop = drops[prod] || 0;
            totalUnits += (baseDrop * yieldMult + yieldFlat) * cyclesPerDay;
          }
          const price = p2pPrices[prod] || 0;
          const sfl = totalUnits * price;
          totalSfl += sfl;
          breakdown.push({ product: prod, unitsPerDay: totalUnits, sfl, speedMult, yieldMult, yieldFlat, effectiveCycle });
        }
        return { totalSfl, breakdown };
      }

      // Fallback: no per-animal data — use old flat yield=1 path
      let totalSfl = 0;
      const breakdown = [];
      for (const prod of animal.products) {
        const result = applyBoosts(catId, prod, capacity, boostEffects);
        const sfl = unitToSfl(result.unitsPerDay, prod, p2pPrices);
        totalSfl += sfl;
        breakdown.push({ product: prod, unitsPerDay: result.unitsPerDay, sfl, ...result });
      }
      return { totalSfl, breakdown };
    }

    // ── flowers.html 15421-15429: getPriceProduct ──
    // Get the product name used for P2P price lookup
    function getPriceProduct(catId, product) {
      // For flowers, use the seed label
      if (catId === "flowers") {
        const sd = SEED_DATA[product];
        return sd ? sd.label : "Sunpetal";
      }
      return product;
    }

    // ── flowers.html 21444-21459: _shrineStatus ──
    function _shrineStatus(name, placed, placedHome, duration_d) {
      const all = [...(placed[name] || []), ...(placedHome[name] || [])];
      if (all.length === 0) return { kind: "never" };
      const now = Date.now();
      const durMs = duration_d * 86400000;
      let latestExpiry = 0;
      for (const inst of all) {
        const created = toMs(inst.createdAt || inst.readyAt || 0);
        const expires = created + durMs;
        if (expires > latestExpiry) latestExpiry = expires;
      }
      if (latestExpiry > now) {
        return { kind: "active", hoursLeft: (latestExpiry - now) / 3600000 };
      }
      return { kind: "expired" };
    }

    // ── flowers.html 15926-15954: _shrineActiveNow + activeShrineEffects ──
    function _shrineActiveNow(farm, name) {
      const sh = SHRINE_DATA[name];
      if (!sh || !farm) return false;
      const placed = farm.collectibles || {}, placedHome = (farm.home && farm.home.collectibles) || {};
      return _shrineStatus(name, placed, placedHome, sh.duration_d).kind === "active";
    }
    // Deviation (see header): `farm` param replaces the page's powerState.farm global.
    function activeShrineEffects(farm, catId) {
      if (!farm || !catId) return [];
      const out = [];
      for (const name in SHRINE_DATA) {
        const sh = SHRINE_DATA[name];
        if (!_shrineActiveNow(farm, name)) continue;
        const cats = [sh.catId].concat(sh.alsoCats || []);
        if ((sh.effectKind === "speed" || sh.effectKind === "speed_and_yield") && cats.indexOf(catId) >= 0)
          out.push({ cat: catId, type: "speed_mult", value: sh.speed, shrine: name });
        if (sh.effectKind === "speed_and_yield" && catId === "flowers" && sh.chance)
          out.push({ cat: catId, type: "yield_flat", value: sh.chance, shrine: name });                 // Moth: 25% chance +1 flower = +0.25 EV
        if (sh.effectKind === "speed_and_yield" && catId === "oil" && sh.oil3rdDrillBonus)
          out.push({ cat: catId, type: "yield_flat", value: sh.oil3rdDrillBonus / 3, shrine: name });    // Stag: +15 oil every 3rd drill = +5/drill
        if (sh.effectKind === "yield_flat" && cats.indexOf(catId) >= 0)
          out.push({ cat: catId, type: "yield_flat", value: sh.flat, shrine: name });                    // Bear: +0.5 honey/hive
        if (sh.effectKind === "yield_flat_multi" && (sh.targets || []).indexOf(catId) >= 0)
          out.push({ cat: catId, type: "yield_flat", value: sh.flat, shrine: name });                    // Legendary: +1 to targets
      }
      return out;
    }


    // ── flowers.html 4299: RESTOCK_GEM_COSTS ──
    const RESTOCK_GEM_COSTS = { seeds: 15, tools: 10, both: 20 };

    // ── flowers.html 15058-15070: RESTOCK_QUEUE_DEFS ──
    const RESTOCK_QUEUE_DEFS = {
      // Seed queues (one per seed category — all plots/patches/pots share)
      crops:      { group: "seeds", label: "Crops", getProduct: sp => sp.crops || getDefaultProduct("crops") },
      fruits:     { group: "seeds", label: "Fruits", getProduct: sp => sp.fruits || getDefaultProduct("fruits") },
      greenhouse: { group: "seeds", label: "Greenhouse", getProduct: sp => sp.greenhouse || getDefaultProduct("greenhouse") },
      // Tool queues (independent — one per tool type)
      Axe:            { group: "tools", label: "Axe (trees)",     catId: "trees" },
      Pickaxe:        { group: "tools", label: "Pickaxe (stone)",  catId: "stone" },
      "Stone Pickaxe": { group: "tools", label: "Stone Pick (iron)", catId: "iron" },
      "Iron Pickaxe":  { group: "tools", label: "Iron Pick (gold)",  catId: "gold" },
      "Gold Pickaxe":  { group: "tools", label: "Gold Pick (crimstone)", catId: "crimstone" },
      "Oil Drill":     { group: "tools", label: "Oil Drill (oil)", catId: "oil" },
    };

    // ── flowers.html 15087-15133: buildQueueData ──
    // Build queue data: stock, usePerDay, daysUntilEmpty for each queue
    // Deviation (see header): trailing `farm` param feeds activeShrineEffects (page global).
    function buildQueueData(savedProducts, capacity, exchangeRates, stockMods, catBoosts, p2pPrices, farm) {
      const queues = {};
      for (const [qId, qDef] of Object.entries(RESTOCK_QUEUE_DEFS)) {
        if (qDef.group === "seeds") {
          const catId = qId; // crops, fruits, greenhouse
          const product = qDef.getProduct(savedProducts);
          const n = getCapacityCount(catId, capacity);
          const ownedEffects = (catBoosts[catId] || []).filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, catId)).concat(activeShrineEffects(farm, catId));
          const result = applyBoosts(catId, product, capacity, ownedEffects);
          const effectiveCycle = result.effectiveCycle || getCycleSec(catId, product);
          const cyclesPerDay = effectiveCycle > 0 ? 86400 / effectiveCycle : 0;
          let effectiveHarvests = 1;
          if (catId === "fruits") {
            const baseH = FRUIT_HARVEST_COUNT[product] || 4;
            effectiveHarvests = baseH + (result.extraHarvest || 0);
          }
          const seedsPerDay = cyclesPerDay * n / effectiveHarvests;
          const seedName = product + " Seed";
          const stock = getEffectiveStock(seedName, stockMods);
          const daysUntilEmpty = seedsPerDay > 0 ? stock / seedsPerDay : Infinity;
          queues[qId] = { stock, usePerDay: seedsPerDay, daysUntilEmpty, product, group: "seeds", label: `${qDef.label} (${product})`, capacity: n };
        } else {
          // Tool queue
          const toolName = qId;
          const catId = qDef.catId;
          const n = getCapacityCount(catId, capacity);
          const d = RESOURCE_RESPAWN_DATA[Object.keys(PRODUCT_TO_CATEGORY).find(p => PRODUCT_TO_CATEGORY[p] === catId)];
          const ownedEffects = (catBoosts[catId] || []).filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, catId)).concat(activeShrineEffects(farm, catId));
          const result = applyBoosts(catId, catId === "oil" ? "Oil" : Object.keys(PRODUCT_TO_CATEGORY).find(p => PRODUCT_TO_CATEGORY[p] === catId), capacity, ownedEffects);
          const effectiveCycle = result.effectiveCycle || (d ? d.respawnSec : 0);
          const toolsPerDay = effectiveCycle > 0 ? (86400 / effectiveCycle) * n : 0;
          const stock = getEffectiveStock(toolName, stockMods);
          // Check for free tool sources
          let freeTool = false;
          if (catId === "stone" && stockMods.hasQuarry) freeTool = true;
          if (catId === "trees" && stockMods.hasForeman) freeTool = true;
          if (catId === "oil" && stockMods.hasInfernalDrill) freeTool = true;
          if (catId === "crimstone" && stockMods.hasCrimstoneSpikesHair) freeTool = true;
          const effectiveUse = freeTool ? 0 : toolsPerDay;
          const daysUntilEmpty = effectiveUse > 0 ? stock / effectiveUse : Infinity;
          queues[qId] = { stock, usePerDay: effectiveUse, daysUntilEmpty, toolName, group: "tools", label: qDef.label, capacity: n, freeTool };
        }
      }
      return queues;
    }


export {
  RESTOCK_GEM_COSTS, RESTOCK_QUEUE_DEFS, buildQueueData,
  FEED_RECIPES, FEED_QTY, FEED_XP_TABLE, SICKNESS_RATE_BY_LEVEL,
  BARN_DELIGHT_RECIPE, BARN_DELIGHT_RECIPE_ALT, SICKNESS_PREVENTION,
  SHRINE_DATA, LAVA_PIT_REQUIREMENTS, GREENHOUSE_OIL_COSTS,
  getAnimalDropsPerCycle, getAnimalLevelDistribution, toMs, unitToSfl,
  calcSeedCostPerDay, calcAnimalFeedCost, calcSicknessCost, calcLavaPitCostPerDay,
  getAnimalCatSfl, getPriceProduct, _shrineStatus, _shrineActiveNow, activeShrineEffects,
};
