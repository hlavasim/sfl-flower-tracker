// Crop Machine economics — extracted VERBATIM from flowers.html 4028-4101 for the
// roadmap profitability block. Inline copies stay for the power-page restock panel.
import { CROP_GROW_DATA } from "./power-boosts.mjs";
import { SEED_COSTS } from "../data/economy.mjs";
import { findCollectible } from "./power-helpers.mjs";

    // ── flowers.html 4028-4101: crop machine cluster ──
    // Skill ranks (supplyCropMachine.ts, SKILL_RANKS): a taken skill stores its rank (1-3), an old
    // save `true` — rank 1. They were flat rank-1 values here, so L2/L3 were worth nothing.
    const _cmRank = (sk, name) => { const v = sk[name]; const n = Number(v); return n > 0 ? Math.min(3, n) : (v ? 1 : 0); };
    const _cmAt = (ranks, r) => ranks[r - 1];
    function cropMachinePlots(farm) {
      const r = _cmRank(farm.bumpkin?.skills || {}, "Field Extension Module");
      return 10 + (r ? _cmAt([5, 7, 10], r) : 0);
    }
    function cropMachineOilPerHour(farm) {
      const sk = farm.bumpkin?.skills || {};
      let addtl = 1;
      const cpu = _cmRank(sk, "Crop Processor Unit"), rig = _cmRank(sk, "Rapid Rig");
      if (cpu) addtl += _cmAt([0.1, 0.15, 0.2], cpu);
      if (rig) addtl += _cmAt([0.4, 0.5, 0.6], rig);
      let reduction = 1;
      const og = _cmRank(sk, "Oil Gadget"), eem = _cmRank(sk, "Efficiency Extension Module");
      if (og) reduction -= _cmAt([0.1, 0.15, 0.2], og);
      if (eem) reduction -= _cmAt([0.3, 0.4, 0.5], eem);
      return addtl * reduction;
    }
    // Crops unlocked for Crop Machine. Default basic set + skill-gated additions.
    const CROP_MACHINE_BASIC = ["Sunflower", "Potato", "Pumpkin"];
    const CROP_MACHINE_MODULE_I = ["Rhubarb", "Zucchini"];          // Crop Extension Module I
    const CROP_MACHINE_MODULE_II = ["Carrot", "Cabbage"];           // Crop Extension Module II
    const CROP_MACHINE_MODULE_III = ["Yam", "Broccoli"];            // Crop Extension Module III
    function cropMachineCrops(farm) {
      const sk = farm.bumpkin?.skills || {};
      const out = [...CROP_MACHINE_BASIC];
      if (sk["Crop Extension Module I"])   out.push(...CROP_MACHINE_MODULE_I);
      if (sk["Crop Extension Module II"])  out.push(...CROP_MACHINE_MODULE_II);
      if (sk["Crop Extension Module III"]) out.push(...CROP_MACHINE_MODULE_III);
      return out;
    }
    function cropMachineSpeedMult(farm, withTortoiseShrine) {
      const sk = farm.bumpkin?.skills || {};
      let m = 1;
      const cpu = _cmRank(sk, "Crop Processor Unit"), rig = _cmRank(sk, "Rapid Rig");
      if (cpu) m *= _cmAt([0.95, 0.9, 0.85], cpu);
      if (rig) m *= _cmAt([0.8, 0.7, 0.6], rig);
      // Placed anywhere the game looks — all four collectible maps (findCollectible), not just
      // the farm and the legacy home: a Gramophone in the house interior counted as absent.
      const hasGramo = findCollectible(farm, "Groovy Gramophone").length > 0;
      if (hasGramo) m *= 0.5;
      if (withTortoiseShrine) m *= 0.9;
      return m;
    }
    // Compute daily SFL net (revenue − oil − seed cost) for a given crop in the Crop Machine.
    // `yieldPerSeed` (optional): crops harvested per seed. harvestCropMachine.ts applies the
    // ordinary crop yield boosts to every seed of a pack, so this is section=power's
    // cropMachine.rows[].yieldPerSeed; without it a seed counts as exactly 1 crop.
    function calcCropMachineDaily(farm, cropName, p2pPrices, exchangeRates, withTortoiseShrine, yieldPerSeed) {
      const baseSec = CROP_GROW_DATA[cropName];
      if (!baseSec) return null;
      const plots = cropMachinePlots(farm);
      const speedMult = cropMachineSpeedMult(farm, !!withTortoiseShrine);
      const effSecPerCrop = baseSec * speedMult / plots;   // machine seconds per SEED
      const seedsPerDay = effSecPerCrop > 0 ? 86400 / effSecPerCrop : 0;
      const perSeed = yieldPerSeed > 0 ? yieldPerSeed : 1;
      const cropsPerDay = seedsPerDay * perSeed;
      const cropPrice = p2pPrices[cropName] || 0;
      const revenue = cropsPerDay * cropPrice;
      // Oil cost
      const oilPerHour = cropMachineOilPerHour(farm);
      const oilPerDay = oilPerHour * 24;
      const oilPrice = p2pPrices["Oil"] || 0;
      const oilCost = oilPerDay * oilPrice;
      // Seed cost (coins → SFL via coinsPerSFL)
      const seedCoinsPerCrop = SEED_COSTS[cropName] || 0;
      const coinsPerSFL = exchangeRates?.coinsPerSFL || 0;   // 0 = no live rate: seeds unpriced
      const seedCostPerDay = coinsPerSFL > 0 ? (seedsPerDay * seedCoinsPerCrop) / coinsPerSFL : 0;
      const net = revenue - oilCost - seedCostPerDay;
      return {
        crop: cropName, plots, speedMult, effSecPerCrop, seedsPerDay, yieldPerSeed: perSeed, cropsPerDay,
        revenue, oilPerDay, oilCost, seedCostPerDay, net,
      };
    }
    // Pick the most profitable available crop for the user's Crop Machine.
    function cropMachineBestCrop(farm, p2pPrices, exchangeRates) {
      const crops = cropMachineCrops(farm);
      let best = null;
      for (const c of crops) {
        const r = calcCropMachineDaily(farm, c, p2pPrices, exchangeRates, false);
        if (!r) continue;
        if (!best || r.net > best.net) best = r;
      }
      return best;
    }

    function farmHasCropMachine(farm) {
      return ((farm.buildings || {})["Crop Machine"] || []).length > 0;
    }

// Crop-yield NFTs that reach the machine (yield only — speed NFTs do not apply here). Mirrors
// gameExtraEffects's list but as a catalogue so an UNOWNED one can still be listed as available.
// scope: "all" | { tier } | { product }. kind: how ownership is checked.
// AOE collectibles (Sir Goldensnout, Scary Mike, Laurie, Queen Cornelia, the Gnome trio) are
// NOT here: harvest.ts applies them only to a crop on a PLOT inside their area, and a machine
// pack has no plot (harvestCropMachine → getCropYieldAmount without `plot`).
const CROP_MACHINE_NFTS = [
  { name: "Infernal Pitchfork", value: 3, scope: "all", kind: "wearable" },
  { name: "Cabbage Boy", value: 0.25, scope: { product: "Cabbage" }, kind: "collectible" },
  { name: "Cabbage Girl", value: 0.25, scope: { product: "Cabbage" }, kind: "collectible" },
  { name: "Karkinos", value: 0.1, scope: { product: "Cabbage" }, kind: "collectible" },
  { name: "Pablo The Bunny", value: 0.1, scope: { product: "Carrot" }, kind: "collectible" },
  { name: "Giant Yam", value: 0.5, scope: { product: "Yam" }, kind: "collectible" },
];
// Machine-only speed: the Gramophone halves the machine's grow time (cropMachineSpeedMult).
const CROP_MACHINE_SPEED_ITEMS = { "Groovy Gramophone": 0.5 };

/*
 * The machine's day when it grows SEVERAL crops. It has one queue, so the crops share its time:
 * each takes the share of the day its seeds need, capped by what the daily restocks supply
 * (`capSeeds`), richest crop first. Oil burns only while it runs, so an idle share costs
 * nothing. A crop that loses on its own gets no share — you would stop growing it.
 *
 * opts.yields     crops per seed by crop (section=power's panel; 1 when absent)
 * opts.capSeeds   (crop) => seeds per day the restocks allow (Infinity when absent)
 * opts.extraYield (crop) => extra crops per seed (valuing an NFT you do not own)
 * opts.speedFactor grow-time multiplier on top of the owned speed (valuing a speed item)
 */
function cropMachineMix(farm, crops, p2pPrices, exchangeRates, opts = {}) {
  const sf = opts.speedFactor || 1;
  const cands = [];
  for (const crop of crops) {
    const y = ((opts.yields || {})[crop] || 1) + (opts.extraYield ? opts.extraYield(crop) : 0);
    const r = calcCropMachineDaily(farm, crop, p2pPrices, exchangeRates, false, y);
    if (!r) continue;
    // Faster growth = more seeds through the same day; oil is per hour, so it does not change.
    const seedsPerDay = r.seedsPerDay / sf, revenue = r.revenue / sf, seedCost = r.seedCostPerDay / sf;
    cands.push({ crop, seedsPerDay, revenue, seedCost, oilCost: r.oilCost, net: revenue - r.oilCost - seedCost });
  }
  // Every crop's full-day figures share the same denominator (one day of machine time), so the
  // full-day net ranks them exactly as net per machine-hour would.
  cands.sort((a, b) => b.net - a.net);
  const rows = [];
  let left = 1, gross = 0, oilCost = 0, seedCost = 0;
  for (const c of cands) {
    if (left <= 1e-9 || !(c.net > 0)) break;
    const cap = opts.capSeeds ? opts.capSeeds(c.crop) : Infinity;
    const share = Math.min(left, c.seedsPerDay > 0 ? cap / c.seedsPerDay : 0);
    if (!(share > 0)) continue;
    left -= share;
    gross += c.revenue * share; oilCost += c.oilCost * share; seedCost += c.seedCost * share;
    rows.push({ crop: c.crop, share, seeds: c.seedsPerDay * share, gross: c.revenue * share,
      cost: (c.oilCost + c.seedCost) * share, net: c.net * share });
  }
  return { rows, gross, oilCost, seedCost, cost: oilCost + seedCost, net: gross - oilCost - seedCost, idle: left };
}

/*
 * What an item you do NOT own adds to that mix per day: the mix with it minus the mix without.
 * 0 for an item that does not reach the machine, and for one already counted — the yields the
 * mix reads already include owned boosts. The Cabbage trio follows the game's rules
 * (power-helpers gameExtraEffects): Cabbage Girl counts only next to Cabbage Boy, and Karkinos
 * only without him.
 */
function cropMachineItemGain(name, farm, crops, p2pPrices, exchangeRates, opts = {}) {
  let extra = null;
  const nft = CROP_MACHINE_NFTS.find((n) => n.name === name);
  if (nft) {
    const owns = (n) => findCollectible(farm, n).length > 0;
    if (name === "Cabbage Girl" && !owns("Cabbage Boy")) return 0;
    if (name === "Karkinos" && owns("Cabbage Boy")) return 0;
    const hits = (crop) => nft.scope === "all" || (nft.scope.product && nft.scope.product === crop);
    extra = { extraYield: (crop) => (hits(crop) ? nft.value : 0) };
  } else if (CROP_MACHINE_SPEED_ITEMS[name]) {
    if (findCollectible(farm, name).length > 0) return 0;   // already in cropMachineSpeedMult
    extra = { speedFactor: CROP_MACHINE_SPEED_ITEMS[name] };
  } else return 0;
  const base = cropMachineMix(farm, crops, p2pPrices, exchangeRates, opts).net;
  const withIt = cropMachineMix(farm, crops, p2pPrices, exchangeRates, Object.assign({}, opts, extra)).net;
  return Math.max(0, withIt - base);
}

export {
  CROP_MACHINE_NFTS, CROP_MACHINE_SPEED_ITEMS, cropMachineMix, cropMachineItemGain,
  cropMachinePlots, cropMachineOilPerHour, cropMachineCrops, cropMachineSpeedMult,
  calcCropMachineDaily, cropMachineBestCrop, farmHasCropMachine,
  CROP_MACHINE_BASIC, CROP_MACHINE_MODULE_I, CROP_MACHINE_MODULE_II, CROP_MACHINE_MODULE_III,
};
