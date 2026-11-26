import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

// CONSTANTS, JSON, DIFF and the DOLLS configure panel in the clean style (flowers.html wiring).
const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
const body = (start, end) => { const i = SRC.indexOf(start); assert.ok(i > 0, start); return SRC.slice(i, SRC.indexOf(end, i + start.length)); };

test("CONSTANTS: both panels are widgets over the store's compute section, under a clean head", () => {
  const b = body("    function renderConstants() {", "\n    function ");
  assert.match(b, /const q = \{ res: "compute", farm: FARM_ID \|\| "", section: "constants" \};/);
  assert.match(b, /__widgets\.renderPage\("constants-coverage", \{ data, ctx: \{\}, fresh \}\)/);
  assert.match(b, /__widgets\.renderPage\("constants-tables", \{ data, ctx: \{\}, fresh \}\)/);
  assert.match(b, /_wPageHead\("🧩 Constants"/);
  assert.doesNotMatch(SRC, /_constantsData|_fetchConstants/);
  // REFRESH drops the store's copy instead of the old page cache
  assert.match(SRC, /__store\.invalidate\(\{ res: "compute", section: "constants" \}\)/);
});

test("JSON and DIFF: clean heads, no retro panels or pixel type", () => {
  const json = body("    function renderJsonExplorer(data) {", "\n    function ");
  const diff = body("    async function renderDiff(data) {", "\n    function ");
  assert.match(json, /_wPageHead\("🧾 JSON explorer"/);
  assert.match(json, /<div class="w-card v-json">/);
  assert.match(diff, /_wPageHead\("🔍 Farm changelog"/);
  assert.match(diff, /<div id="diff-content" class="v-diff">/);
  for (const b of [json, diff]) assert.doesNotMatch(b, /pixel-panel|pixel-font|Press Start/);
});

test("DOLLS: the tracked-dolls panel is a clean card of chips, each doll with its icon, and stays open across a toggle", () => {
  const b = body("    function renderDolls(data) {", "\n    function ");
  assert.match(b, /<details class="w-card v-dolls-cfg"\$\{window\._dollCfgOpen \? " open" : ""\} ontoggle="window\._dollCfgOpen=this\.open">/);
  assert.match(b, /class="v-chip\$\{on \? " on" : ""\}" onclick="event\.stopPropagation\(\);toggleDollTracked\('\$\{escHTML\(name\)\}'\)"><img src="\$\{getItemIcon\(name\)\}"/);
  assert.doesNotMatch(b, /config-collapsed|Press Start/);
});
