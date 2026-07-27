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

/** Scalar fields tracked in the change log, in insert order. */
const SCALARS = [
  "username", "island_type", "island_biome", "ascension_level", "expansions",
  "island_upgraded_at", "xp", "balance", "coins", "gems", "ban_status",
  "verified", "vip_until",
];

function extractFarm(entry) {
  const f = entry.farm || {};
  const island = f.island || {};
  const inv = f.inventory || {};
  return {
    farm_id: entry.id,
    nft_id: entry.nftId ?? null,
    username: typeof f.username === "string" ? f.username.slice(0, 100) : null,
    created_at: ts(f.createdAt),
    island_type: island.type ?? null,
    island_biome: island.biome ?? null,
    ascension_level: island.ascensionLevel ?? 0,
    expansions: num(inv["Basic Land"]) ?? 0,
    island_upgraded_at: ts(island.upgradedAt),
    xp: num(f.bumpkin?.experience) ?? 0,
    balance: num(f.balance) ?? 0,
    coins: num(f.coins) ?? 0,
    gems: num(inv.Gem) ?? 0,
    ban_status: f.ban?.status ?? null,
    verified: typeof f.verified === "boolean" ? f.verified : null,
    vip_until: ts(f.vip?.expiresAt),
    inventory: inv,
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

module.exports = { extractFarm, diffFarm, SCALARS };
