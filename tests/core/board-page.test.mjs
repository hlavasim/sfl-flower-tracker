import "../helpers/page-engine.mjs";
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createStore } from "../../app/store.mjs";
import { createHost } from "../../app/widget-host.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { BOARDS_KEY } from "../../app/boards.mjs";

// MY DASHBOARD (?page=board): the page's real script renders the pinned widgets from the synced
// boards document, with data through the store.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
const SCRIPT = SRC.slice(SRC.indexOf("<script>") + 8, SRC.lastIndexOf("</script>"));
const FARM = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/farm-155498.json"), "utf8"));

test("board is a page, first under MORE, routed to renderBoard", () => {
  assert.match(SRC, /"leveling", "board"\];/);
  assert.match(SRC, /const overflow = \[\s*\{ id: "board", label: "📌 MŮJ DASHBOARD" \}/);
  assert.match(SRC, /if \(page === "board"\) \{ renderConfigBar\(page\); renderBoard\(\); return; \}/);
});

async function renderBoardWith(boardsJson, { slowLeveling = false } = {}) {
  const mem = new Map([["sfl_config", JSON.stringify({ farm: "155498" })]]);
  if (boardsJson) mem.set(BOARDS_KEY, boardsJson);
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  // The farm answers; leveling does not (its badge shows the error, the widget still renders).
  globalThis.__store = createStore({ fetch: (url) => (url.includes("/api/proxy")
    ? Promise.resolve({ ok: true, status: 200, json: async () => FARM })
    : slowLeveling ? new Promise(() => {}) : Promise.resolve({ ok: false, status: 503, json: async () => ({}) })) });
  globalThis.__widgets = createHost({ registry: WIDGETS, storage });
  const app = { innerHTML: "", querySelector: () => null };
  const stub = () => ({ innerHTML: "", style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, addEventListener() {}, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [], dataset: {} });
  const els = { app };
  const doc = { getElementById: (id) => els[id] || (els[id] = stub()), querySelector: () => null, querySelectorAll: () => [],
    createElement: stub, addEventListener() {}, removeEventListener() {}, body: stub(), documentElement: stub(), head: stub(), readyState: "complete", cookie: "" };
  const win = { localStorage: storage, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "https://example.test/?page=board", search: "?page=board", hash: "", pathname: "/", origin: "https://example.test" },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    history: { replaceState() {}, pushState() {} }, navigator: { userAgent: "node" }, console };
  win.window = win; win.document = doc;
  const run = new Function("window", "document", "localStorage", "sessionStorage", "fetch", "requestAnimationFrame", "setTimeout",
    "setInterval", "clearTimeout", "clearInterval", "location", "history", "navigator", "matchMedia",
    `${SCRIPT}
     return { renderBoard: typeof renderBoard === "function" ? renderBoard : null, setFarm: (f) => { FARM_ID = f; } };`);
  const api = run(win, doc, storage, win.sessionStorage, async () => ({ ok: false, status: 503, json: async () => ({}) }),
    () => 0, () => 0, () => 0, () => {}, () => {}, win.location, win.history, win.navigator, win.matchMedia);
  assert.ok(api.renderBoard, "renderBoard is declared");
  api.setFarm("155498");
  if (slowLeveling) { api.renderBoard(); await new Promise((r) => setTimeout(r, 50)); }
  else await api.renderBoard();
  return { html: app.innerHTML, win };
}

test("an empty board explains how to pin", async () => {
  const { html } = await renderBoardWith(null);
  assert.match(html, /MŮJ DASHBOARD|Můj dashboard/);
  assert.match(html, /klikni na 📌/);
});

test("a pinned widget renders in the grid with its own settings and board controls", async () => {
  const boards = JSON.stringify({ schema: 1, page: {}, boards: [{ id: "main", name: "Můj dashboard", items: [
    { i: "w1", type: "fishing-age-now", w: 8, h: 0, settings: { columns: ["name", "age"], rows: { mode: "top", top: 3, picked: [] } } },
  ] }] });
  const { html, win } = await renderBoardWith(boards);
  assert.match(html, /class="w-board"/);
  assert.match(html, /data-frame="b:main:w1"/);
  assert.match(html, /grid-column:span 8/);
  assert.match(html, /data-action="remove"/);
  assert.strictEqual((html.match(/<tr data-row=/g) || []).length, 3);
  assert.doesNotMatch(html, />proč</);
  assert.strictEqual(win._wRerender && win._wRerender.name, "renderBoard");
});

test("a pinned widget whose type is gone does not break the board", async () => {
  const boards = JSON.stringify({ schema: 1, page: {}, boards: [{ id: "main", name: "B", items: [{ i: "x", type: "removed-widget", settings: {}, w: 6 }] }] });
  const { html } = await renderBoardWith(boards);
  assert.match(html, /už neexistuje/);
});

test("a slow optional need (the leveling plan) does not hold the board: it paints with the farm alone", async () => {
  const boards = JSON.stringify({ schema: 1, page: {}, boards: [{ id: "main", name: "B", items: [{ i: "w1", type: "fishing-age-now", settings: {}, w: 6 }] }] });
  const { html } = await renderBoardWith(boards, { slowLeveling: true });
  assert.match(html, /<tr data-row=/);
  assert.doesNotMatch(html, /Načítám/);
});
