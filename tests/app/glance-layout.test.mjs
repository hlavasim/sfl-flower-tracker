import { test } from "node:test";
import assert from "node:assert";
import { layout, STYLES, SIZES, variants, stylesFor, sizesFor, dims, iconCap } from "../../ui/glance.mjs";
import { createHost } from "../../app/widget-host.mjs";
import { parseBoards, setBoardCols, emptyBoards, cleanSettings } from "../../app/boards.mjs";

// One model per widget (a headline, items, tiles, a series), laid out by one engine at every size
// (W×H cells, 1×1 … 4×2) and style — so every widget offers dozens of ready-made variants to click through.

const ITEMS = Array.from({ length: 20 }, (_, k) => ({ icon: `<i>${k}</i>`, name: `Item ${k}`, sub: `sub ${k}`, value: `${k}d`, pct: k * 5,
  ...(k === 0 ? { chip: { text: "READY", tone: "ok" } } : {}) }));
const MODEL = { head: { value: "4", unit: "/4", cap: "all protected", ring: 100 }, items: ITEMS, foot: "20 things",
  tiles: [{ label: "a", value: "1" }, { label: "b", value: "2" }, { label: "c", value: "3" }], series: [1, 3, 2, 5] };
const count = (h, re) => (h.match(re) || []).length;
const ROW = /class="g-row"/g, CELL = /class="g-cell[" ]/g;

test("sizes are W×H cells; the old S / M / T / L names still read", () => {
  assert.deepStrictEqual(SIZES, ["1x1", "2x1", "1x2", "2x2", "4x1", "1x4", "4x2", "2x4"]);
  assert.deepStrictEqual(dims("4x2"), { w: 4, h: 2 });
  assert.deepStrictEqual(dims("m"), { w: 2, h: 1 });
  assert.deepStrictEqual(STYLES, ["number", "rows", "compact", "icons", "tiles", "bars", "chart", "hero"]);
});

test("number: 1×1 = the headline; a one-row size puts the list beside it; taller ones under it", () => {
  const s = layout(MODEL, "1x1", "number");
  assert.match(s, /<div class="g-big">4<small>\/4<\/small><\/div><div class="g-cap">all protected<\/div>/);
  assert.strictEqual(count(s, ROW), 0);
  assert.match(layout(MODEL, "2x1", "number"), /^<div class="g-split">/);
  assert.strictEqual(count(layout(MODEL, "2x1", "number"), ROW), 3);
  assert.strictEqual(count(layout(MODEL, "4x1", "number"), ROW), 6, "4 wide: two columns beside the headline");
  assert.match(layout(MODEL, "1x2", "number"), /^<div class="g-head-top">/);
  assert.strictEqual(count(layout(MODEL, "1x2", "number"), ROW), 4);
  assert.strictEqual(count(layout(MODEL, "1x4", "number"), ROW), 10);
});

test("rows / compact / icons / bars scale with the area", () => {
  assert.strictEqual(count(layout(MODEL, "1x1", "rows"), ROW), 3);
  assert.strictEqual(count(layout(MODEL, "2x1", "rows"), ROW), 6);
  assert.strictEqual(count(layout(MODEL, "1x4", "rows"), ROW), 12);
  assert.strictEqual(count(layout(MODEL, "1x1", "compact"), /class="g-line"/g), 5);
  assert.strictEqual(count(layout(MODEL, "1x1", "icons"), CELL), iconCap(1, 1));
  assert.match(layout(MODEL, "1x1", "icons"), /<small class="g-tag g-ok">READY<\/small>/);
  assert.match(layout(MODEL, "1x1", "icons"), new RegExp(`<div class="g-cell g-more">\\+${20 - iconCap(1, 1) + 1}</div>`));
  assert.strictEqual(count(layout(MODEL, "4x1", "icons"), CELL), 20, "all twenty fit a 4×1");
  assert.strictEqual(count(layout(MODEL, "1x2", "bars"), /class="g-bar-row"/g), 6);
  assert.match(layout(MODEL, "2x2", "tiles"), /class="g-tgrid"/);
  assert.match(layout(MODEL, "2x1", "chart"), /<svg class="g-spark/);
  assert.match(layout(MODEL, "1x1", "hero"), /g-hero-xl/);
});

test("icons: the grid follows the item count and the shape — 4 items are 2×2 in 1×1, one row when wide, one column when tall", () => {
  const four = Array.from({ length: 4 }, (_, k) => ({ icon: `<i>${k}</i>`, name: `n${k}`, chip: { text: "active", tone: "ok" } }));
  assert.match(layout({ items: four }, "1x1", "icons"), /^<div class="g-icons" style="--gc:2;--gr:2">/);
  assert.match(layout({ items: four }, "4x1", "icons"), /^<div class="g-icons" style="--gc:4;--gr:1">/);
  assert.match(layout({ items: four }, "1x4", "icons"), /^<div class="g-icons" style="--gc:1;--gr:4">/);
  assert.strictEqual(count(layout({ items: four }, "1x1", "icons"), CELL), 4, "all four, none cut off");
});

test("only the sizes that show more: a style stops growing once all its content fits", () => {
  const four = Array.from({ length: 4 }, (_, k) => ({ icon: `<i>${k}</i>`, name: `n${k}`, chip: { text: "active", tone: "ok" } }));
  const small = { head: { value: 4, unit: "/4", ring: 100 }, items: four };
  assert.deepStrictEqual(sizesFor(small, "icons"), ["1x1"], "four icons fit a 1×1: no 4×2 that is mostly empty");
  assert.deepStrictEqual(sizesFor(small, "rows"), ["1x1", "2x1"]);
  assert.deepStrictEqual(sizesFor(small, "number"), ["1x1", "2x1", "1x2"]);
  assert.ok(variants(small).length < 15);
  assert.ok(variants(MODEL).length > variants(small).length, "more data, more looks");
  assert.deepStrictEqual(variants(MODEL)[0], { size: "1x1", style: "number" });
});

test("a model offers only the styles it can fill", () => {
  assert.deepStrictEqual(stylesFor({ head: MODEL.head }), ["number"]);
  assert.deepStrictEqual(stylesFor({ items: [{ name: "a", value: 1 }] }), ["rows", "compact"]);
  assert.match(layout({ head: MODEL.head }, "2x2", "icons"), /g-big/, "a style it cannot fill falls back");
});

// ── the host ──
const W = {
  type: "w", title: "Weather", columns: [{ key: "n", label: "N" }], rowKey: (r) => r.n, build: () => ({ rows: [{ n: "a" }] }),
  glanceModel: () => MODEL,
};
function mem() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; }
const first = (h) => h.doc().boards[0].items[0];

test("a model widget: every size, its style per copy, and ◀ ▶ walking the variants with 'n / total'", () => {
  const h = createHost({ registry: { w: W }, storage: mem() });
  assert.deepStrictEqual(h.sizesOf("w"), SIZES);
  h.handle("page:w", "pin", JSON.stringify({ board: "main", size: "1x1", style: "icons" }));
  const id = `b:main:${first(h).i}`;
  assert.strictEqual(first(h).settings.style, "icons");
  let html = h.renderItem("main", first(h), { data: {} });
  assert.match(html, /class="g-icons"/);
  assert.match(html, /w-g-1x1/);
  assert.match(html, /data-action="variant" data-value="-1"/);
  const list = variants(MODEL), at = list.findIndex((v) => v.size === "1x1" && v.style === "icons");
  assert.match(html, new RegExp(`<span class="w-var-n">${at + 1} / ${list.length}</span>`));
  h.handle(id, "variant", "1");
  assert.deepStrictEqual({ size: first(h).settings.size, style: first(h).settings.style }, list[at + 1]);
  for (let k = 0; k <= at + 1; k++) h.handle(id, "variant", "-1");
  assert.deepStrictEqual({ size: first(h).settings.size, style: first(h).settings.style }, list.at(-1), "wraps around to the last");
  html = h.renderItem("main", first(h), { data: {} });
  const d = dims(list.at(-1).size);
  assert.match(html, new RegExp(`style="--gw:${d.w};--gh:${d.h}"`));
  h.handle(id, "size", "full");
  assert.match(h.renderItem("main", first(h), { data: {} }), /<table/);
  assert.deepStrictEqual(cleanSettings({ size: "4x2", style: "bars" }), { size: "4x2", style: "bars" });
  assert.deepStrictEqual(cleanSettings({ size: "9x9", style: "x" }), {});
  assert.match(h.preview("w", { data: {}, size: "4x1", style: "icons" }), /class="g-icons" style="--gc:\d+;--gr:\d+"/);
});

test("a glance never spans more columns than the board has", () => {
  const h = createHost({ registry: { w: W }, storage: mem() });
  h.handle("page:w", "pin", JSON.stringify({ board: "main", size: "4x2" }));
  h.setBoardCols("main", 3);
  assert.match(h.renderItem("main", first(h), { data: {} }), /style="--gw:3;--gh:2"/);
});

test("a board keeps its own column count (2-12, default 6); a full table spans its share of them", () => {
  let d = emptyBoards();
  d = setBoardCols(d, "main", 12);
  assert.strictEqual(d.boards[0].cols, 12);
  assert.strictEqual(setBoardCols(d, "main", 40).boards[0].cols, 12);
  assert.strictEqual(setBoardCols(d, "main", 1).boards[0].cols, 2);
  assert.strictEqual(parseBoards(JSON.stringify(setBoardCols(d, "main", 8))).boards[0].cols, 8);
  assert.strictEqual(parseBoards(JSON.stringify({ schema: 1, boards: [{ id: "x", items: [], cols: "abc" }] })).boards[0].cols, undefined);
  const h = createHost({ registry: { w: { ...W, glanceModel: undefined } }, storage: mem() });
  h.handle("page:w", "pin", JSON.stringify({ board: "main" }));
  h.setBoardCols("main", 12);
  assert.strictEqual(h.colsOf("main"), 12);
  assert.match(h.renderItem("main", first(h), { data: {} }), /style="grid-column:span 6"/);
  h.setBoardCols("main", 4);
  assert.match(h.renderItem("main", first(h), { data: {} }), /style="grid-column:span 2"/);
});
