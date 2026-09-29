import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/*
 * flowers.html used to carry its own copy of ~120 core/ functions, and the two copies drifted
 * (Chicken Coop read one value on POWER and another on the roadmap). The page now loads the
 * engine itself — core/browser-engine.mjs, the loader in its <head> — so there is ONE copy.
 *
 * This file keeps it that way: the page may define a function with a core name only as a thin
 * wrapper that hands the page's own state (powerState.farm, localStorage) to the engine and
 * calls __engine.<same name>. Anything else is a copy creeping back.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

// The wrappers, each with what it adds on top of the engine call.
const ENGINE_WRAPPERS = new Map([
  ["applyBoosts", "farm = powerState.farm"],
  ["miningToolsPerDay", "farm = powerState.farm, effects default to the owned ones"],
  ["calcToolCostPerDay", "farm + owned effects forwarded"],
  ["getRoadmapSettings", "raw settings default to localStorage sfl_roadmap_settings"],
  ["activeShrineEffects", "farm = powerState.farm"],
  ["computeFarmValue", "pet prices from localStorage sfl_pet_prices_v1"],
  ["detectCookingBoosts", "petSimulate from localStorage sfl_pet_streak"],
  ["calcSkillPointCost", "the same pet-streak setting, for its cooking boosts"],
]);

const walk = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => e.isDirectory()
    ? walk(path.join(dir, e.name))
    : (e.name.endsWith(".mjs") ? [path.join(dir, e.name)] : []));

const coreNames = new Set();
for (const file of walk(path.join(ROOT, "core"))) {
  for (const m of readFileSync(file, "utf8").matchAll(/(?:^|\n)\s*(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) coreNames.add(m[1]);
}
const html = read("flowers.html").replace(/\r\n/g, "\n");
const script = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
// Top-level page functions sit at a 4-space indent; each runs to its closing brace at that indent.
const pageFns = new Map([...script.matchAll(/\n    (?:async )?function ([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => {
  const end = script.indexOf("\n    }", m.index + 1);
  return [m[1], script.slice(m.index + 1, end + 6)];
}));
const engineSrc = read("core/browser-engine.mjs");
const engineNames = new Set([...engineSrc.matchAll(/export \{([^}]*)\}/g)].flatMap((m) => m[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean)));

test("the parse found both sides", () => {
  // Guards the test itself: a broken parse would compare nothing and pass.
  assert.ok(pageFns.size > 300, `page functions: ${pageFns.size}`);
  assert.ok(coreNames.size > 200, `core functions: ${coreNames.size}`);
  assert.ok(engineNames.size > 100, `engine exports: ${engineNames.size}`);
});

test("the page has no copy of a core function, only the listed engine wrappers", () => {
  const copies = [...pageFns.keys()].filter((n) => coreNames.has(n) && !ENGINE_WRAPPERS.has(n));
  assert.deepEqual(copies, [],
    "flowers.html defines these core functions itself — use the engine's (add the name to " +
    "core/browser-engine.mjs) instead of a copy:\n  " + copies.join("\n  "));
});

test("every wrapper is thin and calls the engine's function of the same name", () => {
  for (const [name] of ENGINE_WRAPPERS) {
    const src = pageFns.get(name);
    assert.ok(src, `${name}: wrapper missing (remove it from ENGINE_WRAPPERS if it is no longer needed)`);
    assert.ok(src.includes(`__engine.${name}(`), `${name}: must delegate to __engine.${name}`);
    assert.ok(src.split("\n").length <= 8, `${name}: a wrapper, not a reimplementation`);
    assert.ok(engineNames.has(name), `${name}: not exported by core/browser-engine.mjs`);
  }
});

test("every engine export exists in core", () => {
  const missing = [...engineNames].filter((n) => !coreNames.has(n) && !n.startsWith("_"));
  assert.deepEqual(missing, []);
});

test("calcBoostValue takes the raw difference, unclamped", () => {
  // The clamp is what makes a boost on a loss-making category worth anything. Clamping each
  // side instead of the difference zeroes them again.
  const rx = /const net = productScoped\s*\?\s*\(ef\) => roadmapProductNetEff\(catId, product, ef, _s\)\s*:\s*\(ef\) => roadmapCatNet\(catId, ef, _s\);\s*synergy = net\(ownedEff\.concat\(catEffects\)\) - net\(ownedEff\);\s*solo = net\(catEffects\) - net\(\[\]\);/;
  assert.match(read("core/engine/roadmap.mjs"), rx);
});

test("the oil regeneration parse rules are the same in both copies", () => {
  // BOOST_PARSE_RULES is a top-level table, not a function: the page still has its own.
  // `regeneration` is the wording sfl.world ships; without it Dev Wrench parses as a -50%
  // YIELD instead of a -50% timer.
  const alt = "(?:refill|recovery|respawn|regen(?:eration)?)";
  const count = (s) => s.split(alt).length - 1;
  assert.equal(count(html), 2, "flowers.html: both the % and the multiplier rule accept it");
  assert.equal(count(read("core/engine/power-boosts.mjs")), 2, "core: likewise");
});
