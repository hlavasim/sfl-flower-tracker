import { test } from "node:test";
import assert from "node:assert";
import { crabTraps, craftingBox } from "../../widgets/crafting.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { renderLook, looksFor } from "../../ui/glance-templates.mjs";

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
  assert.match(html, /<i>Doll<\/i><div><b>Doll<\/b>/);
  assert.match(html, />2m</);
  const idle = craftingBox.build({ farm: { craftingBox: { status: "idle" } } }, CTX);
  assert.strictEqual(idle.rows.length, 0);
  assert.match(idle.empty, /is idle/);
  assert.match(crabTraps.build({}, CTX).empty, /No farm data/);
});

test("crafting box: the game's queue — every job, ready ones first, with how many are queued", () => {
  const farm = { craftingBox: { status: "crafting", queue: [
    { name: "Wooly Doll", readyAt: NOW + 3_600_000, startedAt: NOW - 3_600_000 },
    { name: "Wooly Doll", readyAt: NOW + 7_200_000, startedAt: NOW + 3_600_000 },
    { name: "Doll", readyAt: NOW - 1, startedAt: NOW - 100_000 },
  ] } };
  const out = craftingBox.build({ farm }, CTX);
  assert.strictEqual(out.rows.length, 3);
  const html = renderTable(craftingBox.columns, out.rows, craftingBox.defaults, { rowKey: craftingBox.rowKey });
  assert.match(html, /<span class="v-pill v-ok">READY<\/span>/);
  assert.match(html, />60m</);
  assert.match(out.footer, /1 ready · 2 crafting/);
});

test("📱 glance model, traps: the soonest catch (ready first) as the headline; every catch with a READY / countdown chip and its progress", () => {
  const farm = { crabTraps: { trapSpots: {
    t1: { waterTrap: { placedAt: NOW - 3_600_000, readyAt: NOW + 3_600_000, caught: { "Blue Crab": 1 } } },
    t2: { waterTrap: { readyAt: NOW - 1, caught: { Isopod: 2 } } },
  } } };
  const m = crabTraps.glanceModel({ farm }, CTX);
  assert.deepStrictEqual(m.head, { value: "Ready", tone: "ok", hero: "<i>Isopod</i>", ring: 100, ringTone: "ok", cap: "Isopod · 1 of 2 ready" });
  assert.strictEqual(m.items.length, 2);
  assert.deepStrictEqual(m.items[1], { icon: "<i>Blue Crab</i>", name: "1× Blue Crab", at: NOW + 3_600_000, pct: 50 }, "a live countdown");
  assert.deepStrictEqual(m.tiles.map((t) => [t.label, t.value]), [["ready", 1], ["in traps", 1], ["next", "60m"]]);
  assert.match(renderLook(m, "number").html, /<div class="gx-num g-ok(?: gx-num-long)?">Ready<\/div><div class="gx-cap">Isopod · 1 of 2 ready<\/div>/);
  assert.strictEqual((renderLook(m, "list-4").html.match(/class="gx-row"/g) || []).length, 2);
  assert.strictEqual(crabTraps.look, "next");
  assert.ok(looksFor(m).length >= 3);
  assert.deepStrictEqual(crabTraps.glanceModel({}, CTX), { empty: "No farm data." });
  assert.strictEqual(crabTraps.glance, undefined, "the hand-written face is gone");
});

test("📱 glance model, crafting box: the whole queue as icons with the time under each (its natural look); idle says so", () => {
  const farm = { craftingBox: { status: "crafting", queue: [
    { name: "Wooly Doll", readyAt: NOW + 3_600_000, startedAt: NOW - 3_600_000 },
    { name: "Bear Doll", readyAt: NOW + 7_200_000, startedAt: NOW + 3_600_000 },
    { name: "Doll", readyAt: NOW - 1, startedAt: NOW - 100_000 },
  ] } };
  const m = craftingBox.glanceModel({ farm }, CTX);
  assert.strictEqual(craftingBox.look, "icons-1", "its natural look: the queue as icons");
  assert.deepStrictEqual([m.head.value, m.head.cap, m.head.ring], ["Ready", "Doll · 1 of 3 ready", 100]);
  assert.deepStrictEqual(m.items.map((i) => [i.name, i.at, i.pct]), [["Doll", NOW - 1, 100], ["Wooly Doll", NOW + 3_600_000, 50], ["Bear Doll", NOW + 7_200_000, 0]]);
  assert.deepStrictEqual(m.tiles.map((t) => [t.label, t.value]), [["ready", 1], ["crafting", 2], ["next", "60m"], ["all done in", "120m"]]);
  assert.strictEqual(m.foot, "1 ready · 2 crafting");
  const icons = renderLook(m, "icons-1", { now: NOW }).html;
  for (const n of ["Doll", "Wooly Doll", "Bear Doll"]) assert.ok(icons.includes(`<i>${n}</i>`), n);
  assert.match(icons, /<small class="gx-tag g-ok"><span class="g-at" data-at="\d+">Ready<\/span><\/small>/);
  assert.match(icons, /<small class="gx-tag g-info"><span class="g-at" data-at="\d+">2h 0m<\/span><\/small>/);
  assert.ok(m.items.filter((i) => i.pct != null).length >= 2, "progress per job (bars)");
  assert.ok(looksFor(m).length >= 3);
  // an older farm's single item: no start time → no progress, no ring
  const old = craftingBox.glanceModel({ farm: { craftingBox: { status: "crafting", readyAt: NOW + 120_000, item: { collectible: "Doll" } } } }, CTX);
  assert.deepStrictEqual([old.head.value, old.head.ring, old.items[0].pct], ["2m", undefined, undefined]);
  // a queued job with no time yet goes after the timed ones; the head stays the soonest timed one
  const q = craftingBox.glanceModel({ farm: { craftingBox: { status: "crafting", queue: [{ name: "Bear Doll" }, { name: "Wooly Doll", readyAt: NOW + 3_600_000, startedAt: NOW - 3_600_000 }] } } }, CTX);
  assert.deepStrictEqual(q.items.map((i) => i.name), ["Wooly Doll", "Bear Doll"]);
  assert.strictEqual(q.head.value, "60m");
  assert.deepStrictEqual(craftingBox.glanceModel({ farm: {} }, CTX), { empty: "The crafting box is idle right now." });
});
