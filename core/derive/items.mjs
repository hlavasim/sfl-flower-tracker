export function findCollectible(farm, name) {
  // Collectibles can be on main island or home island
  const main = farm.collectibles?.[name] || [];
  const home = farm.home?.collectibles?.[name] || [];
  return [...main, ...home];
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
