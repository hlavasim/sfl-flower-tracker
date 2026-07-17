import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildItemUniverse } from "../../core/sections/prices.mjs";

// core/engine/item-value.mjs's itemMarketValue/itemProductionCost price some items
// through hardcoded `itemName === "X"` branches that have no data-table backing at
// all (Barn Delight, Love Charm, Omnifeed, Mark, Acorn, Salt). buildItemUniverse
// (core/sections/prices.mjs) unions Object.keys() of the data tables + COMPOST_RECIPES
// outputs + the live p2p keys — none of which ever contain these names on their own
// merits, so they were silently absent from /api/compute?section=prices even though
// the resolvers can price them (task-F2-1d-fix-report.md).
//
// F2-1d's own browser gate built its comparison universe the same table-keys-only way
// and inherited the identical blind spot, so it reported 0 mismatches while never
// testing these names. A gate that shares the code's blind spot proves nothing — so
// this test does NOT trust a hand-copied list of the branch names either. It re-derives
// them straight from item-value.mjs's source by regex, the same technique
// tests/core/typeof-guards.test.mjs and tests/api/api-spec.test.mjs use to keep two
// independently-written lists from drifting apart.

const SRC = readFileSync(new URL("../../core/engine/item-value.mjs", import.meta.url), "utf8");

function hardcodedBranchNames(src) {
  return [...new Set([...src.matchAll(/itemName\s*===\s*"([^"]+)"/g)].map((m) => m[1]))];
}

test("the regex still finds item-value.mjs's known hardcoded-branch names (sanity)", () => {
  const names = hardcodedBranchNames(SRC);
  assert.ok(names.length > 0,
    "found no `itemName === \"...\"` literals in item-value.mjs — has the pattern changed? " +
    "update the regex in this test rather than deleting it");
  // Known as of this writing. New branches are fine — the next test is what actually
  // enforces they're in the universe. This just guards against the regex silently
  // stopping to match (e.g. someone reformats to `itemName == "X"` or `"X" === itemName`).
  for (const known of ["Barn Delight", "Love Charm", "Omnifeed", "Mark", "Acorn", "Salt"]) {
    assert.ok(names.includes(known), `expected to find itemName === "${known}" in item-value.mjs — did it move or get renamed?`);
  }
});

test("every itemName === \"...\" branch in item-value.mjs is in the price universe", () => {
  // Empty p2p on purpose: a name must be in the universe on its own merits, not because
  // the live market happens to also trade it. Salt priced correctly before this fix only
  // because the test fixture's p2p data happens to include "Salt" — a farm/market snapshot
  // without a Salt trading pair would have silently dropped it, same as the other five.
  const universe = buildItemUniverse({});
  const branchNames = hardcodedBranchNames(SRC);
  const missing = branchNames.filter((n) => !universe.has(n));
  assert.deepEqual(missing, [],
    "these itemName === \"...\" branches in item-value.mjs have no table backing and are " +
    `missing from buildItemUniverse: ${missing.join(", ")}. Add them to HARDCODED_BRANCH_ITEM_NAMES ` +
    "in core/sections/prices.mjs.");
});

// Absence from the universe is the bug this file guards against. Absence from the FINAL
// map (marketValue/productionCost) after being IN the universe is not a bug — it means the
// resolver legitimately could not price the item under these settings (e.g. Omnifeed needs
// a gemsPerSFL rate this test doesn't supply). This test pins that distinction stays visible:
// Omnifeed must be considered (in the universe) even though it resolves to unpriceable here.
test("a hardcoded-branch item that resolves to unpriceable is still considered, just absent from the map", () => {
  const universe = buildItemUniverse({});
  assert.ok(universe.has("Omnifeed"), "Omnifeed must be in the universe even when it prices to 0/absent");
});
