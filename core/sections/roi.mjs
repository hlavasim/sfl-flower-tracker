// section=roi — the ROI vs LOGIN FREQUENCY page's state, extracted VERBATIM from
// flowers.html renderRoi's fetch+assembly block (20953-20998) plus its two builders
// buildRoiBoostItems (20642-20701) and parseRoiPets (20556-20574). The page duplicated
// buildPowerState's whole upstream-fetch + rate-math block with small deviations (no
// data.* fallbacks on the exchange response, sflUsd kept separate, no bettyItem) — those
// deviations are preserved exactly. The 4th upstream (coingecko BTC) arrives as a
// number; a failed fetch was btcUsd=0 on the page and stays that way.
//
// Client-only bits NOT here: roiState.farm (client re-attaches) and everything
// localStorage (logins/currency/multicat/sell-selection are render-time settings).
import {
  parseBoostEffects, classifyToCategories, SKILL_FEED_EFFECTS,
} from "../engine/power-boosts.mjs";
import { computeBettyRate } from "../engine/prices.mjs";
import {
  findCollectible, getCount, getFactionMarkCost, marksToSfl,
  SKILL_TREE_DATA, detectFarmCapacity, detectStockModifiers,
} from "../engine/power-helpers.mjs";
import { PET_NAME_SPECIES, petLevel } from "../engine/pets.mjs";
import { roiComputeCategory } from "../engine/roi-calc.mjs";

    const ROI_QUANT_CATS = ["trees", "stone", "iron", "gold", "crimstone", "obsidian", "oil",
                            "crops", "fruits", "greenhouse", "flowers",
                            "chickens", "cows", "sheep", "fishing", "bees", "pets"];

    // Parse pets from farm data (mirrors renderPets parsing logic)
    function parseRoiPets(farm) {
      const pets = [];
      const commonPets = farm.pets?.common || {};
      for (const [name, pet] of Object.entries(commonPets)) {
        const xp = pet.experience || 0;
        const level = petLevel(xp);
        pets.push({ name, petType: PET_NAME_SPECIES[name] || null, species: PET_NAME_SPECIES[name] || null,
                    level, xp, energy: pet.energy || 0, foods: pet.requests?.food || [], isNft: false, nftId: null });
      }
      const nftPets = farm.pets?.nfts || {};
      for (const [id, pet] of Object.entries(nftPets)) {
        const xp = pet.experience || 0;
        const level = petLevel(xp);
        const petType = pet.traits?.type || "Unknown";
        pets.push({ name: petType, petType, species: petType, level, xp, energy: pet.energy || 0,
                    foods: pet.requests?.food || [], isNft: true, nftId: id });
      }
      return pets;
    }

    function buildRoiBoostItems(farm, inventory, wardrobe, skills, nftData) {
      const boostItems = [];
      if (nftData) {
        for (const item of (nftData.collectibles || [])) {
          if (!item.have_boost || !item.name || !item.boost_text) continue;
          const has = getCount(inventory, item.name) > 0 || findCollectible(farm, item.name).length > 0;
          const effects = parseBoostEffects(item.boost_text, item.name);
          const categories = classifyToCategories(effects);
          let floor = parseFloat(item.floor) || 0;
          const markCost = getFactionMarkCost(item.name);
          if (markCost > 0) floor = marksToSfl(markCost);
          boostItems.push({ name: item.name, type: "Collectible", boost: item.boost_text, floor, has, effects, categories });
        }
        for (const item of (nftData.wearables || [])) {
          if (!item.have_boost || !item.name || !item.boost_text) continue;
          const has = (wardrobe[item.name] || 0) > 0;
          const effects = parseBoostEffects(item.boost_text, item.name);
          const categories = classifyToCategories(effects);
          let floor = parseFloat(item.floor) || 0;
          const lastSale = parseFloat(item.lastSalePrice) || 0;
          if (floor <= 0 && lastSale > 0) floor = lastSale;
          const markCost = getFactionMarkCost(item.name);
          if (markCost > 0) floor = marksToSfl(markCost);
          boostItems.push({ name: item.name, type: "Wearable", boost: item.boost_text, floor, has, effects, categories });
        }
      }
      // Skills — non-sellable, included so their boost effects participate in yield calc
      for (const [skillName, skill] of Object.entries(SKILL_TREE_DATA)) {
        const has = skills[skillName] !== undefined;
        const boostText = skill.buff + (skill.debuff ? "\n" + skill.debuff : "");
        const effects = parseBoostEffects(boostText);
        if (SKILL_FEED_EFFECTS[skillName]) {
          for (const [cat, value] of Object.entries(SKILL_FEED_EFFECTS[skillName])) {
            effects.push({ type: "feed_reduction", value, cat });
          }
        }
        const categories = classifyToCategories(effects);
        boostItems.push({ name: skillName, type: "Skill", boost: boostText, floor: 0, has, effects, categories });
      }
      // Disabled-by detection
      for (const b of boostItems) {
        const disabledByEffects = b.effects.filter(e => e.type === "disabled_by");
        if (disabledByEffects.length > 0) {
          b.disabledBy = disabledByEffects.flatMap(e => e.names);
          b.effects = b.effects.filter(e => e.type !== "disabled_by");
          const activeSuperseder = b.disabledBy.find(name =>
            getCount(inventory, name) > 0 || findCollectible(farm, name).length > 0
            || (wardrobe[name] || 0) > 0 || skills[name] !== undefined
          );
          if (activeSuperseder) { b.isDisabled = true; b.disabledByName = activeSuperseder; }
        }
      }
      // Mark quant categories, multi-cat, sellable
      for (const b of boostItems) {
        b.quantCats = b.categories.filter(c => ROI_QUANT_CATS.includes(c));
        b.isMultiCat = b.quantCats.length > 1;
        b.isSellable = b.type !== "Skill" && b.floor > 0;
      }
      return boostItems;
    }

export function buildRoiSection(farm, p2p, nftData, exchange, btcUsd, settings = {}) {
  const inventory = farm.inventory || {};
  const wardrobe = farm.wardrobe || {};
  const skills = farm.bumpkin?.skills || {};

  // ── page 20953-20986: rate assembly, ROI's own variant (kept verbatim) ──
  const p2pPrices = {};
  const exchangeRates = { coinsPerSFL: 320, gemsPerSFL: 0 };
  let sflUsd = 0;
  for (const [k, v] of Object.entries(p2p || {})) p2pPrices[k] = parseFloat(v) || 0;
  const rateResp = exchange || null;
  sflUsd = rateResp?.sfl?.usd || 0;

  const betty = computeBettyRate(p2pPrices);
  if (betty.rate > 0) { exchangeRates.coinsPerSFL = betty.rate; }
  if (rateResp) {
    const coinTiers = Object.values(rateResp?.coins || {});
    const gemTiers = Object.values(rateResp?.gems || {});
    if (!betty.rate && coinTiers.length > 0) {
      const best = coinTiers.reduce((a, b) => (b.coin / b.sfl) > (a.coin / a.sfl) ? b : a);
      exchangeRates.coinsPerSFL = best.coin / best.sfl;
    }
    if (gemTiers.length > 0) {
      const best = gemTiers.reduce((a, b) => (b.gem / (b.sfl * 0.7)) > (a.gem / (a.sfl * 0.7)) ? b : a);
      exchangeRates.gemsPerSFL = best.gem / (best.sfl * 0.7);
    }
  }

  const capacity = detectFarmCapacity(farm);
  const stockMods = detectStockModifiers(farm);
  const season = (farm.season?.season || "").toLowerCase();
  const boostItems = buildRoiBoostItems(farm, inventory, wardrobe, skills, nftData);
  const pets = parseRoiPets(farm);

  // ── rowsByLogins: renderRoiContent's per-category computation (roiComputeCategory,
  // now in core/engine/roi-calc.mjs), precomputed for ALL FOUR login frequencies so the
  // page's 1×-4× toggle re-renders with no refetch. `settings.multicat` mirrors the
  // page's localStorage multicat assignment (query `multicat`); non-finite roiYears
  // (NaN=no-nfts, Infinity=no-nodes) become null on the wire — the client maps null
  // back to Infinity, display-equivalent ("∞") for both.
  const farmSkills = farm.bumpkin?.skills || {};
  const multicat = settings.multicat || {};
  const rowsByLogins = {};
  for (const L of [1, 2, 3, 4]) {
    const rows = [];
    for (const X of ROI_QUANT_CATS) {
      const row = roiComputeCategory(X, boostItems, capacity, p2pPrices, L, multicat, exchangeRates, stockMods, season, farmSkills, pets);
      if (row) {
        if (!isFinite(row.roiYears)) row.roiYears = null;
        rows.push(row);
      }
    }
    rowsByLogins[L] = rows;
  }

  return { boostItems, capacity, p2pPrices, sflUsd, btcUsd: btcUsd || 0, exchangeRates, stockMods, season, pets, rowsByLogins };
}
