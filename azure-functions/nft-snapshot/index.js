const { getPool } = require("../shared/db");
const { fetchNfts } = require("../shared/api");

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

    if (allNfts.length === 0) {
      context.log("No NFT data returned");
      return;
    }

    // Load last known values
    const lastResult = await pool.query("SELECT nft_id, field, value FROM last_known_nft_values");
    const lastValues = new Map();
    for (const r of lastResult.rows) {
      lastValues.set(`${r.nft_id}:${r.field}`, r.value);
    }

    const changes = [];
    for (const nft of allNfts) {
      const nftId = parseInt(nft.id);
      if (isNaN(nftId)) continue;

      for (const field of TRACKED_FIELDS) {
        const val = parseFloat(nft[field]);
        if (isNaN(val)) continue;

        const key = `${nftId}:${field}`;
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

      // Upsert last known values
      for (const c of changes) {
        await client.query(
          `INSERT INTO last_known_nft_values (nft_id, field, value, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (nft_id, field) DO UPDATE SET value = $3, updated_at = NOW()`,
          [c.nft_id, c.field, c.value]
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
