import { test } from "node:test";
import assert from "node:assert";
import { createStore, keyOf, RESOURCES } from "../../app/store.mjs";

// The page's one data layer: every widget asks the store, the store asks the network once per key.

function fakeFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", body: init.body });
    const hit = Object.entries(routes).find(([p]) => url.includes(p));
    if (!hit) return { ok: false, status: 404, json: async () => ({}) };
    const v = typeof hit[1] === "function" ? hit[1](url, init) : hit[1];
    if (v instanceof Error) throw v;
    if (v && v.status) return { ok: false, status: v.status, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => v };
  };
  f.calls = calls;
  return f;
}

test("keyOf is stable whatever the param order", () => {
  assert.strictEqual(keyOf({ res: "farm", farm: 1, x: 2 }), keyOf({ x: 2, farm: 1, res: "farm" }));
  assert.notStrictEqual(keyOf({ res: "farm", farm: 1 }), keyOf({ res: "farm", farm: 2 }));
});

test("one in-flight request per key: concurrent gets share it", async () => {
  const f = fakeFetch({ "/api/proxy": { farm: { coins: 1 } } });
  const s = createStore({ fetch: f });
  const [a, b] = await Promise.all([s.get({ res: "farm", farm: 7 }), s.get({ res: "farm", farm: 7 })]);
  assert.strictEqual(f.calls.length, 1);
  assert.deepStrictEqual(a.data, { farm: { coins: 1 } });
  assert.strictEqual(a.status, "ok");
  assert.strictEqual(b.data, a.data);
});

test("TTL: fresh entries are served from memory, expired ones refetched; force always refetches", async () => {
  let t = 1000;
  const f = fakeFetch({ "/api/proxy": { farm: {} } });
  const s = createStore({ fetch: f, now: () => t });
  await s.get({ res: "farm", farm: 7 });
  t += RESOURCES.farm.ttl - 1;
  await s.get({ res: "farm", farm: 7 });
  assert.strictEqual(f.calls.length, 1);
  t += 2;
  const r = await s.get({ res: "farm", farm: 7 });
  assert.strictEqual(f.calls.length, 2);
  assert.strictEqual(r.asOf, t);
  await s.get({ res: "farm", farm: 7 }, { force: true });
  assert.strictEqual(f.calls.length, 3);
});

test("a failed refresh keeps the last good data, marked stale with the error", async () => {
  let t = 0, fail = false;
  const f = fakeFetch({ "/api/proxy": () => (fail ? { status: 429 } : { farm: { coins: 5 } }) });
  const s = createStore({ fetch: f, now: () => t });
  await s.get({ res: "farm", farm: 7 });
  fail = true; t += RESOURCES.farm.ttl + 1;
  const r = await s.get({ res: "farm", farm: 7 });
  assert.strictEqual(r.status, "error");
  assert.strictEqual(r.stale, true);
  assert.deepStrictEqual(r.data, { farm: { coins: 5 } });
  assert.match(r.error, /429/);
});

test("a first load that fails resolves (never rejects) with data null", async () => {
  const f = fakeFetch({ "/api/proxy": new Error("offline") });
  const r = await createStore({ fetch: f }).get({ res: "farm", farm: 7 });
  assert.strictEqual(r.status, "error");
  assert.strictEqual(r.data, null);
  assert.match(r.error, /offline/);
});

test("invalidate({farm}) drops only that farm's entries", async () => {
  const f = fakeFetch({ "/api/proxy": { farm: {} } });
  const s = createStore({ fetch: f });
  await s.get({ res: "farm", farm: 1 });
  await s.get({ res: "farm", farm: 2 });
  s.invalidate({ farm: 1 });
  await s.get({ res: "farm", farm: 1 });
  await s.get({ res: "farm", farm: 2 });
  assert.strictEqual(f.calls.length, 3);
});

test("subscribe hears every settle of its key until unsubscribed", async () => {
  const f = fakeFetch({ "/api/proxy": { farm: {} } });
  const s = createStore({ fetch: f });
  const seen = [];
  const off = s.subscribe({ res: "farm", farm: 1 }, (e) => seen.push(e.status));
  await s.get({ res: "farm", farm: 1 });
  await s.get({ res: "farm", farm: 1 }, { force: true });
  off();
  await s.get({ res: "farm", farm: 1 }, { force: true });
  await s.get({ res: "farm", farm: 2 });
  assert.deepStrictEqual(seen, ["ok", "ok"]);
});

test("leveling POSTs the recorded weeks, and ticket-weeks is fetched once for everyone", async () => {
  const f = fakeFetch({
    "type=ticket-weeks": { weeks: [{ wk: "2026-11-16" }] },
    "section=leveling": (url, init) => ({ data: { method: init.method || "GET", body: init.body } }),
  });
  const s = createStore({ fetch: f });
  const [lv, tw] = await Promise.all([s.get({ res: "leveling", farm: 9 }), s.get({ res: "ticketWeeks", farm: 9 })]);
  assert.strictEqual(lv.data.method, "POST");
  assert.deepStrictEqual(JSON.parse(lv.data.body), { weeks: [{ wk: "2026-11-16" }] });
  assert.deepStrictEqual(tw.data, [{ wk: "2026-11-16" }]);
  assert.strictEqual(f.calls.filter((c) => c.url.includes("ticket-weeks")).length, 1);
});

test("leveling falls back to GET when ticket-weeks fails or is empty", async () => {
  const f = fakeFetch({ "type=ticket-weeks": { status: 500 }, "section=leveling": (u, init) => ({ data: { method: init.method || "GET" } }) });
  const r = await createStore({ fetch: f }).get({ res: "leveling", farm: 9 });
  assert.strictEqual(r.status, "ok");
  assert.strictEqual(r.data.method, "GET");
});

test("an unknown resource is an error result, not a throw", async () => {
  const r = await createStore({ fetch: fakeFetch({}) }).get({ res: "nope" });
  assert.strictEqual(r.status, "error");
  assert.match(r.error, /unknown resource/);
});

test("book: the marketplace book, one fetch shared by everyone", async () => {
  const f = fakeFetch({ "marketplace-orderbook?book=1": { items: { A: { f: 1 } } } });
  const s = createStore({ fetch: f });
  const [a] = await Promise.all([s.get({ res: "book" }), s.get({ res: "book" })]);
  assert.deepStrictEqual(a.data, { items: { A: { f: 1 } } });
  assert.strictEqual(f.calls.length, 1);
});

// ── instant first paint: the last good result of a persisted resource survives a reload ──
function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const RES = {
  kept: { ttl: 60_000, persist: true, load: (_, { json }) => json("/kept") },
  plain: { ttl: 60_000, load: (_, { json }) => json("/plain") },
};

test("persist: a fresh result of a persisted resource is saved; others are not", async () => {
  const st = memStorage();
  const s = createStore({ fetch: fakeFetch({ "/kept": { v: 1 }, "/plain": { v: 2 } }), resources: RES, persist: st, now: () => 1000 });
  await s.get({ res: "kept", farm: 1 });
  await s.get({ res: "plain", farm: 1 });
  const keys = [...st.m.keys()];
  assert.deepStrictEqual(keys, ["sfl_wcache:" + keyOf({ res: "kept", farm: 1 })]);
  assert.deepStrictEqual(JSON.parse(st.m.get(keys[0])), { asOf: 1000, data: { v: 1 } });
});

test("persist: after a reload peek shows the saved result at once (with its age), get refreshes it", async () => {
  const st = memStorage({ ["sfl_wcache:" + keyOf({ res: "kept", farm: 1 })]: JSON.stringify({ asOf: 1000, data: { v: "old" } }) });
  let t = 1000 + 5 * 60_000;
  const f = fakeFetch({ "/kept": { v: "new" } });
  const s = createStore({ fetch: f, resources: RES, persist: st, now: () => t });
  const p = s.peek({ res: "kept", farm: 1 });
  assert.deepStrictEqual([p.status, p.data, p.asOf], ["ok", { v: "old" }, 1000]);
  const r = await s.get({ res: "kept", farm: 1 });
  assert.deepStrictEqual(r.data, { v: "new" });
  assert.strictEqual(f.calls.length, 1);
});

test("persist: a saved result older than 12 h, broken JSON or a full storage never shows or throws", async () => {
  const k = "sfl_wcache:" + keyOf({ res: "kept", farm: 1 });
  const now = 20 * 3600_000;
  const old = createStore({ fetch: fakeFetch({}), resources: RES, persist: memStorage({ [k]: JSON.stringify({ asOf: now - 13 * 3600_000, data: 1 }) }), now: () => now });
  assert.strictEqual(old.peek({ res: "kept", farm: 1 }), null);
  const broken = createStore({ fetch: fakeFetch({}), resources: RES, persist: memStorage({ [k]: "{nope" }), now: () => now });
  assert.strictEqual(broken.peek({ res: "kept", farm: 1 }), null);
  const full = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
  const r = await createStore({ fetch: fakeFetch({ "/kept": { v: 1 } }), resources: RES, persist: full }).get({ res: "kept", farm: 1 });
  assert.strictEqual(r.status, "ok");
});

test("persist: the big shared resources are marked, the raw recorded weeks are not", () => {
  for (const r of ["farm", "leveling", "tickets", "treasury", "book", "flips", "worldAgg", "worldMe"]) assert.strictEqual(RESOURCES[r].persist, true, r);
  assert.ok(!RESOURCES.ticketWeeks.persist);
});

test("persist: entries older than 12 h are removed when the store starts (other keys untouched)", () => {
  const now = 50 * 3600_000;
  const m = new Map([["sfl_wcache:a", JSON.stringify({ asOf: now - 13 * 3600_000, data: 1 })],
    ["sfl_wcache:b", JSON.stringify({ asOf: now - 3600_000, data: 2 })], ["sfl_wcache:c", "{broken"], ["sfl_other", "x"]]);
  const storage = { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  createStore({ fetch: fakeFetch({}), persist: storage, now: () => now });
  assert.deepStrictEqual([...m.keys()].sort(), ["sfl_other", "sfl_wcache:b"]);
});

test("compute: any /api/compute section with its extra query params; the answer's data (pricesOk kept)", async () => {
  const f = fakeFetch({ "/api/compute": (url) => ({ data: { url }, pricesOk: true }) });
  const s = createStore({ fetch: f });
  const r = await s.get({ res: "compute", farm: "7", section: "power", q: { product: "Iron", n: 2 } });
  assert.strictEqual(r.status, "ok");
  assert.match(r.data.url, /\/api\/compute\?farm=7&section=power&n=2&product=Iron$/);
  assert.strictEqual(r.data.pricesOk, true);
  // no section → an error, never a fetch of the whole compute
  const bad = await s.get({ res: "compute", farm: "7" });
  assert.strictEqual(bad.status, "error");
});

test("compute retries a flaky upstream twice before it reports the error", async () => {
  let n = 0;
  const f = async () => { n++; return n < 3 ? { ok: false, status: 502, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ data: { v: 1 } }) }; };
  const s = createStore({ fetch: f });
  const r = await s.get({ res: "compute", farm: "7", section: "cooking" });
  assert.deepStrictEqual([r.status, r.data.v, n], ["ok", 1, 3]);
});

test("computeHist: POSTs the 7-day _h.* history (with weeks the ticket weeks too); POWER's GET when there is nothing", async () => {
  const hist = { snapshots: [{ captured_at: "t1", diff: { "_h.crops": 3, "inventory.Wood": 1 } }] };
  const f = fakeFetch({ "/api/farm-history?farm=": hist, "type=ticket-weeks": { weeks: [{ w: 1 }] },
    "/api/compute": (url, init) => ({ data: { url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null }, pricesOk: false }) });
  const s = createStore({ fetch: f });
  const a = await s.get({ res: "computeHist", farm: "7", section: "eff" });
  assert.strictEqual(a.data.method, "POST");
  assert.deepStrictEqual(a.data.body, { snapshots: [{ captured_at: "t1", diff: { "_h.crops": 3 } }] });
  assert.strictEqual(a.data.pricesOk, false);
  const p = await s.get({ res: "computeHist", farm: "7", section: "power", q: { products: "{}" }, weeks: true });
  assert.match(p.data.url, /section=power&products=%7B%7D$/);
  assert.deepStrictEqual(p.data.body.weeks, [{ w: 1 }]);
  const g = createStore({ fetch: fakeFetch({ "/api/farm-history": { snapshots: [] }, "type=ticket-weeks": { weeks: [] },
    "/api/compute": (url, init) => ({ data: { method: init.method || "GET" } }) }) });
  assert.strictEqual((await g.get({ res: "computeHist", farm: "7", section: "power", weeks: true })).data.method, "GET");
});
