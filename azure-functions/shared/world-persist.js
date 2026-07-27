// Shared upsert for farm_world, used by BOTH world-crawl (cursor discovery) and
// world-refresh (getFarms re-refresh). Extracted so the two paths cannot drift into
// writing different columns or diffing differently.

const { diffFarm, SCALARS } = require("./world-extract");

// Types are spelled out because parameters in an untyped VALUES list arrive as text.
const COL_TYPES = {
  farm_id: "bigint", nft_id: "bigint", username: "text", created_at: "timestamptz",
  island_type: "text", island_biome: "text", ascension_level: "integer",
  expansions: "integer", island_upgraded_at: "timestamptz", xp: "double precision",
  total_level: "integer", effective_level: "integer",
  balance: "double precision", coins: "double precision", gems: "double precision",
  ban_status: "text", verified: "boolean", vip_until: "timestamptz", inventory: "jsonb", inventory_hash: "text",
  last_activity: "timestamptz", is_blacklisted: "boolean",
  game_data: "jsonb", reach_slot: "integer",
};
const COLS = Object.keys(COL_TYPES);
const CAST_LIST = COLS.map((c) => `${c}::${COL_TYPES[c]}`).join(",");
const UPDATE_COLS = COLS.filter((c) => c !== "farm_id" &&
  // handled explicitly with COALESCE below, since only the CDN provides them
  c !== "last_activity" && c !== "is_blacklisted");

/**
 * Upsert farm rows and append a change-log row for each one whose tracked scalars moved.
 * @param {number|null} sweep  crawl sweep number; pass null from the refresh path, which
 *        is not a sweep — the stored sweep is then left alone rather than nulled out.
 * @returns {Promise<number>} how many farms changed
 */
async function persistFarmRows(pool, rows, sweep) {
  if (!rows.length) return 0;
  const ids = rows.map((r) => r.farm_id);
  // Deliberately selects only SCALARS, not inventory/game_data — pulling the wide
  // JSONB columns for every row just to diff scalars would dominate the DB traffic.
  const prevRes = await pool.query(
    `SELECT farm_id, ${SCALARS.join(", ")} FROM farm_world WHERE farm_id = ANY($1::bigint[])`,
    [ids]
  );
  const prev = new Map(prevRes.rows.map((r) => [String(r.farm_id), r]));

  const changed = [];
  for (const row of rows) {
    const d = diffFarm(prev.get(String(row.farm_id)), row);
    if (d) changed.push({ farm_id: row.farm_id, diff: d });
  }
  const changedIds = new Set(changed.map((c) => String(c.farm_id)));

  const params = [];
  const tuples = rows.map((row) => {
    const base = params.length;
    for (const c of COLS) params.push(COL_TYPES[c] === "jsonb" ? JSON.stringify(row[c] || {}) : row[c]);
    params.push(changedIds.has(String(row.farm_id)));
    params.push(sweep);
    return `(${COLS.map((_, i) => `$${base + i + 1}`).join(",")},$${base + COLS.length + 1},$${base + COLS.length + 2})`;
  });

  await pool.query(
    `INSERT INTO farm_world (${COLS.join(",")}, last_changed_at, sweep)
     SELECT ${CAST_LIST}, CASE WHEN chg::boolean THEN NOW() END, sweep::integer FROM (
       VALUES ${tuples.join(",")}
     ) AS v(${COLS.join(",")}, chg, sweep)
     ON CONFLICT (farm_id) DO UPDATE SET
       ${UPDATE_COLS.map((c) => `${c}=EXCLUDED.${c}`).join(", ")},
       last_seen_at=NOW(),
       -- COALESCE keeps the refresh path (sweep = NULL) from wiping the sweep marker
       -- that discovery set, and from clearing an earlier last_changed_at.
       sweep=COALESCE(EXCLUDED.sweep, farm_world.sweep),
       -- Only the CDN supplies these, so an API-sourced upsert must not erase them.
       last_activity=COALESCE(EXCLUDED.last_activity, farm_world.last_activity),
       is_blacklisted=COALESCE(EXCLUDED.is_blacklisted, farm_world.is_blacklisted),
       last_changed_at=COALESCE(EXCLUDED.last_changed_at, farm_world.last_changed_at)`,
    params
  );

  if (changed.length) {
    const cp = [];
    const ct = changed.map((c, i) => {
      cp.push(c.farm_id, sweep, JSON.stringify(c.diff));
      return `($${i * 3 + 1},$${i * 3 + 2},$${i * 3 + 3})`;
    });
    await pool.query(
      `INSERT INTO farm_world_changes (farm_id, sweep, diff) VALUES ${ct.join(",")}`,
      cp
    );
  }
  return changed.length;
}

module.exports = { persistFarmRows, COL_TYPES, COLS };
