import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { flowersNeeds, flowerBeds } from "../../widgets/flowers.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable, tableSettingsPanel, applyTableAction } from "../../ui/table.mjs";
import { FLOWER_RECIPES } from "../../core/data/recipes.mjs";

// FLOWERS as widgets: what each flower still needs (core/engine/flower-plan.mjs) and the beds.

const NOW = Date.UTC(2026, 10, 26, 12);
const all = (n) => Object.fromEntries(Object.keys(FLOWER_RECIPES).map((k) => [k, String(n)]));
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);
const CTX = { now: NOW, pageFlowers: () => ({ mode: "collection", n: 2, giftPlan: {} }), countdown: (ms) => `${Math.round(ms / 60000)}m`,
  hours: (h) => `${h}h`, icon: (n) => `<i>${n}</i>` };

test("registered on FLOWERS; both need only the farm", () => {
  assert.strictEqual(WIDGETS["flowers-needs"], flowersNeeds);
  assert.strictEqual(WIDGETS["flower-beds"], flowerBeds);
  assert.deepStrictEqual(flowersNeeds.needs(7), { farm: { res: "farm", farm: 7 } });
  assert.strictEqual(flowersNeeds.page, "flowers");
});

test("needs: one row per flower in the page's order; the page's mode unless the widget sets its own", () => {
  const inventory = { ...all(2), "Yellow Pansy": "0", "Yellow Cosmos": "1" };
  const out = flowersNeeds.build({ farm: { inventory } }, CTX, {});
  assert.strictEqual(out.rows.length, Object.keys(FLOWER_RECIPES).length);
  const html = renderTable(flowersNeeds.columns, out.rows, flowersNeeds.defaults, { rowKey: flowersNeeds.rowKey });
  assert.strictEqual(keys(html)[0], "Yellow Pansy", "the most missing Sunpetal first");
  assert.match(out.footer, /34 \/ 36|\d+ \/ \d+ done/);
  assert.match(out.footer, /4 left/);
  // own mode on this copy: collection of 3 → more missing
  const own = flowersNeeds.build({ farm: { inventory } }, CTX, { mode: "collection", n: 3 });
  const rp = own.rows.find((r) => r.name === "Red Pansy");
  assert.deepStrictEqual([rp.own, rp.missing > 1], [3, true]);
  assert.match(flowersNeeds.titleFor({ mode: "collection", n: 3 }), /📦 3/);
  assert.strictEqual(flowersNeeds.titleFor({}), "🌸 Flowers – needed");
});

test("needs: hide what is done; filter by seed; the recipe and what uses it shown", () => {
  const inventory = { ...all(2), "Yellow Pansy": "0", "Yellow Cosmos": "1" };
  const out = flowersNeeds.build({ farm: { inventory } }, CTX, { hideDone: true });
  assert.deepStrictEqual(out.rows.map((r) => r.name).sort(), ["Yellow Cosmos", "Yellow Pansy"]);
  const html = renderTable(flowersNeeds.columns, out.rows, flowersNeeds.defaults, { rowKey: flowersNeeds.rowKey });
  assert.match(html, /Sunflower/);
  assert.match(html, /Yellow Cosmos \(×2\)/);
  const panel = tableSettingsPanel(flowersNeeds.columns, flowersNeeds.defaults, { rows: out.rows, rowKey: flowersNeeds.rowKey, tab: "filter" });
  assert.match(panel, /data-value="seed\|Sunpetal Seed"/);
  const s = applyTableAction(flowersNeeds.columns, flowersNeeds.defaults, "filter", "seed|Sunpetal Seed");
  assert.ok(!keys(renderTable(flowersNeeds.columns, out.rows, s, { rowKey: flowersNeeds.rowKey })).includes("Yellow Pansy"));
});

test("needs: everything done → a ✓ message; no farm → a message", () => {
  const out = flowersNeeds.build({ farm: { inventory: all(9) } }, CTX, { hideDone: true });
  assert.strictEqual(out.rows.length, 0);
  assert.match(out.empty, /✓/);
  assert.match(flowersNeeds.build({}, CTX, {}).empty, /No farm data/);
});

test("beds: what grows and when, ready first; empty beds say so", () => {
  const farm = { inventory: {}, flowers: { flowerBeds: { b2: {}, b1: { flower: { name: "Yellow Pansy", plantedAt: NOW - 86400 * 1000 - 1, criticalHit: { x: 1 } } },
    b3: { flower: { name: "Red Pansy", plantedAt: NOW - 3_600_000 } } } } };
  const out = flowerBeds.build({ farm }, CTX, {});
  const html = renderTable(flowerBeds.columns, out.rows, flowerBeds.defaults, { rowKey: flowerBeds.rowKey });
  assert.deepStrictEqual(keys(html), ["b1", "b3", "b2"]);
  assert.match(html, /READY/);
  assert.match(html, /data-ready="\d+">1380m</);
  assert.match(html, />empty</);
  assert.match(out.footer, /1 ready · 1 growing · 1 empty/);
});

test("the real farm renders both", () => {
  const farm = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url))).farm;
  assert.ok(flowersNeeds.build({ farm }, CTX, {}).rows.length > 0);
  assert.ok(Array.isArray(flowerBeds.build({ farm }, CTX, {}).rows));
});
