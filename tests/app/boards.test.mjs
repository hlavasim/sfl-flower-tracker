import { test } from "node:test";
import assert from "node:assert";
import { BOARDS_KEY, emptyBoards, parseBoards, pin, unpin, moveItem, resizeItem, updateItemSettings,
  pageSettings, setPageSettings, pinnedCount, loadBoards, saveBoards } from "../../app/boards.mjs";

// The boards document: what is pinned where, at what size, with which settings; plus the settings
// of each widget on its own page. One synced localStorage key.

const ids = () => { let n = 0; return () => `w${++n}`; };

test("the key is sfl_boards; an empty document has one board", () => {
  assert.strictEqual(BOARDS_KEY, "sfl_boards");
  const d = emptyBoards();
  assert.strictEqual(d.schema, 1);
  assert.strictEqual(d.boards.length, 1);
  assert.deepStrictEqual(d.boards[0].items, []);
  assert.deepStrictEqual(d.page, {});
});

test("a malformed document never breaks the page: it reads as empty", () => {
  for (const raw of [null, "", "{", "[]", '{"schema":99}', '{"schema":1,"boards":"x"}', "42"]) {
    assert.deepStrictEqual(parseBoards(raw), emptyBoards(), String(raw));
  }
});

test("bad items are dropped, good ones kept with sizes clamped", () => {
  const raw = JSON.stringify({ schema: 1, boards: [{ id: "main", name: "B", items: [
    { i: "a", type: "fishing-age-now", settings: {}, w: 40, h: -3 },
    { i: 5, type: "x" }, { type: "no-id" }, null,
    { i: "b", type: "leveling-ladder" },
  ] }], page: { "fishing-age-now": { density: "compact" }, bad: "str" } });
  const d = parseBoards(raw);
  assert.deepStrictEqual(d.boards[0].items, [
    { i: "a", type: "fishing-age-now", settings: {}, w: 12, h: 0 },
    { i: "b", type: "leveling-ladder", settings: {}, w: 6, h: 0 },
  ]);
  assert.deepStrictEqual(d.page, { "fishing-age-now": { density: "compact" } });
});

test("pin copies the settings; unpin, move, resize and settings update address one item", () => {
  const id = ids();
  const settings = { columns: ["name"] };
  let d = pin(emptyBoards(), { type: "fishing-age-now", settings }, "main", id);
  d = pin(d, { type: "leveling-ladder", settings: {}, w: 12 }, "main", id);
  settings.columns.push("mutated");
  assert.deepStrictEqual(d.boards[0].items.map((x) => [x.i, x.type, x.w]), [["w1", "fishing-age-now", 6], ["w2", "leveling-ladder", 12]]);
  assert.deepStrictEqual(d.boards[0].items[0].settings, { columns: ["name"] });
  d = moveItem(d, "main", "w2", -1);
  assert.deepStrictEqual(d.boards[0].items.map((x) => x.i), ["w2", "w1"]);
  d = moveItem(d, "main", "w2", -1);
  assert.deepStrictEqual(d.boards[0].items.map((x) => x.i), ["w2", "w1"]);
  d = resizeItem(d, "main", "w1", { w: 0, h: 3 });
  assert.deepStrictEqual([d.boards[0].items[1].w, d.boards[0].items[1].h], [1, 3]);
  d = updateItemSettings(d, "main", "w1", { textSize: 120 });
  assert.deepStrictEqual(d.boards[0].items[1].settings, { textSize: 120 });
  assert.strictEqual(pinnedCount(d, "fishing-age-now"), 1);
  d = unpin(d, "main", "w1");
  assert.deepStrictEqual(d.boards[0].items.map((x) => x.i), ["w2"]);
  assert.strictEqual(pinnedCount(d, "fishing-age-now"), 0);
});

test("updates never mutate the document they are given", () => {
  const d0 = emptyBoards();
  const d1 = pin(d0, { type: "t", settings: {} }, "main", ids());
  assert.strictEqual(d0.boards[0].items.length, 0);
  const d2 = setPageSettings(d1, "t", { density: "compact" });
  assert.deepStrictEqual(d1.page, {});
  assert.deepStrictEqual(pageSettings(d2, "t"), { density: "compact" });
  assert.deepStrictEqual(pageSettings(d2, "other"), {});
});

test("load/save round-trip through a storage object", () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  assert.deepStrictEqual(loadBoards(storage), emptyBoards());
  const d = pin(emptyBoards(), { type: "t", settings: { a: 1 } }, "main", ids());
  saveBoards(storage, d);
  assert.deepStrictEqual(loadBoards(storage), d);
  assert.deepStrictEqual(loadBoards({ getItem: () => { throw new Error("blocked"); } }), emptyBoards());
});
