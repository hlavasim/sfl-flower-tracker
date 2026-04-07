import { getPool } from "./db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const pool = getPool();
  const mode = req.query.mode || "latest";

  try {
    // ── List tracked weeks ──
    if (mode === "weeks") {
      const result = await pool.query(
        "SELECT week_start, kitchen_items, pet_items, created_at FROM marks_weeks ORDER BY week_start DESC LIMIT 20"
      );
      return res.status(200).json({ weeks: result.rows });
    }

    // ── Crawl state (for progress indicator) ──
    if (mode === "state") {
      const result = await pool.query(
        "SELECT phase, cycle_started_at, discover_cursor, crawl_cursor, updated_at, jsonb_array_length(roster) as roster_size FROM marks_crawl_state WHERE id = 1"
      );
      return res.status(200).json({ state: result.rows[0] || null });
    }

    // Determine week
    let week = req.query.week;
    if (!week) {
      // Default to current Monday
      const now = new Date();
      const day = now.getUTCDay();
      const diff = day === 0 ? 6 : day - 1;
      const mon = new Date(now);
      mon.setUTCDate(mon.getUTCDate() - diff);
      mon.setUTCHours(0, 0, 0, 0);
      week = mon.toISOString().slice(0, 10);
    }

    // ── Latest snapshot per player ──
    if (mode === "latest") {
      // Get week config
      const weekRes = await pool.query(
        "SELECT * FROM marks_weeks WHERE week_start = $1", [week]
      );
      const weekConfig = weekRes.rows[0] || { week_start: week, kitchen_items: [], pet_items: [] };

      // Latest snapshot per player using DISTINCT ON
      const result = await pool.query(
        `SELECT DISTINCT ON (farm_id)
          id, captured_at, farm_id, player_name, rank, marks,
          emblems, tier, rank_boost, wear_boost, multiplier,
          resources, today_fulfilled,
          has_paw_shield, pet_mult, pet_food_stock,
          sfl, marks_optimal, marks_dump, marks_daily_fresh, pet_daily, pet_weekly
        FROM marks_snapshots
        WHERE week_start = $1
        ORDER BY farm_id, captured_at DESC`,
        [week]
      );

      // Also get previous snapshot per player (for deltas)
      const prevResult = await pool.query(
        `WITH latest AS (
          SELECT DISTINCT ON (farm_id) farm_id, captured_at
          FROM marks_snapshots WHERE week_start = $1
          ORDER BY farm_id, captured_at DESC
        )
        SELECT DISTINCT ON (ms.farm_id)
          ms.farm_id, ms.marks as prev_marks, ms.resources as prev_resources,
          ms.captured_at as prev_captured_at
        FROM marks_snapshots ms
        JOIN latest l ON ms.farm_id = l.farm_id AND ms.captured_at < l.captured_at
        WHERE ms.week_start = $1
        ORDER BY ms.farm_id, ms.captured_at DESC`,
        [week]
      );

      const prevMap = {};
      for (const row of prevResult.rows) {
        prevMap[row.farm_id] = row;
      }

      const players = result.rows.map(p => ({
        ...p,
        prev_marks: prevMap[p.farm_id]?.prev_marks ?? null,
        prev_resources: prevMap[p.farm_id]?.prev_resources ?? null,
        prev_captured_at: prevMap[p.farm_id]?.prev_captured_at ?? null,
      }));

      // Snapshot count for this week
      const countRes = await pool.query(
        `SELECT COUNT(DISTINCT captured_at) as snapshot_count FROM marks_snapshots WHERE week_start = $1`,
        [week]
      );

      return res.status(200).json({
        week: weekConfig,
        players,
        snapshot_count: parseInt(countRes.rows[0].snapshot_count) || 0,
      });
    }

    // ── All snapshots for time-series charts ──
    if (mode === "snapshots") {
      const farmId = req.query.farm ? parseInt(req.query.farm) : null;
      const limit = Math.min(parseInt(req.query.limit) || 5000, 10000);

      let query, params;
      if (farmId) {
        query = `SELECT captured_at, farm_id, player_name, rank, marks, resources, sfl,
                        marks_optimal, marks_dump, multiplier
                 FROM marks_snapshots
                 WHERE week_start = $1 AND farm_id = $2
                 ORDER BY captured_at ASC LIMIT $3`;
        params = [week, farmId, limit];
      } else {
        query = `SELECT captured_at, farm_id, player_name, rank, marks, resources, sfl,
                        marks_optimal, marks_dump, multiplier
                 FROM marks_snapshots
                 WHERE week_start = $1
                 ORDER BY captured_at ASC LIMIT $2`;
        params = [week, limit];
      }

      const result = await pool.query(query, params);
      return res.status(200).json({ snapshots: result.rows });
    }

    return res.status(400).json({ error: "Invalid mode. Use: latest, snapshots, weeks, state" });
  } catch (err) {
    console.error("marks-history error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
