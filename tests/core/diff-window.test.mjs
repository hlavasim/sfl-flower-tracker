import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { diffWindowRange, parseDiffRange } from "../../core/sections/diff.mjs";

/*
 * The diff page's timeline drew every period it had loaded. In raw mode that is hundreds of
 * bars: the chart ran off the right-hand edge, and "now" — the one bar the page is opened to
 * look at — was the one you had to scroll to reach. It is now a WINDOW, 20 wide by default,
 * pinned to the newest end, moved with a slicer.
 *
 * The maths is pinned here directly (it is shared with the page through core, and twin-copies
 * keeps the two byte-identical); the wiring is pinned by rendering the real page below.
 */

test("the window is 20 wide and pinned to the newest, which is what a fresh load wants", () => {
  const w = diffWindowRange(143, 20, null);
  assert.deepEqual(w, { start: 123, end: 142, size: 20, total: 143, maxStart: 123, atNow: true });
  // end is INCLUSIVE: slice(start, end+1) is exactly 20 rows, the last of them the newest.
  assert.equal(w.end - w.start + 1, 20);
});

test("a start that no longer fits lands on the newest rows, never on an empty chart", () => {
  // Period switched from 143 hours to 9 days while the window sat at index 120.
  const w = diffWindowRange(9, 20, 120);
  assert.deepEqual(w, { start: 0, end: 8, size: 9, total: 9, maxStart: 0, atNow: true });
  // Negative, NaN and past-the-end all clamp rather than throw or blank the chart.
  assert.equal(diffWindowRange(143, 20, -5).start, 0);
  assert.equal(diffWindowRange(143, 20, 999).start, 123);
  assert.equal(diffWindowRange(143, 20, NaN).start, 123, "unparseable start = pin to now");
});

test("size 0 means everything, and an empty load is a legal empty window", () => {
  const all = diffWindowRange(143, 0, null);
  assert.equal(all.size, 143);
  assert.equal(all.start, 0);
  assert.equal(diffWindowRange(143, 500, null).size, 143, "a window wider than the data is the data");
  const none = diffWindowRange(0, 20, null);
  assert.deepEqual(none, { start: 0, end: -1, size: 0, total: 0, maxStart: 0, atNow: true });
});

test("a from/to window normalises, tolerates one open end, and fixes a reversed pair", () => {
  const r = parseDiffRange("2026-08-20T22:33", "2026-08-20T22:40");
  assert.ok(r.from < r.to && r.from.endsWith("Z"), `ISO UTC, ordered: ${JSON.stringify(r)}`);
  // Either end may be absent: "since Tuesday" and "up to 22:40" are both real questions.
  assert.deepEqual(parseDiffRange("2026-08-20T22:33", ""), { from: "2026-08-20T20:33:00.000Z", to: null });
  assert.deepEqual(parseDiffRange("", null), { from: null, to: null });
  // Typing the boxes in the wrong order is a slip, not a request for an empty chart.
  const swapped = parseDiffRange("2026-08-20T22:40", "2026-08-20T22:33");
  assert.deepEqual(swapped, parseDiffRange("2026-08-20T22:33", "2026-08-20T22:40"));
  // Garbage is dropped, not passed to SQL as a date.
  assert.deepEqual(parseDiffRange("yesterday-ish", "2026-13-45"), { from: null, to: null });
});

/*
 * The endpoint that makes a sub-period question answerable.
 *
 * group=day over 22:33-22:40 must bucket only the rows in that window — filtering day buckets
 * after the fact can only ever hand back the whole day. pg is not installed at the repo root
 * (the suite runs with no dependencies at all), so the handler cannot be imported and run here;
 * what is checked is the wiring that carries the bounds into the query.
 */
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const API = readFileSync(path.join(ROOT_DIR, "api/farm-diff-agg.js"), "utf8");

test("farm-diff-agg bounds its buckets with from/to, by the same parser the page uses", () => {
  /*
   * The parser is COPIED into the handler, not imported. A .js handler in a package without
   * "type": "module" builds fine with an `import ... from "../core/sections/diff.mjs"` and then
   * fails at runtime with FUNCTION_INVOCATION_FAILED on every request — which is how this
   * endpoint went from working to 500 on all grouped periods with a green build. So the copy is
   * deliberate, and this pins it to core's so the two cannot drift.
   */
  const norm = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
  const grab = (src) => {
    const i = src.indexOf("function parseDiffRange");
    assert.ok(i > 0, "parseDiffRange is declared");
    const open = src.indexOf("{", i);
    let d = 0;
    for (let k = open; k < src.length; k++) {
      if (src[k] === "{") d++;
      else if (src[k] === "}" && --d === 0) return src.slice(i, k + 1);
    }
  };
  const CORE = readFileSync(path.join(ROOT_DIR, "core/sections/diff.mjs"), "utf8");
  assert.equal(norm(grab(API)), norm(grab(CORE)), "the handler's copy matches core's, body for body");
  assert.ok(!/from "\.\.\/core\//.test(API),
    "and it does NOT import across the api/ boundary — that is what crashed the function");
  assert.ok(/const range = parseDiffRange\(req\.query\.from, req\.query\.to\)/.test(API));
  // Both CTEs — the one summing values and the one counting snapshots — must carry the bounds,
  // or the counts describe a different set of rows from the sums.
  assert.equal((API.match(/AND captured_at >= \$3 AND captured_at <= \$4/g) || []).length, 2,
    "both the raw_diffs and the counts CTE are bounded");
  assert.ok(!/NOW\(\) - \(\$3 \* interval/.test(API), "the old relative-days bound is gone");
  assert.ok(/\[farmId, group, fromTs, toTs\]/.test(API), "and the bounds are the query's parameters");
  // Absent bounds keep the previous behaviour rather than returning everything ever recorded.
  assert.ok(/range\.from \|\| new Date\(Date\.now\(\) - days \* 86400000\)\.toISOString\(\)/.test(API),
    "no `from` still means the last `days` days");
});

/*
 * And the page itself. renderDiff is the most involved render on the site — it fetches prices,
 * history and valuations, and mounts two other panels — so the window is pinned by rendering the
 * real thing against stubbed upstreams rather than by testing a helper in isolation.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
const SCRIPT = SRC.slice(SRC.indexOf("<script>") + 8, SRC.lastIndexOf("</script>"));

// 60 snapshots, 10 minutes apart, newest first — the shape /api/farm-history?latest= returns.
const T0 = Date.parse("2026-08-20T12:00:00Z");
const SNAPS = Array.from({ length: 60 }, (_, i) => ({
  id: i, farm_id: 155498,
  captured_at: new Date(T0 + i * 600000).toISOString(),
  diff: { coins: (i % 7) - 3 },
})).reverse();
// One netSfl per posted snapshot, in input order: index 0 is the OLDEST (the page reverses).
const netOf = (i) => ((i % 7) - 3) / 10;

function renderDiffPage(opts = {}) {
  const urls = [];
  const elements = {};
  const stubEl = (id) => ({
    id: id || "", innerHTML: "", textContent: "", className: "", style: { cssText: "" },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, insertBefore() {}, addEventListener() {}, setAttribute() {},
    removeAttribute() {}, focus() {}, querySelector: () => null, querySelectorAll: () => [],
    children: [], dataset: {}, value: "",
  });
  const el = (id) => (elements[id] || (elements[id] = stubEl(id)));
  const doc = {
    getElementById: (id) => el(id),
    querySelector: () => null, querySelectorAll: () => [], createElement: () => stubEl(),
    addEventListener() {}, removeEventListener() {},
    body: stubEl(), documentElement: stubEl(), head: stubEl(),
    readyState: "complete", cookie: "", activeElement: null,
  };
  const store = opts.store || {};      // shared with the caller: a write must be observable
  const fetchStub = async (url, init) => {
    const u = String(url);
    urls.push(u);
    const json = (o) => ({ ok: true, status: 200, json: async () => o });
    if (u.includes("section=treasury")) {
      return json({ data: { td: { p2pPrices: { Wood: 0.01 }, sflUsd: 0.02, coinsPerSFL_betty: 320, gemsPerSFL: 100 } } });
    }
    if (u.includes("section=diff")) {
      const posted = JSON.parse((init && init.body) || '{"snapshots":[]}').snapshots || [];
      return json({ data: { snapshots: posted.map((_, i) => ({ netSfl: netOf(i), items: [] })) } });
    }
    if (u.includes("farm-diff-agg")) {
      return json({ periods: SNAPS.slice().reverse().map((s, i) => ({ period: s.captured_at, count: 3, diff: s.diff })) });
    }
    if (u.includes("farm-history")) return json({ snapshots: SNAPS, total: opts.total || SNAPS.length });
    if (u.includes("currency-api")) return json({ usd: { czk: 23 } });
    return json({});
  };
  const win = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "https://x.test/", search: "", hash: "", pathname: "/", origin: "https://x.test" },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: () => 0, setTimeout: (f) => { if (typeof f === "function") f(); return 0; },
    setInterval: () => 0, clearTimeout() {}, clearInterval() {},
    history: { replaceState() {}, pushState() {} },
    navigator: { userAgent: "node", clipboard: { writeText: async () => {} } },
    fetch: fetchStub, console: { log() {}, warn() {}, error() {} },
  };
  win.window = win; win.document = doc;

  const run = new Function(
    "window", "document", "localStorage", "sessionStorage", "fetch", "requestAnimationFrame",
    "setTimeout", "setInterval", "clearTimeout", "clearInterval", "location", "history",
    "navigator", "matchMedia", "console",
    `${SCRIPT}
     FARM_ID = "155498";
     return { renderDiff, api: window };`
  );
  const api = run(win, doc, win.localStorage, win.sessionStorage, win.fetch, win.requestAnimationFrame,
    win.setTimeout, win.setInterval, win.clearTimeout, win.clearInterval, win.location, win.history,
    win.navigator, win.matchMedia, win.console);
  return {
    ...api,
    urls,
    html: () => el("diff-content").innerHTML,
    bars: () => (el("diff-content").innerHTML.match(/diff-bar-wrap/g) || []).length,
    // The absolute index each visible bar selects — the last one is what "now" means on screen.
    indices: () => [...el("diff-content").innerHTML.matchAll(/_diffSelect\((\d+)\)/g)].map((m) => +m[1]),
  };
}

test("the timeline opens on the newest 20, so `now` needs no scrolling", async () => {
  const page = renderDiffPage();
  await page.renderDiff({ farm: { bumpkin: {}, inventory: {} } });
  const html = page.html();
  assert.ok(html.includes("diff-slicer"), "the slicer is rendered");
  assert.equal(page.bars(), 20, "20 bars, not the 60 that were loaded");
  const idx = page.indices();
  assert.equal(idx[0], 40, "the window starts 20 back from the end");
  assert.equal(idx[idx.length - 1], 59, "and ends on the newest period — no scrolling to reach now");
  assert.ok(/showing 20 of 60/.test(html.replace(/&middot;|&#183;/g, "·")), "the label says what is shown");
  assert.ok(/at now/.test(html), "and that the window is at the newest end");
});

test("the size buttons are remembered, and ALL restores the old full-width chart", async () => {
  const store = {};
  const page = renderDiffPage({ store });
  await page.renderDiff({ farm: { bumpkin: {}, inventory: {} } });
  page.api._diffSetSize(50);
  assert.equal(page.bars(), 50);
  assert.equal(store.sfl_diff_window, "50", "the choice is remembered for the next visit");
  page.api._diffSetSize(0);
  assert.equal(page.bars(), 60, "ALL means everything loaded");
  // A page opened later reads that back rather than falling to the 20 default.
  const later = renderDiffPage({ store: { sfl_diff_window: "50" } });
  await later.renderDiff({ farm: { bumpkin: {}, inventory: {} } });
  assert.equal(later.bars(), 50, "the remembered size wins on load");
});

test("the slicer pans without refetching, and NOW comes back to the newest", async () => {
  const page = renderDiffPage();
  await page.renderDiff({ farm: { bumpkin: {}, inventory: {} } });
  const before = page.urls.length;
  page.api._diffPan(-1);                       // one window older
  assert.deepEqual([page.indices()[0], page.indices()[19]], [20, 39]);
  assert.equal(page.urls.length, before, "panning is a repaint, not a fetch");
  page.api._diffSetStart(7);                   // dragging the scrubber
  assert.deepEqual([page.indices()[0], page.indices()[19]], [7, 26]);
  assert.ok(!/at now/.test(page.html()), "and the label stops claiming to be at the newest end");
  page.api._diffNow();
  assert.equal(page.indices()[19], 59, "NOW returns to the newest period");
});

test("the totals describe the window, which is what a slicer means", async () => {
  const page = renderDiffPage();
  await page.renderDiff({ farm: { bumpkin: {}, inventory: {} } });
  /*
   * netSfl is (i % 7 - 3) / 10 over the 60 loaded periods; the visible 20 are indices 40..59.
   * Derived here rather than read back off the page, so a windowing bug cannot agree with itself.
   */
  const expect = Array.from({ length: 20 }, (_, k) => netOf(40 + k)).reduce((a, b) => a + b, 0);
  const shown = page.html().match(/diff-stat-value[^>]*>([+-][\d.]+)/);
  assert.ok(shown, "a net change is shown");
  assert.equal(parseFloat(shown[1]).toFixed(2), expect.toFixed(2),
    `net change is the window's, not all 60 (${shown[1]})`);
  assert.ok(/of 60/.test(page.html()), "and the count card still says how many were loaded");
});

test("from/to is five-minute-grained and reaches the endpoint that buckets by it", async () => {
  const page = renderDiffPage();
  await page.renderDiff({ farm: { bumpkin: {}, inventory: {} } });
  const html = page.html();
  assert.equal((html.match(/type="datetime-local" step="300"/g) || []).length, 2,
    "both boxes step in 5-minute increments");
  /*
   * "raw for the last 5 days" — 120h — is a range query; `latest=50` cannot express it. The URL
   * list is scanned rather than its last entry read: the pricing-methods panel fetches in the
   * background, so which request lands last is not this test's business.
   */
  const mark = page.urls.length;
  await page.api._diffQuickRange(120);
  // The investment tracker also calls farm-history (type=venue-balance); the diff fetch is the
  // one with no type at all.
  const hist = page.urls.slice(mark).filter((u) => u.includes("farm-history") && !u.includes("type="));
  assert.equal(hist.length, 1, `one history fetch: ${JSON.stringify(hist)}`);
  assert.ok(/from=/.test(hist[0]) && /limit=500/.test(hist[0]),
    `the raw fetch became a bounded range query: ${hist[0]}`);
  assert.ok(!/latest=50/.test(hist[0]), "and stopped asking for the newest 50 regardless of the range");
  // The same window under a grouped period goes to the aggregator, which buckets what it bounds.
  const mark2 = page.urls.length;
  await page.api._diffSetGroup("days");
  const agg = page.urls.slice(mark2).filter((u) => u.includes("farm-diff-agg"));
  assert.equal(agg.length, 1, `one aggregate fetch: ${JSON.stringify(agg)}`);
  assert.ok(/group=day/.test(agg[0]) && /from=/.test(agg[0]),
    `grouped fetches carry the range: ${agg[0]}`);
});
