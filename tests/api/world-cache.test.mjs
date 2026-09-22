import { test, beforeEach } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import { handleWorld, aggDimKey, _resetWorldGenCache } from "../../api/_world.js";
import { fakePool } from "./fake-pool.mjs";

/*
 * World chart cache (world_agg). Two defects pinned here:
 *   1. the cache key was the group alone, so func/measure/limit variants of one group were all
 *      served whichever payload the first request stored;
 *   2. the generation was cdn_ingest_state.dump_path, written when an ingest STARTS — so a chart
 *      computed over a half-loaded farm_world was stored and served as the new generation.
 */
const require = createRequire(import.meta.url);
const { wanted } = require("../../azure-functions/shared/world-warm.js");

function worldDb(state) {
  const agg = new Map(); // `${gen}|${scope}|${dim}` -> { payload, at }
  let tick = 0, computes = 0;
  const pool = fakePool((sql, p) => {
    if (/FROM cdn_ingest_state/.test(sql)) return [state];
    if (/SELECT payload FROM world_agg WHERE gen = \$1/.test(sql)) {
      const hit = agg.get(`${p[0]}|${p[1]}|${p[2]}`);
      return hit ? [{ payload: hit.payload }] : [];
    }
    if (/SELECT gen, payload FROM world_agg/.test(sql)) {
      const rows = [...agg.entries()].filter(([k]) => k.endsWith(`|${p[0]}|${p[1]}`))
        .sort((a, b) => b[1].at - a[1].at).map(([k, v]) => ({ gen: k.split("|")[0], payload: v.payload }));
      return rows.slice(0, 1);
    }
    if (/INSERT INTO world_agg/.test(sql)) { agg.set(`${p[0]}|${p[1]}|${p[2]}`, { payload: JSON.parse(p[3]), at: ++tick }); return []; }
    if (/DELETE FROM world_agg/.test(sql)) { for (const k of [...agg.keys()]) if (!k.startsWith(`${p[0]}|`)) agg.delete(k); return []; }
    if (/FROM farm_world/.test(sql)) { computes++; return [{ key: "x", n: "1", value: sql.includes("SUM(xp)") ? "42" : null }]; }
    throw new Error("unexpected SQL: " + sql);
  });
  return { pool, agg, computes: () => computes };
}

beforeEach(() => _resetWorldGenCache());

test("func / measure / limit variants of one group are cached separately", async () => {
  const db = worldDb({ dump_path: "2026-09-21/active.jsonl.gz", complete: true });
  const count = await handleWorld(db.pool, { mode: "agg", group: "island_type" });
  const sum = await handleWorld(db.pool, { mode: "agg", group: "island_type", func: "sum", measure: "xp" });
  assert.equal(count.rows[0].value, null);
  assert.equal(sum.rows[0].value, 42, "the sum request must not be served the cached count");
  assert.equal(sum.cached, false);
  await handleWorld(db.pool, { mode: "agg", group: "island_type", limit: "5" });
  assert.equal(db.computes(), 3, "each distinct shape computed once");
  const again = await handleWorld(db.pool, { mode: "agg", group: "island_type", func: "sum", measure: "xp" });
  assert.equal(again.cached, true);
  assert.equal(again.rows[0].value, 42);
});

test("an ingest in progress neither opens a new generation nor stores a half-built chart", async () => {
  const state = { dump_path: "2026-09-21/active.jsonl.gz", complete: true };
  const db = worldDb(state);
  await handleWorld(db.pool, { mode: "agg", group: "island_type" });   // complete gen cached

  // Tomorrow's dump starts: dump_path moves, complete goes FALSE.
  state.dump_path = "2026-09-22/active.jsonl.gz"; state.complete = false;
  _resetWorldGenCache();
  const during = await handleWorld(db.pool, { mode: "agg", group: "island_type" });
  assert.equal(during.gen, "2026-09-21/active.jsonl.gz", "served from the last COMPLETE generation");
  assert.equal(during.ingesting, true);
  assert.equal(db.pool.sqlMatching(/INSERT INTO world_agg/).length, 1, "nothing written mid-ingest");
  assert.ok([...db.agg.keys()].every((k) => k.startsWith("2026-09-21/")), "the complete generation was not deleted");

  // A chart never cached is computed live but still not stored.
  const live = await handleWorld(db.pool, { mode: "agg", group: "verified" });
  assert.equal(live.cached, false);
  assert.equal(db.pool.sqlMatching(/INSERT INTO world_agg/).length, 1);

  // Ingest completes → the new generation opens and caches normally.
  state.complete = true;
  _resetWorldGenCache();
  const after = await handleWorld(db.pool, { mode: "agg", group: "island_type" });
  assert.equal(after.gen, "2026-09-22/active.jsonl.gz");
  assert.equal(after.cached, false);
  assert.equal(db.pool.sqlMatching(/INSERT INTO world_agg/).length, 2);
});

test("the warm job keys every chart exactly as the page's request does", () => {
  // The page (flowers.html _fetchWorld): island_type and the breakdowns without a limit, the
  // level/slot charts with limit=1000.
  const page = {
    island_type: {}, ascension_level: {}, ban_status: {}, verified: {},
    total_level: { limit: "1000" }, reach_slot: { limit: "1000" }, current_slot: { limit: "1000" }, effective_level: { limit: "1000" },
  };
  const warmDims = new Set(wanted().filter((w) => !w.dim.startsWith("nodes:")).map((w) => w.dim));
  for (const [group, extra] of Object.entries(page)) {
    assert.ok(warmDims.has(aggDimKey({ group, ...extra })), `warm covers ${group}`);
  }
  for (const w of wanted().filter((x) => !x.dim.startsWith("nodes:"))) {
    const q = Object.fromEntries(new URLSearchParams(w.url));
    assert.equal(aggDimKey(q), w.dim, `warm url ${w.url} stores under the key it checks`);
  }
});
