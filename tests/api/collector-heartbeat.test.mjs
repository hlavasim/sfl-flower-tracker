import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { getPool } from "../../api/_db.js";
import handler from "../../api/marketplace-orderbook.js";
import { fakePool, fakeContext, mockRes } from "./fake-pool.mjs";

/*
 * farm-snapshot skips the insert when the farm did not change, so on a quiet night farm_snapshots
 * stops growing while the collector runs fine, and the health check (age of the last insert)
 * cried "stale". The collector now records every run in collector_runs; health trusts the newer
 * of the last insert and the last successful run, and says when runs fail.
 */
const require = createRequire(import.meta.url);
const db = require("../../azure-functions/shared/db.js");
const api = require("../../azure-functions/shared/api.js");
const cur = {};
db.getPool = () => cur.pool;
api.fetchFarmData = (...a) => cur.fetch(...a);
const farmSnapshot = require("../../azure-functions/farm-snapshot/index.js");

const FARM = { inventory: { Wood: "1" }, coins: 5 };

test("an unchanged farm is not inserted, but the run is recorded as ok", async () => {
  process.env.FARM_IDS = "155498";
  cur.fetch = async () => ({ farm: FARM });
  cur.pool = fakePool((sql) => (/SELECT game_data FROM farm_snapshots/.test(sql) ? [{ game_data: FARM }] : []));
  await farmSnapshot(fakeContext());
  assert.strictEqual(cur.pool.sqlMatching(/INSERT INTO farm_snapshots/).length, 0);
  const [run] = cur.pool.sqlMatching(/INSERT INTO collector_runs/);
  assert.ok(run, "run recorded");
  assert.deepStrictEqual(run.params, ["farm-snapshot", true, null]);
});

test("a run where every farm failed is recorded with the error, not as ok", async () => {
  process.env.FARM_IDS = "155498";
  cur.fetch = async () => { throw new Error("SFL API 429"); };
  cur.pool = fakePool(() => []);
  await farmSnapshot(fakeContext());
  const [run] = cur.pool.sqlMatching(/INSERT INTO collector_runs/);
  assert.deepStrictEqual(run.params, ["farm-snapshot", false, "155498: SFL API 429"]);
});

test("a missing collector_runs table never breaks the snapshots", async () => {
  process.env.FARM_IDS = "155498";
  cur.fetch = async () => ({ farm: { ...FARM, coins: 6 } });
  cur.pool = fakePool((sql) => {
    if (/collector_runs/.test(sql)) throw new Error('relation "collector_runs" does not exist');
    if (/SELECT game_data/.test(sql)) return [{ game_data: FARM }];
    return [];
  });
  const ctx = fakeContext();
  await farmSnapshot(ctx);
  assert.strictEqual(cur.pool.sqlMatching(/INSERT INTO farm_snapshots/).length, 1);
});

function usePool(fake) {
  const pool = getPool();
  pool.query = fake.query;
  pool.connect = fake.connect;
  return fake;
}
async function health(answer) {
  usePool(fakePool(answer));
  const res = mockRes();
  await handler({ method: "GET", query: { health: "1" } }, res);
  return Object.fromEntries(res._json.collectors.map((c) => [c.table, c]));
}
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();

test("health: a quiet night (old insert, fresh ok run) is not stale", async () => {
  const c = await health((sql) => {
    if (/FROM collector_runs/.test(sql)) return [{ last_run: ago(0.05), last_ok: ago(0.05), last_error: null }];
    if (/FROM farm_snapshots/.test(sql)) return [{ last: ago(5) }];
    return [{ last: ago(0.1) }];
  });
  assert.strictEqual(c.farm_snapshots.stale, false);
  assert.strictEqual(c.farm_snapshots.ageHours, 0.1);
});

test("health: runs happen but fail (game errors) → stale, with the error", async () => {
  const c = await health((sql) => {
    if (/FROM collector_runs/.test(sql)) return [{ last_run: ago(0.05), last_ok: ago(3), last_error: "155498: SFL API 429" }];
    if (/FROM farm_snapshots/.test(sql)) return [{ last: ago(3) }];
    return [{ last: ago(0.1) }];
  });
  assert.strictEqual(c.farm_snapshots.stale, true);
  assert.match(c.farm_snapshots.lastError, /429/);
});

test("health: no collector_runs table yet → the old rule (age of the last insert)", async () => {
  const c = await health((sql) => {
    if (/FROM collector_runs/.test(sql)) throw new Error('relation "collector_runs" does not exist');
    if (/FROM farm_snapshots/.test(sql)) return [{ last: ago(3) }];
    return [{ last: ago(0.1) }];
  });
  assert.strictEqual(c.farm_snapshots.stale, true);
  assert.ok(!("error" in c.farm_snapshots));
});

test("the migration creates collector_runs and lets the API read it", () => {
  const sql = readFileSync(new URL("../../azure-functions/migrations/2026-11-26-collector-runs.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS collector_runs/);
  assert.match(sql, /GRANT SELECT ON collector_runs TO sfl_reader/);
});
