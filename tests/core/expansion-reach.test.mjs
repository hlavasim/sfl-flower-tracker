// Pins the two things that are easy to get wrong about the expansion-reach metric:
// the gating rules (via a real-farm anchor) and the numeric slot ordering.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { computeReach, decodeSlot, encodeSlot } =
  require("../../azure-functions/shared/expansion-reach.js");

/**
 * Anchor: farm 155498's real live state, read from the API on 2026-07-27 (values below
 * are verbatim, not invented). It sits at Volcano-30 and the owner expected a reach of
 * A1-40. That figure is what fixes the gating rules — gating every resource plus coins
 * yields A1-37, gating Oil/Gem/Sunstone plus coins yields A1-38, and gating Oil +
 * Obsidian with coins ignored yields A1-40. Any change to GATING_RESOURCES or
 * GATE_COINS that breaks this test is changing what the metric means.
 */
const FARM_155498 = {
  island: { type: "volcano", previousExpansions: 25, sunstones: 6 },
  coins: 230633.8468749997,
  bumpkin: { experience: 179301665 },
  inventory: {
    "Basic Land": "30",
    Oil: "1935.0131743333386759",
    Obsidian: "119.76",
    Crimstone: "179.9",
    Gem: "51519",
    Sunstone: "2",
  },
};

test("reach anchor — farm 155498 sits at Volcano-30 and reaches A1-40", () => {
  const r = computeReach(FARM_155498);
  assert.equal(decodeSlot(r.startSlot).label, "Volcano-30");
  assert.equal(decodeSlot(r.slot).label, "A1-40");
  assert.equal(r.blockedBy, "resources", "should run out of Oil, not level or coins");
});

test("coins do not gate — a farm with almost no coins still reaches A1-40", () => {
  const broke = { ...FARM_155498, coins: 1 };
  assert.equal(decodeSlot(computeReach(broke).slot).label, "A1-40");
});

test("buyable resources do not gate — zeroing Crimstone and Gem changes nothing", () => {
  const noBuyables = {
    ...FARM_155498,
    inventory: { ...FARM_155498.inventory, Crimstone: "0", Gem: "0", Sunstone: "0" },
  };
  assert.equal(decodeSlot(computeReach(noBuyables).slot).label, "A1-40");
});

test("Obsidian does gate — zeroing it stops the reach short", () => {
  const noObsidian = { ...FARM_155498, inventory: { ...FARM_155498.inventory, Obsidian: "0" } };
  const d = decodeSlot(computeReach(noObsidian).slot);
  assert.ok(d.expansions < 40 || d.ascension === 0,
    `Obsidian is a gating resource, reach should shorten, got ${d.label}`);
});

test("Oil does gate — halving it shortens the reach", () => {
  const lessOil = { ...FARM_155498, inventory: { ...FARM_155498.inventory, Oil: "300" } };
  const r = computeReach(lessOil);
  const d = decodeSlot(r.slot);
  assert.equal(d.ascension, 1);
  assert.ok(d.expansions < 40, `expected fewer than 40 expansions, got ${d.expansions}`);
});

test("level gates — no XP means no ascension at all", () => {
  const noXp = { ...FARM_155498, bumpkin: { experience: 0 } };
  const d = decodeSlot(computeReach(noXp).slot);
  assert.equal(d.ascension, 0, "a level-1 bumpkin must not ascend");
});

test("banked food XP counts toward the level", () => {
  // Enough Pumpkin Soup (24 xp each) to matter, on a farm that is otherwise level 1.
  const base = { island: { type: "basic" }, coins: 0, bumpkin: { experience: 0 },
                 inventory: { "Basic Land": "4", Oil: "0" } };
  const withFood = { ...base, inventory: { ...base.inventory, "Pumpkin Soup": "5000" } };
  const a = computeReach(base), b = computeReach(withFood);
  assert.ok(b.slot > a.slot, `banked food should extend reach: ${a.slot} -> ${b.slot}`);
});

test("slots sort NUMERICALLY through the island chain and ascensions", () => {
  // The whole reason reach is stored as an integer: sorting the labels as text puts
  // "A1-10" before "A1-2" and "Spring-9" after "Spring-16".
  const ordered = [
    encodeSlot("basic", 0, 4),
    encodeSlot("basic", 0, 9),
    encodeSlot("spring", 0, 4),
    encodeSlot("spring", 0, 16),
    encodeSlot("desert", 0, 25),
    encodeSlot("volcano", 0, 30),
    encodeSlot("swamp", 1, 31),
    encodeSlot("swamp", 1, 42),
    encodeSlot("swamp", 2, 31),
    encodeSlot("swamp", 10, 42),
  ];
  const sorted = [...ordered].sort((x, y) => x - y);
  assert.deepEqual(sorted, ordered, "numeric sort must preserve progression order");

  const labels = ordered.map((s) => decodeSlot(s).label);
  assert.deepEqual(labels, [
    "Basic-4", "Basic-9", "Spring-4", "Spring-16", "Desert-25",
    "Volcano-30", "A1-31", "A1-42", "A2-31", "A10-42",
  ]);

  // And prove the text sort really would be wrong, so this test keeps its point.
  const textSorted = [...labels].sort();
  assert.notDeepEqual(textSorted, labels, "text sort is expected to differ");
});

test("encode/decode round-trips", () => {
  for (const [island, a, e] of [["basic", 0, 5], ["volcano", 0, 30], ["swamp", 3, 37]]) {
    const d = decodeSlot(encodeSlot(island, a, e));
    assert.equal(d.expansions, e);
    assert.equal(d.ascension, a);
  }
});
