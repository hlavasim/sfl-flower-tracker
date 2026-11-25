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
