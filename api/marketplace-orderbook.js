import { getPool } from "./db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const pool = getPool();

  try {
    const collection = req.query.collection;
    const itemId = parseInt(req.query.item_id);
    const side = req.query.side;
    const sort = req.query.sort === "price" ? "sfl" : "created_at";
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);

    // Per-item orderbook
    if (collection && !isNaN(itemId)) {
      const conditions = ["collection = $1", "item_id = $2"];
      const params = [collection, itemId];
      if (side === "listing" || side === "offer") {
        params.push(side);
        conditions.push(`side = $${params.length}`);
      }
      params.push(limit);

      const result = await pool.query(
        `SELECT side, order_id, sfl, quantity, created_at,
                created_by_id, created_by_name, captured_at
         FROM marketplace_orderbook
         WHERE ${conditions.join(" AND ")}
         ORDER BY side, ${sort} ASC
         LIMIT $${params.length}`,
        params
      );
      return res.status(200).json({ orders: result.rows });
    }

    // Collection-wide orderbook
    if (collection) {
      const conditions = ["collection = $1"];
      const params = [collection];
      if (side === "listing" || side === "offer") {
        params.push(side);
        conditions.push(`side = $${params.length}`);
      }
      params.push(limit);

      const result = await pool.query(
        `SELECT item_id, side, order_id, sfl, quantity, created_at,
                created_by_name, captured_at
         FROM marketplace_orderbook
         WHERE ${conditions.join(" AND ")}
         ORDER BY ${sort} ASC
         LIMIT $${params.length}`,
        params
      );
      return res.status(200).json({ orders: result.rows });
    }

    return res.status(400).json({
      error: "Provide ?collection=X&item_id=N or ?collection=X",
    });
  } catch (err) {
    console.error("marketplace-orderbook error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
