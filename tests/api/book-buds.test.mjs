// The offer book (?book=1) names buds "Bud #<id>".
//
// Buds are 1-of-1 NFTs with no catalogue name, so the book used to drop every "buds-<id>" feed
// key — and with it the owner's offer on a bud: the roadmap's OFFER column showed "—" and the
// offer watcher could not resolve the item. Revert check: without the buds branch the first
// assertion gets null.
import test from "node:test";
import assert from "node:assert/strict";
import { bookItemName, parseItemKey } from "../../api/marketplace-orderbook.js";

test("a bud feed key gets the name the farm's offer uses", () => {
  assert.equal(bookItemName(parseItemKey("buds-1639")), "Bud #1639");
});

test("catalogue items keep their catalogue name; unknown ones drop out", () => {
  assert.equal(bookItemName(parseItemKey("collectibles-101")), "Sunflower Seed");
  assert.equal(bookItemName(parseItemKey("wearables-1")), "Beige Farmer Potion");
  assert.equal(bookItemName(parseItemKey("economies-foo-3")), null);
  assert.equal(bookItemName(null), null);
});
