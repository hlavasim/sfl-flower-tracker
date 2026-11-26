// BUMPKIN page XP helpers (moved from flowers.html with the page's widgets): the level the XP is
// worth past the ascension cap, and the XP to the next absolute level. Same maths as before.
import { BUMPKIN_XP_TABLE, getBumpkinLevel, _ascBaseline, _ascBandXp, _withinAscensionLevel } from "./power-helpers.mjs";
import { levelXp } from "./ascension.mjs";

// UNCAPPED total level — the level the XP is WORTH if the player kept ascending. The game
// freezes the level at the current band until you actually ascend, but experience keeps
// accumulating, so this surfaces the progress hiding behind the cap. Rolls past any band
// the XP has already completed.
export function getUncappedTotalLevel(xp, ascensionLevel) {
  if (!ascensionLevel || ascensionLevel < 1) return getBumpkinLevel(xp);
  let a = ascensionLevel;
  while (xp >= _ascBaseline(a) + _ascBandXp(a)) a++;
  return 150 + (a - 1) * 50 + _withinAscensionLevel(xp, a);
}

// XP still needed to reach the NEXT absolute level from a given xp (ascension-aware).
// At a completed band (within-level 50) it returns 0: crossing into the next band needs
// an ascension (resources), not just cooking, so there is no "cook to next level" here.
export function xpRemainingToNextLevel(xp, ascensionLevel) {
  if (!ascensionLevel || ascensionLevel < 1) {
    const lvl = getBumpkinLevel(xp);
    return Math.max(0, (BUMPKIN_XP_TABLE[Math.min(lvl, 199)] || 0) - xp);
  }
  const bandLvl = _withinAscensionLevel(xp, ascensionLevel);
  if (bandLvl >= 50) return 0;
  let nextStart = _ascBaseline(ascensionLevel);
  for (let n = 1; n <= bandLvl; n++) nextStart += levelXp(ascensionLevel, n);
  return Math.max(0, nextStart - xp);
}
