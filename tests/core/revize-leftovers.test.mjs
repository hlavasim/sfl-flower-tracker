import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { shrineStatuses, _shrineActiveNow } from "../../core/engine/power-costs.mjs";
import { roadmapAnimalCapacity, _setPowerContext, _getPowerContext } from "../../core/engine/roadmap.mjs";

/*
 * Revision 2026-09-22, the leftovers the per-area fix passes could not reach (their files were
 * outside scope). Each test failed on the code before its fix.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wrap = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/farm-155498.json"), "utf8"));
const farm = wrap.farm || wrap;
const clone = (o) => JSON.parse(JSON.stringify(o));

/** The fixture farm with one collectible moved from the land into the house's ground floor. */
function movedIndoors(name) {
  const f = clone(farm);
  const inst = f.collectibles[name];
  assert.ok(inst && inst.length, `the fixture has ${name} placed on the land`);
  delete f.collectibles[name];
  f.interior = f.interior || {};
  f.interior.ground = f.interior.ground || {};
  f.interior.ground.collectibles = { ...(f.interior.ground.collectibles || {}), [name]: inst };
  return f;
}

// ── 1. "Is it placed" reads all four maps (findCollectible), not just land + legacy home ──

test("a shrine placed in the house interior keeps its status (not 'never')", () => {
  const before = shrineStatuses(farm).find((s) => s.name === "Mole Shrine");
  assert.notEqual(before.kind, "never", "the fixture's Mole Shrine is placed on the land");
  const indoors = shrineStatuses(movedIndoors("Mole Shrine")).find((s) => s.name === "Mole Shrine");
  assert.equal(indoors.kind, before.kind, "moving it indoors must not make it vanish");
});

test("_shrineActiveNow sees a shrine on the interior's upper floor", () => {
  const f = clone(farm);
  const now = Date.now();
  f.interior = { level_one: { collectibles: { "Badger Shrine": [{ id: "x", createdAt: now - 3600000, coordinates: { x: 0, y: 0 } }] } } };
  delete f.collectibles["Badger Shrine"];
  assert.equal(_shrineActiveNow(f, "Badger Shrine"), true, "a 1-hour-old shrine upstairs is active");
});

test("a Chicken Coop placed indoors still raises the hen house capacity on the roadmap", () => {
  const f = clone(farm);
  f.henHouse = { level: 2, animals: {} };
  for (const k of ["collectibles"]) delete f[k]["Chicken Coop"];
  if (f.home && f.home.collectibles) delete f.home.collectibles["Chicken Coop"];
  const prev = _getPowerContext();
  try {
    _setPowerContext({ farm: f });
    const without = roadmapAnimalCapacity("chickens").total;
    f.interior = { ground: { collectibles: { "Chicken Coop": [{ id: "c", createdAt: 1, coordinates: { x: 1, y: 1 } }] } } };
    const withCoop = roadmapAnimalCapacity("chickens").total;
    assert.equal(withCoop - without, 10, "Chicken Coop adds 5 per hen house level (level 2 → +10)");
  } finally { _setPowerContext(prev); }
});

// ── 2. D12: the crop machine applies crop YIELD boosts per seed (harvestCropMachine.ts) ──
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildRoadmapSection } from "../../core/sections/roadmap.mjs";
import { calcCropMachineDaily } from "../../core/engine/crop-machine.mjs";
import { cmGetSeedRestockCount } from "../../core/engine/roadmap.mjs";
import { CROP_GROW_DATA } from "../../core/engine/power-boosts.mjs";

const p2pFix = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/p2p-prices.json"), "utf8"));
const nftsFix = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/nfts-sample.json"), "utf8"));

test("calcCropMachineDaily counts crops per seed; seeds (not crops) are what cost coins", () => {
  const er = { coinsPerSFL: 100 };
  const one = calcCropMachineDaily(farm, "Sunflower", { Sunflower: 0.01 }, er, false);
  const boosted = calcCropMachineDaily(farm, "Sunflower", { Sunflower: 0.01 }, er, false, 1.5);
  assert.ok(Math.abs(boosted.revenue - one.revenue * 1.5) < 1e-9, "revenue scales with crops per seed");
  assert.ok(Math.abs(boosted.cropsPerDay - one.cropsPerDay * 1.5) < 1e-9, "crops per day scales too");
  assert.equal(boosted.seedsPerDay, one.seedsPerDay, "the machine still plants the same seeds");
  assert.ok(Math.abs(boosted.seedCostPerDay - one.seedCostPerDay) < 1e-12, "seed cost follows seeds, not crops");
});

test("the roadmap's CROP MACHINE rows use the Power panel's crops per seed", () => {
  const pw = buildPowerSection(farm, p2pFix, nftsFix, null, {});
  const cm = pw.cropMachine;
  assert.ok(cm && cm.rows.some((r) => r.yieldPerSeed !== 1), "the fixture has a crop yield boost on the machine");
  const out = buildRoadmapSection([], { roadmapSettings: {}, farm, p2p: p2pFix });
  const rows = out.profitability.groups.find((g) => g.id === "cropMachine").rows;
  assert.ok(rows.length > 0, "the roadmap lists crop machine crops");
  const rpd = 2;   // roadmap default restocks per day
  for (const row of rows) {
    const pr = cm.rows.find((r) => r.crop === row.label);
    const seedsPerDay = 86400 * cm.plots / (CROP_GROW_DATA[row.label] * cm.speedMult);
    const seeds = Math.min(seedsPerDay, rpd * cmGetSeedRestockCount(farm, row.label));
    const want = seeds * pr.yieldPerSeed * pr.price;
    assert.ok(Math.abs(row.gross - want) <= Math.max(1e-6, want * 2e-3),
      `${row.label}: roadmap gross ${row.gross.toFixed(4)} ≠ seeds × ${pr.yieldPerSeed} × price = ${want.toFixed(4)}`);
  }
});

test("every Crop Machine queue on the page is priced with the server's crops per seed", () => {
  const src = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
  const calls = [...src.matchAll(/cmSimulateQueue\(([^;\n]*)\);/g)].map((m) => m[1]);
  assert.ok(calls.length >= 3, `found the queue call sites (${calls.length})`);
  for (const args of calls) {
    const n = args.split(",").length;
    assert.equal(n, 6, `cmSimulateQueue(${args}) must pass the yield map as its 6th argument`);
  }
});

// ── 3. "<Crop> Plot Growth Time" is a grow-TIME boost (plant.ts), not a yield cut ──
import { parseBoostEffects } from "../../core/engine/power-boosts.mjs";

test("Cabbage Girl and the other '<Crop> Plot Growth Time' items parse as grow-time boosts", () => {
  // Texts as sfl.world ships them; plant.ts multiplies the crop's grow seconds for each.
  const cases = [
    ["Cabbage Girl", "-50% Cabbage Plot Growth Time", "Cabbage", -50],
    ["Giant Zucchini", "-50% Zucchini Plot Growth Time", "Zucchini", -50],
    ["Broccoli Hat", "-50% Broccoli Plot Growth Time", "Broccoli", -50],
    ["Carrot Amulet", "-20% Carrot Plot Growth time", "Carrot", -20],
  ];
  for (const [name, text, product, value] of cases) {
    const eff = parseBoostEffects(text, name);
    assert.deepEqual(eff.map((e) => [e.type, e.cat, e.product, e.value]), [["speed_pct", "crops", product, value]],
      `${name}: ${JSON.stringify(eff)}`);
  }
});

test("the page's boost parser strips 'Plot' the same way", () => {
  const fix = String.raw`const prod = m[2].trim().replace(/\s+Plot$/i, "");`;
  assert.ok(readFileSync(path.join(ROOT, "flowers.html"), "utf8").includes(fix), "flowers.html");
  assert.ok(readFileSync(path.join(ROOT, "core/engine/power-boosts.mjs"), "utf8").includes(fix), "core");
});

// ── 4. Insights values snapshots from include=game_value, which must carry every field
//       computeFarmValue reads ──
import { buildTreasuryData } from "../../core/sections/treasury.mjs";

const PAGE_SRC = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
function loadPageFns(names) {
  const script = PAGE_SRC.slice(PAGE_SRC.indexOf("<script>") + 8, PAGE_SRC.lastIndexOf("</script>"));
  const stubEl = () => ({ innerHTML: "", textContent: "", style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, addEventListener() {}, setAttribute() {}, removeAttribute() {}, querySelector: () => null,
    querySelectorAll: () => [], getContext: () => null, children: [], dataset: {} });
  const doc = { getElementById: () => stubEl(), querySelector: () => null, querySelectorAll: () => [], createElement: stubEl,
    addEventListener() {}, removeEventListener() {}, body: stubEl(), documentElement: stubEl(), head: stubEl(), readyState: "complete", cookie: "" };
  const store = {};
  const win = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "https://example.test/", search: "", hash: "", pathname: "/", origin: "https://example.test" },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: () => 0, setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {},
    history: { replaceState() {}, pushState() {} }, navigator: { userAgent: "node", clipboard: { writeText: async () => {} } },
    fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
  };
  win.window = win; win.document = doc;
  const run = new Function("window", "document", "localStorage", "sessionStorage", "fetch", "requestAnimationFrame", "setTimeout",
    "setInterval", "clearTimeout", "clearInterval", "location", "history", "navigator", "matchMedia", "console",
    `${script}\n return { ${names.join(", ")} };`);
  return run(win, doc, win.localStorage, win.sessionStorage, win.fetch, win.requestAnimationFrame, win.setTimeout,
    win.setInterval, win.clearTimeout, win.clearInterval, win.location, win.history, win.navigator, win.matchMedia, win.console);
}

/** JS mirror of api/farm-history.js GAME_VALUE_SQL (each placed name keeps its first placement). */
function gameValueProjection(g) {
  const placed = (m) => { const o = {}; for (const [k, v] of Object.entries(m || {})) o[k] = [Array.isArray(v) ? v[0] : undefined]; return o; };
  return JSON.parse(JSON.stringify({
    inventory: g.inventory, wardrobe: g.wardrobe, balance: g.balance, coins: g.coins, gems: g.gems, bank: g.bank,
    pets: { nfts: g.pets && g.pets.nfts }, trades: { listings: g.trades && g.trades.listings },
    collectibles: placed(g.collectibles), home: { collectibles: placed(g.home && g.home.collectibles) },
    interior: { ground: { collectibles: placed(g.interior && g.interior.ground && g.interior.ground.collectibles) },
      level_one: { collectibles: placed(g.interior && g.interior.level_one && g.interior.level_one.collectibles) } },
  }));
}

test("the page's computeFarmValue gives the same totals on the game_value projection as on the full farm", () => {
  const { computeFarmValue } = loadPageFns(["computeFarmValue"]);
  const td = buildTreasuryData(p2pFix, nftsFix, null, 0);
  const full = computeFarmValue(farm, td, "betty");
  const slim = computeFarmValue(gameValueProjection(farm), td, "betty");
  assert.ok(full.totals.grand > 0, "the fixture farm has a value");
  assert.deepEqual(slim.totals, full.totals, "a field computeFarmValue reads is missing from GAME_VALUE_SQL");
});

test("Insights asks farm-history for include=game_value, not the whole farm", () => {
  const i = PAGE_SRC.indexOf("async function renderInvestmentInsights(");
  const body = PAGE_SRC.slice(i, i + 3000);
  assert.match(body, /\/api\/farm-history\?[^`]*include=game_value/, "Insights snapshot fetch");
  assert.doesNotMatch(body, /include=game_data/, "the 180 KB-per-row game_data is not needed for a valuation");
});

// ── 5. One coin-rate rule: the chosen live source, else the other one, else 0 (unpriced) ──
import { buildRoiSection } from "../../core/sections/roi.mjs";

test("with no Betty rate, the exchange's coin rate is used; with neither, coins are unpriced (0), not 320", () => {
  const noBetty = { Wood: "0.01" };   // nothing Betty buys has a p2p price
  const exchange = { coins: { a: { coin: 800, sfl: 1 } }, gems: {}, sfl: { usd: 0.05 } };
  assert.equal(buildPowerSection(farm, noBetty, nftsFix, exchange, {}).exchangeRates.coinsPerSFL, 800, "power: the other live source");
  assert.equal(buildPowerSection(farm, noBetty, nftsFix, null, {}).exchangeRates.coinsPerSFL, 0, "power: no source → 0");
  assert.equal(buildRoiSection(farm, noBetty, nftsFix, exchange, 0, {}).exchangeRates.coinsPerSFL, 800, "roi: the other live source");
  assert.equal(buildRoiSection(farm, noBetty, nftsFix, null, 0, {}).exchangeRates.coinsPerSFL, 0, "roi: no source → 0");
});

test("an unpriced coin rate prices crop-machine seeds at 0, never at a made-up 320", () => {
  const r = calcCropMachineDaily(farm, "Sunflower", { Sunflower: 0.01 }, { coinsPerSFL: 0 }, false);
  assert.equal(r.seedCostPerDay, 0);
  const pw = buildPowerSection(farm, { Oil: "0" }, nftsFix, null, {});   // nothing Betty buys is priced
  for (const row of (pw.cropMachine ? pw.cropMachine.rows : [])) assert.equal(row.seedCost, 0, `${row.crop}: seed cost at no rate`);
});

test("no hard-coded 320 / 1500 coins-per-FLOWER fallback is left in the page or core", () => {
  const rx = /coinsPerSFL\s*(?:\|\||:)\s*(?:320|1500)\b|\|\|\s*\{\s*coinsPerSFL:\s*(?:320|1500)\b/;
  const files = ["flowers.html", "core/sections/power.mjs", "core/sections/roi.mjs", "core/sections/ascension.mjs",
    "core/engine/crop-machine.mjs"];
  for (const f of files) {
    const hits = readFileSync(path.join(ROOT, f), "utf8").split("\n").filter((l) => rx.test(l) && !/\{ t: "/.test(l));
    assert.deepEqual(hits, [], `${f} still invents a coin rate`);
  }
});

// ── 6. The OpenAPI document covers what the handlers ship now ──
import { API_SPEC } from "../../core/api-spec.mjs";

test("api-spec documents the compute freshness envelope, key by key, as the handler emits it", () => {
  const handler = readFileSync(path.join(ROOT, "api/compute.mjs"), "utf8");
  const fr = handler.slice(handler.indexOf("function _freshness("), handler.indexOf("function _freshness(") + 900);
  const keys = new Set([
    ...[...fr.matchAll(/out\.(\w+)\s*=/g)].map((m) => m[1]),
    ...[...fr.matchAll(/const out = \{\s*(\w+):[^,]*,\s*(\w+):/g)].flatMap((m) => [m[1], m[2]]),
    ...[...handler.matchAll(/payload\.(\w+)\s*=/g)].map((m) => m[1]),
  ]);
  for (const k of ["farmFetchedAt", "stale", "staleSources", "staleAgeMin", "staleFetchedAt", "farmAgeSec", "pricesOk"]) {
    assert.ok(keys.has(k), `the handler still emits ${k} (else update this test)`);
  }
  const doc = API_SPEC.paths["/api/compute"].get.responses["200"].description;
  for (const k of keys) assert.ok(doc.includes("`" + k + "`"), `200 response does not document \`${k}\``);
});

test("api-spec documents unmeasured efficiency, include=game_value, truncated, book=1 and maxAgeHours", () => {
  const sec = API_SPEC.paths["/api/compute"].get.parameters.find((p) => p.name === "section").description;
  for (const s of ["effUnmeasured", "meta.measured", "meanRatio` is `null"]) assert.ok(sec.includes(s), `section doc: ${s}`);
  const fh = API_SPEC.paths["/api/farm-history"];
  assert.ok(fh, "/api/farm-history documented");
  assert.deepEqual(fh.get.parameters.find((p) => p.name === "include").schema.enum, ["game_data", "game_value"]);
  const agg = API_SPEC.paths["/api/farm-diff-agg"];
  assert.ok(agg && agg.get.responses["200"].description.includes("`truncated`"), "farm-diff-agg truncated");
  const ob = API_SPEC.paths["/api/marketplace-orderbook"];
  assert.ok(ob, "/api/marketplace-orderbook documented");
  const obParams = ob.get.parameters.map((p) => p.name);
  for (const p of ["book", "flips"]) assert.ok(obParams.includes(p), `orderbook param ${p}`);
  assert.ok(ob.get.responses["200"].description.includes("`maxAgeHours`"), "flips maxAgeHours");
});

// ── 8. RECOVERED % is visible again, under the BILANCE title ──
test("the BILANCE shows 'RECOVERED x % of peak y ₿' from the ledger's peak", () => {
  const { _invRecoveredLine, invAggregate } = loadPageFns(["_invRecoveredLine", "invAggregate"]);
  // 0.25 ₿ in, 0.05 ₿ back out: 20 % of the peak recovered.
  const agg = invAggregate([
    { id: 1, tx_date: "2026-01-01", direction: "deposit", btc_amount: 0.25, venue: "sfl" },
    { id: 2, tx_date: "2026-02-01", direction: "withdrawal", btc_amount: 0.05, venue: "sfl" },
  ]);
  assert.ok(Math.abs(agg.repaidPct - 20) < 1e-9 && agg.peakBtc === 0.25, `ledger read: ${agg.repaidPct} of ${agg.peakBtc}`);
  assert.equal(_invRecoveredLine(agg), `RECOVERED ${agg.repaidPct.toFixed(1)} % of peak ${agg.peakBtc.toFixed(6)} ₿`);
  assert.equal(_invRecoveredLine(invAggregate([])), "", "no deposits → no line");
  const i = PAGE_SRC.indexOf("function _invBalanceSheetHtml(");
  assert.match(PAGE_SRC.slice(i, i + 12000), /_invRecoveredLine\(agg\)/, "the BILANCE renders it");
});
