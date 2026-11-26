// Generates app/item-icons.mjs: every item's own image, the way the game maps it
// (sunflower-land src/features/game/types/images.ts → imported asset files or SUNNYSIDE.* paths in
// src/assets/sunnyside.ts). sfl.world answers an unknown name with a "?" placeholder (status 200,
// so the page's onerror never fires) — Timber, Crimsteel, Kelp Fibre… showed "?".
//
//   node scripts/gen-item-icons.mjs            (fetches the two files from GitHub main)
//   node scripts/gen-item-icons.mjs <images.ts> <sunnyside.ts> <plant.ts> <bumpkinSkills.ts> <bumpkin.ts>
import { readFileSync, writeFileSync } from "node:fs";

const RAW = "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/";
const ASSETS = "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/";   // jsDelivr answers 403 for part of the repo
const PROTECTED = "https://sunflower-land.com/game-assets";

async function source(arg, path) {
  if (arg) return readFileSync(arg, "utf8");
  const r = await fetch(RAW + path);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.text();
}

// import x from "assets/…" → x: URL
export function importsOf(ts) {
  const out = {};
  for (const m of ts.matchAll(/^import\s+(\w+)\s+from\s+"(assets\/[^"]+)";/gm)) out[m[1]] = ASSETS + m[2];
  return out;
}

// SUNNYSIDE = { group: { key: `${CONFIG.PROTECTED_IMAGE_URL}/…` | importedVar, … }, … } → "group.key": URL
export function sunnysideOf(ts) {
  const imports = importsOf(ts);
  const out = {};
  const path = [];
  let inside = false;
  for (const raw of ts.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!inside) { if (/^export const SUNNYSIDE = \{/.test(line)) inside = true; continue; }
    const open = line.match(/^"?([\w$]+)"?:\s*\{$/);
    if (open) { path.push(open[1]); continue; }
    if (/^\},?;?$/.test(line)) { if (!path.length) break; path.pop(); continue; }
    const kv = line.match(/^"?([\w$]+)"?:\s*(.+?),?$/);
    if (!kv) continue;
    const key = [...path, kv[1]].join(".");
    const v = kv[2];
    const tpl = v.match(/^`\$\{CONFIG\.PROTECTED_IMAGE_URL\}(\/[^`$]+)`$/);
    if (tpl) out[key] = PROTECTED + tpl[1];
    else if (imports[v]) out[key] = imports[v];
  }
  return out;
}

// Crops: CROP_LIFECYCLE["Basic Biome"].<Crop>.<stage> = game-assets/crops/<IMAGES[crop]>/<stage file>
// (plant.ts: IMAGES = { Sunflower: "sunflower", … }).
const CROP_STAGE_FILE = { seedling: "seedling", halfway: "halfway", almost: "almost", ready: "plant", crop: "crop", seed: "seed" };
export function cropFoldersOf(plantTs) {
  const block = (plantTs.match(/export const IMAGES[^=]*=\s*\{([\s\S]*?)\n\};/) || [])[1] || "";
  const out = {};
  for (const m of block.matchAll(/^\s*(?:"([^"]+)"|([\w$]+)):\s*"([^"]+)",/gm)) out[m[1] || m[2]] = m[3];
  return out;
}
function cropUrl(expr, folders) {
  const m = expr.match(/^CROP_LIFECYCLE\["Basic Biome"\](?:\.([\w$]+)|\["([^"]+)"\])\.(\w+)$/);
  if (!m) return null;
  const folder = folders[m[1] || m[2]], file = CROP_STAGE_FILE[m[3]];
  return folder && file ? `${PROTECTED}/crops/${folder}/${file}.png` : null;
}

// "Name": { image: expr, … } → Name: URL
export function itemIconsOf(imagesTs, sunnysideTs, plantTs = "") {
  const imports = importsOf(imagesTs);
  const sunny = sunnysideOf(sunnysideTs);
  const folders = cropFoldersOf(plantTs);
  const out = {};
  for (const m of imagesTs.matchAll(/^ {2}(?:"([^"]+)"|([\w$]+)):\s*\{\s*\n\s*image:\s*([^,\n]+),/gm)) {
    const name = m[1] || m[2];
    const expr = m[3].trim();
    const url = expr.startsWith("SUNNYSIDE.") ? sunny[expr.slice(10)]
      : expr.startsWith("CROP_LIFECYCLE") ? cropUrl(expr, folders) : imports[expr];
    if (url && !(name in out)) out[name] = url;
  }
  return out;
}

// Skills are not in images.ts: each skill in bumpkinSkills.ts has its own `image:` (an imported
// asset, a SUNNYSIDE?.… path or another item's ITEM_DETAILS[…].image) at the end of its block.
export function skillIconsOf(skillsTs, sunnysideTs, items = {}, plantTs = "") {
  const imports = importsOf(skillsTs);
  const sunny = sunnysideOf(sunnysideTs);
  const folders = cropFoldersOf(plantTs);
  const out = {};
  let name = null;
  for (const line of skillsTs.split(/\r?\n/)) {
    const open = line.match(/^ {2}(?:"([^"]+)"|([\w$]+)): \{$/);
    if (open) { name = open[1] || open[2]; continue; }
    if (/^ {2}\},?$/.test(line)) { name = null; continue; }
    const img = name && line.match(/^ {4}image: (.+?),?$/);
    if (!img) continue;
    const expr = img[1].trim().replace(/\?\./g, ".");
    const item = expr.match(/^ITEM_DETAILS\["([^"]+)"\]\.image$/);
    const url = expr.startsWith("SUNNYSIDE.") ? sunny[expr.slice(10)]
      : expr.startsWith("CROP_LIFECYCLE") ? cropUrl(expr, folders)
      : item ? items[item[1]] : imports[expr];
    if (url) out[name] = url;   // the revamped tree comes after the legacy one and wins
  }
  return out;
}

// Wearables are not in images.ts either: the game draws each from assets/wearables/<ITEM_IDS[name]>.webp
// (bumpkin.ts). sfl.world answered "?" for the ones it has not indexed (Duende Hat, Firefly Aura…).
export function wearableIconsOf(bumpkinTs) {
  const block = bumpkinTs.split(/^export const ITEM_IDS[^{]*\{/m)[1] || "";
  const out = {};
  for (const m of block.split(/^\};/m)[0].matchAll(/^ {2}(?:"([^"]+)"|([\w$]+)): (\d+),/gm)) {
    out[m[1] || m[2]] = `${ASSETS}assets/wearables/${m[3]}.webp`;
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith("gen-item-icons.mjs")) {
  const images = await source(process.argv[2], "features/game/types/images.ts");
  const sunny = await source(process.argv[3], "assets/sunnyside.ts");
  const plant = await source(process.argv[4], "features/island/plots/lib/plant.ts");
  const skillsTs = await source(process.argv[5], "features/game/types/bumpkinSkills.ts");
  const icons = itemIconsOf(images, sunny, plant);
  for (const [k, v] of Object.entries(skillIconsOf(skillsTs, sunny, icons, plant))) if (!(k in icons)) icons[k] = v;
  const bumpkinTs = await source(process.argv[6], "features/game/types/bumpkin.ts");
  for (const [k, v] of Object.entries(wearableIconsOf(bumpkinTs))) if (!(k in icons)) icons[k] = v;
  const keys = Object.keys(icons).sort();
  const body = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(icons[k])},`).join("\n");
  writeFileSync(new URL("../app/item-icons.mjs", import.meta.url),
    `// GENERATED by scripts/gen-item-icons.mjs from the game's images.ts + sunnyside.ts — do not edit by hand.\n` +
    `// Every item's own image; getItemIcon (flowers.html) reads this first.\nexport const ITEM_ICONS = {\n${body}\n};\n`);
  console.log(`${keys.length} icons`);
}
