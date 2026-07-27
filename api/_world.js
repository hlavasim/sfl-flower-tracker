// World-crawl read layer: crawl progress + a generic, allowlisted aggregation
// builder over farm_world. The point of the builder is that new breakdowns
// ("how many farms on volcano", "how many at ascension 3") are a URL change on
// the client, not a backend deploy. Everything is validated against fixed
// allowlists — the DB user (sfl_reader) is read-only, but the allowlists are
// what keep the SQL itself well-formed and injection-free.

// Bumpkin level from xp: thresholds[i] (1-indexed) = xp required to REACH level i,
// copied verbatim from core/engine/power-helpers.mjs BUMPKIN_XP_TABLE (read
// 2026-07-27; update both if the game's leveling curve changes). width_bucket(xp,
// thresholds) returns i such that thresholds[i] <= xp < thresholds[i+1] — since
// that is exactly "has reached level i but not level i+1", the bucket IS the level.
// xp past the last threshold (level 200) clamps to bucket 200 rather than erroring.
const BUMPKIN_XP_THRESHOLDS = [
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
const BUMPKIN_LEVEL_EXPR = `width_bucket(xp, ARRAY[${BUMPKIN_XP_THRESHOLDS.join(",")}]::double precision[])`;

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
  // Bucketed dimensions for histogram-style breakdowns.
  xp_bucket: "width_bucket(xp, 0, 200000000, 20)",
  level_bucket: "least(floor(expansions / 5) * 5, 100)",
  bumpkin_level: BUMPKIN_LEVEL_EXPR,
  bumpkin_level_band: `((${BUMPKIN_LEVEL_EXPR} - 1) / 10) * 10 + 1`,
};

// Columns that may be aggregated.
const MEASURES = { xp: "xp", balance: "balance", coins: "coins", gems: "gems", expansions: "expansions", ascension_level: "ascension_level" };
const FUNCS = { count: null, sum: "SUM", avg: "AVG", min: "MIN", max: "MAX", median: "PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY" };
const OPS = { eq: "=", ne: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };

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
  const where = buildWhere(filters, params);

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
  const r = await pool.query(
    `SELECT COUNT(*)::bigint AS holders,
            SUM((inventory ->> $1)::numeric) AS total,
            MAX((inventory ->> $1)::numeric) AS max
       FROM farm_world
      WHERE inventory ? $1 AND (inventory ->> $1)::numeric > $2`,
    [item, min]
  );
  const row = r.rows[0];
  return { item, holders: Number(row.holders), total: row.total === null ? 0 : Number(row.total), max: row.max === null ? 0 : Number(row.max) };
}

/** Crawl progress: how far the current sweep is, how fast, and the ETA. */
async function crawlStats(pool) {
  const [state, sweeps, totals, skips] = await Promise.all([
    pool.query("SELECT * FROM crawl_state WHERE id = 1"),
    pool.query("SELECT * FROM crawl_sweeps ORDER BY sweep DESC LIMIT 10"),
    pool.query(`SELECT COUNT(*)::bigint AS farms,
                       COUNT(*) FILTER (WHERE ban_status = 'permanent')::bigint AS banned,
                       COUNT(*) FILTER (WHERE verified)::bigint AS verified,
                       MAX(last_seen_at) AS newest,
                       MIN(last_seen_at) AS oldest
                  FROM farm_world`),
    pool.query("SELECT COUNT(*)::bigint AS n, COALESCE(SUM(to_id - from_id),0)::bigint AS ids FROM crawl_skips"),
  ]);

  const s = state.rows[0] || {};
  const t = totals.rows[0] || {};
  const done = Number(s.farms_this_sweep || 0);
  const startedAt = s.sweep_started_at ? new Date(s.sweep_started_at).getTime() : null;
  const elapsedMs = startedAt ? Date.now() - startedAt : 0;
  const perHour = elapsedMs > 0 ? done / (elapsedMs / 3600000) : 0;

  // Total farm count: measured from the last completed sweep once one exists,
  // otherwise the known population size so the first sweep still shows an ETA.
  const completed = sweeps.rows.filter((r) => r.finished_at);
  const measuredTotal = completed.length ? Number(completed[0].farms) : null;
  const total = measuredTotal || Number(process.env.WORLD_FARMS_ESTIMATE || 656066);
  const remaining = Math.max(0, total - done);
  const etaMs = perHour > 0 ? (remaining / perHour) * 3600000 : null;

  return {
    sweep: s.sweep,
    cursor: s.cursor,
    last_id: s.last_id == null ? null : Number(s.last_id),
    window_size: s.window_size,
    sweep_started_at: s.sweep_started_at,
    updated_at: s.updated_at,
    last_error: s.last_error,
    done,
    total,
    total_is_measured: measuredTotal != null,
    pct: total > 0 ? (done / total) * 100 : 0,
    farms_per_hour: perHour,
    eta_ms: etaMs,
    full_sweep_ms: perHour > 0 ? (total / perHour) * 3600000 : null,
    requests: { ok: Number(s.req_ok || 0), rate_limited: Number(s.req_429 || 0), server_error: Number(s.req_5xx || 0) },
    skips: { events: Number(skips.rows[0].n), ids: Number(skips.rows[0].ids) },
    stored: {
      farms: Number(t.farms || 0),
      banned: Number(t.banned || 0),
      verified: Number(t.verified || 0),
      oldest_seen: t.oldest,
      newest_seen: t.newest,
    },
    sweeps: sweeps.rows.map((r) => ({
      sweep: r.sweep,
      started_at: r.started_at,
      finished_at: r.finished_at,
      farms: Number(r.farms || 0),
      duration_ms: r.finished_at && r.started_at ? new Date(r.finished_at) - new Date(r.started_at) : null,
      req_ok: Number(r.req_ok || 0),
      req_429: Number(r.req_429 || 0),
      req_5xx: Number(r.req_5xx || 0),
      skipped: Number(r.skipped || 0),
    })),
  };
}

async function handleWorld(pool, q) {
  switch (q.mode || "stats") {
    case "stats": return crawlStats(pool);
    case "agg": return { rows: await aggregate(pool, q) };
    case "item": return await itemHolders(pool, q);
    case "dims": return { dims: Object.keys(DIMS), measures: Object.keys(MEASURES), funcs: Object.keys(FUNCS), ops: Object.keys(OPS) };
    default: throw new Error(`bad mode: ${q.mode}`);
  }
}

export { handleWorld };
