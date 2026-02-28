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

            values.push(
              `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8})`
            );
            params.push(
              date, collection, itemId,
              val.low || null, val.high || null, val.volume || 0,
              val.trades || 0, val.quantity || 0, val.latestSale || null
            );
            paramIdx += 9;
          }

          if (values.length > 0) {
            await client.query(
              `INSERT INTO marketplace_daily (date, collection, item_id, low, high, volume, trades, quantity, latest_sale)
               VALUES ${values.join(", ")}
               ON CONFLICT (date, collection, item_id) DO UPDATE SET
                 low = EXCLUDED.low,
                 high = EXCLUDED.high,
                 volume = EXCLUDED.volume,
                 trades = EXCLUDED.trades,
                 quantity = EXCLUDED.quantity,
                 latest_sale = EXCLUDED.latest_sale,
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
