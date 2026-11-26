import { test } from "node:test";
import assert from "node:assert";
import { createHost } from "../../app/widget-host.mjs";
import { cleanSettings } from "../../app/boards.mjs";

// A model widget on a board shows its glance look (ui/glance-templates); ⚙ Look switches between the
// widget and the full table; a tap opens the full widget in a sheet; the gallery previews the look.

const G = {
  type: "g", title: "🍳 Glance", page: "bumpkin", look: "number",
  columns: [{ key: "n", label: "N" }],
  rowKey: (r) => r.n,
  build: ({ list }) => ({ rows: list || [], footer: "" }),
  glanceModel: ({ list }) => (list && list.length ? { head: { value: list.length, cap: "things" }, items: list.map((r) => ({ name: r.n, value: 1 })) } : { empty: "nothing yet" }),
};
const PLAIN = { type: "p", title: "Plain", columns: [{ key: "n", label: "N" }], rowKey: (r) => r.n, build: ({ list }) => ({ rows: list || [] }) };
const DATA = { list: [{ n: "a" }, { n: "b" }] };

function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
function hostWith(types = ["g"]) {
  const h = createHost({ registry: { g: G, p: PLAIN }, storage: mem() });
  for (const t of types) h.handle("page:" + t, "pin", JSON.stringify({ board: "main" }));
  return { h, id: (k = 0) => `b:main:${h.doc().boards[0].items[k].i}` };
}
const item = (h, k = 0) => h.doc().boards[0].items[k];

test("a board copy of a model widget shows its look; the table stays off", () => {
  const { h } = hostWith();
  const html = h.renderItem("main", item(h), { data: DATA });
  assert.match(html, /class="w-frame pixel-panel w-on-board w-glance w-g-1x1"/);
  assert.match(html, /<div class="gx-num">2<\/div><div class="gx-cap">things<\/div>/);
  assert.doesNotMatch(html, /<table/);
  assert.match(html, /<div class="w-body" data-action="expand" data-value="">/, "a tap opens the full widget");
  assert.doesNotMatch(html, /data-resize/, "a look is chosen, not dragged");
  assert.match(h.renderItem("main", item(h), { data: {} }), /<div class="w-empty-msg">nothing yet<\/div>/);
});

test("⚙ Look switches a board copy between the widget and the full table; the widget's page has no such choice", () => {
  const { h, id } = hostWith();
  h.handle(id(), "cog", "");
  h.handle(id(), "settings-tab", "look");
  const html = h.renderItem("main", item(h), { data: DATA });
  assert.match(html, /data-action="size" data-value="look">Widget</);
  assert.match(html, /data-action="size" data-value="full">Full table</);
  h.handle(id(), "size", "full");
  assert.match(h.renderItem("main", item(h), { data: DATA }), /<table/);
  h.handle(id(), "size", "look");
  assert.doesNotMatch(h.renderItem("main", item(h), { data: DATA }), /<table/);
  h.handle("page:g", "cog", "");
  h.handle("page:g", "settings-tab", "look");
  assert.doesNotMatch(h.renderPage("g", { data: DATA }), /data-action="size"/);
  assert.deepStrictEqual(cleanSettings({ size: "full" }), { size: "full" });
});

test("a widget without a model is always the full table", () => {
  const { h } = hostWith(["p"]);
  const html = h.renderItem("main", item(h), { data: DATA });
  assert.doesNotMatch(html, /w-glance/);
  assert.match(html, /<table/);
  assert.deepStrictEqual(h.sizesOf("p"), []);
});

test("expand opens the full widget in a sheet over the board; collapse (or the ✕) closes it", () => {
  const { h, id } = hostWith();
  assert.ok(h.handle(id(), "expand", ""));
  const open = h.renderItem("main", item(h), { data: DATA });
  assert.match(open, /<div class="w-sheet" data-action="collapse" data-value=""><div class="w-sheet-card" data-action="noop" data-value="">/);
  const sheet = open.slice(open.indexOf('class="w-sheet"'));
  assert.match(sheet, /<table/, "the sheet holds the full table");
  assert.match(sheet, /data-action="collapse"[^>]*title="close"/);
  assert.ok(h.handle(id(), "collapse", ""));
  assert.doesNotMatch(h.renderItem("main", item(h), { data: DATA }), /w-sheet/);
});

test("a model that throws shows the error, not a broken board", () => {
  const bad = { ...G, glanceModel: () => { throw new Error("boom"); } };
  const h = createHost({ registry: { g: bad }, storage: mem() });
  h.handle("page:g", "pin", "");
  assert.match(h.renderItem("main", item(h), { data: DATA }), /The widget failed: boom/);
});

test("gallery: a model widget's look preview, the table for Full, none for a widget without a model", () => {
  const h = createHost({ registry: { g: G, p: PLAIN }, storage: mem() });
  const p = h.lookPreview("g", { data: DATA });
  assert.strictEqual(p.id, "number");
  assert.match(p.html, /class="gx-num">2</);
  assert.ok(p.offered.includes("number"));
  assert.match(h.preview("g", { data: DATA, size: "full" }), /<table/);
  assert.strictEqual(h.lookPreview("p", { data: DATA }), null);
});

test("pinning from the gallery can preset the look or the table", () => {
  const h = createHost({ registry: { g: G }, storage: mem() });
  h.handle("page:g", "pin", JSON.stringify({ board: "main", look: "list-1" }));
  assert.strictEqual(item(h).settings.look, "list-1");
  h.handle("page:g", "pin", JSON.stringify({ board: "main", look: "full" }));
  assert.strictEqual(item(h, 1).settings.size, "full");
});

test("the sheet carries every control a phone needs: looks, settings, remove from the board, close", () => {
  const { h, id } = hostWith();
  h.handle(id(), "expand", "");
  const sheet = h.renderItem("main", item(h), { data: DATA }).split('class="w-sheet"')[1];
  for (const a of ["looks", "cog", "remove", "collapse"]) assert.match(sheet, new RegExp(`data-action="${a}"`), a);
  h.handle(id(), "remove", "");
  assert.strictEqual(h.doc().boards[0].items.length, 0);
});

test("a natural look that would hide one or two things gives way to the same kind that shows them all", () => {
  const L = { ...G, type: "l", look: "number-list-2" };
  const h = createHost({ registry: { l: L }, storage: mem() });
  const four = { list: [{ n: "a" }, { n: "b" }, { n: "c" }, { n: "d" }] };
  assert.strictEqual(h.lookPreview("l", { data: four }).id, "number-list-t");
  assert.strictEqual(h.lookPreview("l", { data: { list: [{ n: "a" }, { n: "b" }, { n: "c" }] } }).id, "number-list-2");
});
