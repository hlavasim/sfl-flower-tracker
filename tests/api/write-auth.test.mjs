import { test, beforeEach } from "node:test";
import assert from "node:assert";
import { getPool } from "../../api/_db.js";
import { requireWriteToken } from "../../api/_auth.js";
import farmHistory from "../../api/farm-history.js";
import orderbook from "../../api/marketplace-orderbook.js";
import gameToken from "../../api/game-token.js";
import marksHistory from "../../api/marks-history.js";

/*
 * Every write in api/ (and the owner-private reads: the BTC ledger, the wallet list, what the
 * wallets hold) must be refused without the owner's x-write-token. Before this the farm ID —
 * public — was the only check, and CORS is *, so any site could rewrite the ledger.
 *
 * The pg pool is a lazy singleton, so its query/connect are swapped for a recorder: a refused
 * request must answer 401 WITHOUT touching the database, and an accepted one reaches it.
 */
const TOKEN = "t0p-secret-write-token";
const pool = getPool();
let queries = [];
pool.query = async (sql, params) => { queries.push(sql); return { rows: [], rowCount: 1 }; };
pool.connect = async () => ({ query: pool.query, release() {} });

beforeEach(() => { queries = []; process.env.WRITE_TOKEN = TOKEN; });

function mockRes() {
  return {
    _status: 200, _json: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; },
    send(b) { this._body = b; return this; },
    end() { return this; },
  };
}
async function call(handler, { method = "GET", query = {}, body, token } = {}) {
  const res = mockRes();
  const headers = token === undefined ? {} : { "x-write-token": token };
  await handler({ method, query, body, headers }, res);
  return res;
}

test("requireWriteToken: unset env = writes off (503), missing or wrong token = 401, right one passes", () => {
  delete process.env.WRITE_TOKEN;
  let res = mockRes();
  assert.equal(requireWriteToken({ headers: { "x-write-token": "anything" } }, res), false);
  assert.equal(res._status, 503);
  assert.match(res._json.error, /WRITE_TOKEN not configured/);

  process.env.WRITE_TOKEN = TOKEN;
  for (const h of [{}, { "x-write-token": "" }, { "x-write-token": "wrong" }, { "x-write-token": TOKEN + "x" }]) {
    res = mockRes();
    assert.equal(requireWriteToken({ headers: h }, res), false, JSON.stringify(h));
    assert.equal(res._status, 401);
  }
  assert.equal(requireWriteToken({ headers: { "x-write-token": TOKEN } }, mockRes()), true);
});

// [label, handler, request] — each must be refused with no token and must not reach the DB.
const FARM = "155498";
const GUARDED = [
  ["btc-tx GET (the ledger)", farmHistory, { query: { type: "btc-tx", farm: FARM } }],
  ["btc-tx POST", farmHistory, { method: "POST", query: { type: "btc-tx" },
    body: { farm_id: 155498, direction: "deposit", btc_amount: 0.01, tx_date: "2026-09-01", venue: "sfl" } }],
  ["btc-tx PATCH", farmHistory, { method: "PATCH", query: { type: "btc-tx", farm: FARM, id: "1" }, body: { venue: "wallet" } }],
  ["btc-tx DELETE", farmHistory, { method: "DELETE", query: { type: "btc-tx", farm: FARM, id: "1" } }],
  ["venue-balance POST", farmHistory, { method: "POST", query: { type: "venue-balance", farm: FARM }, body: { venue: "yakkamon", amount: 5 } }],
  ["farm-wallet GET", farmHistory, { query: { type: "farm-wallet", farm: FARM } }],
  ["farm-wallet POST", farmHistory, { method: "POST", query: { type: "farm-wallet", farm: FARM }, body: { address: "0x" + "a".repeat(40) } }],
  ["farm-wallet DELETE", farmHistory, { method: "DELETE", query: { type: "farm-wallet", farm: FARM, address: "0x" + "a".repeat(40) } }],
  ["venue-holdings GET", farmHistory, { query: { type: "venue-holdings", farm: FARM } }],
  ["repay-plan PUT", farmHistory, { method: "PUT", query: { type: "repay-plan", farm: FARM }, body: { start_date: "2026-09-01", rate: 10, period: "year" } }],
  ["repay-plan DELETE", farmHistory, { method: "DELETE", query: { type: "repay-plan", farm: FARM } }],
  ["spec trades POST", farmHistory, { method: "POST", query: { type: "spec", what: "trades", farm: FARM },
    body: { item: "Potato", qty: 1, buy_price: 1, buy_date: "2026-09-01" } }],
  ["spec trades PATCH", farmHistory, { method: "PATCH", query: { type: "spec", what: "trades", farm: FARM, id: "1" }, body: { notes: "x" } }],
  ["spec trades DELETE", farmHistory, { method: "DELETE", query: { type: "spec", what: "trades", farm: FARM, id: "1" } }],
  ["spec eggs POST (collector)", farmHistory, { method: "POST", query: { type: "spec", what: "eggs", farm: FARM },
    body: { ts_utc: "2026-09-22T10:05:00Z", floor_hidden_ron: 1 } }],
  ["wishlist POST", orderbook, { method: "POST", query: { wishlist: "1" }, body: { farm: 155498, key: "collectibles:X", priority: 1 } }],
  ["marks force-refresh", marksHistory, { query: { mode: "force-refresh" } }],
];

test("every guarded endpoint answers 401 without a token, and never reaches the database", async () => {
  for (const [label, handler, req] of GUARDED) {
    for (const token of [undefined, "wrong"]) {
      queries = [];
      const res = await call(handler, { ...req, token });
      assert.equal(res._status, 401, `${label} (token=${token}) → ${res._status} ${JSON.stringify(res._json)}`);
      assert.equal(queries.length, 0, `${label}: refused request must not query the DB`);
    }
  }
});

test("with WRITE_TOKEN unset every guarded endpoint is off (503), not open", async () => {
  delete process.env.WRITE_TOKEN;
  for (const [label, handler, req] of GUARDED) {
    queries = [];
    const res = await call(handler, { ...req, token: TOKEN });
    assert.equal(res._status, 503, label);
    assert.equal(queries.length, 0, label);
  }
});

test("the right token gets through to the database", async () => {
  const add = await call(farmHistory, { ...GUARDED[1][2], token: TOKEN });
  assert.equal(add._status, 201);
  assert.ok(queries.some((q) => /INSERT INTO btc_transactions/.test(q)));
  queries = [];
  const list = await call(farmHistory, { ...GUARDED[0][2], token: TOKEN });
  assert.equal(list._status, 200);
  assert.deepEqual(list._json, { transactions: [] });
  queries = [];
  const eggs = await call(farmHistory, { ...GUARDED[14][2], token: TOKEN });
  assert.equal(eggs._status, 200);
  assert.ok(queries.some((q) => /INSERT INTO egg_market/.test(q)));
});

test("public reads stay public: spec trades/eggs, venue-balance, repay-plan GET need no token", async () => {
  for (const q of [{ type: "spec", what: "trades", farm: FARM }, { type: "spec", what: "eggs", farm: FARM },
                   { type: "venue-balance", farm: FARM }, { type: "repay-plan", farm: FARM }]) {
    const res = await call(farmHistory, { query: q });
    assert.equal(res._status, 200, JSON.stringify(q));
  }
});

test("a disallowed farm still gets its 400/403, not a token prompt", async () => {
  assert.equal((await call(farmHistory, { query: { type: "btc-tx", farm: "42" } }))._status, 400);
  assert.equal((await call(orderbook, { method: "POST", query: { wishlist: "1" }, body: { farm: 42, key: "a:b" } }))._status, 403);
});

test("btc-tx venue must be a slug — markup cannot be stored (stored XSS in the WHERE chip)", async () => {
  const evil = "x');alert(1)//<img src=x onerror=alert(2)>";
  const post = await call(farmHistory, { ...GUARDED[1][2], body: { ...GUARDED[1][2].body, venue: evil }, token: TOKEN });
  assert.equal(post._status, 400);
  const patch = await call(farmHistory, { ...GUARDED[2][2], body: { venue: evil }, token: TOKEN });
  assert.equal(patch._status, 400);
  const bal = await call(farmHistory, { ...GUARDED[4][2], body: { venue: evil, amount: 1 }, token: TOKEN });
  assert.equal(bal._status, 400);
  assert.equal(queries.filter((q) => /INSERT|UPDATE/.test(q)).length, 0, "nothing written");
  // The venues the page offers are all still accepted.
  for (const v of ["sfl", "yakkamon", "wallet", "new_place-2"]) {
    queries = [];
    const ok = await call(farmHistory, { ...GUARDED[1][2], body: { ...GUARDED[1][2].body, venue: v, flower_amount: 1 }, token: TOKEN });
    assert.equal(ok._status, 201, v);
  }
});

test("game-token POST (replaces the stored trading token) needs the write token", async () => {
  process.env.KV_REST_API_URL = "https://kv.test";
  process.env.KV_REST_API_TOKEN = "kv";
  const orig = globalThis.fetch;
  const hits = [];
  globalThis.fetch = async (u) => { hits.push(String(u)); return { ok: true, status: 200, json: async () => ({ result: null }) }; };
  try {
    const payload = Buffer.from(JSON.stringify({ farmId: 155498, exp: Math.floor(Date.now() / 1000) + 86400 })).toString("base64");
    const body = { farm: 155498, token: `h.${payload}.s` };
    const refused = await call(gameToken, { method: "POST", body });
    assert.equal(refused._status, 401);
    assert.equal(hits.length, 0, "nothing written to KV");
    const ok = await call(gameToken, { method: "POST", body, token: TOKEN });
    assert.equal(ok._status, 200);
    assert.ok(hits.some((u) => u.includes("/set/")));
  } finally { globalThis.fetch = orig; }
});
