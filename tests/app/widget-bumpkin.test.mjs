import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { bumpkinXp, bumpkinFood, bumpkinBoosts, bumpkinKitchens, bumpkinPlanWidget, bumpkinPlan, cookingQuery } from "../../widgets/bumpkin.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { buildCookingSection } from "../../core/sections/cooking.mjs";
import { renderLook, looksFor } from "../../ui/glance-templates.mjs";

// BUMPKIN as widgets, on the real fixture farm (level 186, not ascended) and the engine's cooking
// payload — the same numbers the old page showed (checked against it when the page was converted).

const farm = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url))).farm;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const cook = buildCookingSection(farm, p2p, { savedRecipes: {}, petSimulate: false });
const ascended = { ...farm, island: { ...farm.island, ascensionLevel: 1 } };
const PAGE = { target: 200, recipes: {}, sort: "xpPerHour" };
const CTX = { page: () => PAGE, icon: (n) => `<i>${n}</i>`, sfl: (v) => v.toFixed(2), cookTime: (s) => `${s}s` };
const table = (w, out) => renderTable(w.columns, out.rows, w.defaults, { rowKey: w.rowKey, rowClass: w.rowClass });
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);

test("registered on BUMPKIN; each needs the farm and the page's section=cooking query", () => {
  for (const w of [bumpkinXp, bumpkinFood, bumpkinBoosts, bumpkinKitchens, bumpkinPlanWidget]) {
    assert.strictEqual(WIDGETS[w.type], w);
    assert.strictEqual(w.page, "bumpkin");
    assert.deepStrictEqual(Object.keys(w.needs(7)), ["farm", "cook"]);
  }
  assert.deepStrictEqual(cookingQuery(7), { res: "compute", farm: 7, section: "cooking",
    q: { petSimulate: "0", recipes: "{}", fishReels: "0", explain: "1" } });
  assert.deepStrictEqual(bumpkinXp.optional, ["cook"], "the level shows before the cooking payload");
});

test("plan: kitchens add up to the engine's XP/day; days and costs to the target from the level after food", () => {
  const p = bumpkinPlan(farm, cook, PAGE);
  assert.strictEqual(p.currentLevel, 186);
  assert.strictEqual(p.targetLevel, 200);
  assert.ok(Math.abs(p.totalXPPerDay - cook.totalXpPerDay) < 1e-6, "every default recipe cooks → the engine's total");
  assert.strictEqual(p.levelAfterFood, 187);
  assert.strictEqual(p.totalDays, Math.ceil(p.xpAfterFood / p.totalXPPerDay));
  assert.strictEqual(p.ladder.length, 13);
  assert.strictEqual(p.ladder[0].level, 188);
  assert.ok(Math.abs(p.ladder[0].cost - p.costToNextLevel) < 1e-9, "the first rung is the cost to the next level");
  // a kitchen set to "" (not cooking) drops out
  const off = bumpkinPlan(farm, cook, { ...PAGE, recipes: { Deli: "" } });
  assert.strictEqual(off.buildings.find((b) => b.name === "Deli").selected, null);
  assert.ok(off.totalXPPerDay < p.totalXPPerDay);
});

test("XP tile: level, XP, the way to the target; a per-copy target", () => {
  const html = bumpkinXp.view({ farm, cook }, CTX, {}).html;
  assert.match(html, /<b>LVL 186<\/b><span>level<\/span>/);
  assert.match(html, /<b>65,060,964<\/b><span>XP to level 200<\/span>/);
  assert.match(html, /class="v-big"><i style="width:73%">/);
  assert.match(html, /73\.4% to level 200/);
  assert.match(html, /Level 186 → 187: 19%/);
  assert.match(bumpkinXp.view({ farm, cook }, CTX, { target: 190 }).html, /% to level 190/);
});

test("XP tile, ascended: band progress, the cap note and the 12 expansion gates at the cooking pace", () => {
  const html = bumpkinXp.view({ farm: ascended, cook }, CTX, {}).html;
  assert.match(html, /<b>LVL 200<\/b><span>XP worth L228<\/span>/);
  assert.match(html, /<b>28\/50<\/b><span>band A2<\/span>/);
  assert.match(html, /40,188,869 XP to complete Ascension A2 · ~29 d → ready for A3/);
  assert.strictEqual((html.match(/class="v-bumpkin-gate[ "]/g) || []).length, 12);
  assert.match(html, /✅ expansion #8 /);
  assert.match(html, /🔒 expansion #9 .*?\+[\d,]+ XP · ~\d+ d/);
  // no cooking payload yet → no days, the gates still show
  assert.doesNotMatch(bumpkinXp.view({ farm: ascended }, CTX, {}).html, /~\d+ d/);
});

test("banked food: every dish with its icon and XP, the level after eating", () => {
  const out = bumpkinFood.build({ farm, cook }, CTX, {});
  assert.strictEqual(out.rows.length, cook.bankedFood.items.length);
  assert.match(out.summary, /<b>LVL 187<\/b><span>after eating all food<\/span>/);
  assert.match(out.summary, /\+1 level \(184,773,311 XP total, 63% to 188\)/);
  assert.match(out.footer, /XP still needed to level 200/);
  const html = table(bumpkinFood, out);
  const top = [...cook.bankedFood.items].sort((a, b) => b.totalFoodXP - a.totalFoodXP)[0].name;
  assert.strictEqual(keys(html)[0], top, "the most XP first");
  assert.match(html, new RegExp(`<i>${top}</i><div><b>${top}</b>`));
  assert.match(html, /class="v-bar"><i class="v-ok"/);
  assert.match(bumpkinFood.build({ farm }, CTX, {}).empty, /Loading cooking data/);
});

test("boosts: XP and time boosts with icons, the pet streak as pills", () => {
  const html = bumpkinBoosts.view({ farm, cook }, CTX).html;
  assert.match(html, /<i>Observatory<\/i>Observatory<\/span><b>×1\.05<\/b>/);
  assert.match(html, /Pet's Streak/);
  assert.match(html, /class="v-pill v-(ok|bad)">(qualified for next week|feed your pet)/);
  assert.match(html, /Time boosts/);
});

test("kitchens: one row per building with recipe, XP, cost, ingredients and fish route — all with icons", () => {
  const out = bumpkinKitchens.build({ farm, cook }, CTX, {});
  assert.deepStrictEqual(out.rows.map((r) => r.name), Object.keys(cook.buildings));
  const html = table(bumpkinKitchens, out);
  assert.match(html, /<b>Fire Pit<\/b>/);
  assert.match(html, /<small><i>Pizza Margherita<\/i>Pizza Margherita<\/small>/, "on a board: the recipe with its icon");
  assert.match(html, /<small class="v-bumpkin-ing">\d+× <i>[A-Z][^<]+<\/i>/, "ingredients with icons");
  assert.match(html, /🐟 <b><i>Tuna<\/i>Tuna<\/b>: <i>Red Wiggler<\/i>Red Wiggler only, 27\.3% a cast — 0\.58 a cast ÷ 1\.2 fish per cast → 0\.49 SFL\/fish/);
  assert.match(html, /L\d \(×\d slots\)/, "the Aging Shed's level");
  assert.match(out.footer, /6 of 6 kitchens cooking/);
  // the page: a recipe picker per row, ordered by the copy's sort
  const page = bumpkinKitchens.build({ farm, cook }, { ...CTX, editable: true }, { sort: "sflPerCook" });
  const ph = table(bumpkinKitchens, page);
  assert.match(ph, /<select class="v-bumpkin-select" onchange="selectBumpkinRecipe\('Fire Pit', this\.value\)">/);
  assert.match(ph, /<option value="Pizza Margherita" selected>Pizza Margherita · [\d.,—<]+ SFL\/cook<\/option>/, "a short option: the name and the metric it is ordered by");
});

test("kitchens look: the recipe picker sits on one line with its icon, whole-number XP, quiet colours, fewer default columns", () => {
  const page = bumpkinKitchens.build({ farm, cook }, { ...CTX, editable: true }, {});
  const ph = table(bumpkinKitchens, page);
  assert.match(ph, /<small class="v-bumpkin-pick"><i>Pizza Margherita<\/i><select /, "icon and select in one nowrap line");
  assert.match(ph, /<option value="Pizza Margherita" selected>Pizza Margherita · [\d,]+ XP\/h<\/option>/);
  const row = page.rows.find((r) => r.name === "Fire Pit");
  const xpCol = bumpkinKitchens.columns.find((c) => c.key === "xp");
  assert.doesNotMatch(xpCol.fmt(50025.94, row), /\./, "XP/cook rounded");
  assert.doesNotMatch(bumpkinKitchens.columns.find((c) => c.key === "xpPerDay").fmt(445643.79, row), /445,643\.79/);
  assert.match(bumpkinKitchens.columns.find((c) => c.key === "time").fmt(1, row), /class="v-nowrap"/, "a time never wraps");
  assert.deepStrictEqual(bumpkinKitchens.columns.filter((c) => c.extra).map((c) => c.key).sort(), ["xp", "xpPerSfl"], "XP/cook and XP/SFL on demand");
});

test("leveling plan: tiles, per-kitchen split and the cost per level", () => {
  const out = bumpkinPlanWidget.build({ farm, cook }, CTX, {});
  assert.match(out.summary, /<b>1,430,721<\/b><span>XP \/ day, all kitchens<\/span>/);
  assert.match(out.summary, /<b>42 days<\/b><span>to level 200 \(after eating food\)<\/span>/);
  assert.match(out.summary, /<b>99\.76 SFL<\/b><span>ingredient cost \/ day \(P2P\)<\/span>/);
  assert.match(out.summary, /<b>101\.26 SFL<\/b><span>to level 188 \(after food\) · 2d<\/span>/);
  assert.match(out.summary, /class="v-bumpkin-per"/);
  const html = table(bumpkinPlanWidget, out);
  assert.strictEqual(keys(html)[0], "188");
  assert.strictEqual(out.rows.length, 13);
  assert.match(out.footer, /Cost per level 188 → 200/);
  // a higher-level copy of the target
  assert.strictEqual(bumpkinPlanWidget.build({ farm, cook }, CTX, { target: 190 }).rows.length, 3);
});

test("no farm / no bumpkin → a message", () => {
  assert.match(bumpkinXp.view({}, CTX, {}).empty, /No farm data/);
  assert.match(bumpkinKitchens.build({ farm: { inventory: {} }, cook }, CTX, {}).empty, /No bumpkin data/);
});

test("per-copy settings: pet streak and fish-by-reels change this copy's cooking query; sort lives on the kitchens widget", () => {
  const q = bumpkinKitchens.needs(7, { petSimulate: true, fishReels: true }).cook.q;
  assert.deepStrictEqual([q.petSimulate, q.fishReels], ["1", "1"]);
  assert.deepStrictEqual([bumpkinKitchens.needs(7, {}).cook.q.petSimulate, bumpkinKitchens.needs(7, {}).cook.q.fishReels], ["0", "0"]);
  for (const w of [bumpkinFood, bumpkinBoosts, bumpkinKitchens, bumpkinPlanWidget]) {
    const keys = (w.options || []).map((o) => o.key);
    assert.ok(keys.includes("petSimulate") && keys.includes("fishReels"), w.type);
  }
  const sort = bumpkinKitchens.options.find((o) => o.key === "sort");
  assert.deepStrictEqual(sort.choices.map(([v]) => v), ["xpPerHour", "xpPerSfl", "sflPerCook"]);
  assert.strictEqual(bumpkinKitchens.defaults.opts.sort, "xpPerHour");
});

test("ascended: the target is an ascension and a level in its band — by default finishing the band being filled", () => {
  const p = bumpkinPlan(ascended, cook, { recipes: {} });
  assert.strictEqual(p.targetLabel, `A${p.workBand} L50`);
  assert.ok(Math.abs(p.xpRemaining - p.xpToBandDone) < 1e-6, "finishing the band = the XP to complete it");
  const next = p.workBand + 1;
  const far = bumpkinPlan(ascended, cook, { recipes: {}, targetAsc: next, targetBand: 10 });
  assert.strictEqual(far.targetLabel, `A${next} L10`);
  assert.strictEqual(far.ladder.at(-1).level, `A${next} L10`);
  assert.ok(far.ladder.length > p.ladder.length);
  assert.ok(far.xpRemaining > p.xpRemaining);
  // the plan widget says it, never "level 200"
  const out = bumpkinPlanWidget.build({ farm: ascended, cook }, CTX, { targetAsc: next, targetBand: 10 });
  assert.match(out.summary, new RegExp(`to A${next} L10`));
  assert.doesNotMatch(out.summary, /TARGET REACHED/);
});

test("kitchens: a kitchen that is not cooking renders, no crash on its empty numbers", () => {
  const out = bumpkinKitchens.build({ farm, cook }, { ...CTX, page: () => ({ ...PAGE, recipes: { Deli: "" } }) }, {});
  assert.doesNotThrow(() => table(bumpkinKitchens, out));
});

test("📱 glance models: XP (the level with a ring, the numbers as tiles), kitchens (XP a day, the kitchens with their share), leveling plan (days, the ladder)", () => {
  const x = bumpkinXp.glanceModel({ farm, cook }, CTX);
  assert.strictEqual(bumpkinXp.look, "number");
  assert.match(String(x.head.value), /^L\d+$/);
  assert.ok(x.head.ring >= 0 && x.head.ring <= 100);
  assert.deepStrictEqual(x.tiles.map((t) => t.label), ["XP", "XP / day", "to go"]);
  assert.match(renderLook(x, "number").html, /<div class="gx-num(?: gx-num-long)?">L\d+<\/div><div class="gx-cap">\d+ % to L200<\/div>/);
  assert.ok(looksFor(x).length >= 3);
  assert.match(String(bumpkinXp.glanceModel({ farm: ascended, cook }, CTX).head.value), /^A\d+$/);
  assert.match(bumpkinXp.glanceModel({}, CTX).empty, /No farm data/);

  const k = bumpkinKitchens.glanceModel({ farm, cook }, CTX);
  assert.strictEqual(bumpkinKitchens.look, "number-list-2");
  assert.match(k.head.cap, /6 of 6 kitchens cooking/);
  assert.strictEqual(k.items.length, 6);
  assert.deepStrictEqual(Object.keys(k.items[0]), ["icon", "name", "sub", "value", "pct"]);
  assert.match(k.items.find((i) => i.name === "Fire Pit").sub, /^Pizza Margherita · /);
  assert.ok(Math.abs(k.items.reduce((a, i) => a + i.pct, 0) - 100) < 1e-6, "shares of the day add up");
  assert.strictEqual((renderLook(k, "number-list-2").html.match(/class="gx-row[" ]/g) || []).length, 3);
  assert.ok(looksFor(k).length >= 3);

  const p = bumpkinPlanWidget.glanceModel({ farm, cook }, CTX);
  assert.deepStrictEqual([p.head.value, p.head.unit, p.head.cap], ["42", " days", "to level 200"]);
  assert.strictEqual(p.items[0].name, "L188");
  assert.match(p.items[0].sub, /^[\d.]+ d$/);
  assert.match(renderLook(p, "tiles-1").html, /<span>XP \/ day<\/span><b>1\.4M<\/b>/);
  assert.ok(looksFor(p).length >= 3);
  assert.match(bumpkinPlanWidget.glanceModel({ farm }, CTX).empty, /Loading cooking data/);
  for (const w of [bumpkinXp, bumpkinKitchens, bumpkinPlanWidget]) assert.strictEqual(w.glance, undefined);
});

test("📱 glance models: banked food (XP and the level after eating, the dishes biggest first) and cooking boosts (pet streak, every boost)", () => {
  const f = bumpkinFood.glanceModel({ farm, cook }, CTX);
  assert.strictEqual(bumpkinFood.look, "number");
  assert.deepStrictEqual([f.head.unit, f.head.cap], [" XP", "L187 after eating · +1"]);
  const top = [...cook.bankedFood.items].sort((a, b) => b.totalFoodXP - a.totalFoodXP);
  assert.strictEqual(f.items.length, top.length);
  assert.deepStrictEqual([f.items[0].icon, f.items[0].name, f.items[0].sub], [`<i>${top[0].name}</i>`, top[0].name, `${top[0].qty}×`]);
  assert.ok(f.items[0].pct > 0 && f.items[0].pct <= 100);
  assert.match(renderLook(f, "list-4").html, new RegExp(`<span class="gx-ic"><i>${top[0].name}</i></span><div class="gx-n">${top[0].name}<div>${top[0].qty}×</div>`));
  assert.ok(looksFor(f).length >= 3);
  assert.match(bumpkinFood.glanceModel({ farm }, CTX).empty, /Loading cooking data/);
  assert.match(bumpkinFood.glanceModel({ farm, cook: { ...cook, bankedFood: { totalXp: 0, items: [] } } }, CTX).empty, /No cooked food/);
  assert.match(bumpkinFood.glanceModel({}, CTX).empty, /No farm data/);

  const ps = cook.boosts.petStreakInfo;
  const b = bumpkinBoosts.glanceModel({ farm, cook }, CTX);
  assert.strictEqual(b.head.value, `×${ps.multiplier}`);
  assert.match(b.head.cap, new RegExp(`^pet streak ${ps.streak}w · (next week ✓|feed your pet!)$`));
  const xpN = cook.boosts.xpBoosts.filter((x) => !x.petStreak).length;
  assert.strictEqual(b.items[0].name, "Pet's Streak");
  assert.deepStrictEqual(b.items.find((i) => i.name === "Observatory"), { icon: "<i>Observatory</i>", name: "Observatory", sub: "XP", value: "×1.05" });
  assert.deepStrictEqual(b.tiles[0], { label: "XP boosts", value: xpN });
  assert.match(renderLook(b, "number").html, new RegExp(`<div class="gx-num g-(ok|warn)">×${ps.multiplier}</div>`));
  assert.ok(looksFor(b).length >= 3);
  assert.match(bumpkinBoosts.glanceModel({ farm }, CTX).empty, /Loading cooking data/);
  assert.match(bumpkinBoosts.glanceModel({}, CTX).empty, /No farm data/);
  for (const w of [bumpkinFood, bumpkinBoosts]) assert.strictEqual(w.glance, undefined);
});

