// section=power — the POWER/ROADMAP page's shared state, extracted VERBATIM from
// flowers.html buildPowerState (15878-16087). The page function did three upstream
// fetches (sfl.world nfts / prices / exchange) and then pure assembly; the fetches move
// to api/compute.mjs and arrive here as parameters, the assembly is unchanged.
//
// Differences from the page (all mechanical, no math changes):
//   - `inventory` is derived as farm.inventory (the page's `data.inventory` is exactly
//     that — see fetchFarmData).
//   - `savedProducts` (localStorage) is NOT here — the client re-attaches it.
//   - `catBoosts` is built for internal use (oil price derivation) but NOT returned:
//     serializing it would duplicate every boostItem per category and sever the shared
//     object identity the page relies on. The client rebuilds it from boostItems with
//     the same filter loop.
//   - The returned object therefore carries { boostItems, capacity, p2pPrices,
//     skillCostInfo, exchangeRates, stockMods, season, nftData } and NOT farm/inventory
//     (the client already has both).
//   - nftData is SLIM: same {collectibles, wearables} shape but only the four fields the
//     page's consumers (roadmapBuildMissing, nftFloor) actually read.
import {
  parseBoostEffects, classifyToCategories, SKILL_FEED_EFFECTS,
} from "../engine/power-boosts.mjs";
import { computeBettyRate } from "../engine/prices.mjs";
import {
  findCollectible, getCount, getFactionMarkCost, marksToSfl,
  calcSkillPointCost, SKILL_TREE_DATA, POWER_CATEGORIES,
  detectFarmCapacity, detectStockModifiers, isAnimalCat,
  getEffectsForCategory, applyBoosts, calcToolCostPerDay, gameExtraEffects,
  getDefaultProduct,
} from "../engine/power-helpers.mjs";
import {
  unitToSfl, calcSeedCostPerDay, calcAnimalFeedCost, calcSicknessCost,
  calcLavaPitCostPerDay, getAnimalCatSfl, getPriceProduct, activeShrineEffects,
  buildQueueData,
} from "../engine/power-costs.mjs";
import { _setPowerContext, calcBoostValue } from "../engine/roadmap.mjs";

export function buildPowerSection(farm, p2p, nftData, exchange, settings = {}) {
  const inventory = farm.inventory || {};
  const wardrobe = farm.wardrobe || {};
  const skills = farm.bumpkin?.skills || {};

  // ── page 15883-15925 (fetch block): rate assembly on the passed responses ──
  const p2pPrices = {};
  const exchangeRates = { coinsPerSFL: 320, gemsPerSFL: 0, sflUsd: 0 };
  for (const [k, v] of Object.entries(p2p || {})) {
    p2pPrices[k] = parseFloat(v) || 0;
  }
  // Use Betty rate for coins→SFL (more accurate than API exchange rate)
  const betty = computeBettyRate(p2pPrices);
  if (betty.rate > 0) {
    exchangeRates.coinsPerSFL = betty.rate;
    exchangeRates.bettyItem = betty.item;
  }
  const rateResp = exchange || null;
  if (rateResp) {
    const coinTiers = Object.values(rateResp?.coins || rateResp?.data?.coins || {});
    const gemTiers = Object.values(rateResp?.gems || rateResp?.data?.gems || {});
    // Fallback to API rate if Betty rate failed
    if (!betty.rate && coinTiers.length > 0) {
      const best = coinTiers.reduce((a, b) => (b.coin / b.sfl) > (a.coin / a.sfl) ? b : a);
      exchangeRates.coinsPerSFL = best.coin / best.sfl;
    }
    if (gemTiers.length > 0) {
      const best = gemTiers.reduce((a, b) => (b.gem / (b.sfl * 0.7)) > (a.gem / (a.sfl * 0.7)) ? b : a);
      exchangeRates.gemsPerSFL = best.gem / (best.sfl * 0.7);
    }
    const _sflUsd = rateResp?.sfl?.usd || rateResp?.data?.sfl?.usd || 0;
    if (_sflUsd > 0) exchangeRates.sflUsd = _sflUsd;
  }

  // Detect farm capacity
  const capacity = detectFarmCapacity(farm);

  // Build boost items with parsed effects
  const boostItems = [];

  for (const item of (nftData.collectibles || [])) {
    if (!item.have_boost || !item.name || !item.boost_text) continue;
    const has = getCount(inventory, item.name) > 0 || findCollectible(farm, item.name).length > 0;
    const effects = parseBoostEffects(item.boost_text, item.name);
    const categories = classifyToCategories(effects);
    let floor = parseFloat(item.floor) || 0;
    const markCost = getFactionMarkCost(item.name);
    if (markCost > 0) floor = marksToSfl(markCost);
    boostItems.push({
      name: item.name, type: "Collectible", boost: item.boost_text,
      floor, supply: item.supply || 0,
      has, effects, categories, markCost,
    });
  }

  for (const item of (nftData.wearables || [])) {
    if (!item.have_boost || !item.name || !item.boost_text) continue;
    const has = (wardrobe[item.name] || 0) > 0;
    const effects = parseBoostEffects(item.boost_text, item.name);
    const categories = classifyToCategories(effects);
    let floor = parseFloat(item.floor) || 0;
    const markCost = getFactionMarkCost(item.name);
    if (markCost > 0) floor = marksToSfl(markCost);
    boostItems.push({
      name: item.name, type: "Wearable", boost: item.boost_text,
      floor, supply: item.supply || 0,
      has, effects, categories, markCost,
    });
  }

  // Inject non-NFT boost items (Helios Blacksmith, event decorations, etc.)
  // cost: { coins, materials } → converted to SFL as floor price
  const EXTRA_BOOST_ITEMS = [
    { name: "Gold Beetle", boost: "+0.1 Gold", type: "Collectible", cost: { coins: 10000, materials: { Gold: 20 } } },
    { name: "Stone Beetle", boost: "+0.1 Stone", type: "Collectible", cost: { coins: 1000, materials: { Stone: 20 } } },
    { name: "Iron Beetle", boost: "+0.1 Iron", type: "Collectible", cost: { coins: 2000, materials: { Iron: 20 } } },
    { name: "Gilded Swordfish", boost: "+0.1 Gold", type: "Collectible", cost: null }, // fishing reward, no craft cost
    { name: "Volcano Gnome", boost: "+0.1 Stone, Iron & Gold (Volcano Island)", type: "Collectible", cost: null }, // free (Volcano Island reward)
  ];
  for (const extra of EXTRA_BOOST_ITEMS) {
    if (boostItems.some(b => b.name === extra.name)) continue;
    const has = getCount(inventory, extra.name) > 0 || findCollectible(farm, extra.name).length > 0;
    const effects = parseBoostEffects(extra.boost, extra.name);
    const categories = classifyToCategories(effects);
    // Calculate craft cost in SFL
    let floor = 0;
    if (extra.cost && exchangeRates.coinsPerSFL > 0) {
      floor = (extra.cost.coins || 0) / exchangeRates.coinsPerSFL;
      if (extra.cost.materials) {
        for (const [mat, qty] of Object.entries(extra.cost.materials)) {
          floor += (p2pPrices[mat] || 0) * qty;
        }
      }
    }
    boostItems.push({
      name: extra.name, type: extra.type, boost: extra.boost,
      floor, supply: 0, has, effects, categories, markCost: 0,
    });
  }

  // Add skill boosts from full skill tree
  const skillCostInfo = calcSkillPointCost(farm.bumpkin, p2pPrices, farm);
  for (const [skillName, skill] of Object.entries(SKILL_TREE_DATA)) {
    const has = skills[skillName] !== undefined;
    const boostText = skill.buff + (skill.debuff ? "\n" + skill.debuff : "");
    const effects = parseBoostEffects(boostText);
    // Inject feed reduction effects for named animal skills
    if (SKILL_FEED_EFFECTS[skillName]) {
      for (const [cat, value] of Object.entries(SKILL_FEED_EFFECTS[skillName])) {
        effects.push({ type: "feed_reduction", value, cat });
      }
    }
    const categories = classifyToCategories(effects);
    // Add tree-based categories ONLY for skills the parser couldn't classify (ended up as "other" only)
    const hasOnlyOther = categories.length === 1 && categories[0] === "other";
    if (hasOnlyOther) {
      const TREE_TO_CATS = {
        "Animals": ["chickens", "cows", "sheep"],
        "Crops": ["crops"],
        "Fruit Patch": ["fruits"],
        "Greenhouse": ["greenhouse"],
        "Fishing": ["fishing"],
        "Mining": ["stone", "iron", "gold", "crimstone"],
        "Trees": ["trees"],
        "Bees & Flowers": ["bees", "flowers"],
        "Cooking": ["cooking"],
      };
      const treeCats = TREE_TO_CATS[skill.tree];
      if (treeCats) {
        categories.length = 0; // clear "other"
        categories.push(...treeCats);
      }
    }
    // Skill cost = skill points × SFL per skill point
    const skillFloor = skillCostInfo.sflPerPoint > 0 ? skill.points * skillCostInfo.sflPerPoint : 0;
    boostItems.push({
      name: skillName, type: "Skill", boost: boostText,
      floor: skillFloor, supply: 0, has, effects, categories,
      skillPoints: skill.points, skillTree: skill.tree, skillTier: skill.tier,
      isPower: skill.power || false,
    });
  }

  // Process "Disabled if X Active" — mark items superseded by stronger owned items
  for (const b of boostItems) {
    const disabledByEffects = b.effects.filter(e => e.type === "disabled_by");
    if (disabledByEffects.length > 0) {
      b.disabledBy = disabledByEffects.flatMap(e => e.names);
      b.effects = b.effects.filter(e => e.type !== "disabled_by"); // remove meta-effects
      // Check if any superseding item is active on this farm
      const activeSuperseder = b.disabledBy.find(name =>
        getCount(inventory, name) > 0 || findCollectible(farm, name).length > 0
        || (wardrobe[name] || 0) > 0 || skills[name] !== undefined
      );
      if (activeSuperseder) {
        b.isDisabled = true;
        b.disabledByName = activeSuperseder;
      }
    }
  }

  // Inject boosts the marketplace NFT API doesn't expose but the game applies (faithful port).
  const _extraEff = gameExtraEffects(farm);
  if (_extraEff.length) boostItems.push({ name: "Game boosts (API-missing)", type: "Game", boost: _extraEff.map(e => e.raw).join(" · "), floor: 0, supply: 0, has: true, effects: _extraEff, categories: classifyToCategories(_extraEff), markCost: 0 });

  // Build category → boosts mapping
  const catBoosts = {};
  for (const catId of Object.keys(POWER_CATEGORIES)) {
    catBoosts[catId] = boostItems.filter(b => b.categories.includes(catId));
  }

  // Detect stock modifiers for cost calculations
  const stockMods = detectStockModifiers(farm);

  // Detect current season
  const season = (farm.season?.season || "").toLowerCase();

  // Oil isn't p2p-traded — derive its unit value from drill cost / boosted yield (like the Power page),
  // so Crop Machine + greenhouse oil costs show up. Priced at real coin cost (oil is a mined resource).
  // NOTE: farm/effects are deliberately NOT passed to applyBoosts/calcToolCostPerDay here —
  // on the page this ran while the powerState global was still null, so the per-node engine
  // and owned-effects paths never fired during build (see power-helpers.mjs header).
  try {
    const _oilEff = (catBoosts["oil"] || []).filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, "oil"));
    const _oilYield = applyBoosts("oil", "Oil", capacity, _oilEff).unitsPerDay;
    const _oilTool = calcToolCostPerDay("oil", capacity, exchangeRates, p2pPrices, stockMods);
    if (_oilYield > 0 && _oilTool.costPerDay > 0) p2pPrices["Oil"] = _oilTool.costPerDay / _oilYield;
  } catch {}

  // Slim nftData for the client — the page kept the WHOLE upstream response on
  // powerState.nftData, but its two remaining consumers (roadmapBuildMissing iterating
  // collectibles/wearables; nftFloor reading floors) touch exactly these four fields.
  // Same shape, so both consumers work verbatim on the slim copy.
  const nftSlim = {};
  for (const tk of ["collectibles", "wearables"]) {
    nftSlim[tk] = (nftData[tk] || []).filter((it) => it && it.name).map((it) => ({
      name: it.name, floor: it.floor, boost_text: it.boost_text, supply: it.supply,
    }));
  }

  // ── categories: renderPowerContent's per-category summary pipeline (page ~18100-18190),
  // ported VERBATIM with powerState reads parameterized. Runs on the same catBoosts built
  // above; `settings.savedProducts` mirrors the page's product selectors (query `products`).
  const savedProducts = settings.savedProducts || {};
  // Page's roadmapOwnedEffects verbatim: has-only (NOT filtered on isDisabled), plus
  // active shrine effects. miningToolsPerDay/calcToolCostPerDay consumed THIS set at
  // render time via the powerState global — the summary loop's own ownedEffects
  // (has && !isDisabled) is a different, narrower set used only for applyBoosts.
  const roadmapOwnedEff = (cat) => boostItems.filter(b => b.has).flatMap(b => b.effects.filter(e => e.cat === cat)).concat(activeShrineEffects(farm, cat));

  // Derive Oil unit cost from actual drill cost / actual boosted yield
  // Uses farm's real boosts (Infernal Drill = free, yield boosts, speed boosts)
  const oilOwnedEffects = (catBoosts["oil"] || []).filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, "oil"));
  const oilBoostedResult = applyBoosts("oil", "Oil", capacity, oilOwnedEffects);
  // render-time semantics: powerState was SET on the page here, so the tool calc saw the
  // farm's physical nodes and the roadmap-owned boosted cycle — pass both explicitly.
  const oilToolInfo = calcToolCostPerDay("oil", capacity, exchangeRates, p2pPrices, stockMods, undefined, farm, roadmapOwnedEff("oil"));
  if (oilBoostedResult.unitsPerDay > 0 && oilToolInfo.costPerDay > 0) {
    p2pPrices["Oil"] = oilToolInfo.costPerDay / oilBoostedResult.unitsPerDay;
  } else if (oilBoostedResult.unitsPerDay > 0) {
    p2pPrices["Oil"] = 0; // free drilling (Infernal Drill) → oil is free
  }

  let totalBaseSfl = 0, totalBoostedSfl = 0, totalCostSfl = 0;
  const catSummaries = {};
  for (const [catId, catDef] of Object.entries(POWER_CATEGORIES)) {
    if (!catDef.quantifiable) continue;
    const product = savedProducts[catId] || getDefaultProduct(catId);
    const ownedEffects = catBoosts[catId].filter(b => b.has && !b.isDisabled).flatMap(b => getEffectsForCategory(b, catId)).concat(activeShrineEffects(farm, catId));

    let baseSfl, boostedSfl, boostedUnitsPerDay = 0;
    let animalBreakdown = null;
    if (isAnimalCat(catId)) {
      const baseInfo = getAnimalCatSfl(catId, capacity, [], p2pPrices);
      const boostedInfo = getAnimalCatSfl(catId, capacity, ownedEffects, p2pPrices);
      baseSfl = baseInfo.totalSfl;
      boostedSfl = boostedInfo.totalSfl;
      animalBreakdown = boostedInfo.breakdown;
    } else {
      const priceProduct = getPriceProduct(catId, product);
      const baseResult = applyBoosts(catId, product, capacity, [], farm);
      baseSfl = unitToSfl(baseResult.unitsPerDay, priceProduct, p2pPrices);
      const boostedResult = applyBoosts(catId, product, capacity, ownedEffects, farm);
      boostedSfl = unitToSfl(boostedResult.unitsPerDay, priceProduct, p2pPrices);
      boostedUnitsPerDay = boostedResult.unitsPerDay;
    }

    // Calculate production costs (with and without discounts)
    let costPerDay = 0, restockPerDay = 0, costDetails = null;
    let baseCostPerDay = 0; // cost WITHOUT skill discounts
    if (catId === "crops" || catId === "fruits" || catId === "greenhouse") {
      const c = calcSeedCostPerDay(catId, product, capacity, exchangeRates, stockMods, ownedEffects, p2pPrices);
      costPerDay = c.costPerDay;
      baseCostPerDay = c.costPerDay; // seeds have no skill discount
      restockPerDay = c.restockPerDay;
      costDetails = c;
    } else if (catId === "obsidian") {
      // Check for lava cost reduction effects (e.g., Lava Swimwear -50%)
      const lavaCostMult = ownedEffects
        .filter(e => e.type === "lava_cost_reduction")
        .reduce((acc, e) => acc * (1 - e.value), 1);
      const c = calcLavaPitCostPerDay(capacity, p2pPrices, season, lavaCostMult);
      const cBase = calcLavaPitCostPerDay(capacity, p2pPrices, season);
      costPerDay = c.costPerDay;
      baseCostPerDay = cBase.costPerDay;
      costDetails = c;
    } else if (["trees", "stone", "iron", "gold", "crimstone", "oil"].includes(catId)) {
      const c = calcToolCostPerDay(catId, capacity, exchangeRates, p2pPrices, stockMods, undefined, farm, roadmapOwnedEff(catId));
      const cBase = calcToolCostPerDay(catId, capacity, exchangeRates, p2pPrices, stockMods, true, farm, roadmapOwnedEff(catId));
      costPerDay = c.costPerDay;
      baseCostPerDay = cBase.costPerDay;
      restockPerDay = c.restockPerDay;
      costDetails = c;
      costDetails.baseCostPerDay = cBase.costPerDay;
      costDetails.baseToolSfl = cBase.toolSfl;
    } else if (isAnimalCat(catId)) {
      const c = calcAnimalFeedCost(catId, capacity, p2pPrices, ownedEffects, stockMods);
      const cBase = calcAnimalFeedCost(catId, capacity, p2pPrices, [], stockMods);
      // Add sickness cost
      const sc = calcSicknessCost(catId, capacity, p2pPrices, boostItems, skills);
      const scBase = calcSicknessCost(catId, capacity, p2pPrices, [], {});
      costPerDay = c.costPerDay + sc.costPerDay;
      baseCostPerDay = cBase.costPerDay + scBase.costPerDay;
      costDetails = c;
      costDetails.sicknessCost = sc;
      costDetails.sicknessBaseCost = scBase;
    }
    const totalCatCost = costPerDay + restockPerDay;
    const totalCatBaseCost = baseCostPerDay + restockPerDay;
    totalCostSfl += totalCatCost;

    totalBaseSfl += baseSfl;
    totalBoostedSfl += boostedSfl;
    catSummaries[catId] = { baseSfl, boostedSfl, delta: boostedSfl - baseSfl, product, boostedUnitsPerDay, animalBreakdown, costPerDay: totalCatCost, baseCostPerDay: totalCatBaseCost, costSavings: totalCatBaseCost - totalCatCost, costDetails };
  }
  // Restock (localStorage settings) stays client-side; totals here cover the per-category
  // pipeline only — exactly the part the page's loop computed before its restock block.
  const categories = { catSummaries, totalBaseSfl, totalBoostedSfl, totalCostSfl, oilPrice: p2pPrices["Oil"] };

  // ── restockQueues: buildQueueData verbatim (page ~18114). The page's restock
  // SETTINGS (mode/trigger/activeQueues) are localStorage-only interactive state and
  // calcRestockCost on them is trivial — queues are the computed part, so THEY ship;
  // the client keeps calcRestockCost so toggles stay instant with no refetch.
  const restockQueues = buildQueueData(savedProducts, capacity, exchangeRates, stockMods, catBoosts, p2pPrices, farm);

  // ── boostValues: per-(boost, category) solo/synergy/ROI via the roadmap engine
  // (core/engine/roadmap.mjs), replacing renderPowerContent's three calcBoostValue call
  // sites. Placed AFTER the categories block so the engine sees the render-time Oil
  // price mutation, exactly like the page. `roadmapSettingsRaw` = the client's
  // localStorage sfl_roadmap_settings (query `roadmap`) — marketFee/coinsFree/… feed
  // into the valuations even though calcBoostValue forces effMode theoretical.
  // roi: Infinity is JSON-unrepresentable → null on the wire (client maps back).
  _setPowerContext({ farm, inventory, capacity, exchangeRates, stockMods, p2pPrices, boostItems, savedProducts, season, nftData: nftSlim, roadmapSettingsRaw: settings.roadmapSettings || {} });
  const boostValues = {};
  for (const [catId, catDef] of Object.entries(POWER_CATEGORIES)) {
    if (!catDef.quantifiable) continue;
    const product = savedProducts[catId] || getDefaultProduct(catId);
    boostValues[catId] = {};
    for (const b of catBoosts[catId]) {
      try {
        const v = calcBoostValue(b, catId, product, capacity, p2pPrices, catBoosts[catId], b.has);
        if (!isFinite(v.roi)) v.roi = null;
        if (!isFinite(v.solo)) v.solo = 0;
        if (!isFinite(v.synergy)) v.synergy = 0;
        boostValues[catId][b.name] = v;
      } catch {}
    }
  }

  return { boostItems, capacity, p2pPrices, skillCostInfo, exchangeRates, stockMods, season, nftData: nftSlim, categories, boostValues, restockQueues };
}
