// Warm the World page's precomputed charts after a CDN ingest.
//
// It deliberately does NOT compute anything itself: it calls the same public endpoints the
// page calls, and api/_world.js stores whatever it had to compute under the current ingest
// generation. So the SQL behind each chart exists in exactly one place, and this file only
// has to know WHICH charts the page draws.
//
// Idempotent and resumable with no extra state: what is already present in world_agg for
// the current generation is skipped, so a run cut short by the host's 10-minute timeout
// simply continues on the next invocation.

const BASE = process.env.WORLD_WARM_BASE || "https://sunflower.sajmonium.quest";

// Mirrors what the World page fetches (flowers.html), limit included — the cache is keyed by
// it: the level/slot charts ask for limit=1000, island type and the worldBreakdowns list send
// none (the API default, 100). Plus one distribution per sunstone-buyable node type.
const DIM_LIMITS = {
  island_type: 100, total_level: 1000, effective_level: 1000, reach_slot: 1000, current_slot: 1000,
  ascension_level: 100, ban_status: 100, verified: 100,
};
const DIMS = Object.keys(DIM_LIMITS);
const NODES = ["crops", "trees", "stones", "fruitPatches", "iron", "gold",
  "crimstones", "flowers", "oilReserves", "lavaPits"];
// The activity windows the page's scope control offers. "all" is the expensive one.
const SCOPES = [null, 90, 30];

// Same key as aggDimKey() in api/_world.js for a count chart (the only kind the page draws).
const aggDimKey = (group, limit) => `${group}|count|${limit}`;

/** Every (scope, dim) pair the page can ask for, cheapest scope first. */
function wanted() {
  const out = [];
  for (const scope of [30, 90, null]) {
    for (const d of DIMS) {
      const limit = DIM_LIMITS[d];
      out.push({ scope, dim: aggDimKey(d, limit), url: `mode=agg&group=${d}${limit === 100 ? "" : `&limit=${limit}`}` });
    }
    for (const n of NODES) out.push({ scope, dim: `nodes:${n}`, url: `mode=nodes&node=${n}` });
  }
  return out;
}

const scopeKey = (s) => (s ? String(s) : "all");

/**
 * @param {object}   pool
 * @param {object}   log            context.log
 * @param {number}   [deadlineMs]   wall-clock budget; stops cleanly when reached
 * @returns {Promise<{gen:string, warmed:number, skipped:number, failed:number, complete:boolean}>}
 */
async function warmWorldAgg(pool, log, deadlineMs = 8 * 60 * 1000) {
  const t0 = Date.now();
  const g = await pool.query("SELECT dump_path, complete FROM cdn_ingest_state WHERE id = 1");
  const gen = (g.rows[0] && g.rows[0].dump_path) || "none";
  // The API only caches a COMPLETE generation (api/_world.js currentGen); warming mid-ingest
  // would compute every chart live for nothing.
  if (g.rows[0] && g.rows[0].dump_path && !g.rows[0].complete) {
    log(`world_agg warm skipped: ${gen} is still being ingested`);
    return { gen, warmed: 0, skipped: 0, failed: 0, complete: false };
  }

  const have = new Set((await pool.query(
    "SELECT scope, dim FROM world_agg WHERE gen = $1", [gen])).rows.map((r) => `${r.scope}|${r.dim}`));

  let warmed = 0, skipped = 0, failed = 0, complete = true;
  for (const w of wanted()) {
    if (have.has(`${scopeKey(w.scope)}|${w.dim}`)) { skipped++; continue; }
    if (Date.now() - t0 > deadlineMs) { complete = false; break; }
    const url = `${BASE}/api/farm-history?type=world&${w.url}` +
      (w.scope ? `&active_days=${w.scope}` : "");
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await r.json();
      warmed++;
    } catch (e) {
      failed++;
      log(`  warm failed for ${scopeKey(w.scope)}/${w.dim}: ${e.message}`);
    }
  }
  log(`world_agg warm (gen ${gen}): ${warmed} computed, ${skipped} already cached, ` +
    `${failed} failed${complete ? "" : " — budget spent, will continue next run"}`);
  return { gen, warmed, skipped, failed, complete };
}

module.exports = { warmWorldAgg, wanted, DIMS, NODES, SCOPES };
