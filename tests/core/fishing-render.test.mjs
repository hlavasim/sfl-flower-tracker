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

function renderPage(farmOverride, sharedStore) {
  const app = { innerHTML: "" };
  // A caller-supplied store is the same browser localStorage surviving a reload.
  const store = sharedStore || {};
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
       plan: (k, on) => window._fishPlanToggle(k, on),
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


test("piece counts and ticked routes survive a reload", () => {
  /*
   * Both live in localStorage under sfl_fishing_ui, so a reload must bring them back. Asserting
   * that the setter mutated a variable would prove nothing -- the page is rebuilt from storage on
   * every load, so the test rebuilds it too, against the same store.
   */
  const store = {};
  const first = renderPage(WINTER_FARM, store);
  first.api.setPieces("Radiant Ray", 4);
  first.api.plan("Radiant Ray|Trout|random:fish normally", true);
  assert.ok(/5 to go/.test(first.app.innerHTML), "the entry takes effect immediately");

  const reloaded = renderPage(WINTER_FARM, store);   // fresh page, same browser storage
  assert.ok(/5 to go/.test(reloaded.html), "the piece count came back after the reload");
  const order = reloaded.html.slice(reloaded.html.indexOf("YOUR ORDER"));
  assert.ok(/Radiant Ray/.test(order) && /via Trout/.test(order),
    "and so did the ticked route, still in the order");
  assert.ok(/checked/.test(reloaded.html), "its checkbox is drawn ticked");

  const clean = renderPage(WINTER_FARM);             // a different browser: nothing carried over
  assert.ok(/9 to go/.test(clean.html), "an unrelated session is unaffected");
  assert.ok(/Nothing ticked yet/.test(clean.html), "and starts with an empty order");
});

test("the order sums shared ingredients once and recurses through sub-recipes", () => {
  /*
   * 43x Crab Stick hides 86x Fish Stick inside its Oysters, and those hide 516 Red Snapper. A
   * list that stopped at the Oyster read 73 casts for what is really 3,535 -- an afternoon
   * against two months -- so the rollup has to go all the way down, and the planner's own route
   * line has to agree with it.
   */
  const store = {};
  const page = renderPage(WINTER_FARM, store);
  page.api.plan("Twilight Anglerfish|Parrotfish|bait:Crab Stick", true);
  const plain = page.app.innerHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const order = plain.slice(plain.indexOf("YOUR ORDER"));
  for (const line of ["Fish Stick 86", "Red Snapper 516", "Oyster 43"])
    assert.ok(new RegExp(line).test(order), `the rollup reaches ${line}: ${order.slice(0, 400)}`);
  // Craft time counts the sub-recipe too: 86x2h + 43x4h.
  assert.ok(/CRAFTING 344 h/.test(order), `craft hours include the nested bait: ${order.slice(0, 300)}`);
  // And the planner's route line quotes the same cast total as the order.
  const m = order.match(/TOTAL CASTS ([\d,]+)/);
  assert.ok(m, "the order reports total casts");
  assert.ok(new RegExp(m[1].replace(/,/g, ",") + " casts").test(plain),
    `the planner route line quotes the same total (${m[1]})`);
});

test("every bait is priced in all four seasons, with the stock it already covers", () => {
  const { html } = renderPage(WINTER_FARM);
  const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const panel = plain.slice(plain.indexOf("FISH MARKET BAIT"), plain.indexOf("MARINE MARVEL"));
  /*
   * A recipe changes with the season and its cost with it, so "what does this bait cost" has four
   * answers and only one of them is today's. Waiting for a cheaper season is a real decision and
   * it cannot be made from a single number.
   */
  for (const sn of ["winter", "spring", "summer", "autumn"])
    assert.ok(new RegExp(sn).test(panel), `${sn} is priced`);
  assert.ok(/winter · now/.test(panel), "the live season is marked");
  assert.ok(/can make \d+/.test(panel), "each season says how many the current stock covers");
  // Autumn's Fish Stick is Moray Eel + Napoleanfish; winter's is Walleye + Angelfish.
  assert.ok(/6× Red Snapper \+ 2× Moray Eel \+ 2× Napoleanfish/.test(panel),
    "the other seasons' recipes are shown, not just today's");
});

test("a season priced off unknown ingredients is a floor, and cannot win", () => {
  const { html } = renderPage(WINTER_FARM);
  const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const panel = plain.slice(plain.indexOf("FISH MARKET BAIT"), plain.indexOf("MARINE MARVEL"));
  /*
   * Summer's Crab Stick is baited with Moonfur and Chewed Bone, neither of which the value engine
   * prices. Treating a missing price as zero made summer read 0.11 against winter's 5.51 and would
   * have sent the player off to wait three months on a number nobody measured.
   */
  const i = panel.indexOf("Crab Stick");
  const block = panel.slice(i, i + 700);
  assert.ok(/≥/.test(block), "an incompletely priced season is marked as a floor");
  assert.ok(/no price for/.test(block), "and names the ingredient it could not price");
  assert.ok(/no price for Moonfur, Chewed Bone|no price for Chewed Bone, Moonfur/.test(block),
    `summer's unpriced chum is named: ${block.slice(0, 300)}`);
  // The cheapest-season highlight is green; only a fully priced season may carry it. Autumn is
  // the sole complete one for Crab Stick, so summer's ≥0.11 must not be the winner.
  const html2 = html.slice(html.indexOf("Crab Stick"));
  const summerTile = html2.slice(html2.indexOf(">summer<"), html2.indexOf(">summer<") + 400);
  assert.ok(!/var\(--green\)[^<]*>≥/.test(summerTile),
    "the unpriced summer figure is not crowned cheapest");
});

/*
 * SAFE TO AGE — the fish no bait recipe wants.
 *
 * The question is not "what is agable" but "what can I age without having to fish it again",
 * and that is decided by SIXTEEN season-specific ingredient lists. It is ONE table: the fish no
 * recipe wants in any season, then a divider, then every other fish the shed takes with the bait
 * and season that wants it. Four things can go wrong quietly, so each is pinned below:
 *   1. a fish a recipe eats drifts above the divider (you age away your own bait);
 *   2. the stock reads 0 because the inventory spells it "Hammerhead shark" and the XP table
 *      spells it "Hammerhead Shark";
 *   3. the three sharks fall out of the universe entirely — they were missing from
 *      FISH_BASE_XP, and they are the biggest XP the shed pays;
 *   4. the ageing time ignores the shed's own boosts, which is a 17% error on the backlog.
 */
const AGING_FARM = {
  season: { season: "winter" },
  bumpkin: { skills: { "Fish Smoking": 1 } },
  sculptures: { "Salt Sculpture": { level: 3 } },     // >=2 (+4% prime), <5 (no time boost)
  agingShed: { level: 4, racks: { aging: [{ fish: "Trout" }, { fish: "Trout" }] } },
  inventory: {
    "Rock Blackfish": "10",       // free: on no recipe, in any season
    "Hammerhead shark": "2",      // free, and spelled the GAME's way
    "White Shark": "1",           // free, and the biggest XP in the game
    Halibut: "5",                 // autumn's Fish Flake only
    Angelfish: "4",               // winter's Fish Stick — wanted right now
    Salt: "100",                  // deliberately far short of what the stock needs
    Rod: "40",
  },
  fishing: { dailyAttempts: { "2026-08-17": 55 } },
};

// The whole section is one panel, and the divider splits its single table in two.
const agingPanel = (html) => {
  const from = html.indexOf("SAFE TO AGE");
  const to = html.indexOf("MARINE MARVEL PLANNER");
  assert.ok(from > 0 && to > from, "the aging panel is present, before the planner");
  const panel = html.slice(from, to);
  const cut = panel.indexOf("A RECIPE WANTS THESE");
  assert.ok(cut > 0, "the panel carries the divider row");
  assert.ok(!panel.includes("FREE THIS SEASON"), "there is no second, season-scoped answer");
  return { panel, free: panel.slice(0, cut), taken: panel.slice(cut) };
};

test("above the divider is exactly the fish no Fish Market recipe wants, in any season", () => {
  const { free, taken } = agingPanel(renderPage(AGING_FARM).html);
  // 9 fish are on none of the sixteen lists, plus the 3 sharks that no bait recipe touches.
  for (const f of ["Rock Blackfish", "Hammerhead Shark", "Parrotfish", "White Shark",
                   "Horse Mackerel", "Saw Shark", "Whale Shark", "Trout", "Coelacanth",
                   "Ray", "Squid", "Barred Knifejaw"])
    assert.ok(free.includes(">" + f + "<"), `free to age: ${f}`);
  assert.equal((free.match(/border-top:1px solid #20190f/g) || []).length, 12,
    "exactly 12 rows above the line — no more, no fewer");
  /*
   * The failure that matters: ageing a fish a recipe eats. Anchovy, Red Snapper and Tuna are in
   * every season's list; Angelfish, Walleye, Blue Marlin and Football Fish are in winter's;
   * Halibut is autumn-only, which is still a recipe and so still below the line.
   */
  for (const f of ["Anchovy", "Red Snapper", "Tuna", "Angelfish", "Walleye", "Blue Marlin", "Halibut"]) {
    assert.ok(!free.includes(">" + f + "<"), `${f} is bait, not XP — it must not be above the line`);
    assert.ok(taken.includes(">" + f + "<"), `${f} is still listed, below the line`);
  }
  // Complete: every fish the shed takes is in the one table.
  const rows = (agingPanel(renderPage(AGING_FARM).html).panel.match(/border-top:1px solid #20190f/g) || []).length;
  assert.equal(rows, 38, `all 38 agable fish are in the table, got ${rows}`);
});

test("stock is the live inventory, matched through the game's own spelling", () => {
  const { panel, free, taken } = agingPanel(renderPage(AGING_FARM).html);
  /*
   * The inventory says "Hammerhead shark" and "Football fish"; FISH_BASE_XP says "Hammerhead
   * Shark" and "Football Fish". A case-sensitive lookup reads every one of those as zero held —
   * and zero held is indistinguishable from "nothing to process", which is the whole answer.
   */
  const hh = free.slice(free.indexOf(">Hammerhead Shark<"));
  assert.ok(/>2</.test(hh.slice(0, 400)), "the 2 Hammerheads in the inventory are counted");
  // And its icon comes from the game's spelling, which is the one the icon map holds.
  assert.ok(panel.includes('alt="Hammerhead shark"'), "the icon resolves via the game's spelling");
  assert.ok(/<img [^>]*alt="Rock Blackfish"/.test(free), "every row carries its fish icon");
  // Below the line reads the same inventory.
  assert.ok(taken.slice(taken.indexOf(">Halibut<"), taken.indexOf(">Halibut<") + 400).includes(">5<"),
    "the 5 Halibut are counted below the line too");
});

test("the totals are the free stock, its XP, and the salt it would burn", () => {
  const { panel } = agingPanel(renderPage(AGING_FARM).html);
  /*
   * Independently derived, not read back off the page. Prime chance is 24% (Fish Smoking x2,
   * Salt Sculpture L2+ +4) so the factor is 1.072:
   *   Rock Blackfish 10 x maxXP(320)=1280   -> 13,721.6 XP, 26 salt each = 260
   *   White Shark     1 x maxXP(2000)=10000 -> 10,720   XP, 200 salt     = 200
   *   Hammerhead      2 x maxXP(750)=3750   ->  8,040   XP, 75 salt each = 150
   *   13 fish, 32,482 XP, 610 salt against 100 held.
   */
  assert.ok(panel.includes(">13<"), "13 fish are free to age");
  assert.ok(panel.includes(">32,482<"), "and they carry 32,482 aged XP");
  assert.ok(panel.includes(">610<") && panel.includes("you hold 100"), "610 salt against 100 held");
  assert.ok(/short by 510/.test(panel), "and salt, not fish, is named as the binding input");
  assert.ok(panel.includes(">2 / 4<"), "the rack reports busy slots against the shed's level");
  /*
   * The tiles are the FREE stock; the whole-table total is stated separately, never conflated.
   * On top of the free 32,481.6 XP / 610 salt: Halibut 5 x 943.36 = 4,716.8 (18 salt each = 90)
   * and Angelfish 4 x 1,072 = 4,288 (20 each = 80) -> 22 fish, 41,486 XP, 780 salt.
   */
  const plain = panel.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.ok(/both sides of the line together: 22 fish , 41,486 aged XP and 780 salt/.test(plain),
    `the complete total is stated: ${plain.slice(plain.indexOf("both sides"), plain.indexOf("both sides") + 160)}`);
  // Row order follows the stock: the biggest pile of XP first, not the rarest fish.
  assert.ok(panel.indexOf(">Rock Blackfish<") < panel.indexOf(">White Shark<"),
    "10 Rock Blackfish outrank 1 White Shark");
  assert.ok(panel.indexOf(">White Shark<") < panel.indexOf(">Saw Shark<"),
    "and a shark you hold outranks the same shark you do not");
});

test("the sharks are in, at the 5x band the shed actually pays", () => {
  const { free } = agingPanel(renderPage(AGING_FARM).html);
  /*
   * White Shark is 2,000 base, over the 330 boundary, so it ages at 5x to 10,000 and 10,720
   * with prime folded in — the biggest single XP item in the game, and it was missing from
   * FISH_BASE_XP altogether. It costs 200 salt, which is the reason it is not a free lunch.
   */
  const ws = free.slice(free.indexOf(">White Shark<"), free.indexOf(">White Shark<") + 1400);
  assert.ok(/2,000/.test(ws), "raw XP 2,000");
  assert.ok(/10,720/.test(ws), `aged XP 10,720 (5x band x 1.072 prime): ${ws.replace(/<[^>]+>/g, " ")}`);
  assert.ok(/>200</.test(ws), "200 salt a piece");
  assert.ok(/8\.0h/.test(ws), `and 8h of rack time: ${ws.replace(/<[^>]+>/g, " ")}`);
});

test("below the line, every fish names the bait and the seasons that want it", () => {
  const { taken } = agingPanel(renderPage(AGING_FARM).html);
  const plain = (from) => taken.slice(taken.indexOf(">" + from + "<"), taken.indexOf(">" + from + "<") + 1600)
    .replace(/<[^>]+>/g, " ").replace(/&times;/g, "×").replace(/\s+/g, " ");
  /*
   * Halibut is autumn's Fish Flake and nothing else — free today, and not free in the round, so
   * the season is the row's business rather than a table of its own. Anchovy is on every season's
   * Fish Flake, which must collapse to "all seasons" instead of listing four rows of the same.
   */
  assert.ok(/2× Fish Flake \(autumn\)/.test(plain("Halibut")), `Halibut: ${plain("Halibut").slice(0, 200)}`);
  assert.ok(/4× Fish Flake \(all seasons\)/.test(plain("Anchovy")), `Anchovy: ${plain("Anchovy").slice(0, 200)}`);
  // The season running now is marked, so "wanted eventually" and "wanted today" stay apart.
  assert.ok(/2× Fish Stick \(winter\) · now/.test(plain("Angelfish")), `Angelfish: ${plain("Angelfish").slice(0, 200)}`);
  assert.ok(!/· now/.test(plain("Halibut")), "an out-of-season claim is not marked as current");
  // A dish claim rides along with the recipe claim rather than replacing it.
  assert.ok(/Fish n Chips/.test(plain("Halibut")), "the dish that also wants Halibut is named");
});

test("a dish is a claim on a fish too, and is not passed off as free", () => {
  const { panel, free } = agingPanel(renderPage(AGING_FARM).html);
  /*
   * Horse Mackerel and Squid are on none of the sixteen bait lists — and on Fish Burger and
   * Fried Calamari. Calling them simply free would be wrong, so the claim is named in the row
   * and repeated under the table.
   */
  // Named in the row above the line, and gathered again in the footnote under the table.
  const hm = free.slice(free.indexOf(">Horse Mackerel<"), free.indexOf(">Horse Mackerel<") + 1400);
  assert.ok(/Fish Burger/.test(hm), "the row says which dish wants it");
  const plain = panel.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.ok(/Horse Mackerel → Fish Burger/.test(plain), "the dish that wants Horse Mackerel is named");
  assert.ok(/Squid → Fried Calamari/.test(plain), "and the one that wants Squid");
  // Rock Blackfish is wanted by nothing at all, and says so rather than being left blank.
  const rb = free.slice(free.indexOf(">Rock Blackfish<"), free.indexOf(">Rock Blackfish<") + 1400);
  assert.ok(/nothing/.test(rb), "a fish nothing wants says nothing, not an empty cell");
});

test("ageing times carry the shed's own boosts", () => {
  /*
   * Speedy Aging x0.9 and Salt Sculpture L5+ x0.95 compound to 0.855, which is the difference
   * between a backlog estimate that matches the game and one that is 17% pessimistic. Measured
   * on the live farm: Hammerhead jobs run 2h51m, not the unboosted 3h.
   */
  const boosted = JSON.parse(JSON.stringify(AGING_FARM));
  boosted.bumpkin.skills["Speedy Aging"] = 1;
  boosted.sculptures["Salt Sculpture"].level = 6;
  const { free } = agingPanel(renderPage(boosted).html);
  assert.ok(/×0\.85\)/.test(free), "the compounded multiplier is stated");
  const hh = free.slice(free.indexOf(">Hammerhead Shark<"), free.indexOf(">Hammerhead Shark<") + 1400);
  assert.ok(/2\.6h/.test(hh), `3h x 0.855 = 2.6h, not 3.0h: ${hh.replace(/<[^>]+>/g, " ")}`);
  // The unboosted farm must still read the unboosted time, or the multiplier is being ignored.
  const { free: plainFree } = agingPanel(renderPage(AGING_FARM).html);
  const hh2 = plainFree.slice(plainFree.indexOf(">Hammerhead Shark<"), plainFree.indexOf(">Hammerhead Shark<") + 1400);
  assert.ok(/3\.0h/.test(hh2), "and a farm with only an L3 sculpture keeps the full 3.0h");
});
