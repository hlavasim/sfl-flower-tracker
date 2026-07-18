// section=pets — the PET ADVISOR page's state, mirroring renderPets' assembly
// (flowers.html ~22214-22255 boost detection + pet parsing) with each pet's
// petDailyCalc precomputed. p2pPrices is returned raw because the page's resource
// tables price arbitrary fetch resources client-side.
import { findCollectible, isWearableEquipped } from "../engine/power-helpers.mjs";
import { PET_NAME_SPECIES, petLevel, petDailyCalc } from "../engine/pets.mjs";

export function buildPetsSection(farm, p2p, settings = {}) {
  const p2pPrices = {};
  for (const [k, v] of Object.entries(p2p || {})) p2pPrices[k] = parseFloat(v) || 0;

  // Detect pet boosts
  const hasVictoriasApron = (farm.wardrobe?.["Victoria's Apron"] > 0) || isWearableEquipped(farm, "Victoria's Apron");
  const hasPetBowls = findCollectible(farm, "Pet Bowls").length > 0;
  const feedMultiplier = hasVictoriasApron ? 1.5 : 1.0;

  // Parse pets from farm data
  const pets = [];
  const commonPets = farm.pets?.common || {};
  for (const [name, pet] of Object.entries(commonPets)) {
    const xp = pet.experience || 0;
    const level = petLevel(xp);
    const energy = pet.energy || 0;
    const foods = pet.requests?.food || [];
    const species = PET_NAME_SPECIES[name] || null;
    pets.push({ name, petType: species, species, level, xp, energy, foods, isNft: false, nftId: null });
  }
  const nftPets = farm.pets?.nfts || {};
  for (const [id, pet] of Object.entries(nftPets)) {
    const xp = pet.experience || 0;
    const level = petLevel(xp);
    const energy = pet.energy || 0;
    const foods = pet.requests?.food || [];
    const petType = pet.traits?.type || "Unknown";
    pets.push({ name: petType, petType, species: petType, level, xp, energy, foods, isNft: true, nftId: id });
  }

  // Sort: NFT first, then common; within each group by level desc
  pets.sort((a, b) => {
    if (a.isNft !== b.isNft) return a.isNft ? -1 : 1;
    return b.level - a.level;
  });

  // Per-pet daily economics, same call the page made per row
  for (const pet of pets) {
    pet.calc = petDailyCalc(pet, p2pPrices, feedMultiplier, hasPetBowls);
  }

  return { pets, feedMultiplier, hasPetBowls, hasVictoriasApron, p2pPrices };
}
