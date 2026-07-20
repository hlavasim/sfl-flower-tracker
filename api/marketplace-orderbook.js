import { getPool } from "./_db.js";

// ── flips + health modes fold in here (kept as query modes to stay under Vercel's
// serverless-function budget rather than shipping separate endpoint files). ──
const FLIP_FEE = 0.10;
const FLIP_SORTS = { score: "score", margin: "margin", spread: "spread_pct", liquidity: "liq", pressure: "offer_pressure", net: "net", floor: "floor" };
const HEALTH_COLLECTORS = [
  { table: "farm_snapshots", col: "captured_at", label: "Farm snapshots", staleH: 2 },
  { table: "price_changes", col: "captured_at", label: "Prices", staleH: 12 },
  { table: "nft_changes", col: "captured_at", label: "NFT values", staleH: 12 },
  { table: "marketplace_trades", col: "fulfilled_at", label: "Marketplace trades", staleH: 6 },
  { table: "ob_snap", col: "ts", label: "Orderbook", staleH: 3 },
  { table: "marks_snapshots", col: "captured_at", label: "Marks", staleH: 30 },
];

async function _tokenStatus() {
  const url = process.env.KV_REST_API_URL, tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return { configured: false };
  try {
    const r = await fetch(`${url}/get/game_token:155498`, { headers: { Authorization: `Bearer ${tok}` } });
    const token = (await r.json()).result;
    if (!token) return { configured: true, present: false };
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    const expMs = payload.exp ? payload.exp * 1000 : null;
    const daysLeft = expMs ? (expMs - Date.now()) / 86400000 : null;
    return { configured: true, present: true, expired: expMs ? expMs < Date.now() : false,
      daysLeft: daysLeft == null ? null : Math.round(daysLeft * 10) / 10,
      expiresAt: expMs ? new Date(expMs).toISOString() : null };
  } catch { return { configured: true, present: false, error: true }; }
}

async function handleHealth(pool, res) {
  const rows = await Promise.all(HEALTH_COLLECTORS.map(async (c) => {
    try {
      const q = await pool.query(`SELECT MAX(${c.col}) AS last FROM ${c.table}`);
      const last = q.rows[0].last;
      const ageH = last ? (Date.now() - new Date(last).getTime()) / 3600000 : null;
      return { table: c.table, label: c.label, lastWrite: last, ageHours: ageH == null ? null : Math.round(ageH * 10) / 10,
        stale: ageH == null ? true : ageH > c.staleH, staleThresholdH: c.staleH };
    } catch (e) { return { table: c.table, label: c.label, lastWrite: null, ageHours: null, stale: true, error: String(e.message || e).slice(0, 80) }; }
  }));
  const token = await _tokenStatus();
  const staleCollectors = rows.filter((r) => r.stale).map((r) => r.label);
  const tokenWarn = token.present === false || token.expired === true || (token.daysLeft != null && token.daysLeft < 3);
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
  return res.status(200).json({ ok: staleCollectors.length === 0 && !tokenWarn, token, collectors: rows,
    warnings: { token: tokenWarn ? (token.present === false ? "missing" : token.expired ? "expired" : `expires in ${token.daysLeft}d`) : null, staleCollectors } });
}

async function handleFlips(pool, req, res) {
  const sortKey = FLIP_SORTS[req.query.sort] || "score";
  const minPrice = parseFloat(req.query.minprice) || 0;
  const q = (req.query.q || "").toString().trim().toLowerCase();
  const { rows } = await pool.query(
    `SELECT ol.collection, ol.item_id, ol.name, ol.boost_text, ol.floor, ol.last_sale, ol.supply,
            ol.best_offer, ol.best_listing, ol.spread, ol.spread_pct, ol.offer_count, ol.listing_count,
            ol.offer_pressure, ol.listing_pressure, ol.avg_trade10, ol.n_trades10, ol.balance, ol.ts,
            COALESCE(t.trades_today, 0) AS trades_today
     FROM ob_last ol
     LEFT JOIN (SELECT collection, item_id, COUNT(*) AS trades_today FROM marketplace_trades WHERE fulfilled_at >= CURRENT_DATE GROUP BY collection, item_id) t
       ON t.collection = ol.collection AND t.item_id = ol.item_id
     WHERE ol.best_offer IS NOT NULL AND ol.best_listing IS NOT NULL`);
  let items = rows.map((r) => {
    const tradesToday = Number(r.trades_today) || 0;
    const net = r.best_listing * (1 - FLIP_FEE) - r.best_offer;
    const margin = r.best_offer > 0 ? (net / r.best_offer) * 100 : 0;
    const liq = tradesToday + (r.offer_pressure || 0) * 0.5;
    const score = Math.max(margin, 0) * (1 + liq);
    const price = r.avg_trade10 || r.best_listing || r.floor || r.last_sale || 0;
    return { collection: r.collection, itemId: r.item_id, name: r.name, boost: r.boost_text,
      floor: r.floor, lastSale: r.last_sale, supply: r.supply, bestOffer: r.best_offer, bestListing: r.best_listing,
      spread: r.spread, spreadPct: r.spread_pct, offerCount: r.offer_count, listingCount: r.listing_count,
      offerPressure: r.offer_pressure, listingPressure: r.listing_pressure, avgTrade10: r.avg_trade10,
      nTrades10: r.n_trades10, tradesToday, balance: r.balance, price,
      net: Math.round(net * 100) / 100, margin: Math.round(margin * 10) / 10,
      liq: Math.round(liq * 10) / 10, score: Math.round(score * 10) / 10, updatedAt: r.ts };
  });
  if (minPrice > 0) items = items.filter((i) => i.price >= minPrice);
  if (q) items = items.filter((i) => (i.name || "").toLowerCase().includes(q));
  const dir = sortKey === "floor" ? 1 : -1;
  const val = (x) => sortKey === "score" ? x.score : sortKey === "margin" ? x.margin : sortKey === "spread_pct" ? (x.spreadPct || 0)
    : sortKey === "liq" ? x.liq : sortKey === "offer_pressure" ? x.offerPressure : sortKey === "net" ? x.net : (x.floor || 0);
  items.sort((a, b) => (val(a) - val(b)) * dir);
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
  return res.status(200).json({ sort: req.query.sort || "score", count: items.length, items });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Folded-in modes (see top-of-file note).
  if (req.query.health === "1") { try { return await handleHealth(getPool(), res); } catch (e) { return res.status(500).json({ error: String(e.message || e) }); } }
  if (req.query.flips === "1") { try { return await handleFlips(getPool(), req, res); } catch (e) { console.error("flips:", e.message); return res.status(500).json({ error: String(e.message || e) }); } }

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

  // ── Pet floors mode: all pet listings (id + floor) so the caller can compute
  // per-type (breed) floors for 1-of-1 pets. One call covers every pet type.
  if (req.query.petfloors === "1") {
    const token = process.env.SFL_GAME_TOKEN;
    if (!token) return res.status(503).json({ error: "no game token configured" });
    try {
      const r = await fetch(
        "https://api.sunflower-land.com/marketplace?filters=pets",
        { headers: { "Content-Type": "application/json;charset=UTF-8", "Authorization": `Bearer ${token}` } }
      );
      if (r.status === 429) return res.status(429).json({ error: "rate limited by SFL API" });
      if (!r.ok) return res.status(502).json({ error: `SFL API ${r.status}` });
      const d = await r.json();
      const items = (d.items || [])
        .filter((i) => (i.floor || 0) > 0)
        .map((i) => ({ id: i.id, floor: i.floor }));
      res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=240");
      return res.status(200).json({ pets: true, items });
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
