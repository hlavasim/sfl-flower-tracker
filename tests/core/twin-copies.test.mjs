import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/*
 * core/ is a PORT of functions that also live inline in flowers.html, and both copies have to
 * be patched. The repo's own handoff says this "bit twice today", and it bit again in the
 * session that added this file: free_feed, the calcBoostValue clamp and the oil-regeneration
 * rule were each hand-copied into flowers.html and checked by eye, because the suite only ever
 * loaded core/.
 *
 * So: every function that exists in BOTH copies must stay byte-identical modulo comments and
 * whitespace. The deliberate deviations are listed below with their reason — the file headers
 * of power-helpers.mjs and roadmap.mjs document the policy ("required to be global-free").
 *
 * This is a drift net, not a style check. Comments are stripped before comparing, so the two
 * copies may document themselves differently; only behaviour is pinned.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

/*
 * Known deviations. Each entry is a function whose two copies are ALLOWED to differ, with why.
 * The list is asserted to be exact in both directions: a new divergence fails, and so does an
 * entry that has since been re-synced, so this cannot rot into a blanket exemption.
 */
const KNOWN_DEVIATIONS = new Map([
  // power-helpers.mjs header, deviations 1-3: globals replaced by optional params.
  ["applyBoosts", "gains an optional `farm` param replacing the page's powerState.farm read"],
  ["miningToolsPerDay", "gains optional farm + effects params replacing powerState reads"],
  ["calcToolCostPerDay", "forwards those two optional params through"],
  // roadmap.mjs header, deviations 1-4.
  ["getRoadmapSettings", "normalizes a passed-in raw object instead of reading localStorage"],
  ["activeShrineEffects", "takes `farm` explicitly instead of reading the page global"],
  ["roadmapOwnedEffects", "reads the module-level powerState set by _setPowerContext"],
  ["gameResUnitsPerDay", "threads powerState.farm through applyBoosts' new param"],
  ["roadmapMiningChain", "same powerState/global-free rework"],
  ["calcBoostValue", "gains the `effMode` param the wishlist's measured pass opts into"],
  // Sections whose core copy drops page-only concerns (fetching, DOM, rendering).
  ["computeFarmValue", "core copy takes prefetched data; the page copy fetches"],
  ["detectCookingBoosts", "global-free rework"],
  ["computeFoodXP", "global-free rework"],
  ["roadmapKeyValue", "gifts-deliveries: same policy as the roadmap engine"],
  ["roadmapItemCost", "gifts-deliveries: same policy as the roadmap engine"],
  ["roadmapGiftRewardValue", "gifts-deliveries: same policy as the roadmap engine"],
  ["hasItem", "derive/items: page copy is the inline original"],
  ["hasAny", "derive/items: page copy is the inline original"],
]);

const normalise = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, "")   // block comments
  .replace(/\/\/[^\n]*/g, "")          // line comments
  .replace(/\s+/g, " ")
  .trim();

/** Slice `function NAME(...) { ... }` out of a source by brace matching. */
function grabFn(src, name) {
  const m = src.match(new RegExp("(?:^|[\\s;])function\\s+" + name + "\\s*\\("));
  if (!m) return null;
  const i = src.indexOf("function " + name, m.index);
  const open = src.indexOf("{", i);
  if (open < 0) return null;
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => e.isDirectory()
    ? walk(path.join(dir, e.name))
    : (e.name.endsWith(".mjs") ? [path.join(dir, e.name)] : []));

const page = read("flowers.html");
const shared = []; // { name, coreRel, pageSrc, coreSrc }
for (const file of walk(path.join(ROOT, "core"))) {
  const src = readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  for (const m of src.matchAll(/(?:^|\n)\s*(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[1];
    const pageSrc = grabFn(page, name);
    if (!pageSrc) continue;               // core-only helper — nothing to drift against
    const coreSrc = grabFn(src, name);
    if (!coreSrc) continue;
    shared.push({ name, coreRel: rel, pageSrc, coreSrc });
  }
}

test("the extractor actually found the duplicated surface", () => {
  // Guards the test itself: a broken regex or brace-matcher would silently compare nothing
  // and this whole file would pass while checking zero functions.
  assert.ok(shared.length > 90, `expected ~117 shared functions, found ${shared.length}`);
  for (const s of shared.slice(0, 5)) {
    assert.ok(s.pageSrc.length > 20 && s.coreSrc.length > 20, `${s.name}: suspiciously short slice`);
  }
});

test("every function duplicated in core/ and flowers.html is identical", () => {
  const drifted = [];
  for (const { name, coreRel, pageSrc, coreSrc } of shared) {
    if (KNOWN_DEVIATIONS.has(name)) continue;
    if (normalise(pageSrc) !== normalise(coreSrc)) drifted.push(`${name}  [${coreRel}]`);
  }
  assert.deepEqual(drifted, [],
    "these functions were changed in one copy only — patch both, or add them to " +
    "KNOWN_DEVIATIONS with a reason:\n  " + drifted.join("\n  "));
});

test("KNOWN_DEVIATIONS lists nothing that has since been re-synced", () => {
  const stale = [];
  for (const [name] of KNOWN_DEVIATIONS) {
    const hit = shared.find((s) => s.name === name);
    if (!hit) { stale.push(`${name} (no longer duplicated at all)`); continue; }
    if (normalise(hit.pageSrc) === normalise(hit.coreSrc)) stale.push(`${name} (copies now match)`);
  }
  assert.deepEqual(stale, [],
    "remove these from KNOWN_DEVIATIONS — the exemption is no longer earned:\n  " + stale.join("\n  "));
});

/*
 * Two sites the function-level sweep cannot reach: one inside an allow-listed function, one in
 * a top-level table. Both were hand-patched into flowers.html this session, so both get pinned.
 */
test("calcBoostValue's clamp is the same in both copies", () => {
  // calcBoostValue is allow-listed for its `effMode` param, so its body is not compared —
  // but the clamp is what makes a boost on a loss-making category worth anything, and it is
  // identical in both copies. Clamping each side instead of the difference zeroes them again.
  const rx = /const net = \(ef\) => roadmapCatNet\(catId, ef, _s\);\s*synergy = Math\.max\(0, net\(ownedEff\.concat\(catEffects\)\) - net\(ownedEff\)\);\s*solo = Math\.max\(0, net\(catEffects\) - net\(\[\]\)\);/;
  assert.match(page, rx, "flowers.html: clamp must apply to the difference");
  assert.match(read("core/engine/roadmap.mjs"), rx, "core: clamp must apply to the difference");
});

test("the oil regeneration parse rules are the same in both copies", () => {
  // BOOST_PARSE_RULES is a top-level table, not a function, so the sweep above misses it.
  // `regeneration` is the wording sfl.world ships; without it Dev Wrench parses as a -50%
  // YIELD instead of a -50% timer.
  const alt = "(?:refill|recovery|respawn|regen(?:eration)?)";
  const count = (s) => s.split(alt).length - 1;
  assert.equal(count(page), 2, "flowers.html: both the % and the multiplier rule accept it");
  assert.equal(count(read("core/engine/power-boosts.mjs")), 2, "core: likewise");
});
