import { test } from "node:test";
import assert from "node:assert";
import * as Y from "../../widgets/yakkamon.mjs";
import { YK, ykPoints, ykNeedFor, ykMult } from "../../core/yakkamon.mjs";
import { renderTable } from "../../ui/table.mjs";
import { createHost } from "../../app/widget-host.mjs";

// YAKKAMON as widgets: the live board, what a placing costs, the planner and calculator (per-copy
// options over the page's saved settings), the published tables and the verdict.
const NOW = Date.UTC(2026, 8, 15, 12);                       // week 6 of the programme → 2.2×
const pts = (r) => 200000 - r * 1000;                        // #1 199,000 … #50 150,000, #51 149,000
const LIVE = {
  signups: { claimed: 41230, total: 500000, tier: "Platinum", remaining: 58770, tierUntil: 100000,
    tiers: [{ name: "Diamond", until: 1000 }, { name: "Platinum", until: 100000 }] },
  board: { entries: Array.from({ length: 100 }, (_, i) => ({ rank: i + 1, points: pts(i + 1) })), playerCount: 60000, size: 100, generatedAt: NOW - 2 * 3600000 },
  flowerUsd: 0.01, btcUsd: 100000,
};
// the page's ykBoardBackfill (the four pre-collector builds)
const HIST = [
  { t: Date.UTC(2026, 7, 11, 9, 0, 57), players: 41305, p3: 380213, p10: 79075, p50: 18229, p100: 17176, derived: true },
  { t: Date.UTC(2026, 7, 11, 17, 0, 57), players: 43330, p3: 380213, p10: 129117, p50: 19016, p100: 17213, derived: true },
  { t: Date.UTC(2026, 7, 12, 5, 0, 57), players: 44811, p3: 380213, p10: 129126, p50: 19812, p100: 17226, derived: false },
  { t: Date.UTC(2026, 7, 12, 9, 0, 57), players: 45291, p3: 380252, p10: 129126, p50: 20592, p100: 17251, derived: false },
];
const SETTINGS = { amount: 500, week: 1, roiDays: 120, lockDays: 120, btc: 0.096, launchWeeks: 17, ptsPerWeek: 5000, trackWeeks: 8, farmMode: false, farmPerDay: 0, farmAuto: null };
const ctx = (extra = {}) => ({ live: LIVE, liveErr: null, hist: HIST, histFile: 0, settings: SETTINGS, flower: "<i>F</i>", now: NOW, ...extra });
const ALL = [Y.ykLive, Y.ykPlacing, Y.ykFacts, Y.ykPlanner, Y.ykCalculator, Y.ykTiers, Y.ykSources, Y.ykRanks, Y.ykEggs, Y.ykVerdict];
const table = (w, out, settings = w.defaults) => renderTable(w.columns, out.rows, settings, { rowKey: w.rowKey, rowClass: w.rowClass });

test("every widget is on the YAKKAMON page and needs no farm", () => {
  const types = new Set();
  for (const w of ALL) {
    assert.strictEqual(w.page, "yakkamon", w.type);
    assert.deepStrictEqual(w.needs(123), {}, w.type);
    assert.match(w.type, /^yk-/);
    types.add(w.type);
    assert.ok(w.view || (w.build && w.columns && w.rowKey), `${w.type} is a view or a table widget`);
  }
  assert.strictEqual(types.size, ALL.length);
});

test("live: your number, the tier, what is gone, and the leaderboard bounds priced at today's multiplier", () => {
  const { html } = Y.ykLive.view({}, ctx());
  assert.match(html, /41,230/);                       // already signed up
  assert.match(html, /#41,231/);                      // you'd be
  assert.match(html, /58,770/);                       // eggs left
  assert.match(html, /Already gone: <b>Diamond<\/b>/);
  assert.match(html, /60,000 players with points/);
  // #50 = 150,000 points → ceil(150,000 / 2.2) = 68,182 FLOWER
  assert.match(html, /150,000[\s\S]*?68,182/);
  // #50 and #51 are 1,000 points apart → ceil(1,000 / 2.2) = 455 FLOWER
  assert.match(html, /<b>1,000 points<\/b> apart — about <b>455/);
  assert.match(html, /2\.0 h old/);
  assert.match(html, /class="v-bar"/);
  assert.match(html, /current 2\.2× multiplier/);
});

test("live: loading and error states say so", () => {
  assert.match(Y.ykLive.view({}, ctx({ live: null })).empty, /Loading live data/);
  assert.match(Y.ykLive.view({}, ctx({ live: null, liveErr: "502" })).empty, /Could not load live data \(502\)/);
});

test("placing: four small multiples in sans type and the #10 / #50 trend rows", () => {
  const { html } = Y.ykPlacing.view({}, ctx());
  assert.match(html, /<svg/);
  assert.doesNotMatch(html, /Press Start/);
  assert.strictEqual((html.match(/<polyline/g) || []).length, 4);
  assert.match(html, /<b>4<\/b> snapshots over <b>24 h<\/b>/);
  assert.match(html, /2 with a reconstructed timestamp/);
  // #50 now 20,592
  assert.match(html, /#50[\s\S]*?20,592/);
  assert.match(html, /Too few snapshots to forecast with/);
  assert.match(Y.ykPlacing.view({}, ctx({ hist: HIST.slice(0, 1) })).html, /Not enough snapshots yet/);
});

test("planner: week-1 deposit + weekly top-ups add up to the budget; tranches as split bars", () => {
  const out = Y.ykPlanner.build({}, ctx(), {});
  const budget = 0.096 * 100000 / 0.01;                // 960,000 FLOWER
  let weekly = 0;
  for (let w = 2; w <= 9; w++) weekly += ykNeedFor(5000 - 42, w);
  const w1 = budget - weekly;
  assert.ok(Math.abs(out.rows.reduce((a, r) => a + r.amt, 0) - budget) < 1e-6, "Σ tranches = the budget");
  assert.strictEqual(out.rows.length, 9);
  assert.strictEqual(out.rows[0].w, 1);
  assert.ok(Math.abs(out.rows[0].amt - w1) < 1e-6);
  const cum = out.rows.reduce((a, r) => a + r.pts, 0) + 42 * 17;
  assert.match(out.summary, new RegExp(Math.round(cum).toLocaleString("en-US") + " pts"));
  assert.match(out.summary, /960,000/);
  assert.match(out.summary, /Platinum resource box/);
  const html = table(Y.ykPlanner, out);
  assert.match(html, /class="v-yakkamon-split"/);
  assert.match(html, /3\.0×/);
  assert.match(out.footer, /Forgone yield/);
});

test("planner: a copy's options override the page's settings; farm funnel adds the blue part", () => {
  const out = Y.ykPlanner.build({}, ctx(), { budgetSats: 1000000, trackWeeks: 0 });   // 0.01 BTC, no top-ups
  assert.strictEqual(out.rows.length, 1);
  assert.ok(Math.abs(out.rows[0].amt - 100000) < 1e-6);
  const f = Y.ykPlanner.build({}, ctx(), { farm: "on", farmPerDay: 100, trackWeeks: 0, budgetSats: 0 });
  assert.strictEqual(f.rows.length, 17);
  assert.strictEqual(f.rows[3].farm, 700);
  assert.match(f.summary, /From farm/i);
  assert.match(Y.ykPlanner.titleFor({}), /Budget planner/);
});

test("planner: does not fit, and no prices yet", () => {
  const out = Y.ykPlanner.build({}, ctx(), { budgetSats: 1000, ptsPerWeek: 50000 });
  assert.strictEqual(out.rows.length, 0);
  assert.match(out.summary, /Does not fit/);
  assert.match(Y.ykPlanner.build({}, ctx({ live: { ...LIVE, btcUsd: 0 } }), {}).empty, /prices/);
});

test("calculator: base, bonus, total, the next cliff and the forgone yield", () => {
  const out = Y.ykCalculator.build({}, ctx(), {});
  const byK = Object.fromEntries(out.rows.map((r) => [r.k, r.pts]));
  assert.deepStrictEqual(byK, { base: 1500, bonus: 100, total: 1600 });
  assert.match(out.summary, /3\.20/);                                    // pts per FLOWER
  assert.match(out.footer, /Exactly as published/);
  assert.match(out.footer, /<b>4,500 <i>F<\/i><\/b> to reach <b>5,000<\/b> is worth <b>\+15,400 points<\/b>/);
  assert.match(out.footer, /Forgone yield: <b[^>]*>500 FLOWER/);
  assert.match(out.footer, /312\.5 FLOWER/);                              // per 1,000 points
  const c = Y.ykCalculator.build({}, ctx(), { amount: 18000, week: 1 });
  assert.strictEqual(c.rows.find((r) => r.k === "total").pts, ykPoints(18000, 1).total);
  assert.strictEqual(c.rows.find((r) => r.k === "total").pts, 61200);
  assert.match(c.footer, /\+40%<\/b> step/);
  assert.match(table(Y.ykCalculator, out), /data-row="total"/);
});

test("tiers, sources, ranks: the published tables", () => {
  const t = Y.ykTiers.build({}, ctx(), {});
  assert.strictEqual(t.rows.length, YK.tiers.length);
  const th = table(Y.ykTiers, t);
  assert.match(th, /190,000/);
  assert.match(th, /3\.80/);
  assert.match(t.footer, new RegExp(`w6 <b[^>]*>${ykMult(6).toFixed(1)}×`));
  const s = table(Y.ykSources, Y.ykSources.build({}, ctx(), {}));
  assert.match(s, /\+75/);
  const r = Y.ykRanks.build({}, ctx(), {});
  assert.strictEqual(r.rows.length, YK.ranks.length);
  assert.match(table(Y.ykRanks, r), /🏆 Bloom/);
  assert.match(r.footer, /re-cut on 12 Aug 2026/);
  assert.match(Y.ykEggs.view({}, ctx()).html, /Platinum[\s\S]*Basic/);
});

test("facts and verdict read the clock and the saved settings", () => {
  assert.match(Y.ykFacts.view({}, ctx()).html, /closed — deposits no longer earn points|live — <b>week 6<\/b>, multiplier <b>2\.2×<\/b>/);
  assert.match(Y.ykFacts.view({}, ctx()).html, /week 6/);
  const v = Y.ykVerdict.view({}, ctx()).html;
  assert.match(v, /costs you <b[^>]*>500 FLOWER/);
  assert.match(v, /1,000 points/);                     // free activity ≈ 6×120 + 30 + 250
  assert.match(v, /500 FLOWER in week 1 = 1,600 points/);
});

test("the host renders a planner copy with its own options; views have a cog too", () => {
  const m = new Map();
  const reg = Object.fromEntries(ALL.map((w) => [w.type, w]));
  const h = createHost({ registry: reg, storage: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } });
  const html = h.renderPage("yk-planner", { data: {}, ctx: ctx() });
  assert.match(html, /data-frame="page:yk-planner"/);
  h.handle("page:yk-planner", "opt:trackWeeks", "0");
  assert.strictEqual((h.renderPage("yk-planner", { data: {}, ctx: ctx() }).match(/data-row="/g) || []).length, 1);
  assert.match(h.renderPage("yk-live", { data: {}, ctx: ctx() }), /data-action="cog"/, "every widget has a cog (title, options)");
});
