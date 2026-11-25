import { test } from "node:test";
import assert from "node:assert";
import { createHost } from "../../app/widget-host.mjs";
import { BOARDS_KEY } from "../../app/boards.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";

// The host glues widget + frame + table + boards: the page and the board render and react the same way.

const T = {
  type: "t", title: "Test", page: "fishing",
  defaults: { rows: { mode: "top", top: 2, picked: [] } },
  rowKey: (r) => r.n, rowLabel: (r) => r.n,
  columns: [{ key: "n", label: "N" }, { key: "v", label: "V" }, { key: "x", label: "X", extra: true }],
  build: ({ list }) => ({ rows: list || [], footer: "<i>F</i>", empty: "prázdno" }),
};
const DATA = { list: [{ n: "a", v: 1 }, { n: "b", v: 3 }, { n: "c", v: 2 }] };

function mem() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
const rowsIn = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((x) => x[1]);

test("the registry knows the first widget", () => {
  assert.ok(WIDGETS["fishing-age-now"]);
});

test("page render: the widget's defaults apply; footer shown; empty message when no rows", () => {
  const h = createHost({ registry: { t: T }, storage: mem() });
  const html = h.renderPage("t", { data: DATA });
  assert.match(html, /data-frame="page:t"/);
  assert.deepStrictEqual(rowsIn(html), ["a", "b"]);
  assert.match(html, /<i>F<\/i>/);
  assert.match(h.renderPage("t", { data: { list: [] } }), /prázdno/);
});

test("a table action on the page saves that widget's page settings (synced key) and re-renders", () => {
  const storage = mem(), changed = [];
  const h = createHost({ registry: { t: T }, storage, onChange: (id) => changed.push(id) });
  assert.strictEqual(h.handle("page:t", "sort", "v"), true);
  assert.deepStrictEqual(rowsIn(h.renderPage("t", { data: DATA })), ["b", "c"]);
  assert.deepStrictEqual(JSON.parse(storage.m.get(BOARDS_KEY)).page.t.sort, { key: "v", dir: "desc" });
  assert.deepStrictEqual(changed, ["page:t"]);
});

test("cog toggles the settings panel without saving anything", () => {
  const storage = mem();
  const h = createHost({ registry: { t: T }, storage });
  h.handle("page:t", "cog", "");
  assert.match(h.renderPage("t", { data: DATA }), /data-action="col-toggle"/);
  assert.strictEqual(storage.m.size, 0);
  h.handle("page:t", "cog", "");
  assert.doesNotMatch(h.renderPage("t", { data: DATA }), /data-action="col-toggle"/);
});

test("pin copies the page settings to the board; the page shows the count; board copy is independent", () => {
  const h = createHost({ registry: { t: T }, storage: mem() });
  h.handle("page:t", "rows-mode", "all");
  h.handle("page:t", "pin", "");
  assert.match(h.renderPage("t", { data: DATA }), /📌 1/);
  const [item] = h.doc().boards[0].items;
  assert.strictEqual(item.type, "t");
  const id = `b:main:${item.i}`;
  assert.deepStrictEqual(rowsIn(h.renderItem("main", item, { data: DATA })), ["a", "b", "c"]);
  h.handle(id, "rows-mode", "top");
  assert.deepStrictEqual(rowsIn(h.renderItem("main", h.doc().boards[0].items[0], { data: DATA })), ["a", "b"]);
  assert.deepStrictEqual(rowsIn(h.renderPage("t", { data: DATA })), ["a", "b", "c"]);
});

test("board controls: width, move, remove", () => {
  const h = createHost({ registry: { t: T }, storage: mem() });
  h.handle("page:t", "pin", "");
  h.handle("page:t", "pin", "");
  const [a, b] = h.doc().boards[0].items;
  h.handle(`b:main:${a.i}`, "width", "12");
  assert.strictEqual(h.doc().boards[0].items[0].w, 12);
  assert.match(h.renderItem("main", h.doc().boards[0].items[0], { data: DATA }), /grid-column:span 12/);
  h.handle(`b:main:${b.i}`, "move-up", "");
  assert.deepStrictEqual(h.doc().boards[0].items.map((x) => x.i), [b.i, a.i]);
  h.handle(`b:main:${a.i}`, "remove", "");
  assert.deepStrictEqual(h.doc().boards[0].items.map((x) => x.i), [b.i]);
});

test("unknown frames, types and actions are ignored, not thrown", () => {
  const h = createHost({ registry: { t: T }, storage: mem() });
  assert.strictEqual(h.handle("page:nope", "sort", "v"), false);
  assert.strictEqual(h.handle("b:main:missing", "remove", ""), false);
  assert.strictEqual(h.handle("page:t", "fly", ""), false);
  assert.strictEqual(h.handle("garbage", "sort", ""), false);
  assert.match(h.renderItem("main", { i: "z", type: "gone", settings: {}, w: 6 }, { data: {} }), /už neexistuje/);
});

test("a widget that throws while building shows the error in its frame, the page survives", () => {
  const bad = { ...T, build: () => { throw new Error("kaboom"); } };
  const html = createHost({ registry: { t: bad }, storage: mem() }).renderPage("t", { data: DATA });
  assert.match(html, /data-frame="page:t"/);
  assert.match(html, /kaboom/);
});

test("reload picks up a document changed elsewhere (prefs pull)", () => {
  const storage = mem();
  const h = createHost({ registry: { t: T }, storage });
  const other = createHost({ registry: { t: T }, storage });
  other.handle("page:t", "pin", "");
  assert.strictEqual(h.doc().boards[0].items.length, 0);
  h.reload();
  assert.strictEqual(h.doc().boards[0].items.length, 1);
});

test("loadData: a widget's needs go through the store; a need named farm gets the game farm", async () => {
  const W = { ...T, needs: (farm) => ({ farm: { res: "farm", farm }, extra: { res: "x", farm } }) };
  const asked = [];
  const store = { get: async (q) => { asked.push(q); return q.res === "farm" ? { status: "ok", asOf: 5, data: { farm: { inventory: { a: 1 } } } } : { status: "error", asOf: null, error: "e", data: null }; } };
  const h = createHost({ registry: { t: W }, storage: mem() });
  const { data, entries } = await h.loadData("t", 77, store);
  assert.deepStrictEqual(asked, [{ res: "farm", farm: 77 }, { res: "x", farm: 77 }]);
  assert.deepStrictEqual(data, { farm: { inventory: { a: 1 } }, extra: null });
  assert.strictEqual(entries.length, 2);
  assert.deepStrictEqual(await h.loadData("gone", 77, store), { data: {}, entries: [] });
});

test("freshOf: the worst of a widget's entries decides the badge", () => {
  const h = createHost({ registry: { t: T }, storage: mem() });
  const now = 10 * 60_000;
  assert.strictEqual(h.freshOf([{ status: "ok", asOf: now - 60_000 }, { status: "ok", asOf: now - 4 * 60_000 }], now).text, "před 4 min");
  assert.strictEqual(h.freshOf([{ status: "ok", asOf: now }, { status: "error", stale: false, error: "x" }], now).level, "error");
  assert.strictEqual(h.freshOf([], now).level, "loading");
});

test("peekData: renders from what the store already has; pending only while a required need is missing", () => {
  const W = { ...T, needs: (farm) => ({ farm: { res: "farm", farm }, slow: { res: "slow", farm } }), optional: ["slow"] };
  const have = new Map();
  const store = { peek: (q) => have.get(q.res) || null };
  const h = createHost({ registry: { t: W }, storage: mem() });
  assert.strictEqual(h.peekData("t", 1, store).pending, true);
  have.set("farm", { status: "ok", asOf: 1, data: { farm: { x: 1 } } });
  const p = h.peekData("t", 1, store);
  assert.strictEqual(p.pending, false);
  assert.deepStrictEqual(p.data, { farm: { x: 1 }, slow: null });
  assert.strictEqual(p.entries.length, 1);
  assert.deepStrictEqual(h.needsOf("t", 1), [{ res: "farm", farm: 1 }, { res: "slow", farm: 1 }]);
  assert.deepStrictEqual(h.needsOf("gone", 1), []);
});

test("a pending board item shows its frame and controls with a loading body", () => {
  const h = createHost({ registry: { t: T }, storage: mem() });
  const html = h.renderItem("main", { i: "a", type: "t", settings: {}, w: 6 }, { data: {}, pending: true });
  assert.match(html, /data-action="remove"/);
  assert.match(html, /Načítám/);
  assert.doesNotMatch(html, /prázdno/);
});

test("review #3: a widget that throws still offers its cog with the reset button", () => {
  const bad = { ...T, build: () => { throw new Error("kaboom"); } };
  const h = createHost({ registry: { t: bad }, storage: mem() });
  h.handle("page:t", "cog", "");
  assert.match(h.renderPage("t", { data: DATA }), /data-action="reset"/);
});
