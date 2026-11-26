import "../helpers/page-engine.mjs";
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { FISHING_WIDGETS, fishingToday, fishingBait, fishingSafeAge, fishingMarvels, fishingOrder, fishingCost, fishingPerFish,
  fishingGuaranteed, fishingTreasure } from "../../widgets/fishing.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { evalPage } from "../helpers/page-eval.mjs";

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
