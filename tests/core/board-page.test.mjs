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

test("DASH (the boards) is the home page, first in the bar; CHORES next to it; routed to renderBoard", () => {
  assert.match(SRC, /"leveling", "board"\];/);
  assert.match(SRC, /const primary = \[\s*\{ id: "board", label: "DASH" \},\s*\{ id: "chores", label: "CHORES" \}/);
  assert.match(SRC, /if \(page === "dashboard"\) return "chores";/);
  assert.match(SRC, /return "board";\s*\}/);
  assert.match(SRC, /if \(page === "board"\) \{ renderBoard\(\); return; \}/);
});

async function renderBoardWith(boardsJson, { slowLeveling = false, page = "board", search = "", extra = {} } = {}) {
  const mem = new Map([["sfl_config", JSON.stringify({ farm: "155498" })], ...Object.entries(extra)]);
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
    location: { href: `https://example.test/?page=${page}${search}`, search: `?page=${page}${search}`, hash: "", pathname: "/", origin: "https://example.test" },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    history: { replaceState() {}, pushState() {} }, navigator: { userAgent: "node" }, console };
  win.window = win; win.document = doc;
  const run = new Function("window", "document", "localStorage", "sessionStorage", "fetch", "requestAnimationFrame", "setTimeout",
    "setInterval", "clearTimeout", "clearInterval", "location", "history", "navigator", "matchMedia",
    `${SCRIPT}
     return { renderBoard: typeof renderBoard === "function" ? renderBoard : null, renderDashboard, setFarm: (f) => { FARM_ID = f; } };`);
  const api = run(win, doc, storage, win.sessionStorage, async () => ({ ok: false, status: 503, json: async () => ({}) }),
    () => 0, () => 0, () => 0, () => {}, () => {}, win.location, win.history, win.navigator, win.matchMedia);
  assert.ok(api.renderBoard, "renderBoard is declared");
  api.setFarm("155498");
  const render = page === "chores" ? () => api.renderDashboard() : () => api.renderBoard();
  // DASH also waits on the price fetch for the bounties, which never settles under the stubbed timers
  if (slowLeveling || page === "chores") { render(); await new Promise((r) => setTimeout(r, 50)); }
  else await render();
  return { html: app.innerHTML, win, api, app, storage };
}

test("an empty board explains how to pin", async () => {
  const { html } = await renderBoardWith(null);
  assert.match(html, /My dashboard/);
  assert.match(html, /Click ＋ Add widget/);
  assert.match(html, /onclick="_wGallery\(this\.dataset\.board\)">＋ Add widget</);
});

test("a pinned widget renders in the grid with its own settings and board controls", async () => {
  const boards = JSON.stringify({ schema: 1, page: {}, boards: [{ id: "main", name: "Můj dashboard", items: [
    { i: "w1", type: "fishing-age-now", w: 8, h: 0, settings: { size: "full", columns: ["name", "age"], rows: { mode: "top", top: 3, picked: [] } } },
  ] }] });
  const { html, win } = await renderBoardWith(boards);
  assert.match(html, /class="w-board"/);
  assert.match(html, /data-frame="b:main:w1"/);
  assert.match(html, /grid-column:span 4/, "8/12 of the default 6 columns");
  assert.match(html, /data-action="remove"/);
  assert.strictEqual((html.match(/<tr data-row=/g) || []).length, 3);
  assert.doesNotMatch(html, />proč</);
  assert.strictEqual(win._wRerender && win._wRerender.name, "renderBoard");
});

test("a pinned widget whose type is gone does not break the board", async () => {
  const boards = JSON.stringify({ schema: 1, page: {}, boards: [{ id: "main", name: "B", items: [{ i: "x", type: "removed-widget", settings: {}, w: 6 }] }] });
  const { html } = await renderBoardWith(boards);
  assert.match(html, /no longer exists/);
});

test("a slow optional need (the leveling plan) does not hold the board: it paints with the farm alone", async () => {
  const boards = JSON.stringify({ schema: 1, page: {}, boards: [{ id: "main", name: "B", items: [{ i: "w1", type: "fishing-age-now", settings: { size: "full" }, w: 6 }] }] });
  const { html } = await renderBoardWith(boards, { slowLeveling: true });
  assert.match(html, /<tr data-row=/);
  assert.doesNotMatch(html, /Loading…/);
});

test("review #4/#6: a newer board render supersedes an older one's late paints; widgets load apart from the engine", () => {
  assert.match(SRC, /const mine = \+\+_boardSeq;/);
  assert.match(SRC, /if \(getPage\(\) !== page \|\| seq !== _navSeq \|\| mine !== _boardSeq\) return;/);
  assert.match(SRC, /const board = __widgets\.doc\(\)\.boards\.find\(\(b\) => b\.id === boardId\);\s*\/\/ read at paint time/);
  // The engine no longer depends on the widget modules loading.
  assert.match(SRC, /Promise\.all\(\[import\("\/core\/browser-engine\.mjs"\), import\("\/app\/store\.mjs"\)\]\)/);
  assert.match(SRC, /const _widgetsReady = Promise\.all\(\[import\("\/app\/widget-host\.mjs"\), import\("\/widgets\/registry\.mjs"\), import\("\/ui\/frame\.mjs"\)\]\)/);
  assert.match(SRC, /\.catch\(\(e\) => console\.error\("\[widgets\] did not load"/);
});

const docOf = (storage) => JSON.parse(storage.getItem(BOARDS_KEY));

test("CHORES (the old DASH) is a page: its widgets render on it (each with 📌 to copy it to a board); no DASH board is created", async () => {
  const { app, storage, api } = await renderBoardWith(null, { page: "board" });
  api.renderDashboard({ farm: FARM.farm });
  await new Promise((r) => setTimeout(r, 50));
  assert.match(app.innerHTML, /<h1>CHORES<\/h1>/);
  assert.match(app.innerHTML, /data-frame="page:dash-actions"/);
  assert.match(app.innerHTML, /data-frame="page:weather-protection"/);
  assert.match(app.innerHTML, /data-action="pin"/);
  assert.ok(!(docOf(storage) || { boards: [] }).boards.some((b) => b.id === "dash"));
  assert.doesNotMatch(SRC, /dashVoice|voiceDue|speechSynthesis/, "no voice");
});

test("no HUB page and no config bar: without a farm id one page asks for it; the farm chip in the bar changes it", () => {
  assert.doesNotMatch(SRC, /renderHub|"hub"/);
  assert.doesNotMatch(SRC, /renderConfigBar|expandConfig|configExpanded/);
  assert.match(SRC, /if \(!FARM_ID \|\| _welcomeOpen\) \{ renderWelcome\(\); return; \}/);
  assert.match(SRC, /<input id="cfg-farm"/);
  assert.match(SRC, /onclick="changeFarm\(\)"/);
  // and no "under development" banners anywhere
  assert.doesNotMatch(SRC, /UNDER DEVELOPMENT/);
});

test("every board page has the switcher; ?board= picks the board", async () => {
  const boards = JSON.stringify({ schema: 1, page: {}, boards: [
    { id: "main", name: "Můj dashboard", items: [] }, { id: "x1", name: "Rybaření", items: [] }] });
  const { html, storage } = await renderBoardWith(boards, { search: "&board=x1" });
  assert.match(html, /<h1>📌 Rybaření<\/h1>/);
  assert.match(html, /data-board="main" onclick="_wOpenBoard\(this\.dataset\.board\)"/);
  assert.match(html, /_wNewBoard\(\)/);
  assert.match(html, /data-board="x1" onclick="_wDeleteBoard\(this\.dataset\.board\)"/, "a board of one's own can be deleted");
  assert.strictEqual(docOf(storage).last, "x1");
  const main = await renderBoardWith(boards);
  assert.match(main.html, /<h1>📌 Můj dashboard<\/h1>/);
  assert.doesNotMatch(main.html, /_wDeleteBoard/);
});

test("the DASH parser takes a widget's filters for one call, the stored toggles otherwise", () => {
  assert.match(SRC, /function parseDashboardActions\(farm, limits = \{\}\) \{\s*const _prevOverride = _dashPrefOverride;\s*_dashPrefOverride = limits\.filters \|\| null;/);
  assert.match(SRC, /return _dashPrefOverride \? \{ \.\.\.p, \.\.\._dashPrefOverride \} : p;/);
});

test("the board repaints frame by frame", () => {
  assert.match(SRC, /window\.__wPatch = frame\.patchFrames;/);
  assert.match(SRC, /if \(!grid \|\| !__wPatch\(grid, frames\)\) \{/);
});

test("FLOWERS: every panel is the page's own widget, the page's mode feeds them", () => {
  // one renderPage call per panel, each with the farm and its _wCtx (+ the page-only PB timer id)
  assert.match(SRC, /const w = \(type, extra\) => __widgets\.renderPage\(type, \{ data: \{ farm: data\.farm \}, ctx: Object\.assign\(_wCtx\(type\), extra \|\| \{\}\), fresh: _wFlowerFresh \}\);/);
  for (const t of ["flower-beds", "beehives", "flower-gifts", "flower-gift-cycle", "grow-planner", "flowers-needs"]) assert.ok(SRC.includes(`w("${t}")`), t);
  assert.match(SRC, /w\("petal-blessed", \{ pbTimer: true \}\)/);
  assert.match(SRC, /_wCtxMap\["flower-gifts"\] = _wCtxMap\["flower-gift-cycle"\] = \(\) => \(\{ icon: _wIcon, model: \(farm\) => _giftsModel\(_flowerPageData\(farm\)\) \}\);/);
  assert.match(SRC, /_wCtxMap\["grow-planner"\] = /);
  assert.match(SRC, /_wCtxMap\["petal-blessed"\] = /);
  assert.match(SRC, /if \(type === "flowers-needs"\) return \{ pageFlowers: \(\) => \(\{ mode: getFlowerMode\(\), n: getFlowerN\(\), giftPlan: getGiftPlan\(\) \}\),/);
  assert.match(SRC, /window\._wRerender = \(\) => \{ if \(getPage\(\) === "flowers" && cachedFarmData\) renderFlowers\(cachedFarmData\); \};/);
  // the old seed sections, summary bar and "currently growing" are gone from the FLOWERS page
  const body = SRC.slice(SRC.indexOf("    function renderFlowers(data) {"), SRC.indexOf("    function renderDolls(data) {"));
  assert.doesNotMatch(body, /<div class="seed-header pixel-font">/);
  assert.doesNotMatch(body, /summary-bar/);
  assert.doesNotMatch(body, /CURRENTLY GROWING/);
  // the retro header, the old gift/planner/PB markup are gone too
  assert.doesNotMatch(body, /pixel-panel|FLOWER TRACKER|renderGiftsSection|renderGrowPlanner|togglePetalBlessed/);
  assert.match(body, /_wPageHead\("🌸 Flowers"/);
});

test("📌 asks which board (the boards, or a new one); ＋ Add widget shows every widget by page with a live preview", () => {
  // a page widget's 📌 and the page buttons both go to the menu
  assert.match(SRC, /action === "pin" && window\._wPinMenu\s*\? window\._wPinMenu\(id, null, e && e\.target\)/);
  assert.match(SRC, /_wPinMenu\("page:" \+ type, opts, btn\);/);
  assert.match(SRC, /'<div class="w-pinmenu-h">Pin to…<\/div>'/);
  assert.match(SRC, /'<button type="button" data-new="1">＋ New board…<\/button>'/);
  assert.match(SRC, /__widgets\.handle\(frameId, "pin", JSON\.stringify\(\{ board, opts \}\)\);/);
  // the gallery: categories by page, the target list once per category, previews through the store
  assert.match(SRC, /for \(const cat of \["dolls", "crabs", "flowers", "foods"\]\) out\.push/);
  assert.match(SRC, /el\.innerHTML = __widgets\.preview\(it\.type, \{ data: data\.get\(k\), ctx: _wCtx\(it\.type\), opts: it\.opts, size: size\[k\] \}\);/);
  assert.match(SRC, /__widgets\.handle\("page:" \+ it\.type, "pin", JSON\.stringify\(\{ board: boardId, opts: it\.opts, \.\.\.pick \}\)\);/);
  // a model widget: its look, ◀ n / total ▶ through the offered looks, Looks = every look at once to pick from
  assert.match(SRC, /const r = __widgets\.lookPreview\(it\.type, \{ data: data\.get\(k\), ctx: _wCtx\(it\.type\), opts: it\.opts, look: look\[k\] \}\);/);
  assert.match(SRC, /__widgets\.lookPicker\(it\.type, \{ data: data\.get\(k\), ctx: _wCtx\(it\.type\), opts: it\.opts, current: asTable\[k\] \? "full" : look\[k\] \}\)/);
  // the board: a phone 2 columns, a tablet up to 4; the looks' font size from the real cell
  assert.match(SRC, /if \(w < 700\) return 2;/);
  assert.match(SRC, /grid\.style\.setProperty\("--fs", \(Math\.max\(cell, 140\) \/ 170\) \* 13 \+ "px"\);/);
  assert.match(SRC, /<link rel="stylesheet" href="\/ui\/glance-templates\.css">/);
  // each card at its own size, S / M / L / Table switchable, a glance widget first in its section
  assert.match(SRC, /const card = \(it, label\) => `<div class="w-gal-card w-gal-\$\{size\[it\.k\]\}"/);
  assert.match(SRC, /data-size="\$\{sz\}"/);
  assert.match(SRC, /here\.sort\(\(a, b\) => \(size\[a\.k\] === "full"\) - \(size\[b\.k\] === "full"\)\);/);
});

test("the gallery loads a preview only when its card scrolls into view, two at a time", () => {
  assert.match(SRC, /while \(running < 2 && queue\.length\) \{/);
  assert.match(SRC, /new IntersectionObserver\(\(list\) => \{/);
  assert.match(SRC, /g\.querySelectorAll\("\.w-gal-card"\)\.forEach\(\(c\) => io\.observe\(c\)\);/);
});

test("the gallery has a search over title, page and type; pages it does not list go under OTHER", () => {
  assert.match(SRC, /<input type="search" class="w-gal-search"/);
  assert.match(SRC, /c\.hidden = !!q && !c\.dataset\.search\.includes\(q\);/);
  assert.match(SRC, /\[\.\.\._wGalleryCats, \["", "OTHER"\]\]/);
});
