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

import { PET_FETCH_DATA, PET_REQUESTS, PET_REQUEST_XP } from "../data/pets.mjs";

    // ── Feeding: ports of feedPet.ts (getPetFoodRequests / getPetEnergy /
    // getPetExperience) so the feeding table matches the game rather than the
    // page's older per-day averages. ──

    // game: FOOD_TO_DIFFICULTY
    const PET_FOOD_DIFFICULTY = {};
    for (const [difficulty, foods] of Object.entries(PET_REQUESTS)) {
      for (const food of foods) PET_FOOD_DIFFICULTY[food] = difficulty;
    }
    function petFoodDifficulty(food) { return PET_FOOD_DIFFICULTY[food] || null; }

    // requests.food holds the full draw; the game shows only what the pet's level has
    // unlocked. Common <10: 1 easy + 1 medium (no hard). NFT <30: 1/1/1, <200: 1 easy +
    // 2 medium + 1 hard, 200+: everything. Anything else: the draw as-is.
    function petFoodRequests(foods, level, isNft) {
      const requests = Array.isArray(foods) ? [...foods] : [];
      const capped = (caps, max) => {
        const out = [], used = { easy: 0, medium: 0, hard: 0 };
        for (const food of requests) {
          const d = petFoodDifficulty(food);
          if (!d || used[d] >= (caps[d] || 0)) continue;
          out.push(food);
          used[d]++;
          if (out.length === max) break;
        }
        return out;
      };
      if (isNft) {
        if (level < 30) return capped({ easy: 1, medium: 1, hard: 1 }, 3);
        if (level < 200) return capped({ easy: 1, medium: 2, hard: 1 }, 4);
        return requests;
      }
      if (level < 10) {
        // The game takes the first two non-hard requests, whatever their difficulty mix.
        const out = [];
        for (const food of requests) {
          const d = petFoodDifficulty(food);
          if (d && d !== "hard") { out.push(food); if (out.length === 2) break; }
        }
        return out;
      }
      return requests;
    }

    const PET_AURA_ENERGY_MULT = { "No Aura": 1, "Common Aura": 1.5, "Rare Aura": 2, "Mythic Aura": 3 };
    const PET_BIB_XP = { "Baby Bib": 0, "Collar": 5, "Gold Necklace": 10 };
    const _petRound2 = (n) => Math.round(n * 100) / 100;

    // getPetEnergy: flat level bonuses first, THEN the NFT aura multiplies them too,
    // and the wearable's +5 lands after the multiplier.
    function petFeedEnergy(baseEnergy, { level = 1, isNft = false, aura = null, walrusOnesie = false } = {}) {
      let boost = 0;
      if (level >= 5) boost += 5;
      if (level >= 35) boost += 5;
      if (level >= 75) boost += 5;
      let energy = baseEnergy + boost;
      if (isNft && aura) energy *= (PET_AURA_ENERGY_MULT[aura] ?? 1);
      // The game also grants VIPs +5 during the "Paw Prints" chapter. That chapter ran
      // 2025-11-03 → 2026-02-02 (CHAPTERS), so it can no longer apply and is left out.
      if (walrusOnesie) energy += 5;
      return _petRound2(energy);
    }

    // getPetExperience: the level multipliers scale the base only; every flat bonus is
    // added afterwards, and Beast Shoes pays out per request difficulty.
    function petFeedXp(baseXp, difficulty, { level = 1, isNft = false, petBowls = false,
                                             beastShoes = false, houndShrine = false, bib = null } = {}) {
      let mult = 1;
      if (level >= 27) mult += 0.10;
      if (isNft && level >= 40) mult += 0.15;
      if (isNft && level >= 85) mult += 0.25;
      let xp = baseXp * mult;
      if (houndShrine) xp += 100;
      if (petBowls) xp += 10;
      if (beastShoes && difficulty === "medium") xp += 100;
      if (beastShoes && difficulty === "hard") xp += 250;
      if (isNft && bib) xp += PET_BIB_XP[bib] || 0;
      return _petRound2(xp);
    }

    // One row per request the pet is actually showing today, ranked by how much energy
    // a FLOWER of food buys. costOf returns the farm's cost to produce a dish, or null
    // when nothing can price it — an unpriced dish ranks last rather than as free.
    function buildPetFeedingTable(pet, costOf, boosts = {}) {
      const foods = petFoodRequests(pet.foods, pet.level, pet.isNft);
      const fed = new Set(pet.foodFed || []);
      const rows = foods.map((food) => {
        const difficulty = petFoodDifficulty(food);
        const base = PET_REQUEST_XP[difficulty] || 0;
        const energy = petFeedEnergy(base, { level: pet.level, isNft: pet.isNft, aura: pet.aura, walrusOnesie: boosts.walrusOnesie });
        const xp = petFeedXp(base, difficulty, {
          level: pet.level, isNft: pet.isNft, bib: pet.bib,
          petBowls: boosts.petBowls, beastShoes: boosts.beastShoes, houndShrine: boosts.houndShrine,
        });
        const cost = costOf(food);
        const price = cost > 0 ? cost : null;
        return {
          food, difficulty, baseEnergy: base, energy, xp, price,
          energyPerSfl: price ? energy / price : null,
          xpPerSfl: price ? xp / price : null,
          fed: fed.has(food),
        };
      });
      rows.sort((a, b) => (b.energyPerSfl ?? -1) - (a.energyPerSfl ?? -1));
      if (rows.length > 0 && rows[0].energyPerSfl != null) rows[0].best = true;
      return rows;
    }

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
  PET_AURA_ENERGY_MULT, PET_BIB_XP,
  petFoodDifficulty, petFoodRequests, petFeedEnergy, petFeedXp, buildPetFeedingTable,
};

