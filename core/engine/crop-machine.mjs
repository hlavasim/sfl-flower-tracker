// Crop Machine economics — extracted VERBATIM from flowers.html 4028-4101 for the
// roadmap profitability block. Inline copies stay for the power-page restock panel.
import { CROP_GROW_DATA } from "./power-boosts.mjs";
import { SEED_COSTS } from "../data/economy.mjs";

    // ── flowers.html 4028-4101: crop machine cluster ──
    function cropMachinePlots(farm) {
      return (farm.bumpkin?.skills?.["Field Extension Module"]) ? 15 : 10;
    }
    function cropMachineOilPerHour(farm) {
      const sk = farm.bumpkin?.skills || {};
      let addtl = 1;
      if (sk["Crop Processor Unit"]) addtl += 0.1;
      if (sk["Rapid Rig"]) addtl += 0.4;
      let reduction = 1;
      if (sk["Oil Gadget"]) reduction -= 0.1;
      if (sk["Efficiency Extension Module"]) reduction -= 0.3;
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
      const placed = (farm.collectibles || {});
      const placedHome = (farm.home?.collectibles || {});
      let m = 1;
      if (sk["Crop Processor Unit"]) m *= 0.95;
      if (sk["Rapid Rig"]) m *= 0.8;
      const hasGramo = (placed["Groovy Gramophone"]?.length || 0) > 0 || (placedHome["Groovy Gramophone"]?.length || 0) > 0;
      if (hasGramo) m *= 0.5;
      if (withTortoiseShrine) m *= 0.9;
      return m;
    }
    // Compute daily SFL net (revenue − oil − seed cost) for a given crop in the Crop Machine.
    function calcCropMachineDaily(farm, cropName, p2pPrices, exchangeRates, withTortoiseShrine) {
      const baseSec = CROP_GROW_DATA[cropName];
      if (!baseSec) return null;
      const plots = cropMachinePlots(farm);
      const speedMult = cropMachineSpeedMult(farm, !!withTortoiseShrine);
      const effSecPerCrop = baseSec * speedMult / plots;
      const cropsPerDay = effSecPerCrop > 0 ? 86400 / effSecPerCrop : 0;
      const cropPrice = p2pPrices[cropName] || 0;
      const revenue = cropsPerDay * cropPrice;
      // Oil cost
      const oilPerHour = cropMachineOilPerHour(farm);
      const oilPerDay = oilPerHour * 24;
      const oilPrice = p2pPrices["Oil"] || 0;
      const oilCost = oilPerDay * oilPrice;
      // Seed cost (coins → SFL via coinsPerSFL)
      const seedCoinsPerCrop = SEED_COSTS[cropName] || 0;
      const coinsPerSFL = exchangeRates?.coinsPerSFL || 320;
      const seedCostPerDay = (cropsPerDay * seedCoinsPerCrop) / coinsPerSFL;
      const net = revenue - oilCost - seedCostPerDay;
      return {
        crop: cropName, plots, speedMult, effSecPerCrop, cropsPerDay,
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

export {
  cropMachinePlots, cropMachineOilPerHour, cropMachineCrops, cropMachineSpeedMult,
  calcCropMachineDaily, cropMachineBestCrop, farmHasCropMachine,
  CROP_MACHINE_BASIC, CROP_MACHINE_MODULE_I, CROP_MACHINE_MODULE_II, CROP_MACHINE_MODULE_III,
};
