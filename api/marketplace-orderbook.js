import { getPool } from "./_db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── Live mode: real-time orderbook from the SFL marketplace API (Bearer JWT).
  // On-demand ONLY (called when a user opens the Sales page) — never on a schedule.
  // Token lives in SFL_GAME_TOKEN env var, used solely here. Does not touch the DB.
  if (req.query.live === "1") {
    const collection = req.query.collection;
    const itemId = parseInt(req.query.item_id);
    const allowed = ["collectibles", "wearables", "resources", "buds", "pets"];
    if (!allowed.includes(collection) || isNaN(itemId)) {
      return res.status(400).json({ error: "live mode needs ?collection=<type>&item_id=N" });
    }
    const token = process.env.SFL_GAME_TOKEN;
    if (!token) return res.status(503).json({ error: "no game token configured" });
    try {
      const r = await fetch(
        `https://api.sunflower-land.com/collection/${collection}/${itemId}?type=${collection}`,
        { headers: { "Content-Type": "application/json;charset=UTF-8", "Authorization": `Bearer ${token}` } }
      );
      if (r.status === 429) return res.status(429).json({ error: "rate limited by SFL API" });
      if (!r.ok) return res.status(502).json({ error: `SFL API ${r.status}` });
      const d = await r.json();
      const listings = (d.listings || []).map((l) => ({ sfl: l.sfl, qty: l.quantity, by: l.listedById, name: l.listedBy?.username || null }));
      const offers = (d.offers || []).map((o) => ({ sfl: o.sfl, qty: o.quantity, by: o.offeredById, name: o.offeredBy?.username || null }));
      res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
      return res.status(200).json({ live: true, floor: d.floor, listingCount: d.listingCount, offerCount: d.offerCount, listings, offers });
    } catch (e) {
      return res.status(500).json({ error: String(e.message || e) });
    }
  }

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
