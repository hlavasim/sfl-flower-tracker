// ROI per-category calculator — extracted VERBATIM from flowers.html (ranges marked)
// for section=roi's precomputed rows. Fully parameterized on the page (no powerState
// global), so the only deviation is imports. Note: on the page, applyBoosts inside
// roiNetForScenario could take the per-node path if the user had visited the Power page
// first (powerState set); on a direct ?page=roi load it never did. Core reproduces the
// DIRECT-load behaviour (no farm passed), which is the page's canonical/deterministic one.
import {
  TOOL_TO_CAT, getCycleSec, getCapacityCount, getDefaultProduct, getBaseYield,
  applyBoosts, getEffectiveStock, isAnimalCat, ANIMAL_CAT_MAP,
} from "./power-helpers.mjs";
import {
  unitToSfl, calcSeedCostPerDay, calcAnimalFeedCost, calcSicknessCost,
  calcLavaPitCostPerDay, getAnimalCatSfl, getPriceProduct, RESTOCK_GEM_COSTS,
} from "./power-costs.mjs";
import { petDailyCalc } from "./pets.mjs";
import { TOOL_COSTS } from "../data/economy.mjs";


    // ── flowers.html 20411-20411: ROI_FIXED_PRODUCTS ──
    const ROI_FIXED_PRODUCTS = { crops: "Wheat" };

    // ── flowers.html 20476-20480: roiEffectiveCycleAtLogin ──
    function roiEffectiveCycleAtLogin(cycleSec, loginsPerDay) {
      if (cycleSec <= 0) return 0;
      const loginInterval = 86400 / loginsPerDay;
      return Math.ceil(cycleSec / loginInterval) * loginInterval;
    }

    // ── flowers.html 20501-20537: roiPickProduct + roiToolCostPerUnit ──
    function roiPickProduct(catId) {
      if (catId === "pets") return "Pet Fetch";
      if (ROI_FIXED_PRODUCTS[catId]) return ROI_FIXED_PRODUCTS[catId];
      return getDefaultProduct(catId);
    }

    // Tool cost per single use (one mine / one chop / one drill), in SFL.
    // Includes coin (with discounts), material, and amortized gem restock cost.
    function roiToolCostPerUnit(catId, exchangeRates, p2pPrices, stockMods) {
      const toolName = Object.keys(TOOL_TO_CAT).find(t => TOOL_TO_CAT[t] === catId);
      if (!toolName) return { sfl: 0, toolName: null };
      const tool = TOOL_COSTS[toolName];
      if (!tool || !exchangeRates || exchangeRates.coinsPerSFL <= 0) return { sfl: 0, toolName };

      let coinDiscount = 0;
      if (toolName === "Axe" && stockMods?.fellersDiscount) coinDiscount = 0.2;
      else if (toolName !== "Axe" && toolName !== "Oil Drill" && stockMods?.frugalMiner) coinDiscount = 0.2;

      let sfl = (tool.coins * (1 - coinDiscount)) / exchangeRates.coinsPerSFL;
      let materials = tool.materials;
      if (catId === "oil" && stockMods?.oilRigActive && materials) {
        materials = { ...materials };
        delete materials.Leather;
        materials.Wool = 20;
      }
      if (materials) {
        for (const [mat, qty] of Object.entries(materials)) {
          sfl += (p2pPrices[mat] || 0) * qty;
        }
      }
      // Amortized gem restock cost (1 restock = RESTOCK_GEM_COSTS.tools gems, refills `stock` tools)
      if (exchangeRates.gemsPerSFL > 0) {
        const stock = (typeof getEffectiveStock === "function") ? getEffectiveStock(toolName, stockMods) : 0;
        if (stock > 0) sfl += (RESTOCK_GEM_COSTS.tools / exchangeRates.gemsPerSFL) / stock;
      }
      return { sfl, toolName };
    }

    // ── flowers.html 20539-20727: roiNetForScenario + roiComputeCategory ──
    // Net SFL/day for a category given a specific set of boost effects (scenario).
    // Returns gross yield minus production costs (tool / lava / seed / feed / sickness),
    // all capped to login frequency where applicable.
    // scenarioBoostItems is the subset of boostItems considered "owned" in this scenario
    // (used for animal sickness calc, which needs item-list rather than effects).
    function roiNetForScenario(catId, product, capacity, effects, p2pPrices, exchangeRates, stockMods, season, L, price, nodeCount, isDailyOutput, scenarioBoostItems, farmSkills, pets) {
      // PETS special branch — daily SFL from fetched resources (uses petDailyCalc from pets page).
      // Yield modifier: Victoria's Apron → +50% feedings/day. Pet Bowls → no daily-SFL effect (XP only).
      if (catId === "pets") {
        const petList = pets || [];
        const zero = { unitsPerDay: 0, yieldSfl: 0, toolCostSfl: 0, lavaCostSfl: 0, seedCostSfl: 0, feedCostSfl: 0, sicknessCostSfl: 0, netSfl: 0, cycle: 86400, realisticCycle: 86400, toolInfo: null, seedInfo: null, feedInfo: null, sicknessInfo: null };
        if (petList.length === 0) return zero;
        const hasApron = !!scenarioBoostItems?.some(b => b.has && b.name === "Victoria's Apron");
        const hasBowls = !!scenarioBoostItems?.some(b => b.has && b.name === "Pet Bowls");
        const feedMult = hasApron ? 1.5 : 1.0;
        let totalSfl = 0;
        for (const pet of petList) {
          const calc = petDailyCalc(pet, p2pPrices, feedMult, hasBowls);
          totalSfl += (calc?.dailySfl || 0);
        }
        return { ...zero, yieldSfl: totalSfl, netSfl: totalSfl };
      }
      const result = applyBoosts(catId, product, capacity, effects);
      const baseCycle = getCycleSec(catId, product);
      const cycle = result.effectiveCycle || baseCycle;

      let unitsPerDay = result.unitsPerDay;
      let realisticCycle = cycle;
      // Animals (long 13–24h cycles) are NOT login-capped: an active player collects each
      // cycle, and the round-up cap would scale yield down while feed/sickness stay full →
      // net collapsed for boosted animals. Crops/resources (short cycles) still get capped.
      if (!isDailyOutput && !isAnimalCat(catId) && nodeCount > 0 && cycle > 0) {
        realisticCycle = roiEffectiveCycleAtLogin(cycle, L);
        const outputPerCycle = (result.unitsPerDay * cycle) / (86400 * nodeCount);
        unitsPerDay = nodeCount * outputPerCycle * (86400 / realisticCycle);
      }

      let yieldSfl = unitsPerDay * price;
      // Animals produce TWO products (Wool+Merino, Egg+Feather, Milk+Leather) with
      // level-based drops. The single-product applyBoosts path above (product = "Wool"
      // at flat yield = 1) misses the second product AND the per-level drop scaling, so
      // gross was massively understated. Use getAnimalCatSfl (same as the Power page) and
      // apply the same login-frequency cap via the realisticCycle scale factor.
      if (isAnimalCat(catId) && nodeCount > 0) {
        // Full-cycle production (no login cap — see above), both products + level drops.
        yieldSfl = getAnimalCatSfl(catId, capacity, effects, p2pPrices).totalSfl;
      }
      // Scale factor for cost helpers that compute costPerDay based on boosted cycle.
      // When login interval > boosted cycle, realisticCycle > cycle → fewer cycles
      // realized per day → lower realistic cost. Factor = cycle/realisticCycle (≤ 1).
      const costScale = (!isDailyOutput && cycle > 0 && realisticCycle > 0) ? (cycle / realisticCycle) : 1;

      let toolCostSfl = 0, lavaCostSfl = 0, seedCostSfl = 0, feedCostSfl = 0, sicknessCostSfl = 0;
      let toolInfo = null, seedInfo = null, feedInfo = null, sicknessInfo = null;

      // Tool cost (trees / stone / iron / gold / crimstone / oil)
      const TOOL_CATS = new Set(["stone", "iron", "gold", "crimstone", "trees", "oil"]);
      if (TOOL_CATS.has(catId) && nodeCount > 0) {
        const hasFreeTool = effects.some(e => e.type === "free_tool" && e.cat === catId);
        toolInfo = roiToolCostPerUnit(catId, exchangeRates, p2pPrices, stockMods);
        if (!hasFreeTool && toolInfo.sfl > 0) {
          const harvestsPerDay = realisticCycle > 0 ? (86400 / realisticCycle) * nodeCount : 0;
          toolCostSfl = toolInfo.sfl * harvestsPerDay;
        }
        toolInfo.freeTool = hasFreeTool;
      }

      // Lava-pit ingredient cost (obsidian only)
      if (catId === "obsidian" && nodeCount > 0 && season) {
        const lavaRedMult = effects.filter(e => e.type === "lava_cost_reduction" && e.cat === "obsidian")
                                    .reduce((acc, e) => acc * (1 - e.value), 1);
        const lavaBase = calcLavaPitCostPerDay(capacity, p2pPrices, season, 1);
        if (lavaBase.costPerIgnition > 0) {
          const ignitionsPerDay = realisticCycle > 0 ? (86400 / realisticCycle) * nodeCount : 0;
          lavaCostSfl = lavaBase.costPerIgnition * lavaRedMult * ignitionsPerDay;
        }
      }

      // Seed cost (crops / fruits / greenhouse) — calcSeedCostPerDay already uses boosted cycle,
      // so scale to realistic cycle.
      if (["crops", "fruits", "greenhouse"].includes(catId) && nodeCount > 0) {
        seedInfo = calcSeedCostPerDay(catId, product, capacity, exchangeRates, stockMods, effects, p2pPrices);
        seedCostSfl = (seedInfo?.costPerDay || 0) * costScale;
      }

      // Animal feed + sickness cost (chickens / cows / sheep) — 24h cycle, no login-cap scaling needed.
      // Override capacity.goldenAnimals based on scenario's free_feed effects so Gold Egg / Golden Cow /
      // Golden Sheep get scenario-correct treatment (sold → feed cost reappears).
      if (isAnimalCat(catId) && nodeCount > 0) {
        const animalType = ANIMAL_CAT_MAP[catId];
        const hasFreeFeed = effects.some(e => e.type === "free_feed" && e.cat === catId);
        const effCapacity = {
          ...capacity,
          goldenAnimals: { ...(capacity.goldenAnimals || {}), [animalType]: hasFreeFeed },
        };
        feedInfo = calcAnimalFeedCost(catId, effCapacity, p2pPrices, effects, stockMods);
        feedCostSfl = feedInfo?.costPerDay || 0;
        sicknessInfo = calcSicknessCost(catId, capacity, p2pPrices, scenarioBoostItems || [], farmSkills || {});
        sicknessCostSfl = sicknessInfo?.costPerDay || 0;
      }

      const netSfl = yieldSfl - toolCostSfl - lavaCostSfl - seedCostSfl - feedCostSfl - sicknessCostSfl;
      return { unitsPerDay, yieldSfl, toolCostSfl, lavaCostSfl, seedCostSfl, feedCostSfl, sicknessCostSfl, netSfl, cycle, realisticCycle, toolInfo, seedInfo, feedInfo, sicknessInfo };
    }

    function roiComputeCategory(catId, boostItems, capacity, p2pPrices, L, multicat, exchangeRates, stockMods, season, farmSkills, pets) {
      const product = roiPickProduct(catId);
      const priceProd = (typeof getPriceProduct === "function") ? getPriceProduct(catId, product) : product;
      const price = p2pPrices[priceProd] || p2pPrices[product] || 0;

      const itemsInCat = boostItems.filter(b => b.has && !b.isDisabled && b.categories.includes(catId));
      const sellableInCat = itemsInCat.filter(b => {
        if (!b.isSellable) return false;
        if (!b.isMultiCat) return true;
        const assigned = multicat[b.name] || b.quantCats[0];
        return assigned === catId;
      });
      const externallyAssigned = itemsInCat.filter(b =>
        b.isSellable && b.isMultiCat && (multicat[b.name] || b.quantCats[0]) !== catId
      );
      const saleSfl = sellableInCat.reduce((sum, b) => sum + b.floor, 0);

      const soldNames = new Set(sellableInCat.map(b => b.name));
      const allEffects = itemsInCat.flatMap(b => b.effects.filter(e => e.cat === catId));
      const keptEffects = itemsInCat.filter(b => !soldNames.has(b.name))
                                     .flatMap(b => b.effects.filter(e => e.cat === catId));

      const baseCycle = catId === "pets" ? 86400 : getCycleSec(catId, product);
      const nodeCount = catId === "pets" ? (pets?.length || 0) : getCapacityCount(catId, capacity);
      const isDailyOutput = (catId === "fishing" || catId === "bees" || catId === "pets");

      // Scenario boost-item lists (used by calcSicknessCost which needs items, not effects)
      const keptItems = boostItems.filter(b => b.has && !b.isDisabled && !soldNames.has(b.name));
      const allOwnedItems = boostItems.filter(b => b.has && !b.isDisabled);

      const keepScen = roiNetForScenario(catId, product, capacity, allEffects, p2pPrices, exchangeRates, stockMods, season, L, price, nodeCount, isDailyOutput, allOwnedItems, farmSkills, pets);
      const soldScen = roiNetForScenario(catId, product, capacity, keptEffects, p2pPrices, exchangeRates, stockMods, season, L, price, nodeCount, isDailyOutput, keptItems, farmSkills, pets);

      const cycleKeep = keepScen.cycle;
      const cycleSold = soldScen.cycle;
      const realisticCycleKeep = keepScen.realisticCycle;
      const realisticCycleSold = soldScen.realisticCycle;
      const yieldKeepSfl = keepScen.yieldSfl;
      const yieldSoldSfl = soldScen.yieldSfl;
      const toolCostKeep = keepScen.toolCostSfl;
      const toolCostSold = soldScen.toolCostSfl;
      const lavaCostKeep = keepScen.lavaCostSfl;
      const lavaCostSold = soldScen.lavaCostSfl;
      const seedCostKeep = keepScen.seedCostSfl;
      const seedCostSold = soldScen.seedCostSfl;
      const feedCostKeep = keepScen.feedCostSfl;
      const feedCostSold = soldScen.feedCostSfl;
      const sicknessCostKeep = keepScen.sicknessCostSfl;
      const sicknessCostSold = soldScen.sicknessCostSfl;
      const netKeepSfl = keepScen.netSfl;
      const netSoldSfl = soldScen.netSfl;
      const marginalSflPerDay = netKeepSfl - netSoldSfl;
      const loginInterval = 86400 / L;
      const wastedTimeBoost = !isDailyOutput && !isAnimalCat(catId) && nodeCount > 0 && cycleKeep > 0 && cycleKeep < loginInterval;

      let roiYears, verdict;
      if (sellableInCat.length === 0) {
        roiYears = NaN; verdict = "no-nfts";
      } else if (nodeCount === 0 && catId !== "fishing") {
        roiYears = Infinity; verdict = "no-nodes";
      } else if (marginalSflPerDay <= 0) {
        roiYears = -1; verdict = "sell-now";
      } else {
        roiYears = saleSfl / (marginalSflPerDay * 365);
        if (roiYears < 1) verdict = "keep";
        else if (roiYears < 5) verdict = "marginal";
        else verdict = "sell";
      }

      return {
        catId, product, price, nodeCount,
        sellableInCat, externallyAssigned, saleSfl,
        baseCycle, cycleKeep, cycleSold, realisticCycleKeep, realisticCycleSold,
        yieldKeepSfl, yieldSoldSfl,
        toolCostKeep, toolCostSold, lavaCostKeep, lavaCostSold,
        seedCostKeep, seedCostSold, feedCostKeep, feedCostSold, sicknessCostKeep, sicknessCostSold,
        netKeepSfl, netSoldSfl, marginalSflPerDay,
        toolInfoKeep: keepScen.toolInfo,
        seedInfoKeep: keepScen.seedInfo,
        feedInfoKeep: keepScen.feedInfo,
        sicknessInfoKeep: keepScen.sicknessInfo,
        roiYears, verdict, wastedTimeBoost, isDailyOutput,
      };
    }

export { ROI_FIXED_PRODUCTS, roiEffectiveCycleAtLogin, roiPickProduct, roiToolCostPerUnit, roiNetForScenario, roiComputeCategory };
