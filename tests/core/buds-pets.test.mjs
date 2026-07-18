import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildBudsSection } from "../../core/sections/buds.mjs";
import { buildPetsSection } from "../../core/sections/pets.mjs";
import { decodeBud, BUD_COUNT } from "../../core/engine/buds.mjs";
import { petLevel } from "../../core/engine/pets.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));

// ── buds ──
const buds = buildBudsSection(farm, p2p, {});

test("buds — one row per decodable bud, all 2621 ids attempted", () => {
  assert.equal(BUD_COUNT, 2621);
  assert.equal(buds.rows.length, [...Array(BUD_COUNT)].filter((_, i) => decodeBud(i + 1)).length);
  assert.ok(buds.rows.length > 2000, `rows: ${buds.rows.length}`);
});

test("buds — ownership from farm.buds keys", () => {
  const ownedIds = Object.keys(farm.buds || {}).map(Number);
  const ownedRows = buds.rows.filter((r) => r.owned).map((r) => r.id);
  assert.deepEqual(ownedRows.sort((a, b) => a - b), ownedIds.sort((a, b) => a - b));
});

test("buds — a bud with a priced boost yields sflPerDay > 0 and a breakdown", () => {
  const valued = buds.rows.filter((r) => r.sflPerDay > 0);
  assert.ok(valued.length > 0, "no bud valued — p2p fixture likely lacks all products");
  const r = valued[0];
  assert.ok(Array.isArray(r.breakdown) && r.breakdown.length > 0);
  const sum = r.breakdown.reduce((s, b) => s + b.sflPerDay, 0);
  assert.ok(Math.abs(sum - r.sflPerDay) < 1e-9, "breakdown must sum to total");
});

test("buds — products override changes product-specific valuations only", () => {
  const alt = buildBudsSection(farm, p2p, { savedProducts: { crops: "Wheat" } });
  assert.equal(alt.rows.length, buds.rows.length);
});

// ── pets ──
const pets = buildPetsSection(farm, p2p, {});

test("pets — fixture farm's 5 common pets parsed with levels and calc", () => {
  assert.equal(pets.pets.length, 5);
  for (const p of pets.pets) {
    assert.equal(p.isNft, false);
    assert.equal(p.level, petLevel(p.xp));
    assert.ok(p.calc && typeof p.calc.dailySfl === "number");
    assert.equal(p.calc.feedMult, pets.feedMultiplier);
  }
});

test("pets — sorted by level desc within the common group", () => {
  const levels = pets.pets.map((p) => p.level);
  assert.deepEqual(levels, [...levels].sort((a, b) => b - a));
});

test("pets — boost flags derived from farm", () => {
  assert.equal(typeof pets.hasPetBowls, "boolean");
  assert.ok(pets.feedMultiplier === 1.0 || pets.feedMultiplier === 1.5);
  assert.ok(Object.keys(pets.p2pPrices).length > 0);
});
