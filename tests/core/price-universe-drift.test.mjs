import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildItemUniverse } from "../../core/sections/prices.mjs";
import { SEED_COSTS } from "../../core/data/economy.mjs";

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
  // Match `itemName === "X"`, `itemName === 'X'`, and the reversed `"X" === itemName`.
  // The point of this guard is to catch a NEW branch whose item the universe forgets, so it
  // must not itself be blind to the ordinary ways someone writes that comparison — a
  // single-quote or reversed branch would otherwise re-open the exact hole this test closes.
  const names = new Set();
  for (const m of src.matchAll(/itemName\s*===\s*(['"])([^'"]+)\1/g)) names.add(m[2]);
  for (const m of src.matchAll(/(['"])([^'"]+)\1\s*===\s*itemName/g)) names.add(m[2]);
  return [...names];
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

// A SECOND blind-spot class, found when the dashboard regressed 4 chore costs to 0 (F2-2e):
// the SEED_COSTS branch prices an item passed as "<crop> Seed"/"<crop> Plant" by stripping the
// suffix and reading SEED_COSTS[<crop>]. The base keys are unioned, but the ALIAS forms the
// callers actually pass were not — so the served map lacked them and the lookup read 0. This
// pins that (a) the resolver really does strip exactly these suffixes, re-derived from source
// so the test can't drift from the code, and (b) every alias form is in the universe.
test("the SEED_COSTS suffix-strip branch still strips exactly the suffixes the universe generates", () => {
  // Re-derive the suffixes from item-value.mjs rather than hard-coding them here.
  const stripped = [...SRC.matchAll(/endsWith\(\s*(['"])(\s[A-Za-z]+)\1\s*\)/g)].map((m) => m[2]);
  const seedBranch = /SEED_COSTS/.test(SRC) ? stripped : [];
  assert.ok(seedBranch.includes(" Seed") && seedBranch.includes(" Plant"),
    `item-value.mjs's SEED_COSTS branch strips ${JSON.stringify(seedBranch)} — the universe generates ` +
    "' Seed' and ' Plant' aliases; if the branch changed its suffixes, update SEED_ALIAS_SUFFIXES in " +
    "core/sections/prices.mjs to match.");
});

test("every '<crop> Seed'/'<crop> Plant' alias the resolver can price is in the price universe", () => {
  const universe = buildItemUniverse({});
  const missing = [];
  for (const crop of Object.keys(SEED_COSTS)) {
    for (const suffix of [" Seed", " Plant"]) {
      if (!universe.has(crop + suffix)) missing.push(crop + suffix);
    }
  }
  assert.deepEqual(missing, [],
    `these seed aliases are priceable by item-value.mjs but missing from buildItemUniverse: ${missing.join(", ")}`);
});
