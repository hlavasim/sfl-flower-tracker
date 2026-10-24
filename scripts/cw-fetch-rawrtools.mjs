/*
 * Craft World game data — every factory / mine / building with all its levels — from RAWRTools
 * (www.rawrtools.com, which ships the game's own data inside each /factories/<slug> page as the
 * Next.js flight payload). Writes core/craftworld/factories.json.
 *
 *   node scripts/cw-fetch-rawrtools.mjs
 *
 * Re-run when the game adds a chain or rebalances. Polite: one page at a time.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "core", "craftworld", "factories.json");
const UA = { "user-agent": "Mozilla/5.0 (sfl-flower-tracker craftworld page)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.text();
    } catch {}
    await sleep(1500 * (i + 1));
  }
  throw new Error("fetch failed: " + url);
}

// The flight payload escapes JSON as \" inside JS strings; undo that, then take the balanced array.
function extractArray(text, key) {
  const flat = text.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  const i = flat.indexOf(`"${key}":[`);
  if (i < 0) return null;
  let depth = 0, j = flat.indexOf("[", i);
  for (let k = j; k < flat.length; k++) {
    if (flat[k] === "[") depth++;
    else if (flat[k] === "]" && --depth === 0) return JSON.parse(flat.slice(j, k + 1));
  }
  return null;
}
function extractField(text, key) {
  const flat = text.replace(/\\"/g, '"');
  const m = flat.match(new RegExp(`"${key}":("([^"]*)"|-?\\d+(\\.\\d+)?)`));
  return m ? (m[2] !== undefined ? m[2] : Number(m[1])) : null;
}

const index = await get("https://www.rawrtools.com/factories");
const slugs = [...new Set([...index.matchAll(/href="\/factories\/([a-z0-9-]+)"/g)].map((m) => m[1]))].sort();
const out = {};
for (const slug of slugs) {
  const html = await get(`https://www.rawrtools.com/factories/${slug}`);
  const levels = extractArray(html, "levels");
  const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || slug;
  const name = title.split(/\s+[—–-]\s+/)[0].trim();
  if (!levels || !levels.length) { console.warn("no levels:", slug); continue; }
  out[slug] = {
    name,
    category: extractField(html, "category"),
    tier: extractField(html, "tier"),
    levels: levels.map((l) => ({
      level: l.level, output: l.output, durationSeconds: l.durationSeconds, productionPerDay: l.productionPerDay,
      powerCost: l.powerCost, xpPerOutput: l.xpPerOutput, xpPerDay: l.xpPerDay, yield: l.yield,
      inputs: [l.input1, l.input2, l.input3].filter(Boolean).map((x) => ({ symbol: x.symbol, amount: x.amount })),
      upgradeCost: l.upgradeCost ? [].concat(l.upgradeCost).map((c) => ({ symbol: c.symbol, amount: c.amount })) : [],
    })),
  };
  console.log(slug, name, levels.length, "levels");
  await sleep(400);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ source: "https://www.rawrtools.com/factories", fetchedAt: new Date().toISOString(), factories: out }, null, 1));
console.log("wrote", OUT, Object.keys(out).length, "factories");
