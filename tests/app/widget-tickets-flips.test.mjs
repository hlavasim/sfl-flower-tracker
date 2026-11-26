import { test } from "node:test";
import assert from "node:assert";
import { ticketChecklist } from "../../widgets/ticket-checklist.mjs";
import { flipTable } from "../../widgets/flip-table.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable, applyTableAction } from "../../ui/table.mjs";
import { createStore } from "../../app/store.mjs";

const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);
const opts = (w) => ({ rowKey: w.rowKey, rowClass: w.rowClass });

// ── TICKETY · this week's checklist ──
const SOURCES = [
  { id: "daily", group: "daily", done: false, tickets: 1 },
  { id: "d1", group: "delivery", label: "betty", items: { Wheat: 15 }, done: true, tickets: 3, cost: 0.6, per: "day" },
  { id: "c1", group: "chore", npc: "tywin", label: "Chop 50 trees", done: false, tickets: 5, progress: 20, required: 50, remaining: 30, perDay: 10, kind: "do", cost: 1 },
  { id: "c2", group: "chore", npc: "jester", label: "Harvest 10 Kale", done: false, tickets: 4, progress: 10, required: 10, remaining: 0, kind: "plant" },
  { id: "b1", group: "bounty", label: "Rapid Roast", done: false, tickets: 7, cost: 14 },
  { id: "a1", group: "animal", animal: "Cow", level: 5, feed: 0.4, done: false, tickets: 2 },
  { id: "x", group: "chore", npc: "no", label: "nothing", done: false, tickets: 0 },
];
const TK = { sources: SOURCES };

test("tickets: registered; needs the tickets section of the farm", () => {
  assert.strictEqual(WIDGETS["ticket-checklist"], ticketChecklist);
  assert.deepStrictEqual(ticketChecklist.needs(2), { tickets: { res: "tickets", farm: 2 } });
});

test("tickets: open sources first (most tickets first), done ones after, zero-ticket ones left out", () => {
  const { rows, footer } = ticketChecklist.build({ tickets: TK });
  const html = renderTable(ticketChecklist.columns, rows, ticketChecklist.defaults, opts(ticketChecklist));
  assert.deepStrictEqual(keys(html), ["b1", "c1", "c2", "a1", "daily", "d1"]);
  assert.match(html, /data-row="d1" class="w-st-done"/);
  assert.match(html, /Betty<\/b>: 15× Wheat/);
  assert.match(html, /20 \/ 50 · 30 left/);
  assert.match(html, /complete — claim it at the NPC/);
  assert.match(html, /Deliver <b>Cow<\/b> at level 5\+/);
  assert.match(html, /Claim the daily reward/);
  assert.match(footer, /5 left · <b[^>]*>\+19</);
});

test("tickets: the cost per ticket is a column (sortable), groups are a filter", () => {
  const { rows } = ticketChecklist.build({ tickets: TK });
  const s = applyTableAction(ticketChecklist.columns, ticketChecklist.defaults, "filter", "group|chore");
  const shown = keys(renderTable(ticketChecklist.columns, rows, s, opts(ticketChecklist)));
  assert.ok(!shown.includes("c1") && !shown.includes("c2"));
  assert.strictEqual(ticketChecklist.columns.find((c) => c.key === "perTicket").get(rows.find((r) => r.id === "b1")), 2);
});

test("tickets: not loaded → an explanation", () => {
  assert.match(ticketChecklist.build({ tickets: null }).empty, /tickets/i);
});

test("store: tickets POSTs the recorded weeks like the TICKETY page", async () => {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET" });
    const body = url.includes("ticket-weeks") ? { weeks: [{ wk: 1 }] } : { data: { sources: [] } };
    return { ok: true, status: 200, json: async () => body };
  };
  const r = await createStore({ fetch: f }).get({ res: "tickets", farm: 3 });
  assert.deepStrictEqual(r.data, { sources: [] });
  assert.ok(calls.some((c) => c.url.includes("section=tickets") && c.method === "POST"));
});

// ── Flip table ──
const NOW = Date.now();
const FLIPS = { count: 2, items: [
  { name: "Gnome", collection: "collectibles", itemId: 1, boost: "+1 Crop", bestOffer: 100, bestListing: 140, avgTrade10: 120, spreadPct: 40, net: 26, margin: 26, tradesToday: 3, nTrades10: 10, offerPressure: 2, listingPressure: 1, updatedAt: new Date(NOW).toISOString() },
  { name: "Bad <Hat>", collection: "wearables", itemId: 2, bestOffer: 10, bestListing: 10.5, spreadPct: 5, net: -0.55, margin: -5, updatedAt: new Date(NOW).toISOString() },
] };

test("flips: registered; needs the flips feed", () => {
  assert.strictEqual(WIDGETS["flip-table"], flipTable);
  assert.deepStrictEqual(flipTable.needs(1), { flips: { res: "flips" } });
});

test("flips: rows, margin colours, escaped names, market link; frozen feed is said in the footer", () => {
  const { rows, footer } = flipTable.build({ flips: FLIPS });
  const html = renderTable(flipTable.columns, rows, flipTable.defaults, opts(flipTable));
  assert.deepStrictEqual(keys(html), ["collectibles:1", "wearables:2"]);
  assert.match(html, /Bad &lt;Hat&gt;/);
  assert.match(html, /marketplace\/collectibles\/1/);
  assert.match(html, /flip-good">26%/);
  assert.match(html, /flip-bad">-5%/);
  assert.match(footer, /Collected hourly/);
  const old = { ...FLIPS, items: FLIPS.items.map((i) => ({ ...i, updatedAt: "2026-09-01T00:00:00Z" })) };
  assert.match(flipTable.build({ flips: old }).footer, /paused/);
});
