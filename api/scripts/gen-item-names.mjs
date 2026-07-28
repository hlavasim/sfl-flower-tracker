// Generates api/_item-names.json — the marketplace id -> name mapping.
//
// MY TRADES used to resolve names only by joining ob_last, which the orderbook collector
// fills for BOOSTED NFTs only (225 rows). That left most trades showing a bare item id:
// of 49 distinct collectibles traded, 19 resolved; pets and buds resolved none.
//
// The authoritative tables live in the game source:
//   KNOWN_IDS (types/index.ts)  — inventory items / collectibles, name -> id
//   ITEM_IDS  (types/bumpkin.ts) — wearables, name -> id
// They are inverted here to id -> name. Note the two ranges OVERLAP (257, 406, 519 and
// 520 all exist in both), so the map is keyed per collection — a single flat table would
// mislabel items.
//
// Regenerate when the game adds items:
//   node api/scripts/gen-item-names.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAW = "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main";

/** Pull `export const <NAME>: Record<...> = { ... };` and invert "Item": 123 to 123: "Item". */
function extractIdMap(source, constName) {
  const start = source.indexOf(`export const ${constName}`);
  if (start === -1) throw new Error(`${constName} not found`);
  const open = source.indexOf("{", start);
  let depth = 0, end = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error(`${constName}: unbalanced braces`);
  const body = source.slice(open + 1, end);

  const out = {};
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    // Skip commented-out entries — the source has several, e.g. // "Shiny Bean": 116,
    if (!line || line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) continue;
    const m = line.match(/^"?([^":]+?)"?\s*:\s*(\d+)\s*,?$/);
    if (!m) continue;
    const name = m[1].trim();
    const id = Number(m[2]);
    if (!name || !Number.isFinite(id)) continue;
    // First definition wins; a duplicate id would otherwise silently rename an item.
    if (out[id] === undefined) out[id] = name;
  }
  return out;
}

const [indexTs, bumpkinTs] = await Promise.all([
  fetch(`${RAW}/src/features/game/types/index.ts`).then((r) => r.text()),
  fetch(`${RAW}/src/features/game/types/bumpkin.ts`).then((r) => r.text()),
]);

const collectibles = extractIdMap(indexTs, "KNOWN_IDS");
const wearables = extractIdMap(bumpkinTs, "ITEM_IDS");

const out = {
  _generated: "by api/scripts/gen-item-names.mjs — do not hand-edit",
  _source: "sunflower-land KNOWN_IDS (types/index.ts) + ITEM_IDS (types/bumpkin.ts)",
  // Keyed by marketplace collection. pets and buds are individual NFTs with no name
  // table — they are labelled "Pet #n" / "Bud #n" at read time instead.
  collectibles,
  wearables,
};

const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.resolve(here, "../_item-names.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 1));

console.log(`wrote ${dest}`);
console.log(`  collectibles: ${Object.keys(collectibles).length} ids`);
console.log(`  wearables:    ${Object.keys(wearables).length} ids`);
// Spot-check against ids seen in real trades, and prove the ranges really do overlap.
for (const id of [201, 203, 406, 519, 520]) {
  console.log(`  id ${String(id).padEnd(4)} collectible="${collectibles[id] ?? "-"}"  wearable="${wearables[id] ?? "-"}"`);
}
