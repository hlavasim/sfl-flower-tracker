import "../helpers/page-engine.mjs";
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createStore } from "../../app/store.mjs";
import { createHost } from "../../app/widget-host.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { BOARDS_KEY } from "../../app/boards.mjs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildRoiSection } from "../../core/sections/roi.mjs";
import { buildAscensionSection } from "../../core/sections/ascension.mjs";
import { buildCookingSection } from "../../core/sections/cooking.mjs";

// POWER, NODES, ROI and SHRINES run as the page's real script: each page renders its widgets with
// data through the store, the browser-side helpers (_powerCtx, _shrineRows …) fed real answers.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
const SCRIPT = SRC.slice(SRC.indexOf("<script>") + 8, SRC.lastIndexOf("</script>"));
const FARM = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/farm-155498.json"), "utf8"));
const farm = FARM.farm;
const p2p = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/p2p-prices.json"), "utf8"));
const nfts = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/nfts-sample.json"), "utf8"));
const POWER = JSON.parse(JSON.stringify(buildPowerSection(farm, p2p, nfts, null, {})));
const ROI = JSON.parse(JSON.stringify({ ...buildRoiSection(farm, p2p, nfts, null, 97000, {}), sflUsd: 0.5 }));
const ASC = JSON.parse(JSON.stringify(buildAscensionSection(farm, POWER, buildCookingSection(farm, p2p, { petSimulate: true }).totalXpPerDay, null, { max: 10 })));
const EFF = { effByCat: { crops: { measured: true, ratio: 0.5 } }, meanRatio: 0.8 };

function answer(url) {
  if (url.includes("/api/proxy")) return FARM;
  if (url.includes("type=ticket-weeks")) return { weeks: [] };
  if (url.includes("/api/farm-history")) return { snapshots: [] };
  const sec = (url.match(/section=([a-z]+)/) || [])[1];
  if (sec === "power") return { data: POWER };
  if (sec === "roi") return { data: ROI };
  if (sec === "ascension") return { data: ASC };
  if (sec === "eff") return { data: EFF };
  return null;
}

async function renderPage(page, extra = {}) {
  const mem = new Map([["sfl_config", JSON.stringify({ farm: "155498" })], ...Object.entries(extra)]);
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const calls = [];
  globalThis.__store = createStore({ fetch: (url, init = {}) => {
    calls.push({ url, method: init.method || "GET" });
    const a = answer(url);
    return Promise.resolve(a ? { ok: true, status: 200, json: async () => a } : { ok: false, status: 503, json: async () => ({}) });
  } });
  globalThis.__widgets = createHost({ registry: WIDGETS, storage });
  const stub = () => ({ innerHTML: "", style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, addEventListener() {}, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [], dataset: {}, scrollIntoView() {} });
  const els = { app: stub() };
  const doc = { getElementById: (id) => els[id] || (els[id] = stub()), querySelector: () => null, querySelectorAll: () => [],
    createElement: stub, addEventListener() {}, removeEventListener() {}, body: stub(), documentElement: stub(), head: stub(), readyState: "complete", cookie: "" };
  const win = { localStorage: storage, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: `https://example.test/?page=${page}`, search: `?page=${page}`, hash: "", pathname: "/", origin: "https://example.test" },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    history: { replaceState() {}, pushState() {} }, navigator: { userAgent: "node" }, console, scrollY: 0, scrollTo() {} };
  win.window = win; win.document = doc;
  const run = new Function("window", "document", "localStorage", "sessionStorage", "fetch", "requestAnimationFrame", "setTimeout",
    "setInterval", "clearTimeout", "clearInterval", "location", "history", "navigator", "matchMedia",
    `${SCRIPT}
     return { renderPower, renderNodes, renderRoi, renderShrines, setFarm: (f) => { FARM_ID = f; }, ps: () => powerState };`);
  const api = run(win, doc, storage, win.sessionStorage, async () => ({ ok: false, status: 503, json: async () => ({}) }),
    () => 0, () => 0, () => 0, () => {}, () => {}, win.location, win.history, win.navigator, win.matchMedia);
  api.setFarm("155498");
  const data = { farm, inventory: farm.inventory };
  if (page === "power") await api.renderPower(data);
  if (page === "nodes") await api.renderNodes(data);
  if (page === "roi") await api.renderRoi(data);
  if (page === "shrines") await api.renderShrines(data);
  return { els, api, calls, storage, win };
}

test("POWER: every panel is a widget frame fed by the store; the page head is the clean one", async () => {
  const { els, api, calls } = await renderPage("power");
  assert.match(els.app.innerHTML, /<div class="w-page-head"><h1>POWER<\/h1>/);
  const html = els["power-content"].innerHTML;
  for (const t of ["power-totals", "power-best-buys", "power-categories", "power-boosts", "power-crop-machine", "power-cm-queue", "power-activity",
    "power-seed-costs", "power-tool-costs", "power-all-boosts"]) assert.match(html, new RegExp(`data-frame="page:${t}"`), t);
  assert.doesNotMatch(html, /class="w-error"/);
  assert.doesNotMatch(html, /Press Start|pixel-font/);
  // the totals are the served categories' numbers
  const c = POWER.categories;
  assert.ok(html.includes(`${c.totalBoostedSfl.toFixed(2)} `));
  // one section=power load (history POSTed only when there is some — here none, so a GET)
  const pw = calls.filter((x) => x.url.includes("section=power"));
  assert.strictEqual(pw.length, 1);
  assert.strictEqual(pw[0].method, "GET");
  // the browser-side helpers ran on the store's answer: the restock queue and the cost tables
  assert.match(html, /restock window/);
  assert.match(html, /Gold Pickaxe/);
  assert.match(html, /⚙️ Restock settings/);
  assert.strictEqual(api.ps().categories.totalBoostedSfl, c.totalBoostedSfl);
});

test("POWER: the boosts widget's category and product carry over once from the old page settings", async () => {
  const { els, storage } = await renderPage("power", { sfl_power_cat: "fruits", sfl_power_products: '{"fruits":"Apple"}' });
  const doc = JSON.parse(storage.getItem(BOARDS_KEY));
  assert.deepStrictEqual(doc.page["power-boosts"].opts, { cat: "fruits", product: "Apple" });
  assert.match(els["power-content"].innerHTML, /🍎 FRUITS boosts – Apple/);
});

test("NODES: the widgets on section=ascension; the old ROI cap seeds the plan", async () => {
  const { els, storage } = await renderPage("nodes", { sfl_nodes_roi_cap: "all" });
  const html = els.app.innerHTML;
  assert.match(html, /<h1>NODES<\/h1>/);
  for (const t of ["nodes-summary", "nodes-acq", "nodes-plan", "nodes-road", "nodes-current"]) assert.match(html, new RegExp(`data-frame="page:${t}"`), t);
  assert.strictEqual(JSON.parse(storage.getItem(BOARDS_KEY)).page["nodes-plan"].opts.cap, "all");
  assert.match(html, /📋 Node plan – any ROI/);
  assert.doesNotMatch(html, /nodesSetRoiCap|[ěščřžůň]|class="w-error"/);
});

test("ROI: the sell-or-farm and passive widgets; logins and currency carried over as the copy's options", async () => {
  const { els, storage } = await renderPage("roi", { sfl_roi_logins_per_day: "3", sfl_roi_currency: "usd" });
  const html = els["roi-content"].innerHTML;
  assert.match(html, /data-frame="page:roi-sell-or-farm"/);
  assert.match(html, /data-frame="page:roi-passive"/);
  assert.match(html, /Sell or farm\? – 3× a day/);
  assert.deepStrictEqual(JSON.parse(storage.getItem(BOARDS_KEY)).page["roi-sell-or-farm"].opts, { logins: "3", currency: "usd" });
  assert.doesNotMatch(html, /_roiSetLogins|_roiSetCurrency|class="w-error"/);
});

test("SHRINES: every shrine valued by the page's _shrineRows on section=power + section=eff", async () => {
  const { els, calls } = await renderPage("shrines");
  const html = els["shrines-content"].innerHTML;
  assert.match(html, /data-frame="page:shrines-roi"/);
  assert.match(html, /Bear Shrine/);
  assert.match(html, /per Acorn/);
  assert.ok(calls.some((x) => x.url.includes("section=eff") && x.method === "POST"));
  assert.ok(calls.some((x) => /section=power$/.test(x.url)));
  assert.doesNotMatch(html, /class="w-error"|Data z Power|S boostem/);
});
