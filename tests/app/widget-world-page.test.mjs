import { test } from "node:test";
import assert from "node:assert";
import { worldSkillPoints, worldEffLevel, worldCurrentExpansion, worldReach, worldNodes, worldAscension, worldBanStatus, worldVerified,
  decodeReachSlot, rankIn, youTag, levelRows, slotRows, nodeRows, scopeOf } from "../../widgets/world-dist.mjs";
import { worldSummary, worldDataset, worldPriority, fmtDur, fmtXp } from "../../widgets/world.mjs";
import { renderTable } from "../../ui/table.mjs";
import { keyOf } from "../../app/store.mjs";

// The WORLD page's panels as widgets: the same numbers the old charts and tables showed.
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);
const table = (w, rows, settings = w.defaults) => renderTable(w.columns, rows, settings, { rowKey: w.rowKey, rowClass: w.rowClass, keepRow: w.keepRow });
const ICON = (n) => `<img data-icon="${n}">`;

test("rank and tag: 1 + farms strictly above, top = rank / all farms (the old _rankIn/_youTag)", () => {
  const rows = [{ key: 1, n: 900 }, { key: 2, n: 99 }, { key: 3, n: 1 }];
  assert.deepStrictEqual(rankIn(rows, 2, (r) => r.key > 2), { rank: 2, of: 1000, pct: 0.2, above: 1 });
  assert.strictEqual(youTag(rankIn(rows, 3, (r) => r.key > 3)), "YOU (top 0.1% · #1)");
  assert.strictEqual(youTag(rankIn([{ key: 1, n: 9999 }, { key: 2, n: 1 }], 2, (r) => r.key > 2)), "YOU (top 0.01% · #1)");
  assert.strictEqual(youTag(rankIn(rows, 1, (r) => r.key > 1)), "YOU (top 10.1% · #101)");
  assert.strictEqual(rankIn(rows, 7, () => false), null);
});

test("gap fills: every level from 1; slots only between slots of the same phase", () => {
  assert.deepStrictEqual(levelRows([{ key: "3", n: 5 }, { key: 1, n: 2 }, { key: null, n: 9 }]), [{ key: 1, n: 2 }, { key: 2, n: 0 }, { key: 3, n: 5 }]);
  assert.deepStrictEqual(slotRows([{ key: 1002, n: 1 }, { key: 1004, n: 2 }, { key: 4001, n: 3 }]).map((r) => [r.key, r.n]),
    [[1002, 1], [1003, 0], [1004, 2], [4001, 3]]);
  assert.strictEqual(decodeReachSlot(1016).label, "Spring-16");
  assert.strictEqual(decodeReachSlot(4031).label, "A1-31");
  assert.strictEqual(decodeReachSlot(5002).ascension, 2);
});

test("effective level: my bucket highlighted with the rank tag, the ascension colour, empty levels hidden by default", () => {
  const agg = [{ key: 10, n: 70 }, { key: 12, n: 20 }, { key: 15, n: 10 }];
  const { rows, footer } = worldEffLevel.build({ agg, me: { found: true, effective_level: 12 } });
  const html = table(worldEffLevel, rows);
  assert.deepStrictEqual(keys(html), ["15", "12", "10"]);
  assert.match(html, /data-row="12" class="w-row-hl"/);
  assert.match(html, /▶ 12 sp <span class="v-pill v-run">YOU \(top 11\.0% · #11\)<\/span>/);
  assert.match(html, /background:#d55181/);
  assert.match(footer, /100 farms · every farm in the dataset · you: 12 sp · 10 farms above you/);
  // with the empty levels: 1..15
  assert.strictEqual(worldEffLevel.build({ agg, me: null }, {}, { zeros: true }).rows.length, 15);
});

test("expansion ladders: labels decoded from the slot, pre-ascension blue and ascension pink", () => {
  const agg = [{ key: 3020, n: 5 }, { key: 4001, n: 3 }, { key: 4002, n: 2 }];
  const me = { found: true, current_slot: 4001, reach_slot: 4002 };
  const cur = worldCurrentExpansion.build({ agg, me });
  const html = table(worldCurrentExpansion, cur.rows);
  assert.match(html, /Volcano-20/);
  assert.match(html, /A1-1 <span class="v-pill v-run">YOU \(top 30\.0% · #3\)/);
  assert.match(html, /width:100\.0%;background:#3987e5/);
  assert.match(html, /background:#d55181/);
  assert.match(table(worldReach, worldReach.build({ agg, me }).rows), /data-row="4002" class="w-row-hl"/);
  assert.deepStrictEqual(worldReach.needs(7).agg, { res: "worldAgg", group: "reach_slot", limit: 1000 });
});

test("a copy's own activity window comes through ctx.pull; the page's window when the copy has none", () => {
  const asked = [];
  const ctx = { pageScope: () => 90, pull: (q) => { asked.push(q); return q.active === 30 ? [{ key: 1, n: 4 }] : undefined; } };
  assert.match(worldSkillPoints.build({}, ctx, {}).empty, /Loading/);
  assert.deepStrictEqual(asked[0], { res: "worldAgg", group: "total_level", limit: 1000, active: 90 });
  const { rows, footer } = worldSkillPoints.build({}, ctx, { scope: "30" });
  assert.strictEqual(rows[0].n, 4);
  assert.match(footer, /farms that played within 30 days/);
  assert.strictEqual(scopeOf({ scope: "all" }, ctx), null);
  assert.strictEqual(worldSkillPoints.titleFor({ scope: "30" }), "🌍 Players by skill points · active 30d");
  // failed → says so
  assert.match(worldSkillPoints.build({}, { pull: () => null }, { scope: "all" }).empty, /did not load/);
  // the default query is the needs' own (same store key → no second fetch)
  const pulled = [];
  worldSkillPoints.build({}, { pull: (q) => { pulled.push(q); return []; } }, { scope: "all" });
  assert.strictEqual(keyOf(pulled[0]), keyOf(worldSkillPoints.needs(5).agg));
});

test("breakdowns: database order, '(none)' for null, the bar is the share of all farms", () => {
  const agg = [{ key: "permanent", n: 30 }, { key: null, n: 70 }];
  const { rows } = worldBanStatus.build({ agg });
  const html = table(worldBanStatus, rows);
  assert.deepStrictEqual(keys(html), ["permanent", "null"]);
  assert.match(html, /\(none\)/);
  assert.match(html, /30\.0 %/);
  assert.match(html, /width:70\.0%/);
  assert.deepStrictEqual(worldAscension.needs(1).agg, { res: "worldAgg", group: "ascension_level" });
  assert.deepStrictEqual(worldVerified.needs("").agg, { res: "worldAgg", group: "verified" });
  assert.deepStrictEqual(Object.keys(worldVerified.needs("")), ["agg"]);   // no farm → no worldMe
});

const NODES = { node: "trees", zero: 120, me: { eff: 6, t1: 2, t2: 1, t3: 0 }, coverage: { total: 1000, filled: 800 },
  rows: [{ eff: 2, cls: 1, n: 50 }, { eff: 4, cls: 1, n: 20 }, { eff: 4, cls: 2, n: 10 }, { eff: 6, cls: 2, n: 5 }, { eff: 6, cls: 3, n: 15 }] };

test("buyable nodes: stacked T1/T2/T3 bars, counts, coverage warning, my count, node buttons with icons", () => {
  assert.deepStrictEqual(nodeRows(NODES).map((r) => [r.key, r.n]), [[1, 0], [2, 50], [3, 0], [4, 30], [5, 0], [6, 20]]);
  const { rows, summary, footer } = worldNodes.build({ agg: NODES }, { icon: ICON, farmId: "9" }, { node: "trees" });
  const html = table(worldNodes, rows);
  assert.deepStrictEqual(keys(html), ["6", "4", "2"]);
  // eff 6: 5 with T2 (of the max bar 50 → 10 %), 15 with T3 (30 %)
  assert.match(html, /class="w-hbar v-world-seg"><span title="has T2, no T3: 5 farms \(25\.0% of this bar\)" style="width:10\.0%;background:#5fb0f5"><\/span><span title="has T3: 15 farms \(75\.0% of this bar\)" style="width:30\.0%;background:#b9dffd"/);
  assert.match(html, /data-row="6" class="w-row-hl"/);
  assert.match(html, /YOU \(top 1\.0% · #1\)/);
  assert.match(summary, /100 farms have at least one · 120 have none · with T2: 15 \(15\.0 %\) · with T3: 15 \(15\.0 %\)/);
  assert.match(summary, /you: 6 T1-eq \(2×T1 \+ 1×T2\)/);
  assert.match(summary, /Computed for 800 of 1,000 farms \(80\.0 %\)/);
  assert.match(summary, /<b>4 sunstones<\/b> = 12 obsidian/);
  assert.match(summary, /data-action="opt:node" data-value="iron" title="Iron Rock"><img data-icon="Iron Rock">Iron Rock/);
  assert.match(summary, /class="v-world-node on" data-action="opt:node" data-value="trees"/);
  assert.match(footer, /100 farms/);
  assert.strictEqual(worldNodes.titleFor({ node: "gold" }), "⛏️ Buyable nodes – Gold Rock");
});

test("buyable nodes: another node type or window is pulled with the copy's farm; the default is the needs' query", () => {
  assert.deepStrictEqual(worldNodes.needs("9").agg, { res: "worldNodes", node: "trees", farm: "9" });
  assert.deepStrictEqual(worldNodes.needs("").agg, { res: "worldNodes", node: "trees" });
  const asked = [];
  worldNodes.build({}, { farmId: "9", pull: (q) => { asked.push(q); } }, { node: "lavaPits", scope: "30" });
  assert.deepStrictEqual(asked[0], { res: "worldNodes", node: "lavaPits", farm: "9", active: 30 });
  const { summary } = worldNodes.build({}, { farmId: "9", pull: () => ({ node: "lavaPits", rows: [{ eff: 1, cls: 1, n: 3 }], zero: 0 }) }, { node: "lavaPits" });
  assert.match(summary, /<b>Lava Pit cannot be merged<\/b>/);
  assert.ok(!/with T2/.test(summary));
});

const STATS = {
  source: "community CDN daily dump",
  dump: { path: "2026-11-25/active.jsonl.gz", generated_at: "2026-11-25T22:00:00Z", finished_at: "2026-11-25T23:00:00Z", duration_ms: 5400000,
    records_done: 656000, changed: 420000, unchanged: 236000, unparseable: 3, complete: true, last_error: null, age_ms: 40 * 3600000 },
  stored: { farms: 656123, with_activity: 600000, blacklisted: 1200, with_blacklist: 650000, banned: 3456, verified: 10, newest_activity: "2026-11-25T21:59:00Z" },
  active: { d1: 120000, d7: 210000, d30: 330000, d90: 500000 },
};

test("summary: the headline counts as tiles and the data's age", () => {
  const { html } = worldSummary.view({ stats: STATS }, { now: Date.parse("2026-11-26T10:00:00Z") });
  assert.match(html, /class="v-kpis"/);
  for (const re of [/<b>656,123<\/b><span>farms/, /<b>120,000<\/b><span>played 24 h/, /<b>210,000<\/b><span>played 7 days/,
    /<b>330,000<\/b><span>played 30 days/, /<b>500,000<\/b><span>played 90 days/, /<b>3,456<\/b><span>banned/]) assert.match(html, re);
  assert.match(html, /\(12 h old\)/);
  assert.ok(!/⚠️/.test(html));
  assert.match(worldSummary.view({ stats: { ...STATS, dump: { ...STATS.dump, complete: false } } }, { now: Date.parse("2026-11-28T10:00:00Z") }).html, /\(2\.5 d old\)⚠️|\(2\.5 d old\) ⚠️/);
  assert.match(worldSummary.view({}).empty, /not loaded/);
});

test("dataset: the dump's provenance, warnings coloured", () => {
  const { html } = worldDataset.view({ stats: STATS });
  assert.match(html, /2026-11-25\/active\.jsonl\.gz/);
  assert.match(html, /<td>Age<\/td><td style="text-align:right" class="v-world-warn">40\.0 h/);
  assert.match(html, /<td>Unparseable lines<\/td><td style="text-align:right" class="v-world-warn">3/);
  assert.match(html, /<td>Load time<\/td><td style="text-align:right">1\.5 h/);
  assert.match(html, /complete ✓/);
  assert.match(html, /600,000 \/ 656,123/);
  assert.match(html, /1,200 \/ 650,000 known/);
  assert.strictEqual(fmtDur(90 * 3600000), "3.8 d");
  assert.strictEqual(fmtDur(0), "—");
});

const PRIO = {
  found: true, rank: 150, total: 600000, ahead: 149, aheadSameAscension: 40, higherAscension: 109,
  me: { farm_id: 9, username: "me", ascension: 2, level: 180, xp: 5_000_000 },
  next: [
    { farm_id: 11, username: "a", ascension: 2, level: 180, xp: 5_100_000 },
    { farm_id: 12, username: "b", ascension: 2, level: 181, xp: 5_300_000 },
    { farm_id: 13, username: "c", ascension: 3, level: 1, xp: 6_000_000 },
  ],
};

test("auction priority: rank tiles, the farms ahead with the XP to pass each, the live refresh", () => {
  const { html } = worldPriority.view({ prio: PRIO }, { farmId: "9" });
  assert.match(html, /<b>#150<\/b><span>your rank<\/span><small>of 600,000 farms/);
  assert.match(html, /<b>149<\/b><span>ahead of you<\/span><small>40 at the same Ascension/);
  assert.match(html, /<b>A2 · L180<\/b><span>you<\/span><small>5.00 M XP/);
  assert.match(html, /onclick="_worldPrioRefresh\(\)"/);
  assert.match(html, /Load the 3 ahead of you live/);
  // nearest first: a (149), b (148), c (147, higher ascension)
  assert.match(html, /<td>149<\/td><td>a <span class="v-dim">#11<\/span><\/td><td>A2<\/td><td>180<\/td><td style="text-align:right">5\.10 M<\/td><td style="text-align:right">\+100\.0 k<\/td><td style="text-align:right">1 farm<\/td>/);
  assert.match(html, /\+300\.0 k<\/td><td style="text-align:right">2 farms/);
  assert.match(html, /higher Ascension<\/td><td style="text-align:right">—/);
  assert.strictEqual(fmtXp(1234), "1.2 k");
});

test("auction priority: live data passes farms; a running refresh shows its progress", () => {
  const live = { 9: { ascension: 2, level: 181, xp: 5_200_000 } };
  const { html } = worldPriority.view({ prio: PRIO }, { farmId: "9", prioLive: () => live, prioRun: () => ({ done: 2, total: 4, err: null }) });
  assert.match(html, /<b>#149<\/b>/);                 // passed "a"
  assert.match(html, /5\.20 M XP · live/);
  assert.match(html, /disabled>Loading…/);
  assert.match(html, /<i style="width:50%"><\/i>/);
  assert.match(html, /2 \/ 4/);
  assert.match(worldPriority.view({}, { farmId: "" }).html, /No farm/);
  assert.match(worldPriority.view({ prio: { found: false } }, { farmId: "5" }).html, /not in the daily dump/);
  assert.deepStrictEqual(worldPriority.needs(""), {});
  assert.deepStrictEqual(worldPriority.needs("5"), { prio: { res: "worldPrio", farm: "5" } });
});
