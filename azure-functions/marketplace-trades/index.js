const { getPool } = require("../shared/db");
const { fetchMarketplaceActivity, fetchCollectionItem } = require("../shared/api");

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const REDIS_TOKEN_KEY = "game_token:155498";

async function getGameToken() {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = async function (context) {
  const pool = getPool();

  try {
    // Get game token from Redis
    const token = await getGameToken();
    if (!token) {
      context.log.warn("No game token available in Redis — skipping marketplace-trades");
      return;
    }

    // Verify token not expired (basic JWT decode)
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        context.log.warn("Game token expired — skipping marketplace-trades");
        return;
      }
    } catch {
      context.log.warn("Cannot decode game token — proceeding anyway");
    }

    // Fetch marketplace activity to find traded items
    const activity = await fetchMarketplaceActivity();
    const reports = activity.reports || {};
    const today = new Date().toISOString().split("T")[0];
    const report = reports[today] || {};
    const items = report.items || {};

    // Find items with trades today, sorted by volume DESC
    const tradedItems = [];
    for (const [key, val] of Object.entries(items)) {
      if ((val.trades || 0) === 0) continue;
      const dashIdx = key.lastIndexOf("-");
      if (dashIdx === -1) continue;
      const collection = key.substring(0, dashIdx);
      const itemId = parseInt(key.substring(dashIdx + 1));
      if (isNaN(itemId)) continue;
      tradedItems.push({ collection, itemId, volume: val.volume || 0 });
    }
    tradedItems.sort((a, b) => b.volume - a.volume);

    if (tradedItems.length === 0) {
      context.log("No items with trades today");
      return;
    }

    context.log(`Found ${tradedItems.length} items with trades today`);

    let newTrades = 0;
    let totalListings = 0;
    let totalOffers = 0;
    let processed = 0;
    let delay = 500;

    const client = await pool.connect();
    try {
      for (const { collection, itemId } of tradedItems) {
        try {
          const detail = await fetchCollectionItem(collection, itemId, token);

          await client.query("BEGIN");

          // Insert trades (dedup by trade_id)
          const sales = (detail.history && detail.history.sales) || [];
          for (const sale of sales) {
            if (!sale.id) continue;
            try {
              await client.query(
                `INSERT INTO marketplace_trades
                   (trade_id, collection, item_id, sfl, source, quantity, fulfilled_at,
                    initiated_by_id, initiated_by_name, fulfilled_by_id, fulfilled_by_name)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 ON CONFLICT (trade_id) DO NOTHING`,
                [
                  String(sale.id),
                  sale.collection || collection,
                  sale.itemId || itemId,
                  sale.sfl || 0,
                  sale.source || null,
                  sale.quantity || 1,
                  sale.fulfilledAt ? new Date(sale.fulfilledAt) : new Date(),
                  sale.initiatedBy?.id || null,
                  sale.initiatedBy?.username || null,
                  sale.fulfilledBy?.id || null,
                  sale.fulfilledBy?.username || null,
                ]
              );
              newTrades++;
            } catch (err) {
              if (!err.message.includes("duplicate")) {
                context.log.warn(`Trade insert error: ${err.message}`);
              }
            }
          }

          // Refresh orderbook for this item (delete old + insert new)
          await client.query(
            `DELETE FROM marketplace_orderbook WHERE collection = $1 AND item_id = $2`,
            [collection, itemId]
          );

          // Insert listings
          const listings = detail.listings || [];
          for (const listing of listings) {
            if (!listing.id) continue;
            await client.query(
              `INSERT INTO marketplace_orderbook
                 (collection, item_id, side, order_id, sfl, quantity, created_at, created_by_id, created_by_name)
               VALUES ($1, $2, 'listing', $3, $4, $5, $6, $7, $8)
               ON CONFLICT (collection, item_id, side, order_id) DO NOTHING`,
              [
                collection, itemId,
                String(listing.id),
                listing.sfl || 0,
                listing.quantity || 1,
                listing.listedAt ? new Date(listing.listedAt) : new Date(),
                listing.listedBy?.id || null,
                listing.listedBy?.username || null,
              ]
            );
            totalListings++;
          }

          // Insert offers
          const offers = detail.offers || [];
          for (const offer of offers) {
            const offerId = offer.tradeId || offer.id;
            if (!offerId) continue;
            await client.query(
              `INSERT INTO marketplace_orderbook
                 (collection, item_id, side, order_id, sfl, quantity, created_at, created_by_id, created_by_name)
               VALUES ($1, $2, 'offer', $3, $4, $5, $6, $7, $8)
               ON CONFLICT (collection, item_id, side, order_id) DO NOTHING`,
              [
                collection, itemId,
                String(offerId),
                offer.sfl || 0,
                offer.quantity || 1,
                offer.offeredAt ? new Date(offer.offeredAt) : new Date(),
                offer.offeredBy?.id || null,
                offer.offeredBy?.username || null,
              ]
            );
            totalOffers++;
          }

          await client.query("COMMIT");
          processed++;
        } catch (err) {
          try { await client.query("ROLLBACK"); } catch {}

          if (err.status === 429) {
            context.log.warn(`Rate limited at item ${processed}, increasing delay`);
            delay = 2000;
            await sleep(5000);
            continue;
          }
          context.log.warn(`Error processing ${collection}-${itemId}: ${err.message}`);
        }

        await sleep(delay);
      }
    } finally {
      client.release();
    }

    context.log(
      `Processed ${processed}/${tradedItems.length} items, ` +
      `${newTrades} new trades, ${totalListings} listings, ${totalOffers} offers`
    );
  } catch (err) {
    context.log.error(`Marketplace trades error: ${err.message}`);
  }
};
