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

test("render: top N says how many rows it left out", () => {
  assert.match(renderTable(COLS, ROWS, { rows: { mode: "top", top: 2 } }, { rowKey: key }), /… and 1 more/);
  assert.doesNotMatch(renderTable(COLS, ROWS, { rows: { mode: "top", top: 3 } }, { rowKey: key }), /more</);
  assert.doesNotMatch(renderTable(COLS, ROWS, {}, { rowKey: key }), /more</);
});

test("render: a header tooltip, a trusted header label, and a widget's row classes", () => {
  const cols = [{ key: "name", label: "Ryba", title: "jméno <ryby>" }, { key: "qty", label: "Q", labelHtml: "<img alt=f>" }];
  const html = renderTable(cols, ROWS, {}, { rowKey: key, rowClass: (r) => (r.name === "Cod" ? "w-row-hl" : "") });
  assert.match(html, /<th[^>]*title="jméno &lt;ryby&gt;"[^>]*>Ryba/);
  assert.match(html, /<th[^>]*><img alt=f><\/th>/);
  assert.match(html, /<tr data-row="Cod" class="w-row-hl">/);
  assert.match(html, /<tr data-row="Tuna">/);
});

test("render: a cumulative column sums in the order shown, also when sorted by another column", () => {
  const cols = [{ key: "name", label: "N" }, { key: "qty", label: "Q" }, { key: "run", label: "Σ", get: (r) => r.qty, cumulative: true, fmt: (v) => `[${v}]` }];
  const plain = renderTable(cols, ROWS, {}, { rowKey: key });
  assert.deepStrictEqual([...plain.matchAll(/\[(\d+)\]/g)].map((m) => +m[1]), [9, 109, 119]);
  const sorted = renderTable(cols, ROWS, { sort: { key: "qty", dir: "asc" } }, { rowKey: key });
  assert.deepStrictEqual([...sorted.matchAll(/\[(\d+)\]/g)].map((m) => +m[1]), [9, 19, 119]);
});

test("filters: a column marked filter hides the values switched off; the panel gets a Filtr tab only then", () => {
  const cols = [{ key: "name", label: "N", filter: true }, { key: "qty", label: "Q" }];
  let s = applyTableAction(cols, {}, "filter", "name|Cod");
  assert.deepStrictEqual(s.filters, { name: ["Cod"] });
  assert.deepStrictEqual(applyRows(cols, ROWS, s, key).rows.map(key), ["Tuna", "Eel"]);
  s = applyTableAction(cols, s, "filter", "name|Cod");
  assert.deepStrictEqual(s.filters, { name: [] });
  assert.strictEqual(applyRows(cols, ROWS, s, key).rows.length, 3);
  assert.deepStrictEqual(applyTableAction(cols, {}, "filter", "qty|9").filters, undefined);
  const panel = tableSettingsPanel(cols, { filters: { name: ["Eel"] } }, { rows: ROWS, rowKey: key });
  assert.match(panel, /data-value="filter"/);
  assert.match(panel, /data-action="filter" data-value="name\|Tuna" checked/);
  assert.match(panel, /data-action="filter" data-value="name\|Eel"(?! checked)/);
  assert.doesNotMatch(tableSettingsPanel(COLS, {}, { rows: ROWS, rowKey: key }), /data-value="filter"/);
});

test("top N keeps a row the widget marks (keepRow) visible below a '…' line", () => {
  const html = renderTable(COLS, ROWS, { rows: { mode: "top", top: 1 } }, { rowKey: key, keepRow: (r) => r.name === "Eel" });
  assert.deepStrictEqual([...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]), ["Tuna", "Eel"]);
  assert.match(html, /class="w-gap"/);
  assert.match(html, /and 1 more/);
  const inside = renderTable(COLS, ROWS, { rows: { mode: "top", top: 3 } }, { rowKey: key, keepRow: (r) => r.name === "Eel" });
  assert.doesNotMatch(inside, /w-gap/);
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
  s = applyTableAction(COLS, s, "col-move", "note|1");
  assert.deepStrictEqual(s.columns, ["name", "note", "xp"]);
  s = applyTableAction(COLS, s, "col-move", "name|1");
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

test("col-move: a dragged column lands at the drop index among the shown columns", () => {
  let s = applyTableAction(COLS, {}, "col-move", "xp|0");
  assert.deepStrictEqual(s.columns, ["xp", "name", "qty"]);
  s = applyTableAction(COLS, s, "col-move", "xp|2");
  assert.deepStrictEqual(s.columns, ["name", "qty", "xp"]);
  s = applyTableAction(COLS, s, "col-move", "name|99");
  assert.deepStrictEqual(s.columns, ["qty", "xp", "name"]);
  assert.deepStrictEqual(applyTableAction(COLS, s, "col-move", "note|0").columns, ["qty", "xp", "name"]);
  assert.deepStrictEqual(applyTableAction(COLS, s, "col-move", "garbage").columns, ["qty", "xp", "name"]);
});

test("settings panel: tabs with one section shown, rows mode as buttons (no shared radio names), grips on shown columns", () => {
  const html = tableSettingsPanel(COLS, { rows: { mode: "top", top: 3, picked: [] } }, { rows: ROWS, rowKey: key, tab: "rows" });
  assert.match(html, /data-action="settings-tab" data-value="rows" aria-selected="true"/);
  assert.match(html, /data-action="settings-tab" data-value="cols" aria-selected="false"/);
  assert.match(html, /data-tab="cols" hidden/);
  assert.match(html, /data-tab="rows">/);
  assert.match(html, /data-tab="look" hidden/);
  assert.doesNotMatch(html, /type="radio"/);
  assert.match(html, /class="w-seg on" data-action="rows-mode" data-value="top"/);
  const cols = tableSettingsPanel(COLS, {}, { rows: ROWS, rowKey: key });
  assert.match(cols, /data-tab="cols">/);
  assert.match(cols, /<div class="w-col-row" data-col="name"><span class="w-grip" data-drag="col"/);
  assert.doesNotMatch(cols, /data-col="note"><span class="w-grip"/);
  assert.doesNotMatch(cols, /col-up|col-down/);
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

test("Look tab: summary shown / compact / hidden and a custom title, both saved in the settings", () => {
  let s = applyTableAction(COLS, {}, "summary", "compact");
  assert.strictEqual(s.summary, "compact");
  s = applyTableAction(COLS, s, "summary", "off");
  assert.strictEqual(s.summary, "off");
  assert.strictEqual(applyTableAction(COLS, s, "summary", "nonsense").summary, "off", "an unknown value changes nothing");
  s = applyTableAction(COLS, s, "title", "  My dishes  ");
  assert.strictEqual(s.title, "My dishes");
  assert.strictEqual(applyTableAction(COLS, s, "title", "x".repeat(200)).title.length, 60);
  assert.ok(!("title" in applyTableAction(COLS, s, "title", "   ")), "blank = the widget's own title again");
  const panel = tableSettingsPanel(COLS, { summary: "compact", title: "My <b>" }, { tab: "look", summary: true, defaultTitle: "🎯 Dishes to 5" });
  assert.match(panel, /data-action="summary" data-value="compact"[^>]*class="w-seg on"|class="w-seg on"[^>]*data-action="summary" data-value="compact"/);
  assert.match(panel, /<input type="text" data-action="title" value="My &lt;b&gt;" placeholder="🎯 Dishes to 5"/);
  // no summary on this widget → no summary control
  assert.doesNotMatch(tableSettingsPanel(COLS, {}, { tab: "look" }), /data-action="summary"/);
});
