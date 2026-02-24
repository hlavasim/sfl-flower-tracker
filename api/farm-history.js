import { getPool } from "./db.js";

const ALLOWED_FARMS = new Set([155498]);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const farmId = parseInt(req.query.farm);
  if (isNaN(farmId) || !ALLOWED_FARMS.has(farmId)) {
    return res.status(400).json({ error: "Invalid or disallowed farm ID" });
  }

  const pool = getPool();

  try {
    // Latest snapshot mode
    if (req.query.latest) {
      const count = Math.min(parseInt(req.query.latest) || 1, 10);
      const result = await pool.query(
        `SELECT id, farm_id, captured_at, diff,
                CASE WHEN $2 THEN game_data ELSE NULL END AS game_data
         FROM farm_snapshots
         WHERE farm_id = $1
         ORDER BY captured_at DESC
         LIMIT $3`,
        [farmId, req.query.include === "game_data", count]
      );
      return res.status(200).json({ snapshots: result.rows });
    }

    // Range query
    const from = req.query.from || "1970-01-01";
    const to = req.query.to || "2100-01-01";
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const offset = parseInt(req.query.offset) || 0;
    const includeData = req.query.include === "game_data";

    const result = await pool.query(
      `SELECT id, farm_id, captured_at, diff,
              CASE WHEN $5 THEN game_data ELSE NULL END AS game_data
       FROM farm_snapshots
       WHERE farm_id = $1 AND captured_at >= $2 AND captured_at <= $3
       ORDER BY captured_at DESC
       LIMIT $4 OFFSET $6`,
      [farmId, from, to, limit, includeData, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM farm_snapshots
       WHERE farm_id = $1 AND captured_at >= $2 AND captured_at <= $3`,
      [farmId, from, to]
    );

    return res.status(200).json({
      snapshots: result.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    console.error("farm-history error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
