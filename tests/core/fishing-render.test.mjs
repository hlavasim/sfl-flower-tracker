import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/*
 * The FISHING page has shipped blank twice, and both times the tests were green.
 *
 *   v5.34  renderFishing(data) — the page dispatcher calls it with no argument at that position,
 *          so `data` was undefined and the first property read threw.
 *   v5.35  `fmt is not defined` — the idiom was copied from renderYakkamon, where fmt is a
 *          function-LOCAL const, without copying the definition.
 *
 * Neither is detectable by unit-testing a helper: both are failures of the render function as a
 * whole, in the environment it actually runs in. So this evaluates the page's real inline script
 * against a DOM stub and calls renderFishing() the way the dispatcher does — with no argument —
 * on plausible data. Any throw, or an empty #app, fails here instead of in production.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
const SCRIPT = SRC.slice(SRC.indexOf("<script>") + 8, SRC.lastIndexOf("</script>"));

// A farm mid-Ascension-Age that already owns one Marvel, so the "already caught" path is covered.
const FARM = {
  season: { season: "autumn" },
  bumpkin: { skills: { "Fish Smoking": 1 } },
  sculptures: { "Salt Sculpture": { level: 3 } },
  inventory: { "Gilded Swordfish": "1", Rod: "40" },
};

// Real shape of /api/farm-history?type=fishing: net per-diff deltas, not per-cast events.
const HIST = {
  diffs: 74, rods: 1515, baitTotal: 1080, fishTotal: 1806,
  firstAt: "2026-06-01T00:00:00Z", lastAt: "2026-08-17T00:00:00Z",
  bait: { Earthworm: 700, Grub: 200, "Red Wiggler": 180 },
  fish: {
    Anchovy: 77, "Red Snapper": 208, Tuna: 146, "Mahi Mahi": 52, Crab: 640,
    Halibut: 4, Muskellunge: 10, "Moray Eel": 123, Napoleanfish: 51, Trout: 14,
    "Rock Blackfish": 79, Porgy: 4, "Olive Flounder": 54, "Horse Mackerel": 11, Clownfish: 11,
  },
  treasure: { items: { "Clam Shell": 46, "Old Bottle": 40 }, rods: 516, diffs: 25, total: 86 },
};

const PRICES = {
  marketValue: { Earthworm: 0.008, Grub: 0.02, "Red Wiggler": 0.03, Crimstone: 0.72, "Wild Grass": 0.27 },
  productionCost: { Rod: 0.054, Salt: 0.0039, Carrot: 0.01, Egg: 0.02, Orange: 0.05,
                    "Wild Mushroom": 0.03, Apple: 0.06, Honey: 0.09 },
};
const FLOORS = { values: [
  { field: "floor", nft_name: "Rich Chicken", value: 25 },
  { field: "floor", nft_name: "Speed Chicken", value: 16.59 },
  { field: "floor", nft_name: "Fat Chicken", value: 21.9 },
] };

function renderPage() {
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
    sessionStorage: {
      getItem: () => null, setItem() {}, removeItem() {},
    },
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
  win.localStorage = win.localStorage;

  /*
   * The page is one long inline script that also runs start-up code (event wiring, first render).
   * That start-up is allowed to fail — it needs a browser. What must NOT fail is renderFishing,
   * so the script is evaluated for its declarations and the render is invoked explicitly.
   */
  const run = new Function(
    "window", "document", "localStorage", "sessionStorage", "fetch", "requestAnimationFrame", "setTimeout",
    "setInterval", "clearTimeout", "clearInterval", "location", "history", "navigator", "matchMedia",
    `${SCRIPT}
     return {
       render: typeof renderFishing === "function" ? renderFishing : null,
       setState: (hist, prices, farm) => {
         _fishData = hist; _fishFarm = farm; _fishErr = null; _fishLoading = true;
         const pd = prices || {};
         _fishPrices = Object.assign({}, pd.productionCost || {}, pd.marketValue || {});
         for (const v of (${JSON.stringify(FLOORS)}.values || [])) _fishPrices[v.nft_name] = v.value;
       },
       setPieces: (m, n) => window._fishSetPieces(m, n),
       getPage: typeof getPage === "function" ? getPage : null,
     };`
  );

  const api = run(
    win, doc, win.localStorage, win.sessionStorage, win.fetch, win.requestAnimationFrame, win.setTimeout,
    win.setInterval, win.clearTimeout, win.clearInterval, win.location, win.history,
    win.navigator, win.matchMedia
  );
  assert.ok(api.render, "renderFishing is declared in flowers.html");
  api.setState(HIST, PRICES, FARM);
  api.render();                       // exactly how the dispatcher calls it: no argument
  return { html: app.innerHTML, api, app };
}

test("the FISHING page renders without an argument and without throwing", () => {
  const { html } = renderPage();
  assert.ok(html.length > 2000, `page produced ${html.length} chars of HTML`);
  assert.ok(!/undefined|NaN|Infinity/.test(html.replace(/undefined-/g, "")),
    "no undefined/NaN/Infinity leaked into the rendered page");
});

test("every section is present, including the ones that replaced the wrong model", () => {
  const { html } = renderPage();
  for (const marker of [
    "WHAT FISHING HAS ACTUALLY COST YOU",
    "WHAT EACH FISH COST YOU",
    "GUARANTEED CATCH",
    "FISH MARKET BAIT",
    "MARINE MARVEL PLANNER",
    "TREASURE",
  ]) assert.ok(html.includes(marker), `section present: ${marker}`);
  // The v5.37 model is gone, not merely hidden.
  assert.ok(!html.includes("a guaranteed TIER"), "the tier-average chum model is removed");
  assert.ok(!html.includes("Deep Sea Pig") && !html.includes("Crystal Shrimp"),
    "Salt Awakening marvels are not offered — that chapter is over");
});

test("the current chapter's marvels are listed and owned ones are retired", () => {
  const { html } = renderPage();
  for (const m of ["Crocodile", "Dumbo Octopus", "Seahorse Dad", "Radiant Ray", "Starlight Tuna"])
    assert.ok(html.includes(m), `Ascension Age / permanent marvel listed: ${m}`);
  // The farm owns a Gilded Swordfish: pieces stop dropping, so it must not be costed.
  const gild = html.slice(html.indexOf("Gilded Swordfish"), html.indexOf("Gilded Swordfish") + 220);
  assert.ok(/already caught/.test(gild), "an owned Marvel is struck out rather than priced");
});

test("bait is priced from its recipe, not from a market value it does not have", () => {
  const { html } = renderPage();
  /*
   * Fish Stick is 6× Red Snapper + 2× Moray Eel + 2× Napoleanfish in autumn. If the page were
   * still reading a p2p price for the bait itself, the ingredient breakdown would be absent and
   * the cost would collapse toward zero — which is exactly how v5.37 got Fish Oil to 0.0169.
   */
  const idx = html.indexOf("Fish Stick");
  assert.ok(idx > 0, "Fish Stick appears");
  const block = html.slice(idx, idx + 900);
  assert.ok(/6×<\/b> Red Snapper|<b>6×<\/b> Red Snapper/.test(block.replace(/&times;/g, "×")),
    "the autumn recipe is expanded into the row");
  assert.ok(/casts each/.test(block), "each ingredient is costed at a measured cast rate");
});

test("the Radiant Ray decision comes out on the side the odds and the bait actually favour", () => {
  const { html } = renderPage();
  /*
   * The user's own worked example, and the reason this planner exists: Trout is 2% and lives in
   * Fish Oil (dear), Hammerhead shark is 5% and lives in Fish Stick (cheap). Both factors point
   * the same way here, so Hammerhead must win — and it must win via Fish Stick, not Fish Oil,
   * which is the pairing that was stated backwards before the game source was read.
   */
  const start = html.indexOf("Radiant Ray");
  assert.ok(start > 0, "Radiant Ray is listed");
  // A card runs ~2.8k with the shopping list expanded; the next Marvel bounds it exactly.
  const block = html.slice(start, html.indexOf("Phantom Barracuda"));
  assert.ok(block.length > 1000 && block.length < 6000, `card is bounded (${block.length} chars)`);
  const hh = block.indexOf("Hammerhead shark");
  const tr = block.indexOf("Trout");
  assert.ok(hh > 0 && tr > 0, "both sources are shown, not just the winner");
  assert.ok(hh < tr, "Hammerhead shark ranks above Trout");
  assert.ok(/Hammerhead shark[\s\S]{0,400}Fish Stick/.test(block),
    "Hammerhead is forced with Fish Stick (Fish Oil is Trout's bait, not its own)");
});

test("a crafted-bait plan reports the casts hiding inside it, not only the price", () => {
  const { html } = renderPage();
  /*
   * 180 Fish Stick prices at ~1,000 FLOWER but contains ~16,000 casts. Reporting only the price
   * makes a year-long plan look like an afternoon, so the cast total is part of the deliverable.
   */
  assert.ok(/casts in total/.test(html), "the winning route reports total casts");
  assert.ok(/days at your \d+\/day/.test(html), "and translates them into days at the measured pace");
});

test("pieces already held reduce the plan, and are clamped to a legal count", () => {
  const { api, app } = renderPage();
  api.setPieces("Radiant Ray", 5);
  const at5 = app.innerHTML;
  assert.ok(/4 to go/.test(at5), "holding 5 pieces leaves 4 to find");
  // 9 pieces is not a holding — it is a caught Marvel — so the input must not accept it.
  api.setPieces("Radiant Ray", 12);
  assert.ok(/1 to go/.test(app.innerHTML), "an out-of-range entry clamps to 8 held / 1 to go");
  api.setPieces("Radiant Ray", -3);
  assert.ok(/9 to go/.test(app.innerHTML), "a negative entry clamps to 0 held / 9 to go");
});

test("fish XP is the aged value, which is what the shed actually pays", () => {
  const { html } = renderPage();
  assert.ok(html.includes("aged XP"), "the table reports aged XP");
  /*
   * Trout is 330 base. The ageing multiplier steps at 200 and 330, so Trout ages at 4× to 1,320
   * before the prime-aged weighting — not 3×, and emphatically not the raw 330. Getting this
   * boundary wrong silently reorders the whole ranking.
   */
  const start = html.indexOf(">Trout<");
  assert.ok(start > 0, "Trout is in the table");
  const row = html.slice(start, start + 500).replace(/,/g, "");
  assert.ok(/\b330\b/.test(row), "raw XP 330 is shown");
  assert.ok(/\b1[34]\d\d\b/.test(row), `aged XP is ~1320-1400 (4x plus prime weighting), got: ${row}`);
});
