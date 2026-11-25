import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { crustaceanCost, waterTraps } from "../../core/engine/crustaceans.mjs";

// One crustacean price for LEVELING and FISHING: pot + the cheaper bought chum; a Fish Market chum
// handed back as `made`.
const farm = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url))).farm;
const P = { "Crab Pot": 0.3, "Mariner Pot": 0.8, "Heart Leaf": 0.5, Ribbon: 0.2, Crimstone: 0.7 };
const price = (n) => P[n] || 0;

test("pot + the cheaper chum (Blue Crab: Ribbon ×3 beats Heart Leaf ×3)", () => {
  const c = crustaceanCost("Blue Crab", price);
  assert.equal(c.chum.name, "Ribbon");
  assert.ok(Math.abs(c.cost - (0.3 + 0.6)) < 1e-9);
  assert.equal(c.hours, 4);
});

test("no chum: the pot alone (Barnacle, Mariner Pot 8 h)", () => {
  const c = crustaceanCost("Barnacle", price);
  assert.equal(c.chum, null);
  assert.equal(c.cost, 0.8);
  assert.equal(c.hours, 8);
});

test("a Fish Market chum is handed back unpriced (Oyster: 2 Fish Stick)", () => {
  const c = crustaceanCost("Oyster", price);
  assert.deepEqual(c.made, { name: "Fish Stick", qty: 2 });
  assert.equal(c.cost, 0.3);
});

test("traps: the farm's spots; a Royal Crab Pot keeps the pot; Speed Trap shortens the time", () => {
  assert.equal(waterTraps(farm).spots, 4);
  const c = crustaceanCost("Shrimp", price, { spots: 4, timeMult: 0.8, freePots: true });
  assert.equal(c.potCost, 0);
  assert.ok(Math.abs(c.cost - 1.4) < 1e-9);
  assert.ok(Math.abs(c.hours - 3.2) < 1e-9);
  assert.equal(crustaceanCost("Anchovy", price), null);
});
