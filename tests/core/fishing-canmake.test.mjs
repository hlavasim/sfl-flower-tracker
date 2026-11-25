import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

// FISHING page: how many of a Fish Market bait you can make is capped by the hard ingredients only;
// the common one (Anchovy, Red Snapper, Tuna, Crab) is reported as "missing N" instead.
const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");

test("the common bait ingredients are named once", () => {
  assert.match(SRC, /const FISH_BAIT_COMMON = new Set\(\["Anchovy", "Red Snapper", "Tuna", "Crab"\]\);/);
});

test("canMake is limited by the hard ingredients, the common one becomes 'missing'", () => {
  assert.match(SRC, /const hard = entries\.filter\(\(\[ing\]\) => !FISH_BAIT_COMMON\.has\(ing\)\);/);
  assert.match(SRC, /for \(const \[ing, q\] of \(hard\.length \? hard : entries\)\) canMake = Math\.min/);
  assert.match(SRC, /missing ' \+ bs\.missing\.map/);
});
