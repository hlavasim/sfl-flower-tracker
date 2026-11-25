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
  assert.match(SRC, /section=leveling`, \{ method: "POST"/);
});

test("v2: no result cards; ladder, matrix with Σ, steps and the frontier button instead", () => {
  assert.doesNotMatch(SRC, /_lvlCard\(/);
  assert.match(SRC, /levelingLadder\(L\.farm, plan, 10, free\)/);
  assert.match(SRC, /tickedAt\(L\.farm, plan, bare, k\.xp\)/);
  assert.match(SRC, /levelingSteps\(L\.farm, L\.inputs, c, impacts, 3\)/);
  assert.match(SRC, /levelingFrontier\(L\.farm, L\.inputs, L\.cfg, 10\)/);
  assert.match(SRC, /budBids: budTypeBids\(book\)/);
  assert.match(SRC, /levelingRecipeOptions\(L\.farm, L\.inputs, L\.cfg\.restarts, L\.cfg\.ticked\)/);
});
