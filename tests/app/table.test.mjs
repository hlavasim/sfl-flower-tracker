import { test } from "node:test";
import assert from "node:assert";
import { visibleColumns, applyRows, renderTable, tableSettingsPanel, applyTableAction } from "../../ui/table.mjs";

// One table for every widget: the widget declares columns, the owner's settings choose what shows.

const COLS = [
  { key: "name", label: "Ryba" },
  { key: "qty", label: "Kusů", fmt: (v) => `${v} ks` },
  { key: "xp", label: "XP", get: (r) => (r.xpEach == null ? null : r.xpEach * r.qty) },
  { key: "note", label: "Pozn.", extra: true },
];
const ROWS = [
  { name: "Tuna", qty: 9, xpEach: 10, note: "a" },
  { name: "Cod", qty: 100, xpEach: 1, note: "b" },
  { name: "Eel", qty: 10, xpEach: null, note: "<b>c</b>" },
];
const key = (r) => r.name;
const names = (rows) => rows.map((r) => r.name);

test("default columns: every non-extra column in definition order", () => {
  assert.deepStrictEqual(visibleColumns(COLS, {}).map((c) => c.key), ["name", "qty", "xp"]);
});

test("settings.columns orders and hides; an extra column shows when listed; unknown keys ignored", () => {
  assert.deepStrictEqual(visibleColumns(COLS, { columns: ["xp", "note", "gone", "name"] }).map((c) => c.key), ["xp", "note", "name"]);
});

test("sort uses the raw value, not the formatted text; nulls last in both directions", () => {
  assert.deepStrictEqual(names(applyRows(COLS, ROWS, { sort: { key: "qty", dir: "desc" } }, key).rows), ["Cod", "Eel", "Tuna"]);
  assert.deepStrictEqual(names(applyRows(COLS, ROWS, { sort: { key: "qty", dir: "asc" } }, key).rows), ["Tuna", "Eel", "Cod"]);
  assert.deepStrictEqual(names(applyRows(COLS, ROWS, { sort: { key: "xp", dir: "asc" } }, key).rows), ["Tuna", "Cod", "Eel"]);
  assert.deepStrictEqual(names(applyRows(COLS, ROWS, { sort: { key: "xp", dir: "desc" } }, key).rows), ["Cod", "Tuna", "Eel"]);
  assert.deepStrictEqual(names(applyRows(COLS, ROWS, { sort: { key: "name", dir: "asc" } }, key).rows), ["Cod", "Eel", "Tuna"]);
});

test("no sort setting keeps the widget's own order", () => {
  assert.deepStrictEqual(names(applyRows(COLS, ROWS, {}, key).rows), ["Tuna", "Cod", "Eel"]);
});

test("top N applies after the sort", () => {
  const r = applyRows(COLS, ROWS, { sort: { key: "qty", dir: "desc" }, rows: { mode: "top", top: 2 } }, key);
  assert.deepStrictEqual(names(r.rows), ["Cod", "Eel"]);
});

test("picked rows: only those, in sort order; a picked key with no row is reported, not dropped", () => {
  const r = applyRows(COLS, ROWS, { rows: { mode: "picked", picked: ["Eel", "Marlin", "Tuna"] } }, key);
  assert.deepStrictEqual(names(r.rows), ["Tuna", "Eel"]);
  assert.deepStrictEqual(r.missing, ["Marlin"]);
});

test("render: headers, formatted cells, escaped default cells, missing picks listed", () => {
  const html = renderTable(COLS, ROWS, { columns: ["name", "qty", "note"], rows: { mode: "picked", picked: ["Eel", "Marlin"] } }, { rowKey: key });
  assert.match(html, /<th[^>]*data-sort="qty"[^>]*>Kusů/);
  assert.match(html, /10 ks/);
  assert.match(html, /&lt;b&gt;c&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>c<\/b>/);
  assert.match(html, /Marlin/);
  assert.doesNotMatch(html, /Tuna/);
});

test("render: density and text size reach the markup; the sorted column is marked", () => {
  const html = renderTable(COLS, ROWS, { density: "compact", textSize: 120, sort: { key: "qty", dir: "desc" } }, { rowKey: key });
  assert.match(html, /class="w-table w-compact"/);
  assert.match(html, /font-size:120%/);
  assert.match(html, /data-sort="qty"[^>]*aria-sort="descending"/);
});

test("render: an empty result says so", () => {
  assert.match(renderTable(COLS, [], {}, { rowKey: key, empty: "Nic." }), /Nic\./);
});

test("actions: column toggle, move, sort cycling, rows mode, top, pick, density, text size", () => {
  let s = {};
  s = applyTableAction(COLS, s, "col-toggle", "qty");
  assert.deepStrictEqual(s.columns, ["name", "xp"]);
  s = applyTableAction(COLS, s, "col-toggle", "note");
  assert.deepStrictEqual(s.columns, ["name", "xp", "note"]);
  s = applyTableAction(COLS, s, "col-up", "note");
  assert.deepStrictEqual(s.columns, ["name", "note", "xp"]);
  s = applyTableAction(COLS, s, "col-down", "name");
  assert.deepStrictEqual(s.columns, ["note", "name", "xp"]);
  s = applyTableAction(COLS, s, "sort", "qty");
  assert.deepStrictEqual(s.sort, { key: "qty", dir: "desc" });
  s = applyTableAction(COLS, s, "sort", "qty");
  assert.deepStrictEqual(s.sort, { key: "qty", dir: "asc" });
  s = applyTableAction(COLS, s, "sort", "qty");
  assert.strictEqual(s.sort, undefined);
  s = applyTableAction(COLS, s, "rows-mode", "top");
  assert.deepStrictEqual(s.rows, { mode: "top", top: 5, picked: [] });
  s = applyTableAction(COLS, s, "rows-top", "0");
  assert.strictEqual(s.rows.top, 1);
  s = applyTableAction(COLS, s, "pick", "Eel");
  s = applyTableAction(COLS, s, "pick", "Cod");
  s = applyTableAction(COLS, s, "pick", "Eel");
  assert.deepStrictEqual(s.rows.picked, ["Cod"]);
  s = applyTableAction(COLS, s, "density", "compact");
  assert.strictEqual(s.density, "compact");
  s = applyTableAction(COLS, s, "text-size", "400");
  assert.strictEqual(s.textSize, 160);
  s = applyTableAction(COLS, s, "reset", "");
  assert.deepStrictEqual(s, {});
});

test("actions never mutate the settings they are given", () => {
  const s = Object.freeze({ columns: Object.freeze(["name"]), rows: Object.freeze({ mode: "picked", picked: Object.freeze(["Cod"]) }) });
  applyTableAction(COLS, s, "col-toggle", "qty");
  applyTableAction(COLS, s, "pick", "Eel");
});

test("settings panel: a checkbox per column (checked = shown), the row picker lists every row", () => {
  const html = tableSettingsPanel(COLS, { columns: ["name", "note"], rows: { mode: "picked", picked: [] } }, { rows: ROWS, rowKey: key });
  assert.match(html, /data-action="col-toggle" data-value="name" checked/);
  assert.match(html, /data-action="col-toggle" data-value="note" checked/);
  assert.match(html, /data-action="col-toggle" data-value="qty"(?! checked)/);
  for (const n of ["Tuna", "Cod", "Eel"]) assert.match(html, new RegExp(`data-action="pick" data-value="${n}"`));
  assert.match(html, /data-action="rows-mode"/);
  assert.match(html, /data-action="text-size"/);
  assert.match(html, /data-action="density"/);
});

test("review #2: the settings panel never prints a raw settings value", () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const html = tableSettingsPanel(COLS, { textSize: evil, rows: { mode: "top", top: evil, picked: null } }, { rows: ROWS, rowKey: key });
  assert.doesNotMatch(html, /<img/);
});
