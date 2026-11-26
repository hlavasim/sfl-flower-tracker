import { test } from "node:test";
import assert from "node:assert";
import { layout, STYLES, SIZES, variants, stylesFor, dims } from "../../ui/glance.mjs";
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
  assert.strictEqual(count(layout(MODEL, "1x1", "icons"), CELL), 4);
  assert.match(layout(MODEL, "1x1", "icons"), /<small class="g-tag g-ok">READY<\/small>/);
  assert.match(layout(MODEL, "1x1", "icons"), /<div class="g-cell g-more">\+17<\/div>/);
  assert.strictEqual(count(layout(MODEL, "4x1", "icons"), CELL), 16);
  assert.strictEqual(count(layout(MODEL, "1x2", "bars"), /class="g-bar-row"/g), 6);
  assert.match(layout(MODEL, "2x2", "tiles"), /class="g-tgrid"/);
  assert.match(layout(MODEL, "2x1", "chart"), /<svg class="g-spark/);
  assert.match(layout(MODEL, "1x1", "hero"), /g-hero-xl/);
});

test("a model offers only the styles it can fill; the variants walk every size × style", () => {
  assert.deepStrictEqual(stylesFor({ head: MODEL.head }), ["number"]);
  assert.deepStrictEqual(stylesFor({ items: [{ name: "a", value: 1 }] }), ["rows", "compact", "tiles"].filter((s) => s !== "tiles"));
  const v = variants(MODEL);
  assert.strictEqual(v.length, 8 * 7 + 2, "7 styles at every size, hero only at 1×1 and 2×1");
  assert.deepStrictEqual(v[0], { size: "1x1", style: "number" });
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
  assert.match(html, /<span class="w-var-n">4 \/ 58<\/span>/, "1×1 icons is the 4th variant");
  h.handle(id, "variant", "1");
  assert.deepStrictEqual([first(h).settings.size, first(h).settings.style], ["1x1", "tiles"]);
  for (let k = 0; k < 5; k++) h.handle(id, "variant", "-1");
  assert.deepStrictEqual([first(h).settings.size, first(h).settings.style], ["2x4", "chart"], "wraps around to the last");
  html = h.renderItem("main", first(h), { data: {} });
  assert.match(html, /style="--gw:2;--gh:4"/);
  h.handle(id, "size", "full");
  assert.match(h.renderItem("main", first(h), { data: {} }), /<table/);
  assert.deepStrictEqual(cleanSettings({ size: "4x2", style: "bars" }), { size: "4x2", style: "bars" });
  assert.deepStrictEqual(cleanSettings({ size: "9x9", style: "x" }), {});
  assert.match(h.preview("w", { data: {}, size: "4x1", style: "icons" }), /--gc:8/);
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
