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
