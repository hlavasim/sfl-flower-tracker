import { test } from "node:test";
import assert from "node:assert";
import { parseBoostEffects, classifyToCategories } from "../../core/engine/power-boosts.mjs";

// Verbatim extraction of flowers.html's boost-text parser. These pin the parse output for a
// few known boost strings so a drift in the extracted rules is caught.

test("percent yield boost on a resource → yield_pct in that category", () => {
  const e = parseBoostEffects("+10% Wood", "X");
  assert.equal(e.length, 1);
  assert.equal(e[0].cat, "trees");
  assert.equal(e[0].type, "yield_pct");
  assert.equal(e[0].value, 10);
  assert.equal(e[0].product, "Wood");
  assert.deepEqual(classifyToCategories(e), ["trees"]);
});

test("flat yield boost on a resource → yield_flat", () => {
  const e = parseBoostEffects("+0.1 Wood", "X");
  assert.equal(e[0].cat, "trees");
  assert.equal(e[0].type, "yield_flat");
  assert.equal(e[0].value, 0.1);
});

test("a non-resource buff (Bumpkin XP) is not miscategorised as a yield", () => {
  const e = parseBoostEffects("+25% Bumpkin XP", "X");
  assert.ok(e.every((x) => x.type !== "yield_pct" && x.type !== "yield_flat"));
});

test("empty boost text → no effects", () => {
  assert.deepEqual(parseBoostEffects("", "X"), []);
  assert.deepEqual(parseBoostEffects(null, "X"), []);
});

test("classifyToCategories defaults to 'other' when nothing categorised", () => {
  assert.deepEqual(classifyToCategories([{ type: "qualitative", raw: "x" }]), ["other"]);
});

/*
 * "-50% Oil Regeneration Time" (Dev Wrench, floor ~8,300 FLOWER).
 *
 * The rule only listed refill/recovery/respawn, but `regeneration` is the wording sfl.world
 * actually ships — and the only one it uses after "Oil … time", so the rule matched nothing
 * in the live feed. Dev Wrench fell through to the generic "N% <Product>" rule and parsed as
 * yield_pct -50: HALF the oil, from a boost that halves the regeneration TIME. On the fixture
 * farm that inverted its value from +11.26 to -0.47 FLOWER/day.
 */
test("oil regeneration time is a SPEED boost, not a yield cut", () => {
  const e = parseBoostEffects("-50% Oil Regeneration Time", "Dev Wrench");
  assert.equal(e.length, 1);
  assert.equal(e[0].cat, "oil");
  assert.equal(e[0].type, "speed_pct", `parsed as ${e[0].type} — a yield_pct here halves the oil instead of the timer`);
  assert.equal(e[0].value, -50);
  assert.deepEqual(classifyToCategories(e), ["oil"]);
});

test("the older refill/recovery/respawn wordings still parse the same way", () => {
  // Widening the rule must not have cost it the strings it already handled.
  for (const txt of ["-20% Oil refill time", "-25% Oil recovery time", "-30% Oil respawn time"]) {
    const e = parseBoostEffects(txt, "X");
    assert.equal(e[0].type, "speed_pct", txt);
    assert.equal(e[0].cat, "oil", txt);
  }
  // And the multiplier form, which shares the same alternation.
  const m = parseBoostEffects("×0.5 Oil Regeneration Time", "X");
  assert.equal(m[0].type, "speed_mult");
  assert.equal(m[0].value, 0.5);
});

test("array-returning parse rules FLATTEN — Healthy Livestock carries three real effects", () => {
  // The sickness rule returns an array (one effect per animal cat); it used to be pushed as a
  // single nested element, so every `e.type` filter missed it and the skill valued 0 everywhere.
  const eff = parseBoostEffects("-50% chance of sickness");
  assert.equal(eff.length, 3);
  for (const e of eff) { assert.equal(e.type, "sickness_reduction"); assert.equal(e.value, 0.5); }
  assert.deepEqual(eff.map((e) => e.cat).sort(), ["chickens", "cows", "sheep"]);
});

test("a p% chance of instant growth is -p% expected recovery time, not qualitative", () => {
  const tt = parseBoostEffects("15% chance trees grow instantly");
  assert.equal(tt.length, 1);
  assert.equal(tt[0].type, "speed_pct");
  assert.equal(tt[0].value, -15);
  assert.equal(tt[0].cat, "trees");
});
