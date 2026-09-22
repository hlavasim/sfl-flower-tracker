// The one parser for the item keys of the community marketplaceActivity feed
// (`reports[day].items`), shared by every Azure collector that reads it.
//
// Keys come in two shapes:
//   "collectibles-601", "wearables-12", "buds-933", "pets-4"   → { collection, id }
//   "economies-{slug}-{id}"  (community economies; the slug may itself contain dashes)
// Both split on the LAST dash, so a community economy lands as collection "economies-{slug}".
// The id must be all digits: "collectibles-12abc" is rejected rather than read as 12, which is
// what parseInt alone would do.
//
// api/marketplace-orderbook.js carries the same function for the Vercel runtime (a CommonJS
// module cannot be imported from there without the bundling trouble described in that file);
// tests/api/market-key.test.mjs asserts the two agree on every key shape.
function parseItemKey(key) {
  const s = String(key == null ? "" : key);
  const dash = s.lastIndexOf("-");
  if (dash <= 0) return null;
  const idPart = s.slice(dash + 1);
  if (!/^\d+$/.test(idPart)) return null;
  return { collection: s.slice(0, dash), id: parseInt(idPart, 10) };
}

module.exports = { parseItemKey };
