import { test, beforeEach } from "node:test";
import assert from "node:assert";
import { handleWorld, _resetWorldGenCache } from "../../api/_world.js";
import { fakePool } from "./fake-pool.mjs";

/*
 * mode=stats ran two full scans of farm_world in parallel (~700k wide rows): 21 s against the
 * 20 s statement timeout, so production answered 400 and the WORLD page showed nothing. Now it is
 * ONE scan (~10 s), stored in world_agg per dump generation like the charts; the ingest row stays
 * live (it is one row, and its age must tick).
 */
const COUNTS = { farms: "701307", with_activity: "701307", blacklisted: "66156", with_blacklist: "347709", banned: "36967",
  verified: "72269", newest_activity: "2026-11-25T22:46:06.365Z", d1: "21633", d7: "28715", d30: "41000", d90: "60000" };

function db(state) {
  const agg = new Map();
  let scans = 0;
  const pool = fakePool((sql, p) => {
    if (/SELECT dump_path, complete FROM cdn_ingest_state/.test(sql)) return [state];
    if (/SELECT \* FROM cdn_ingest_state/.test(sql)) return [{ ...state, dump_modified_at: "2026-11-25T22:00:00Z", records_done: 5 }];
    if (/SELECT payload FROM world_agg WHERE gen = \$1/.test(sql)) { const h = agg.get(p.join("|")); return h ? [{ payload: h }] : []; }
    if (/INSERT INTO world_agg/.test(sql)) { agg.set([p[0], p[1], p[2]].join("|"), JSON.parse(p[3])); return []; }
    if (/DELETE FROM world_agg/.test(sql)) return [];
    if (/FROM farm_world/.test(sql)) { scans++; return [COUNTS]; }
    throw new Error("unexpected SQL: " + sql);
  });
  return { pool, scans: () => scans };
}

beforeEach(() => _resetWorldGenCache());

test("stats: one scan of farm_world, cached for the dump; the same shape as before", async () => {
  const d = db({ dump_path: "2026-11-25/active.jsonl.gz", complete: true });
  const s = await handleWorld(d.pool, { mode: "stats" });
  assert.strictEqual(d.scans(), 1, "one scan, not two");
  assert.deepStrictEqual(s.stored, { farms: 701307, with_activity: 701307, blacklisted: 66156, with_blacklist: 347709, banned: 36967, verified: 72269, newest_activity: "2026-11-25T22:46:06.365Z" });
  assert.deepStrictEqual(s.active, { d1: 21633, d7: 28715, d30: 41000, d90: 60000 });
  assert.strictEqual(s.dump.path, "2026-11-25/active.jsonl.gz");
  assert.strictEqual(s.dump.records_done, 5);
  const again = await handleWorld(d.pool, { mode: "stats" });
  assert.strictEqual(d.scans(), 1, "second request served from world_agg");
  assert.deepStrictEqual(again.stored, s.stored);
  assert.ok(again.dump.age_ms > 0, "the dump age is live");
});
