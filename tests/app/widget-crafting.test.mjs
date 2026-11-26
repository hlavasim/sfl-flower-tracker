import { test } from "node:test";
import assert from "node:assert";
import { crabTraps, craftingBox } from "../../widgets/crafting.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";

// What is in the crab traps and the crafting box right now (CRABS and DOLLS pages, pinnable).

const NOW = Date.UTC(2026, 10, 26, 12);
const CTX = { now: NOW, countdown: (ms) => `${Math.round(ms / 60000)}m`, icon: (n) => `<i>${n}</i>` };
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);

test("registered on their pages; need only the farm", () => {
  assert.strictEqual(WIDGETS["crab-traps"], crabTraps);
  assert.strictEqual(WIDGETS["crafting-box"], craftingBox);
  assert.strictEqual(crabTraps.page, "crustaceans");
  assert.strictEqual(craftingBox.page, "dolls");
  assert.deepStrictEqual(crabTraps.needs(7), { farm: { res: "farm", farm: 7 } });
});

test("traps: each catch with its quantity, ready ones first, empty traps counted in the footer", () => {
  const farm = { crabTraps: { trapSpots: {
    t1: { waterTrap: { readyAt: NOW + 3_600_000, caught: { "Blue Crab": 1 } } },
    t2: { waterTrap: { readyAt: NOW - 1, caught: { Isopod: 2 } } },
    t3: {},
  } } };
  const out = crabTraps.build({ farm }, CTX);
  const html = renderTable(crabTraps.columns, out.rows, crabTraps.defaults, { rowKey: crabTraps.rowKey });
  assert.deepStrictEqual(keys(html), ["t2|Isopod", "t1|Blue Crab"]);
  assert.match(html, /READY/);
  assert.match(html, />60m</);
  assert.match(html, /<i>Isopod<\/i>/);
  assert.match(out.footer, /1 to collect · 1 in traps · 3 traps/);
});

test("crafting box: what is being made and when; idle says so", () => {
  const busy = craftingBox.build({ farm: { craftingBox: { status: "crafting", readyAt: NOW + 120_000, item: { collectible: "Doll" } } } }, CTX);
  const html = renderTable(craftingBox.columns, busy.rows, craftingBox.defaults, { rowKey: craftingBox.rowKey });
  assert.match(html, /<i>Doll<\/i>Doll/);
  assert.match(html, />2m</);
  const idle = craftingBox.build({ farm: { craftingBox: { status: "idle" } } }, CTX);
  assert.strictEqual(idle.rows.length, 0);
  assert.match(idle.empty, /is idle/);
  assert.match(crabTraps.build({}, CTX).empty, /No farm data/);
});
