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
  fishing: { dailyAttempts: { "2026-08-17": 55 } },
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

function renderPage(farmOverride) {
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
  api.setState(HIST, PRICES, farmOverride || FARM);
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
  // Ingredients are costed from the community dump, naming the bait and the sample behind it.
  assert.ok(/casts on (Earthworm|Grub|Red Wiggler|Fishing Lure)/.test(block),
    "each ingredient is costed at a community rate, and says on which bait");
  assert.ok(/n=[\d,]+/.test(block), "and carries the sample size that rate rests on");
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
  // Each source's own bait must sit under that source: Fish Stick forces the Hammerhead,
  // Fish Oil forces the Trout. Stating that pairing backwards is what sent an earlier cut of
  // this page down the wrong route entirely.
  const hhBlock = block.slice(hh, tr);
  assert.ok(/Fish Stick/.test(hhBlock), "Hammerhead is forced with Fish Stick");
  assert.ok(!/Fish Oil/.test(hhBlock), "and not with Fish Oil, which belongs to Trout");
  assert.ok(/Fish Oil/.test(block.slice(tr)), "Trout is forced with Fish Oil");
});

test("a crafted-bait plan reports the casts hiding inside it, not only the price", () => {
  const { html } = renderPage();
  /*
   * 180 Fish Stick prices at ~1,000 FLOWER but contains ~16,000 casts. Reporting only the price
   * makes a year-long plan look like an afternoon, so the cast total is part of the deliverable.
   */
  assert.ok(/⏱ [\d,]+ casts/.test(html), "each route reports its total casts");
  // Both paces, because the long-run average alone (mostly idle days) reads as absurd.
  assert.ok(/days fishing daily at \d+/.test(html), "days at the active pace");
  assert.ok(/at your long-run \d+\/day/.test(html), "and at the long-run average, labelled as such");
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

/*
 * The winter regression, reported from the live page.
 *
 * Winter's Fish Stick is 6× Red Snapper + 2× Walleye + 2× Angelfish, and this farm has never
 * landed an Angelfish. Its cost came out Infinity, the bait was marked incomplete, and every use
 * of it silently disappeared — so the planner said Hammerhead shark had "no bait forces it", for
 * a fish one Fish Stick catches on demand, and routed Radiant Ray through a 2% Trout at three
 * times the price. The count of baits needed comes from the drop odds alone and never depended
 * on the price, so an unpriceable ingredient must never delete a route.
 */
const WINTER_FARM = {
  season: { season: "winter" },
  bumpkin: { skills: {} },
  sculptures: {},
  inventory: { Rod: "40" },      // owns no Marvel: every one must be planned
  fishing: { dailyAttempts: { "2026-08-17": 55 } },
};

test("a never-caught ingredient does not delete the route that depends on it", () => {
  const { html } = renderPage(WINTER_FARM);
  const start = html.indexOf("Radiant Ray");
  const block = html.slice(start, html.indexOf("Phantom Barracuda"));
  assert.ok(/Hammerhead shark/.test(block), "Hammerhead shark is still listed as a source");
  assert.ok(!/no route at all/.test(block),
    "neither source is written off — Fish Stick forces the Hammerhead even in winter");
  assert.ok(/Fish Stick/.test(block), "the winter Fish Stick route is offered");
  // Winter's Fish Stick needs Angelfish, which this farm has never caught. The community dump
  // supplies its rate, so the route is priced from evidence rather than dropped or guessed.
  assert.ok(/Angelfish/.test(block), "the ingredient this farm has never caught is still named");
  // Match on text, not markup: an inline style like var(--text-dim) carries its own
  // parentheses, which a naive character class walks straight into.
  const plain = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.ok(/Angelfish \([\d,]+ casts\)/.test(plain),
    `and carries a real cast figure: ${(plain.match(/Angelfish[^+]{0,40}/) || ["?"])[0]}`);
});

test("an out-of-season source keeps its bait route and is labelled, not silently costed", () => {
  const { html } = renderPage(WINTER_FARM);
  /*
   * Trout is winter-only and Hammerhead shark is summer/autumn, so in winter exactly one of
   * Radiant Ray's two sources can be fished for. The other is reachable only through a crafted
   * bait, which ignores the season gate -- confirmed in game. Costing an out-of-season fish as
   * though you could go and catch it is the failure this pins.
   */
  const start = html.indexOf("Radiant Ray");
  const block = html.slice(start, html.indexOf("Phantom Barracuda"));
  assert.ok(/out of season \(summer\/autumn\)/.test(block),
    "Hammerhead shark is marked out of season in winter");
  assert.ok(/bait only/.test(block), "and its only remaining route is named as bait-only");
  // Trout IS in season in winter, so it must offer a plain fishing route.
  const troutBlock = block.slice(block.indexOf("Trout"));
  assert.ok(/fishing normally/.test(block.slice(0, block.indexOf("Hammerhead")) + troutBlock),
    "the in-season source can still simply be fished for");
});

test("Dumbo Octopus is reachable in winter only through a crafted bait", () => {
  const { html } = renderPage(WINTER_FARM);
  /*
   * Both its sources -- Olive Flounder (spring/autumn) and Napoleanfish (summer/autumn) -- are
   * shut in winter. Before the season gate the planner costed them as ordinary fishing; before
   * crafted baits were allowed to ignore the gate it would have called the Marvel impossible.
   * Neither is right: it is reachable, but only by crafting.
   */
  const start = html.indexOf("Dumbo Octopus");
  assert.ok(start > 0, "Dumbo Octopus is listed");
  const block = html.slice(start, html.indexOf("Seahorse Dad"));
  assert.ok(!/fishing normally/.test(block), "neither source can be fished for in winter");
  assert.ok(/out of season/.test(block), "both sources are marked out of season");
  assert.ok(/Fish Flake/.test(block), "and a crafted-bait route is still offered");
});

test("every Fish Market bait that can force a fish is shown, not only the cheapest", () => {
  const { html } = renderPage(WINTER_FARM);
  /*
   * Barred Knifejaw is listed by BOTH Fish Oil and Crab Stick, and which is cheaper flips with
   * the season. Showing one hides a real option, so the planner prints all of them.
   */
  const start = html.indexOf("Radiant Ray");
  const block = html.slice(start, html.indexOf("Phantom Barracuda"));
  // Trout is forced only by Fish Oil, Hammerhead only by Fish Stick — both must appear, and so
  // must the random route for Trout, which the farm HAS caught.
  assert.ok(/Fish Oil/.test(block), "Trout's Fish Oil route is shown");
  assert.ok(/Fish Stick/.test(block), "Hammerhead's Fish Stick route is shown");
  assert.ok(/fishing normally/.test(block), "the random route is shown alongside the forced ones");
});

test("the shopping list is expanded for every bait route, not just the winner", () => {
  const { html } = renderPage(WINTER_FARM);
  const start = html.indexOf("Radiant Ray");
  const block = html.slice(start, html.indexOf("Phantom Barracuda"));
  const lists = block.match(/🧾/g) || [];
  assert.ok(lists.length >= 2, `both bait routes carry a shopping list (found ${lists.length})`);
  assert.ok(/Red Snapper/.test(block), "the Fish Stick list names its ingredients");
});

test("a pot ingredient whose chum is itself a crafted bait is priced, not zeroed", () => {
  const { html } = renderPage(WINTER_FARM);
  /*
   * Winter's Crab Stick needs an Oyster; an Oyster is baited with 2x Fish Stick; Fish Stick has
   * no market price. Reading the chum off the p2p map therefore resolved it to zero and put a
   * whole Marine Marvel at 7 FLOWER. Sea Urchin (2x Fish Stick), Anemone (2x Fish Oil) and
   * Horseshoe Crab (2x Crab Stick) share the shape, so the cost has to recurse into the recipe.
   */
  const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const i = plain.indexOf("Crab Stick");
  assert.ok(i > 0, "Crab Stick appears");
  // The shopping list must carry the sub-recipe: N Oysters is really 2N Fish Stick.
  assert.ok(/Oyster \(pot \+ [\d,]+× Fish Stick\)/.test(plain),
    `the Oyster's own chum is expanded: ${(plain.match(/Oyster[^)]{0,40}\)/) || ["?"])[0]}`);
  /*
   * And it must reach the price. In the FISH MARKET BAIT panel Crab Stick is one line: with the
   * Fish Stick inside the Oyster counted it is several FLOWER, without it a few hundredths.
   */
  const panel = plain.slice(plain.indexOf("FISH MARKET BAIT"), plain.indexOf("MARINE MARVEL"));
  const m = panel.match(/Crab Stick (\d+)h per batch ~?([\d.]+)/);
  assert.ok(m, `Crab Stick is priced in the bait panel: ${panel.slice(0, 200)}`);
  assert.ok(parseFloat(m[2]) > 1,
    `Crab Stick costs more than 1 FLOWER once its Oyster's Fish Stick is counted, got ${m[2]}`);
});
