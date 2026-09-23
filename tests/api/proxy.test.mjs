import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import handler from "../../api/proxy.js";

/*
 * The proxy holds the server's SFL_API_KEY. It must go to the SFL API only — it used to ride
 * along to CoinGecko, sfl.world and Yakkamon on every call — and the SFL API must not be an open
 * prefix, or the proxy is a public relay for the key to any endpoint it unlocks.
 */
const KEY = "sfl-key-under-test";
let sent;
const orig = globalThis.fetch;
beforeEach(() => {
  process.env.SFL_API_KEY = KEY;
  delete process.env.KV_REST_API_URL;      // no shared cache: every call reaches fetch
  delete process.env.KV_REST_API_TOKEN;
  sent = [];
  globalThis.fetch = async (url, init) => { sent.push({ url: String(url), headers: (init && init.headers) || {} }); return { ok: true, status: 200, text: async () => "{}" }; };
});
afterEach(() => { globalThis.fetch = orig; });

function mockRes() {
  return {
    _status: 200, _json: null,
    setHeader() {}, status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; }, send() { return this; }, end() { return this; },
  };
}
const get = async (query) => { const res = mockRes(); await handler({ method: "GET", query, headers: {} }, res); return res; };

test("the key goes to the SFL farm API — the one path the app reads through the proxy", async () => {
  for (const farm of ["155498", "1260204733777858"]) {
    const res = await get({ url: `https://api.sunflower-land.com/community/farms/${farm}` });
    assert.equal(res._status, 200);
  }
  assert.equal(sent.length, 2);
  for (const s of sent) assert.equal(s.headers["x-api-key"], KEY);
});

test("the key is never sent to CoinGecko, sfl.world or Yakkamon", async () => {
  for (const url of [
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    "https://sfl.world/api/v1/prices",
    "https://api.yakkamon.com/signups",
  ]) {
    const res = await get({ url });
    assert.equal(res._status, 200, url);
  }
  assert.equal(sent.length, 3);
  for (const s of sent) assert.equal(s.headers["x-api-key"], undefined, s.url);
});

test("any other SFL API path is refused before anything is fetched", async () => {
  for (const url of [
    "https://api.sunflower-land.com/marketplace?filters=pets",
    "https://api.sunflower-land.com/community/data?type=marketplaceActivity",
    "https://api.sunflower-land.com/community/farms/155498/../../admin",
    "https://api.sunflower-land.com/community/farms/155498?x=1",
    "https://api.sunflower-land.com/community/farms/",
  ]) {
    const res = await get({ url });
    assert.equal(res._status, 403, url);
  }
  assert.equal(sent.length, 0);
});

test("a client-supplied ?key= is ignored — nothing in the app sends one", async () => {
  await get({ url: "https://sfl.world/api/v1/prices", key: "attacker" });
  assert.equal(sent[0].headers["x-api-key"], undefined);
  await get({ url: "https://api.sunflower-land.com/community/farms/1", key: "attacker" });
  assert.equal(sent[1].headers["x-api-key"], KEY);
});
