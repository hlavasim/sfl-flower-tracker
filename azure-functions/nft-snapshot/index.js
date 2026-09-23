const { getPool } = require("../shared/db");
const { fetchNfts } = require("../shared/api");
const { presentColumns } = require("../shared/schema-check");

const TRACKED_FIELDS = ["floor", "lastSalePrice", "supply"];

module.exports = async function (context) {
  const pool = getPool();

  try {
    const nftData = await fetchNfts();
    const allNfts = [];

    // Normalize collectibles and wearables into a flat list
    for (const collection of ["collectibles", "wearables"]) {
      const items = nftData[collection];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        allNfts.push({ ...item, collection });
      }
    }

    /*
     * Buds and pets are not in the sfl.world feed, so their floor / last sale come from the
     * catalogue-wide marketplaceActivity snapshot that marketplace-activity writes hourly into
     * marketplace_daily (one row per item per day; today's row carries the live book).
     *
     * They used to be derived from marketplace_orderbook + marketplace_trades. Since 2026-09-11
     * marketplace_orderbook holds only the OWNER's open orders, all with item_id 0 (the profile
     * feed names items instead of numbering them), and marketplace_trades only the owner's
     * trades — so that derivation recorded the owner's own asking price as the floor of "bud #0"
     * and "pet #0". Supply is no longer tracked for them: the old figure was a count of listing
     * orders, not a supply, and nothing public reports one per bud/pet.
     */
    let hasFloor = false;
    try {
      hasFloor = (await presentColumns(pool, "marketplace_daily", ["floor"])).has("floor");
    } catch (err) {
      context.log.warn(`marketplace_daily column check failed: ${err.message}`);
    }
    if (!hasFloor) {
      context.log.error("MIGRATION MISSING: marketplace_daily.floor — apply azure-functions/migrations/" +
        "2026-09-11-marketplace-community-api.sql. Bud/pet floors are skipped until then (last sale still recorded).");
    }
    for (const collection of ["buds", "pets"]) {
      try {
        // Only a report from today or yesterday: an older one means marketplace-activity has
        // stopped, and re-recording its frozen values would only hide that.
        const r = await pool.query(
          `SELECT item_id, ${hasFloor ? "floor" : "NULL::double precision AS floor"}, latest_sale
             FROM marketplace_daily
            WHERE collection = $1
              AND date = (SELECT MAX(date) FROM marketplace_daily WHERE collection = $1)
              AND date >= CURRENT_DATE - 1`,
          [collection]
        );
        let n = 0;
        for (const row of r.rows) {
          const item = { id: row.item_id, collection };
          if (row.floor != null && +row.floor > 0) item.floor = parseFloat(row.floor);
          if (row.latest_sale != null && +row.latest_sale > 0) item.lastSalePrice = parseFloat(row.latest_sale);
          if (item.floor === undefined && item.lastSalePrice === undefined) continue;
          allNfts.push(item);
          n++;
        }
        context.log(`Derived ${n} ${collection} prices from marketplace_daily`);
      } catch (err) {
        context.log.warn(`Failed to derive ${collection} prices: ${err.message}`);
      }
    }

    if (allNfts.length === 0) {
      context.log("No NFT data returned");
      return;
    }

    // Load last known values (keyed by nft_id:collection:field)
    const lastResult = await pool.query("SELECT nft_id, collection, field, value FROM last_known_nft_values");
    const lastValues = new Map();
    for (const r of lastResult.rows) {
      lastValues.set(`${r.nft_id}:${r.collection}:${r.field}`, r.value);
    }

    const changes = [];
    for (const nft of allNfts) {
      const nftId = parseInt(nft.id);
      if (isNaN(nftId)) continue;

      for (const field of TRACKED_FIELDS) {
        const val = parseFloat(nft[field]);
        if (isNaN(val)) continue;

        const key = `${nftId}:${nft.collection}:${field}`;
        const lastVal = lastValues.get(key);

        if (lastVal !== undefined && Math.abs(val - lastVal) < 1e-10) {
          continue; // No change
        }

        changes.push({
          nft_id: nftId,
          nft_name: nft.name || null,
          collection: nft.collection,
          field,
          value: val,
          previous_value: lastVal !== undefined ? lastVal : null,
        });
      }
    }

    if (changes.length === 0) {
      context.log("No NFT changes detected");
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Batch insert changes
      for (const c of changes) {
        await client.query(
          `INSERT INTO nft_changes (nft_id, nft_name, collection, field, value, previous_value)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [c.nft_id, c.nft_name, c.collection, c.field, c.value, c.previous_value]
        );
      }

      // Upsert last known values (keyed by nft_id + collection + field)
      for (const c of changes) {
        await client.query(
          `INSERT INTO last_known_nft_values (nft_id, collection, field, value, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (nft_id, collection, field) DO UPDATE SET value = $4, updated_at = NOW()`,
          [c.nft_id, c.collection, c.field, c.value]
        );
      }

      await client.query("COMMIT");
      context.log(`Recorded ${changes.length} NFT field changes across ${allNfts.length} items`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    context.log.error(`NFT snapshot error: ${err.message}`);
  }
};
