import { test } from "node:test";
import assert from "node:assert";
import { agingNow, baitCommonIngredient } from "../../core/engine/aging-now.mjs";
import { getAgingMaxXP, getAgingSaltCost, FISH_BASE_XP } from "../../core/data/cooking.mjs";

// "What do I put in the Aging Shed now": fish no Fish Market recipe wants first, then the surplus of
// a recipe fish beyond twice what its scarcest partner can match, then (only when no baits are
// being made) the rest of the recipe fish.
const pick = (rows, name, group) => rows.find((r) => r.name === name && (!group || r.group === group));

test("the common ingredient of a bait is the one in every season's recipe", () => {
  assert.equal(baitCommonIngredient("Fish Flake"), "Anchovy");
  assert.equal(baitCommonIngredient("Fish Oil"), "Tuna");
  assert.equal(baitCommonIngredient("Crab Stick"), "Crab");
});

test("a fish no recipe wants is free: all of it goes in", () => {
  const rows = agingNow({ owned: { "Rock Blackfish": 12 } });
  const r = pick(rows, "Rock Blackfish");
  assert.equal(r.group, "free");
  assert.equal(r.age, 12);
  assert.equal(r.salt, 12 * getAgingSaltCost(FISH_BASE_XP["Rock Blackfish"]));
});

test("250 Halibut against 50 Muskellunge: keep 100 (2 × the 50 they match), age 150; Muskellunge stays", () => {
  const rows = agingNow({ owned: { Halibut: 250, Muskellunge: 50 } });
  const h = pick(rows, "Halibut", "surplus");
  assert.equal(h.age, 150);
  assert.equal(h.keep, 100);
  assert.equal(h.partner, "Muskellunge");
  assert.equal(pick(rows, "Muskellunge", "surplus"), undefined);
});

test("the common one (Anchovy) keeps 2 × what the hard ones can make, and never limits them", () => {
  const rows = agingNow({ owned: { Anchovy: 300, Halibut: 60, Muskellunge: 50 } });
  // autumn Fish Flake: 4 Anchovy + 2 Halibut + 2 Muskellunge → 25 makeable → keep 2 × 100
  assert.equal(pick(rows, "Anchovy", "surplus").age, 100);
  // Halibut keeps 2 × 50, not limited by Anchovy
  assert.equal(pick(rows, "Halibut", "surplus"), undefined);
});

test("no baits being made: the kept recipe fish are listed last, as group bait", () => {
  const rows = agingNow({ owned: { Halibut: 250, Muskellunge: 50, "Rock Blackfish": 3 }, baitsWanted: false });
  assert.deepEqual([...new Set(rows.map((r) => r.group))], ["free", "surplus", "bait"]);
  assert.equal(pick(rows, "Halibut", "bait").age, 100);
  assert.equal(pick(rows, "Muskellunge", "bait").age, 50);
});

test("within a group, the most XP gained over eating raw per salt first", () => {
  const rows = agingNow({ owned: { "Rock Blackfish": 5, "White Shark": 1, "Trout": 2 } }).filter((r) => r.group === "free");
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].gainPerSalt >= rows[i].gainPerSalt - 1e-9);
  const ws = pick(rows, "White Shark");
  const base = FISH_BASE_XP["White Shark"];
  assert.ok(Math.abs(ws.gainPerSalt - (getAgingMaxXP(base) - base) / getAgingSaltCost(base)) < 1e-9);
});

test("inventory keys in the game's spelling (Hammerhead shark) still match", () => {
  const rows = agingNow({ owned: { "Hammerhead shark": 4 } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].age, 4);
});
