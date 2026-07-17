import { test, beforeEach } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import handler, { _clearCacheForTests } from "../../api/compute.mjs";

const fixtureText = readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url), "utf8");
const p2pText = readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url), "utf8");

// The handler now caches the farm/prices fetches for a short TTL (task F2-2-cache). These
// tests swap globalThis.fetch per test to exercise different upstream outcomes against the
// same farmId, so the module-level cache must be cleared between tests or a later test would
// silently observe an earlier test's cached (and differently-mocked) result.
beforeEach(() => {
  _clearCacheForTests();
});

// Mock fetch that routes by the proxied `url=` target: farm API vs sfl.world prices.
function mockFetchWithPrices() {
  return async (url) => {
    if (String(url).includes("sfl.world")) {
      return { ok: true, status: 200, json: async () => ({ data: { p2p: JSON.parse(p2pText) } }) };
    }
    return { ok: true, status: 200, json: async () => JSON.parse(fixtureText) };
  };
}

function mockRes() {
  return {
    _status: 200, _json: null,
    status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; },
  };
}

test("compute?section=cooking returns the cooking payload from the fixture", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(fixtureText) });
  try {
    const req = { query: { farm: "155498", section: "cooking", petSimulate: "1" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._json.section, "cooking");
    const fp = res._json.data.buildings["Fire Pit"];
    assert.ok(Math.abs(fp.xpPerDay - 232509.80) < 1, `FirePit ${fp.xpPerDay}`);
  } finally {
    globalThis.fetch = orig;
  }
});

test("missing farm → 400", async () => {
  const res = mockRes();
  await handler({ query: {} }, res);
  assert.equal(res._status, 400);
});

test("unknown section → 400", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(fixtureText) });
  try {
    const res = mockRes();
    await handler({ query: { farm: "155498", section: "nope" } }, res);
    assert.equal(res._status, 400);
  } finally { globalThis.fetch = orig; }
});

test("recipes carry real per-recipe cost, coinsPerSFL derived from Betty rate when prices resolve", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFetchWithPrices();
  try {
    const req = { query: { farm: "155498", section: "cooking", petSimulate: "1" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    const fp = res._json.data.buildings["Fire Pit"];
    assert.ok(Array.isArray(fp.recipes) && fp.recipes.length > 0);
    const selected = fp.recipes.find((r) => r.name === fp.recipe);
    assert.ok(selected, "selected recipe should be in recipes list");
    assert.ok(Math.abs(selected.cost - 2.08) < 0.005, `Fire Pit cost was ${selected.cost}`);
  } finally {
    globalThis.fetch = orig;
  }
});

test("?coinsPerSFL= query param overrides the derived Betty rate", async () => {
  // None of the 5 default recipes touch a coin-priced ingredient (Task 7 report), so
  // the override must be observed on a recipe that does: Kitchen's "Chowder" prices
  // Anchovy via the fishing-rod cost, which divides by coinsPerSFL.
  const orig = globalThis.fetch;
  globalThis.fetch = mockFetchWithPrices();
  try {
    const reqDefault = { query: { farm: "155498", section: "cooking", petSimulate: "1" } };
    const resDefault = mockRes();
    await handler(reqDefault, resDefault);
    const chowderDefault = resDefault._json.data.buildings["Kitchen"].recipes.find((r) => r.name === "Chowder");

    const reqOverride = { query: { farm: "155498", section: "cooking", petSimulate: "1", coinsPerSFL: "1000000" } };
    const resOverride = mockRes();
    await handler(reqOverride, resOverride);
    const chowderOverride = resOverride._json.data.buildings["Kitchen"].recipes.find((r) => r.name === "Chowder");

    assert.ok(chowderDefault.cost > 0 && chowderOverride.cost > 0);
    assert.ok(
      chowderOverride.cost < chowderDefault.cost,
      `override (${chowderOverride.cost}) should be cheaper than Betty-derived (${chowderDefault.cost})`
    );
  } finally {
    globalThis.fetch = orig;
  }
});

test("prices fetch failure still returns cooking data (null costs), not a 500", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("sfl.world")) throw new Error("network down");
    return { ok: true, status: 200, json: async () => JSON.parse(fixtureText) };
  };
  try {
    const req = { query: { farm: "155498", section: "cooking", petSimulate: "1" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    const fp = res._json.data.buildings["Fire Pit"];
    assert.ok(Math.abs(fp.xpPerDay - 232509.80) < 1, `FirePit ${fp.xpPerDay}`);
    const selected = fp.recipes.find((r) => r.name === fp.recipe);
    assert.equal(selected.cost, null);
  } finally {
    globalThis.fetch = orig;
  }
});

test("section=prices reports pricesOk:true when the upstream prices fetch resolves", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFetchWithPrices();
  try {
    const req = { query: { farm: "155498", section: "prices" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._json.pricesOk, true);
    assert.ok(Object.keys(res._json.data.marketValue).length > 250);
  } finally {
    globalThis.fetch = orig;
  }
});

// task F2-2e-fix: fetchPrices() falls back to {} on ANY upstream failure and the handler
// still returns 200 (prices are best-effort, must not fail the whole endpoint). Without an
// explicit signal, the client's PRICES() cache (no TTL) cannot tell this near-empty map
// apart from a genuine success and would cache it forever. pricesOk:false is that signal.
test("section=prices reports pricesOk:false when the upstream prices fetch fails, without 500ing", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("sfl.world")) throw new Error("network down");
    return { ok: true, status: 200, json: async () => JSON.parse(fixtureText) };
  };
  try {
    const req = { query: { farm: "155498", section: "prices" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._json.pricesOk, false);
    // Near-empty, not literally {}: a few items (Mark, Love Charm) price via a fixed
    // constant regardless of p2p (item-value.mjs) — but the ~250+ market-priced items
    // from the happy-path test above are all gone.
    assert.ok(Object.keys(res._json.data.marketValue).length < 10,
      `expected a near-empty map, got ${Object.keys(res._json.data.marketValue).length} items`);
  } finally {
    globalThis.fetch = orig;
  }
});

// task-TRACE3: ?explain=1 wires req.query.explain into settings.explain, which
// buildPricesSection turns into marketTrace/productionTrace on the returned data.
test("section=prices with explain=1 attaches marketTrace/productionTrace to data", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFetchWithPrices();
  try {
    const req = { query: { farm: "155498", section: "prices", explain: "1" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    assert.ok(res._json.data.marketTrace, "marketTrace present when explain=1");
    assert.ok(res._json.data.productionTrace, "productionTrace present when explain=1");
    const [item, node] = Object.entries(res._json.data.marketTrace)[0];
    assert.equal(node.value, res._json.data.marketValue[item], `marketTrace[${item}] must equal marketValue`);
  } finally {
    globalThis.fetch = orig;
  }
});

// Absent (or any value other than the literal "1") must reproduce today's payload with no
// trace keys at all — explain is opt-in, not default-on.
test("section=prices without explain → no trace keys", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFetchWithPrices();
  try {
    const req = { query: { farm: "155498", section: "prices" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._json.data.marketTrace, undefined);
    assert.equal(res._json.data.productionTrace, undefined);
  } finally {
    globalThis.fetch = orig;
  }
});

test("farm fetch failure still 502s even if prices fetch succeeds", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("sfl.world")) {
      return { ok: true, status: 200, json: async () => ({ data: { p2p: JSON.parse(p2pText) } }) };
    }
    return { ok: false, status: 503, json: async () => ({}) };
  };
  try {
    const res = mockRes();
    await handler({ query: { farm: "155498", section: "cooking" } }, res);
    assert.equal(res._status, 502);
  } finally {
    globalThis.fetch = orig;
  }
});
