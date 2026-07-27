// Narrow extract of a farm record from the batch /community/farms endpoint.
// The batch wrapper is { id, nftId, farm } — note it carries NEITHER
// isBlacklisted NOR updatedAt (unlike the single-farm endpoint); ban state is
// read from farm.ban.status instead. Verified against live data 2026-07-27.

const crypto = require("crypto");

/**
 * Order-independent fingerprint of an inventory, so inventory movement counts as
 * activity without the diff having to read the whole JSONB column on every row.
 *
 * Normalisation matters more than the hash here:
 *  - keys are sorted, because JSON key order is not guaranteed stable between responses
 *  - entries that are zero or unparseable are dropped, so a farm the API sometimes sends
 *    `"Wood": "0"` for and sometimes omits does not look like it changed
 *  - values are hashed as String(raw), NOT as parsed floats: quantities arrive as
 *    strings like "1935.0131743333386759" and round-tripping them through a double
 *    would lose digits. String() still collapses the string/number distinction if the
 *    API ever switches representation.
 */
function inventoryHash(inv) {
  const parts = [];
  for (const k of Object.keys(inv || {}).sort()) {
    const raw = inv[k];
    const n = typeof raw === "string" ? parseFloat(raw) : raw;
    if (!Number.isFinite(n) || n === 0) continue;
    parts.push(`${k}=${String(raw)}`);
  }
  // 16 hex chars is 64 bits — ample for change detection, and cheap to store/compare.
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

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

// ── Bumpkin total level: the game's getTotalBumpkinLevel, i.e. SKILL POINTS ──
// Ported from src/features/game/lib/level.ts (read 2026-07-27).
//
// The level cap depends on a feature flag, and getting this wrong is what made the
// chart top out at 150. In the game:
//
//   getMaxBumpkinLevel = hasFeatureAccess(game, "SWAMP_ASCENSION") ? 150 : 200
//   SWAMP_ASCENSION: betaFeatureFlag
//   betaFeatureFlag  = CONFIG.NETWORK === "amoy" || inventory["Beta Pass"] > 0
//
// So on mainnet the 150 cap applies ONLY to farms holding a Beta Pass — verified
// against farm 155498, which has no Beta Pass and 179,301,665 xp: the table puts it at
// level 186 (needs 178,408,176) and the owner confirms the game shows 186. Capping at
// 150 understated every farm above it. Neither cap is applied here at all now; see the
// extrapolation note below.
//
// A farm that HAS ascended (island.ascensionLevel >= 1) necessarily has the flag, so
// that branch keeps the 150 baseline plus 50 per completed band plus the within-band
// level — which is also why this has to be computed here rather than as a SQL bucket.
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
const PRE_ASCENSION_MAX_LEVEL = 150;   // cap only for Beta Pass holders
const MAX_BUMPKIN_LEVEL = 200;         // end of the game table; not a cap here (see below)
const LEVELS_PER_ASCENSION = 50;
const ASCENSION_BAND_XP_BASE = 50_000_000;
const ASCENSION_BAND_XP_GROWTH = 1.45;
const ASCENSION_BAND_XP_ROUNDING = 5_000_000;
const ASCENSION_LEVEL_WEIGHT_PER_LEVEL = 0.03;
const ASCENSION_LEVEL_UPS = LEVELS_PER_ASCENSION - 1; // 49
const ASCENSION_TOTAL_WEIGHT = ASCENSION_LEVEL_UPS +
  ASCENSION_LEVEL_WEIGHT_PER_LEVEL * ((ASCENSION_LEVEL_UPS * LEVELS_PER_ASCENSION) / 2); // 85.75

// Past the end of the table the curve is CONTINUED rather than clamped, so a farm with
// absurd xp still gets a distinguishing number instead of everyone piling up on 200.
// This is a faithful extrapolation, not a guess: the table's own per-level xp delta
// grows by exactly x1.03, continuously from level 152 through 200 (verified against
// every tail entry), so the same factor is carried onward.
//
// Be clear about what this means: the GAME has no level above 200 for an unascended
// farm — LEVEL_EXPERIENCE simply stops there. Levels above 200 here are "what this xp
// would be worth if the curve kept going", which is what makes whales comparable
// instead of all reading 200. The charts say so.
const XP_DELTA_GROWTH = 1.03;
const LEVEL_EXTRAPOLATION_LIMIT = 10000; // loop bound; nothing real comes close

/** Level from xp. Uses the table to 200, then extrapolates the same curve upward. */
function bumpkinLevelFromXp(xp, maxLevel) {
  const cap = maxLevel || Infinity;
  const tableTop = Math.min(BUMPKIN_XP_TABLE.length, cap);
  let level = 1;
  for (let i = 0; i < tableTop; i++) {
    if (xp >= BUMPKIN_XP_TABLE[i]) level = i + 1;
    else return level;
  }
  if (cap <= BUMPKIN_XP_TABLE.length) return cap;

  let threshold = BUMPKIN_XP_TABLE[BUMPKIN_XP_TABLE.length - 1];
  let delta = threshold - BUMPKIN_XP_TABLE[BUMPKIN_XP_TABLE.length - 2];
  while (level < cap && level < LEVEL_EXTRAPOLATION_LIMIT) {
    delta *= XP_DELTA_GROWTH;
    threshold += delta;
    if (xp < threshold) break;
    level++;
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
 * Total Bumpkin level = the game's getTotalBumpkinLevel, i.e. how many skill points
 * the farm has earned over its whole life (1 per level, ascension bands included).
 *
 * Not ascended: the table level, UNCAPPED — past level 200 the table's own x1.03
 * per-level curve is extrapolated, so 3.8B xp reads ~300 rather than clamping to 200
 * and making every whale look identical. Ascended: 150 + 50 per completed band + the
 * within-band level, so A1 L1 -> 151, A1 L50 -> 200, A2 L25 -> 225. Neither branch
 * has a ceiling.
 *
 * Note the discontinuity, which is the game's and not ours: an unascended farm at
 * 179.3M xp reads 186, but the same xp on a farm that has ascended into A1 reads
 * 151, because ascending rebases the count at 150. Nothing here can smooth that
 * over without diverging from getTotalBumpkinLevel.
 */
function totalBumpkinLevel(xp, ascensionLevel) {
  const a = Math.max(0, Math.floor(ascensionLevel) || 0);
  // Not ascended: table level, UNCAPPED — the curve is extrapolated past 200 so an
  // extreme farm reads its real standing instead of piling onto the cap.
  if (a < 1) return bumpkinLevelFromXp(xp);
  return PRE_ASCENSION_MAX_LEVEL + (a - 1) * LEVELS_PER_ASCENSION + withinAscensionLevel(xp, a);
}

/** Scalar fields tracked in the change log, in insert order. */
const SCALARS = [
  "username", "island_type", "island_biome", "ascension_level", "expansions",
  "island_upgraded_at", "xp", "total_level", "effective_level", "balance", "coins",
  "gems", "ban_status", "verified", "vip_until",
  // Included so a farm that only moves items — planting seeds, shuffling stock — still
  // registers as active, which the scalar columns alone would miss.
  "inventory_hash",
];

// Fields dropped from the stored game_data: the game keeps these as "before the
// last optimistic update" shadow copies of inventory/wardrobe/balance for its own
// client-side rollback/anti-cheat check (confirmed in the game's game.ts — they sit
// right next to the field they shadow with no other purpose). They are near-
// duplicates of a field we already keep (inventory, wardrobe) by construction, so
// dropping them loses no information, only ~6-7% of raw farm size.
const DROP_FROM_GAME_DATA = ["previousInventory", "previousWardrobe", "previousBalance"];

function extractFarm(entry, bankedFoodXp) {
  const f = entry.farm || {};
  const island = f.island || {};
  const inv = f.inventory || {};
  const ascensionLevel = island.ascensionLevel ?? 0;
  const xp = num(f.bumpkin?.experience) ?? 0;
  const gameData = { ...f };
  for (const k of DROP_FROM_GAME_DATA) delete gameData[k];
  // Required lazily: expansion-reach needs the level helpers from THIS module, so a
  // top-level require would be a cycle.
  const reach = require("./expansion-reach").computeReach(f, bankedFoodXp);
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
    inventory_hash: inventoryHash(inv),
    // Furthest expansion this farm could reach right now with what it has banked.
    // Required lazily: expansion-reach.js needs the level helpers from THIS module,
    // so a top-level require would be a cycle.
    reach_slot: reach.slot,
    // Level from xp PLUS boost-aware banked food XP — the level a farm would be at
    // after eating what it already has cooked, with its own cooking boosts and a
    // simulated x1.5 pet streak. total_level above is the plain, un-fed level.
    effective_level: totalBumpkinLevel(reach.xp, ascensionLevel),
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

module.exports = { extractFarm, diffFarm, SCALARS, totalBumpkinLevel, withinAscensionLevel, inventoryHash };
