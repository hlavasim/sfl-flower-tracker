import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

// The Sales-page price timeline lives inline in flowers.html and only ever runs in a
// browser, so this test slices the chart block out of the page and runs it against a
// stub DOM + a stub LightweightCharts. What it pins:
//   - interval bucketing (RAW … 1D) keeps the LAST value per bucket and stays strictly
//     ascending, which is what the charting lib requires;
//   - scrolling past the left edge back-pages older history, prepends it, and shifts the
//     visible logical range by exactly the number of bars added (otherwise the view jumps);
//   - a back-page that returns nothing new marks the chart exhausted and stops fetching.

const PAGE = new URL("../../flowers.html", import.meta.url);
const START = "// Interval = bucket width";
const END = "// ── P2P History toggle detail ──";

function loadChartModule() {
  const html = readFileSync(PAGE, "utf8");
  const a = html.indexOf(START);
  const b = html.indexOf(END, a);
  assert.ok(a > 0 && b > a, "price-timeline block not found in flowers.html");
  const src = html.slice(a, b);

  // ── stub DOM ──
  const els = new Map();
  const makeEl = (id) => ({
    id, textContent: "", innerHTML: "", clientWidth: 600, dataset: {},
    classList: { _s: new Set(), toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, has(c) { return this._s.has(c); } },
    children: [],
    querySelectorAll(sel) { return sel === ".ph-tf" ? this.children : []; },
  });
  const document = {
    getElementById: (id) => els.get(id) || null,
    _add(id) { const e = makeEl(id); els.set(id, e); return e; },
  };

  // ── stub LightweightCharts ──
  const charts = [];
  const LightweightCharts = {
    createChart() {
      const ts = {
        _cb: null, fits: 0, logicalRange: null, visibleRange: null,
        setLogical: [], setVisible: [],
        fitContent() { this.fits++; },
        subscribeVisibleLogicalRangeChange(cb) { this._cb = cb; },
        getVisibleLogicalRange() { return this.logicalRange; },
        setVisibleLogicalRange(r) { this.setLogical.push(r); this.logicalRange = r; },
        getVisibleRange() { return this.visibleRange; },
        setVisibleRange(r) { this.setVisible.push(r); this.visibleRange = r; },
      };
      const chart = {
        opts: [], series: null, ts,
        applyOptions(o) { this.opts.push(o); },
        addAreaSeries(o) {
          this.series = { opts: [o], sets: [], setData(d) { this.sets.push(d); }, applyOptions(x) { this.opts.push(x); } };
          return this.series;
        },
        timeScale() { return this.ts; },
        remove() {},
      };
      charts.push(chart);
      return chart;
    },
  };

  const ResizeObserver = class { observe() {} disconnect() {} };
  const mod = new Function(
    "document", "LightweightCharts", "ResizeObserver", "escHTML",
    src + "\nreturn { phIntervals, _phCharts, _phBuckets, renderPriceTimeline, _createLWChart, _phSetInterval, _phLoadOlder };"
  )(document, LightweightCharts, ResizeObserver, (s) => String(s));

  return { ...mod, document, charts };
}

const iso = (s) => new Date(s).toISOString();
const tick = () => new Promise((r) => setTimeout(r, 0));

// Mount the way the page does: renderPriceTimeline returns HTML, the caller inserts it,
// and the chart is created on a timer once the container exists.
async function mount(m, changes, label, loadOlder) {
  const html = m.renderPriceTimeline(changes, label, loadOlder);
  const id = Object.keys(m._phCharts).at(-1);
  m.document._add(id);
  m.document._add(id + '-bar');
  const status = m.document._add(id + '-status');
  const count = m.document._add(id + '-count');
  await tick();
  return { id, html, status, count, chart: m.charts.at(-1) };
}

test("bucketing keeps the last value per interval and stays strictly ascending", () => {
  const { _phBuckets } = loadChartModule();
  const changes = [
    { captured_at: iso("2026-08-01T10:05:00Z"), price: "1" },
    { captured_at: iso("2026-08-01T10:40:00Z"), price: "2" },
    { captured_at: iso("2026-08-01T15:00:00Z"), price: "3" },
    { captured_at: iso("2026-08-02T09:00:00Z"), price: "4" },
  ];

  assert.equal(_phBuckets(changes, "raw").length, 4);
  assert.deepEqual(_phBuckets(changes, "1h").map((p) => p.value), [2, 3, 4]);
  assert.deepEqual(_phBuckets(changes, "4h").map((p) => p.value), [2, 3, 4]);
  // 1D collapses the two Aug-1 points into one bar carrying the day's last value.
  assert.deepEqual(_phBuckets(changes, "1d").map((p) => p.value), [3, 4]);

  for (const key of ["raw", "15m", "1h", "4h", "1d"]) {
    const t = _phBuckets(changes, key).map((p) => p.time);
    assert.ok(t.every((v, i) => i === 0 || v > t[i - 1]), `${key} not strictly ascending`);
  }
});

test("bucketing takes value/price interchangeably and drops non-positive points", () => {
  const { _phBuckets } = loadChartModule();
  const out = _phBuckets([
    { captured_at: iso("2026-08-01T10:00:00Z"), value: "7.5" },
    { captured_at: iso("2026-08-01T11:00:00Z"), price: "0" },
    { captured_at: iso("2026-08-01T12:00:00Z"), price: null },
  ], "raw");
  assert.deepEqual(out.map((p) => p.value), [7.5]);
});

test("every interval up to 1D gets a button, RAW is the default", () => {
  const { renderPriceTimeline, phIntervals, _phCharts } = loadChartModule();
  const html = renderPriceTimeline([{ captured_at: iso("2026-08-01T10:00:00Z"), price: "1" }], "Sunflower");
  assert.ok(phIntervals.some((i) => i.key === "1d" && i.sec === 86400), "no 1D interval");
  for (const i of phIntervals) assert.ok(html.includes(`data-k="${i.key}"`), `no ${i.key} button`);
  assert.ok(/class="ph-tf active" data-k="raw"/.test(html), "RAW not the default interval");
  assert.equal(Object.values(_phCharts)[0].interval, "raw");
});

test("switching interval re-buckets and holds the visible time window", async () => {
  const m = loadChartModule();
  const changes = [
    { captured_at: iso("2026-08-01T10:00:00Z"), price: "1" },
    { captured_at: iso("2026-08-01T14:00:00Z"), price: "2" },
    { captured_at: iso("2026-08-02T10:00:00Z"), price: "3" },
  ];
  const { id, chart } = await mount(m, changes, "Sunflower");
  assert.equal(chart.series.sets[0].length, 3);   // RAW
  chart.ts.visibleRange = { from: 100, to: 200 };

  m._phSetInterval(id, "1d");
  assert.equal(m._phCharts[id].interval, "1d");
  assert.deepEqual(chart.series.sets[1].map((p) => p.value), [2, 3]);
  assert.deepEqual(chart.ts.setVisible.at(-1), { from: 100, to: 200 }, "visible window not preserved");
  assert.equal(chart.opts.at(-1).timeScale.timeVisible, false, "1D should hide the time-of-day axis");
});

test("a gap on the left back-pages older history and keeps the view anchored", async () => {
  const m = loadChartModule();
  const changes = [
    { captured_at: iso("2026-08-01T10:00:00Z"), price: "5" },
    { captured_at: iso("2026-08-02T10:00:00Z"), price: "6" },
  ];
  const asked = [];
  const older = [
    { captured_at: iso("2026-07-30T10:00:00Z"), price: "3" },
    { captured_at: iso("2026-07-31T10:00:00Z"), price: "4" },
    // The API's `to` filter is inclusive, so the boundary row comes back too.
    { captured_at: iso("2026-08-01T10:00:00Z"), price: "5" },
  ];
  // Same page every time: the second call finds nothing strictly older and stops.
  const { id, chart, count } = await mount(m, changes, "Sunflower",
    (before) => { asked.push(before); return Promise.resolve(older); });

  chart.ts.logicalRange = { from: -3, to: 12 };
  chart.ts._cb({ from: -3, to: 12 });            // user dragged past the start of the data
  await tick();

  assert.equal(asked[0], iso("2026-08-01T10:00:00Z"), "did not ask for history before the oldest point");
  assert.deepEqual(chart.series.sets.at(-1).map((p) => p.value), [3, 4, 5, 6], "older points not prepended");
  // 2 bars added on the left → the same bars stay under the cursor.
  assert.deepEqual(chart.ts.setLogical.at(-1), { from: -1, to: 14 }, "view was not shifted by the bars added");
  assert.equal(count.textContent, 4);
  // -1 is still a gap, so it asked once more — from the NEW oldest point — and that page
  // held nothing older, which is what ends the run.
  assert.deepEqual(asked, [iso("2026-08-01T10:00:00Z"), iso("2026-07-30T10:00:00Z")]);
  assert.equal(m._phCharts[id].exhausted, true);
});

test("switching to a coarser interval fills the empty space it opens", async () => {
  const m = loadChartModule();
  // The same time window holds far fewer 1D bars than raw points, so a view that was
  // fully backed by data at RAW can have nothing on its left at 1D.
  const changes = [0, 1, 2, 3, 4, 5].map((h) => ({
    captured_at: iso(`2026-08-02T0${h}:00:00Z`), price: String(h + 1),
  }));
  const asked = [];
  const { id, chart } = await mount(m, changes, "Sunflower",
    (before) => { asked.push(before); return Promise.resolve([]); });

  chart.ts.logicalRange = { from: -6, to: 10 };
  m._phSetInterval(id, "1d");
  await tick();

  assert.equal(asked.length, 1, "interval switch did not look for a gap to fill");
});

test("one gesture keeps paging until the whole visible window is backed by data", async () => {
  const m = loadChartModule();
  // Each page steps 3 more days back — like a coarse interval, where a page of change
  // events collapses into a couple of bars and a single page never covers the scroll.
  const DAY = 86400000;
  let edge = new Date("2026-08-01T10:00:00Z").getTime();
  const asked = [];
  const { id, chart } = await mount(m,
    [{ captured_at: iso("2026-08-01T10:00:00Z"), price: "9" }],
    "Sunflower",
    (before) => {
      asked.push(before);
      const page = [1, 2, 3].map((n) => ({ captured_at: new Date(edge - n * DAY).toISOString(), price: "1" }));
      edge -= 3 * DAY;
      return Promise.resolve(page);
    },
  );

  chart.ts.logicalRange = { from: -14, to: 6 };     // dragged far into empty space
  chart.ts._cb({ from: -14, to: 6 });
  await tick();

  assert.ok(asked.length >= 5, `expected repeated paging, got ${asked.length} request(s)`);
  // It stops as soon as the left edge is covered — not one page later, not forever.
  assert.ok(chart.ts.logicalRange.from >= 5, `left edge still uncovered: ${chart.ts.logicalRange.from}`);
  assert.ok(asked.length < 40, "paging did not converge");
  assert.equal(m._phCharts[id].loading, false, "left stuck in the loading state");
  // Every page went back further than the last.
  const times = asked.map((a) => new Date(a).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a), "pages did not walk backwards");
});

test("no gap → no fetch; and a page with nothing new exhausts the chart", async () => {
  const m = loadChartModule();
  const changes = [{ captured_at: iso("2026-08-02T10:00:00Z"), price: "6" }];
  let calls = 0;
  const { id, chart, status } = await mount(m, changes, "Sunflower", () => {
    calls++;
    return Promise.resolve([{ captured_at: iso("2026-08-02T10:00:00Z"), price: "6" }]);  // boundary row only
  });
  const scrollTo = (r) => { chart.ts.logicalRange = r; chart.ts._cb(r); };

  scrollTo({ from: 40, to: 90 });                 // plenty of loaded data to the left
  await tick();
  assert.equal(calls, 0, "fetched history without a gap");

  scrollTo({ from: -2, to: 30 });
  await tick();
  assert.equal(calls, 1);
  assert.equal(m._phCharts[id].exhausted, true);
  assert.match(status.textContent, /start of history/);

  scrollTo({ from: -2, to: 30 });                 // keeps scrolling — must not re-fetch
  await tick();
  assert.equal(calls, 1, "kept fetching after history was exhausted");
});

test("charts without a loader never try to back-page", async () => {
  const m = loadChartModule();
  const { id, chart } = await mount(m, [{ captured_at: iso("2026-08-02T10:00:00Z"), price: "6" }], "Sunflower");
  assert.equal(m._phCharts[id].exhausted, true, "no loader means nothing to page back to");
  chart.ts.logicalRange = { from: -5, to: 20 };
  chart.ts._cb({ from: -5, to: 20 });
  await tick();
  assert.equal(chart.series.sets.length, 1, "data changed with no loader wired");
});
