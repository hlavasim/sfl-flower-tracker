import { test } from "node:test";
import assert from "node:assert";
import { _setPowerContext, roadmapOwnedEffects } from "../../core/engine/roadmap.mjs";

/*
 * roadmapOwnedEffects is memoised per power context (it was ~40 % of the roadmap's CPU). The memo
 * must never outlive the context it was built for, and a caller extending the array it gets back
 * must not change what the next caller sees.
 */
const ctx = (items) => ({ farm: {}, boostItems: items });
const item = (name, has, value) => ({ name, has, isDisabled: false, effects: [{ type: "yield_flat", cat: "iron", value }] });

test("a new context drops the memo of the previous one", () => {
  _setPowerContext(ctx([item("A", true, 0.1)]));
  assert.deepEqual(roadmapOwnedEffects("iron").map((e) => e.value), [0.1]);
  _setPowerContext(ctx([item("A", true, 0.1), item("B", true, 0.5)]));
  assert.deepEqual(roadmapOwnedEffects("iron").map((e) => e.value), [0.1, 0.5]);
});

test("the returned array is a copy: extending it does not leak into the memo", () => {
  _setPowerContext(ctx([item("A", true, 0.1), item("C", false, 9)]));
  const first = roadmapOwnedEffects("iron");
  first.push({ type: "yield_flat", cat: "iron", value: 99 });
  assert.deepEqual(roadmapOwnedEffects("iron").map((e) => e.value), [0.1], "unowned C and the pushed effect stay out");
});
