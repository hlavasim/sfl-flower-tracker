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
