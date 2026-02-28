import { getPool } from "./db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const pool = getPool();

  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const days = Math.min(parseInt(req.query.days) || 30, 365);

    // Latest trades across all items
    if (req.query.latest) {
      const result = await pool.query(
        `SELECT trade_id, collection, item_id, sfl, source, quantity,
                fulfilled_at, initiated_by_id, initiated_by_name,
                fulfilled_by_id, fulfilled_by_name
         FROM marketplace_trades
         WHERE fulfilled_at >= NOW() - ($1::int || ' days')::interval
         ORDER BY fulfilled_at DESC
         LIMIT $2`,
        [days, limit]
      );
      return res.status(200).json({ trades: result.rows });
    }

    // Trades for specific item
    const collection = req.query.collection;
    const itemId = parseInt(req.query.item_id);

    if (collection && !isNaN(itemId)) {
      const result = await pool.query(
        `SELECT trade_id, sfl, source, quantity, fulfilled_at,
                initiated_by_id, initiated_by_name,
                fulfilled_by_id, fulfilled_by_name
         FROM marketplace_trades
         WHERE collection = $1 AND item_id = $2
         ORDER BY fulfilled_at DESC
         LIMIT $3`,
        [collection, itemId, limit]
      );
      return res.status(200).json({ trades: result.rows });
    }

    // All trades for a collection
    if (collection) {
      const result = await pool.query(
        `SELECT trade_id, item_id, sfl, source, quantity, fulfilled_at,
                initiated_by_name, fulfilled_by_name
         FROM marketplace_trades
         WHERE collection = $1 AND fulfilled_at >= NOW() - ($2::int || ' days')::interval
         ORDER BY fulfilled_at DESC
         LIMIT $3`,
        [collection, days, limit]
      );
      return res.status(200).json({ trades: result.rows });
    }

    return res.status(400).json({
      error: "Provide ?collection=X&item_id=N, ?collection=X, or ?latest=1",
    });
  } catch (err) {
    console.error("marketplace-trades error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
