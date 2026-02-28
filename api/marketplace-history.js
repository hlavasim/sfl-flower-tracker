import { getPool } from "./db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const pool = getPool();

  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);

    // Market totals mode
    if (req.query.totals) {
      const result = await pool.query(
        `SELECT date, total_volume, total_trades, flower_price, captured_at
         FROM marketplace_totals
         WHERE date >= CURRENT_DATE - $1::int
         ORDER BY date DESC
         LIMIT $2`,
        [days, limit]
      );
      return res.status(200).json({ totals: result.rows });
    }

    // Top items mode
    if (req.query.top) {
      const sortField = req.query.top === "trades" ? "trades" : "volume";
      const collection = req.query.collection;
      const conditions = ["date >= CURRENT_DATE - $1::int"];
      const params = [days];

      if (collection) {
        params.push(collection);
        conditions.push(`collection = $${params.length}`);
      }
      params.push(limit);

      const result = await pool.query(
        `SELECT collection, item_id,
                SUM(volume) as total_volume,
                SUM(trades) as total_trades,
                SUM(quantity) as total_quantity,
                MIN(low) as period_low,
                MAX(high) as period_high,
                (ARRAY_AGG(latest_sale ORDER BY date DESC))[1] as latest_sale
         FROM marketplace_daily
         WHERE ${conditions.join(" AND ")}
         GROUP BY collection, item_id
         ORDER BY ${sortField === "trades" ? "total_trades" : "total_volume"} DESC
         LIMIT $${params.length}`,
        params
      );
      return res.status(200).json({ items: result.rows });
    }

    // Per-item history mode
    const collection = req.query.collection;
    const itemId = parseInt(req.query.item_id);
    if (!collection || isNaN(itemId)) {
      return res.status(400).json({
        error: "Provide ?collection=X&item_id=N, ?top=volume, or ?totals=1",
      });
    }

    const result = await pool.query(
      `SELECT date, low, high, volume, trades, quantity, latest_sale, captured_at
       FROM marketplace_daily
       WHERE collection = $1 AND item_id = $2 AND date >= CURRENT_DATE - $3::int
       ORDER BY date DESC
       LIMIT $4`,
      [collection, itemId, days, limit]
    );
    return res.status(200).json({ history: result.rows });
  } catch (err) {
    console.error("marketplace-history error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
