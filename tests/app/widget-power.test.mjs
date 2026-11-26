import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { compact } from "../../ui/glance.mjs";
import { renderLook, looksFor, TEMPLATE_IDS } from "../../ui/glance-templates.mjs";
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

// ── 📱 glance models ──
const gm = (w, data, ctx, opts) => w.glanceModel(data, ctx, opts || {});
const rowsIn = (html) => (html.match(/class="gx-row"/g) || []).length;

test("📱 glance models: every POWER widget has a model and a natural look, no hand-written face; no data = empty", () => {
  const LOOKS = { "power-best-buys": "number-list-2", "power-categories": "number-list-2", "power-seed-costs": "list-4", "power-tool-costs": "list-4" };
  for (const w of POWER_WIDGETS) {
    assert.strictEqual(w.look, LOOKS[w.type] || "number", w.type);
    assert.ok(TEMPLATE_IDS.includes(w.look), w.type);
    assert.strictEqual(w.glance, undefined, `${w.type}: the hand-written face is gone`);
    assert.strictEqual(typeof w.glanceModel, "function", w.type);
  }
  for (const w of [powerTotals, powerBestBuys, powerCategories, powerBoosts, powerDormant, powerAllBoosts])
    assert.deepStrictEqual(gm(w, {}, CTX), { empty: "No POWER data yet." }, w.type);
  assert.deepStrictEqual(gm(powerActivity, {}, CTX), { empty: "No digging or composters to judge." });
  assert.deepStrictEqual(gm(powerCropMachine, {}, CTX), { empty: "No crop machine on this farm." });
});

test("📱 totals: net a day with the owned share as a ring; gross / costs / boosts as items; short tiles", () => {
  const c = power.categories, ctx = { ...CTX, restock: () => ({ restockPerDay: 0.5 }) };
  const net = c.totalBoostedSfl - c.totalCostSfl - 0.5;
  const owned = power.boostItems.filter((b) => b.has || b.owned).length, total = power.boostItems.length;
  const m = gm(powerTotals, { power }, ctx);
  assert.deepStrictEqual(m.head, { value: `+${net >= 100 ? compact(net) : net.toFixed(2)}`, unit: " 🌸", tone: "ok", cap: `net a day · ${owned}/${total} boosts owned`, ring: (owned / total) * 100, ringTone: "ok" });
  assert.strictEqual(m.items.length, 5);
  assert.deepStrictEqual(m.items[3], { icon: "🎒", name: "Boosts owned", value: `${owned}/${total}`, pct: (owned / total) * 100 });
  assert.deepStrictEqual(m.tiles[3], { label: "owned", value: `${Math.round((owned / total) * 100)}%` });
  assert.ok(m.tiles.every((t) => t.label.length <= 10 && String(t.value).length <= 6), "tiles fit a 1×2 cell");
  assert.match(renderLook(m, "number").html, /^<div class="gx gx-1x1" style="--gw:1"><div class="gx-corner"><svg class="gx-ring g-ok"/);
  assert.ok(looksFor(m).length >= 3);
});

test("📱 best buys: the fastest payback; the buys with payback chips and the share of a year; the copy's category carries over", () => {
  const all = bestBuys(power);
  const m = gm(powerBestBuys, { power }, CTX);
  assert.deepStrictEqual([m.head.value, m.head.unit, m.head.hero], [all[0].roi.toFixed(0), "d", `<i>${all[0].boost.name}</i>`]);
  assert.deepStrictEqual(m.items[0].chip, { text: `${all[0].roi.toFixed(0)}d`, tone: "ok" });
  assert.strictEqual(m.items[0].pct, Math.min(100, (365 / all[0].roi) * 100));
  assert.strictEqual(rowsIn(renderLook(m, "number-list-2").html), Math.min(3, m.items.length));
  assert.ok(looksFor(m).length >= 3);
  const cat = all[0].catId;
  assert.ok(gm(powerBestBuys, { power }, CTX, { cat }).items.length <= all.filter((x) => x.catId === cat).length);
});

test("📱 categories: net over the priced categories; the categories best earners first, owned share as the bar", () => {
  const ctx = { ...CTX, products: () => ({}) };
  const out = powerCategories.build({ power }, ctx, {});
  const priced = out.rows.filter((r) => r.net != null), net = priced.reduce((a, r) => a + r.net, 0);
  const m = gm(powerCategories, { power }, ctx);
  assert.strictEqual(m.head.cap, `net a day · ${priced.length} priced categories`);
  assert.strictEqual(m.head.value, `${net >= 0 ? "+" : "−"}${Math.abs(net) >= 100 ? compact(Math.abs(net)) : Math.abs(net).toFixed(2)}`);
  assert.strictEqual(m.items.length, out.rows.length);
  const best = priced.slice().sort((a, b) => b.net - a.net)[0];
  assert.deepStrictEqual([m.items[0].icon, m.items[0].name, m.items[0].sub, m.items[0].pct], [best.emoji, best.label, `${best.owned}/${best.total} boosts owned`, (best.owned / best.total) * 100]);
  assert.match(renderLook(m, "list-4").html, new RegExp(`<div class="gx-n">${best.label}<div>`));
  assert.ok(looksFor(m).length >= 3);
  assert.match(gm(powerCategories, { power }, CTX, { kind: "qualitative" }).head.cap, /boosts owned · \d+ categories/, "only unpriced kinds count owned boosts");
});

test("📱 boosts: owned / total with a ring; the missing ones by payback, then the owned", () => {
  const out = powerBoosts.build({ farm, power }, CTX, { cat: "crops", show: "all" });
  const base = out.rows.filter((r) => !r.rank), owned = base.filter((r) => r.owned).length;
  const m = gm(powerBoosts, { farm, power }, CTX, { cat: "crops", show: "owned" });   // "show" does not hide the missing ones
  assert.deepStrictEqual([m.head.value, m.head.unit, m.head.cap], [owned, `/${base.length}`, "🌾 CROPS boosts owned"]);
  assert.strictEqual(m.items.length, base.length);
  assert.deepStrictEqual(m.items[m.items.length - 1].chip, { text: "owned", tone: "ok" });
  assert.match(renderLook(m, "number").html, /^<div class="gx gx-1x1" style="--gw:1"><div class="gx-corner"><svg class="gx-ring g-ok"/);
  assert.ok(looksFor(m).length >= 3);
  const p = { ...power, boostItems: power.boostItems.map((b) => (b.categories || []).includes("iron") ? { ...b, has: true } : b) };
  assert.strictEqual(gm(powerBoosts, { farm, power: p }, CTX, { cat: "iron" }).foot, "every boost owned");
});

test("📱 dormant: what the idle boosts could add; the biggest to equip / place; all active = empty", () => {
  const p = { ...power, dormantBoosts: [
    { name: "Ruby Hat", type: "Wearable", boost: "+1 Gold", value: 0.2 },
    { name: "Statue", type: "Collectible", boost: "+0.1 Stone", value: 1.4 },
    { name: "Gnome Deco", type: "Collectible", boost: "x", value: 0.001 },
  ] };
  const m = gm(powerDormant, { power: p }, CTX);
  assert.deepStrictEqual(m.head, { value: "+1.60", unit: " 🌸", tone: "warn", cap: "idle, a day · 1 to equip · 1 to place" });
  assert.strictEqual(m.items.length, 2);
  assert.deepStrictEqual(m.items[0], { icon: "<i>Statue</i>", name: "Statue", sub: "+1.40/day", chip: { text: "PLACE", tone: "" }, pct: 100 });
  assert.match(renderLook(m, "list-1").html, /<div class="gx-n">Ruby Hat<div class="gx-sub-tag g-info">EQUIP<\/div><\/div>/);
  assert.ok(looksFor(m).length >= 3);
  assert.deepStrictEqual(gm(powerDormant, { power }, CTX), { empty: "✓ Every boost you own is active." });
});

test("📱 crop machine: the best unlocked crop; the crops by net, the locked last", () => {
  const list = power.cropMachine.rows.filter((r) => !r.locked).sort((a, b) => b.net - a.net), best = list[0];
  const m = gm(powerCropMachine, { power }, CTX);
  assert.deepStrictEqual([m.head.hero, m.head.cap], [`<i>${best.crop}</i>`, `a day · ${best.crop} · best of ${list.length}`]);
  assert.strictEqual(m.items.length, power.cropMachine.rows.length);
  assert.match(m.items[0].sub, /\/seed · \d+h/);
  assert.strictEqual(m.items[0].pct, 100);
  assert.strictEqual(rowsIn(renderLook(m, "list-4").html), Math.min(8, m.items.length));
  assert.ok(looksFor(m).length >= 3);
});

test("📱 crop machine queue: the daily rate with the machine's busy share as a ring; the queue; no machine = empty", () => {
  const sim = { queue: [{ crop: "Kale", seedsUsed: 10, restockCap: 30, timeSec: 7200, revenue: 2, oilCost: 0.5, seedCost: 0.25, net: 1.25 }],
    windowSec: 86400, timeUsed: 7200, totalCrops: 12, totalNet: 1.25, totalRevenue: 2, totalOilCost: 0.5, totalSeedCost: 0.25, plots: 10, speedMult: 1, oilPerHour: 1 };
  const ctx = { ...CTX, cmQueue: () => ({ sim, windowHours: 24, wheatRestock: 240, hasWarehouse: true, plotCount: 68, wheatBatches: 4, wheatGrowH: 6,
    wheatGrowBaseH: 6, wheatBoosts: { mult: 1, boosts: [] }, skNames: [], oilCostPerH: 0.11, dailyFactor: 2 }) };
  const m = gm(powerCmQueue, { farm, power }, ctx);
  assert.deepStrictEqual(m.head, { value: "+2.50", unit: " 🌸", tone: "ok", cap: "a day · 1 crops · 24.0h window", ring: (7200 / 86400) * 100, ringTone: "info" });
  assert.deepStrictEqual(m.items, [{ icon: "<i>Kale</i>", name: "Kale", sub: "10/30 seeds", value: "+1.25", tone: "ok", pct: (10 / 30) * 100 }]);
  assert.deepStrictEqual(m.tiles.map((t) => t.value), ["24.0h", 12, "+1.3", "+2.5"]);
  assert.match(renderLook(m, "number").html, /<div class="gx-num g-ok">\+2\.50<small> 🌸<\/small><\/div>/);
  assert.ok(looksFor(m).length >= 3);
  assert.deepStrictEqual(gm(powerCmQueue, { farm, power }, { ...CTX, cmQueue: () => null }), { empty: "No crop machine on this farm." });
});

test("📱 does it pay: digging per hole; without digging the best composter; digging + composters as items", () => {
  const pd = power.digging.perDig;
  const m = gm(powerActivity, { power }, CTX);
  assert.strictEqual(m.head.value, `${pd.netWithCoins >= 0 ? "+" : "−"}${Math.abs(pd.netWithCoins).toFixed(3)}`);
  assert.match(m.head.cap, /^per hole, coins counted/);
  const comps = power.composters.slice().sort((a, b) => b.netPerDay - a.netPerDay);
  assert.strictEqual(m.items.length, 1 + comps.length);
  assert.deepStrictEqual([m.items[0].name, m.items[0].sub], ["Digging", "per hole · 17 dug"]);
  const c = gm(powerActivity, { power: { ...power, digging: null } }, CTX);
  assert.deepStrictEqual([c.head.hero, c.head.cap], [`<i>${comps[0].name}</i>`, `a day · ${comps[0].name} · best composter`]);
  assert.match(renderLook(m, "list-4").html, /<div class="gx-n">Digging<div>per hole · 17 dug<\/div>/);
  assert.ok(looksFor(m).length >= 3);
});

test("📱 pets: fetch income a day with the portfolio ROI; the best earners first", () => {
  const ctx = { ...CTX, pets: () => ({ pets: [
    { key: "a", displayName: "Dragon #1", petType: "Dragon", isNft: true, level: 20, energy: 1, dailySfl: 0.5, price: 50, roiDays: 100 },
    { key: "b", displayName: "Barkley", species: "Dog", isNft: false, level: 3, energy: 1, dailySfl: 0.1, price: 0, roiDays: null }],
    totalDaily: 0.6, totalPrice: 50, grossRoi: 83.3, feedMult: 1, boosts: [] }) };
  const m = gm(powerPets, { farm, power }, ctx);
  assert.deepStrictEqual(m.head, { value: "+0.600", unit: " 🌸", tone: "ok", cap: "a day · 2 pets · ROI 84d" });
  assert.strictEqual(m.items.length, 2);
  assert.deepStrictEqual([m.items[0].name, m.items[0].sub, m.items[0].value, m.items[0].pct], ["Dragon #1", "lv 20", "+0.500", 100]);
  assert.deepStrictEqual(m.tiles.map((t) => [t.label, t.value]), [["pets", 2], ["a day", "+0.60"], ["invested", "50"], ["ROI", "84d"]]);
  assert.match(renderLook(m, "number").html, /<div class="gx-cap">a day · 2 pets · ROI 84d<\/div>/);
  assert.ok(looksFor(m).length >= 3);
  assert.deepStrictEqual(gm(powerPets, { farm, power }, { ...CTX, pets: () => null }), { empty: "No pets on this farm." });
});

test("📱 lava pits and feed: this season's ignition / the feed bill a day; the dearest lines", () => {
  const t = { lava: { season: "autumn", pits: 4, rows: [
      { season: "autumn", item: "Pumpkin", qty: 10, price: 0.01, cost: 0.1, current: true }, { season: "autumn", item: "Oil", qty: 2, price: 0.5, cost: 1, current: true },
      { season: "winter", item: "Kale", qty: 5, price: 1, cost: 5, current: false }],
      totals: [{ season: "autumn", total: 1.1, current: true }, { season: "winter", total: 5, current: false }] },
    feed: [{ catId: "cows", animal: "Cow", count: 10, isGolden: false, feedQty: 3, total: 0.25 }, { catId: "chickens", animal: "Chicken", count: 5, isGolden: false, feedQty: 1, total: 0.5 }] };
  const ctx = { ...CTX, costTables: () => t };
  const l = gm(powerLavaCosts, { farm, power }, ctx);
  assert.deepStrictEqual(l.head, { value: "1.10", unit: " 🌸", cap: "per ignition · autumn · 4 pits" });
  assert.deepStrictEqual(l.items.map((i) => i.name), ["Oil", "Pumpkin"], "this season's materials only, dearest first");
  assert.deepStrictEqual(l.tiles, [{ label: "Autumn ●", value: "1.1" }, { label: "Winter", value: "5.0" }]);
  assert.ok(looksFor(l).length >= 3);
  assert.deepStrictEqual(gm(powerLavaCosts, { farm, power }, { ...CTX, costTables: () => ({ ...t, lava: null }) }), { empty: "No lava pits on this farm." });
  const f = gm(powerFeedCosts, { farm, power }, ctx);
  assert.deepStrictEqual(f.head, { value: "−0.750", unit: " 🌸", tone: "bad", cap: "a day · feed + sickness · 15 animals" });
  assert.deepStrictEqual(f.items[0], { icon: "<i>Egg</i>", name: "Chicken", sub: "5× · 1 feed", value: "−0.500", tone: "bad", pct: (0.5 / 0.75) * 100 });
  assert.match(renderLook(f, "list-4").html, /<div class="gx-n">Chicken<div>5× · 1 feed<\/div><\/div><span class="gx-chip g-bad">−0\.500<\/span>/);
  assert.ok(looksFor(f).length >= 3);
  assert.deepStrictEqual(gm(powerFeedCosts, { farm, power }, { ...CTX, costTables: () => ({ ...t, feed: [] }) }), { empty: "No animals." });
});

test("📱 the reference tables: seed / tool costs and every boost get a model too", () => {
  const t = { coinsPerSFL: 1061, bettyItem: "Celestine", stockMods: { hasWarehouse: true },
    seeds: [{ name: "Kale", catId: "crops", coinCost: 7, sflCost: 0.0066, stock: 72, growSec: 129600, growText: "1.5d", oilCost: 0, harvests: 1 },
      { name: "Wheat", catId: "crops", coinCost: 1, sflCost: 0.001, stock: 400, growSec: 86400, growText: "1d", oilCost: 0, harvests: 1 }],
    tools: [{ name: "Gold Pickaxe", catId: "crimstone", coins: 100, discount: 0.2, effectiveCoins: 80, discountLabel: "-20% Frugal Miner", mats: [{ item: "Gold", qty: 3 }], sfl: 1.2345, stock: 7 },
      { name: "Axe", catId: "trees", coins: 20, discount: 0, effectiveCoins: 20, discountLabel: "", mats: [], sfl: 0.02, stock: 200 }] };
  const ctx = { ...CTX, costTables: () => t };
  const s = gm(powerSeedCosts, { farm, power }, ctx);
  assert.deepStrictEqual(s.head, { value: "1.1k", unit: " coins/🌸", cap: "seed prices · via Celestine" });
  assert.strictEqual(s.items.length, 2);
  assert.deepStrictEqual(s.tiles.map((x) => [x.label, x.value]), [["coins/🌸", 1061], ["seeds", 2], ["dearest", "0.01"]]);
  assert.ok(looksFor(s).length >= 3);
  const tl = gm(powerToolCosts, { farm, power }, ctx);
  assert.deepStrictEqual([tl.head.value, tl.head.unit, tl.head.ringTone], [1, "/4", "warn"]);
  assert.deepStrictEqual(tl.items[0], { icon: "<i>Gold Pickaxe</i>", name: "Gold Pickaxe", sub: "-20% Frugal Miner", value: "1.23", tone: "ok", pct: 100 });
  assert.strictEqual(rowsIn(renderLook(tl, "list-4").html), 2);
  assert.ok(looksFor(tl).length >= 3);
  assert.deepStrictEqual(gm(powerSeedCosts, { farm, power }, { ...CTX, costTables: () => null }), { empty: "No POWER data yet." });
  const all = gm(powerAllBoosts, { power }, CTX), owned = power.boostItems.filter((b) => b.has).length;
  assert.deepStrictEqual([all.head.value, all.head.unit], [owned, `/${power.boostItems.length}`]);
  assert.ok(all.items.length >= 2 && all.items.every((i) => i.pct >= 0 && i.pct <= 100));
  assert.ok(looksFor(all).length >= 3);
});
