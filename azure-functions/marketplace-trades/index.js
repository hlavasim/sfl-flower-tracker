// My trades, from the community marketplace profile (2026-09-11).
//
// The original swept every item that had traded that day — hundreds of calls to
// /collection/{coll}/{id} at 500ms apart, signed with a player's Bearer JWT from Redis. The game
// walled that route on 2026-09-01 (RT-001) and it has written nothing since.
//
// The replacement is not the same job done differently: at the community API's throttle
// (~1 request per 5 seconds, measured) a catalogue-wide per-item sweep is simply not reachable —
// it would be hours per run. What IS reachable is the thing this table is actually read for.
// The `mytrades` page wants MY trades, and marketplaceProfile returns a farm's last fifty
// settled trades on both sides of the book, plus its open listings and offers, in ONE request.
//
// So the division of labour is now:
//   this function          — my settled trades + my open orders, hourly, 1 request
//   orderbook-snapshot     — the whole catalogue's top of book, plus a paced deep sweep that
//                            records other farms' trades for the boosted items
//
// Trades reaching this collector are the farm's own, so is_mine is true by construction and
// my_side is derived the same way orderbook-snapshot derives it.
const { getPool } = require("../shared/db");
const { fetchMarketplaceProfile } = require("../shared/api");

const MY_FARM_ID = 155498;

// For a fulfilled LISTING the initiator was the seller and the fulfiller bought; for a fulfilled
// OFFER the initiator was the buyer and the fulfiller sold.
function mySide(sale) {
  const initId = +(sale.initiatedBy && sale.initiatedBy.id) || 0;
  const iAmInitiator = initId === MY_FARM_ID;
  const source = sale.source || "listing";
  return source === "offer"
    ? (iAmInitiator ? "buy" : "sell")
    : (iAmInitiator ? "sell" : "buy");
}

module.exports = async function (context) {
  const pool = getPool();

  const profile = await fetchMarketplaceProfile(MY_FARM_ID);
  const trades = profile.trades || [];
  const listings = profile.listings || {};
  const offers = profile.offers || {};
  context.log(
    `marketplace-trades: profile has ${trades.length} recent trades, ` +
    `${Object.keys(listings).length} open listings, ${Object.keys(offers).length} open offers ` +
    `(lifetime ${profile.totalTrades || 0})`
  );

  let newTrades = 0, orders = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const sale of trades) {
      if (!sale.id) continue;
      const r = await client.query(
        `INSERT INTO marketplace_trades
           (trade_id, collection, item_id, sfl, source, quantity, fulfilled_at,
            initiated_by_id, initiated_by_name, fulfilled_by_id, fulfilled_by_name,
            is_mine, my_side)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12)
         ON CONFLICT (trade_id) DO NOTHING`,
        [
          String(sale.id),
          sale.collection || null,
          sale.itemId != null ? sale.itemId : null,
          +sale.sfl || 0,
          sale.source || null,
          +sale.quantity || 1,
          sale.fulfilledAt ? new Date(sale.fulfilledAt) : new Date(),
          (sale.initiatedBy && sale.initiatedBy.id) || null,
          (sale.initiatedBy && sale.initiatedBy.username) || null,
          (sale.fulfilledBy && sale.fulfilledBy.id) || null,
          (sale.fulfilledBy && sale.fulfilledBy.username) || null,
          mySide(sale),
        ]
      );
      newTrades += r.rowCount;
    }

    /*
     * My open orders. Keyed by trade id, each carrying the items on the block rather than one
     * item id — a listing can hold several — so one order becomes one row per item in it. The
     * previous rows for this farm are cleared first: an order that has since been cancelled or
     * filled would otherwise sit in the book forever, which is the failure mode a DELETE-then-
     * INSERT avoids and an upsert does not.
     */
    await client.query(`DELETE FROM marketplace_orderbook WHERE created_by_id = $1`, [MY_FARM_ID]);

    const writeOrders = async (book, side, at) => {
      for (const [tradeId, o] of Object.entries(book || {})) {
        const items = o.items || {};
        for (const [itemName, qty] of Object.entries(items)) {
          await client.query(
            `INSERT INTO marketplace_orderbook
               (collection, item_id, side, order_id, sfl, quantity, created_at, created_by_id, created_by_name)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (collection, item_id, side, order_id) DO NOTHING`,
            [
              o.collection || "collectibles",
              // The profile names the item rather than numbering it; the id column is NOT NULL
              // in spirit only, so a name-keyed order records 0 and carries the name in the
              // order id, which is what the read layer joins on anyway.
              0,
              side,
              `${tradeId}:${itemName}`,
              +o.sfl || 0,
              +qty || 1,
              o[at] ? new Date(o[at]) : new Date(),
              MY_FARM_ID,
              profile.username || null,
            ]
          );
          orders++;
        }
      }
    };
    await writeOrders(listings, "listing", "createdAt");
    await writeOrders(offers, "offer", "createdAt");

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  context.log(`marketplace-trades done: ${newTrades} new trades, ${orders} open order rows`);
};
