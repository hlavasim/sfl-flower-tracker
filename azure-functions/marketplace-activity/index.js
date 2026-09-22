const { getPool } = require("../shared/db");
const { fetchMarketplaceActivity } = require("../shared/api");
const { parseItemKey } = require("../shared/market-key");
const { presentColumns } = require("../shared/schema-check");

// Columns added by migrations/2026-09-11-marketplace-community-api.sql. Written only when the
// database has them: without the migration the old statement failed on every run, rolled back
// the whole transaction (marketplace_totals included) and both tables silently stopped growing.
const SNAPSHOT_COLS = ["floor", "best_offer", "listing_count", "offer_count"];
const BASE_COLS = ["date", "collection", "item_id", "low", "high", "volume", "trades", "quantity", "latest_sale"];

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

    let have;
    try {
      have = await presentColumns(pool, "marketplace_daily", SNAPSHOT_COLS);
    } catch (err) {
      have = new Set();
      context.log.error(`marketplace_daily column check failed (${err.message}) — writing trade stats only`);
    }
    const snapCols = SNAPSHOT_COLS.filter((c) => have.has(c));
    if (snapCols.length < SNAPSHOT_COLS.length) {
      context.log.error(
        `MIGRATION MISSING: marketplace_daily lacks ${SNAPSHOT_COLS.filter((c) => !have.has(c)).join(", ")} — ` +
        `apply azure-functions/migrations/2026-09-11-marketplace-community-api.sql. ` +
        `Writing trade stats only until then; the book snapshot is dropped.`
      );
    }
    const cols = BASE_COLS.concat(snapCols);
    const updates = cols.slice(3).map((c) => `${c} = EXCLUDED.${c}`).concat("captured_at = NOW()").join(",\n                 ");

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

          for (const [key, val] of chunk) {
            // "collectibles-463", "buds-933", "economies-{slug}-{id}" — see shared/market-key.js
            const parsed = parseItemKey(key);
            if (!parsed) continue;

            /*
             * The four snapshot fields are the market, not the day's trading: floor is the
             * cheapest active listing and best_offer the highest active bid, both point-in-time
             * (live on today's report, end-of-day on a past one) while low/high/volume/trades are
             * cumulative over the marketplace's whole history. Either side is omitted when that
             * side of the book is empty, so they are written as null rather than zero — a floor
             * of 0 would read as "free", not "nothing listed".
             */
            const row = {
              date, collection: parsed.collection, item_id: parsed.id,
              low: val.low || null, high: val.high || null, volume: val.volume || 0,
              trades: val.trades || 0, quantity: val.quantity || 0, latest_sale: val.latestSale || null,
              floor: val.floor != null ? val.floor : null,
              best_offer: val.bestOffer != null ? val.bestOffer : null,
              listing_count: val.listingCount != null ? val.listingCount : null,
              offer_count: val.offerCount != null ? val.offerCount : null,
            };
            const base = params.length;
            values.push(`(${cols.map((_, j) => `$${base + j + 1}`).join(", ")})`);
            for (const c of cols) params.push(row[c]);
          }

          if (values.length > 0) {
            await client.query(
              `INSERT INTO marketplace_daily (${cols.join(", ")})
               VALUES ${values.join(", ")}
               ON CONFLICT (date, collection, item_id) DO UPDATE SET
                 ${updates}`,
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
