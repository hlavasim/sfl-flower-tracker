// Hourly orderbook collector, rebuilt on the community API (2026-09-11).
//
// The original walked every boosted NFT and called /collection/{coll}/{id} with a player's
// Bearer JWT lifted from Redis. The game walled that route behind its request-token layer on
// 2026-09-01 (RT-001): it answers 500 to every server-side caller, the token dance is moot, and
// this collector has written nothing since.
//
// The documented community API replaces it, and inverts the shape of the job:
//
//   PASS 1 — one request to marketplaceActivity returns the ENTIRE catalogue with a market
//            snapshot per item: floor (cheapest listing), bestOffer, listingCount, offerCount,
//            latestSale. ~1,600 items with a live book, against the ~200 boosted ones the old
//            sweep reached. Everything ob_last needs except the ladders.
//   PASS 2 — a paced per-item sweep of the boosted items for what the snapshot cannot carry:
//            the price ladders, the pressure counts, supply, and the real trades. The endpoint
//            is throttled to roughly one request per 5 seconds (measured: at 1.5s apart 4 of 6
//            calls 429, at 5.5s apart 2 of 6 still did), so this runs oldest-first inside a
//            time budget and rotates across runs rather than trying to cover everything hourly.
//
// `balance` is gone for good: the public view never reports what a particular farm owns, so
// the column is written null by pass 1 and left untouched by pass 2.
const { getPool } = require("../shared/db");
const { fetchNfts, fetchMarketplaceActivity, fetchCollectionItem } = require("../shared/api");

const MY_FARM_ID = 155498;
const PRESSURE_BAND = 2.0;        // FLOWER band around the best price (§4.1)
const DEEP_DELAY_MS = 6000;       // > the measured 5s throttle, so a run does not spend itself on 429s
const DEEP_BUDGET_MS = 6 * 60000; // margin inside host.json's 10-minute functionTimeout
const MAX_RETRIES = 3;

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
    offerCount: detail.offerCount != null ? +detail.offerCount : offers.length,
    listingCount: detail.listingCount != null ? +detail.listingCount : listings.length,
    offerPressure, listingPressure, avgTrade10, nTrades10: unitPrices.length,
  };
}

// The snapshot half of the same metrics, from one catalogue-wide report row. floor IS the
// cheapest active listing, so it doubles as best_listing; either side is absent when that side
// of the book is empty.
function snapshotMetrics(it) {
  const bestListing = it.floor != null ? +it.floor : null;
  const bestOffer = it.bestOffer != null ? +it.bestOffer : null;
  const spread = bestOffer != null && bestListing != null ? bestListing - bestOffer : null;
  const spreadPct = spread != null && bestListing > 0 ? (spread / bestListing) * 100 : null;
  return {
    bestListing, bestOffer, spread, spreadPct,
    offerCount: +it.offerCount || 0,
    listingCount: +it.listingCount || 0,
    lastSale: it.latestSale != null ? +it.latestSale : null,
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

// "collectibles-601" → { collection: "collectibles", id: 601 }. Community economies arrive as
// economies-{slug}-{itemId}, which splits the same way on the LAST dash.
function parseItemKey(key) {
  const dash = key.lastIndexOf("-");
  if (dash === -1) return null;
  const id = parseInt(key.slice(dash + 1), 10);
  if (isNaN(id)) return null;
  return { collection: key.slice(0, dash), id };
}

module.exports = async function (context) {
  const pool = getPool();

  // ── PASS 1: the whole catalogue, one request ──────────────────────────────
  const activity = await fetchMarketplaceActivity();
  const reports = activity.reports || {};
  const day = Object.keys(reports).sort().pop();
  const items = ((reports[day] || {}).items) || {};

  // Names and boost text still come from sfl.world — a third-party feed with no throttle, and
  // the only place the boost wording exists at all.
  let meta = new Map(), boosted = [];
  try {
    const nfts = await fetchNfts();
    for (const coll of ["collectibles", "wearables"]) {
      for (const item of nfts[coll] || []) {
        if (item.id == null) continue;
        meta.set(`${coll}-${item.id}`, item);
        if (item.have_boost) boosted.push({ ...item, collection: coll });
      }
    }
  } catch (err) {
    context.log.warn(`sfl.world meta unavailable (${err.message}) — names/boosts left as they are`);
  }

  /*
   * What the book looked like at the end of the last run, so pass 1 can historize only what
   * MOVED. ob_snap is kept forever by policy (cleanup/index.js: "orderbook price-movement
   * history must never be deleted"), and the catalogue is ~2,100 items with a live book — an
   * unconditional hourly write would add 1.5M rows a month to a table nothing prunes, the great
   * majority of them identical to the row above. Change-based, the same way the NFT collector
   * works: ob_last still refreshes every hour so `ts` stays honest, ob_snap only gains a row
   * when the top of book actually differs.
   */
  const prev = new Map();
  try {
    const r = await pool.query(
      `SELECT collection, item_id, best_offer, best_listing, offer_count, listing_count FROM ob_last`
    );
    for (const row of r.rows) {
      prev.set(`${row.collection}-${row.item_id}`, row);
    }
  } catch (err) {
    context.log.warn(`could not read ob_last for change detection (${err.message}) — historizing everything this run`);
  }
  const near = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(+a - +b) < 1e-9);
  const moved = (key, m) => {
    const p = prev.get(key);
    if (!p) return true;
    return !near(p.best_offer, m.bestOffer) || !near(p.best_listing, m.bestListing) ||
           (+p.offer_count || 0) !== m.offerCount || (+p.listing_count || 0) !== m.listingCount;
  };

  let shallow = 0, historized = 0;
  const client = await pool.connect();
  try {
    for (const [key, it] of Object.entries(items)) {
      const parsed = parseItemKey(key);
      if (!parsed) continue;
      // An item with trade history but nothing on the market reports zeroed counts and no
      // floor. Recording it would overwrite a real book with blanks, so skip it.
      if (it.floor == null && it.bestOffer == null && !it.listingCount && !it.offerCount) continue;
      const m = snapshotMetrics(it);
      const nm = meta.get(key);
      try {
        await client.query("BEGIN");
        if (moved(key, m)) {
          await client.query(
            `INSERT INTO ob_snap
               (collection, item_id, best_offer, best_listing, spread, spread_pct,
                offer_count, listing_count)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [parsed.collection, parsed.id, m.bestOffer, m.bestListing, m.spread, m.spreadPct,
             m.offerCount, m.listingCount]
          );
          historized++;
        }
        /*
         * Only the columns pass 1 actually knows are updated. The ladders, the pressure counts
         * and supply come from the deep sweep and must survive an hourly shallow refresh —
         * overwriting them with nulls every hour is how the ladder data would quietly vanish.
         */
        await client.query(
          `INSERT INTO ob_last
             (collection, item_id, ts, name, boost_text, floor, last_sale,
              best_offer, best_listing, spread, spread_pct, offer_count, listing_count)
           VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (collection, item_id) DO UPDATE SET
             ts = EXCLUDED.ts,
             name = COALESCE(EXCLUDED.name, ob_last.name),
             boost_text = COALESCE(EXCLUDED.boost_text, ob_last.boost_text),
             floor = EXCLUDED.floor, last_sale = EXCLUDED.last_sale,
             best_offer = EXCLUDED.best_offer, best_listing = EXCLUDED.best_listing,
             spread = EXCLUDED.spread, spread_pct = EXCLUDED.spread_pct,
             offer_count = EXCLUDED.offer_count, listing_count = EXCLUDED.listing_count`,
          [parsed.collection, parsed.id, (nm && nm.name) || null, (nm && nm.boost_text) || null,
           m.bestListing, m.lastSale, m.bestOffer, m.bestListing, m.spread, m.spreadPct,
           m.offerCount, m.listingCount]
        );
        await client.query("COMMIT");
        shallow++;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        context.log.warn(`shallow ${key}: ${err.message}`);
      }
    }
  } finally {
    client.release();
  }
  context.log(`orderbook-snapshot pass 1: ${shallow} items from the ${day} report, ${historized} moved (${boosted.length} boosted known)`);

  // ── PASS 2: paced deep sweep for ladders, pressure, supply and real trades ──
  // Oldest first, so successive runs rotate through the boosted set instead of re-reading the
  // same head every hour.
  let order = new Map();
  try {
    const r = await pool.query(
      `SELECT collection, item_id, EXTRACT(EPOCH FROM COALESCE(deep_ts, 'epoch'::timestamptz)) AS age
         FROM ob_last`
    ).catch(() => null);
    if (r) for (const row of r.rows) order.set(`${row.collection}-${row.item_id}`, +row.age || 0);
  } catch { /* ordering is an optimisation; an empty map just means "as listed" */ }
  const queue = boosted
    .slice()
    .sort((a, b) => (order.get(`${a.collection}-${a.id}`) || 0) - (order.get(`${b.collection}-${b.id}`) || 0));

  const started = Date.now();
  let deep = 0, trades = 0, failed = 0;
  const c2 = await pool.connect();
  try {
    for (const item of queue) {
      if (Date.now() - started > DEEP_BUDGET_MS) break;
      let detail = null;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          detail = await fetchCollectionItem(item.collection, item.id);
          break;
        } catch (err) {
          const retriable = err.status === 429 || /API 5\d\d/.test(err.message);
          if (!retriable || attempt === MAX_RETRIES) {
            context.log.warn(`${item.collection}/${item.id} (${item.name}): ${err.message}`);
            break;
          }
          // The throttle doubles to ~10s once tripped, so back off past it rather than into it.
          await sleep(err.status === 429 ? 10000 * attempt : 1000 * attempt);
        }
      }
      if (!detail) { failed++; await sleep(DEEP_DELAY_MS); continue; }

      const m = computeMetrics(detail);
      try {
        await c2.query("BEGIN");
        await c2.query(
          `INSERT INTO ob_snap
             (collection, item_id, best_offer, best_listing, spread, spread_pct,
              offer_count, listing_count, offer_pressure, listing_pressure,
              avg_trade10, n_trades10, offer_ladder, listing_ladder)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [item.collection, item.id, m.bestOffer, m.bestListing, m.spread, m.spreadPct,
           m.offerCount, m.listingCount, m.offerPressure, m.listingPressure,
           m.avgTrade10, m.nTrades10, JSON.stringify(m.offerLadder), JSON.stringify(m.listingLadder)]
        );
        await c2.query(
          `INSERT INTO ob_last
             (collection, item_id, ts, deep_ts, name, boost_text, floor, last_sale, supply,
              best_offer, best_listing, spread, spread_pct, offer_count, listing_count,
              offer_pressure, listing_pressure, avg_trade10, n_trades10,
              offer_ladder, listing_ladder)
           VALUES ($1,$2,NOW(),NOW(),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           ON CONFLICT (collection, item_id) DO UPDATE SET
             ts = EXCLUDED.ts, deep_ts = EXCLUDED.deep_ts,
             name = COALESCE(EXCLUDED.name, ob_last.name),
             boost_text = COALESCE(EXCLUDED.boost_text, ob_last.boost_text),
             floor = EXCLUDED.floor, last_sale = EXCLUDED.last_sale,
             supply = COALESCE(EXCLUDED.supply, ob_last.supply),
             best_offer = EXCLUDED.best_offer, best_listing = EXCLUDED.best_listing,
             spread = EXCLUDED.spread, spread_pct = EXCLUDED.spread_pct,
             offer_count = EXCLUDED.offer_count, listing_count = EXCLUDED.listing_count,
             offer_pressure = EXCLUDED.offer_pressure, listing_pressure = EXCLUDED.listing_pressure,
             avg_trade10 = EXCLUDED.avg_trade10, n_trades10 = EXCLUDED.n_trades10,
             offer_ladder = EXCLUDED.offer_ladder, listing_ladder = EXCLUDED.listing_ladder`,
          [item.collection, item.id, item.name || null, item.boost_text || null,
           detail.floor != null ? +detail.floor : null,
           detail.lastSalePrice != null ? +detail.lastSalePrice : null,
           detail.supply != null ? +detail.supply : null,
           m.bestOffer, m.bestListing, m.spread, m.spreadPct, m.offerCount, m.listingCount,
           m.offerPressure, m.listingPressure, m.avgTrade10, m.nTrades10,
           JSON.stringify(m.offerLadder), JSON.stringify(m.listingLadder)]
        );

        for (const sale of (detail.history && detail.history.sales) || []) {
          if (!sale.id) continue;
          const { isMine, side } = mySide(sale);
          const r = await c2.query(
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
        await c2.query("COMMIT");
        deep++;
      } catch (err) {
        await c2.query("ROLLBACK").catch(() => {});
        failed++;
        context.log.warn(`DB write ${item.collection}/${item.id}: ${err.message}`);
      }
      await sleep(DEEP_DELAY_MS);
    }
  } finally {
    c2.release();
  }

  context.log(`orderbook-snapshot done: ${shallow} shallow, ${deep} deep, ${trades} new trades, ${failed} failed`);
};
