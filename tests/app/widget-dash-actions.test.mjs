import { test } from "node:test";
import assert from "node:assert";
import { dashActions as W } from "../../widgets/dash-actions.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable, tableSettingsPanel, applyTableAction } from "../../ui/table.mjs";
import { renderLook, looksFor } from "../../ui/glance-templates.mjs";

// DASH · "Co je hotové": the DASH page's own action list (the page hands over its parser), as a
// table: when, category, what, efficiency; filterable by status and category.

const NOW = Date.UTC(2026, 10, 26, 12);
const ACTIONS = [
  { category: "Crops", icon: "🌾", label: "Sunflower", detail: "12 plots", status: "upcoming", readyAt: NOW + 3_600_000, priority: 1 },
  { category: "Beehives", icon: "🐝", label: "Beehive", detail: "Full!", status: "ready", readyAt: NOW - 60_000, priority: 1 },
  { category: "Trees", icon: "🌳", label: "Tree <b>x</b>", labelHtml: "Tree <i>2</i>", status: "ready", readyAt: NOW - 3_600_000, priority: 2 },
  { category: "Composters", icon: "♻️", label: "Compost Bin", detail: "No produce!", status: "empty", readyAt: 0, priority: 3 },
  { category: "Bounty Board", icon: "📋", label: "Bounty", status: "ready", readyAt: 0, priority: 9, efficiency: { kind: "ticket", value: 2.5, label: "2.5 SFL/🎟" } },
];
const CTX = { dashActions: () => ACTIONS, countdown: (ms) => `${Math.round(ms / 60000)}m`, now: NOW };
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);

test("registered; needs only the farm", () => {
  assert.strictEqual(WIDGETS["dash-actions"], W);
  assert.deepStrictEqual(W.needs(7), { farm: { res: "farm", farm: 7 } });
});

test("rows are the page's actions; default order as on DASH: ready by readyAt (no time = first), then upcoming (soonest), idle last", () => {
  const { rows } = W.build({ farm: {} }, CTX);
  const html = renderTable(W.columns, rows, W.defaults, { rowKey: W.rowKey });
  assert.deepStrictEqual(keys(html), ["Bounty Board|Bounty", "Trees|Tree <b>x</b>", "Beehives|Beehive", "Crops|Sunflower", "Composters|Compost Bin"].map((k) => k.replace(/</g, "&lt;").replace(/>/g, "&gt;")));
});

test("cells: READY / live countdown / IDLE; the label's HTML when the page gives it, escaped otherwise", () => {
  const html = renderTable(W.columns, W.build({ farm: {} }, CTX).rows, W.defaults, { rowKey: W.rowKey });
  assert.match(html, /READY/);
  assert.match(html, /class="v-pill v-run growing-bed-time" data-ready="\d+">60m</);
  assert.match(html, /<span class="v-pill v-ok">READY<\/span>/);
  assert.match(html, /<span class="v-pill v-idle">IDLE<\/span>/);
  assert.match(html, /IDLE/);
  assert.match(html, /Tree <i>2<\/i>/);
  assert.match(html, /No produce!/);
});

test("filter by status and category: the panel lists the values, a toggle hides them", () => {
  const { rows } = W.build({ farm: {} }, CTX);
  const panel = tableSettingsPanel(W.columns, W.defaults, { rows, rowKey: W.rowKey, tab: "filter" });
  assert.match(panel, /data-action="settings-tab" data-value="filter" aria-selected="true"/);
  assert.match(panel, /data-action="filter" data-value="status\|ready"/);
  assert.match(panel, /data-action="filter" data-value="category\|Beehives"/);
  let s = applyTableAction(W.columns, W.defaults, "filter", "status|empty");
  s = applyTableAction(W.columns, s, "filter", "category|Crops");
  const shown = keys(renderTable(W.columns, rows, s, { rowKey: W.rowKey }));
  assert.ok(!shown.includes("Composters|Compost Bin") && !shown.includes("Crops|Sunflower"));
  assert.strictEqual(shown.length, 3);
});

test("no farm, or no parser yet: an explanation, not a throw", () => {
  assert.match(W.build({ farm: null }, CTX).empty, /No farm data/);
  assert.match(W.build({ farm: {} }, {}).empty, /DASH/);
});

test("the Craft / Catch suggestions follow this widget's own limits (blank = the page's LIMIT)", () => {
  assert.deepStrictEqual(W.options.map((o) => [o.key, o.kind]), [["dollLimit", "number"], ["crabLimit", "number"],
    ["showNonTicket", "bool"], ["showAnimals", "bool"], ["showFaction", "bool"]]);
  let seen = null;
  const ctx = { ...CTX, dashActions: (farm, limits) => { seen = limits; return []; } };
  W.build({ farm: {} }, ctx, { dollLimit: 10, crabLimit: 3 });
  assert.deepStrictEqual([seen.dolls, seen.crabs], [10, 3]);
  W.build({ farm: {} }, ctx, {});
  assert.deepStrictEqual([seen.dolls, seen.crabs], [null, null]);
});

test("what to list is this widget's own choice: non-ticket bounties, animal turn-ins, faction items", () => {
  assert.deepStrictEqual([W.defaults.opts.showNonTicket, W.defaults.opts.showAnimals, W.defaults.opts.showFaction], [false, false, true]);
  let seen = null;
  const ctx = { ...CTX, dashActions: (farm, limits) => { seen = limits; return []; } };
  W.build({ farm: {} }, ctx, { showNonTicket: true, showAnimals: false, showFaction: false });
  assert.deepStrictEqual(seen.filters, { showNonTicket: true, showAnimals: false, showFaction: false });
  // the column the user filters by is called "typ"
  assert.strictEqual(W.columns.find((c) => c.key === "category").label, "type");
});

test("📱 glance model: how many are ready (ring = ready vs running); items ready first, then the soonest, then idle, as plain text with icons", () => {
  const m = W.glanceModel({ farm: {} }, CTX, {});
  assert.deepStrictEqual(m.head, { value: 3, tone: "ok", ring: 75, ringTone: "ok", cap: "to collect · 1 running" });
  assert.deepStrictEqual(m.items.map((i) => [i.name, i.chip.text]), [["Bounty", "READY"], ["Tree 2", "READY"], ["Beehive", "READY"], ["Sunflower", "60m"], ["Compost Bin", "IDLE"]]);
  assert.deepStrictEqual(m.items[3], { icon: "🌾", name: "Sunflower", sub: "Crops", chip: { text: "60m", tone: "info" } });
  assert.deepStrictEqual(m.tiles.map((t) => [t.label, t.value]), [["ready", 3], ["running", 1], ["next", "60m"], ["idle", 1]]);
  assert.strictEqual(m.foot, "3 ready · 1 running · 1 idle");
  assert.match(renderLook(m, "number").html, /<svg class="gx-ring g-ok"[^]*<div class="gx-num g-ok">3<\/div><div class="gx-cap">to collect · 1 running<\/div>/);
  assert.match(renderLook(m, "icons-4").html, /<small class="gx-tag g-info">60m<\/small>/);
  assert.strictEqual((renderLook(m, "list-4").html.match(/class="gx-row"/g) || []).length, 5);
  assert.ok(looksFor(m).length >= 3);
  // nothing pending: a ✓ headline, not an empty face; a missing parser explains itself
  const none = W.glanceModel({ farm: {} }, { ...CTX, dashActions: () => [] }, {});
  assert.deepStrictEqual([none.head.value, none.head.cap], ["✓", "nothing pending"]);
  assert.match(W.glanceModel({ farm: {} }, {}, {}).empty, /DASH/);
  assert.strictEqual(W.glance, undefined, "the hand-written face is gone");
});
