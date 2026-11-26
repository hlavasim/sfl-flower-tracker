import { test } from "node:test";
import assert from "node:assert";
import { applyOption, tableSettingsPanel } from "../../ui/table.mjs";
import { createHost } from "../../app/widget-host.mjs";
import { BOARDS_KEY, cleanSettings } from "../../app/boards.mjs";

// A widget's own options (limit, category, a checklist…): declared by the widget, stored per frame
// under settings.opts, shown on their own first tab of the cog, handed to build() as its third argument.

const OPTIONS = [
  { key: "cat", label: "Kategorie", kind: "select", choices: [["a", "Áčka"], ["b", "Béčka"]] },
  { key: "limit", label: "Limit", kind: "number", min: 1, max: 999 },
  { key: "hide", label: "Skrýt hotové", kind: "bool" },
  { key: "pick", label: "Vybrané", kind: "checklist", choices: (opts) => (opts.cat === "b" ? [["x", "X"], ["y", "Y"]] : [["q", "Q"]]) },
];

test("applyOption: number clamps and blank clears; bool; select only from its choices; checklist toggles a valid value", () => {
  let s = {};
  s = applyOption(OPTIONS, s, "limit", "12");
  assert.deepStrictEqual(s.opts, { limit: 12 });
  assert.strictEqual(applyOption(OPTIONS, s, "limit", "0").opts.limit, 1);
  assert.strictEqual(applyOption(OPTIONS, s, "limit", "5000").opts.limit, 999);
  assert.ok(!("limit" in applyOption(OPTIONS, s, "limit", "").opts));
  assert.strictEqual(applyOption(OPTIONS, s, "hide", "1").opts.hide, true);
  assert.strictEqual(applyOption(OPTIONS, s, "hide", "0").opts.hide, false);
  assert.strictEqual(applyOption(OPTIONS, s, "cat", "b").opts.cat, "b");
  assert.strictEqual(applyOption(OPTIONS, s, "cat", "zzz").opts.cat, undefined);
  s = applyOption(OPTIONS, { opts: { cat: "b" } }, "pick", "x");
  assert.deepStrictEqual(s.opts.pick, ["x"]);
  assert.deepStrictEqual(applyOption(OPTIONS, s, "pick", "x").opts.pick, []);
  assert.deepStrictEqual(applyOption(OPTIONS, s, "pick", "q").opts.pick, ["x"], "q is not a choice while cat = b");
  assert.deepStrictEqual(applyOption(OPTIONS, s, "nope", "1"), s, "unknown key: unchanged");
});

test("the panel: the options tab comes first and is active by default; each control carries opt:<key>", () => {
  const html = tableSettingsPanel([{ key: "n", label: "N" }], { opts: { cat: "b", limit: 7, hide: true, pick: ["y"] } }, { options: OPTIONS, optionsLabel: "Cíl" });
  const tabs = [...html.matchAll(/data-action="settings-tab" data-value="(\w+)" aria-selected="(\w+)"/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepStrictEqual(tabs, ["opts:true", "cols:false", "rows:false", "look:false"]);
  assert.match(html, />Cíl</);
  assert.match(html, /<select data-action="opt:cat">[^]*<option value="b" selected>Béčka<\/option>/);
  assert.match(html, /<input type="number" min="1" max="999" value="7" data-action="opt:limit">/);
  assert.match(html, /<input type="checkbox" data-action="opt:hide" data-value="0" checked>/);
  assert.match(html, /data-action="opt:pick" data-value="y" checked/);
  assert.match(html, /data-action="opt:pick" data-value="x">/);
  assert.doesNotMatch(html, /data-value="q"/, "the checklist follows the current category");
  // no options: no such tab, columns first as before
  assert.doesNotMatch(tableSettingsPanel([{ key: "n", label: "N" }], {}), /data-value="opts"/);
});

test("cleanSettings keeps opts made of plain values and string lists, drops anything else", () => {
  const s = cleanSettings({ opts: { a: 1, b: "x", c: true, d: null, e: ["p", 2, {}], f: { deep: 1 } } });
  assert.deepStrictEqual(s.opts, { a: 1, b: "x", c: true, d: null, e: ["p", "2"] });
  assert.ok(!("opts" in cleanSettings({ opts: "junk" })));
});

const W = {
  type: "o", title: "Plain", page: "x",
  titleFor: (o) => `Limit ${o.limit}`,
  options: OPTIONS, optionsLabel: "Cíl",
  defaults: { opts: { cat: "a", limit: 3, hide: true } },
  rowKey: (r) => r.n, rowLabel: (r) => r.n,
  columns: [{ key: "n", label: "N" }],
  build: (data, ctx, opts) => ({ rows: [{ n: `${opts.cat}-${opts.limit}-${opts.hide}` }], footer: "", empty: "" }),
};
function mem() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
const rowsIn = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((x) => x[1]);

test("host: build gets defaults merged with the saved opts; opt:<key> saves; the title follows the opts", () => {
  const storage = mem();
  const h = createHost({ registry: { o: W }, storage });
  assert.deepStrictEqual(rowsIn(h.renderPage("o", { data: {} })), ["a-3-true"]);
  assert.strictEqual(h.handle("page:o", "opt:limit", "10"), true);
  const html = h.renderPage("o", { data: {} });
  assert.deepStrictEqual(rowsIn(html), ["a-10-true"]);
  assert.match(html, /Limit 10/);
  assert.deepStrictEqual(JSON.parse(storage.m.get(BOARDS_KEY)).page.o.opts, { cat: "a", limit: 10, hide: true });
  assert.strictEqual(h.handle("page:o", "opt:nope", "1"), true, "handled, nothing changes");
});

test("host: the cog opens on the options tab; pin with preset opts pins a board copy with them", () => {
  const h = createHost({ registry: { o: W }, storage: mem() });
  h.handle("page:o", "cog", "");
  assert.match(h.renderPage("o", { data: {} }), /data-value="opts" aria-selected="true"/);
  h.handle("page:o", "pin", JSON.stringify({ opts: { cat: "b", limit: 10 } }));
  const item = h.doc().boards[0].items[0];
  assert.deepStrictEqual(item.settings.opts, { cat: "b", limit: 10, hide: true });
  assert.deepStrictEqual(rowsIn(h.renderItem(h.doc().boards[0].id, item, { data: {} })), ["b-10-true"]);
  // a broken preset is ignored, the pin still happens
  h.handle("page:o", "pin", "{not json");
  assert.strictEqual(h.doc().boards[0].items.length, 2);
});
