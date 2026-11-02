import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { simulateHarvests } from "../../core/engine/harvest-sim.mjs";

/*
 * The widget's exact yields: the game's own reducers (core/game-sim/game.bundle.mjs) replayed on a
 * copy of the farm. These pin that every node kind runs through the game without being refused,
 * that the result is deterministic (the game's rolls are seeded — same farm, same numbers), and
 * that harvests are replayed in ready order, since each one moves the counter the next one rolls with.
 */
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const NOW = Date.UTC(2026, 10, 2, 12);

test("every node's next harvest runs through the game's own code", async () => {
  const r = await simulateHarvests(farm, 155498, NOW);
  assert.ok(r.length > 50, `${r.length} harvests`);
  const errors = r.filter((h) => h.amount == null);
  assert.deepEqual(errors.map((e) => `${e.kind} ${e.id}: ${e.error}`), [], "no node refused");
  const kinds = new Set(r.map((h) => h.kind));
  for (const k of ["tree", "stone", "iron", "gold", "crop"]) assert.ok(kinds.has(k), `${k} simulated`);
  assert.ok(r.every((h) => h.amount > 0), "every harvest yields something");
});

test("the rolls are seeded: the same farm gives the same numbers, in ready order", async () => {
  const a = await simulateHarvests(farm, 155498, NOW);
  const b = await simulateHarvests(farm, 155498, NOW);
  assert.deepEqual(a.map((h) => h.amount), b.map((h) => h.amount));
  for (let i = 1; i < a.length; i++) assert.ok(a[i].readyAt >= a[i - 1].readyAt, "replayed in ready order");
  // Another farm id rolls differently somewhere (the farm id seeds the PRNG).
  const c = await simulateHarvests(farm, 155499, NOW);
  assert.notDeepEqual(a.map((h) => h.amount), c.map((h) => h.amount));
});
