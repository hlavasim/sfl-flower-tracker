// Pet leveling helpers + name→species map — extracted VERBATIM from flowers.html
// (petCumulativeXp/petLevel 22345-22359, PET_NAME_SPECIES 22157-22166) for
// core/sections/roi.mjs. The inline copies stay until the pets page migrates. DOM-free.

    // Parse pets from farm data (mirrors renderPets parsing logic)
    const PET_NAME_SPECIES = {
      "Barkley":"Dog","Biscuit":"Dog","Cloudy":"Dog",
      "Meowchi":"Cat","Butters":"Cat","Smokey":"Cat",
      "Twizzle":"Owl","Flicker":"Owl","Pippin":"Owl",
      "Burro":"Horse","Pinto":"Horse","Roan":"Horse","Stallion":"Horse",
      "Mudhorn":"Bull","Bison":"Bull","Oxen":"Bull",
      "Nibbles":"Hamster","Peanuts":"Hamster",
      "Waddles":"Penguin","Pip":"Penguin","Skipper":"Penguin",
    };

    // XP to reach level L = 50 * L * (L - 1)  (each level costs 100 * currentLevel XP)
    function petCumulativeXp(level) { return 50 * level * (level - 1); }
    function petXpForLevel(level) { return 100 * level; } // XP needed to go FROM this level to next

    function petLevel(xp) {
      // Solve 50*L*(L-1) <= xp  =>  L = floor((1 + sqrt(1 + xp/12.5)) / 2)
      if (xp <= 0) return 1;
      const L = Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2);
      // Clamp: verify and adjust
      if (petCumulativeXp(L + 1) <= xp) return L + 1;
      if (petCumulativeXp(L) > xp) return Math.max(1, L - 1);
      return Math.max(1, L);
    }

export { PET_NAME_SPECIES, petCumulativeXp, petXpForLevel, petLevel };

import { PET_FETCH_DATA } from "../data/pets.mjs";

    // ── flowers.html 22047: PET_REQUEST_VALUES ──
    const PET_REQUEST_VALUES = { easy:{xp:20,energy:20}, medium:{xp:100,energy:100}, hard:{xp:300,energy:300} };

    // ── flowers.html 22088-22123: per-level perk helpers ──
    // ── Pet calculator helpers ──
    function petRequestsAtLevel(level, isNft) {
      const r = ["easy","medium"];
      if (isNft || level >= 10) r.push("hard");
      if (isNft && level >= 30) r.push("medium");  // 2nd medium
      if (isNft && level >= 200) r.push("hard");    // 2nd hard
      return r;
    }

    function petEnergyFromRequests(level, isNft) {
      return petRequestsAtLevel(level, isNft).reduce((s, r) => s + PET_REQUEST_VALUES[r].energy, 0);
    }

    function petFetchEnergyBonus(level) {
      let b = 0;
      if (level >= 5)  b += 5;
      if (level >= 35) b += 5;
      if (level >= 75) b += 5;
      return b;
    }

    function petExtraResourceChance(level) {
      let c = 0;
      if (level >= 15)  c += 0.10;
      if (level >= 50)  c += 0.05;
      if (level >= 100) c += 0.10;
      return c;
    }

    function petXpBonusMultiplier(level, isNft) {
      let m = 0;
      if (level >= 27) m += 0.10;
      if (isNft && level >= 40) m += 0.15;
      if (isNft && level >= 85) m += 0.25;
      return m;
    }

    // ── flowers.html 22125-22176: petDailyCalc ──
    function petDailyCalc(pet, p2pPrices, feedMult, hasPetBowls) {
      const reqTypes = petRequestsAtLevel(pet.level, pet.isNft);
      const reqEnergy = reqTypes.reduce((s, r) => s + PET_REQUEST_VALUES[r].energy, 0);
      const fetchBonus = petFetchEnergyBonus(pet.level);
      const energyPerFeed = reqEnergy + fetchBonus;
      const dailyEnergy = energyPerFeed * feedMult;

      // XP per feed
      const reqXp = reqTypes.reduce((s, r) => s + PET_REQUEST_VALUES[r].xp + (hasPetBowls ? 10 : 0), 0);
      const xpMult = 1 + petXpBonusMultiplier(pet.level, pet.isNft);
      const dailyXp = reqXp * xpMult * feedMult;

      // Best resource
      const fetchData = PET_FETCH_DATA[pet.petType] || [];
      const unlocked = fetchData.filter(f => pet.level >= f.level);
      const extraChance = petExtraResourceChance(pet.level);

      let bestRes = null, bestSflPerEnergy = 0;
      for (const f of unlocked) {
        const price = p2pPrices[f.res] || 0;
        const sflPerE = price / f.energy;
        if (sflPerE > bestSflPerEnergy) {
          bestSflPerEnergy = sflPerE;
          bestRes = f;
        }
      }

      let dailySfl = 0, fetchesPerDay = 0;
      if (bestRes) {
        fetchesPerDay = dailyEnergy / bestRes.energy;
        dailySfl = fetchesPerDay * (p2pPrices[bestRes.res] || 0) * (1 + extraChance);
      }

      // Acorn bonus at Lv18+
      let acornBonus = 0;
      if (pet.level >= 18) {
        acornBonus = (p2pPrices["Acorn"] || 0) * feedMult;
        dailySfl += acornBonus;
      }

      // Guaranteed non-Acorn/Moonfur resource at Lv60+ (NFT only)
      let guaranteedBonus = 0;
      if (pet.isNft && pet.level >= 60) {
        const nonAcornRes = unlocked.filter(f => f.res !== "Acorn" && f.res !== "Moonfur");
        const bestNonAcornPrice = nonAcornRes.reduce((best, f) => Math.max(best, p2pPrices[f.res] || 0), 0);
        guaranteedBonus = bestNonAcornPrice * fetchesPerDay;
        dailySfl += guaranteedBonus;
      }

      return { reqTypes, reqEnergy, fetchBonus, energyPerFeed, dailyEnergy, reqXp, xpMult,
               dailyXp, bestRes, bestSflPerEnergy, extraChance, dailySfl, fetchesPerDay, acornBonus, guaranteedBonus, feedMult };
    }

export {
  PET_REQUEST_VALUES, petRequestsAtLevel, petEnergyFromRequests,
  petFetchEnergyBonus, petExtraResourceChance, petXpBonusMultiplier, petDailyCalc,
};

