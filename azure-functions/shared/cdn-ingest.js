// Ingest a community-CDN dump (https://community.sunflower-land.com) into farm_world.
//
// The CDN publishes the whole public dataset once a day as newline-delimited JSON,
// gzipped: `all.jsonl.gz` (~2.0 GB, every farm) and `active.jsonl.gz` (~740 MB, farms
// played in the last 90 days). Each line is one wrapper: {id, nftId, farm,
// lastActivity, isBlacklisted} — the last two exist nowhere in the public API.
//
// Shared deliberately: the one-off full load and the daily active refresh must write
// identical rows, so they run the same code over the same stream interface.

const readline = require("readline");
const zlib = require("zlib");
const { extractFarm } = require("./world-extract");
const { persistFarmRows } = require("./world-persist");

const CDN_BASE = "https://community.sunflower-land.com";

/** Files available, newest date first. */
async function listDumps() {
  const r = await fetch(`${CDN_BASE}/`);
  if (!r.ok) throw new Error(`CDN index ${r.status}`);
  const files = await r.json();
  const dumps = files
    .filter((f) => f.filename.includes("/") && f.filename.endsWith(".jsonl.gz"))
    .map((f) => {
      const [date, name] = f.filename.split("/");
      return { date, kind: name.replace(".jsonl.gz", ""), path: f.filename, size: f.size, modifiedAt: f.modifiedAt };
    });
  dumps.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return dumps;
}

/** Newest dump of a given kind ("active" | "all"). */
async function latestDump(kind) {
  const found = (await listDumps()).find((d) => d.kind === kind);
  if (!found) throw new Error(`no ${kind} dump in the CDN index`);
  return found;
}

function dumpUrl(path) {
  return `${CDN_BASE}/${path}`;
}

/**
 * Stream a gzipped JSONL source into farm_world.
 *
 * @param {object}   opts
 * @param {Readable} opts.source        gzipped byte stream (HTTP body or a local file)
 * @param {Function} opts.bankedFoodXp  boost-aware banked-food XP (see cooking-xp.js)
 * @param {number}   [opts.batchSize]   rows per upsert statement
 * @param {number}   [opts.deadlineMs]  wall-clock budget; stops cleanly when reached
 * @param {number}   [opts.skip]        records to skip before ingesting (resume)
 * @param {Function} [opts.onProgress]  called every batch with running counters
 * @returns {Promise<{records:number, ingested:number, unchanged:number, changed:number,
 *                    skipped:number, bad:number, complete:boolean}>}
 */
async function ingestStream(pool, opts) {
  const {
    source, bankedFoodXp, batchSize = 500, deadlineMs = null, skip = 0, onProgress,
  } = opts;
  const t0 = Date.now();
  const rl = readline.createInterface({
    input: source.pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });

  let records = 0, ingested = 0, changed = 0, bad = 0, unchanged = 0;
  let batch = [];
  let complete = true;

  /*
   * Only farms that actually played get the expensive treatment.
   *
   * lastActivity is authoritative: if it has not moved since our stored value the player
   * has not played, so the farm state is identical and there is nothing to rewrite. That
   * lets a daily re-ingest skip both the per-farm work (expansion reach, boost-aware
   * banked-food XP — the CPU cost that held the first Azure run to 46 records/second) and
   * the ~44 KB game_data write. Skipped farms still get last_seen_at bumped so it keeps
   * meaning "when we last confirmed this row".
   */
  const flush = async () => {
    if (!batch.length) return;
    const ids = batch.map((b) => b.id);
    const prev = await pool.query(
      "SELECT farm_id, last_activity FROM farm_world WHERE farm_id = ANY($1::bigint[])", [ids]
    );
    const seen = new Map(prev.rows.map((r) =>
      [String(r.farm_id), r.last_activity ? new Date(r.last_activity).getTime() : null]));

    const stale = [], fresh = [];
    for (const b of batch) {
      const before = seen.get(String(b.id));
      // Unchanged only when we have a stored value AND it matches exactly. A new farm
      // (no stored value) always goes down the full path.
      if (before !== undefined && before !== null && b.lastActivity !== null && before === b.lastActivity) stale.push(b.id);
      else fresh.push(b);
    }

    if (stale.length) {
      await pool.query(
        "UPDATE farm_world SET last_seen_at = NOW() WHERE farm_id = ANY($1::bigint[])", [stale]
      );
      unchanged += stale.length;
    }
    if (fresh.length) {
      const rows = [];
      for (const b of fresh) {
        try { rows.push(extractFarm(b.entry, bankedFoodXp)); } catch { bad++; }
      }
      if (rows.length) {
        changed += await persistFarmRows(pool, rows, null);
        ingested += rows.length;
      }
    }
    batch = [];
    if (onProgress) onProgress({ records, ingested, unchanged, changed, bad, elapsedMs: Date.now() - t0 });
  };

  for await (const line of rl) {
    if (!line) continue;
    records++;
    if (records <= skip) continue;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      bad++;
      continue;
    }
    if (!entry || entry.id === undefined || !entry.farm) { bad++; continue; }

    const la = Number(entry.lastActivity);
    batch.push({ id: entry.id, lastActivity: Number.isFinite(la) ? la : null, entry });

    if (batch.length >= batchSize) {
      await flush();
      if (deadlineMs && Date.now() - t0 > deadlineMs) {
        complete = false;
        break;
      }
    }
  }
  await flush();
  // Stop pulling bytes if we bailed on the deadline, so the socket is not left open.
  rl.close();
  if (typeof source.destroy === "function" && !complete) source.destroy();

  return { records, ingested, unchanged, changed, skipped: skip, bad, complete };
}

module.exports = { CDN_BASE, listDumps, latestDump, dumpUrl, ingestStream };
