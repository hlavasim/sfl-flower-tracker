import { test } from "node:test";
import assert from "node:assert";
import { compact, SIZES } from "../../ui/glance.mjs";

// The number formatting the glance models use (the looks are ui/glance-templates.mjs).

test("compact numbers: 142,474 → 142k, 1,712,000 → 1.7M, 87.67 → 87.7, 5 → 5", () => {
  assert.strictEqual(compact(142474), "142k");
  assert.strictEqual(compact(1712000), "1.7M");
  assert.strictEqual(compact(53712), "53.7k");
  assert.strictEqual(compact(87.67), "87.7");
  assert.strictEqual(compact(5), "5");
  assert.strictEqual(compact(-2500), "−2.5k");
  assert.strictEqual(compact(null), "—");
});

test("the W×H size names a v2 board copy may have saved", () => {
  assert.deepStrictEqual(SIZES, ["1x1", "2x1", "1x2", "2x2", "4x1", "1x4", "4x2", "2x4"]);
});
