import { test } from "node:test";
import assert from "node:assert";
import { levelingInputsWithBook } from "../../core/sections/leveling.mjs";

// The LEVELING inputs plus the marketplace book: bids for every item, floors only where the boost
// catalogue has none, bud floors/bids by type. The page and the ladder widget both build them here.

test("bids from the book; a floor fills only a missing one; inputs are not mutated", () => {
  const inputs = { freePoints: 3, floors: { A: 5 } };
  const book = { A: { f: 9, b: 4 }, B: { f: 2, b: 1 }, C: { f: 0, b: 0 } };
  const out = levelingInputsWithBook(inputs, book);
  assert.deepStrictEqual(out.bids, { A: 4, B: 1 });
  assert.deepStrictEqual(out.floors, { A: 5, B: 2 });
  assert.strictEqual(out.freePoints, 3);
  assert.deepStrictEqual(inputs, { freePoints: 3, floors: { A: 5 } });
  assert.deepStrictEqual(out.budFloors, {});
  assert.deepStrictEqual(out.budBids, {});
});

test("no book: empty bids, the catalogue floors as they were", () => {
  const out = levelingInputsWithBook({ floors: { A: 5 } }, null);
  assert.deepStrictEqual(out.bids, {});
  assert.deepStrictEqual(out.floors, { A: 5 });
});
