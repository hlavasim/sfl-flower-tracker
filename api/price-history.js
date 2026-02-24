import { getPool } from "./db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const pool = getPool();

  try {
    // Latest prices mode (all items, most recent price each)
    if (req.query.latest) {
      const result = await pool.query(
        "SELECT item_name, price, updated_at FROM last_known_prices ORDER BY item_name"
      );
      return res.status(200).json({ prices: result.rows });
    }

    // Single item or multiple items
    const items = req.query.items
      ? req.query.items.split(",").map((s) => s.trim())
      : req.query.item
        ? [req.query.item.trim()]
        : null;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Provide ?item=Name or ?items=A,B or ?latest=1" });
    }

    if (items.length > 20) {
      return res.status(400).json({ error: "Max 20 items per query" });
    }

    const from = req.query.from || "1970-01-01";
    const to = req.query.to || "2100-01-01";
    const limit = Math.min(parseInt(req.query.limit) || 500, 5000);

    const result = await pool.query(
      `SELECT item_name, price, previous_price, captured_at
       FROM price_changes
       WHERE item_name = ANY($1) AND captured_at >= $2 AND captured_at <= $3
       ORDER BY captured_at DESC
       LIMIT $4`,
      [items, from, to, limit]
    );

    return res.status(200).json({ changes: result.rows });
  } catch (err) {
    console.error("price-history error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
