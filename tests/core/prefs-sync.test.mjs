import "../helpers/page-engine.mjs";
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/*
 * Ticks and picks shared between devices (farm_prefs). The whole page script runs against stubs,
 * like diff-page-valuation.test.mjs: the shared copy must win over this browser, keys the server
 * does not have yet are seeded from here, device-only keys never leave, and the settings the page
 * caches in memory (roadmap picks, coin mode) follow the pulled values.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
const SCRIPT = SRC.slice(SRC.indexOf("<script>") + 8, SRC.lastIndexOf("</script>"));

function page(store, server, opts = {}) {
  const posts = [], inits = [], listeners = {};
  const stubEl = (id) => ({
    id: id || "", innerHTML: "", textContent: "", className: "", style: { cssText: "" },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, insertBefore() {}, addEventListener() {}, setAttribute() {},
    removeAttribute() {}, focus() {}, scrollIntoView() {}, querySelector: () => null, querySelectorAll: () => [],
    children: [], dataset: {}, value: "",
  });
  const doc = {
    getElementById: (id) => stubEl(id), querySelector: () => null, querySelectorAll: () => [], createElement: () => stubEl(),
    addEventListener() {}, removeEventListener() {}, body: stubEl(), documentElement: stubEl(), head: stubEl(),
    readyState: "complete", cookie: "", activeElement: null,
  };
  const json = (o, status = 200) => ({ ok: status < 400, status, statusText: "x", json: async () => o });
  const fetchStub = async (url, init) => {
    const u = String(url);
    if (u.includes("type=prefs")) {
      if (init && init.method === "POST") {
        inits.push(init);
        if (opts.failPosts && opts.failPosts.n > 0) { opts.failPosts.n--; return json({ error: "down" }, 500); }
        posts.push(JSON.parse(init.body).prefs); return json({ ok: true });
      }
      return json({ prefs: server });
    }
    return json({});
  };
  // A real Storage class, so the page's Storage.prototype hook (what mirrors changes) runs here too.
  globalThis.Storage = class Storage {
    getItem(k) { return k in store ? store[k] : null; }
    setItem(k, v) { store[k] = String(v); }
    removeItem(k) { delete store[k]; }
  };
  const win = {
    localStorage: new globalThis.Storage(),
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "https://x.test/?page=hub", search: "?page=hub", hash: "", pathname: "/", origin: "https://x.test" },
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); }, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: () => 0, setTimeout: (f) => { if (typeof f === "function") f(); return 0; },
    setInterval: () => 0, clearTimeout() {}, clearInterval() {},
    history: { replaceState() {}, pushState() {} }, navigator: { userAgent: "node" },
    fetch: fetchStub, console: { log() {}, warn() {}, error() {} },
  };
  win.window = win; win.document = doc;
  const run = new Function("window", "document", "localStorage", "sessionStorage", "fetch", "requestAnimationFrame",
    "setTimeout", "setInterval", "clearTimeout", "clearInterval", "location", "history", "navigator", "matchMedia", "console",
    `${SCRIPT}
     main = function () {};
     return { pull: _prefPull, picks: () => [..._rmPicks], coin: () => treasuryCoinMode,
       set: (k, v) => localStorage.setItem(k, v), remove: (k) => localStorage.removeItem(k), pending: () => ({ ..._prefPending }) };`);
  const api = run(win, doc, win.localStorage, win.sessionStorage, win.fetch, win.requestAnimationFrame, win.setTimeout,
    win.setInterval, win.clearTimeout, win.clearInterval, win.location, win.history, win.navigator, win.matchMedia, win.console);
  return { ...api, posts, inits, listeners, store };
}

test("the shared copy wins, missing keys are seeded, device-only keys stay local", async () => {
  const store = { sfl_farm_id: "155498", sfl_coin_mode: "betty", sfl_rm_picks: "[]", sfl_marks_budget: "0.05", sfl_zoom: "2" };
  const p = page(store, { sfl_coin_mode: "api", sfl_rm_picks: '["Chicken Coop"]' });
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));   // the page's own pull at load
  assert.equal(store.sfl_coin_mode, "api", "server value written into this browser");
  assert.deepEqual(p.picks(), ["Chicken Coop"], "the in-memory roadmap picks follow");
  assert.equal(p.coin(), "api", "the in-memory coin mode follows");
  const sent = Object.assign({}, ...p.posts);
  assert.equal(sent.sfl_marks_budget, "0.05", "a key the server lacks is seeded from this device");
  assert.ok(!("sfl_zoom" in sent) && !("sfl_farm_id" in sent), "device-only keys are never sent");
  assert.ok(!("sfl_coin_mode" in sent), "a pulled value is not echoed back");
});

test("nothing to change: no re-render signal", async () => {
  const store = { sfl_farm_id: "155498", sfl_coin_mode: "api" };
  const p = page(store, { sfl_coin_mode: "api" });
  assert.equal(await p.pull(), false);
});

const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

test("a key deleted on another device stays deleted: the server tombstone removes it here, nothing re-seeds it", async () => {
  const store = { sfl_farm_id: "155498", sfl_marks_budget: "0.05" };
  const p = page(store, { sfl_marks_budget: "__sfl_deleted__" });
  await settle();
  assert.ok(!("sfl_marks_budget" in store), "removed from this browser");
  assert.ok(!p.posts.some((x) => "sfl_marks_budget" in x), "not seeded back");
});

test("removing a key sends a delete (null) that the server keeps as a tombstone", async () => {
  const store = { sfl_farm_id: "155498", sfl_marks_budget: "0.05" };
  const p = page(store, { sfl_marks_budget: "0.05" });
  await settle();
  p.remove("sfl_marks_budget");
  await settle();
  assert.ok(p.posts.some((x) => x.sfl_marks_budget === null));
});

test("a failed push is kept in an outbox and sent again; a change not yet sent is not overwritten by a pull", async () => {
  const store = { sfl_farm_id: "155498", sfl_coin_mode: "api" };
  const fail = { n: 1 };
  const p = page(store, { sfl_coin_mode: "api" }, { failPosts: fail });
  await settle();
  p.set("sfl_coin_mode", "betty");
  await settle();
  assert.ok(p.posts.some((x) => x.sfl_coin_mode === "betty"), "retried after the failure");
  assert.deepEqual(p.pending(), {}, "outbox empty once the server took it");
  // unsent local change wins over the server's copy
  const store2 = { sfl_farm_id: "155498", sfl_coin_mode: "betty", sfl_pref_outbox: JSON.stringify({ sfl_coin_mode: "betty" }) };
  const q = page(store2, { sfl_coin_mode: "api" }, { failPosts: { n: 99 } });
  await settle();
  assert.equal(store2.sfl_coin_mode, "betty", "the pull did not overwrite the change still waiting to be sent");
});

test("closing the tab flushes the outbox with keepalive", async () => {
  const store = { sfl_farm_id: "155498", sfl_coin_mode: "api" };
  const p = page(store, { sfl_coin_mode: "api" }, { failPosts: { n: 99 } });
  await settle();
  p.set("sfl_coin_mode", "betty");
  await settle();
  const n = p.inits.length;
  for (const f of p.listeners.pagehide || []) f();
  assert.ok(p.inits.length > n && p.inits[p.inits.length - 1].keepalive === true);
});
