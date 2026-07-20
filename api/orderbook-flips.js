import { getPool } from "./_db.js";

// GET /api/orderbook-flips?sort=score&minprice=&q=  — flip opportunities from the
// historized boosted-NFT orderbook (MIGRATION.md §4.2). Reads ob_last (latest
// per-item state) + today's real trades, computes per item:
//   net    = best_listing × (1 − 0.10) − best_offer   (profit/flip after 10% fee)
//   margin = net / best_offer × 100  (%)
//   liq    = trades_today + offer_pressure × 0.5
//   score  = max(margin, 0) × (1 + liq)
//   price  = avg_trade10 || best_listing || floor || last_sale  (representative)
// Only items with BOTH a best offer and a best listing can be flipped.
const FEE = 0.10;
const SORTS = { score: "score", margin: "margin", spread: "spread_pct", liquidity: "liq", pressure: "offer_pressure", net: "net", floor: "floor" };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const pool = getPool();
  try {
    const sortKey = SORTS[req.query.sort] || "score";
    const minPrice = parseFloat(req.query.minprice) || 0;
    const q = (req.query.q || "").toString().trim().toLowerCase();

    const { rows } = await pool.query(
      `SELECT ol.collection, ol.item_id, ol.name, ol.boost_text, ol.floor, ol.last_sale,
              ol.supply, ol.best_offer, ol.best_listing, ol.spread, ol.spread_pct,
              ol.offer_count, ol.listing_count, ol.offer_pressure, ol.listing_pressure,
              ol.avg_trade10, ol.n_trades10, ol.balance, ol.ts,
              COALESCE(t.trades_today, 0) AS trades_today
       FROM ob_last ol
       LEFT JOIN (
         SELECT collection, item_id, COUNT(*) AS trades_today
         FROM marketplace_trades WHERE fulfilled_at >= CURRENT_DATE
         GROUP BY collection, item_id
       ) t ON t.collection = ol.collection AND t.item_id = ol.item_id
       WHERE ol.best_offer IS NOT NULL AND ol.best_listing IS NOT NULL`
    );

    let items = rows.map((r) => {
      const tradesToday = Number(r.trades_today) || 0; // pg COUNT(*) comes back as a string
      const net = r.best_listing * (1 - FEE) - r.best_offer;
      const margin = r.best_offer > 0 ? (net / r.best_offer) * 100 : 0;
      const liq = tradesToday + (r.offer_pressure || 0) * 0.5;
      const score = Math.max(margin, 0) * (1 + liq);
      const price = r.avg_trade10 || r.best_listing || r.floor || r.last_sale || 0;
      return {
        collection: r.collection, itemId: r.item_id, name: r.name, boost: r.boost_text,
        floor: r.floor, lastSale: r.last_sale, supply: r.supply,
        bestOffer: r.best_offer, bestListing: r.best_listing,
        spread: r.spread, spreadPct: r.spread_pct,
        offerCount: r.offer_count, listingCount: r.listing_count,
        offerPressure: r.offer_pressure, listingPressure: r.listing_pressure,
        avgTrade10: r.avg_trade10, nTrades10: r.n_trades10, tradesToday,
        balance: r.balance, price,
        net: Math.round(net * 100) / 100, margin: Math.round(margin * 10) / 10,
        liq: Math.round(liq * 10) / 10, score: Math.round(score * 10) / 10,
        updatedAt: r.ts,
      };
    });

    if (minPrice > 0) items = items.filter((i) => i.price >= minPrice);
    if (q) items = items.filter((i) => (i.name || "").toLowerCase().includes(q));
    const dir = sortKey === "floor" ? 1 : -1; // floor ascending (cheapest first), else desc
    items.sort((a, b) => {
      const av = sortKey === "score" ? a.score : sortKey === "margin" ? a.margin : sortKey === "spread_pct" ? (a.spreadPct || 0)
        : sortKey === "liq" ? a.liq : sortKey === "offer_pressure" ? a.offerPressure : sortKey === "net" ? a.net : (a.floor || 0);
      const bv = sortKey === "score" ? b.score : sortKey === "margin" ? b.margin : sortKey === "spread_pct" ? (b.spreadPct || 0)
        : sortKey === "liq" ? b.liq : sortKey === "offer_pressure" ? b.offerPressure : sortKey === "net" ? b.net : (b.floor || 0);
      return (av - bv) * dir;
    });

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({ sort: req.query.sort || "score", count: items.length, items });
  } catch (err) {
    console.error("orderbook-flips:", err.message);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
