import { test } from "node:test";
import assert from "node:assert";
import { createHost } from "../../app/widget-host.mjs";
import { cleanSettings } from "../../app/boards.mjs";

// iPhone-style widgets: on a board, a widget with a glance face shows it at the copy's size (S / M /
// L), Full = the table; a tap opens the full widget in a sheet; the gallery previews the glance.

const G = {
  type: "g", title: "🍳 Glance", page: "bumpkin",
  sizes: ["s", "m"], size: "s",
  columns: [{ key: "n", label: "N" }],
  rowKey: (r) => r.n,
  build: ({ list }) => ({ rows: list || [], footer: "" }),
  glance: ({ list }, ctx, opts, size) => ({ html: `<b class="face">${size}:${(list || []).length}</b>` }),
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
  const items = h.doc().boards[0].items;
  return { h, items, id: (k = 0) => `b:main:${items[k].i}` };
}
const item = (h, k = 0) => h.doc().boards[0].items[k];

test("a board copy of a widget with a glance shows the glance at its natural size; the table stays off", () => {
  const { h } = hostWith();
  const html = h.renderItem("main", item(h), { data: DATA });
  assert.match(html, /class="w-frame pixel-panel w-on-board w-glance w-g-s"/);
  assert.match(html, /<b class="face">s:2<\/b>/);
  assert.doesNotMatch(html, /<table/);
  assert.match(html, /<div class="w-body" data-action="expand" data-value="">/, "a tap opens the full widget");
  assert.doesNotMatch(html, /data-resize/, "a glance is sized by S / M / L, not dragged");
});

test("the size is the copy's own setting: S / M / L it offers, Full = the table; anything else is ignored", () => {
  const { h, id } = hostWith();
  assert.ok(h.handle(id(), "size", "m"));
  assert.strictEqual(item(h).settings.size, "m");
  assert.match(h.renderItem("main", item(h), { data: DATA }), /w-g-m[\s\S]*<b class="face">m:2<\/b>/);
  h.handle(id(), "size", "full");
  const full = h.renderItem("main", item(h), { data: DATA });
  assert.doesNotMatch(full, /w-glance/);
  assert.match(full, /<table/);
  h.handle(id(), "size", "l");   // not offered by this widget → its natural size
  assert.match(h.renderItem("main", item(h), { data: DATA }), /w-g-s/);
  assert.deepStrictEqual(cleanSettings({ size: "xl" }), {});
  assert.deepStrictEqual(cleanSettings({ size: "m" }), { size: "m" });
});

test("⚙ Look offers the sizes on a board copy, not on the widget's page", () => {
  const { h, id } = hostWith();
  h.handle(id(), "cog", "");
  h.handle(id(), "settings-tab", "look");
  const html = h.renderItem("main", item(h), { data: DATA });
  for (const [v, t] of [["s", "Small"], ["m", "Wide"], ["full", "Full table"]]) {
    assert.match(html, new RegExp(`data-action="size" data-value="${v}">${t}<`));
  }
  assert.doesNotMatch(html, /data-value="l">Large</, "only the sizes the widget offers");
  h.handle("page:g", "cog", "");
  h.handle("page:g", "settings-tab", "look");
  assert.doesNotMatch(h.renderPage("g", { data: DATA }), /data-action="size"/);
});

test("a widget without a glance is always the full table, with no size choice", () => {
  const { h, id } = hostWith(["p"]);
  h.handle(id(), "size", "s");
  const html = h.renderItem("main", item(h), { data: DATA });
  assert.doesNotMatch(html, /w-glance/);
  assert.match(html, /<table/);
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

test("a glance that throws shows the error, not a broken board", () => {
  const bad = { ...G, glance: () => { throw new Error("boom"); } };
  const h = createHost({ registry: { g: bad }, storage: mem() });
  h.handle("page:g", "pin", "");
  assert.match(h.renderItem("main", item(h), { data: DATA }), /The widget failed: boom/);
});

test("gallery preview: the glance at the asked size (natural by default), the table for Full or no glance", () => {
  const h = createHost({ registry: { g: G, p: PLAIN }, storage: mem() });
  assert.strictEqual(h.preview("g", { data: DATA }), '<b class="face">s:2</b>');
  assert.strictEqual(h.preview("g", { data: DATA, size: "m" }), '<b class="face">m:2</b>');
  assert.match(h.preview("g", { data: DATA, size: "full" }), /<table/);
  assert.match(h.preview("p", { data: DATA }), /<table/);
  assert.deepStrictEqual(h.sizesOf("g"), ["s", "m"]);
  assert.deepStrictEqual(h.sizesOf("p"), []);
  assert.strictEqual(h.sizeOf("g"), "s");
});

test("pinning from the gallery can preset the size", () => {
  const h = createHost({ registry: { g: G }, storage: mem() });
  h.handle("page:g", "pin", JSON.stringify({ board: "main", size: "m" }));
  assert.strictEqual(item(h).settings.size, "m");
});
