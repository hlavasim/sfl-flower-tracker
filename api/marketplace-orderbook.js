import { getPool } from "./_db.js";
import ITEM_NAMES from "./_item-names.js";
import { requireWriteToken } from "./_auth.js";

/*
 * ?book=1 — the top of the book for the WHOLE catalogue, keyed by item name: floor (cheapest
 * listing), bestOffer, listing/offer counts, latest sale. One call to the documented community
 * marketplaceActivity feed carries all ~3,000 items; it is throttled to about one request per 5 s
 * per IP, so the compact result is shared through KV for 5 minutes (and kept per warm instance).
 * The roadmap reads it to show the best offer next to each item and whether the owner's own offer
 * (from farm.trades.offers) is on top.
 */
const _book = { at: 0, data: null };

/*
 * Item key of the marketplaceActivity feed → { collection, id }. The same function as
 * azure-functions/shared/market-key.js (the collectors' copy — a CommonJS module this file cannot
 * import without the bundling trouble farm-diff-agg.js describes); tests/api/market-key.test.mjs
 * pins that they agree. Splits on the LAST dash so "economies-{slug}-{id}" keeps its slug in the
 * collection, and the id must be all digits.
 */
export function parseItemKey(key) {
  const s = String(key == null ? "" : key);
  const dash = s.lastIndexOf("-");
  if (dash <= 0) return null;
  const idPart = s.slice(dash + 1);
  if (!/^\d+$/.test(idPart)) return null;
  return { collection: s.slice(0, dash), id: parseInt(idPart, 10) };
}

async function handleBook(res) {
  const kvUrl = process.env.KV_REST_API_URL, kvTok = process.env.KV_REST_API_TOKEN;
  const KEY = "cache:market-book:v1", TTL = 300;
  res.setHeader("Cache-Control", "public, max-age=60");
  if (_book.data && Date.now() - _book.at < TTL * 1000) return res.status(200).json(_book.data);
  if (kvUrl && kvTok) {
    try {
      const g = await (await fetch(`${kvUrl}/get/${encodeURIComponent(KEY)}`, { headers: { Authorization: `Bearer ${kvTok}` } })).json();
      if (g.result) { _book.data = JSON.parse(g.result); _book.at = Date.now(); return res.status(200).json(_book.data); }
    } catch {}
  }
  const key = process.env.SFL_API_KEY;
  if (!key) return res.status(500).json({ error: "SFL_API_KEY not configured" });
  const r = await fetch("https://api.sunflower-land.com/community/data?type=marketplaceActivity",
    { headers: { "Content-Type": "application/json;charset=UTF-8", "x-api-key": key } });
  if (!r.ok) {
    if (_book.data) return res.status(200).json({ ..._book.data, stale: true });
    return res.status(r.status === 429 ? 503 : 502).json({ error: `marketplaceActivity ${r.status}` });
  }
  const act = (await r.json()).data || {};
  const reports = act.reports || {};
  const day = Object.keys(reports).sort().pop();
  const items = {};
  for (const [k, m] of Object.entries((reports[day] || {}).items || {})) {
    const key = parseItemKey(k);
    if (!key) continue;
    // Community economies ("economies-{slug}-{id}") have no entry in ITEM_NAMES and drop out here.
    const name = (ITEM_NAMES[key.collection] || {})[key.id];
    if (!name || (m.floor == null && m.bestOffer == null)) continue;
    items[name] = { c: key.collection, id: key.id, f: m.floor ?? null, b: m.bestOffer ?? null, lc: m.listingCount || 0, oc: m.offerCount || 0, ls: m.latestSale ?? null };
  }
  const data = { at: new Date().toISOString(), day, flowerPrice: act.flowerPrice ?? null, items };
  _book.data = data; _book.at = Date.now();
  if (kvUrl && kvTok) {
    try { await fetch(`${kvUrl}/set/${encodeURIComponent(KEY)}?EX=${TTL}`, { method: "POST", headers: { Authorization: `Bearer ${kvTok}`, "Content-Type": "text/plain" }, body: JSON.stringify(data) }); } catch {}
  }
  return res.status(200).json(data);
}

// ── flips + health modes fold in here (kept as query modes to stay under Vercel's
// serverless-function budget rather than shipping separate endpoint files). ──
const FLIP_FEE = 0.10;
// ob_last keeps a row per item forever; a book the collector has not confirmed within this many
// hours (it refreshes every live item hourly) is not a spread anyone can trade today.
const FLIP_MAX_AGE_H = 3;
const FLIP_SORTS = { score: "score", margin: "margin", spread: "spread_pct", liquidity: "liq", pressure: "offer_pressure", net: "net", floor: "floor" };
// `paused` collectors are ones whose upstream the game walled off behind its
// request-token anti-scraping layer on 2026-09-01 (RT-001 on /collection + /marketplace):
// no server-side caller can sign those requests, so the Azure timers are disabled and these
// tables have stopped growing on purpose. They stay in the report (with their age, so the
// freeze date is visible) but never count as stale — the watchdog must not alarm on a stop
// we chose. Drop the flag if the game reopens a server route and the collectors resume.
const HEALTH_COLLECTORS = [
  { table: "farm_snapshots", col: "captured_at", label: "Farm snapshots", staleH: 2 },
  // Prices + NFT values are sourced from sfl.world, not the game directly. When the game walled
  // its API on 2026-09-01, sfl.world's own scrape froze too — a third-party outage we can't fix,
  // that recovers on its own. The 48h threshold (was 12h) rides out such a hiccup silently and
  // only alarms if it stays dead for two full days, which is when it stops being "wait for them".
  { table: "price_changes", col: "captured_at", label: "Prices", staleH: 48 },
  // sfl.world's NFT feed froze on 2026-08-31 and was paused here while it stayed frozen; it is
  // live again, so it is watched again. The collector is change-based (writes only when a floor,
  // last sale or supply moves), so the same 48h threshold as prices applies.
  { table: "nft_changes", col: "captured_at", label: "NFT values", staleH: 48 },
  { table: "marketplace_trades", col: "fulfilled_at", label: "Marketplace trades", staleH: 6, paused: true },
  { table: "ob_snap", col: "ts", label: "Orderbook", staleH: 3, paused: true },
  { table: "marks_snapshots", col: "captured_at", label: "Marks", staleH: 30 },
  // Written hourly by marketplace-activity (community API key, not the walled routes). Watched
  // because a missing migration used to roll this collector back every hour without a sound.
  { table: "marketplace_daily", col: "captured_at", label: "Marketplace daily", staleH: 3 },
  { table: "marketplace_totals", col: "captured_at", label: "Marketplace totals", staleH: 3 },
];

/*
 * The game's player-JWT routes (/collection, /marketplace) were walled on 2026-09-01 (RT-001) and
 * answer 403/500 to every server-side caller, so nothing here signs with a game token any more.
 * Everything goes through the documented community API with the project's SFL_API_KEY, which does
 * not expire. (The Redis game token and its "expires in" banner went with it.)
 */
async function communityGet(query) {
  const key = process.env.SFL_API_KEY;
  if (!key) throw Object.assign(new Error("SFL_API_KEY not configured"), { status: 500 });
  const r = await fetch(`https://api.sunflower-land.com/community/data?${query}`,
    { headers: { "Content-Type": "application/json;charset=UTF-8", "x-api-key": key } });
  if (!r.ok) throw Object.assign(new Error(`community ${r.status}`), { status: r.status });
  return (await r.json()).data || {};
}

/*
 * Floors of the 1-of-1 collections (buds, pets) from ONE marketplaceActivity call — it carries
 * every bud and pet id with its floor (cheapest listing, absent when none is listed), best offer
 * and latest sale. Shared through KV for 5 minutes: the feed is throttled to ~1 request / 5 s.
 */
const _uniq = { at: 0, data: null };
export function uniqueFloorsFromActivity(act) {
  const reports = (act && act.reports) || {};
  const day = Object.keys(reports).sort().pop();
  const out = { buds: [], pets: [] };
  for (const [k, m] of Object.entries((reports[day] || {}).items || {})) {
    const key = parseItemKey(k);
    if (!key || !out[key.collection] || !(m && m.floor > 0)) continue;
    out[key.collection].push({ id: key.id, floor: m.floor, lastSale: m.latestSale ?? null });
  }
  return out;
}
async function loadUniqueFloors() {
  const kvUrl = process.env.KV_REST_API_URL, kvTok = process.env.KV_REST_API_TOKEN;
  const KEY = "cache:market-unique-floors:v1", TTL = 300;
  if (_uniq.data && Date.now() - _uniq.at < TTL * 1000) return _uniq.data;
  if (kvUrl && kvTok) {
    try {
      const g = await (await fetch(`${kvUrl}/get/${encodeURIComponent(KEY)}`, { headers: { Authorization: `Bearer ${kvTok}` } })).json();
      if (g.result) { _uniq.data = JSON.parse(g.result); _uniq.at = Date.now(); return _uniq.data; }
    } catch {}
  }
  const data = uniqueFloorsFromActivity(await communityGet("type=marketplaceActivity"));
  _uniq.data = data; _uniq.at = Date.now();
  if (kvUrl && kvTok) {
    try { await fetch(`${kvUrl}/set/${encodeURIComponent(KEY)}?EX=${TTL}`, { method: "POST", headers: { Authorization: `Bearer ${kvTok}`, "Content-Type": "text/plain" }, body: JSON.stringify(data) }); } catch {}
  }
  return data;
}

async function handleHealth(pool, res) {
  const rows = await Promise.all(HEALTH_COLLECTORS.map(async (c) => {
    try {
      const q = await pool.query(`SELECT MAX(${c.col}) AS last FROM ${c.table}`);
      const last = q.rows[0].last;
      const ageH = last ? (Date.now() - new Date(last).getTime()) / 3600000 : null;
      // A paused collector is never stale: it stopped by design (game API walled off), so it
      // reports its age for context but stays out of the staleCollectors alarm below.
      return { table: c.table, label: c.label, lastWrite: last, ageHours: ageH == null ? null : Math.round(ageH * 10) / 10,
        stale: c.paused ? false : (ageH == null ? true : ageH > c.staleH), staleThresholdH: c.staleH, paused: !!c.paused };
    } catch (e) { return { table: c.table, label: c.label, lastWrite: null, ageHours: null, stale: !c.paused, paused: !!c.paused, error: String(e.message || e).slice(0, 80) }; }
  }));
  const staleCollectors = rows.filter((r) => r.stale).map((r) => r.label);
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
  return res.status(200).json({ ok: staleCollectors.length === 0, collectors: rows, warnings: { staleCollectors } });
}

const WISHLIST_OWNER = 155498; // only the owner's wishlist is writable (personal tool)
function _parseBody(body) {
  if (!body) return {};
  if (Buffer.isBuffer(body)) { try { return JSON.parse(body.toString()); } catch { return {}; } }
  if (typeof body === "string") { try { return JSON.parse(body); } catch { return {}; } }
  return body;
}

// GET  ?wishlist=1&farm=N              → { list: { "coll:Name": priority } }
// POST ?wishlist=1  { farm, ...op }    → op is one of:
//   { key, priority }  upsert one item   |   { remove }  delete one item
//   { list: {...} }    replace the whole list (import)
// Writes are gated to the owner farm AND the write token; reads are open (empty for others).
async function handleWishlist(pool, req, res) {
  if (req.method === "GET") {
    const farm = parseInt(req.query.farm);
    if (!farm) return res.status(400).json({ error: "farm required" });
    const { rows } = await pool.query("SELECT item_key, priority FROM wishlist WHERE farm_id = $1", [farm]);
    const list = {};
    for (const r of rows) list[r.item_key] = r.priority;
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ farm, list });
  }
  if (req.method === "POST") {
    const body = _parseBody(req.body);
    const farm = parseInt(body.farm);
    if (farm !== WISHLIST_OWNER) return res.status(403).json({ error: "wishlist is read-only for this farm" });
    if (!requireWriteToken(req, res)) return;
    if (body.list && typeof body.list === "object") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM wishlist WHERE farm_id = $1", [farm]);
        for (const [key, prio] of Object.entries(body.list)) {
          const p = Math.min(Math.max(parseInt(prio) || 2, 1), 3);
          await client.query("INSERT INTO wishlist (farm_id, item_key, priority) VALUES ($1,$2,$3) ON CONFLICT (farm_id,item_key) DO UPDATE SET priority = EXCLUDED.priority, updated_at = NOW()", [farm, key, p]);
        }
        await client.query("COMMIT");
      } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
      return res.status(200).json({ ok: true, count: Object.keys(body.list).length });
    }
    if (body.remove) {
      await pool.query("DELETE FROM wishlist WHERE farm_id = $1 AND item_key = $2", [farm, String(body.remove)]);
      return res.status(200).json({ ok: true });
    }
    if (body.key) {
      const p = Math.min(Math.max(parseInt(body.priority) || 2, 1), 3);
      await pool.query("INSERT INTO wishlist (farm_id, item_key, priority) VALUES ($1,$2,$3) ON CONFLICT (farm_id,item_key) DO UPDATE SET priority = EXCLUDED.priority, updated_at = NOW()", [farm, String(body.key), p]);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "provide key+priority, remove, or list" });
  }
  return res.status(405).json({ error: "method not allowed" });
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
     WHERE ol.best_offer IS NOT NULL AND ol.best_listing IS NOT NULL
       AND ol.ts > NOW() - make_interval(hours => $1)`, [FLIP_MAX_AGE_H]);
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
  return res.status(200).json({ sort: req.query.sort || "score", maxAgeHours: FLIP_MAX_AGE_H, count: items.length, items });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Folded-in modes (see top-of-file note).
  if (req.query.wishlist === "1") { try { return await handleWishlist(getPool(), req, res); } catch (e) { console.error("wishlist:", e.message); return res.status(500).json({ error: String(e.message || e) }); } }
  if (req.query.book === "1") { try { return await handleBook(res); } catch (e) { console.error("book:", e.message); return res.status(500).json({ error: String(e.message || e) }); } }
  if (req.query.health === "1") { try { return await handleHealth(getPool(), res); } catch (e) { return res.status(500).json({ error: String(e.message || e) }); } }
  if (req.query.flips === "1") { try { return await handleFlips(getPool(), req, res); } catch (e) { console.error("flips:", e.message); return res.status(500).json({ error: String(e.message || e) }); } }

  // ── Live order book of ONE item (Sales page), on demand only, never on a schedule.
  // The community "tradeable" route carries the same listings/offers as the walled /collection
  // route did. It is throttled to ~1 request / 5 s, so the answer is cached for a minute and the
  // page paces its calls; a 429 goes back to the page, which retries.
  if (req.query.live === "1") {
    const collection = req.query.collection;
    const itemId = parseInt(req.query.item_id);
    const allowed = ["collectibles", "wearables", "resources", "buds", "pets"];
    if (!allowed.includes(collection) || isNaN(itemId)) {
      return res.status(400).json({ error: "live mode needs ?collection=<type>&item_id=N" });
    }
    try {
      const d = await communityGet(`type=tradeable&collection=${encodeURIComponent(collection)}&id=${itemId}`);
      const listings = (d.listings || []).map((l) => ({ sfl: l.sfl, qty: l.quantity, by: l.listedById, name: l.listedBy?.username || null }));
      const offers = (d.offers || []).map((o) => ({ sfl: o.sfl, qty: o.quantity, by: o.offeredById, name: o.offeredBy?.username || null }));
      res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
      return res.status(200).json({ live: true, floor: d.floor, listingCount: d.listingCount ?? listings.length, offerCount: d.offerCount ?? offers.length, listings, offers });
    } catch (e) {
      if (e.status === 429) return res.status(429).json({ error: "rate limited by SFL API" });
      return res.status(502).json({ error: String(e.message || e) });
    }
  }

  // ── Floors of every listed pet / bud (1-of-1 collections), from the community catalogue.
  // Pets: the caller groups them by type (PET_TYPES) for per-breed floors. Buds: the caller joins
  // them against section=buds (id -> traits/boost) to price a bud.
  if (req.query.petfloors === "1" || req.query.budfloors === "1") {
    try {
      const f = await loadUniqueFloors();
      res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=240");
      return req.query.petfloors === "1"
        ? res.status(200).json({ pets: true, items: f.pets.map((i) => ({ id: i.id, floor: i.floor })) })
        : res.status(200).json({ buds: true, items: f.buds });
    } catch (e) {
      if (e.status === 429) return res.status(429).json({ error: "rate limited by SFL API" });
      return res.status(502).json({ error: String(e.message || e) });
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
