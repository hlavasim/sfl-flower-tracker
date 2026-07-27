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
 * @returns {Promise<{records:number, ingested:number, changed:number, skipped:number,
 *                    bad:number, complete:boolean}>}
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

  let records = 0, ingested = 0, changed = 0, bad = 0;
  let batch = [];
  let complete = true;

  const flush = async () => {
    if (!batch.length) return;
    changed += await persistFarmRows(pool, batch, null);
    ingested += batch.length;
    batch = [];
    if (onProgress) onProgress({ records, ingested, changed, bad, elapsedMs: Date.now() - t0 });
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

    try {
      batch.push(extractFarm(entry, bankedFoodXp));
    } catch {
      bad++;
      continue;
    }
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

  return { records, ingested, changed, skipped: skip, bad, complete };
}

module.exports = { CDN_BASE, listDumps, latestDump, dumpUrl, ingestStream };
