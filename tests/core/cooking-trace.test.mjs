import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildCookingSection } from "../../core/sections/cooking.mjs";
import { computeFoodXP, computeCookTime } from "../../core/engine/cooking.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));

// ---------------------------------------------------------------------------
// engine: computeFoodXP / computeCookTime trace sinks — hand-computed formula
// pins over synthetic boosts (an independent source, not the engine's own output)
// ---------------------------------------------------------------------------

test("computeFoodXP trace pins the base × boosts formula and the value", () => {
  const food = { xp: 100 };
  const boosts = { xpBoosts: [{ name: "Munching Mastery", multiplier: 1.05 }, { name: "Pan", multiplier: 1.25 }], timeBoosts: [] };
  const trace = [];
  const xp = computeFoodXP("Test Food", food, "Fire Pit", boosts, trace);
  assert.equal(xp, 100 * 1.05 * 1.25);                     // 131.25 — hand-computed
  assert.equal(trace.length, 1);
  assert.equal(trace[0].item, "Test Food");
  assert.equal(trace[0].value, 131.25);
  assert.equal(trace[0].unit, "XP");
  assert.equal(trace[0].formula, "100 base × 1.05 (Munching Mastery) × 1.25 (Pan)");
  assert.equal(trace[0].steps.length, 3);                  // base + 2 boosts
});

test("computeFoodXP trace skips building-excluded and ×1 informational boosts", () => {
  const food = { xp: 100 };
  const boosts = { xpBoosts: [
    { name: "Grain Grinder", multiplier: 1.2, buildings: ["Bakery"] },   // excluded for a Fire Pit food
    { name: "Wide Rakes", multiplier: 1, salt: true },                    // ×1 no-op (informational)
    { name: "Pan", multiplier: 1.25 },
  ], timeBoosts: [] };
  const trace = [];
  const xp = computeFoodXP("Test", food, "Fire Pit", boosts, trace);
  assert.equal(xp, 100 * 1.25);
  assert.equal(trace[0].formula, "100 base × 1.25 (Pan)");  // Grain Grinder excluded, Wide Rakes ×1 skipped
});

test("computeFoodXP is inert when no trace sink is passed (value unchanged)", () => {
  const food = { xp: 100 };
  const boosts = { xpBoosts: [{ name: "Pan", multiplier: 1.25 }], timeBoosts: [] };
  assert.equal(computeFoodXP("T", food, "Fire Pit", boosts), computeFoodXP("T", food, "Fire Pit", boosts, undefined));
});

test("computeCookTime trace pins base seconds × time boosts", () => {
  const boosts = { xpBoosts: [], timeBoosts: [{ name: "Fast Feasts", multiplier: 0.9, buildings: ["Fire Pit"] }] };
  const trace = [];
  const time = computeCookTime(3600, "Fire Pit", boosts, trace);
  assert.equal(time, 3600 * 0.9);                          // 3240
  assert.equal(trace[0].item, "cook time");
  assert.equal(trace[0].value, 3240);
  assert.equal(trace[0].formula, "3600s base × 0.9 (Fast Feasts)");
});

// ---------------------------------------------------------------------------
// section: cookingTrace — opt-in, and its top value can't lie about xpPerDay
// ---------------------------------------------------------------------------

test("explain attaches a cookingTrace whose top value equals each building's xpPerDay", () => {
  const plain = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  const explained = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true, explain: true });
  assert.ok(explained.cookingTrace, "cookingTrace present when explain");
  let checked = 0;
  for (const [bd, b] of Object.entries(plain.buildings)) {
    if (!b.xpPerDay) continue;
    const node = explained.cookingTrace[bd];
    assert.ok(node, `trace for ${bd}`);
    // value can't lie: the trace's top value rounds to the same displayed xpPerDay
    assert.ok(Math.abs(Math.round(node.value * 1000) / 1000 - b.xpPerDay) < 1e-6, `${bd}: trace ${node.value} vs ${b.xpPerDay}`);
    assert.equal(node.steps.length, 3, `${bd}: xp/cook, cook time, cooks/day`);
    checked++;
  }
  assert.ok(checked >= 5, `expected the main buildings traced, only ${checked}`);
});

test("cooking payload is unchanged when explain is absent (no cookingTrace key)", () => {
  const plain = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true });
  assert.equal(plain.cookingTrace, undefined, "no cookingTrace without explain");
  assert.ok(Math.abs(plain.buildings["Fire Pit"].xpPerDay - 232509.80) < 1);  // ground truth intact
});

test("Fire Pit trace: xp/cook × cooks/day multiplies out to its xpPerDay", () => {
  const p = buildCookingSection(farm, {}, { savedRecipes: {}, petSimulate: true, explain: true });
  const node = p.cookingTrace["Fire Pit"];
  const xpNode = node.steps[0], timeNode = node.steps[1], cooksNode = node.steps[2];
  assert.equal(xpNode.method, "food xp");
  assert.equal(cooksNode.item, "cooks/day");
  assert.ok(Math.abs(xpNode.value * cooksNode.value - node.value) < 1e-6, "xp/cook × cooks/day = xp/day");
  // units label each node so a shared renderer shows the right suffix (not "SFL")
  assert.equal(node.unit, "XP/day");
  assert.equal(xpNode.unit, "XP");
  assert.equal(timeNode.unit, "s");
  assert.equal(cooksNode.unit, "cooks/day");
});
