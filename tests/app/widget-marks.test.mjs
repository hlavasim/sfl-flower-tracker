import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { marksSummary, marksSources, marksShoppingList, marksLeaderboard, marksCostFirst, marksProjections, marksBurn,
  marksStrategy, marksCostToFirst, nextSnapshot } from "../../widgets/marks.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { createStore } from "../../app/store.mjs";

// MARKS widgets: the page's arithmetic over one week's leaderboard and a live farm.
const NOW = Date.UTC(2026, 10, 25, 12);   // Wed, day 3 of the week starting Mon 23 Nov
const MARKS = {
  week: { week_start: "2026-11-23", kitchen_items: [{ item: "Wood", amount: 10 }, { item: "Stone", amount: 5 }], pet_items: [] },
  snapshot_count: 14,
  state: { phase: "idle", updated_at: new Date(NOW - 2 * 3600000).toISOString() },
  players: [
    { farm_id: 2, player_name: "<b>x</b>", rank: 3, marks: 100, multiplier: 1, tier: "Pagan", resources: { Wood: 0, Stone: 0 } },
    { farm_id: 155498, player_name: "Me", rank: 2, marks: 5000, prev_marks: 4400, multiplier: 2.5, tier: "Raver",
      resources: { Wood: 100, Stone: 40 }, prev_resources: { Wood: 200, Stone: 40 }, today_fulfilled: { Wood: 2 },
      marks_optimal: 3000, marks_dump: 4000, pet_weekly: 500, pet_food_stock: { "Pumpkin Soup": 5 },
      captured_at: new Date(NOW).toISOString(), prev_captured_at: new Date(NOW - 8 * 3600000).toISOString() },
    { farm_id: 1, player_name: "Top", rank: 1, marks: 12000, prev_marks: 12000, multiplier: 5, tier: "Lich", resources: { Wood: 10, Stone: 0 },
      prev_resources: { Wood: 10, Stone: 0 }, marks_optimal: 1000, marks_dump: 500, pet_weekly: 0,
      captured_at: new Date(NOW).toISOString(), prev_captured_at: new Date(NOW - 8 * 3600000).toISOString() },
  ],
};
const FARM = {
  inventory: { "Nightshade Emblem": "300", Wood: "55", Stone: "12", "Pumpkin Soup": "5" },
  bumpkin: { equipped: { secondaryTool: "Paw Shield", shirt: "Nightshade Armor" } },
  faction: {
    kitchen: { requests: [{ item: "Wood", amount: 10, dailyFulfilled: { 3: 2 } }, { item: "Stone", amount: 5, dailyFulfilled: {} }] },
    pet: { requests: [{ food: "Pumpkin Soup", quantity: 2, dailyFulfilled: { 3: 1 } }] },
  },
};
const PRICES = { td: { p2pPrices: { Pumpkin: 0.02 } } };
const ctx = { farmId: "155498", now: NOW, icon: (n) => `<img data-i="${n}">`, budget: "0.03",
  priceMap: () => ({ Wood: 0.01, Stone: 0.05 }), recipe: (f) => (f === "Pumpkin Soup" ? { Pumpkin: 5 } : null) };
const ALL = { marks: MARKS, farm: FARM, prices: PRICES };
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);
const table = (w, out, s = w.defaults) => renderTable(w.columns, out.rows, s, { rowKey: w.rowKey, rowClass: w.rowClass, keepRow: w.keepRow });

test("registered on the marks page; the leaderboard ones need only the marks resource", () => {
  for (const w of [marksSummary, marksSources, marksShoppingList, marksLeaderboard, marksCostFirst, marksProjections, marksBurn]) {
    assert.strictEqual(WIDGETS[w.type], w);
    assert.strictEqual(w.page, "marks");
  }
  assert.deepStrictEqual(marksLeaderboard.needs(9), { marks: { res: "marks" } });
  assert.deepStrictEqual(marksSources.needs(9), { marks: { res: "marks" }, farm: { res: "farm", farm: 9 }, prices: { res: "compute", farm: 9, section: "treasury" } });
});

test("overview: rank, marks, #1, time left, kitchen with icons, crawl status", () => {
  const { html } = marksSummary.view({ marks: MARKS }, ctx);
  assert.match(html, /<b>#2<\/b><span>your rank<\/span>/);
  assert.match(html, /<b>5,000<\/b><span>your marks<\/span>/);
  assert.match(html, /<b>12\.0k<\/b><span>#1 marks<\/span>/);
  assert.match(html, /<b>108h 0m<\/b><span>time left<\/span>/);
  assert.match(html, /<b>14<\/b><span>snapshots<\/span>/);
  assert.match(html, /<img data-i="Wood">Wood · <img data-i="Stone">Stone/);
  assert.match(html, /Last cycle: 2h ago/);
  assert.match(html, /You have 42 % of #1's marks/);
  assert.match(html, /class="v-big"/);
});

test("strategy: live multiplier from emblems + gear, next marks with today's counter, cheapest SFL/mark first", () => {
  const st = marksStrategy(MARKS, FARM, PRICES.td.p2pPrices, ctx);
  assert.strictEqual(st.mult, 2.7);
  assert.strictEqual(st.petMult, 2.95);
  assert.strictEqual(st.todayDay, 3);
  const out = marksSources.build(ALL, ctx);
  assert.deepStrictEqual(out.rows.map((r) => r.icon), ["Wood", "Stone", "Pumpkin Soup"]);
  const [wood, stone, pet] = out.rows;
  assert.strictEqual(wood.nextMarks.toFixed(1), "43.2");
  assert.strictEqual(wood.costPerMark.toFixed(4), "0.0023");
  assert.strictEqual(stone.dailyMarks.toFixed(1), "102.6");
  assert.strictEqual(pet.costPerDlv.toFixed(2), "0.20");   // 5 Pumpkin × 0.02 × 2 per feed
  const html = table(marksSources, out);
  assert.match(html, /<img data-i="Wood"><div><b>Donate 10× Wood<\/b><small>2\/10 done today<\/small>/);
  assert.match(html, /data-row="kitchen:Wood" class="w-st-ready"/);
  assert.match(out.summary, /<b>325<\/b><span>marks\/day/);
  assert.match(out.summary, /Paw Shield/);
});

test("shopping list: deliveries under the budget, stock vs buying, per-copy budget", () => {
  const out = marksShoppingList.build(ALL, ctx, {});
  assert.deepStrictEqual(out.rows.map((r) => r.icon), ["Wood", "Stone"]);   // the pet feed is over budget
  const wood = out.rows[0];
  assert.deepStrictEqual([wood.dlvCount, wood.marks.toFixed(1), wood.needUnits, wood.buyCost.toFixed(2), wood.lastCpm.toFixed(4)], [8, "194.4", 30, "0.30", "0.0185"]);
  assert.strictEqual(wood.note, "🛒 Stock covers 5/8, buy 3 more");
  assert.strictEqual(out.rows[1].dlvCount, 9);
  const html = table(marksShoppingList, out);
  assert.match(html, /class="v-bar"/);
  assert.match(html, /30 units/);
  // a tighter budget on this copy
  assert.strictEqual(marksShoppingList.build(ALL, ctx, { budget: "0.005" }).rows[0].dlvCount, 5);
  assert.match(marksShoppingList.titleFor({ budget: "0.005" }), /≤ 0\.005/);
});

test("leaderboard: rank order, Δ, dump with ranks gained, threat bar, the viewer marked and kept", () => {
  const out = marksLeaderboard.build({ marks: MARKS }, ctx);
  const html = table(marksLeaderboard, out);
  assert.deepStrictEqual(keys(html), ["1", "155498", "2"]);
  assert.match(html, /data-row="155498" class="v-marks-me"/);
  assert.match(html, /flip-good">\+600</);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  const me = out.rows.find((r) => r.me);
  assert.strictEqual(me.threat.toFixed(1), "61.5");
  assert.strictEqual(me.rankGain, 0);
  assert.match(html, /<img data-i="Wood">100 <small class="flip-bad">\(-100\)<\/small> <small class="v-dim">10 dlv · 2 today/);
  // top 1 still shows the viewer below the cut
  const top1 = renderTable(marksLeaderboard.columns, out.rows, { rows: { mode: "top", top: 1 } }, { rowKey: marksLeaderboard.rowKey, keepRow: marksLeaderboard.keepRow });
  assert.deepStrictEqual(keys(top1), ["1", "155498"]);
});

test("cost to #1: greedy kitchen simulation closes the gap or says it cannot", () => {
  const out = marksCostFirst.build(ALL, ctx);
  assert.deepStrictEqual(out.rows.map((r) => r.item), ["Wood", "Stone"]);
  const st = marksStrategy(MARKS, FARM, {}, ctx);
  const r = marksCostToFirst(st, 7000, 3);
  assert.strictEqual(r.daysRemaining, 5);
  assert.ok(r.success);
  assert.ok(r.gained >= 7000);
  assert.strictEqual(+out.rows.reduce((a, x) => a + x.buyCost, 0).toFixed(6), +r.buyCost.toFixed(6));
  assert.match(out.summary, /<b>Top<\/b> has <b>12\.0k<\/b> marks, you have <b>5,000<\/b>/);
  assert.match(out.summary, /achievable/);
  assert.match(table(marksCostFirst, out), /<img data-i="Wood">/);
  // #1 needs nothing
  const first = { ...MARKS, players: MARKS.players.map((p) => (p.farm_id === 155498 ? { ...p, marks: 20000 } : p)) };
  assert.match(marksCostFirst.build({ ...ALL, marks: first }, ctx).empty, /You are #1/);
  assert.match(marksCostFirst.build({ marks: MARKS }, ctx).empty, /live farm/);
});

test("projections: sorted by current + optimal, total with the pet week, a stacked bar", () => {
  const out = marksProjections.build({ marks: MARKS }, ctx);
  assert.deepStrictEqual(out.rows.map((r) => r.player_name), ["Top", "Me", "<b>x</b>"]);
  const me = out.rows[1];
  assert.strictEqual(me.projected, 8500);
  assert.strictEqual(me.curPct.toFixed(1), "38.5");
  assert.match(table(marksProjections, out), /class="v-mkt-stack"/);
});

test("burn rate: players with a previous snapshot, per-item change with icons and signals", () => {
  const out = marksBurn.build({ marks: MARKS }, ctx);
  assert.deepStrictEqual(out.rows.map((r) => r.player_name), ["Top", "Me"]);   // by rank
  assert.deepStrictEqual(out.rows[1].signals, ["🟢 MARKS+", "🔻 Wood"]);
  assert.match(table(marksBurn, out), /<img data-i="Wood"><span class="flip-bad">-100<\/span>/);
});

test("next snapshot follows the collector cadence", () => {
  assert.strictEqual(nextSnapshot(Date.UTC(2026, 10, 25, 12, 30)), "3h30m");   // Wed: every 8 h → 16:00
  assert.strictEqual(nextSnapshot(Date.UTC(2026, 10, 28, 13, 15)), "45m");     // Sat: every 2 h
});

test("store: marks loads the latest week (or a picked one) with the crawl state", async () => {
  const calls = [];
  const f = async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => (url.includes("state") ? { state: { phase: "crawl" } } : { players: [], week: {} }) }; };
  const r = await createStore({ fetch: f }).get({ res: "marks", week: "2026-11-16" });
  assert.deepStrictEqual(r.data, { players: [], week: {}, state: { phase: "crawl" } });
  assert.ok(calls.includes("/api/marks-history?mode=latest&week=2026-11-16"));
});

test("page wiring: MARKS renders its widgets, the chart stays a page card", () => {
  const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
  assert.match(SRC, /const w = \(t\) => __widgets\.renderPage\(t, \{ data, ctx: _wCtx\(t\), fresh \}\);/);
  for (const t of ["marks-summary", "marks-sources", "marks-shopping", "marks-leaderboard", "marks-cost1", "marks-projections", "marks-burn"]) {
    assert.match(SRC, new RegExp(`w\\("${t}"\\)`), t);
  }
  // the budget slider re-renders only the shopping list
  assert.match(SRC, /_mktPatch\("marks-shopping", __widgets\.renderPage\("marks-shopping"/);
  assert.match(SRC, /_wCtxMap\["marks-sources"\]/);
  assert.match(SRC, /id="marks-timeline-chart"/);
  assert.match(SRC, /writeFetch\("\/api\/marks-history\?mode=force-refresh"\)/);
});
