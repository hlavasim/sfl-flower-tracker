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

test("board controls: resize by the corner, move by dropping onto another widget, remove", () => {
  const h = createHost({ registry: { t: T }, storage: mem() });
  h.handle("page:t", "pin", "");
  h.handle("page:t", "pin", "");
  h.handle("page:t", "pin", "");
  const [a, b, c] = h.doc().boards[0].items;
  h.handle(`b:main:${a.i}`, "resize", "12|10");
  assert.deepStrictEqual([h.doc().boards[0].items[0].w, h.doc().boards[0].items[0].h], [12, 10]);
  assert.match(h.renderItem("main", h.doc().boards[0].items[0], { data: DATA }), /grid-column:span 12[^"]*height:400px/);
  h.handle(`b:main:${c.i}`, "move-to", `b:main:${a.i}`);
  assert.deepStrictEqual(h.doc().boards[0].items.map((x) => x.i), [c.i, a.i, b.i]);
  h.handle(`b:main:${c.i}`, "move-to", `b:main:${b.i}`);
  assert.deepStrictEqual(h.doc().boards[0].items.map((x) => x.i), [a.i, b.i, c.i]);
  assert.strictEqual(h.handle(`b:main:${c.i}`, "move-to", "b:main:nope"), false);
  h.handle(`b:main:${c.i}`, "remove", "");
  h.handle(`b:main:${b.i}`, "move-to", `b:main:${a.i}`);
  assert.deepStrictEqual(h.doc().boards[0].items.map((x) => x.i), [b.i, a.i]);
  h.handle(`b:main:${a.i}`, "remove", "");
  assert.deepStrictEqual(h.doc().boards[0].items.map((x) => x.i), [b.i]);
});

test("the settings popover: a tab sticks across renders; settings-close closes it and only re-renders when it was open", () => {
  let changes = 0;
  const h = createHost({ registry: { t: T }, storage: mem(), onChange: () => changes++ });
  assert.strictEqual(h.handle("page:t", "settings-close", ""), false);
  assert.strictEqual(changes, 0);
  h.handle("page:t", "cog", "");
  assert.match(h.renderPage("t", { data: DATA }), /data-pop/);
  h.handle("page:t", "settings-tab", "look");
  assert.match(h.renderPage("t", { data: DATA }), /data-value="look" aria-selected="true"/);
  h.handle("page:t", "rows-mode", "all");
  assert.match(h.renderPage("t", { data: DATA }), /data-value="look" aria-selected="true"/);
  assert.strictEqual(h.handle("page:t", "settings-close", ""), true);
  assert.doesNotMatch(h.renderPage("t", { data: DATA }), /data-pop/);
  h.handle("page:t", "cog", "");
  assert.match(h.renderPage("t", { data: DATA }), /data-value="cols" aria-selected="true"/);
});

test("pin goes to the first board when there is no 'main' one (a synced document from elsewhere)", () => {
  const storage = mem();
  storage.setItem(BOARDS_KEY, JSON.stringify({ schema: 1, boards: [{ id: "x", name: "X", items: [] }], page: {} }));
  const h = createHost({ registry: { t: T }, storage });
  assert.strictEqual(h.handle("page:t", "pin", ""), true);
  assert.strictEqual(h.doc().boards[0].items.length, 1);
});

test("refresh: the frame offers it and the host hands it to the page with the widget's type", () => {
  const got = [];
  const h = createHost({ registry: { t: T }, storage: mem(), onRefresh: (id, type) => got.push([id, type]) });
  assert.match(h.renderPage("t", { data: DATA }), /data-action="refresh"/);
  assert.strictEqual(h.handle("page:t", "refresh", ""), true);
  h.handle("page:t", "pin", "");
  const [item] = h.doc().boards[0].items;
  h.handle(`b:main:${item.i}`, "refresh", "");
  assert.deepStrictEqual(got, [["page:t", "t"], [`b:main:${item.i}`, "t"]]);
});

test("unknown frames, types and actions are ignored, not thrown", () => {
  const h = createHost({ registry: { t: T }, storage: mem() });
  assert.strictEqual(h.handle("page:nope", "sort", "v"), false);
  assert.strictEqual(h.handle("b:main:missing", "remove", ""), false);
  assert.strictEqual(h.handle("page:t", "fly", ""), false);
  assert.strictEqual(h.handle("garbage", "sort", ""), false);
  assert.match(h.renderItem("main", { i: "z", type: "gone", settings: {}, w: 6 }, { data: {} }), /no longer exists/);
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
  assert.strictEqual(h.freshOf([{ status: "ok", asOf: now - 60_000 }, { status: "ok", asOf: now - 4 * 60_000 }], now).text, "4 min ago");
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
  assert.match(html, /Loading/);
  assert.doesNotMatch(html, /prázdno/);
});

test("review #3: a widget that throws still offers its cog with the reset button", () => {
  const bad = { ...T, build: () => { throw new Error("kaboom"); } };
  const h = createHost({ registry: { t: bad }, storage: mem() });
  h.handle("page:t", "cog", "");
  assert.match(h.renderPage("t", { data: DATA }), /data-action="reset"/);
});

test("pin goes to the board visited last", () => {
  const storage = mem();
  storage.setItem(BOARDS_KEY, JSON.stringify({ schema: 1, last: "dash", page: {},
    boards: [{ id: "main", name: "M", items: [] }, { id: "dash", name: "DASH", items: [] }] }));
  const h = createHost({ registry: { t: T }, storage });
  h.handle("page:t", "pin", "");
  assert.deepStrictEqual(h.doc().boards.map((b) => b.items.length), [0, 1]);
});

test("update(fn) applies a document change and saves it", () => {
  const storage = mem();
  const h = createHost({ registry: { t: T }, storage });
  h.update((d) => ({ ...d, boards: [...d.boards, { id: "x", name: "X", items: [] }] }));
  assert.deepStrictEqual(JSON.parse(storage.getItem(BOARDS_KEY)).boards.map((b) => b.id), ["main", "x"]);
});

test("board operations for the page: add (once), visit = the pin target, remove", () => {
  const h = createHost({ registry: { t: T }, storage: mem() });
  h.addBoard({ id: "dash", name: "DASH", items: [{ i: "a", type: "t", w: 12 }] });
  h.addBoard({ id: "dash", name: "again" });
  assert.deepStrictEqual(h.doc().boards.map((b) => [b.id, b.items.length]), [["main", 0], ["dash", 1]]);
  h.visit("dash");
  h.handle("page:t", "pin", "");
  assert.strictEqual(h.doc().boards[1].items.length, 2);
  h.removeBoard("dash");
  assert.deepStrictEqual(h.doc().boards.map((b) => b.id), ["main"]);
});

test("a page variant: its own frame and settings, forced options hidden from the cog and carried into a pinned copy", () => {
  const O = { ...T, options: [{ key: "cat", label: "Kategorie", kind: "select", choices: [["a", "A"], ["b", "B"]] },
    { key: "top", label: "Top", kind: "number", min: 1, max: 9 }], defaults: { opts: { cat: "a" } },
    build: (d, ctx, opts) => ({ rows: [{ n: String(opts.cat) }], footer: "", empty: "" }) };
  const storage = mem();
  const h = createHost({ registry: { t: O }, storage });
  let html = h.renderPage("t", { data: {}, ctx: {}, variant: "b", force: { cat: "b" } });
  assert.match(html, /data-frame="page:t@b"/);
  assert.deepStrictEqual(rowsIn(html), ["b"]);
  h.handle("page:t@b", "cog", "");
  html = h.renderPage("t", { data: {}, ctx: {}, variant: "b", force: { cat: "b" } });
  assert.doesNotMatch(html, /data-action="opt:cat"/, "a forced option is not offered");
  assert.match(html, /data-action="opt:top"/);
  h.handle("page:t@b", "opt:top", "4");
  assert.deepStrictEqual(JSON.parse(storage.getItem(BOARDS_KEY)).page["t@b"].opts.top, 4);
  // the plain page copy is separate
  assert.deepStrictEqual(rowsIn(h.renderPage("t", { data: {}, ctx: {} })), ["a"]);
  h.handle("page:t@b", "pin", "");
  assert.deepStrictEqual(h.doc().boards[0].items[0].settings.opts, { cat: "b", top: 4 });
});

test("📌 with a chosen board pins there; an unknown board falls back to the last visited", () => {
  const storage = mem();
  storage.setItem(BOARDS_KEY, JSON.stringify({ schema: 1, page: {}, boards: [{ id: "main", name: "M", items: [] }, { id: "x", name: "X", items: [] }] }));
  const h = createHost({ registry: { t: T }, storage });
  h.handle("page:t", "pin", JSON.stringify({ board: "x" }));
  h.handle("page:t", "pin", JSON.stringify({ board: "x" }));
  h.handle("page:t", "pin", JSON.stringify({ board: "gone" }));
  assert.deepStrictEqual(h.doc().boards.map((b) => b.items.length), [1, 2], "two copies on X, each its own item");
  const [a, b] = h.doc().boards[1].items;
  assert.notStrictEqual(a.i, b.i);
});

test("preview: the widget's body with its defaults plus the given options, no frame", () => {
  const h = createHost({ registry: { t: T }, storage: mem() });
  const html = h.preview("t", { data: DATA, ctx: {} });
  assert.doesNotMatch(html, /data-frame/);
  assert.deepStrictEqual(rowsIn(html), ["a", "b"]);
  assert.strictEqual(h.preview("nope", {}), "");
});

test("a widget's summary (tiles, a big bar) renders above its table, also when every row is hidden", () => {
  const S = { ...T, build: ({ list }) => ({ rows: list || [], footer: "", empty: "none", summary: "<p class=s>SUM</p>" }) };
  const h = createHost({ registry: { s: S }, storage: mem() });
  const html = h.renderPage("s", { data: DATA });
  assert.ok(html.indexOf("<p class=s>SUM</p>") < html.indexOf("<table"));
  assert.match(h.renderPage("s", { data: { list: [] } }), /<p class=s>SUM<\/p><div class="w-empty-msg">none/);
});

test("the frame shows the custom title; the summary renders full, compact or not at all", () => {
  const S = { ...T, title: "Own", build: ({ list }) => ({ rows: list || [], footer: "", empty: "none", summary: "<p class=s>SUM</p>" }) };
  const h = createHost({ registry: { s: S }, storage: mem() });
  h.handle("page:s", "title", "Renamed");
  let html = h.renderPage("s", { data: DATA });
  assert.match(html, /class="w-title">Renamed</);
  h.handle("page:s", "summary", "compact");
  html = h.renderPage("s", { data: DATA });
  assert.match(html, /<div class="w-sum-compact"><p class=s>SUM<\/p><\/div>/);
  h.handle("page:s", "summary", "off");
  assert.doesNotMatch(h.renderPage("s", { data: DATA }), /SUM/);
});

test("needs follow each copy's own options: a page copy and a board copy can ask for different data", () => {
  const N = { ...T, options: [{ key: "pet", label: "Pet", kind: "bool" }], defaults: { opts: { pet: false } },
    needs: (farm, o = {}) => ({ d: { res: "compute", farm, section: "cooking", q: { pet: o.pet ? "1" : "0" } } }) };
  const storage = mem();
  const h = createHost({ registry: { n: N }, storage });
  assert.strictEqual(h.needsOf("n", 7)[0].q.pet, "0", "no options given: the defaults");
  h.handle("page:n", "opt:pet", "1");
  assert.deepStrictEqual(h.pageOpts("n"), { pet: true });
  assert.strictEqual(h.needsOf("n", 7, h.pageOpts("n"))[0].q.pet, "1");
  h.handle("page:n", "pin", "");
  const item = h.doc().boards[0].items[0];
  assert.strictEqual(h.needsOf("n", 7, h.itemOpts(item))[0].q.pet, "1", "the pinned copy starts from the page copy");
  const peeked = h.peekData("n", 7, { peek: (q) => (q.q.pet === "1" ? { data: "P1", status: "ok", asOf: 1 } : null) }, h.itemOpts(item));
  assert.deepStrictEqual([peeked.data.d, peeked.pending], ["P1", false]);
});

test("a view widget (a tile) has a cog too: its own options and a title, no table tabs", () => {
  const V = { type: "v", title: "Tile", options: [{ key: "n", label: "N", kind: "number", min: 1, max: 9 }], defaults: { opts: {} },
    view: (d, ctx, o) => ({ html: `<p>n=${o.n ?? "-"}</p>` }) };
  const h = createHost({ registry: { v: V }, storage: mem() });
  assert.match(h.renderPage("v", {}), /data-action="cog"/);
  h.handle("page:v", "cog", "");
  const html = h.renderPage("v", {});
  assert.match(html, /data-action="opt:n"/);
  assert.match(html, /data-action="title"/);
  assert.doesNotMatch(html, /data-value="cols"|data-value="rows"/);
  h.handle("page:v", "opt:n", "4");
  assert.match(h.renderPage("v", {}), /<p>n=4<\/p>/);
  h.handle("page:v", "title", "My tile");
  assert.match(h.renderPage("v", {}), /class="w-title">My tile</);
});
