// Narrow extract of a farm record from the batch /community/farms endpoint.
// The batch wrapper is { id, nftId, farm } — note it carries NEITHER
// isBlacklisted NOR updatedAt (unlike the single-farm endpoint); ban state is
// read from farm.ban.status instead. Verified against live data 2026-07-27.

const num = (v) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
};
const ts = (v) => {
  const n = num(v);
  if (!n) return null;
  const ms = n < 1e12 ? n * 1000 : n;
  // VIP expiry is sometimes set to a sentinel far past year 9999, which Postgres rejects.
  return ms > 0 && ms < 253370764800000 ? new Date(ms) : null;
};

// ── Bumpkin total level: xp -> level, uncapped past 200 ──────────────────────
// Ported from the game's src/features/game/lib/level.ts (read 2026-07-27). The
// table caps a Bumpkin at level 200, but that is only the PRE-ascension cap: once
// SWAMP_ASCENSION is live (it is — our own ascension.mjs already models this
// system) the practical cap is level 150, and every ascension after that adds a
// 50-level band on top with its own, ever-growing XP cost (bandXp grows ×1.45 per
// ascension), so total level has no ceiling. This is why "level" needs computing
// here at crawl time rather than a SQL bucket — a SQL width_bucket only handled
// the pre-ascension table and silently capped every ascended player at 200.
//
// Same 200 xp thresholds as core/engine/power-helpers.mjs BUMPKIN_XP_TABLE and
// api/_world.js's (now removed) copy — thresholds[i] (0-indexed) = xp required
// for level i+1.
const BUMPKIN_XP_TABLE = [
  0, 2, 22, 205, 555, 1155, 2155, 3405, 5405, 7905,
  10905, 14405, 18405, 22905, 27905, 33655, 40155, 47405, 55405, 64155,
  73905, 84655, 96405, 109155, 122905, 137405, 152905, 169405, 186905, 205405,
  225405, 246905, 269905, 294405, 320405, 348405, 378405, 410405, 444405, 480405,
  518905, 559905, 603405, 649405, 697905, 749405, 803905, 861405, 921905, 985405,
  1053905, 1127405, 1205905, 1289405, 1377905, 1476405, 1584905, 1703405, 1831905, 1970405,
  2128905, 2287405, 2485905, 2704405, 2942905, 3221405, 3539905, 3898405, 4296905, 4735405,
  5233905, 5743905, 6263905, 6793905, 7333905, 7883905, 8443905, 9013905, 9593905, 10183905,
  10783905, 11393905, 12013905, 12643905, 13283905, 13933905, 14593905, 15263905, 15943905, 16633905,
  17333905, 18043905, 18763905, 19493905, 20233905, 20983905, 21743905, 22513905, 23293905, 24083905,
  24893905, 25723905, 26573905, 27443905, 28333905, 29243905, 30173905, 31123905, 32093905, 33083905,
  34093905, 35123905, 36173905, 37243905, 38333905, 39443905, 40573905, 41723905, 42893905, 44083905,
  45293905, 46523905, 47773905, 49043905, 50333905, 51653905, 53003905, 54383905, 55793905, 57233905,
  58708905, 60218905, 61763905, 63343905, 64958905, 66613905, 68308905, 70043905, 71818905, 73633905,
  75493905, 77398905, 79348905, 81343905, 83383905, 85473905, 87613905, 89803905, 92043905, 94333905,
  95662605, 97031166, 98440783, 99892688, 101388150, 102928475, 104515009, 106149139, 107832292, 109565939,
  111351595, 113190820, 115085221, 117036454, 119046223, 121116285, 123248448, 125444575, 127706585, 130036455,
  132436221, 134907979, 137453889, 140076176, 142777131, 145559114, 148424556, 151375961, 154415908, 157547053,
  160772132, 164093963, 167515448, 171039577, 174669429, 178408176, 182259085, 186225521, 190310950, 194518941,
  198853171, 203317427, 207915610, 212651738, 217529949, 222554506, 227729799, 233060350, 238550817, 244206000,
];
const PRE_ASCENSION_MAX_LEVEL = 150;
const LEVELS_PER_ASCENSION = 50;
const ASCENSION_BAND_XP_BASE = 50_000_000;
const ASCENSION_BAND_XP_GROWTH = 1.45;
const ASCENSION_BAND_XP_ROUNDING = 5_000_000;
const ASCENSION_LEVEL_WEIGHT_PER_LEVEL = 0.03;
const ASCENSION_LEVEL_UPS = LEVELS_PER_ASCENSION - 1; // 49
const ASCENSION_TOTAL_WEIGHT = ASCENSION_LEVEL_UPS +
  ASCENSION_LEVEL_WEIGHT_PER_LEVEL * ((ASCENSION_LEVEL_UPS * LEVELS_PER_ASCENSION) / 2); // 85.75

/** Level from xp, capped at maxLevel — table lookup, same rule as the game's getBumpkinLevel. */
function bumpkinLevelFromXp(xp, maxLevel) {
  if (xp >= BUMPKIN_XP_TABLE[maxLevel - 1]) return maxLevel;
  let level = 1;
  for (let i = 0; i < maxLevel; i++) {
    if (xp >= BUMPKIN_XP_TABLE[i]) level = i + 1;
    else break;
  }
  return level;
}

/** Total xp cost of ascension band `a` (1-indexed), rounded to the nearest 5M. */
function ascensionBandXp(a) {
  const raw = ASCENSION_BAND_XP_BASE * ASCENSION_BAND_XP_GROWTH ** (a - 1);
  return Math.round(raw / ASCENSION_BAND_XP_ROUNDING) * ASCENSION_BAND_XP_ROUNDING;
}

/** Cumulative xp to reach the start (within-level 0) of ascension band `a`. */
function ascensionBaseline(a) {
  let xp = BUMPKIN_XP_TABLE[PRE_ASCENSION_MAX_LEVEL - 1];
  for (let b = 1; b < a; b++) xp += ascensionBandXp(b);
  return xp;
}

/** Within-band level (0..50) for ascension `a` at the given total xp. */
function withinAscensionLevel(xp, a) {
  const baseline = ascensionBaseline(a);
  if (xp < baseline) return 0;
  const band = ascensionBandXp(a);
  if (xp >= baseline + band) return LEVELS_PER_ASCENSION;
  let level = 1, levelStart = baseline;
  for (let n = 1; n < ASCENSION_LEVEL_UPS; n++) {
    const stepXp = (band * (1 + ASCENSION_LEVEL_WEIGHT_PER_LEVEL * n)) / ASCENSION_TOTAL_WEIGHT;
    const nextStart = levelStart + stepXp;
    if (xp >= nextStart) { level = n + 1; levelStart = nextStart; }
    else break;
  }
  return level;
}

/**
 * Total Bumpkin level: the pre-ascension table level (capped at 150 — the current
 * live cap once SWAMP_ASCENSION is on) plus 50 for every completed ascension band
 * plus the current within-band level. A1 L1 -> 151, A1 L50 -> 200, A2 L25 -> 225,
 * unbounded as ascensionLevel grows.
 */
function totalBumpkinLevel(xp, ascensionLevel) {
  const a = Math.max(0, Math.floor(ascensionLevel) || 0);
  if (a < 1) return bumpkinLevelFromXp(xp, PRE_ASCENSION_MAX_LEVEL);
  return PRE_ASCENSION_MAX_LEVEL + (a - 1) * LEVELS_PER_ASCENSION + withinAscensionLevel(xp, a);
}

/** Scalar fields tracked in the change log, in insert order. */
const SCALARS = [
  "username", "island_type", "island_biome", "ascension_level", "expansions",
  "island_upgraded_at", "xp", "total_level", "balance", "coins", "gems", "ban_status",
  "verified", "vip_until",
];

// Fields dropped from the stored game_data: the game keeps these as "before the
// last optimistic update" shadow copies of inventory/wardrobe/balance for its own
// client-side rollback/anti-cheat check (confirmed in the game's game.ts — they sit
// right next to the field they shadow with no other purpose). They are near-
// duplicates of a field we already keep (inventory, wardrobe) by construction, so
// dropping them loses no information, only ~6-7% of raw farm size.
const DROP_FROM_GAME_DATA = ["previousInventory", "previousWardrobe", "previousBalance"];

function extractFarm(entry) {
  const f = entry.farm || {};
  const island = f.island || {};
  const inv = f.inventory || {};
  const ascensionLevel = island.ascensionLevel ?? 0;
  const xp = num(f.bumpkin?.experience) ?? 0;
  const gameData = { ...f };
  for (const k of DROP_FROM_GAME_DATA) delete gameData[k];
  return {
    farm_id: entry.id,
    nft_id: entry.nftId ?? null,
    username: typeof f.username === "string" ? f.username.slice(0, 100) : null,
    created_at: ts(f.createdAt),
    island_type: island.type ?? null,
    island_biome: island.biome ?? null,
    ascension_level: ascensionLevel,
    expansions: num(inv["Basic Land"]) ?? 0,
    island_upgraded_at: ts(island.upgradedAt),
    xp,
    total_level: totalBumpkinLevel(xp, ascensionLevel),
    balance: num(f.balance) ?? 0,
    coins: num(f.coins) ?? 0,
    gems: num(inv.Gem) ?? 0,
    ban_status: f.ban?.status ?? null,
    verified: typeof f.verified === "boolean" ? f.verified : null,
    vip_until: ts(f.vip?.expiresAt),
    inventory: inv,
    // Furthest expansion this farm could reach right now with what it has banked.
    // Required lazily: expansion-reach.js needs the level helpers from THIS module,
    // so a top-level require would be a cycle.
    reach_slot: require("./expansion-reach").computeReach(f).slot,
    // Full per-farm state (minus the shadow fields above) so a future stat doesn't
    // need a code change + redeploy + a full sweep to become available — see the
    // storage note in migrations/2026-07-27-world-crawl.sql. Not scalar-diffed
    // (SCALARS below): diffing whole JSON blobs sweep-to-sweep would be expensive
    // and isn't meaningful the way a level-up or a ban flip is.
    game_data: gameData,
  };
}

/**
 * Compare a freshly extracted row against the stored one.
 * Returns { field: [old, new] } for changed scalars, or null if nothing moved.
 */
function diffFarm(prev, next) {
  if (!prev) return null;
  const d = {};
  for (const k of SCALARS) {
    let a = prev[k];
    let b = next[k];
    if (a instanceof Date) a = a.getTime();
    if (b instanceof Date) b = b.getTime();
    if (typeof a === "string" && typeof b === "number") a = parseFloat(a);
    // Floats arrive back from pg with full precision; compare exactly but
    // tolerate the null/0 distinction collapsing on first write.
    if (a === b) continue;
    if (a == null && b == null) continue;
    d[k] = [a ?? null, b ?? null];
  }
  return Object.keys(d).length ? d : null;
}

module.exports = { extractFarm, diffFarm, SCALARS, totalBumpkinLevel, withinAscensionLevel };
