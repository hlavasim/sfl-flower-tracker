// Hourly orderbook collector for BOOSTED NFTs — the cockpit's sfl_orderbook.py
// model (MIGRATION.md §4.1) as an Azure Function. For every item in the
// sfl.world feed with have_boost, fetch /collection/{coll}/{id} (Bearer JWT
// from Redis, same as marketplace-trades) and write:
//   ob_snap  — historized metrics + price ladders (time series, append-only)
//   ob_last  — latest state per item (upsert)
//   marketplace_trades — real trades, deduped, with is_mine/my_side
// Metrics per §4.1: ladder = offers/listings aggregated by price [{p,q,n}]
// ascending; best_offer = max offer price (highest bid); best_listing = min
// listing price (lowest ask); spread; spread_pct = spread/best_listing×100;
// pressure = orders within BAND = 2.0 FLOWER of the best price; avg_trade10 =
// mean unit price of the last 10 real sales.
const { getPool } = require("../shared/db");
const { fetchNfts, fetchCollectionItem } = require("../shared/api");

const MY_FARM_ID = 155498;
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const REDIS_TOKEN_KEY = `game_token:${MY_FARM_ID}`;
const PRESSURE_BAND = 2.0; // FLOWER band around the best price (§4.1)
const ITEM_DELAY_MS = 150; // polite pause between per-item API calls
const MAX_RETRIES = 3;

async function getGameToken() {
  if (process.env.GAME_TOKEN) return process.env.GAME_TOKEN; // local/manual runs
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const resp = await fetch(`${KV_URL}/get/${encodeURIComponent(REDIS_TOKEN_KEY)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.result || null;
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// offers/listings [{sfl, quantity}] → ladder [{p, q, n}] ascending by price
function buildLadder(orders) {
  const byPrice = new Map();
  for (const o of orders || []) {
    const p = +o.sfl || 0;
    const q = +o.quantity || 1;
    const cur = byPrice.get(p) || { p, q: 0, n: 0 };
    cur.q += q;
    cur.n += 1;
    byPrice.set(p, cur);
  }
  return [...byPrice.values()].sort((a, b) => a.p - b.p);
}

function computeMetrics(detail) {
  const offers = detail.offers || [];
  const listings = detail.listings || [];
  const offerLadder = buildLadder(offers);
  const listingLadder = buildLadder(listings);
  const bestOffer = offerLadder.length ? offerLadder[offerLadder.length - 1].p : null;
  const bestListing = listingLadder.length ? listingLadder[0].p : null;
  const spread = bestOffer != null && bestListing != null ? bestListing - bestOffer : null;
  const spreadPct = spread != null && bestListing > 0 ? (spread / bestListing) * 100 : null;
  const offerPressure = bestOffer != null
    ? offerLadder.filter((l) => l.p >= bestOffer - PRESSURE_BAND).reduce((a, l) => a + l.n, 0) : 0;
  const listingPressure = bestListing != null
    ? listingLadder.filter((l) => l.p <= bestListing + PRESSURE_BAND).reduce((a, l) => a + l.n, 0) : 0;
  const sales = ((detail.history && detail.history.sales) || [])
    .slice()
    .sort((a, b) => (b.fulfilledAt || 0) - (a.fulfilledAt || 0))
    .slice(0, 10);
  const unitPrices = sales
    .map((s) => (+s.sfl || 0) / Math.max(+s.quantity || 1, 1))
    .filter((p) => p > 0);
  const avgTrade10 = unitPrices.length ? unitPrices.reduce((a, b) => a + b, 0) / unitPrices.length : null;
  return {
    offerLadder, listingLadder, bestOffer, bestListing, spread, spreadPct,
    offerCount: offers.length, listingCount: listings.length,
    offerPressure, listingPressure, avgTrade10, nTrades10: unitPrices.length,
  };
}

// my_side: for a fulfilled LISTING the initiator was the seller and the
// fulfiller bought; for a fulfilled OFFER the initiator was the buyer and the
// fulfiller sold.
function mySide(sale) {
  const initId = +(sale.initiatedBy && sale.initiatedBy.id) || 0;
  const fulfId = +(sale.fulfilledBy && sale.fulfilledBy.id) || 0;
  if (initId !== MY_FARM_ID && fulfId !== MY_FARM_ID) return { isMine: false, side: null };
  const iAmInitiator = initId === MY_FARM_ID;
  const source = sale.source || "listing";
  const side = source === "offer"
    ? (iAmInitiator ? "buy" : "sell")
    : (iAmInitiator ? "sell" : "buy");
  return { isMine: true, side };
}

module.exports = async function (context) {
  const pool = getPool();

  const token = await getGameToken();
  if (!token) {
    context.log.warn("No game token available in Redis — skipping orderbook-snapshot");
    return;
  }
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      context.log.warn("Game token expired — skipping orderbook-snapshot");
      return;
    }
  } catch {
    context.log.warn("Cannot decode game token — proceeding anyway");
  }

  const nfts = await fetchNfts();
  const boosted = [];
  for (const coll of ["collectibles", "wearables"]) {
    for (const item of nfts[coll] || []) {
      if (item.have_boost && item.id != null) boosted.push({ ...item, collection: coll });
    }
  }
  context.log(`orderbook-snapshot: ${boosted.length} boosted NFTs to capture`);

  let snaps = 0, trades = 0, failed = 0;
  const client = await pool.connect();
  try {
    for (const item of boosted) {
      let detail = null;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          detail = await fetchCollectionItem(item.collection, item.id, token);
          break;
        } catch (err) {
          const retriable = err.status === 429 || /API 5\d\d/.test(err.message);
          if (!retriable || attempt === MAX_RETRIES) {
            context.log.warn(`${item.collection}/${item.id} (${item.name}): ${err.message}`);
            break;
          }
          await sleep(1000 * attempt * (err.status === 429 ? 2 : 1));
        }
      }
      if (!detail) { failed++; continue; }

      const m = computeMetrics(detail);
      // balance: how many I own — the detail endpoint is called with MY token
      const balance = detail.balance != null ? +detail.balance || 0 : null;

      try {
        await client.query("BEGIN");

        await client.query(
          `INSERT INTO ob_snap
             (collection, item_id, best_offer, best_listing, spread, spread_pct,
              offer_count, listing_count, offer_pressure, listing_pressure,
              avg_trade10, n_trades10, offer_ladder, listing_ladder)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [item.collection, item.id, m.bestOffer, m.bestListing, m.spread, m.spreadPct,
           m.offerCount, m.listingCount, m.offerPressure, m.listingPressure,
           m.avgTrade10, m.nTrades10, JSON.stringify(m.offerLadder), JSON.stringify(m.listingLadder)]
        );

        await client.query(
          `INSERT INTO ob_last
             (collection, item_id, ts, name, boost_text, floor, last_sale, supply,
              best_offer, best_listing, spread, spread_pct, offer_count, listing_count,
              offer_pressure, listing_pressure, avg_trade10, n_trades10, balance,
              offer_ladder, listing_ladder)
           VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           ON CONFLICT (collection, item_id) DO UPDATE SET
             ts = EXCLUDED.ts, name = EXCLUDED.name, boost_text = EXCLUDED.boost_text,
             floor = EXCLUDED.floor, last_sale = EXCLUDED.last_sale, supply = EXCLUDED.supply,
             best_offer = EXCLUDED.best_offer, best_listing = EXCLUDED.best_listing,
             spread = EXCLUDED.spread, spread_pct = EXCLUDED.spread_pct,
             offer_count = EXCLUDED.offer_count, listing_count = EXCLUDED.listing_count,
             offer_pressure = EXCLUDED.offer_pressure, listing_pressure = EXCLUDED.listing_pressure,
             avg_trade10 = EXCLUDED.avg_trade10, n_trades10 = EXCLUDED.n_trades10,
             balance = EXCLUDED.balance,
             offer_ladder = EXCLUDED.offer_ladder, listing_ladder = EXCLUDED.listing_ladder`,
          [item.collection, item.id, item.name || null, item.boost_text || null,
           +item.floor || null, +item.lastSalePrice || null, +item.supply || 0,
           m.bestOffer, m.bestListing, m.spread, m.spreadPct, m.offerCount, m.listingCount,
           m.offerPressure, m.listingPressure, m.avgTrade10, m.nTrades10, balance,
           JSON.stringify(m.offerLadder), JSON.stringify(m.listingLadder)]
        );

        for (const sale of (detail.history && detail.history.sales) || []) {
          if (!sale.id) continue;
          const { isMine, side } = mySide(sale);
          const r = await client.query(
            `INSERT INTO marketplace_trades
               (trade_id, collection, item_id, sfl, source, quantity, fulfilled_at,
                initiated_by_id, initiated_by_name, fulfilled_by_id, fulfilled_by_name,
                is_mine, my_side)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (trade_id) DO NOTHING`,
            [String(sale.id), item.collection, item.id, +sale.sfl || 0, sale.source || null,
             +sale.quantity || 1, sale.fulfilledAt ? new Date(sale.fulfilledAt) : new Date(),
             (sale.initiatedBy && sale.initiatedBy.id) || null,
             (sale.initiatedBy && sale.initiatedBy.username) || null,
             (sale.fulfilledBy && sale.fulfilledBy.id) || null,
             (sale.fulfilledBy && sale.fulfilledBy.username) || null,
             isMine, side]
          );
          trades += r.rowCount;
        }

        await client.query("COMMIT");
        snaps++;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        failed++;
        context.log.warn(`DB write ${item.collection}/${item.id}: ${err.message}`);
      }

      await sleep(ITEM_DELAY_MS);
    }
  } finally {
    client.release();
  }

  context.log(`orderbook-snapshot done: ${snaps} items captured, ${trades} new trades, ${failed} failed`);
};
