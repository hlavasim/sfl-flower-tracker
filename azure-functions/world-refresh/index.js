const { getPool } = require("../shared/db");
const { fetchFarmsByIds, GET_FARMS_MAX_IDS } = require("../shared/api");
const { extractFarm } = require("../shared/world-extract");
const { loadCookingEngine } = require("../shared/cooking-xp");
const { persistFarmRows } = require("../shared/world-persist");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Re-refresh farms we already know about, using POST /community/getFarms.
 *
 * Why this exists alongside world-crawl: the cursor sweep has to walk the id space in
 * order, and in the legacy range ~36% of ids are unservable, which forces the page
 * window down to 1-3 and drags throughput to ~100 farms/hour. getFarms takes an
 * explicit list of 100 ids, so once crawl_bad_ids is populated the bad ones are simply
 * left out of the request and a batch is a flat 100 farms — measured ~225x faster
 * through that range.
 *
 * What it does NOT do: discover farms. It only refreshes ids already in farm_world, so
 * it cannot replace world-crawl, which is what carries the coverage guarantee. There is
 * no cursor to persist here — ordering by last_seen_at ASC makes the rotation
 * self-organising, because refreshing a batch pushes it to the back of the queue.
 *
 * getFarms reports itself as deprecated. Every failure path therefore degrades to
 * "stop and let world-crawl carry on" rather than breaking anything.
 */

const GAP_MS = 16000;                 // same rate limit as the cursor endpoint
// 100 ids is the upstream cap, but the response still has to fit the ~6 MB payload
// limit: a measured batch of 100 legacy veteran farms came back at 5.43 MB, so a batch
// of larger farms would 500 on size alone. Size the batch from the bytes/farm actually
// observed so that costs a smaller request rather than a failed one plus a bisect.
const TARGET_BYTES = 4.5e6;
const MIN_BATCH = 10;

// Only re-refresh farms that still look alive, so the cycle shortens as dead farms fall
// out of the window instead of the loop dragging all 656k around forever.
//
// The signal is our own observation, not a game field: the batch payloads carry no
// last-played time (the wrapper `updatedAt` that does is single-farm only, and
// `bumpkin.updatedAt` means "bumpkin last modified" — it reads 2023 on a farm played
// daily). So COALESCE(last_changed_at, first_seen_at) is used: the last time we had any
// evidence the farm was alive. A freshly discovered farm is always included, because
// first_seen_at is recent and we do not yet know either way — the filter only drops
// farms we have positively watched sit still for the whole window.
//
// A farm that comes back after the window is missed here by design; the full cursor
// sweep re-visits everything, notices the change, and it re-enters this pool.
const ACTIVE_DAYS = Number(process.env.WORLD_REFRESH_ACTIVE_DAYS || 30);
const BUDGET_MS = 4 * 60 * 1000;      // timer is every 15 min, host allows 10
const MAX_BACKOFF_MS = 120000;

async function recordBadId(pool, farmId) {
  await pool.query(
    `INSERT INTO crawl_bad_ids (farm_id, last_checked) VALUES ($1, NOW())
     ON CONFLICT (farm_id) DO UPDATE SET attempts = crawl_bad_ids.attempts + 1,
       last_checked = NOW(), recovered_at = NULL`,
    [farmId]
  );
}

/**
 * A 500 means the whole batch was lost, and the cause is one (or more) unservable id
 * inside it. Bisect to isolate them so the good ids in the batch are still saved and
 * the bad ones get recorded and skipped from here on.
 * @returns {Promise<{farms: object, badIds: number[], requests: number}>}
 */
async function bisect(ids, apiKey, context, requestBudget) {
  const farms = {};
  const badIds = [];
  let requests = 0;
  const queue = [ids];

  while (queue.length && requests < requestBudget) {
    const chunk = queue.shift();
    if (!chunk.length) continue;
    await sleep(GAP_MS);
    requests++;
    try {
      const res = await fetchFarmsByIds(chunk, apiKey);
      Object.assign(farms, res.farms);
    } catch (err) {
      if (err.status === 429) { queue.unshift(chunk); await sleep(30000); continue; }
      if (chunk.length === 1) {
        badIds.push(chunk[0]);
        context.log(`  unservable id ${chunk[0]} — recorded`);
        continue;
      }
      const mid = Math.floor(chunk.length / 2);
      queue.push(chunk.slice(0, mid), chunk.slice(mid));
    }
  }
  return { farms, badIds, requests };
}

module.exports = async function (context) {
  if (process.env.WORLD_REFRESH_ENABLED !== "true") {
    context.log("world-refresh disabled (set WORLD_REFRESH_ENABLED=true to enable)");
    return;
  }
  const pool = getPool();
  const apiKey = process.env.WORLD_CRAWL_KEY || process.env.SFL_API_KEY;
  const t0 = Date.now();

  const cooking = await loadCookingEngine();
  if (!cooking.ok) {
    context.log.error(`cooking engine unavailable (${cooking.error}) — did you run ` +
      `scripts/copy-core.mjs before publishing? Refusing to refresh.`);
    return;
  }

  // Claim the rate-limit window so world-crawl stands down instead of racing us for
  // 429s. Slightly longer than our own budget so the claim cannot expire mid-batch.
  await pool.query(
    "UPDATE crawl_state SET refresh_until = NOW() + INTERVAL '5 minutes' WHERE id = 1");

  let batches = 0, refreshed = 0, changes = 0, newBad = 0, rateLimited = 0;
  let backoff = 30000;
  let deprecationSeen = false;
  let bytesPerFarm = 0;   // learned from the first response

  while (Date.now() - t0 < BUDGET_MS) {
    // Oldest-seen known ids that are not already known-unservable. Excluding the bad
    // ones here is the whole trick: a batch of 100 then reliably returns 100 farms.
    const batchSize = bytesPerFarm > 0
      ? Math.min(GET_FARMS_MAX_IDS, Math.max(MIN_BATCH, Math.floor(TARGET_BYTES / bytesPerFarm)))
      : GET_FARMS_MAX_IDS;
    const { rows } = await pool.query(
      `SELECT f.farm_id FROM farm_world f
         LEFT JOIN crawl_bad_ids b ON b.farm_id = f.farm_id AND b.recovered_at IS NULL
        WHERE b.farm_id IS NULL
          AND COALESCE(f.last_changed_at, f.first_seen_at) > NOW() - ($2 || ' days')::interval
        ORDER BY f.last_seen_at ASC
        LIMIT $1`,
      [batchSize, ACTIVE_DAYS]
    );
    if (!rows.length) {
      context.log(`nothing to refresh — no known farm has shown activity within ${ACTIVE_DAYS} days`);
      break;
    }
    const ids = rows.map((r) => Number(r.farm_id));

    let farms = null;
    try {
      const res = await fetchFarmsByIds(ids, apiKey);
      farms = res.farms;
      if (res.deprecated) deprecationSeen = true;
      const n = Object.keys(res.farms).length;
      if (n > 0) bytesPerFarm = res.__bytes / n;
      backoff = 30000;
    } catch (err) {
      if (err.status === 429) {
        rateLimited++;
        context.log(`rate limited — backing off ${backoff / 1000}s`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        continue;
      }
      if (err.status >= 500) {
        // One or more ids in this batch are unservable. Bisect so the rest still land.
        context.log(`batch of ${ids.length} returned ${err.status} — bisecting`);
        const remaining = Math.max(2, Math.floor((BUDGET_MS - (Date.now() - t0)) / GAP_MS));
        const b = await bisect(ids, apiKey, context, remaining);
        for (const bad of b.badIds) { await recordBadId(pool, bad); newBad++; }
        farms = b.farms;
      } else {
        context.log.error(`getFarms failed: ${err.message} — leaving the rest to world-crawl`);
        break;
      }
    }

    const entries = Object.entries(farms || {});
    if (entries.length) {
      const rowsOut = entries.map(([id, farm]) =>
        extractFarm({ id: Number(id), nftId: farm?.nftId ?? null, farm }, cooking.bankedFoodXp));
      changes += await persistFarmRows(pool, rowsOut, null);
      refreshed += rowsOut.length;
    }
    batches++;
    await sleep(GAP_MS);
  }

  if (deprecationSeen) {
    context.log("note: getFarms reports itself deprecated — world-crawl remains the fallback");
  }
  // Release immediately rather than letting the claim time out, so world-crawl can
  // resume on its very next tick.
  await pool.query("UPDATE crawl_state SET refresh_until = NULL WHERE id = 1");

  context.log(`Refresh tick (active window ${ACTIVE_DAYS}d): ${batches} batches, ${refreshed} farms refreshed, ` +
    `${changes} changed, ${newBad} new unservable ids, ${rateLimited} rate-limited` +
    ` | ${Math.round(bytesPerFarm / 1024)}KB/farm`);
};
