import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

// The LEVELING page is wired into flowers.html: routed, in the menu, and its settings sync between devices.
const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");

test("PAGES whitelist and the router know leveling", () => {
  assert.match(SRC, /const PAGES = \[[^\]]*"leveling"/);
  assert.match(SRC, /case "leveling": renderLeveling\(\); break;/);
});

test("the menu has a LEVELING entry", () => {
  assert.match(SRC, /\{ id: "leveling", label: "📈 LEVELING" \}/);
});

test("what the owner clicks is stored under sfl_leveling and synced through farm_prefs", () => {
  assert.match(SRC, /const prefSyncKeys = \[[^\]]*"sfl_leveling"/s);
  assert.match(SRC, /localStorage\.setItem\("sfl_leveling"/);
  assert.match(SRC, /sanitizeLevelingConfig\(/);
});

test("the skill-point total comes from tickedSkillPoints (each skill once)", () => {
  assert.match(SRC, /const pts = tickedSkillPoints\(L\.farm, c\.ticked\);/);
});

test("the page starts from levelingInit and offers the resell switch", () => {
  assert.match(SRC, /\.\.\.levelingInit\(farm, inputs, saved\)/);
  assert.match(SRC, /c\.resell=this\.checked/);
  assert.match(SRC, /impactAt\(L\.farm, r, k\.xp\)/);
});

test("the page sends the recorded weeks so salt follows the measured harvests", () => {
  const api = readFileSync(new URL("../../api/compute.mjs", import.meta.url), "utf8");
  assert.match(api, /activity: lvActivity/);
  // The store's leveling resource POSTs the weeks (tests/app/store.test.mjs); both pages ask it.
  assert.doesNotMatch(SRC, /fetch\([^\n]*section=leveling/);
  assert.strictEqual(SRC.split('__store.get({ res: "leveling", farm: FARM_ID })').length - 1, 2);
});

test("the page loads the store with the engine and reads the farm through it", () => {
  assert.match(SRC, /import\("\/app\/store\.mjs"\)/);
  assert.match(SRC, /window\.__store = store\.createStore\(\{ persist: _persist \}\)/);
  assert.match(SRC, /await __store\.get\(\{ res: "farm", farm: FARM_ID \}, \{ force: true \}\)/);
});

test("v2: no result cards; ladder, matrix with Σ, steps and the frontier button instead", () => {
  assert.doesNotMatch(SRC, /_lvlCard\(/);
  assert.match(SRC, /levelingLadder\(L\.farm, plan, 10, free\)/);
  assert.match(SRC, /tickedAt\(L\.farm, plan, bare, k\.xp\)/);
  assert.match(SRC, /levelingSteps\(L\.farm, L\.inputs, c, impacts, 3\)/);
  assert.match(SRC, /levelingFrontier\(L\.farm, L\.inputs, L\.cfg, 10\)/);
  // The book's bids/floors/bud prices are applied in core (levelingInputsWithBook), shared with the widget.
  assert.match(SRC, /const inputs = levelingInputsWithBook\(d\.inputs, book\);/);
  assert.match(SRC, /levelingRecipeOptions\(L\.farm, L\.inputs, L\.cfg\.restarts, L\.cfg\.ticked\)/);
});

test("the ladder is the pinnable leveling-ladder widget; a row click still sets the target", () => {
  assert.match(SRC, /__widgets\.renderPage\("leveling-ladder", \{ data: \{ farm: L\.farm \}, ctx: \{ plan, cfg: c, free, rowClick: true \}/);
  assert.doesNotMatch(SRC, /PO ASCENZÍCH \(tvoje nastavení; klik = cíl\)/);
  assert.match(SRC, /closest\('\[data-frame="page:leveling-ladder"\] tr\[data-row\]'\)/);
  assert.match(SRC, /_lvlTarget\(Number\(tr\.dataset\.row\.slice\(1\)\)\)/);
  assert.match(SRC, /if \(type === "leveling-ladder"\)/);
});

test("DASH suggestions take per-widget limits; the target widget gets the page's in-progress counts and icons", () => {
  assert.match(SRC, /function parseDashboardActions\(farm, limits = \{\}\)/);
  assert.match(SRC, /const dollLimit = limits\.dolls \?\? LIMIT;/);
  assert.match(SRC, /const crabLimit = limits\.crabs \?\? LIMIT;/);
  // DOLLS and CRABS render their own copy (a page variant with the category and the page's LIMIT fixed)
  assert.match(SRC, /__widgets\.renderPage\("target-list", \{ data: \{ farm: data\.farm \}, ctx: _wCtx\("target-list"\), fresh: _wFresh, variant: "dolls", force: \{ cat: "dolls" \} \}\)/);
  assert.match(SRC, /__widgets\.renderPage\("target-list", \{ data: \{ farm: data\.farm \}, ctx: _wCtx\("target-list"\), fresh: _wFresh, variant: "crabs", force: \{ cat: "crabs" \} \}\)/);
  assert.match(SRC, /__widgets\.renderPage\("crafting-box", /);
  assert.match(SRC, /__widgets\.renderPage\("crab-traps", /);
  assert.match(SRC, /if \(type === "target-list"\) return \{ inProgress: extractInProgress, tracked: getTrackedDolls\(\),/);
  assert.match(SRC, /_wPinBtn\("target-list", "Flowers to the limit", \{ cat: "flowers" \}\)/);
});
