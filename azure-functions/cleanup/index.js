const { getPool } = require("../shared/db");
const { computeFarmDiff } = require("../shared/diff");

module.exports = async function (context) {
  const pool = getPool();

  try {
    /*
     * Downsample snapshots older than 30 days to exactly ONE per farm per day: the first of it.
     *
     * The cutoff is a day boundary, not "now minus 30 days". With the rolling cutoff this job
     * (03:00) cut every day in two: run N kept that day's 00:00 row and deleted 00:05–02:55, and
     * run N+1 — seeing the rest of the day with no retained row among the NOT is_retained
     * candidates — kept its 03:00 row as a SECOND daily snapshot. Aligning the cutoff to midnight
     * means a day is only processed once it lies wholly past the cutoff, and the NOT EXISTS
     * keeps a day that already has its retained row (including days cut in two before this
     * fix) from getting another one.
     */
    const CUTOFF = "date_trunc('day', NOW() - INTERVAL '30 days')";
    const markResult = await pool.query(`
      UPDATE farm_snapshots SET is_retained = TRUE
      WHERE id IN (
        SELECT DISTINCT ON (s.farm_id, DATE(s.captured_at)) s.id
        FROM farm_snapshots s
        WHERE s.captured_at < ${CUTOFF} AND NOT s.is_retained
          AND NOT EXISTS (
            SELECT 1 FROM farm_snapshots k
             WHERE k.farm_id = s.farm_id AND k.is_retained
               AND k.captured_at >= date_trunc('day', s.captured_at)
               AND k.captured_at <  date_trunc('day', s.captured_at) + INTERVAL '1 day')
        ORDER BY s.farm_id, DATE(s.captured_at), s.captured_at ASC
      )
      RETURNING id, farm_id, captured_at
    `);
    context.log(`Marked ${markResult.rowCount} snapshots as retained`);

    // Delete non-retained snapshots of the days processed above. Their 5-minute diffs are not
    // lost: the next retained row's diff is recomputed below from game_data as the full change
    // since the previous retained one.
    const deleteResult = await pool.query(`
      DELETE FROM farm_snapshots
      WHERE captured_at < ${CUTOFF} AND NOT is_retained
    `);
    context.log(`Deleted ${deleteResult.rowCount} old snapshots`);

    // Downsampling drops the intra-day 5-min rows, so each newly-retained daily
    // row's `diff` (originally a 5-min increment) would no longer represent its
    // day. Recompute it as the FULL change since the previous retained day, so
    // the diff column stays a consistent incremental series (5-min recent +
    // daily older) that still sums to total production. game_data is untouched.
    let recomputed = 0;
    for (const row of markResult.rows) {
      const cur = await pool.query("SELECT game_data FROM farm_snapshots WHERE id = $1", [row.id]);
      if (!cur.rows.length) continue;
      const prev = await pool.query(
        `SELECT game_data FROM farm_snapshots
         WHERE farm_id = $1 AND is_retained AND captured_at < $2
         ORDER BY captured_at DESC LIMIT 1`,
        [row.farm_id, row.captured_at]
      );
      if (!prev.rows.length) continue; // first retained day for this farm: no prior day to diff against
      const d = computeFarmDiff(prev.rows[0].game_data, cur.rows[0].game_data);
      await pool.query("UPDATE farm_snapshots SET diff = $1 WHERE id = $2",
        [d ? JSON.stringify(d) : null, row.id]);
      recomputed++;
    }
    if (recomputed) context.log(`Recomputed ${recomputed} daily diffs`);

    // price_changes + nft_changes: KEPT FOREVER — these are the price/NFT diffs
    // (compact numeric rows), retention removed 2026-07-20 per "diffs never delete".

    // marketplace_trades: KEPT FOREVER (real trade history, feeds the orderbook
    // analytics + is_mine ledger — retention removed 2026-07-20 per "never delete").
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
    // ob_snap + ob_last: KEPT FOREVER — orderbook price-movement history must never
    // be pruned (gaps can't be backfilled). Boosted-only keeps growth modest
    // (~200 rows/hour ≈ 1.7M rows/year, a few hundred MB).
  } catch (err) {
    context.log.error(`Cleanup error: ${err.message}`);
  }
};
