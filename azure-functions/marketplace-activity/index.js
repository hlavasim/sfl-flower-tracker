const { getPool } = require("../shared/db");
const { fetchMarketplaceActivity } = require("../shared/api");

module.exports = async function (context) {
  const pool = getPool();

  try {
    const data = await fetchMarketplaceActivity();
    const flowerPrice = data.flowerPrice || null;
    const reports = data.reports || {};

    const dates = Object.keys(reports);
    if (dates.length === 0) {
      context.log("No marketplace activity data returned");
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let totalItems = 0;

      for (const date of dates) {
        const report = reports[date];
        const totals = report.totals || {};
        const items = report.items || {};

        // Upsert marketplace_totals
        await client.query(
          `INSERT INTO marketplace_totals (date, total_volume, total_trades, flower_price)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (date) DO UPDATE SET
             total_volume = EXCLUDED.total_volume,
             total_trades = EXCLUDED.total_trades,
             flower_price = EXCLUDED.flower_price,
             captured_at = NOW()`,
          [date, totals.volume || 0, totals.trades || 0, flowerPrice]
        );

        // Parse and upsert items
        const entries = Object.entries(items);
        totalItems += entries.length;

        // Batch upsert in chunks of 100
        for (let i = 0; i < entries.length; i += 100) {
          const chunk = entries.slice(i, i + 100);
          const values = [];
          const params = [];
          let paramIdx = 1;

          for (const [key, val] of chunk) {
            // Key format: "collectibles-463" or "buds-933"
            const dashIdx = key.lastIndexOf("-");
            if (dashIdx === -1) continue;
            const collection = key.substring(0, dashIdx);
            const itemId = parseInt(key.substring(dashIdx + 1));
            if (isNaN(itemId)) continue;

            /*
             * The four snapshot fields are the market, not the day's trading: floor is the
             * cheapest active listing and best_offer the highest active bid, both point-in-time
             * (live on today's report, end-of-day on a past one) while low/high/volume/trades are
             * cumulative over the marketplace's whole history. Either side is omitted when that
             * side of the book is empty, so they are written as null rather than zero — a floor
             * of 0 would read as "free", not "nothing listed".
             */
            values.push(
              `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}, $${paramIdx + 11}, $${paramIdx + 12})`
            );
            params.push(
              date, collection, itemId,
              val.low || null, val.high || null, val.volume || 0,
              val.trades || 0, val.quantity || 0, val.latestSale || null,
              val.floor != null ? val.floor : null,
              val.bestOffer != null ? val.bestOffer : null,
              val.listingCount != null ? val.listingCount : null,
              val.offerCount != null ? val.offerCount : null
            );
            paramIdx += 13;
          }

          if (values.length > 0) {
            await client.query(
              `INSERT INTO marketplace_daily (date, collection, item_id, low, high, volume, trades, quantity, latest_sale, floor, best_offer, listing_count, offer_count)
               VALUES ${values.join(", ")}
               ON CONFLICT (date, collection, item_id) DO UPDATE SET
                 low = EXCLUDED.low,
                 high = EXCLUDED.high,
                 volume = EXCLUDED.volume,
                 trades = EXCLUDED.trades,
                 quantity = EXCLUDED.quantity,
                 latest_sale = EXCLUDED.latest_sale,
                 floor = EXCLUDED.floor,
                 best_offer = EXCLUDED.best_offer,
                 listing_count = EXCLUDED.listing_count,
                 offer_count = EXCLUDED.offer_count,
                 captured_at = NOW()`,
              params
            );
          }
        }
      }

      await client.query("COMMIT");
      context.log(`Recorded ${totalItems} items for ${dates.join(", ")}, flower_price=${flowerPrice}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    context.log.error(`Marketplace activity error: ${err.message}`);
  }
};
