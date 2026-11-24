/*
 * The LEVELING page's "what if I had it" farm: a deep copy of the farm with the ticked catalogue
 * rows applied, so the engine's own readers (detectCookingBoosts, computeFishYieldPerCast, the
 * salt model, …) answer for it without any second copy of their rules.
 */
import { LEVELING_ITEMS, LEVELING_ITEM_BY_NAME } from "../data/leveling-items.mjs";
import { findCollectible, isWearableEquipped } from "../derive/items.mjs";

const rankOf = (v) => { const n = Number(v); return n > 0 ? n : (v ? 1 : 0); };
const WHATIF_HAND = "whatif";

function hasThing(farm, it) {
  if (it.kind === "skill") return rankOf(((farm.bumpkin || {}).skills || {})[it.skill]) >= it.rank;
  if (it.kind === "bud") return Object.values(farm.buds || {}).some((b) => b && b.coordinates && b.type === it.budType);
  if (it.kind === "collectible") return findCollectible(farm, it.name).length > 0;
  try { return isWearableEquipped(farm, it.name); } catch { return false; }
}

/** The catalogue rows the farm already has (skills at or above the row's rank). */
export function ownedLevelingItems(farm) {
  return new Set(LEVELING_ITEMS.filter((it) => hasThing(farm || {}, it)).map((it) => it.name));
}

/** A copy of `farm` with every known, not-yet-owned name in `ticked` applied. Never mutates `farm`. */
export function applyWhatIf(farm, ticked) {
  const f = JSON.parse(JSON.stringify(farm || {}));
  for (const name of ticked || []) {
    const it = LEVELING_ITEM_BY_NAME[name];
    if (!it || hasThing(f, it)) continue;
    if (it.kind === "skill") {
      f.bumpkin = f.bumpkin || {};
      f.bumpkin.skills = { ...(f.bumpkin.skills || {}), [it.skill]: it.rank };
    } else if (it.kind === "bud") {
      f.buds = { ...(f.buds || {}), [`${WHATIF_HAND}-${it.budType}`]: { type: it.budType, aura: "No Aura", coordinates: { x: 0, y: 0 } } };
    } else if (it.kind === "collectible") {
      f.collectibles = { ...(f.collectibles || {}), [it.name]: [{ id: `${WHATIF_HAND}-${it.name}`, coordinates: { x: 0, y: 0 }, createdAt: 0, readyAt: 0 }] };
    } else {
      // Worn by a what-if farm hand: getAllEquippedWearables reads every hand's `equipped`.
      f.farmHands = f.farmHands || {};
      f.farmHands.bumpkins = f.farmHands.bumpkins || {};
      const hand = f.farmHands.bumpkins[WHATIF_HAND] = f.farmHands.bumpkins[WHATIF_HAND] || { equipped: {} };
      hand.equipped[it.name] = it.name;
    }
  }
  return f;
}
