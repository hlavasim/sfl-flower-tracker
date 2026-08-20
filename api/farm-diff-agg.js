import { getPool } from "./_db.js";

/*
 * parseDiffRange is DUPLICATED from core/sections/diff.mjs rather than imported, and the
 * duplication is deliberate.
 *
 * This handler is a .js file in a package with no "type": "module". Importing the .mjs from it
 * deployed cleanly and then failed at runtime with FUNCTION_INVOCATION_FAILED on every call —
 * the whole endpoint 500'd, grouped periods included, while the build stayed green. (compute.mjs
 * imports core happily; it is itself .mjs.) Renaming this file would fix the import and change
 * the deployed function, so the smaller, testable move is to carry the twelve lines here.
 *
 * tests/core/diff-window.test.mjs asserts this copy is identical to core's, so it cannot drift.
 */
function parseDiffRange(from, to) {
  const one = (v) => {
    if (v === undefined || v === null || v === "") return null;
    const t = new Date(v);
    return Number.isNaN(t.getTime()) ? null : t.toISOString();
  };
  let a = one(from);
  let b = one(to);
  if (a && b && a > b) { const t = a; a = b; b = t; }
  return { from: a, to: b };
}

const ALLOWED_FARMS = new Set([155498, 1260204733777858]);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const farmId = parseInt(req.query.farm);
  if (isNaN(farmId) || !ALLOWED_FARMS.has(farmId)) {
    return res.status(400).json({ error: "Invalid or disallowed farm ID" });
  }

  const group = req.query.group;
  const validGroups = ["hour", "day", "week", "month", "year"];
  if (!validGroups.includes(group)) {
    return res.status(400).json({ error: "Invalid group. Use: " + validGroups.join(", ") });
  }

  const defaultDays = { hour: 7, day: 90, week: 365, month: 730, year: 3650 };
  const days = Math.min(parseInt(req.query.days) || defaultDays[group], 3650);

  /*
   * An explicit &from=/&to= window, which is what makes a sub-period question answerable at all.
   *
   * Grouping alone cannot express "what happened between 22:33 and 22:40 tonight": group=day
   * buckets the WHOLE day, so the answer arrives mixed with everything else done since midnight.
   * Bounding the rows that go into the bucket does express it — the same group=day then returns
   * one period containing exactly that session. Absent bounds keep the old behaviour (the last
   * `days` days up to now), so this is additive.
   */
  const range = parseDiffRange(req.query.from, req.query.to);
  const fromTs = range.from || new Date(Date.now() - days * 86400000).toISOString();
  const toTs = range.to || "2100-01-01T00:00:00.000Z";

  const pool = getPool();

  try {
    const result = await pool.query(`
      WITH raw_diffs AS (
        SELECT
          date_trunc($2, captured_at AT TIME ZONE 'UTC') as period,
          d.key,
          d.value::numeric as val
        FROM farm_snapshots,
        LATERAL jsonb_each_text(diff) AS d(key, value)
        WHERE farm_id = $1
          AND captured_at >= $3 AND captured_at <= $4
          AND diff IS NOT NULL
          AND diff != '{}'::jsonb
          AND d.value ~ '^-?[0-9]*\\.?[0-9]+'
      ),
      counts AS (
        SELECT
          date_trunc($2, captured_at AT TIME ZONE 'UTC') as period,
          COUNT(*) as snapshot_count
        FROM farm_snapshots
        WHERE farm_id = $1
          AND captured_at >= $3 AND captured_at <= $4
          AND diff IS NOT NULL
          AND diff != '{}'::jsonb
        GROUP BY 1
      ),
      summed AS (
        SELECT period, key, SUM(val) as total
        FROM raw_diffs
        GROUP BY period, key
        HAVING ABS(SUM(val)) > 0.0001
      )
      SELECT
        c.period,
        c.snapshot_count,
        COALESCE(
          (SELECT jsonb_object_agg(s.key, ROUND(s.total::numeric, 6))
           FROM summed s WHERE s.period = c.period),
          '{}'::jsonb
        ) as agg_diff
      FROM counts c
      ORDER BY c.period ASC
      LIMIT 500
    `, [farmId, group, fromTs, toTs]);

    return res.status(200).json({
      from: fromTs,
      to: range.to || null,
      periods: result.rows.map(r => ({
        period: r.period,
        count: parseInt(r.snapshot_count),
        diff: r.agg_diff || {}
      }))
    });
  } catch (err) {
    console.error("farm-diff-agg error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
