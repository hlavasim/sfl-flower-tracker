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

    // Prune marketplace_trades older than 1 year
    const mktTradesDelete = await pool.query(`
      DELETE FROM marketplace_trades WHERE fulfilled_at < NOW() - INTERVAL '365 days'
    `);
    context.log(`Deleted ${mktTradesDelete.rowCount} old marketplace trade records`);

    // marketplace_orderbook: only latest snapshot kept (overwritten each run, no cleanup needed)
    // marketplace_daily + marketplace_totals: keep forever (small data)

    // Marks snapshots: keep full 28 days, then 1 per day per player
    try {
      const marksRetain = await pool.query(`
        WITH keepers AS (
          SELECT DISTINCT ON (farm_id, week_start, DATE(captured_at)) id
          FROM marks_snapshots
          WHERE captured_at < NOW() - INTERVAL '28 days'
          ORDER BY farm_id, week_start, DATE(captured_at), captured_at ASC
        )
        DELETE FROM marks_snapshots
        WHERE captured_at < NOW() - INTERVAL '28 days'
          AND id NOT IN (SELECT id FROM keepers)
      `);
      context.log(`Marks cleanup: ${marksRetain.rowCount} rows deleted`);
    } catch (e) {
      context.log.error(`Marks cleanup error: ${e.message}`);
    }
  } catch (err) {
    context.log.error(`Cleanup error: ${err.message}`);
  }
};
