import { test } from "node:test";
import assert from "node:assert";
import { targetList as W } from "../../widgets/target-list.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { renderLook, looksFor } from "../../ui/glance-templates.mjs";
import { FLOWER_RECIPES, DOLL_RECIPES } from "../../core/data/recipes.mjs";
import { CRUSTACEAN_RECIPES } from "../../core/data/crafting.mjs";
import { COOKING_RECIPES_DATA } from "../../core/data/cooking.mjs";

// 🎯 Do limitu: one widget type, pinned as often as wanted, each copy with its own category, limit,
// "hide what is done" and (for food) its own pick of dishes.

const opts = (o) => ({ ...W.defaults.opts, ...o });
const byName = (rows) => Object.fromEntries(rows.map((r) => [r.name, r]));
const all = (names, n) => Object.fromEntries(names.map((k) => [k, String(n)]));

test("registered; needs only the farm; options: category, limit, hide done, dishes", () => {
  assert.strictEqual(WIDGETS["target-list"], W);
  assert.deepStrictEqual(W.needs(7), { farm: { res: "farm", farm: 7 } });
  assert.deepStrictEqual(W.options.map((o) => o.key), ["cat", "limit", "hideDone", "lists", "foods"]);
  assert.deepStrictEqual(W.defaults.opts, { cat: "dolls", limit: 5, hideDone: true, lists: [], foods: [] });
});

test("dolls to the limit: have + in progress vs the limit; done rows hidden by default", () => {
  const inv = all(Object.keys(DOLL_RECIPES), 10);
  inv["Doll"] = "3.0"; inv["Angler Doll"] = "9";
  const ctx = { inProgress: () => ({ "Angler Doll": 1 }) };
  const { rows } = W.build({ farm: { inventory: inv } }, ctx, opts({ cat: "dolls", limit: 10 }));
  assert.deepStrictEqual(rows.map((r) => r.name), ["Doll"]);
  assert.deepStrictEqual([rows[0].have, rows[0].pend, rows[0].need, rows[0].missing], [3, 0, 10, 7]);
  assert.match(rows[0].recipe, /4× Leather, 5× Wool/);
  // dolls without a recipe (not craftable yet) are left out, as the DASH suggestions do
  assert.match(W.build({ farm: { inventory: inv } }, ctx, opts({ cat: "dolls", limit: 10 })).summary, /<b>18 \/ 19<\/b><span>at the limit<\/span>/);
  // with done rows shown, Angler Doll is there and done
  const shown = byName(W.build({ farm: { inventory: inv } }, ctx, opts({ cat: "dolls", limit: 10, hideDone: false })).rows);
  assert.strictEqual(Object.keys(shown).length, 19);
  assert.ok(!shown["Solar Doll"]);
  assert.deepStrictEqual([shown["Angler Doll"].missing, shown["Angler Doll"].done], [0, true]);
});

test("everything at the limit: a ✓ message instead of an empty table", () => {
  const out = W.build({ farm: { inventory: all(Object.keys(CRUSTACEAN_RECIPES), 5) } }, {}, opts({ cat: "crabs", limit: 5 }));
  assert.strictEqual(out.rows.length, 0);
  assert.match(out.empty, /✓ All at the limit \(16\)/);
});

test("crustaceans: pot and chum as the recipe; one without chum says so", () => {
  const r = byName(W.build({ farm: { inventory: {} } }, {}, opts({ cat: "crabs", limit: 2 })).rows);
  assert.match(r["Blue Crab"].recipe, /Crab Pot · 3× Heart Leaf/);
  assert.match(r["Isopod"].recipe, /Crab Pot · no bait/);
  assert.strictEqual(r["Isopod"].missing, 2);
});

test("flowers: a flower that other flowers are grown from also needs what they still miss", () => {
  const inv = all(Object.keys(FLOWER_RECIPES), 2);
  inv["Yellow Pansy"] = "0"; inv["Yellow Cosmos"] = "1";
  const r = byName(W.build({ farm: { inventory: inv } }, {}, opts({ cat: "flowers", limit: 2 })).rows);
  assert.deepStrictEqual(Object.keys(r).sort(), ["Yellow Cosmos", "Yellow Pansy"]);
  assert.deepStrictEqual([r["Yellow Cosmos"].need, r["Yellow Cosmos"].missing], [2, 1]);
  assert.deepStrictEqual([r["Yellow Pansy"].need, r["Yellow Pansy"].missing], [3, 3], "2 own + 1 for Yellow Cosmos");
  assert.match(r["Yellow Pansy"].recipe, /Sunpetal Seed \+ Sunflower/);
});

test("food: only the picked dishes; nothing picked → a hint; recipe and kitchen shown", () => {
  const none = W.build({ farm: { inventory: {} } }, {}, opts({ cat: "foods", foods: [] }));
  assert.strictEqual(none.rows.length, 0);
  assert.match(none.empty, /Pick lists or dishes/);
  const r = W.build({ farm: { inventory: { "Pumpkin Soup": "4" } } }, {}, opts({ cat: "foods", limit: 5, foods: ["Pumpkin Soup", "Nope"] })).rows;
  assert.deepStrictEqual(r.map((x) => [x.name, x.missing]), [["Pumpkin Soup", 1]]);
  assert.match(r[0].recipe, /🔥 Fire Pit · 10× Pumpkin/);
  // the dish checklist offers every recipe, only when the category is food
  const foods = W.options.find((o) => o.key === "foods");
  assert.strictEqual(foods.choices({ cat: "foods" }).length, Object.keys(COOKING_RECIPES_DATA).length);
  assert.deepStrictEqual(foods.choices({ cat: "dolls" }), []);
});

test("title names the category and the limit; table: most missing first, icon from the page", () => {
  assert.strictEqual(W.titleFor(opts({ cat: "dolls", limit: 10 })), "🎯 Dolls to 10");
  assert.strictEqual(W.titleFor(opts({ cat: "foods", limit: 3 })), "🎯 Dishes to 3");
  const { rows } = W.build({ farm: { inventory: { Doll: "8" } } }, { icon: (n) => `<i>${n}</i>` }, opts({ cat: "dolls", limit: 10 }));
  const html = renderTable(W.columns, rows, W.defaults, { rowKey: W.rowKey });
  const order = [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);
  assert.strictEqual(order[order.length - 1], "Doll", "Doll misses 2, every other doll 10");
  assert.match(html, /<i>Doll<\/i>/);
});

test("no farm: a clear empty message", () => {
  assert.match(W.build({}, {}, opts({})).empty, /No farm data/);
});

test("dolls: the page's tracked dolls (ctx.tracked) narrow the list", () => {
  const ctx = { tracked: { Doll: true, "Angler Doll": false } };
  const rows = W.build({ farm: { inventory: {} } }, ctx, opts({ cat: "dolls", limit: 2, hideDone: false })).rows;
  assert.deepStrictEqual(rows.map((r) => r.name), ["Doll"]);
});

test("each row has its progress bar; the count shows have + running / target", () => {
  const { rows } = W.build({ farm: { inventory: { Doll: "3" } } }, { inProgress: () => ({ Doll: 1 }) }, opts({ cat: "dolls", limit: 10, hideDone: false }));
  const html = renderTable(W.columns, rows.filter((r) => r.name === "Doll"), W.defaults, { rowKey: W.rowKey });
  assert.match(html, /class="v-bar"><i class="v-bad" style="width:40%">/);
  assert.match(html, />3<em>\+1<\/em> \/ 10</);
});

test("dishes: whole lists instead of single dishes — every food a pet can request, by difficulty (the game's pool)", () => {
  const lists = W.options.find((o) => o.key === "lists");
  assert.deepStrictEqual(lists.choices({ cat: "foods" }).map(([v]) => v), ["pets-easy", "pets-medium", "pets-hard"]);
  assert.deepStrictEqual(lists.choices({ cat: "dolls" }), []);
  const easy = W.build({ farm: { inventory: {} } }, {}, opts({ cat: "foods", limit: 2, hideDone: false, lists: ["pets-easy"] })).rows;
  assert.strictEqual(easy.length, 14);
  assert.ok(easy.some((r) => r.name === "Mashed Potato") && easy.some((r) => r.name === "Purple Smoothie"));
  // lists and single picks together, each dish once
  const both = W.build({ farm: { inventory: {} } }, {}, opts({ cat: "foods", limit: 2, hideDone: false, lists: ["pets-easy", "pets-medium", "pets-hard"], foods: ["Popcorn", "Pumpkin Soup", "Pizza Margherita", "Chowder"] })).rows;
  assert.strictEqual(both.length, 64 + 1, "64 pet foods + Chowder");
  assert.match(W.titleFor(opts({ cat: "foods", limit: 3, lists: ["pets-hard"] })), /Dishes to 3/);
});

test("every item in a recipe has its icon: dolls, crustaceans, dishes, flowers", () => {
  const ctx = { icon: (n) => `<i>${n}</i>` };
  const row = (cat, name, o = {}) => W.build({ farm: { inventory: {} } }, ctx, opts({ cat, limit: 2, hideDone: false, ...o })).rows.find((r) => r.name === name);
  const html = (r) => renderTable(W.columns, [r], W.defaults, { rowKey: W.rowKey });
  assert.match(html(row("dolls", "Doll")), /4× <i>Leather<\/i>Leather, 5× <i>Wool<\/i>Wool/);
  assert.match(html(row("crabs", "Blue Crab")), /<i>Crab Pot<\/i>Crab Pot · 3× <i>Heart Leaf<\/i>Heart Leaf/);
  assert.match(html(row("foods", "Pumpkin Soup", { foods: ["Pumpkin Soup"] })), /Fire Pit · 10× <i>Pumpkin<\/i>Pumpkin/);
  assert.match(html(row("flowers", "Yellow Pansy")), /<i>Sunpetal Seed<\/i>Sunpetal Seed \+ <i>Sunflower<\/i>Sunflower/);
});

test("📱 glance model: at the limit / all with a ring (done rows count even when hidden); items most missing first with progress", () => {
  const inv = all(Object.keys(DOLL_RECIPES), 10);
  inv["Doll"] = "3.0"; inv["Angler Doll"] = "8";
  const ctx = { inProgress: () => ({ "Angler Doll": 1 }), icon: (n) => `<i>${n}</i>` };
  const m = W.glanceModel({ farm: { inventory: inv } }, ctx, opts({ cat: "dolls", limit: 10 }));
  assert.deepStrictEqual({ ...m.head, ring: Math.round(m.head.ring) }, { value: 17, unit: "/19", ring: 89, ringTone: "accent", tone: "", cap: "8 missing in total" });
  assert.strictEqual(m.items.length, 2, "hide done: only the short ones");
  assert.deepStrictEqual(m.items[0], { icon: "<i>Doll</i>", name: "Doll", sub: "3 / 10", value: "−7", tone: "bad", pct: 30 });
  assert.deepStrictEqual([m.items[1].sub, m.items[1].pct], ["8+1 / 10", 90]);
  assert.deepStrictEqual(m.tiles.map((t) => [t.label, t.value]), [["at the limit", "17/19"], ["missing", 8], ["on the way", 1]]);
  assert.match(renderLook(m, "number").html, /<div class="gx-num(?: gx-num-long)?">17<small>\/19<\/small><\/div><div class="gx-cap">8 missing in total<\/div>/);
  assert.match(renderLook(m, "icons-1").html, /<small class="gx-tag g-bad">−7<\/small>/);
  assert.ok(looksFor(m).length >= 3);
  // done rows shown → they come last, with a ✓
  const shown = W.glanceModel({ farm: { inventory: inv } }, ctx, opts({ cat: "dolls", limit: 10, hideDone: false }));
  assert.strictEqual(shown.items.length, 19);
  assert.deepStrictEqual([shown.items[18].value, shown.items[18].tone, shown.items[18].pct], ["✓", "ok", 100]);
  // everything at the limit: the headline still counts them, no items
  const full = W.glanceModel({ farm: { inventory: all(Object.keys(CRUSTACEAN_RECIPES), 5) } }, {}, opts({ cat: "crabs", limit: 5 }));
  assert.deepStrictEqual([full.head.value, full.head.cap, full.head.ringTone, full.items.length], [16, "all at the limit ✓", "ok", 0]);
  assert.match(W.glanceModel({}, {}, opts({})).empty, /No farm data/);
  assert.match(W.glanceModel({ farm: { inventory: {} } }, {}, opts({ cat: "foods" })).empty, /Pick lists or dishes/);
  assert.strictEqual(W.glance, undefined, "the hand-written face is gone");
});
