// Ascension model — a faithful JS port of sunflower-land's formula-based system
// (src/features/game/expansion/lib/ascension.ts + lib/level.ts +
// events/landExpansion/upgradeFarm.ts, read 2026-07-19). Nothing here is guessed:
// every constant and rounding rule is copied from the game source; the game's
// Decimal arithmetic is replaced by plain JS with the SAME rounding calls
// (round-half-up on resources, ceil-to-10 on coins, floor on upgrade costs).
// The golden-ratio node schedule is ported verbatim; positions are distinct
// fractions well within double precision at these magnitudes.
import { BUMPKIN_XP_TABLE } from "./power-helpers.mjs";

// ── ascension.ts constants ──
export const SWAMP_BASE_EXPANSION = 30;
export const SWAMP_EXPANSIONS_PER_ASCENSION = 12;
const COST_GROWTH = 1.3;            // per-ascension expansion-cost multiplier 1.3^(a-1)
const COST_CURVE_EXPONENT = 1.3;    // within-island curve shape
const DRIP_WIDEN_PER_ASCENSION = 0.25;
const DRIP_CAP = SWAMP_EXPANSIONS_PER_ASCENSION;
export const HOURS_PER_EXPANSION = 7;

export const SWAMP_EXPANSION_LEVELS = { 1: 1, 2: 4, 3: 8, 4: 12, 5: 16, 6: 20, 7: 24, 8: 28, 9: 32, 10: 36, 11: 40, 12: 45 };

export const SWAMP_BASE_NODES = {
  "Crop Plot": 65, "Tree": 23, "Stone Rock": 20, "Iron Rock": 13, "Gold Rock": 8,
  "Fruit Patch": 15, "Crimstone Rock": 5, "Sunstone Rock": 13, "Oil Reserve": 4,
  "Lava Pit": 3, "Beehive": 3, "Flower Bed": 3, "Ascension Crystal": 0,
};

const SWAMP_COST_CURVE = {
  Crimstone: { start: 10, end: 50 },
  Oil: { start: 50, end: 400 },
  Obsidian: { start: 2, end: 20 },
};
const SWAMP_COIN_CURVE = { start: 5000, end: 75000 };

const SWAMP_NODE_DRIP = {
  "Crop Plot": 2, "Tree": 4, "Stone Rock": 4, "Fruit Patch": 6, "Iron Rock": 6,
  "Gold Rock": 8, "Crimstone Rock": 8, "Oil Reserve": 12, "Lava Pit": 16,
  "Beehive": 10, "Flower Bed": 10, "Sunstone Rock": 10, "Ascension Crystal": 0,
};
const NO_DRIP_CAP_NODES = ["Beehive", "Flower Bed", "Oil Reserve", "Sunstone Rock", "Crimstone Rock", "Lava Pit"];

// ── upgradeFarm.ts: cost of ascending INTO ascension a (floor(base × 1.4^(a-1))) ──
const ASCENSION_UPGRADE_BASE_ITEMS = { Crimstone: 30, Oil: 50, Obsidian: 3 };
const ASCENSION_UPGRADE_BASE_COINS = 5000;
export function getAscensionUpgradeCost(ascensionLevel) {
  // The game computes 1.4^(a-1) in Decimal ("exact, no binary-float error"). Doubles
  // get this WRONG at exact-integer boundaries (1.4^2 = 1.9599…97 → 50×… floors to 97,
  // the game gets 98). 1.4 = 7/5, so compute base × 7^k / 5^k exactly: k ≤ 9 keeps
  // every intermediate < 2^53.
  const k = ascensionLevel - 1;
  const num = Math.pow(7, k), den = Math.pow(5, k);
  const scaled = (base) => Math.floor((base * num) / den);
  const items = {};
  for (const [name, base] of Object.entries(ASCENSION_UPGRADE_BASE_ITEMS)) items[name] = scaled(base);
  return { items, coins: scaled(ASCENSION_UPGRADE_BASE_COINS) };
}

// ── level.ts: ascension band XP model ──
export const LEVELS_PER_ASCENSION = 50;
const ASCENSION_BAND_XP_BASE = 50_000_000;
const ASCENSION_BAND_XP_GROWTH = 1.45;
const ASCENSION_BAND_XP_ROUNDING = 5_000_000;
const ASCENSION_LEVEL_WEIGHT_PER_LEVEL = 0.03;
const ASCENSION_LEVEL_UPS = LEVELS_PER_ASCENSION - 1;
export const ASCENSION_TOTAL_WEIGHT =
  ASCENSION_LEVEL_UPS + ASCENSION_LEVEL_WEIGHT_PER_LEVEL * ((ASCENSION_LEVEL_UPS * LEVELS_PER_ASCENSION) / 2); // 85.75

// LEVEL_EXPERIENCE[150] — our table is 0-indexed (level L threshold at [L-1]).
export const V150_XP = BUMPKIN_XP_TABLE[149]; // 94,333,905

export const bandXp = (ascension) => {
  const raw = ASCENSION_BAND_XP_BASE * Math.pow(ASCENSION_BAND_XP_GROWTH, ascension - 1);
  return Math.round(raw / ASCENSION_BAND_XP_ROUNDING) * ASCENSION_BAND_XP_ROUNDING;
};
export const levelXp = (ascension, n) =>
  (bandXp(ascension) * (1 + ASCENSION_LEVEL_WEIGHT_PER_LEVEL * n)) / ASCENSION_TOTAL_WEIGHT;
export const ascensionBaseline = (ascension) => {
  let xp = V150_XP;
  for (let b = 1; b < ascension; b++) xp += bandXp(b);
  return xp;
};

// Within-ascension level (0-50) in ascension `a` for a given total experience.
export function ascensionStanding(experience, ascension) {
  const base = ascensionBaseline(ascension);
  let sur = experience - base;
  if (sur < 0) return 0;
  let cum = 0, lvl = 1;
  for (let n = 1; n <= ASCENSION_LEVEL_UPS; n++) {
    cum += levelXp(ascension, n);
    if (cum <= sur) lvl = n + 1; else break;
  }
  return Math.min(lvl, LEVELS_PER_ASCENSION);
}
// Cumulative total XP threshold to reach within-ascension `level` in ascension `a`.
export function ascensionXpFor(ascension, level) {
  let xp = ascensionBaseline(ascension);
  for (let n = 1; n <= level - 1; n++) xp += levelXp(ascension, n);
  return xp;
}

// ── expansion requirements: curve × growth, game rounding ──
const swampCostBase = (start, end, e) =>
  start + (end - start) * Math.pow((e - 1) / (SWAMP_EXPANSIONS_PER_ASCENSION - 1), COST_CURVE_EXPONENT);
export function getAscensionExpansionRequirements(ascensionLevel, expansion) {
  const e = expansion - SWAMP_BASE_EXPANSION;
  if (e < 1 || e > SWAMP_EXPANSIONS_PER_ASCENSION) return undefined;
  // 1.3 = 13/10 — same exact-rational treatment for the per-ascension multiplier
  // (the within-island curve itself is transcendental either way; doubles suffice there).
  const k = ascensionLevel - 1;
  const mulExact = (base) => (base * Math.pow(13, k)) / Math.pow(10, k);
  const scaleResource = (base) => Math.round(mulExact(base)); // ROUND_HALF_UP
  const scaleCoins = (base) => Math.ceil(mulExact(base) / 10) * 10; // UP to nearest 10
  return {
    resources: {
      Crimstone: scaleResource(swampCostBase(SWAMP_COST_CURVE.Crimstone.start, SWAMP_COST_CURVE.Crimstone.end, e)),
      Oil: scaleResource(swampCostBase(SWAMP_COST_CURVE.Oil.start, SWAMP_COST_CURVE.Oil.end, e)),
      Obsidian: scaleResource(swampCostBase(SWAMP_COST_CURVE.Obsidian.start, SWAMP_COST_CURVE.Obsidian.end, e)),
    },
    coins: scaleCoins(swampCostBase(SWAMP_COIN_CURVE.start, SWAMP_COIN_CURVE.end, e)),
    seconds: e * HOURS_PER_EXPANSION * 3600,
    levelRequired: SWAMP_EXPANSION_LEVELS[e] ?? LEVELS_PER_ASCENSION,
  };
}

// ── crystals: 1 at the upgrade + 1 on each of the first min(a+2, 12) expansions ──
export const getExpansionCrystalCount = (ascensionLevel, expansion) => {
  if (ascensionLevel < 1) return 0;
  const e = expansion - SWAMP_BASE_EXPANSION;
  if (e < 1 || e > SWAMP_EXPANSIONS_PER_ASCENSION) return 0;
  return e <= Math.min(ascensionLevel + 2, SWAMP_EXPANSIONS_PER_ASCENSION) ? 1 : 0;
};

// ── node drip / schedule (golden-ratio deal, ported verbatim) ──
export const getAscensionNodeDrip = (node, ascensionLevel) => {
  const base = SWAMP_NODE_DRIP[node];
  if (!base || base <= 0) return 0;
  const widened = Math.floor(base * (1 + DRIP_WIDEN_PER_ASCENSION * (ascensionLevel - 1)));
  return NO_DRIP_CAP_NODES.includes(node) ? widened : Math.min(widened, DRIP_CAP);
};
const getAscensionCumulativeNodes = (node, ascensionLevel) => {
  let total = 0;
  for (let a = 1; a <= ascensionLevel; a++) {
    const drip = getAscensionNodeDrip(node, a);
    if (drip > 0) total += SWAMP_EXPANSIONS_PER_ASCENSION / drip;
  }
  return Math.floor(total);
};
const getAscensionNodeTotal = (node, ascensionLevel) =>
  getAscensionCumulativeNodes(node, ascensionLevel) - getAscensionCumulativeNodes(node, ascensionLevel - 1);

const GOLDEN_RATIO = 0.6180339887498949;
const _scheduleCache = new Map();
export function getAscensionSchedule(ascensionLevel) {
  const cached = _scheduleCache.get(ascensionLevel);
  if (cached) return cached;
  const span = SWAMP_EXPANSIONS_PER_ASCENSION;
  const items = [];
  Object.keys(SWAMP_NODE_DRIP).forEach((node, t) => {
    if (node === "Flower Bed") return;
    const count = getAscensionNodeTotal(node, ascensionLevel);
    const phase = (t * GOLDEN_RATIO) % 1;
    for (let i = 0; i < count; i++) items.push({ pos: (i + phase) / count, node, tie: t });
  });
  items.sort((a, b) => (a.pos - b.pos) || (a.tie - b.tie));
  const schedule = Array.from({ length: span }, () => ({}));
  items.forEach((item, k) => {
    const slot = Math.floor((k * span) / items.length);
    schedule[slot][item.node] = (schedule[slot][item.node] ?? 0) + 1;
    if (item.node === "Beehive") schedule[slot]["Flower Bed"] = (schedule[slot]["Flower Bed"] ?? 0) + 1;
  });
  _scheduleCache.set(ascensionLevel, schedule);
  return schedule;
}
export const getAscensionExpansionDelta = (ascensionLevel, expansion) => {
  const e = expansion - SWAMP_BASE_EXPANSION;
  if (e < 1 || e > SWAMP_EXPANSIONS_PER_ASCENSION) return {};
  return getAscensionSchedule(ascensionLevel)[e - 1];
};
