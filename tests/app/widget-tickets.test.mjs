import { test } from "node:test";
import assert from "node:assert";
import { buildTicketsSection, buildTicketHistory, ticketGoal, AUCTION_REFERENCE } from "../../core/sections/tickets.mjs";
import * as W from "../../widgets/tickets.mjs";
import { renderTable } from "../../ui/table.mjs";
import { renderLook, looksFor, TEMPLATE_IDS } from "../../ui/glance-templates.mjs";

// TICKETS as widgets, over a real compute?section=tickets answer built by the same model the server
// runs (core/sections/tickets.mjs) on a small farm, with a two-week history.
const NOW = Date.UTC(2026, 8, 29, 12);
const prices = { productionCost: { Antipasto: 1.2 }, marketValue: { Potato: 0.0002, Sunfish: 2, "Red Cosmos": 0.16 } };
const FARM = {
  inventory: { Gem: 300 }, farmActivity: { "Shiny Feather Collected": "4000" }, vip: { expiresAt: NOW + 30 * 86400000 },
  bumpkin: { equipped: {} }, collectibles: {},
  delivery: { orders: [{ id: "a", from: "tywin", items: { Potato: 100 }, createdAt: NOW }] },
  choreBoard: { chores: {
    bert: { name: "Mine Stones 100 times", reward: { items: { "Shiny Feather": 2 } } },
    tango: { name: "Cook Antipasto 50 times", reward: { items: { "Shiny Feather": 3 } } },
  } },
  bounties: { requests: [
    { id: "r1", name: "Red Cosmos", items: { "Shiny Feather": 8 } },
    { id: "r2", name: "Sunfish", items: { "Shiny Feather": 2 } },
    { id: "c1", name: "Chicken", level: 2, items: { "Shiny Feather": 1 } },
  ], completed: [{ id: "r1" }] },
};
const floors = Object.fromEntries(AUCTION_REFERENCE.lots.map((l, i) => [l.name, { floor: 500 + i * 300, lastSalePrice: 400 + i * 250 }]));
const opts = { now: NOW, floors, gemsPerSFL: 10, sflUsd: 0.05, catNet: { crops: 10, fruits: 5, trees: 3, stone: 2, iron: 1, gold: 1, flowers: 2 } };
const D = buildTicketsSection(FARM, prices, opts);
D.history = buildTicketHistory([{ wk: "2026-09-21", ts: NOW - 7 * 86400000, farm: FARM }, { wk: "2026-09-28", ts: NOW, farm: FARM }], prices, opts);

const ICON = (n) => `<img data-icon="${n}">`;
const ctx = (extra = {}) => ({ icon: ICON, flower: "🌸", now: NOW, ...extra });
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);
const table = (w, out) => renderTable(w.columns, out.rows, w.defaults, { rowKey: w.rowKey, rowClass: w.rowClass });

test("every widget is on the TICKETS page and needs the tickets section", () => {
  assert.strictEqual(W.TICKETS_WIDGETS.length, 11);
  for (const w of W.TICKETS_WIDGETS) {
    assert.strictEqual(w.page, "tickets", w.type);
    assert.deepStrictEqual(w.needs(7), { tickets: { res: "tickets", farm: 7 } }, w.type);
    assert.ok(w.view || (w.build && w.columns), w.type);
  }
  assert.strictEqual(new Set(W.TICKETS_WIDGETS.map((w) => w.type)).size, 11);
});

test("nothing loaded → an explanation everywhere, never a crash", () => {
  for (const w of W.TICKETS_WIDGETS) {
    const out = w.view ? w.view({ tickets: null }, ctx()) : w.build({ tickets: null }, ctx());
    assert.match(out.empty, /did not load/, w.type);
  }
});

test("summary: the four numbers as tiles, the ticket's icon next to the count", () => {
  const { html } = W.ticketsSummary.view({ tickets: D }, ctx());
  assert.match(html, /class="v-kpis/);
  assert.match(html, /4,436 <img data-icon="Shiny Feather">/);   // ticketsExpected
  assert.match(html, /now 4,000/);
  assert.match(html, /in 6 days/);                                // round(0.79 × 7)
  assert.match(html, /554 \/ week/);                              // 4000 / 7.21 weeks
});

test("today: only what is worth a ticket (≤ 0.1 FLOWER), grouped, the rest folded with its weekly total", () => {
  const { html } = W.ticketsToday.view({ tickets: D }, ctx());
  assert.match(html, /costs less than ~0\.10 FLOWER a ticket/);
  assert.match(html, /<b>Tywin<\/b>: 100× <img data-icon="Potato">Potato/);   // the delivery's items with icons
  assert.match(html, /Deliver <img data-icon="Chicken"><b>Chicken<\/b> at level 2\+/);
  assert.match(html, /Claim the daily reward/);
  assert.match(html, /Not worth it: 12 things \(\+385 <img data-icon="Shiny Feather">Shiny Feather a week would cost ~62 FLOWER\)/);
  assert.match(html, /<img data-icon="Antipasto">Cook Antipasto 50 times/);   // the chore's item gets its icon
  assert.match(html, /class="v-big"/);
  // the done bounty (Red Cosmos, 0.02 a ticket) stays as a ticked step; 1 of 5 steps done → the big bar at 20 %
  assert.match(html, /class="v-big"><i style="width:20%"/);
  assert.match(html, /w-st-done/);
});

test("goal: the verdict follows ticketGoal, and a collect verdict raises the checklist's limit", () => {
  const g = { item: "Salt Rug", est: 100, unit: "flower", tickets: 5000 };
  const { html } = W.ticketsGoal.view({ tickets: D }, ctx({ goal: () => g }));
  const plan = W.ticketPlan(D, g);
  const want = ticketGoal({ value: 100, tickets: 5000 }, { collected: 4000, weeksLeft: D.thisAuction.weeksUntil,
    track: D.track * Math.min(1, D.thisAuction.weeksUntil / D.assumptions.weeksToAuction),
    curve: D.history.curve.filter((x) => x.share >= 0.5).map((x) => [x.ticketsPerWeek, x.cost]), rounds: D.rounds });
  assert.deepStrictEqual(plan.goal, want);
  assert.match(html, /<img data-icon="Salt Rug">Salt Rug/);
  assert.match(html, want.verdict === "collect" ? /Collect — it pays off/ : want.verdict === "not-worth" ? /Don't collect/ : /You won't make it/);
  assert.match(html, /class="v-bar"/);
  // no goal → the hint
  assert.match(W.ticketsGoal.view({ tickets: D }, ctx({ goal: () => ({}) })).html, /Pick an item/);
});

test("items: ranked by FLOWER a day (hourglasses per use / 7), a bar per row, icons, the unpriced listed with icons", () => {
  const out = W.ticketsItems.build({ tickets: D }, ctx());
  const vals = out.rows.map((r) => r.val);
  assert.ok(out.rows.length > 0);
  assert.ok(out.rows.every((r) => r.val === (r.perDay != null ? r.perDay : r.perUse / 7)));
  const html = table(W.ticketsItems, out);
  const shown = keys(html).map((k) => out.rows.find((r) => r.name === k).val);
  for (let i = 1; i < shown.length; i++) assert.ok(shown[i] <= shown[i - 1], "highest FLOWER first");
  assert.strictEqual(Math.max(...vals), out.rows.find((r) => r.rel === 100).val);
  assert.match(html, /class="v-bar"/);
  assert.match(html, /<img data-icon="/);
  assert.match(out.footer, /Can't price: <img data-icon="/);
});

test("schedule: next round per item, rounds left, resale after the fee", () => {
  const out = W.ticketsSchedule.build({ tickets: D }, ctx());
  assert.strictEqual(out.rows.length, D.schedule.items.length);
  const html = table(W.ticketsSchedule, out);
  assert.match(html, /rounds left/);
  assert.match(html, /<img data-icon="/);
  const soon = out.rows.filter((r) => r.soon);
  assert.ok(soon.length >= 1 && soon.every((r) => r.next === Math.min(...out.rows.filter((x) => x.next).map((x) => x.next))));
});

test("calculator: the four paths priced from last auction's rounds, the cheapest marked", () => {
  const s = W.decideSettings({});
  assert.deepStrictEqual(s, { est: 1500, unit: "usd", tier: "top", custom: 13000 });
  const p = W.decidePaths(D, s);
  assert.strictEqual(p.V, 30000);                                   // $1,500 at $0.05
  assert.strictEqual(p.need, Math.max(...D.auction.lots.map((l) => l.tickets)));
  const { html } = W.ticketsDecide.view({ tickets: D }, ctx());
  assert.match(html, new RegExp(W.fmt(30000 * D.rounds.gem.median)));
  assert.match(html, new RegExp(W.fmt(30000 * D.rounds.flower.median)));
  assert.match(html, /30,000 🌸/);
  // the cheapest path has the ✅
  const costs = [p.tkCost, 30000 * D.rounds.gem.median, 30000 * D.rounds.flower.median, 30000].filter((x) => x != null);
  const best = Math.min(...costs);
  assert.match(html, new RegExp(`✅</td>\\s*<td[^>]*>${W.fmt(best)}`));
  if (p.tkCost == null) assert.match(html, /out of reach/);
});

test("this chapter's auction: tickets by then, the next lot within 2,000 and its gap, with a bar", () => {
  const { html } = W.ticketsThisAuction.view({ tickets: D }, ctx());
  assert.match(html, /about <b>4,436<\/b>/);
  assert.match(html, /Last time that would have won <img data-icon="Salt Rug">Salt Rug/);
  const near = D.auction.lots.filter((l) => l.value > 0 && l.tickets > 4436 && l.tickets - 4436 <= 2000).sort((a, b) => b.value - a.value)[0];
  assert.ok(near);
  assert.match(html, new RegExp(`<img data-icon="${near.name}">${near.name}.*${W.fmt(near.tickets - 4436)}`));
  assert.match(html, /class="v-bar"/);
});

test("next chapter: one row per lot with its verdict pill; the best plan as a banner", () => {
  const out = W.ticketsNextChapter.build({ tickets: D }, ctx());
  assert.strictEqual(out.rows.length, D.perLot.length);
  const html = table(W.ticketsNextChapter, out);
  assert.match(html, /v-pill/);
  assert.match(out.summary, /Earns the most/);
  assert.match(out.summary, new RegExp(`\\+${W.fmt(D.best.net)}`));
  assert.match(out.summary, /<img data-icon="Salt Rug">Salt Rug/);
});

test("history: chapters table, the curve chips, week by week with icons on the expensive items", () => {
  const { html } = W.ticketsHistory.view({ tickets: D }, ctx());
  assert.match(html, /Ascension Age/);
  assert.match(html, /<img data-icon="Shiny Feather">Shiny Feather/);
  assert.match(html, new RegExp(`${W.fmt(D.history.curve[1].ticketsPerWeek)}/w → ${W.fmt(D.history.curve[1].cost)} \\(100 %\\)`));
  assert.match(html, /Week by week \(2\)/);
  assert.match(W.ticketsHistory.view({ tickets: { ...D, history: null } }, ctx()).empty, /history/);
});

test("sources: cheapest ticket first, unpriced last; item lists carry icons; bounty bonus line", () => {
  const out = W.ticketsSources.build({ tickets: D }, ctx());
  const html = table(W.ticketsSources, out);
  const order = keys(html);
  assert.strictEqual(order.length, D.sources.length);
  const firstNull = out.rows.findIndex((r) => r.perTicket == null);
  assert.ok(firstNull >= 0);
  assert.match(html, /100× <img data-icon="Potato">Potato · delivered 0, skipped 0/);
  assert.match(out.summary, /Weekly bonus for all non-animal bounties/);
  assert.match(out.summary, /missing: <img data-icon="Sunfish">Sunfish/);
  // perTicket ascending among the priced rows
  const priced = order.map((k) => out.rows.find((r) => W.ticketsSources.rowKey(r) === k.replace(/&#39;/g, "'"))).filter((r) => r && r.perTicket != null);
  for (let i = 1; i < priced.length; i++) assert.ok(priced[i].perTicket >= priced[i - 1].perTicket);
});

test("reference: last auction's lots at today's prices, with the current items listed with icons", () => {
  const out = W.ticketsReference.build({ tickets: D }, ctx());
  assert.strictEqual(out.rows.length, D.auction.lots.length);
  const html = table(W.ticketsReference, out);
  assert.match(html, /<img data-icon="Salt Worker Gnome">/);
  assert.match(html, /13,412/);
  assert.match(out.summary, /sfl\.world/);
  assert.match(out.summary, /This chapter's auction: <img data-icon="/);
});

// ── 📱 glance models ──
const G = (w, c = ctx(), d = D) => w.glanceModel({ tickets: d }, c, {});
const GOAL = { goal: () => ({ item: "Salt Rug", est: 100, unit: "flower", tickets: 5000 }) };
const rowsIn = (html) => (html.match(/class="gx-row"/g) || []).length;

test("📱 glance: every widget has a model and a natural look from the catalogue, no hand-written face; nothing loaded → the message", () => {
  for (const w of W.TICKETS_WIDGETS) {
    assert.strictEqual(w.glance, undefined, `${w.type}: the hand-written face is gone`);
    assert.strictEqual(w.sizes, undefined, w.type);
    assert.ok(TEMPLATE_IDS.includes(w.look), `${w.type} ${w.look}`);
    assert.match(G(w, ctx(GOAL), null).empty, /did not load/, w.type);
    assert.ok(looksFor(G(w, ctx(GOAL))).length >= 3, w.type);
  }
});

test("📱 glance summary: tickets by the auction under the ticket icon; the auction counts down live", () => {
  const m = G(W.ticketsSummary);
  assert.deepStrictEqual(m.head, { value: "4.4k", hero: ICON("Shiny Feather"), cap: "by the auction · now 4k" });
  assert.strictEqual(m.items.length, 3);
  assert.deepStrictEqual(m.items[1], { icon: "🔨", name: "auction", sub: "Oct 5", at: D.timeline.ticketAuction });
  assert.match(renderLook(m, "number").html, /<div class="gx-num">4\.4k<\/div><div class="gx-cap">by the auction · now 4k<\/div>/);
  assert.match(G(W.ticketsSummary, ctx(), { ...D, thisAuction: null }).head.cap, /collected · the auction is over/);
});

test("📱 glance goal: the verdict word with the reachable share as a ring; the costs as items; no goal → empty", () => {
  const P = W.ticketPlan(D, GOAL.goal()).goal;
  assert.strictEqual(P.verdict, "unreachable");
  const m = G(W.ticketsGoal, ctx(GOAL));
  assert.deepStrictEqual([m.head.value, m.head.tone, m.head.ringTone, Math.round(m.head.ring)], ["Short", "warn", "warn", Math.round(P.maxTickets / 50)]);
  assert.deepStrictEqual(m.items.map((i) => i.name), ["need / week", "reachable", "gem round", "wait and buy"]);
  assert.match(renderLook(m, "number").html, /class="gx-ring g-warn"/);
  assert.match(G(W.ticketsGoal, ctx({ goal: () => ({}) })).empty, /Set a chapter goal/);
});

test("📱 glance today: steps left with a ring (1 of 5 done); open steps by tickets, then the done ones", () => {
  const m = G(W.ticketsToday);
  assert.deepStrictEqual(m.head, { value: 4, unit: "left", tone: "", ring: 20, ringTone: "accent", cap: "+18 tickets to collect" });
  assert.strictEqual(m.items.length, 5);
  assert.deepStrictEqual(m.items[0], { icon: ICON("Potato"), name: "Tywin", sub: "📦 Delivery", pct: 0, value: "+12", tone: "ok" });
  assert.deepStrictEqual(m.items[4].chip, { text: "done", tone: "ok" });
  assert.strictEqual(rowsIn(renderLook(m, "list-1").html), 3);
  const done = { ...D, sources: D.sources.map((x) => ({ ...x, done: true })) };
  assert.deepStrictEqual([G(W.ticketsToday, ctx(), done).head.value, G(W.ticketsToday, ctx(), done).head.cap], ["✓", "all done"]);
});

test("📱 glance items: the top earner first (its natural look: next up); every item by FLOWER; none → empty", () => {
  const m = G(W.ticketsItems);
  assert.strictEqual(W.ticketsItems.look, "next");
  assert.deepStrictEqual(m.head, { value: "1.67", unit: "/day", hero: ICON("Duende Hat"), cap: "FLOWER · Duende Hat" });
  assert.deepStrictEqual(m.items.slice(0, 3).map((i) => i.name), ["Duende Hat", "Harvest Hourglass", "Ore Hourglass"]);
  assert.strictEqual(m.items[1].value, "0.83/use");
  assert.match(renderLook(m, "next").html, /<div class="gx-next-name">Duende Hat<\/div>/);
  assert.match(G(W.ticketsItems, ctx(), { ...D, items: [] }).empty, /No auction or shop items/);
});

test("📱 glance schedule: the next round counts down live (at), soonest first; every round over → empty", () => {
  const m = G(W.ticketsSchedule);
  assert.strictEqual(m.head.value, "6d");
  assert.deepStrictEqual(m.items[0], { icon: ICON("Salt Rug"), name: "Salt Rug", sub: "5 of 5 rounds left", at: m.items[0].at, pct: 100 });
  assert.ok(m.items[0].at > NOW && m.items[0].at <= m.items[1].at);
  assert.match(renderLook(m, "next", { now: NOW }).html, /<span class="g-at" data-at="\d+">6d \d+h<\/span>/);
  const ended = { ...D, schedule: { ...D.schedule, items: D.schedule.items.map((i) => ({ ...i, next: null })) } };
  assert.match(G(W.ticketsSchedule, ctx(), ended).empty, /Every auction round has ended/);
});

test("📱 glance calculator: the cheapest path's cost; it first, then the others; no estimate → empty", () => {
  const V = 30000;
  const m = G(W.ticketsDecide);
  assert.deepStrictEqual(m.head, { value: `${(V * D.rounds.flower.median / 1000).toFixed(1)}k`, unit: "FLOWER", tone: "ok", cap: "cheapest: FLOWER round" });
  assert.deepStrictEqual(m.items.map((i) => i.name), ["FLOWER round", "Collect tickets", "Gem round", "Wait and buy"]);
  assert.deepStrictEqual([m.items[1].value, m.items[1].tone], ["out of reach", "bad"]);
  assert.match(G(W.ticketsDecide, ctx({ decide: () => ({ est: 0 }) })).empty, /Enter an estimate/);
});

test("📱 glance this auction: tickets by then with the next lot's gap as a ring; lots just above, then the ones in reach", () => {
  const m = G(W.ticketsThisAuction);
  assert.deepStrictEqual([m.head.value, m.head.cap, m.head.ringTone], ["4.4k", "by the auction · Vibraphone is 22 away", "accent"]);
  assert.deepStrictEqual([m.items[0].name, m.items[0].value, m.items[0].tone], ["Vibraphone", "+22", "warn"]);
  assert.deepStrictEqual(m.items[1].chip, { text: "in reach", tone: "ok" });
  assert.match(renderLook(m, "number").html, /gx-ring g-accent/);
  assert.match(G(W.ticketsThisAuction, ctx(), { ...D, thisAuction: { ...D.thisAuction, weeksUntil: 0 } }).empty, /behind you/);
});

test("📱 glance next chapter: the best plan's net; reachable lots by net, then those out of reach", () => {
  const m = G(W.ticketsNextChapter);
  assert.deepStrictEqual(m.head, { value: "+3.7k", unit: "FLOWER", tone: "ok", hero: ICON("Salt Rug"), cap: "Salt Rug · 12 tickets / week" });
  assert.deepStrictEqual(m.items.slice(0, 2).map((i) => i.name), ["Salt Rug", "Coat Rack"]);
  assert.deepStrictEqual(m.items.find((i) => i.name === "Vibraphone").chip, { text: "out of reach", tone: "bad" });
  assert.match(renderLook(m, "overview-4").html, /class="gx-tiles"/);
  assert.match(G(W.ticketsNextChapter, ctx(), { ...D, perLot: [] }).empty, /No lot of last chapter/);
});

test("📱 glance history: FLOWER a ticket for doing everything, week by week as a chart; no weeks → empty", () => {
  const m = G(W.ticketsHistory);
  assert.deepStrictEqual(m.head, { value: "0.295", unit: "/ticket", cap: "FLOWER when you do everything · 2 weeks" });
  assert.strictEqual(m.series.length, 2);
  assert.deepStrictEqual(m.tiles.slice(0, 2).map((t) => [t.label, t.value]), [["max/week", "211"], ["cost/week", "62.3"]]);
  assert.match(renderLook(m, "chart-2").html, /class="gx-spark/);
  assert.match(G(W.ticketsHistory, ctx(), { ...D, history: null }).empty, /No recorded weeks/);
});

test("📱 glance sources: the cheapest open source; open ones cheapest first, the over-priced in red; all done → empty", () => {
  const m = G(W.ticketsSources);
  assert.deepStrictEqual([m.head.value, m.head.tone, m.head.cap], ["free", "ok", "cheapest: Daily reward · +1"]);
  assert.strictEqual(m.items.length, 6);
  assert.deepStrictEqual(m.items.find((i) => i.name === "Deliver Sunfish"), { icon: ICON("Sunfish"), name: "Deliver Sunfish", sub: "+2 a week", value: "1.000", tone: "bad", pct: (1 / 12) * 100 });
  assert.ok(!m.items.some((i) => /Red Cosmos/.test(i.name)), "done sources are left out");
  assert.strictEqual(rowsIn(renderLook(m, "number-list-2").html), 3);
  const allDone = { ...D, sources: D.sources.map((x) => ({ ...x, done: true })) };
  assert.match(G(W.ticketsSources, ctx(), allDone).empty, /No open priced source/);
});

test("📱 glance reference: the lot paying most FLOWER a ticket first; every lot", () => {
  const m = G(W.ticketsReference);
  assert.deepStrictEqual([m.head.value, m.head.unit, m.head.cap], ["44.458", "/ticket", "FLOWER · best: Salt Rug"]);
  assert.strictEqual(m.items.length, D.auction.lots.length);
  assert.deepStrictEqual([m.items[0].name, m.items[0].pct], ["Salt Rug", 100]);
  assert.strictEqual(rowsIn(renderLook(m, "list-4").html), 8);
});
