import "../helpers/page-engine.mjs";
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { FISHING_WIDGETS, fishingToday, fishingBait, fishingSafeAge, fishingMarvels, fishingOrder, fishingCost, fishingPerFish,
  fishingGuaranteed, fishingTreasure } from "../../widgets/fishing.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { evalPage } from "../helpers/page-eval.mjs";
import { renderLook, looksFor, TEMPLATE_IDS } from "../../ui/glance-templates.mjs";

// FISHING as widgets over the page's own model (_fishModelNow in flowers.html), on the fixture farm.
const FARM = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url), "utf8")).farm;
const HIST = {
  diffs: 74, rods: 1515, baitTotal: 1080, fishTotal: 1806, firstAt: "2026-06-01T00:00:00Z", lastAt: "2026-08-17T00:00:00Z",
  bait: { Earthworm: 700, Grub: 200, "Red Wiggler": 180 },
  fish: { Anchovy: 77, "Red Snapper": 208, Tuna: 146, Crab: 640, "Moray Eel": 123, Napoleanfish: 51, Trout: 14, "Rock Blackfish": 79 },
  treasure: { items: { "Clam Shell": 46, "Old Bottle": 40 }, rods: 516, diffs: 25, total: 86 },
};
const PRICES = { Rod: 0.054, Salt: 0.0039, Earthworm: 0.008, Grub: 0.02, "Red Wiggler": 0.03, "Clam Shell": 0.4, "Old Bottle": 0.1 };
const page = evalPage(["_fishModelNow", "_wCtx", "_wIcon"], { store: { sfl_fishing_ui: JSON.stringify({ plan: { "Radiant Ray|Trout|random:fish normally": true } }) } });
page.api.set("_fishData", HIST); page.api.set("_fishFarm", FARM); page.api.set("_fishLoading", true); page.api.set("_fishPrices", PRICES);
const ICON = (n) => `<i>${n}</i>`;
const ctx = (extra = {}) => ({ icon: ICON, model: (o) => page.api._fishModelNow(o), ...extra });
const M = page.api._fishModelNow({});
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);

test("registered on the FISHING page; they need the farm; the page registers their context with icons", () => {
  assert.strictEqual(FISHING_WIDGETS.length, 9);
  for (const w of FISHING_WIDGETS) {
    assert.strictEqual(WIDGETS[w.type], w, w.type);
    assert.strictEqual(w.page, "fishing");
    assert.deepStrictEqual(w.needs(3), { farm: { res: "farm", farm: 3 } });
    const c = page.api._wCtx(w.type);
    assert.strictEqual(typeof c.model, "function");
    assert.strictEqual(typeof c.icon, "function");
  }
});

test("no model yet → loading; an error → said", () => {
  assert.match(fishingCost.view({}, { model: () => null }).empty, /Reading your fishing history/);
  assert.match(fishingCost.view({}, { model: () => ({ error: "503" }) }).empty, /Could not load the fishing history \(503\)/);
  assert.match(fishingPerFish.build({}, { model: () => null }).empty, /Reading/);
});

test("cost tiles: rods, bait, fish, fish per cast, cost per cast", () => {
  const { html } = fishingCost.view({}, ctx());
  assert.match(html, /<b>1,515<\/b><span>rods spent<\/span>/);
  assert.match(html, new RegExp(`<b>${(1806 / 1080).toFixed(2)}</b><span>fish per cast</span>`));
  assert.match(html, new RegExp(`<b>${M.costPerCast.toFixed(3)} FLOWER</b>`));
});

test("per fish: one row per species caught 3+ times, most caught first, icon and a bar", () => {
  const out = fishingPerFish.build({}, ctx());
  const html = renderTable(fishingPerFish.columns, out.rows, fishingPerFish.defaults, { rowKey: fishingPerFish.rowKey });
  assert.deepStrictEqual(keys(html), M.rows.map((r) => r.name));
  assert.strictEqual(keys(html)[0], "Crab");
  assert.match(html, /<i>Trout<\/i><b>Trout<\/b>/);
  assert.match(html, /class="v-bar"/);
  const trout = M.rows.find((r) => r.name === "Trout");
  assert.match(html, new RegExp(`>${trout.castsEach.toFixed(1)}<`));
});

test("guaranteed: pairs with icons; vs random as a pill (green when cheaper)", () => {
  const out = fishingGuaranteed.build({}, ctx());
  assert.strictEqual(out.rows.length, M.gr.length);
  const html = renderTable(fishingGuaranteed.columns, out.rows, {}, { rowKey: fishingGuaranteed.rowKey });
  assert.match(html, /<i>[^<]+<\/i>[^<]+ \+ \d+× <i>/);
  assert.match(html, /never caught|class="v-pill v-(ok|bad)">[+-]?\d+%/);
});

test("bait: every Fish Market bait, its four season tiles, the season now marked, ingredients with icons", () => {
  const { html } = fishingBait.view({}, ctx());
  for (const b of M.baits) assert.match(html, new RegExp(`<i>${b.bait}</i>${b.bait}</b>`));
  assert.match(html, new RegExp(`${M.season} · now`));
  assert.match(html, /can make \d+/);
  assert.match(html, /<b>\d+×<\/b> <i>[^<]+<\/i>/);
});

test("safe to age: totals as tiles, every agable fish as a row, the divider between free and wanted", () => {
  const { html } = fishingSafeAge.view({}, ctx());
  assert.strictEqual((html.match(/class="v-age-row"/g) || []).length, M.aging.rows.length);
  assert.match(html, new RegExp(`<b>${M.aging.tot.fish.toLocaleString("en-US")}</b><span>free to age`));
  assert.match(html, /A recipe wants these/);
  assert.match(html, /class="v-bar"/);
});

test("Marvels: Full Moon / Helm / Guardian are the copy's options and scale the drop chance", () => {
  assert.deepStrictEqual(fishingMarvels.options.map((o) => o.key), ["moon", "helm", "guardian"]);
  assert.deepStrictEqual(fishingOrder.options.map((o) => o.key), ["moon", "helm", "guardian"]);
  const plain = fishingMarvels.view({}, ctx(), {}).html;
  const moon = fishingMarvels.view({}, ctx(), { moon: true, helm: true }).html;
  assert.match(plain, /= 1× drop chance/);
  assert.match(moon, /= 4× drop chance/);
  assert.notStrictEqual(page.api._fishModelNow({ moon: true }).marvels.planTotal, M.marvels.planTotal);
  assert.match(moon, /onchange="_fishPlanToggle\(/);
  assert.match(moon, /to go<\/b>/);
  assert.strictEqual(fishingMarvels.titleFor({ moon: true }), "🗺️ Marine Marvel planner — what each map really costs · 🌕");
});

test("order: the ticked route's shopping list with icons and tiles; nothing ticked says so", () => {
  page.api.set("_fishPlan", {}); page.api.set("_fishMemo", null);
  assert.match(fishingOrder.view({}, ctx()).html, /Nothing ticked yet/);
  const card = page.api._fishModelNow({}).marvels.cards.find((c) => !c.owned && c.evaluated[0].routes.length);
  const route = card.evaluated[0].routes[0];
  page.api.set("_fishPlan", { [route.key]: true }); page.api.set("_fishMemo", null);
  const { html } = fishingOrder.view({}, ctx());
  assert.match(html, new RegExp(card.marvel));
  assert.match(html, new RegExp(`via ${card.evaluated[0].fish}`));
  assert.match(html, /total casts/);
  assert.match(html, /<td><i>[^<]+<\/i>[^<]+<\/td>/);
  assert.match(html, /_fishPlanClear\(\)/);
});

test("today: the worm to cast, a bar per worm, the seasons table; treasure with its value", () => {
  const { html } = fishingToday.view({}, ctx());
  assert.match(html, new RegExp(`<b>${M.today.bestW.worm}</b><span>🪱 cast this season</span>`));
  assert.strictEqual((html.match(/class="v-bar"/g) || []).length, 3);
  assert.match(html, /worms by season/);
  const t = fishingTreasure.view({}, ctx()).html;
  assert.match(t, /<i>Clam Shell<\/i>Clam Shell/);
  assert.match(t, new RegExp(`${(46 * 0.4 + 40 * 0.1).toFixed(2)} FLOWER`));
});

const rowsIn = (html) => (html.match(/class="gx-row[" ]/g) || []).length;

test("📱 glance models: every fishing widget has a model and a natural look, no hand-written face; no model → loading, an error → said", () => {
  for (const w of FISHING_WIDGETS) {
    assert.strictEqual(typeof w.glanceModel, "function", w.type);
    assert.ok(TEMPLATE_IDS.includes(w.look), w.type);
    assert.strictEqual(w.glance, undefined, w.type);
    assert.strictEqual(w.sizes, undefined, w.type);
    assert.match(w.glanceModel({}, { model: () => null }, {}).empty, /Reading your fishing history/, w.type);
    assert.match(w.glanceModel({}, { model: () => ({ error: "503" }) }, {}).empty, /Could not load the fishing history \(503\)/, w.type);
  }
});

test("📱 glance models: today = the worm to cast, the three worms; bait = the cheapest, every bait", () => {
  const m = fishingToday.glanceModel({}, ctx(), {});
  assert.deepStrictEqual([m.head.value, m.head.unit, m.head.cap], ["13.8k", " XP/🌸", "cast Grub · autumn"]);
  assert.strictEqual(m.items.length, 3);
  assert.deepStrictEqual([m.items[0].icon, m.items[0].name, m.items[0].value, m.items[0].tone], ["<i>Earthworm</i>", "Earthworm", m.items[0].value, ""]);
  const grub = m.items.find((i) => i.name === "Grub");
  assert.deepStrictEqual([grub.value, grub.tone, grub.pct], ["13.8k", "ok", 100]);
  assert.match(renderLook(m, "number").html, /<div class="gx-num(?: gx-num-long)?">13.8k<small> XP\/🌸<\/small><\/div><div class="gx-cap">cast Grub · autumn<\/div>/);
  assert.ok(looksFor(m).length >= 3);
  const b = fishingBait.glanceModel({}, ctx(), {});
  assert.deepStrictEqual([b.head.value, b.head.cap], ["0.11", "Crab Stick · can make 7"]);
  assert.strictEqual(b.items.length, M.baits.filter((x) => x.complete).length);
  assert.deepStrictEqual([b.items[0].name, b.items[0].sub, b.items[0].value, b.items[0].tone], ["Crab Stick", "can make 7 · 4h", "0.11 🌸", "ok"]);
  assert.strictEqual(rowsIn(renderLook(b, "number-list-2").html), 3);
  // 4-5 baits: the 2×1 "Number + list" would hide one or two, so the board uses the taller one
  assert.ok(!looksFor(b).includes("number-list-2") && looksFor(b).includes("number-list-t"), "a look that shows every bait is offered");
});

test("📱 glance models: safe to age = the free fish with a salt ring, the held fish; Marvels = maps left, cheapest first, then the caught", () => {
  const s = fishingSafeAge.glanceModel({}, ctx(), {});
  assert.deepStrictEqual([s.head.value, s.head.unit, s.head.cap, s.head.ringTone], ["26", " fish", "free to age · 195k XP", "ok"]);
  assert.deepStrictEqual([s.items[0].name, s.items[0].sub, s.items[0].value, s.items[0].pct], ["Saw Shark", "3 held · 7.3h", "57.6k", 100]);
  assert.match(renderLook(s, "number").html, /<div class="gx-corner"><svg class="gx-ring g-ok"/);
  assert.ok(looksFor(s).length >= 3);
  const v = fishingMarvels.glanceModel({}, ctx(), {});
  assert.deepStrictEqual([v.head.value, v.head.unit, v.head.cap], [8, "/8", "maps left · 1.3k 🌸 cheapest"]);
  assert.deepStrictEqual(v.items.slice(0, 3).map((i) => i.name), ["Gilded Swordfish", "Twilight Anglerfish", "Starlight Tuna"]);
  assert.deepStrictEqual([v.items[0].sub, v.items[0].value], ["via White Shark", "2.5 🌸"]);
  const owned = { ...M, marvels: { ...M.marvels, cards: M.marvels.cards.map((c) => ({ ...c, owned: true })) } };
  const all = fishingMarvels.glanceModel({}, { model: () => owned }, {});
  assert.deepStrictEqual([all.head.value, all.head.cap], ["✓", "every Marine Marvel caught"]);
  assert.deepStrictEqual(all.items[0].chip, { text: "caught", tone: "ok" });
});

test("📱 glance models: order = what the ticked routes cost and the shopping list, nothing ticked is empty; cost = per cast, the rods and bait", () => {
  page.api.set("_fishPlan", {}); page.api.set("_fishMemo", null);
  assert.match(fishingOrder.glanceModel({}, ctx(), {}).empty, /Nothing ticked yet/);
  const card = page.api._fishModelNow({}).marvels.cards.find((c) => !c.owned && c.evaluated[0].routes.length);
  page.api.set("_fishPlan", { [card.evaluated[0].routes[0].key]: true }); page.api.set("_fishMemo", null);
  const o = page.api._fishModelNow({}).order;
  const m = fishingOrder.glanceModel({}, ctx(), {});
  assert.match(m.head.cap, /^1 marvel · [\d,]+ casts$/);
  assert.strictEqual(m.items.length, o.rows.length);
  assert.deepStrictEqual(m.tiles[0], { label: "marvels", value: 1 });
  const c = fishingCost.glanceModel({}, ctx(), {});
  assert.deepStrictEqual([c.head.value, c.head.cap], [M.costPerCast.toFixed(3), "a cast · over 1,515 rods"]);
  assert.deepStrictEqual(c.items.map((i) => i.name), ["Rod", "Earthworm", "Grub", "Red Wiggler"]);
  assert.deepStrictEqual([c.items[0].value, c.items[0].pct], ["1.5k", 100]);
  assert.match(renderLook(c, "tiles-t").html, /<span>rods<\/span><b>1.5k<\/b>.*<span>per cast<\/span><b>1.67<\/b>/);
  assert.ok(looksFor(c).length >= 3);
});

test("📱 glance models: per fish and guaranteed = the best XP per FLOWER and the list; treasure = the share of a cast back and what was found", () => {
  const pf = fishingPerFish.glanceModel({}, ctx(), {});
  assert.deepStrictEqual([pf.head.value, pf.head.cap], ["2.6k", "Moray Eel · aged"]);
  assert.strictEqual(pf.items[0].name, "Moray Eel");
  assert.ok(looksFor(pf).length >= 3);
  assert.match(fishingPerFish.glanceModel({}, { model: () => ({ ...M, rows: [] }) }, {}).empty, /No species caught/);
  const g = fishingGuaranteed.glanceModel({}, ctx(), {});
  assert.deepStrictEqual([g.head.value, g.head.cap], ["23.2k", "White Shark · Red Wiggler + Rich Chicken"]);
  const tuna = g.items.find((i) => i.name === "Tuna");
  assert.match(tuna.sub, /^\d+× Orange$/);
  assert.deepStrictEqual(tuna.chip, { text: "−85%", tone: "ok" });
  assert.match(renderLook(g, "list-4").html, /<div class="gx-n">Tuna<div>\d+× Orange<\/div><\/div><span class="gx-chip g-ok">−85%<\/span>/);
  const back = (46 * 0.4 + 40 * 0.1) / 516;
  const t = fishingTreasure.glanceModel({}, ctx(), {});
  assert.deepStrictEqual([t.head.value, t.head.unit, t.head.cap], [((back / M.costPerCast) * 100).toFixed(0), "%", `of a cast's cost comes back · ${back.toFixed(4)} 🌸`]);
  assert.deepStrictEqual(t.items.map((i) => [i.name, i.value]), [["Clam Shell", "46"], ["Old Bottle", "40"]]);
  const none = { ...M, treasure: { tr: { items: {}, rods: 0, diffs: 0, total: 0 }, trVal: 0 } };
  assert.match(fishingTreasure.glanceModel({}, { model: () => none }, {}).empty, /No clean treasure sample/);
});
