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

    // Market totals mode — return daily deltas (computed from cumulative snapshots)
    if (req.query.totals) {
      const result = await pool.query(
        `SELECT date, total_volume, total_trades, flower_price, captured_at
         FROM marketplace_totals
         WHERE date >= CURRENT_DATE - $1::int
         ORDER BY date ASC`,
        [days]
      );
      const rows = result.rows;

      // Compute deltas: each day's value minus previous day
      const deltas = [];
      for (let i = 0; i < rows.length; i++) {
        const cur = rows[i];
        const prev = i > 0 ? rows[i - 1] : null;
        deltas.push({
          date: cur.date,
          total_volume: prev ? Math.max(0, (parseFloat(cur.total_volume) || 0) - (parseFloat(prev.total_volume) || 0)) : null,
          total_trades: prev ? Math.max(0, (parseInt(cur.total_trades) || 0) - (parseInt(prev.total_trades) || 0)) : null,
          flower_price: parseFloat(cur.flower_price) || null,
          // Also include raw cumulative for reference
          cumulative_volume: parseFloat(cur.total_volume) || 0,
          cumulative_trades: parseInt(cur.total_trades) || 0,
          captured_at: cur.captured_at,
        });
      }
      // Return newest first for consistency
      deltas.reverse();
      return res.status(200).json({ totals: deltas });
    }

    // Top items mode — use latest snapshot only (data is cumulative, SUM makes no sense)
    if (req.query.top) {
      const sortField = req.query.top === "trades" ? "trades" : "volume";
      const collection = req.query.collection;

      // Get latest date with data
      const latestDate = await pool.query(
        `SELECT MAX(date) as latest FROM marketplace_daily`
      );
      const latest = latestDate.rows[0]?.latest;
      if (!latest) return res.status(200).json({ items: [] });

      // Get earliest date in range for delta computation
      const earliestDate = await pool.query(
        `SELECT MIN(date) as earliest FROM marketplace_daily WHERE date >= CURRENT_DATE - $1::int`,
        [days]
      );
      const earliest = earliestDate.rows[0]?.earliest;
      const hasDelta = earliest && earliest.toISOString().slice(0,10) !== latest.toISOString().slice(0,10);

      if (hasDelta) {
        // Compute delta: latest snapshot minus earliest snapshot in range
        const conditions = [];
        const params = [];
        if (collection) {
          params.push(collection);
          conditions.push(`collection = $${params.length}`);
        }
        params.push(latest);
        const latestCond = `date = $${params.length}`;
        params.push(earliest);
        const earliestCond = `date = $${params.length}`;
        params.push(limit);

        const collFilter = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

        const result = await pool.query(
          `WITH latest AS (
            SELECT collection, item_id, volume, trades, quantity, low, high, latest_sale
            FROM marketplace_daily WHERE ${latestCond} ${collFilter}
          ), earliest AS (
            SELECT collection, item_id, volume, trades, quantity
            FROM marketplace_daily WHERE ${earliestCond} ${collFilter}
          )
          SELECT l.collection, l.item_id,
                 GREATEST(0, COALESCE(l.volume,0) - COALESCE(e.volume,0)) as total_volume,
                 GREATEST(0, COALESCE(l.trades,0) - COALESCE(e.trades,0)) as total_trades,
                 GREATEST(0, COALESCE(l.quantity,0) - COALESCE(e.quantity,0)) as total_quantity,
                 l.low as period_low,
                 l.high as period_high,
                 l.latest_sale
          FROM latest l
          LEFT JOIN earliest e ON l.collection = e.collection AND l.item_id = e.item_id
          ORDER BY ${sortField === "trades" ? "total_trades" : "total_volume"} DESC
          LIMIT $${params.length}`,
          params
        );
        return res.status(200).json({ items: result.rows, mode: "delta", from: earliest, to: latest });
      } else {
        // Only 1 day of data — show latest snapshot with warning
        const conditions = [`date = $1`];
        const params = [latest];
        if (collection) {
          params.push(collection);
          conditions.push(`collection = $${params.length}`);
        }
        params.push(limit);

        const result = await pool.query(
          `SELECT collection, item_id, volume as total_volume, trades as total_trades,
                  quantity as total_quantity, low as period_low, high as period_high, latest_sale
           FROM marketplace_daily
           WHERE ${conditions.join(" AND ")}
           ORDER BY ${sortField === "trades" ? "total_trades" : "total_volume"} DESC
           LIMIT $${params.length}`,
          params
        );
        return res.status(200).json({ items: result.rows, mode: "cumulative", date: latest });
      }
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
