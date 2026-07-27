const { getPool } = require("../shared/db");
const { fetchFarmsBatch, encodeCursor, decodeCursor } = require("../shared/api");
const { extractFarm, diffFarm, SCALARS } = require("../shared/world-extract");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The upstream documents a 15s interval between batch calls; 16s keeps a margin
// against the shared API key also being used by farm-snapshot and the dashboard.
const GAP_MS = 16000;
// Timer fires every 5 min and the host allows 10; stop at 4.5 min so an invocation
// always finishes cleanly rather than being killed mid-write.
const BUDGET_MS = 4.5 * 60 * 1000;

// Page size is bounded by the upstream response cap (~6 MB), not by the documented
// max of 500. Farm size varies hugely by id range — measured 2026-07-27: ~70 KB/farm
// around id 20k (limit=80 always 500s) but ~21 KB/farm around id 200k (limit=80 fine).
// So the window is sized predictively from the bytes/farm seen so far, targeting well
// under the cap, rather than rediscovering the limit with a 500 in every new range.
const WIN_MAX = 80;
const WIN_MIN = 1;
const TARGET_BYTES = 3.5e6;
const DEFAULT_FARM_BYTES = 45000;
const EWMA_ALPHA = 0.3;
const MAX_BACKOFF_MS = 120000;

/** Window that should keep the next response near TARGET_BYTES. */
function sizeWindow(avgBytes) {
  const n = Math.floor(TARGET_BYTES / Math.max(avgBytes || DEFAULT_FARM_BYTES, 1000));
  return Math.min(WIN_MAX, Math.max(WIN_MIN, n));
}

async function loadState(pool) {
  const r = await pool.query("SELECT * FROM crawl_state WHERE id = 1");
  return r.rows[0];
}

async function saveState(pool, s) {
  await pool.query(
    `UPDATE crawl_state SET cursor=$1, last_id=$2, window_size=$3, sweep=$4,
       sweep_started_at=$5, farms_this_sweep=$6, req_ok=$7, req_429=$8, req_5xx=$9,
       skipped=$10, stuck_count=$11, avg_farm_bytes=$12, last_error=$13, updated_at=NOW()
     WHERE id = 1`,
    [s.cursor, s.last_id, s.window_size, s.sweep, s.sweep_started_at, s.farms_this_sweep,
     s.req_ok, s.req_429, s.req_5xx, s.skipped, s.stuck_count, s.avg_farm_bytes, s.last_error]
  );
}

// Types are spelled out because parameters in an untyped VALUES list arrive as text.
const COL_TYPES = {
  farm_id: "bigint", nft_id: "bigint", username: "text", created_at: "timestamptz",
  island_type: "text", island_biome: "text", ascension_level: "integer",
  expansions: "integer", island_upgraded_at: "timestamptz", xp: "double precision",
  balance: "double precision", coins: "double precision", gems: "double precision",
  ban_status: "text", verified: "boolean", vip_until: "timestamptz", inventory: "jsonb",
};
const COLS = Object.keys(COL_TYPES);
const CAST_LIST = COLS.map((c) => `${c}::${COL_TYPES[c]}`).join(",");

/** Upsert a page of farms and append a change-log row for each one that moved. */
async function persistPage(pool, rows, sweep) {
  const ids = rows.map((r) => r.farm_id);
  // Deliberately excludes `inventory` — pulling 40 × ~70 KB of JSONB per page just to
  // diff scalars would dominate the crawler's DB traffic.
  const prevRes = await pool.query(
    `SELECT farm_id, ${SCALARS.join(", ")} FROM farm_world WHERE farm_id = ANY($1::bigint[])`,
    [ids]
  );
  const prev = new Map(prevRes.rows.map((r) => [String(r.farm_id), r]));

  const changed = [];
  for (const row of rows) {
    const d = diffFarm(prev.get(String(row.farm_id)), row);
    if (d) changed.push({ farm_id: row.farm_id, diff: d });
  }
  const changedIds = new Set(changed.map((c) => String(c.farm_id)));

  const params = [];
  const tuples = rows.map((row) => {
    const base = params.length;
    for (const c of COLS) params.push(c === "inventory" ? JSON.stringify(row[c] || {}) : row[c]);
    params.push(changedIds.has(String(row.farm_id)));
    params.push(sweep);
    return `(${COLS.map((_, i) => `$${base + i + 1}`).join(",")},$${base + COLS.length + 1},$${base + COLS.length + 2})`;
  });

  await pool.query(
    `INSERT INTO farm_world (${COLS.join(",")}, last_changed_at, sweep)
     SELECT ${CAST_LIST}, CASE WHEN chg::boolean THEN NOW() END, sweep::integer FROM (
       VALUES ${tuples.join(",")}
     ) AS v(${COLS.join(",")}, chg, sweep)
     ON CONFLICT (farm_id) DO UPDATE SET
       nft_id=EXCLUDED.nft_id, username=EXCLUDED.username, created_at=EXCLUDED.created_at,
       island_type=EXCLUDED.island_type, island_biome=EXCLUDED.island_biome,
       ascension_level=EXCLUDED.ascension_level, expansions=EXCLUDED.expansions,
       island_upgraded_at=EXCLUDED.island_upgraded_at, xp=EXCLUDED.xp,
       balance=EXCLUDED.balance, coins=EXCLUDED.coins, gems=EXCLUDED.gems,
       ban_status=EXCLUDED.ban_status, verified=EXCLUDED.verified,
       vip_until=EXCLUDED.vip_until, inventory=EXCLUDED.inventory,
       last_seen_at=NOW(), sweep=EXCLUDED.sweep,
       last_changed_at=COALESCE(EXCLUDED.last_changed_at, farm_world.last_changed_at)`,
    params
  );

  if (changed.length) {
    const cp = [];
    const ct = changed.map((c, i) => {
      cp.push(c.farm_id, sweep, JSON.stringify(c.diff));
      return `($${i * 3 + 1},$${i * 3 + 2},$${i * 3 + 3})`;
    });
    await pool.query(
      `INSERT INTO farm_world_changes (farm_id, sweep, diff) VALUES ${ct.join(",")}`,
      cp
    );
  }
  return changed.length;
}

async function rollSweep(pool, s, context) {
  await pool.query(
    `INSERT INTO crawl_sweeps (sweep, started_at, finished_at, farms, req_ok, req_429, req_5xx, skipped)
     VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7)
     ON CONFLICT (sweep) DO UPDATE SET finished_at=NOW(), farms=EXCLUDED.farms,
       req_ok=EXCLUDED.req_ok, req_429=EXCLUDED.req_429, req_5xx=EXCLUDED.req_5xx,
       skipped=EXCLUDED.skipped`,
    [s.sweep, s.sweep_started_at, s.farms_this_sweep, s.req_ok, s.req_429, s.req_5xx, s.skipped]
  );
  context.log(`Sweep ${s.sweep} complete: ${s.farms_this_sweep} farms, ` +
    `${s.req_ok} ok / ${s.req_429} rate-limited / ${s.req_5xx} 5xx / ${s.skipped} skipped`);
  s.sweep += 1;
  s.cursor = null;
  s.last_id = null;
  s.sweep_started_at = new Date();
  s.farms_this_sweep = 0;
  s.req_ok = 0; s.req_429 = 0; s.req_5xx = 0; s.skipped = 0; s.stuck_count = 0;
  s.window_size = WIN_MAX;
}

module.exports = async function (context) {
  const pool = getPool();
  const apiKey = process.env.WORLD_CRAWL_KEY || process.env.SFL_API_KEY;
  const t0 = Date.now();
  const s = await loadState(pool);
  if (!s) { context.log.error("crawl_state row missing — run the migration"); return; }

  // Ids the upstream has already proven it cannot serve. Kept in memory for the tick
  // so stepping over them costs no HTTP request and no query.
  const badRes = await pool.query(
    "SELECT farm_id FROM crawl_bad_ids WHERE recovered_at IS NULL ORDER BY farm_id"
  );
  const badIds = badRes.rows.map((r) => Number(r.farm_id));
  const badSet = new Set(badIds);
  const nextBadAfter = (id) => badIds.find((b) => b > id);

  let backoff = 30000;
  let pages = 0, farms = 0, changes = 0, freeSkips = 0;
  // Ceiling imposed by observed failures, separate from the byte estimate: a single
  // oversized farm inside a page blows the response cap without moving the average,
  // so the estimate alone would keep re-proposing a window that cannot succeed.
  let ceiling = WIN_MAX;

  while (Date.now() - t0 < BUDGET_MS) {
    // Step over known-bad ids sitting directly at the cursor — free, no request.
    while (s.last_id != null && badSet.has(Number(s.last_id) + 1)) {
      s.last_id = Number(s.last_id) + 1;
      s.cursor = encodeCursor(s.last_id);
      freeSkips++;
    }

    // Size the page from observed bytes, then stop it short of the next known-bad id
    // so the bad record never lands inside a window we would lose to a 500.
    let win = Math.min(sizeWindow(s.avg_farm_bytes), ceiling);
    if (s.last_id != null) {
      const b = nextBadAfter(Number(s.last_id));
      if (b) win = Math.max(WIN_MIN, Math.min(win, b - Number(s.last_id) - 1));
    }
    s.window_size = win;

    let page;
    try {
      page = await fetchFarmsBatch(s.cursor, s.window_size, apiKey);
      s.req_ok = Number(s.req_ok) + 1;
    } catch (err) {
      const status = err.status || 0;

      if (status === 429) {
        s.req_429 = Number(s.req_429) + 1;
        s.last_error = `429 at cursor ${s.cursor}`;
        await saveState(pool, s);
        context.log(`Rate limited — backing off ${backoff / 1000}s`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        continue;
      }

      if (status >= 500) {
        s.req_5xx = Number(s.req_5xx) + 1;
        if (s.window_size > 1) {
          // A 500 loses the WHOLE response — the upstream returns no farms at all, not
          // the good ones plus an error for the bad one, so the neighbours can only be
          // recovered by re-requesting a narrower window. Predictive sizing means this
          // is now either an unexpected whale or a corrupt record; probing with 1
          // separates the two in a single request instead of bisecting down.
          // If the page was nowhere near the response cap, the cause is a corrupt
          // record rather than size — bisecting would waste ~5 more 16s slots to
          // reach the same answer, so drop straight to a single-record probe.
          const estBytes = s.window_size * (Number(s.avg_farm_bytes) || DEFAULT_FARM_BYTES);
          ceiling = estBytes < 2e6 ? 1 : Math.max(1, Math.floor(s.window_size / 2));
          s.window_size = ceiling;
          s.last_error = `${status} — window ceiling ${ceiling}`;
          context.log(`HTTP ${status} at cursor ${s.cursor} — ceiling -> ${ceiling}`);
          await saveState(pool, s);
          await sleep(GAP_MS);
          continue;
        }
        // Even one record fails: the upstream cannot serve it at all (farm 54 also 500s
        // from /community/farms/54, so it is corrupt on their side). Pages arrive in
        // ascending farm_id order and cursor = base64(lastId) — verified 2026-07-27:
        // b64(54)->55, b64(55)->56, b64(100)->101 — so the offender is the smallest
        // existing id above last_id. Record that candidate and step exactly one id.
        // Recording one id per failure self-corrects: if the guess was an id that does
        // not exist, the next request simply succeeds and the entry is harmless.
        if (s.last_id == null) {
          s.stuck_count = Number(s.stuck_count) + 1;
          s.last_error = `${status} at sweep start, attempt ${s.stuck_count}`;
          context.log(`HTTP ${status} at sweep start (attempt ${s.stuck_count}) — retrying`);
          await saveState(pool, s);
          await sleep(GAP_MS);
          continue;
        }
        const from = Number(s.last_id);
        const bad = from + 1;
        await pool.query(
          `INSERT INTO crawl_bad_ids (farm_id, last_checked) VALUES ($1, NOW())
           ON CONFLICT (farm_id) DO UPDATE SET attempts = crawl_bad_ids.attempts + 1,
             last_checked = NOW(), recovered_at = NULL`,
          [bad]
        );
        await pool.query(
          "INSERT INTO crawl_skips (sweep, cursor, from_id, to_id, attempts) VALUES ($1,$2,$3,$4,$5)",
          [s.sweep, s.cursor, from, bad, 1]
        );
        badIds.push(bad); badIds.sort((a, b) => a - b); badSet.add(bad);
        s.skipped = Number(s.skipped) + 1;
        s.cursor = encodeCursor(bad);
        s.last_id = bad;
        s.last_error = `unservable id ${bad} — recorded and stepped over`;
        context.log(`HTTP ${status} at limit=1 after id ${from} — id ${bad} recorded as unservable`);
        await saveState(pool, s);
        await sleep(GAP_MS);
        continue;
      }

      s.last_error = `${status || "net"}: ${err.message}`.slice(0, 300);
      context.log.error(`Fetch failed: ${err.message}`);
      await saveState(pool, s);
      await sleep(GAP_MS);
      continue;
    }

    const list = page.farms || [];
    if (!list.length || !page.next_cursor) {
      if (list.length) {
        const rows = list.map(extractFarm);
        changes += await persistPage(pool, rows, s.sweep);
        s.farms_this_sweep = Number(s.farms_this_sweep) + rows.length;
        farms += rows.length;
      }
      await rollSweep(pool, s, context);
      await saveState(pool, s);
      await sleep(GAP_MS);
      continue;
    }

    const rows = list.map(extractFarm);
    changes += await persistPage(pool, rows, s.sweep);

    s.cursor = page.next_cursor;
    s.last_id = decodeCursor(page.next_cursor) ?? s.last_id;
    s.farms_this_sweep = Number(s.farms_this_sweep) + rows.length;
    // Relax the failure ceiling after each good page so a one-off whale does not pin
    // the window small for the rest of the tick.
    ceiling = Math.min(WIN_MAX, Math.max(ceiling + 1, Math.ceil(ceiling * 1.5)));

    // Feed observed size back into the EWMA so the next window targets TARGET_BYTES.
    if (page.__bytes && rows.length) {
      const seen = page.__bytes / rows.length;
      s.avg_farm_bytes = s.avg_farm_bytes
        ? EWMA_ALPHA * seen + (1 - EWMA_ALPHA) * Number(s.avg_farm_bytes)
        : seen;
    }
    s.last_error = null;
    s.stuck_count = 0;
    backoff = 30000;
    pages++; farms += rows.length;

    await saveState(pool, s);
    await sleep(GAP_MS);
  }

  context.log(`Crawl tick: ${pages} pages, ${farms} farms, ${changes} changed, ` +
    `${freeSkips} bad ids stepped over for free | sweep ${s.sweep} at id ${s.last_id} ` +
    `(${s.farms_this_sweep} farms this sweep) | window ${s.window_size} @ ` +
    `${Math.round((Number(s.avg_farm_bytes) || 0) / 1024)}KB/farm`);
};
