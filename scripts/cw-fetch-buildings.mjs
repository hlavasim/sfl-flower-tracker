/*
 * Craft World BUILDINGS (Town Hall, Vault, Workshop, Hatchery, School, power plants…) from RAWRTools.
 * Their pages carry plain HTML tables (no flight payload like the factories), so each table is read
 * as headers + rows; a cost cell's resource is the alt text of its icon. Writes
 * core/craftworld/buildings.json:  { slug: { name, tables: [{ headers: [...], rows: [[cell…]…] }] } }
 * where a cell is a string, or { items: [{ symbol, amount }] } for a cost.
 *
 *   node scripts/cw-fetch-buildings.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "core", "craftworld", "buildings.json");
const UA = { "user-agent": "Mozilla/5.0 (sfl-flower-tracker craftworld page)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SLUGS = ["town-hall", "vault", "workshop", "secret-lab", "house", "hatchery", "school", "university",
  "airstream", "sunforge", "steamforge", "reactor", "power-cell", "battery"];

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ");
const num = (t) => {
  const m = String(t).replace(/,/g, "").match(/^(-?[\d.]+)\s*([kKmM]?)$/);
  if (!m) return null;
  return parseFloat(m[1]) * (m[2] === "k" || m[2] === "K" ? 1e3 : m[2] === "m" || m[2] === "M" ? 1e6 : 1);
};

function cell(html) {
  // a cost cell: one or more <img alt="SYMBOL"> each followed by an amount
  const items = [...html.matchAll(/<img[^>]*alt="([^"]+)"[^>]*>\s*(?:<[^>]+>\s*)*([\d.,]+\s*[kKmM]?)/g)]
    .map((m) => ({ symbol: m[1].toUpperCase().replace(/\s+/g, ""), amount: num(m[2]) }));
  if (items.length) return { items };
  return decode(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

async function get(url) {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.text(); } catch {}
    await sleep(1500 * (i + 1));
  }
  throw new Error("fetch failed: " + url);
}

const out = {};
for (const slug of SLUGS) {
  let html;
  try { html = await get(`https://www.rawrtools.com/factories/${slug}`); } catch (e) { console.warn(e.message); continue; }
  const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || slug;
  const tables = [];
  for (const t of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const headers = [...t[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => cell(m[1]));
    const rows = [...t[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .map((r) => [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => cell(m[1])))
      .filter((r) => r.length);
    if (rows.length) tables.push({ headers, rows });
  }
  out[slug] = { name: decode(title.split(/\s+[—–|-]\s+/)[0].trim()), tables };
  console.log(slug, out[slug].name, tables.map((t) => `${t.headers.length}x${t.rows.length}`).join(" "));
  await sleep(400);
}
fs.writeFileSync(OUT, JSON.stringify({ source: "https://www.rawrtools.com/factories", fetchedAt: new Date().toISOString(), buildings: out }, null, 1));
console.log("wrote", OUT);
