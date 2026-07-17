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
