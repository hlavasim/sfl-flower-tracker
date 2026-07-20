import { getPool } from "./_db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const pool = getPool();

  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const days = Math.min(parseInt(req.query.days) || 30, 365);

    // My-trades / P&L mode — every trade where MY farm was initiator or fulfiller
    // (full history, not just the is_mine-flagged rows). my_side derived here:
    //   fulfilled LISTING → initiator sold, fulfiller bought
    //   fulfilled OFFER   → initiator bought, fulfiller sold
    if (req.query.mytrades === "1") {
      const ME = 155498;
      const { rows } = await pool.query(
        `SELECT mt.collection, mt.item_id, mt.sfl, mt.quantity, mt.source, mt.fulfilled_at,
                mt.initiated_by_id, mt.fulfilled_by_id, mt.initiated_by_name, mt.fulfilled_by_name,
                ol.name, ol.boost_text
         FROM marketplace_trades mt
         LEFT JOIN ob_last ol ON ol.collection = mt.collection AND ol.item_id = mt.item_id
         WHERE mt.initiated_by_id = $1 OR mt.fulfilled_by_id = $1
         ORDER BY mt.fulfilled_at DESC`, [ME]);
      const byItem = new Map();
      let boughtSfl = 0, soldSfl = 0, buyCount = 0, sellCount = 0;
      const trades = rows.map((r) => {
        const iAmInit = Number(r.initiated_by_id) === ME;
        const side = r.source === "offer" ? (iAmInit ? "buy" : "sell") : (iAmInit ? "sell" : "buy");
        const sfl = Number(r.sfl) || 0, qty = Number(r.quantity) || 1;
        const key = `${r.collection}:${r.item_id}`;
        let g = byItem.get(key);
        if (!g) { g = { collection: r.collection, itemId: r.item_id, name: r.name, boost: r.boost_text, boughtQty: 0, boughtSfl: 0, soldQty: 0, soldSfl: 0 }; byItem.set(key, g); }
        if (side === "buy") { g.boughtQty += qty; g.boughtSfl += sfl; boughtSfl += sfl; buyCount++; }
        else { g.soldQty += qty; g.soldSfl += sfl; soldSfl += sfl; sellCount++; }
        const counterparty = iAmInit ? r.fulfilled_by_name : r.initiated_by_name;
        return { date: r.fulfilled_at, collection: r.collection, itemId: r.item_id, name: r.name, boost: r.boost_text,
          side, sfl, qty, unitPrice: qty > 0 ? sfl / qty : sfl, counterparty };
      });
      const items = [...byItem.values()].map((g) => {
        const avgBuy = g.boughtQty > 0 ? g.boughtSfl / g.boughtQty : null;
        const avgSell = g.soldQty > 0 ? g.soldSfl / g.soldQty : null;
        const matched = Math.min(g.boughtQty, g.soldQty);
        const realized = avgBuy != null && avgSell != null ? matched * (avgSell - avgBuy) : null;
        return { ...g, avgBuy, avgSell, cashNet: g.soldSfl - g.boughtSfl, realized };
      }).sort((a, b) => (b.soldSfl + b.boughtSfl) - (a.soldSfl + a.boughtSfl));
      res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
      return res.status(200).json({
        totals: { boughtSfl: Math.round(boughtSfl * 100) / 100, soldSfl: Math.round(soldSfl * 100) / 100,
          cashNet: Math.round((soldSfl - boughtSfl) * 100) / 100, buyCount, sellCount, tradeCount: trades.length },
        items, trades: trades.slice(0, 200),
      });
    }

    // Count mode — return row counts per table
    if (req.query.count) {
      const [trades, orderbook, daily, totals] = await Promise.all([
        pool.query(`SELECT COUNT(*) as n FROM marketplace_trades`),
        pool.query(`SELECT collection, side, COUNT(*) as n FROM marketplace_orderbook GROUP BY collection, side ORDER BY collection, side`),
        pool.query(`SELECT COUNT(DISTINCT date) as days, COUNT(*) as items FROM marketplace_daily`),
        pool.query(`SELECT COUNT(*) as n FROM marketplace_totals`),
      ]);
      return res.status(200).json({
        marketplace_trades: parseInt(trades.rows[0].n),
        marketplace_orderbook: orderbook.rows.map(r => ({ collection: r.collection, side: r.side, count: parseInt(r.n) })),
        marketplace_daily: { days: parseInt(daily.rows[0].days), item_rows: parseInt(daily.rows[0].items) },
        marketplace_totals: parseInt(totals.rows[0].n),
      });
    }

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
