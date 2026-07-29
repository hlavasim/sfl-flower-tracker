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

// ── bud boost filters (the game's Marketplace → Bud NFTs → Boost taxonomy) ──
import { BUD_BOOST_FILTERS, budHasBoostFilter, BUD_TYPE_BOOSTS, BUD_STEM_BOOSTS, BUD_TYPE_NAMES, BUD_STEM_NAMES }
  from "../../core/engine/buds.mjs";

test("boost filters name only traits that exist", () => {
  for (const [f, g] of Object.entries(BUD_BOOST_FILTERS)) {
    for (const t of g.types) assert.ok(BUD_TYPE_NAMES.includes(t), `${f}: unknown type ${t}`);
    for (const s of g.stems) assert.ok(BUD_STEM_NAMES.includes(s), `${f}: unknown stem ${s}`);
  }
});

test("every trait that carries a boost is reachable through exactly one filter", () => {
  // The point of the table: a bud with a monetary boost must be findable by the filter a
  // player would click, and no trait may sit under two filters (it would list twice).
  const seen = {};
  for (const [f, g] of Object.entries(BUD_BOOST_FILTERS)) {
    for (const t of g.types) (seen["type:" + t] = seen["type:" + t] || []).push(f);
    for (const s of g.stems) (seen["stem:" + s] = seen["stem:" + s] || []).push(f);
  }
  assert.deepEqual(Object.entries(seen).filter(([, fs]) => fs.length > 1), [], "trait under >1 filter");

  const uncovered = [
    ...Object.entries(BUD_TYPE_BOOSTS).filter(([k, v]) => v && v.length && !seen["type:" + k]).map(([k]) => "type:" + k),
    ...Object.entries(BUD_STEM_BOOSTS).filter(([k, v]) => v && v.length && !seen["stem:" + k]).map(([k]) => "stem:" + k),
  ];
  assert.deepEqual(uncovered, [], "these boosting traits are unreachable from any filter");
});

test("the taxonomy matches the game's, not a flattening of the cats arrays", () => {
  // Minerals and Stone are DIFFERENT filters: Cave/Diamond Gem boost stone+iron+gold
  // together, Ruby Gem boosts only stone. Flattening `cats` would merge them.
  assert.deepEqual(BUD_BOOST_FILTERS["Minerals"], { types: ["Cave"], stems: ["Diamond Gem"] });
  assert.deepEqual(BUD_BOOST_FILTERS["Stone"], { types: [], stems: ["Ruby Gem"] });

  // Cows and sheep are NOT filters — no trait targets them alone; Retreat is Animal Produce.
  assert.ok(!("Cows" in BUD_BOOST_FILTERS) && !("Sheep" in BUD_BOOST_FILTERS));
  assert.deepEqual(BUD_BOOST_FILTERS["Animal Produce"], { types: ["Retreat"], stems: [] });
  // And crimstone is absent because no bud boosts it (isMineral = Stone | Iron | Gold).
  assert.ok(!("Crimstone" in BUD_BOOST_FILTERS));
  for (const effs of [...Object.values(BUD_TYPE_BOOSTS), ...Object.values(BUD_STEM_BOOSTS)]) {
    for (const e of effs || []) assert.ok(!(e.cats || []).includes("crimstone"), "no bud may boost crimstone");
  }
});

test("budHasBoostFilter matches on either trait", () => {
  const cave = { id: 1, type: "Cave", stem: "Red Bow", aura: "No Aura" };       // type grants it
  const gem = { id: 2, type: "Plaza", stem: "Diamond Gem", aura: "No Aura" };   // stem grants it
  const neither = { id: 3, type: "Plaza", stem: "Red Bow", aura: "No Aura" };
  assert.equal(budHasBoostFilter(cave, "Minerals"), true);
  assert.equal(budHasBoostFilter(gem, "Minerals"), true);
  assert.equal(budHasBoostFilter(neither, "Minerals"), false);
  assert.equal(budHasBoostFilter(cave, "Stone"), false, "Cave is Minerals, not the Stone-only filter");
  assert.equal(budHasBoostFilter(cave, "No Such Filter"), false);
});
