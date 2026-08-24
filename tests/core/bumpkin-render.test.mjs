import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildCookingSection } from "../../core/sections/cooking.mjs";

/*
 * The BUMPKIN page died with `ReferenceError: nextLvlAfterFood is not defined` for every farm
 * whose level-after-food is below 200 with a non-zero ingredient cost/day: 2b68932 removed the
 * `const nextLvlAfterFood = ...` line while making xpToNextFromFood ascension-aware, but left
 * three template usages behind. Farms at level >= 200 short-circuit both guarded branches and
 * never touch the variable — which is why the page kept working on the farm it was developed
 * against while crashing on lower-level farms (found on farm 1260204733777858, level ~186).
 *
 * Same shape as fishing-render.test.mjs: evaluate the page's real inline script against a DOM
 * stub, feed renderBumpkin the same data fetchFarmData builds and a cook payload from the real
 * engine (what /api/compute?section=cooking serves), and fail on any throw.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
const SCRIPT = SRC.slice(SRC.indexOf("<script>") + 8, SRC.lastIndexOf("</script>"));

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const FARM = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));

function renderPage(farm, cookData) {
  const app = { innerHTML: "" };
  const store = {};
  const elements = { app };
  const stubEl = () => ({
    innerHTML: "", textContent: "", style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, addEventListener() {}, setAttribute() {}, removeAttribute() {}, querySelector: () => null,
    querySelectorAll: () => [], getContext: () => null, children: [], dataset: {},
  });
  const doc = {
    getElementById: (id) => (id === "app" ? app : (elements[id] || (elements[id] = stubEl()))),
    querySelector: () => null, querySelectorAll: () => [], createElement: stubEl,
    addEventListener() {}, removeEventListener() {},
    body: stubEl(), documentElement: stubEl(), head: stubEl(),
    readyState: "complete", cookie: "",
  };
  const win = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "https://example.test/", search: "", hash: "", pathname: "/", origin: "https://example.test" },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: () => 0, setTimeout: () => 0, setInterval: () => 0,
    clearTimeout() {}, clearInterval() {}, history: { replaceState() {}, pushState() {} },
    navigator: { userAgent: "node", clipboard: { writeText: async () => {} } },
    fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    console,
  };
  win.window = win;
  win.document = doc;

  const run = new Function(
    "window", "document", "localStorage", "sessionStorage", "fetch", "requestAnimationFrame", "setTimeout",
    "setInterval", "clearTimeout", "clearInterval", "location", "history", "navigator", "matchMedia",
    `${SCRIPT}
     return {
       renderWith: (farm, cookData) => {
         FARM_ID = "155498";
         // The same object fetchFarmData returns, built with the page's own extractors.
         const data = {
           inventory: farm.inventory || {},
           inProgress: extractInProgress(farm),
           petalBlessed: extractPetalBlessed(farm),
           flowerBeds: farm.flowers?.flowerBeds || {},
           craftingBox: farm.craftingBox || null,
           trapSpots: farm.crabTraps?.trapSpots || {},
           activeBoosts: detectFlowerBoosts(farm),
           flowerMultiplier: 1,
           season: farm.season?.season || null,
           bumpkin: farm.bumpkin, buildings: farm.buildings, trades: farm.trades || {}, farm,
         };
         cachedFarmData = data;
         // Prime the cooking cache so the cook-dependent half renders (the crash lived there).
         _bumpkinCooking = { key: _bumpkinCookingQuery(), data: cookData };
         renderBumpkin(data);
       },
     };`
  );

  const api = run(
    win, doc, win.localStorage, win.sessionStorage, win.fetch, win.requestAnimationFrame, win.setTimeout,
    win.setInterval, win.clearTimeout, win.clearInterval, win.location, win.history,
    win.navigator, win.matchMedia
  );
  api.renderWith(farm, cookData);
  return { html: app.innerHTML };
}

test("the BUMPKIN page renders a below-200 farm with priced cooking without throwing", () => {
  const cook = buildCookingSection(FARM, p2p, { savedRecipes: {}, petSimulate: false });
  const { html } = renderPage(FARM, cook);
  // The crash only reproduces when the guarded branches actually render — pin that they did.
  assert.ok(html.includes("ALL BUILDINGS COMBINED"), "summary section rendered");
  assert.ok(html.includes("INGREDIENT COST (P2P)"), "cost section rendered (totalCostPerDay > 0)");
  assert.ok(/To level \d+/.test(html), "the cost-to-next-level row names the next level");
  assert.ok(html.includes("Cost per level ("), "the collapsible cost-per-level table rendered");
  assert.ok(!/undefined|NaN/.test(html.replace(/undefined-/g, "")),
    "no undefined/NaN leaked into the rendered page");
});
