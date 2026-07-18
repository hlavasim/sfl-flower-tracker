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
//     skillCostInfo, exchangeRates, stockMods, season } and NOT farm/inventory/nftData
//     (the client already has farm+inventory; nftFloors covers the roadmap's nftData use).
//   - nftFloors: name → floor for every NFT (the page keeps whole nftData for roadmap's
//     nftFloor lookup; shipping just the floors map is far smaller).
import {
  parseBoostEffects, classifyToCategories, SKILL_FEED_EFFECTS,
} from "../engine/power-boosts.mjs";
import { computeBettyRate } from "../engine/prices.mjs";
import {
  findCollectible, getCount, getFactionMarkCost, marksToSfl,
  calcSkillPointCost, SKILL_TREE_DATA, POWER_CATEGORIES,
  detectFarmCapacity, detectStockModifiers,
  getEffectsForCategory, applyBoosts, calcToolCostPerDay, gameExtraEffects,
} from "../engine/power-helpers.mjs";

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

  // name → floor for EVERY nft (not just have_boost — the roadmap's nftFloor() is called
  // with arbitrary chest-reward names), replacing the page's whole-nftData retention.
  const nftFloors = {};
  for (const tk of ["collectibles", "wearables"]) {
    for (const it of (nftData[tk] || [])) {
      if (it && it.name) nftFloors[it.name] = parseFloat(it.floor) || 0;
    }
  }

  return { boostItems, capacity, p2pPrices, skillCostInfo, exchangeRates, stockMods, season, nftFloors };
}
