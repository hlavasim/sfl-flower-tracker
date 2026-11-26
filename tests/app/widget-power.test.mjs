import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import {
  POWER_WIDGETS, powerTotals, powerBestBuys, powerCategories, powerBoosts, powerDormant, powerCropMachine, powerCmQueue,
  powerActivity, powerPets, powerSeedCosts, powerToolCosts, powerLavaCosts, powerFeedCosts, powerAllBoosts, bestBuys, roiColor, powerQuery, productChoices,
} from "../../widgets/power.mjs";

test("a copy's own product and efficiency basis change its query; without them every widget shares one key", () => {
  globalThis.localStorage = { getItem: (k) => ({ sfl_power_products: '{"fruits":"Apple"}', sfl_roadmap_settings: '{"effMode":"real","x":1}' })[k] ?? null };
  try {
    const plain = powerQuery("7");
    assert.deepStrictEqual(plain.q, { products: '{"fruits":"Apple"}', roadmap: '{"effMode":"real","x":1}' });
    assert.deepStrictEqual(powerBoosts.needs("7", { cat: "crops", product: "", eff: "" }).power, plain);
    const own = powerBoosts.needs("7", { cat: "crops", product: "Kale", eff: "theoretical" }).power.q;
    assert.deepStrictEqual(JSON.parse(own.products), { fruits: "Apple", crops: "Kale" });
    assert.deepStrictEqual(JSON.parse(own.roadmap), { effMode: "theoretical", x: 1 });
    // a product left over from another category does not leak into the query
    assert.deepStrictEqual(powerQuery("7", { cat: "fruits", product: "Kale" }).q.products, '{"fruits":"Apple"}');
  } finally { delete globalThis.localStorage; }
  assert.ok(productChoices("crops").some(([v]) => v === "Kale"));
  assert.deepStrictEqual(productChoices("iron"), []);
  assert.ok(powerBoosts.options.find((o) => o.key === "product").choices({ cat: "flowers" }).some(([v, l]) => v === "Sunpetal Seed" && l === "Sunpetal"));
});

// POWER as widgets, on the real section=power answer for farm 155498 (the core test's fixtures).
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
const power = JSON.parse(JSON.stringify(buildPowerSection(farm, p2p, nfts, null, {})));   // as served (JSON)

const CTX = { icon: (n) => `<i>${n}</i>`, sfl: () => "<F>" };
const table = (w, out, settings = w.defaults) => renderTable(w.columns, out.rows, settings, { rowKey: w.rowKey });

test("every POWER widget is registered on the POWER page and loads the farm + section=power with the measured harvests", () => {
  assert.strictEqual(POWER_WIDGETS.length, 14);
  for (const w of POWER_WIDGETS) {
    assert.strictEqual(WIDGETS[w.type], w, w.type);
    assert.strictEqual(w.page, "power", w.type);
    const n = w.needs("155498");
    assert.deepStrictEqual(n.farm, { res: "farm", farm: "155498" });
    assert.deepStrictEqual(n.power, powerQuery("155498"));
    assert.strictEqual(n.power.res, "computeHist");
    assert.strictEqual(n.power.section, "power");
    assert.strictEqual(n.power.weeks, true);
    assert.deepStrictEqual(Object.keys(n.power.q).sort(), ["products", "roadmap"]);
  }
});

test("totals: owned, gross, costs (+ restock), net and boost value — the old summary bar's numbers", () => {
  const c = power.categories;
  const out = powerTotals.view({ power }, { ...CTX, restock: () => ({ restockPerDay: 0.5, restockFrequencyDays: 2, gemCost: 15 }) });
  const owned = power.boostItems.filter((b) => b.has || b.owned).length;
  assert.match(out.html, new RegExp(`<b[^>]*>${owned} / ${power.boostItems.length}</b><span>boosts owned`));
  assert.ok(out.html.includes(`${c.totalBoostedSfl.toFixed(2)} <F>`));
  assert.ok(out.html.includes(`-${(c.totalCostSfl + 0.5).toFixed(2)} <F>`), "costs include the restock");
  assert.ok(out.html.includes(`${(c.totalBoostedSfl - c.totalCostSfl - 0.5).toFixed(2)} <F>`));
  const delta = c.totalBoostedSfl - c.totalBaseSfl;
  assert.ok(out.html.includes(`+${delta.toFixed(2)} <F> (+${((delta / c.totalBaseSfl) * 100).toFixed(0)}%)`));
  assert.match(out.html, /every 2\.0 d, 15💎/);
  // the skill point price, with the best recipe's ingredients and their icons
  assert.ok(out.html.includes(`${power.skillCostInfo.sflPerPoint.toFixed(1)} <F>`));
  assert.match(out.html, /30× <i>Tomato<\/i>Tomato/);
  assert.match(out.html, /class="v-big"/);
  assert.deepStrictEqual(powerTotals.view({}, CTX), { empty: "No POWER data yet." });
});

test("best buys: missing boosts by payback, top N, a per-copy category; ROI coloured, a one-year bar", () => {
  const all = bestBuys(power);
  assert.ok(all.length > 3);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].roi <= all[i].roi);
  assert.ok(all.every((x) => !x.boost.has && !x.boost.owned && x.floor > 0 && x.synergy > 0.0001));
  const out = powerBestBuys.build({ power }, CTX, { n: 3 });
  assert.deepStrictEqual(out.rows.map((r) => r.name), all.slice(0, 3).map((x) => x.boost.name));
  assert.deepStrictEqual(out.rows.map((r) => r.rank), [1, 2, 3]);
  const html = table(powerBestBuys, out);
  assert.ok(html.includes(`+${all[0].synergy.toFixed(2)}</span><span class="v-dim">/day`));
  assert.ok(html.includes(`<b style="color:${roiColor(all[0].roi)}">${all[0].roi.toFixed(0)}d</b>`));
  assert.match(html, /class="v-bar"/);
  assert.match(out.summary, new RegExp(`<b>${all.length}</b><span>buys with a value`));
  const cat = all[0].catId, one = powerBestBuys.build({ power }, CTX, { n: 100, cat });
  assert.ok(one.rows.length && one.rows.every((r) => r.catId === cat));
  assert.ok(one.rows.length < all.length);
  assert.strictEqual(powerBestBuys.titleFor({ n: 5, cat: "iron" }), "🏆 Top 5 buys – IRON");
});

test("ROI colour ramp: green fast, white at 2 years, red from 4 years", () => {
  assert.strictEqual(roiColor(0.0001), "rgb(48,209,88)");
  assert.strictEqual(roiColor(730), "rgb(255,255,255)");
  assert.strictEqual(roiColor(5000), "rgb(255,107,107)");
  assert.strictEqual(roiColor(Infinity), "");
});

test("categories: one row per category with boosts — output with its product icon, net/day, owned share", () => {
  const out = powerCategories.build({ power }, { ...CTX, products: () => ({}) }, {});
  const crops = out.rows.find((r) => r.catId === "crops");
  const s = power.categories.catSummaries.crops;
  assert.strictEqual(crops.net, s.boostedSfl - s.costPerDay);
  assert.strictEqual(crops.unitsHtml, `${s.boostedUnitsPerDay.toFixed(1)} <i>Kale</i>Kale`);
  const html = table(powerCategories, out);
  assert.ok(html.includes(`${(s.boostedSfl - s.costPerDay) >= 0 ? "+" : ""}${(s.boostedSfl - s.costPerDay).toFixed(2)}`));
  assert.match(html, /_powerPickCat\('crops'\)/);
  // a filter per copy
  const side = powerCategories.build({ power }, CTX, { kind: "side" });
  assert.ok(side.rows.length && side.rows.every((r) => r.kind === "side"));
});

test("boosts: owned first, missing by ROI, values and ROI from boostValues; the skill-rank rows from ctx; ƒ derivation", () => {
  const ctx = { ...CTX, products: () => ({}), rankRows: (p, f, b) => (b.name === "Green Thumb"
    ? { title: "ranks", rows: [{ name: "Green Thumb — Level 2", boost: "Level 2", floor: 240, skillPoints: 1, rankShards: 1, synergy: 0.0174, roi: 240 / 0.0174 }] } : null),
    breakdown: () => "<p>BASE PRODUCTION</p>", costDetail: () => "<p>COSTS</p>" };
  const out = powerBoosts.build({ farm, power }, ctx, { cat: "crops", show: "all" });
  const firstMissing = out.rows.findIndex((r) => !r.owned);
  assert.ok(firstMissing > 0 && out.rows.slice(firstMissing).every((r) => !r.owned), "owned first");
  const missing = out.rows.slice(firstMissing).filter((r) => !r.rank);
  const rois = missing.map((r) => (r.roi == null ? Infinity : r.roi));
  const finite = rois.filter((v) => isFinite(v));
  for (let i = 1; i < finite.length; i++) assert.ok(finite[i - 1] <= finite[i], "missing by ROI");
  const duende = out.rows.find((r) => r.name === "Duende Hat");
  assert.strictEqual(duende.value, power.boostValues.crops["Duende Hat"].synergy);
  const rank = out.rows.find((r) => r.name === "Green Thumb — Level 2");
  assert.ok(rank && rank.rank === "ranks");
  const html = table(powerBoosts, out);
  assert.match(html, /data-boost="Duende Hat" data-cat="crops"/);
  assert.match(html, /OWNED/);
  assert.match(html, /<i>Duende Hat<\/i>/);
  assert.match(out.summary, /BASE PRODUCTION/);
  assert.match(out.summary, /COSTS/);
  const s = power.categories.catSummaries.crops;
  assert.ok(out.summary.includes(`${(s.boostedSfl - s.costPerDay) >= 0 ? "+" : ""}${(s.boostedSfl - s.costPerDay).toFixed(2)} <F>`));
  // owned only / missing only per copy
  assert.ok(powerBoosts.build({ farm, power }, ctx, { cat: "crops", show: "missing" }).rows.every((r) => !r.owned));
  // a qualitative category: no value or ROI, the reason it has none, a cost only when missing
  const q = powerBoosts.build({ farm, power }, ctx, { cat: "other", show: "all" });
  const pear = q.rows.find((r) => r.name === "Immortal Pear");
  assert.strictEqual(pear.value, null);
  assert.strictEqual(pear.costHtml, "");
  assert.match(pear.note, /No FLOWER value: an effect the tracker cannot value yet/);
  assert.strictEqual(powerBoosts.titleFor({ cat: "iron" }), "🪨 IRON boosts");
});

test("boosts: a side category shows the pigs / cave panel from ctx", () => {
  const out = powerBoosts.build({ farm, power }, { ...CTX, cavePigs: (p, c) => `<div>PANEL ${c}</div>` }, { cat: "pigs" });
  assert.match(out.summary, /PANEL pigs/);
});

test("dormant: wearables to equip, then collectibles to place; the idle total and the rest folded into a count", () => {
  const p = { ...power, dormantBoosts: [
    { name: "Ruby Hat", type: "Wearable", boost: "+1 Gold", value: 0.2 },
    { name: "Statue", type: "Collectible", boost: "+0.1 Stone", value: 1.4 },
    { name: "Gnome Deco", type: "Collectible", boost: "x", value: 0.001 },
  ] };
  const out = powerDormant.build({ power: p }, CTX);
  assert.deepStrictEqual(out.rows.map((r) => [r.name, r.group]), [["Ruby Hat", "wear"], ["Statue", "place"]]);
  assert.match(out.summary, /<b[^>]*>2 <F><\/b><span>a day sitting idle/);
  assert.match(out.footer, /\+ 1 more owned but unplaced/);
  const html = table(powerDormant, out);
  assert.match(html, /EQUIP/);
  assert.match(html, /\+1\.40<\/span> <F>/);
  assert.match(powerDormant.build({ power }, CTX).empty, /Every boost you own is active/);
});

test("crop machine: the served rows, net coloured; the boost chips as extra columns", () => {
  const out = powerCropMachine.build({ power }, CTX);
  assert.strictEqual(out.rows.length, power.cropMachine.rows.length);
  const html = table(powerCropMachine, out, { columns: ["crop", "net", "active"] });
  assert.ok(html.includes(`+${power.cropMachine.rows[0].net.toFixed(4)}`));
  assert.match(html, /<i>Sunflower<\/i>/);
  assert.match(html, /Acre Farm <b>-0\.5<\/b>/);
  assert.match(out.summary, /<b>10<\/b><span>plots/);
});

test("crop machine queue: the ctx simulation as rows, the window and daily rate as tiles", () => {
  const sim = { queue: [{ crop: "Kale", seedsUsed: 10, restockCap: 30, timeSec: 7200, revenue: 2, oilCost: 0.5, seedCost: 0.25, net: 1.25 }],
    windowSec: 86400, timeUsed: 7200, totalCrops: 12, totalNet: 1.25, totalRevenue: 2, totalOilCost: 0.5, totalSeedCost: 0.25, plots: 10, speedMult: 1, oilPerHour: 1 };
  const ctx = { ...CTX, cmQueue: () => ({ sim, windowHours: 24, wheatRestock: 240, hasWarehouse: true, plotCount: 68, wheatBatches: 4, wheatGrowH: 6,
    wheatGrowBaseH: 6, wheatBoosts: { mult: 1, boosts: [] }, skNames: [], oilCostPerH: 0.11, dailyFactor: 1 }) };
  const out = powerCmQueue.build({ farm, power }, ctx);
  assert.match(table(powerCmQueue, out), /10 \/ 30/);
  assert.match(out.summary, /\+1\.25 <F>/);
  assert.match(out.footer, /<b>240<\/b> <i>Wheat<\/i>Wheat/);
  assert.match(powerCmQueue.build({ farm, power }, { ...CTX, cmQueue: () => null }).empty, /No crop machine/);
});

test("does it pay: digging per hole both ways, the composters' net in English", () => {
  const out = powerActivity.view({ power }, CTX);
  const pd = power.digging.perDig;
  assert.ok(out.html.includes(`${pd.netWithCoins >= 0 ? "+" : "−"}${Math.abs(pd.netWithCoins).toFixed(4)} <F>`));
  assert.match(out.html, /measured from the 17 holes you dug/);
  assert.match(out.html, /<i>Premium Composter<\/i>/);
  assert.match(out.html, /coins converted to FLOWER/);
  assert.doesNotMatch(out.html, /[ěščřžůň]/);
});

test("pets: rows from ctx with a price input; the pet-boost NFTs in the footer with icons", () => {
  const ctx = { ...CTX, pets: () => ({ pets: [{ key: "nft-1", displayName: "Dragon #1", petType: "Dragon", species: "Dragon", isNft: true, level: 20, energy: 1200, dailySfl: 0.5, price: 50, roiDays: 100 }],
    totalDaily: 0.5, totalPrice: 50, grossRoi: 100, feedMult: 1, hasApron: false, hasBowls: true,
    boosts: [{ name: "Paw Aura", boost: "free food", floor: 10, has: false, gain: 0.1, gainText: "+0.100 <F>/d" }, null] }) };
  const out = powerPets.build({ farm, power }, ctx);
  const html = table(powerPets, out);
  assert.match(html, /powerSetPetPrice\('nft-1', this\.value\)/);
  assert.match(html, />100d</);
  assert.match(out.summary, /Pet Bowls ✓/);
  assert.match(out.footer, /<i>Paw Aura<\/i>/);
  assert.match(out.footer, /100d/);
});

test("cost tables: seeds, tools (materials with icons), lava pits by season, animal feed", () => {
  const t = { coinsPerSFL: 1061, bettyItem: "Celestine", stockMods: { hasWarehouse: true },
    seeds: [{ name: "Kale", catId: "crops", coinCost: 7, sflCost: 0.0066, stock: 72, growSec: 129600, growText: "1.5d", oilCost: 0, harvests: 1 }],
    tools: [{ name: "Gold Pickaxe", catId: "crimstone", coins: 100, discount: 0.2, effectiveCoins: 80, discountLabel: "-20% Frugal Miner", mats: [{ item: "Gold", qty: 3 }], sfl: 1.2345, stock: 7 }],
    lava: { season: "Autumn", pits: 4, rows: [{ season: "autumn", item: "Pumpkin", qty: 10, price: 0.01, cost: 0.1, current: true }], totals: [{ season: "autumn", total: 0.1, current: true }] },
    feed: [{ catId: "cows", animal: "Cow", count: 10, avgLevel: 5, isGolden: false, feedQty: 3, feeds: ["Hay"], costPerFeed: 0.01, feedPerDay: 0.2, sickPrevented: false, sickPerDay: 0.05, total: 0.25 }] };
  const ctx = { ...CTX, costTables: () => t };
  assert.match(table(powerSeedCosts, powerSeedCosts.build({ farm, power }, ctx)), /0\.006600/);
  const tools = table(powerToolCosts, powerToolCosts.build({ farm, power }, ctx));
  assert.match(tools, /3× <i>Gold<\/i>Gold/);
  assert.match(tools, /<s class="v-dim">100<\/s> → 80/);
  const lava = powerLavaCosts.build({ farm, power }, ctx);
  assert.match(table(powerLavaCosts, lava), /<i>Pumpkin<\/i>/);
  assert.match(lava.footer, /Autumn 0\.10 <F>/);
  const feed = table(powerFeedCosts, powerFeedCosts.build({ farm, power }, ctx));
  assert.match(feed, /3× <i>Hay<\/i>Hay/);
  assert.match(feed, /0\.2500/);
});

test("all boosts: every boost with its parsed effects, sorted by type then name", () => {
  const out = powerAllBoosts.build({ power }, CTX);
  assert.strictEqual(out.rows.length, power.boostItems.length);
  const html = table(powerAllBoosts, out, { rows: { mode: "all" } });
  assert.match(html, /qualitative: \+1 Fruit Harvest/);
});
