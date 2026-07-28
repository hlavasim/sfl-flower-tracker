const { getPool } = require("../shared/db");
const { loadCookingEngine } = require("../shared/cooking-xp");
const { latestDump, dumpUrl, ingestStream } = require("../shared/cdn-ingest");
const { warmWorldAgg } = require("../shared/world-warm");

/*
 * Daily ingest of the community CDN's `active.jsonl.gz` — farms played in the last 90
 * days. This replaced the cursor crawl (world-crawl, now gated off): one ~740 MB
 * download covers 74k active farms with no rate limit and no unservable-record grinding,
 * and it carries lastActivity + isBlacklisted, which no public API endpoint returns.
 *
 * The dump is generated 22:00 UTC (2h before the game's daily reset), but this runs every
 * 15 minutes rather than once a day. The reason is the host's 10-minute function timeout:
 * a full ingest may not fit in one invocation, and with a daily trigger a partial run
 * would sit unfinished for 24 hours. Polling costs almost nothing — once the current
 * dump is fully ingested the function exits after a single state query — while a run cut
 * short resumes within 15 minutes at the record it reached.
 */

// Host functionTimeout is 10 min; leave room to finish the final batch and write state.
const BUDGET_MS = 8.5 * 60 * 1000;

async function loadState(pool) {
  const r = await pool.query("SELECT * FROM cdn_ingest_state WHERE id = 1");
  return r.rows[0];
}

module.exports = async function (context) {
  // Off until explicitly enabled, so it cannot start writing farm_world while the one-off
  // full `all.jsonl.gz` load is still running — both upsert the same rows, and two writers
  // would only slow each other down and confuse cdn_ingest_state.
  if (process.env.WORLD_CDN_ENABLED !== "true") {
    context.log("world-cdn disabled (set WORLD_CDN_ENABLED=true to start the daily ingest)");
    return;
  }
  const pool = getPool();
  const cooking = await loadCookingEngine();
  if (!cooking.ok) {
    context.log.error(`cooking engine unavailable (${cooking.error}) — did you run ` +
      `scripts/copy-core.mjs before publishing? Refusing to ingest rather than storing ` +
      `understated levels for every farm.`);
    return;
  }

  const kind = process.env.CDN_INGEST_KIND || "active";
  const dump = await latestDump(kind);
  const state = await loadState(pool);

  // Resume only within the same dump; a new day's file starts from the beginning.
  const resuming = state && state.dump_path === dump.path && !state.complete;
  const skip = resuming ? Number(state.records_done || 0) : 0;
  if (state && state.dump_path === dump.path && state.complete) {
    context.log(`${dump.path} already fully ingested (${state.records_done} records)`);
    // The ingest is done, so the World page's charts are stale for this generation. Warming
    // them here rather than leaving it to whoever loads the page first: the "all" scope
    // costs ~19 s per chart against 656k rows, and that should not land on a visitor.
    // Idempotent — it skips whatever is already cached, so the 15-minute poll finishes the
    // job across invocations if one run runs out of budget.
    await warmWorldAgg(pool, (m) => context.log(m));
    return;
  }
  context.log(`ingesting ${dump.path} (${(dump.size / 1e6).toFixed(0)} MB, generated ` +
    `${dump.modifiedAt})${skip ? `, resuming after record ${skip}` : ""}`);

  await pool.query(
    `INSERT INTO cdn_ingest_state (id, dump_path, dump_modified_at, started_at, records_done, complete)
     VALUES (1, $1, $2, NOW(), $3, FALSE)
     ON CONFLICT (id) DO UPDATE SET dump_path = EXCLUDED.dump_path,
       dump_modified_at = EXCLUDED.dump_modified_at,
       started_at = CASE WHEN cdn_ingest_state.dump_path = EXCLUDED.dump_path
                         THEN cdn_ingest_state.started_at ELSE NOW() END,
       complete = FALSE, last_error = NULL`,
    [dump.path, dump.modifiedAt, skip]
  );

  const res = await fetch(dumpUrl(dump.path));
  if (!res.ok) {
    const msg = `CDN download ${res.status} for ${dump.path}`;
    context.log.error(msg);
    await pool.query("UPDATE cdn_ingest_state SET last_error = $1 WHERE id = 1", [msg]);
    return;
  }

  let lastLog = 0;
  const out = await ingestStream(pool, {
    // Node's fetch gives a web ReadableStream; ingestStream wants a Node stream.
    source: require("stream").Readable.fromWeb(res.body),
    bankedFoodXp: cooking.bankedFoodXp,
    deadlineMs: BUDGET_MS,
    skip,
    onProgress: (p) => {
      if (p.elapsedMs - lastLog < 30000) return;
      lastLog = p.elapsedMs;
      context.log(`  ${p.records} read / ${p.ingested} written / ${p.unchanged} skipped ` +
        `(unplayed) / ${p.changed} changed (${Math.round(p.elapsedMs / 1000)}s)`);
    },
  });

  await pool.query(
    `UPDATE cdn_ingest_state SET records_done = $1, changed = COALESCE(changed,0) + $2,
       unchanged = COALESCE(unchanged,0) + $5,
       bad = $3, complete = $4, finished_at = CASE WHEN $4 THEN NOW() END, updated_at = NOW()
     WHERE id = 1`,
    [out.records, out.changed, out.bad, out.complete, out.unchanged]
  );

  context.log(`CDN ingest ${out.complete ? "COMPLETE" : "PARTIAL (will resume next run)"}: ` +
    `${out.records} read, ${out.ingested} written, ${out.unchanged} skipped as unplayed, ` +
    `${out.changed} changed, ${out.bad} unparseable`);
};
