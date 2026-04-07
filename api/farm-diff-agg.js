import { getPool } from "./_db.js";

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
          AND captured_at >= NOW() - ($3 * interval '1 day')
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
          AND captured_at >= NOW() - ($3 * interval '1 day')
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
    `, [farmId, group, days]);

    return res.status(200).json({
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
