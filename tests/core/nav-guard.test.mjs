import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

// The router: a navigation token, one in-flight farm fetch per farm, the cached farm dropped on a
// farm switch, and a fresh #app when the page or farm changes (a slower render of the page left
// behind then writes into a detached node instead of over the new page).
const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
const main = SRC.slice(SRC.indexOf("    async function main() {"), SRC.indexOf("    async function main() {") + 6000);

test("main() takes a navigation token and checks it after the farm fetch", () => {
  assert.match(main, /const seq = \+\+_navSeq;/);
  assert.match(main, /if \(seq !== _navSeq\) return;/);
});

test("one in-flight farm fetch, keyed by farm; a farm switch drops the cached farm", () => {
  assert.match(main, /if \(cachedFarmData && _cachedFarmFor !== cfg\.farm\) cachedFarmData = null;/);
  assert.match(main, /if \(!_farmInflight \|\| _farmInflight\.farm !== FARM_ID\)/);
  assert.match(SRC, /cachedFarmData = await fetchFarmData\(\); _cachedFarmFor = FARM_ID;/);
});

test("a page or farm change gets a fresh #app", () => {
  assert.match(main, /if \(_navPage !== null && \(page !== _navPage \|\| cfg\.farm !== _navFarm\)\)/);
  assert.match(main, /old\.parentNode\.replaceChild\(old\.cloneNode\(false\), old\)/);
});
