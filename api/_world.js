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
  // Bucketed dimensions for histogram-style breakdowns.
  xp_bucket: "width_bucket(xp, 0, 200000000, 20)",
  level_bucket: "least(floor(expansions / 5) * 5, 100)",
};

// Columns that may be aggregated.
const MEASURES = { xp: "xp", balance: "balance", coins: "coins", gems: "gems", expansions: "expansions", ascension_level: "ascension_level", total_level: "total_level", reach_slot: "reach_slot" };
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
  const [state, sweeps, totals, skips, chunks, running, tiling, recent] = await Promise.all([
    pool.query("SELECT * FROM crawl_state WHERE id = 1"),
    pool.query("SELECT * FROM crawl_sweeps ORDER BY sweep DESC LIMIT 10"),
    pool.query(`SELECT COUNT(*)::bigint AS farms,
                       COUNT(*) FILTER (WHERE ban_status = 'permanent')::bigint AS banned,
                       COUNT(*) FILTER (WHERE verified)::bigint AS verified,
                       MAX(last_seen_at) AS newest,
                       MIN(last_seen_at) AS oldest
                  FROM farm_world`),
    pool.query("SELECT COUNT(*)::bigint AS n, COALESCE(SUM(to_id - from_id),0)::bigint AS ids FROM crawl_skips"),
    pool.query(`SELECT status, COUNT(*)::int AS n, COALESCE(SUM(farms),0)::bigint AS farms
                  FROM crawl_chunks GROUP BY status`),
    pool.query(`SELECT from_id, to_id, farms, fail_streak FROM crawl_chunks
                 WHERE status = 'running' ORDER BY priority LIMIT 1`),
    // The coverage invariant: chunks must tile the id space with no gap and no
    // overlap, exactly one unbounded tail. Non-zero here means the crawl could
    // silently miss farms, so it is surfaced rather than assumed.
    pool.query(`SELECT COUNT(*)::int AS violations FROM (
                  SELECT from_id, to_id, LEAD(from_id) OVER (ORDER BY from_id) AS next_from
                    FROM crawl_chunks
                ) t
                WHERE (next_from IS NOT NULL AND to_id IS DISTINCT FROM next_from)
                   OR (next_from IS NULL AND to_id IS NOT NULL)
                   OR (next_from IS NOT NULL AND to_id IS NULL)`),
    // Recent throughput. The sweep average is useless while the crawl moves between
    // the sparse web2 tail (~16k farms/hour) and the dense legacy head (~100/hour) —
    // it would report a number matching neither. Counting rows actually written in
    // the last 10 minutes gives the rate the crawl is running at right now.
    pool.query(`SELECT COUNT(*)::bigint AS n FROM farm_world
                 WHERE last_seen_at > NOW() - INTERVAL '10 minutes'`),
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
  // Prefer the recent rate for the ETA — the sweep average spans two ranges whose
  // throughput differs by ~150x, so it predicts neither of them.
  const perHourRecent = Number(recent.rows[0].n) * 6;
  const etaRate = perHourRecent > 0 ? perHourRecent : perHour;
  const etaMs = etaRate > 0 ? (remaining / etaRate) * 3600000 : null;

  const chunkBy = chunks.rows.map((r) => ({ status: r.status, n: Number(r.n) }));
  const byStatus = (st) => chunkBy.find((r) => r.status === st)?.n || 0;

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
    farms_per_hour: perHourRecent,
    farms_per_hour_sweep_avg: perHour,
    eta_ms: etaMs,
    full_sweep_ms: etaRate > 0 ? (total / etaRate) * 3600000 : null,
    requests: { ok: Number(s.req_ok || 0), rate_limited: Number(s.req_429 || 0), server_error: Number(s.req_5xx || 0) },
    skips: { events: Number(skips.rows[0].n), ids: Number(skips.rows[0].ids) },
    chunks: {
      // A chunk only reaches 'done' after paging actually crossed its upper bound,
      // so done/total here is a real coverage figure, not an estimate.
      total: chunkBy.reduce((a, r) => a + r.n, 0),
      done: byStatus("done"),
      pending: byStatus("pending"),
      running: byStatus("running"),
      blocked: byStatus("blocked"),
      tiling_violations: Number(tiling.rows[0].violations),
      current: running.rows.length
        ? {
            from_id: Number(running.rows[0].from_id),
            to_id: running.rows[0].to_id == null ? null : Number(running.rows[0].to_id),
            farms: Number(running.rows[0].farms),
            fail_streak: Number(running.rows[0].fail_streak),
          }
        : null,
    },
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
