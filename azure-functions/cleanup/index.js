const { getPool } = require("../shared/db");

module.exports = async function (context) {
  const pool = getPool();

  try {
    // Mark the first snapshot of each day as retained (for snapshots > 30 days old)
    const markResult = await pool.query(`
      UPDATE farm_snapshots SET is_retained = TRUE
      WHERE id IN (
        SELECT DISTINCT ON (farm_id, DATE(captured_at)) id
        FROM farm_snapshots
        WHERE captured_at < NOW() - INTERVAL '30 days' AND NOT is_retained
        ORDER BY farm_id, DATE(captured_at), captured_at ASC
      )
    `);
    context.log(`Marked ${markResult.rowCount} snapshots as retained`);

    // Delete non-retained snapshots older than 30 days
    const deleteResult = await pool.query(`
      DELETE FROM farm_snapshots
      WHERE captured_at < NOW() - INTERVAL '30 days' AND NOT is_retained
    `);
    context.log(`Deleted ${deleteResult.rowCount} old snapshots`);

    // Also prune very old price/nft changes (keep 1 year)
    const priceDelete = await pool.query(`
      DELETE FROM price_changes WHERE captured_at < NOW() - INTERVAL '365 days'
    `);
    context.log(`Deleted ${priceDelete.rowCount} old price records`);

    const nftDelete = await pool.query(`
      DELETE FROM nft_changes WHERE captured_at < NOW() - INTERVAL '365 days'
    `);
    context.log(`Deleted ${nftDelete.rowCount} old NFT records`);
  } catch (err) {
    context.log.error(`Cleanup error: ${err.message}`);
  }
};
