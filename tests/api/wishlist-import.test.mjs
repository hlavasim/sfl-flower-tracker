import { test, beforeEach } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { getPool } from "../../api/_db.js";
import orderbook from "../../api/marketplace-orderbook.js";

// Wishlist import adds items (upsert) and never replaces the stored list: a list cached from another
// farm could otherwise wipe the owner's. The page keeps one cached list per farm.
const TOKEN = "t0p-secret-write-token";
const pool = getPool();
let queries = [];
pool.query = async (sql, params) => { queries.push({ sql, params }); return { rows: [], rowCount: 1 }; };
pool.connect = async () => ({ query: pool.query, release() {} });
beforeEach(() => { queries = []; process.env.WRITE_TOKEN = TOKEN; });
const res = () => ({ _status: 200, _json: null, headers: {}, setHeader() {}, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; }, end() { return this; } });

test("upsert: every item inserted or re-prioritised, nothing deleted", async () => {
  const r = res();
  await orderbook({ method: "POST", query: { wishlist: "1" }, headers: { "x-write-token": TOKEN }, body: { farm: 155498, upsert: { "collectibles:A": 1, "wearables:B": 9 } } }, r);
  assert.equal(r._status, 200, JSON.stringify(r._json));
  assert.equal(r._json.count, 2);
  assert.ok(!queries.some((q) => /DELETE/i.test(q.sql)), "no delete");
  const ins = queries.filter((q) => /INSERT INTO wishlist/.test(q.sql));
  assert.deepEqual(ins.map((q) => q.params.slice(1)), [["collectibles:A", 1], ["wearables:B", 3]]);
});

test("the page caches the wishlist per farm and imports with upsert", () => {
  const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
  assert.match(SRC, /const _wlKey = \(\) => "sfl_wishlist_v1_" \+ FARM_ID;/);
  assert.match(SRC, /if \(!_wlLoaded \|\| _wlFarm !== FARM_ID\)/);
  assert.match(SRC, /_wlPost\(\{ upsert: added \}\)/);
  assert.doesNotMatch(SRC, /_wlPost\(\{ list: l \}\)/);
});
