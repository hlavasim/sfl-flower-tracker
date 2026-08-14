export function findCollectible(farm, name) {
  // Placed collectibles live across four maps: the main land, the OLD home island (now empty),
  // and BOTH floors of the house interior (farm.interior.ground / level_one), where the game
  // moved indoor placement — the interior was missed, so items placed in the house read as
  // unplaced. Layout presets (farm.layouts) are alternate arrangements, not live, so excluded.
  const main = farm.collectibles?.[name] || [];
  const home = farm.home?.collectibles?.[name] || [];
  const interior = farm.interior?.ground?.collectibles?.[name] || [];
  const level1 = farm.interior?.level_one?.collectibles?.[name] || [];
  return [...main, ...home, ...interior, ...level1];
}

export function getAllEquippedWearables(farm) {
  // Main bumpkin + all farm hands (additional bumpkins)
  const all = [];
  if (farm.bumpkin?.equipped) all.push(farm.bumpkin.equipped);
  // Farm hands — try common API field names
  const hands = farm.farmHands?.bumpkins || farm.farmHands || {};
  for (const hand of Object.values(hands)) {
    if (hand?.equipped) all.push(hand.equipped);
  }
  return all;
}

export function isWearableEquipped(farm, name) {
  for (const equipped of getAllEquippedWearables(farm)) {
    if (Object.values(equipped).flat().includes(name)) return true;
  }
  return false;
}

export function hasItem(farm, name) {
  return findCollectible(farm, name).length > 0 || isWearableEquipped(farm, name);
}
export function hasAny(farm, ...names) {
  return names.some((n) => hasItem(farm, n));
}
