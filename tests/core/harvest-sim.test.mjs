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

// Oil and Obsidian are used, not sold: the widget prices an oil drill and a lava pit by what they use up.
test("an oil drill uses up its Oil Drill, a lava pit lists its relight cost", async () => {
  const r = await simulateHarvests(farm, 155498, NOW);
  const oil = r.filter((h) => h.kind === "oil");
  assert.ok(oil.length > 0 && oil.every((h) => h.spent && h.spent["Oil Drill"] >= 1), "every drill spends a drill");
  const lava = r.filter((h) => h.kind === "lava");
  assert.ok(lava.length > 0, "lava pits listed");
  // The fixture's autumn requirements at Lava Swimwear's x0.5 (the game's getLavaPitRequirements).
  assert.deepEqual(lava[0].spent, { Artichoke: 15, Broccoli: 375, Yam: 500, Gold: 2.5, Crimstone: 3 });
  assert.ok(lava[0].gains.Obsidian > 0);
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

/*
 * The widget's per-kind cache (api/compute.mjs cachedHarvests): a kind is replayed alone and its
 * cached rows are reused while its inputs are unchanged. That rests on three things pinned here.
 * (Checked further, outside the suite, on 81 archived farms over three days: 1,944 kind pairs with
 * equal inputs gave equal rows, and rows held to their valid-until matched a later replay.)
 */
import { harvestCacheInputs, harvestCacheValidUntil, HARVEST_KINDS, READY_TTL_MS } from "../../core/engine/harvest-sim.mjs";

test("a kind replayed on its own gives the same rows as the full replay", async () => {
  const all = await simulateHarvests(farm, 155498, NOW);
  for (const kinds of [["tree"], ["crop", "animal"], ["stone", "iron", "gold", "lava"]]) {
    const part = await simulateHarvests(farm, 155498, NOW, { kinds });
    assert.ok(part.length > 0, kinds.join());
    assert.deepEqual(part, all.filter((h) => kinds.includes(h.kind)), kinds.join());
  }
});

test("a harvest changes its own kind's cache inputs only; pet churn changes none", () => {
  const before = harvestCacheInputs(farm);
  assert.deepEqual(Object.keys(before), HARVEST_KINDS);
  const chopped = structuredClone(farm);
  const treeId = Object.keys(chopped.trees)[0];
  chopped.trees[treeId].wood.choppedAt += 1000;
  const after = harvestCacheInputs(chopped);
  assert.deepEqual(HARVEST_KINDS.filter((k) => before[k] !== after[k]), ["tree"]);
  const fed = structuredClone(farm);
  fed.pets = { common: { Barkley: { energy: 1, requests: { food: ["Pizza"] } } } };
  assert.deepEqual(HARVEST_KINDS.filter((k) => before[k] !== harvestCacheInputs(fed)[k]), []);
  const boosted = structuredClone(farm);
  boosted.bumpkin.equipped = { ...boosted.bumpkin.equipped, hat: "Some Other Hat" };
  assert.deepEqual(HARVEST_KINDS.filter((k) => before[k] === harvestCacheInputs(boosted)[k]), [], "an outfit change resets every kind");
});

test("cached rows last until the kind's first node is ready, a few minutes when one is ready now", () => {
  const now = 1_000_000;
  assert.equal(harvestCacheValidUntil([{ readyAt: now + 7200000 }, { readyAt: now + 3600000 }], now), now + 3600000);
  assert.equal(harvestCacheValidUntil([{ readyAt: now - 5 }, { readyAt: now + 3600000 }], now), now + READY_TTL_MS);
  assert.equal(harvestCacheValidUntil([], now), now + 6 * 3600000);
});
