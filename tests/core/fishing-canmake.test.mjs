import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

// FISHING page: how many of a Fish Market bait you can make is capped by the hard ingredients only;
// the common one (the ingredient in every season's recipe of that bait) is reported as "missing N",
// priced in casts. The page also opens with the ☀️ DNES card built on the LEVELING plan.
const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");

test("the common ingredient is derived per bait, not a fixed list (autumn Fish Oil's Crab is hard)", () => {
  assert.doesNotMatch(SRC, /FISH_BAIT_COMMON/);
  assert.match(SRC, /const common = baitCommonIngredient\(bait\);/);
});

test("canMake is limited by the hard ingredients, the common one becomes 'missing' with its casts", () => {
  assert.match(SRC, /const hard = entries\.filter\(\(\[ing\]\) => ing !== common\);/);
  assert.match(SRC, /for \(const \[ing, q\] of \(hard\.length \? hard : entries\)\) canMake = Math\.min/);
  assert.match(SRC, /missing ' \+ bs\.missing\.map/);
  assert.match(SRC, /casts: m\.n \* \(ingredientCost\(m\.ing, null, sn\)\.casts \|\| 0\)/);
});

test("DNES runs the LEVELING plan on the saved config and lists what to age from agingNow", () => {
  assert.match(SRC, /lvCfg = levelingInit\(_fishFarm, lin, saved\)\.cfg;/);
  assert.match(SRC, /agingNow\(\{ owned: ownedNow, baitsWanted \}\)/);
  assert.match(SRC, /☀️ DNES/);
});

test("history and Marvels fold into <details>, DNES comes first", () => {
  assert.match(SRC, /h = h\.slice\(0, _mHist0\) \+ dnesHtml \+ h\.slice\(_mHist1, _mMarv0\)/);
});

test("a worm+chum route carries its pair, which the order reads (r.pair.bait) — ticking it crashed the page", () => {
  assert.match(SRC, /out\.push\(\{ kind: "pair", pair, label: pair\.bait/);
  assert.match(SRC, /need\(r\.pair\.bait, c\.n, 0\);/);
});
