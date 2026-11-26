import { test } from "node:test";
import assert from "node:assert";
import { targetList as W } from "../../widgets/target-list.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
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
  assert.deepStrictEqual(W.options.map((o) => o.key), ["cat", "limit", "hideDone", "foods"]);
  assert.deepStrictEqual(W.defaults.opts, { cat: "dolls", limit: 10, hideDone: true, foods: [] });
});

test("dolls to the limit: have + in progress vs the limit; done rows hidden by default", () => {
  const inv = all(Object.keys(DOLL_RECIPES), 10);
  inv["Doll"] = "3.0"; inv["Angler Doll"] = "9";
  const ctx = { inProgress: () => ({ "Angler Doll": 1 }) };
  const { rows, footer } = W.build({ farm: { inventory: inv } }, ctx, opts({ cat: "dolls", limit: 10 }));
  assert.deepStrictEqual(rows.map((r) => r.name), ["Doll"]);
  assert.deepStrictEqual([rows[0].have, rows[0].pend, rows[0].need, rows[0].missing], [3, 0, 10, 7]);
  assert.match(rows[0].recipe, /4× Leather, 5× Wool/);
  // dolls without a recipe (not craftable yet) are left out, as the DASH suggestions do
  assert.match(footer, /18 \/ 19 na limitu/);
  // with done rows shown, Angler Doll is there and done
  const shown = byName(W.build({ farm: { inventory: inv } }, ctx, opts({ cat: "dolls", limit: 10, hideDone: false })).rows);
  assert.strictEqual(Object.keys(shown).length, 19);
  assert.ok(!shown["Solar Doll"]);
  assert.deepStrictEqual([shown["Angler Doll"].missing, shown["Angler Doll"].done], [0, true]);
});

test("everything at the limit: a ✓ message instead of an empty table", () => {
  const out = W.build({ farm: { inventory: all(Object.keys(CRUSTACEAN_RECIPES), 5) } }, {}, opts({ cat: "crabs", limit: 5 }));
  assert.strictEqual(out.rows.length, 0);
  assert.match(out.empty, /✓ Vše na limitu \(16\)/);
});

test("crustaceans: pot and chum as the recipe; one without chum says so", () => {
  const r = byName(W.build({ farm: { inventory: {} } }, {}, opts({ cat: "crabs", limit: 2 })).rows);
  assert.match(r["Blue Crab"].recipe, /Crab Pot · 3× Heart Leaf/);
  assert.match(r["Isopod"].recipe, /Crab Pot · bez návnady/);
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
  assert.match(none.empty, /Vyber jídla/);
  const r = W.build({ farm: { inventory: { "Pumpkin Soup": "4" } } }, {}, opts({ cat: "foods", limit: 5, foods: ["Pumpkin Soup", "Nope"] })).rows;
  assert.deepStrictEqual(r.map((x) => [x.name, x.missing]), [["Pumpkin Soup", 1]]);
  assert.match(r[0].recipe, /🔥 Fire Pit · 10× Pumpkin/);
  // the dish checklist offers every recipe, only when the category is food
  const foods = W.options.find((o) => o.key === "foods");
  assert.strictEqual(foods.choices({ cat: "foods" }).length, Object.keys(COOKING_RECIPES_DATA).length);
  assert.deepStrictEqual(foods.choices({ cat: "dolls" }), []);
});

test("title names the category and the limit; table: most missing first, icon from the page", () => {
  assert.strictEqual(W.titleFor(opts({ cat: "dolls", limit: 10 })), "🎯 Panenky do 10");
  assert.strictEqual(W.titleFor(opts({ cat: "foods", limit: 3 })), "🎯 Jídla do 3");
  const { rows } = W.build({ farm: { inventory: { Doll: "8" } } }, { icon: (n) => `<i>${n}</i>` }, opts({ cat: "dolls", limit: 10 }));
  const html = renderTable(W.columns, rows, W.defaults, { rowKey: W.rowKey });
  const order = [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);
  assert.strictEqual(order[order.length - 1], "Doll", "Doll misses 2, every other doll 10");
  assert.match(html, /<i>Doll<\/i>/);
});

test("no farm: a clear empty message", () => {
  assert.match(W.build({}, {}, opts({})).empty, /Chybí data farmy/);
});
