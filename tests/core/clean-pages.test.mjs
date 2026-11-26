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
  assert.match(SRC, /__store\.invalidate\(\{ res: "compute", farm: FARM_ID \|\| "", section: "constants" \}\)/);
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

test("ROADMAP: WHAT TO FARM / MINE NOW, Expired — renew, the scenario bar/table and the skills by tree are clean, with item icons", () => {
  const legacy = /pixel-font|Press Start|#161009|#2a1410|#20190f|var\(--border-brown\)|var\(--sunpetal\)|var\(--lily\)|font-size:0\.\d/;
  const prof = body("        function roadmapProfitabilityHtml(settings, headOnly = false) {", "\n    function ");
  const detail = body("    function roadmapMiningDetail(c, r, f) {", "\n        function ");
  const bar = body("    function roadmapScenarioBarHtml() {", "\n    function ");
  const scen = body("    function roadmapScenarioTableHtml(plan) {", "\n    function ");
  const per = body("    function roadmapPeriodicHtml() {", "\n    function ");
  const sk = body("    function roadmapSkillsViewHtml(settings) {", "\n    function ");
  for (const b of [prof, detail, bar, scen, per, sk]) assert.doesNotMatch(b, legacy);
  for (const b of [prof, scen, per]) assert.doesNotMatch(b, /pixel-panel/);
  assert.match(prof, /<div class="w-card v-rmf-panel">/);
  assert.match(prof, /<table class="w-table v-rmf-t">/);
  assert.match(prof, /<img src="\$\{getItemIcon\(r\.icon\)\}"/);
  assert.match(prof, /onchange="_roadmapToggleCat\('\$\{key\}',this\.checked\)">\$\{_dashIcon\(icon\)\}/);
  assert.match(per, /<img src="\$\{getItemIcon\(r\.icon\)\}"/);
  assert.match(sk, /<div class="v-rmf-sk\$\{c\.has \? " v-rmf-own" : ""\}">\$\{_dashIcon\(/);
  // the restyled summary and ladder stay as they were
  assert.match(sk, /<div class="pixel-panel v-sk-sum">/);
  // all text in English
  for (const b of [prof, bar, per]) assert.doesNotMatch(b, /`(Obnovit|Postavit|Koupit) |nelze rozjet|po poplatku|PRO EXPANZE/);
});

test("DIFF investment panels (tracker, repay plan, balance sheet, ledger, insights): clean style, English text", () => {
  const b = body("    //  INVESTMENT TRACKER", "    async function renderDiff(data) {");
  assert.doesNotMatch(b, /pixel-panel|pixel-font|Press Start|roi-pill|summary-stat|Courier New/);
  assert.doesNotMatch(b, /[ěščřžýáíéůúňťďĚŠČŘŽÝÁÍÉŮÚŇŤĎ]/, "no Czech text left");
  assert.match(b, /class="v-inv-title">💰 Investment tracker</);
  assert.match(b, /<table class="w-table v-inv-table">/);
  // the CSS lives in one v-inv- block right after the .v-treasury-top media rule
  assert.match(SRC, /@media \(max-width: 800px\) \{ \.v-treasury-top \{[^\n]*\n\s*\/\* DIFF page: investment tracker[^\n]*\n\s*\.v-inv \{/);
});

test("DOLLS: the tracked-dolls panel is a clean card of chips, each doll with its icon, and stays open across a toggle", () => {
  const b = body("    function renderDolls(data) {", "\n    function ");
  assert.match(b, /<details class="w-card v-dolls-cfg"\$\{window\._dollCfgOpen \? " open" : ""\} ontoggle="window\._dollCfgOpen=this\.open">/);
  assert.match(b, /class="v-chip\$\{on \? " on" : ""\}" onclick="event\.stopPropagation\(\);toggleDollTracked\('\$\{escHTML\(name\)\}'\)"><img src="\$\{getItemIcon\(name\)\}"/);
  assert.doesNotMatch(b, /config-collapsed|Press Start/);
});
