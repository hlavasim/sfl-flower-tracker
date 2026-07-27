// World-crawl read layer: crawl progress + a generic, allowlisted aggregation
// builder over farm_world. The point of the builder is that new breakdowns
// ("how many farms on volcano", "how many at ascension 3") are a URL change on
// the client, not a backend deploy. Everything is validated against fixed
// allowlists — the DB user (sfl_reader) is read-only, but the allowlists are
// what keep the SQL itself well-formed and injection-free.

// Columns that may be grouped by or filtered on.
const DIMS = {
  island_type: "island_type",
  island_biome: "island_biome",
  ascension_level: "ascension_level",
  expansions: "expansions",
  ban_status: "ban_status",
  verified: "verified",
  sweep: "sweep",
  nft: "(nft_id IS NOT NULL)",
  // total_level is computed at crawl time (azure-functions/shared/world-extract.js),
  // not here — it needs the ascension-band formula (xp thresholds only cover the
  // pre-ascension table and silently cap every ascended player at 200), which is
  // not something a single SQL expression can do cleanly.
  total_level: "total_level",
  // Furthest expansion the farm could reach with what it has banked, as an integer
  // slot so it sorts numerically (phase*1000 + expansions). Computed at crawl time —
  // see azure-functions/shared/expansion-reach.js.
  reach_slot: "reach_slot",
  // Level after eating the food the farm already has cooked, valued with that farm's
  // own cooking boosts and a simulated x1.5 pet streak. total_level is the un-fed one.
  effective_level: "effective_level",
  is_blacklisted: "is_blacklisted",
  // Bucketed dimensions for histogram-style breakdowns.
  xp_bucket: "width_bucket(xp, 0, 200000000, 20)",
  level_bucket: "least(floor(expansions / 5) * 5, 100)",
};

// Columns that may be aggregated.
const MEASURES = { xp: "xp", balance: "balance", coins: "coins", gems: "gems", expansions: "expansions", ascension_level: "ascension_level", total_level: "total_level", reach_slot: "reach_slot", effective_level: "effective_level" };
const FUNCS = { count: null, sum: "SUM", avg: "AVG", min: "MIN", max: "MAX", median: "PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY" };
const OPS = { eq: "=", ne: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };

/**
 * Activity window shared by every aggregation, so the charts can be scoped to
 * "everything / played in the last 90 days / last 30 days" from one control.
 * last_activity comes from the community CDN dump (the public API never exposed it),
 * so rows never touched by a CDN ingest have it NULL and are excluded by any window —
 * which is correct: we have no evidence they were active.
 */
function activityClause(activeDays, params) {
  const d = Number(activeDays);
  if (!Number.isFinite(d) || d <= 0) return null;
  params.push(Math.min(Math.round(d), 3650));
  return `last_activity > NOW() - ($${params.length} || ' days')::interval`;
}

/** Parse `col:op:value` filters into a WHERE clause + params. */
function buildWhere(filters, params) {
  const clauses = [];
  for (const raw of filters) {
    const [col, op, ...rest] = String(raw).split(":");
    const value = rest.join(":");
    const sqlCol = DIMS[col] || MEASURES[col];
    if (!sqlCol || !OPS[op]) throw new Error(`bad filter: ${raw}`);
    if (value === "null") {
      clauses.push(`${sqlCol} IS ${op === "ne" ? "NOT " : ""}NULL`);
      continue;
    }
    let v = value;
    if (v === "true" || v === "false") v = v === "true";
    else if (v !== "" && !isNaN(Number(v))) v = Number(v);
    params.push(v);
    clauses.push(`${sqlCol} ${OPS[op]} $${params.length}`);
  }
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

/**
 * GET ?type=world&mode=agg&group=island_type&func=count&measure=xp&filter=ban_status:eq:ok
 * Returns [{ key, n, value }] ordered by n desc.
 */
async function aggregate(pool, q) {
  const params = [];
  const filters = [].concat(q.filter || []);
  let where = buildWhere(filters, params);
  const active = activityClause(q.active_days, params);
  if (active) where = where ? `${where} AND ${active}` : `WHERE ${active}`;

  const groupKey = q.group ? DIMS[q.group] : null;
  if (q.group && !groupKey) throw new Error(`bad group: ${q.group}`);

  const func = q.func || "count";
  if (!(func in FUNCS)) throw new Error(`bad func: ${func}`);
  let valueExpr = "NULL";
  if (func !== "count") {
    const m = MEASURES[q.measure];
    if (!m) throw new Error(`bad measure: ${q.measure}`);
    valueExpr = func === "median" ? `${FUNCS[func]} ${m})` : `${FUNCS[func]}(${m})`;
  }

  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 100, 1), 1000);
  const sql = groupKey
    ? `SELECT ${groupKey} AS key, COUNT(*)::bigint AS n, ${valueExpr} AS value
         FROM farm_world ${where} GROUP BY 1 ORDER BY n DESC NULLS LAST LIMIT ${limit}`
    : `SELECT NULL AS key, COUNT(*)::bigint AS n, ${valueExpr} AS value FROM farm_world ${where}`;

  const r = await pool.query(sql, params);
  return r.rows.map((row) => ({ key: row.key, n: Number(row.n), value: row.value === null ? null : Number(row.value) }));
}

/**
 * GET ?type=world&mode=item&item=Gem&min=1 — how many farms hold an inventory item.
 * Kept separate from the dimension allowlist because the key is user-supplied
 * but lands in a parameter, never in the SQL text.
 */
async function itemHolders(pool, q) {
  const item = String(q.item || "");
  if (!item || item.length > 100) throw new Error("item required");
  const min = Number(q.min) || 0;
  const params = [item, min];
  const active = activityClause(q.active_days, params);
  const r = await pool.query(
    `SELECT COUNT(*)::bigint AS holders,
            SUM((inventory ->> $1)::numeric) AS total,
            MAX((inventory ->> $1)::numeric) AS max
       FROM farm_world
      WHERE inventory ? $1 AND (inventory ->> $1)::numeric > $2` +
    (active ? ` AND ${active}` : ""),
    params
  );
  const row = r.rows[0];
  return { item, holders: Number(row.holders), total: row.total === null ? 0 : Number(row.total), max: row.max === null ? 0 : Number(row.max) };
}

/**
 * Dataset status. The cursor crawl this used to describe (sweep progress, ETA, chunk
 * coverage) is retired — the data now comes from the community CDN's daily dump, so the
 * meaningful facts are which dump is loaded, how fresh it is, and how much of the
 * population is actually active.
 */
async function crawlStats(pool) {
  const [ingest, totals, buckets] = await Promise.all([
    pool.query("SELECT * FROM cdn_ingest_state WHERE id = 1"),
    pool.query(`SELECT COUNT(*)::bigint AS farms,
                       COUNT(last_activity)::bigint AS with_activity,
                       COUNT(*) FILTER (WHERE is_blacklisted)::bigint AS blacklisted,
                       -- isBlacklisted is only sent for ~46% of farms and does not track
                       -- NFT ownership, so its denominator has to travel with it.
                       COUNT(is_blacklisted)::bigint AS with_blacklist,
                       COUNT(*) FILTER (WHERE ban_status = 'permanent')::bigint AS banned,
                       COUNT(*) FILTER (WHERE verified)::bigint AS verified,
                       MAX(last_activity) AS newest_activity
                  FROM farm_world`),
    pool.query(`SELECT
        COUNT(*) FILTER (WHERE last_activity > NOW() - INTERVAL '1 day')::bigint  AS d1,
        COUNT(*) FILTER (WHERE last_activity > NOW() - INTERVAL '7 days')::bigint AS d7,
        COUNT(*) FILTER (WHERE last_activity > NOW() - INTERVAL '30 days')::bigint AS d30,
        COUNT(*) FILTER (WHERE last_activity > NOW() - INTERVAL '90 days')::bigint AS d90
      FROM farm_world`),
  ]);

  const i = ingest.rows[0] || {};
  const t = totals.rows[0] || {};
  const b = buckets.rows[0] || {};
  const durationMs = i.started_at && i.finished_at
    ? new Date(i.finished_at) - new Date(i.started_at) : null;

  return {
    source: "community CDN daily dump",
    dump: {
      path: i.dump_path || null,
      generated_at: i.dump_modified_at || null,
      started_at: i.started_at || null,
      finished_at: i.finished_at || null,
      duration_ms: durationMs,
      records_done: Number(i.records_done || 0),
      changed: Number(i.changed || 0),
      unchanged: Number(i.unchanged || 0),
      unparseable: Number(i.bad || 0),
      complete: !!i.complete,
      last_error: i.last_error || null,
      age_ms: i.dump_modified_at ? Date.now() - new Date(i.dump_modified_at).getTime() : null,
    },
    stored: {
      farms: Number(t.farms || 0),
      with_activity: Number(t.with_activity || 0),
      blacklisted: Number(t.blacklisted || 0),
      with_blacklist: Number(t.with_blacklist || 0),
      banned: Number(t.banned || 0),
      verified: Number(t.verified || 0),
      newest_activity: t.newest_activity || null,
    },
    active: {
      d1: Number(b.d1 || 0),
      d7: Number(b.d7 || 0),
      d30: Number(b.d30 || 0),
      d90: Number(b.d90 || 0),
    },
  };
}

/**
 * One farm's position on each chart, so the page can highlight the viewer's own bar.
 * Returns nulls (not an error) for a farm that is not in the dataset — an unknown farm
 * should leave the charts unhighlighted, not break the page.
 */
async function farmPosition(pool, q) {
  const id = String(q.farm || "").trim();
  if (!/^\d{1,20}$/.test(id)) throw new Error("farm must be a numeric id");
  const r = await pool.query(
    `SELECT farm_id, username, island_type, total_level, effective_level, reach_slot,
            ascension_level, expansions, last_activity, is_blacklisted, ban_status
       FROM farm_world WHERE farm_id = $1`,
    [id]
  );
  if (!r.rows.length) return { found: false, farm_id: Number(id) };
  const row = r.rows[0];
  return {
    found: true,
    farm_id: Number(row.farm_id),
    username: row.username,
    island_type: row.island_type,
    total_level: row.total_level == null ? null : Number(row.total_level),
    effective_level: row.effective_level == null ? null : Number(row.effective_level),
    reach_slot: row.reach_slot == null ? null : Number(row.reach_slot),
    ascension_level: row.ascension_level == null ? null : Number(row.ascension_level),
    expansions: row.expansions == null ? null : Number(row.expansions),
    last_activity: row.last_activity,
    is_blacklisted: row.is_blacklisted,
    ban_status: row.ban_status,
  };
}

async function handleWorld(pool, q) {
  switch (q.mode || "stats") {
    case "stats": return crawlStats(pool);
    case "agg": return { rows: await aggregate(pool, q) };
    case "item": return await itemHolders(pool, q);
    case "farm": return await farmPosition(pool, q);
    case "dims": return { dims: Object.keys(DIMS), measures: Object.keys(MEASURES), funcs: Object.keys(FUNCS), ops: Object.keys(OPS) };
    default: throw new Error(`bad mode: ${q.mode}`);
  }
}

export { handleWorld };
