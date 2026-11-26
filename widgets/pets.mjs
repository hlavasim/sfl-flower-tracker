// PETS as widgets. The pet state is section=pets (core/sections/pets.mjs: boosts, parsed pets, the
// per-pet daily calc and the feeding table); these shape it:
//   🐾 Pets — totals, what one full feed of fetching earns and the daily pet income per pet.
//   🐉 NFT pet collection — the seven NFT breeds, owned or missing, with what each can fetch.
//   💱 Pet resource market — every fetchable resource: price, energy, FLOWER per energy.
//   🐶 Pet cards — per pet: best fetch, every fetch, today's feeding, FLOWER/day, XP, level perks.
import { PET_FETCH_DATA } from "../core/data/pets.mjs";
import { petFetchYield, petCumulativeXp, petLevel } from "../core/engine/pets.mjs";
import { bar, kpis, bigBar, pill } from "../ui/viz.mjs";
import { big, compact, ring as gRing, rows as gRows } from "../ui/glance.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (ctx, n) => (typeof ctx.icon === "function" ? ctx.icon(n) : "");
const fl = (ctx) => ctx.flower || "🌸";
const petIcon = (ctx, p) => icon(ctx, p.isNft && p.nftId != null ? `Pet #${p.nftId}` : p.name);
const item = (ctx, n) => `<span class="v-item">${icon(ctx, n)}${esc(n)}</span>`;

export const NFT_BREED_TYPES = ["Dragon", "Phoenix", "Griffin", "Ram", "Warthog", "Wolf", "Bear"];

export const PET_LEVEL_PERKS = [
  { level: 1, perk: "Acorn fetch", type: "resource", nftOnly: false, detail: "Acorn (100⚡)" },
  { level: 3, perk: "Primary resource", type: "resource", nftOnly: false, detail: "Category resource (200⚡)" },
  { level: 5, perk: "+5 fetch energy", type: "energy", nftOnly: false, value: 5 },
  { level: 7, perk: "Secondary resource", type: "resource", nftOnly: false, detail: "Category resource (200⚡)" },
  { level: 10, perk: "Unlock hard request", type: "request", nftOnly: false, commonOnly: true, detail: "+300 energy, +300 XP per feed" },
  { level: 12, perk: "Moonfur fetch", type: "resource", nftOnly: true, detail: "Moonfur (1000⚡)" },
  { level: 15, perk: "+10% extra fetch resource", type: "bonus", nftOnly: false, value: 0.10 },
  { level: 18, perk: "+1 Acorn", type: "acorn", nftOnly: false },
  { level: 20, perk: "Fossil Shell fetch", type: "resource", nftOnly: false, detail: "Fossil Shell (300⚡)" },
  { level: 25, perk: "Tertiary resource", type: "resource", nftOnly: true, detail: "Category resource (200⚡)" },
  { level: 27, perk: "+10% XP per feed", type: "xp", nftOnly: false, value: 0.10 },
  { level: 30, perk: "2nd medium request", type: "request", nftOnly: true, detail: "+100 energy, +100 XP per feed" },
  { level: 35, perk: "+5 fetch energy", type: "energy", nftOnly: false, value: 5 },
  { level: 40, perk: "+15% XP per feed (25% total)", type: "xp", nftOnly: true, value: 0.15 },
  { level: 50, perk: "+5% extra fetch resource (15%)", type: "bonus", nftOnly: false, value: 0.05 },
  { level: 60, perk: "+1 guaranteed non-Acorn/Moonfur", type: "guaranteed", nftOnly: true },
  { level: 75, perk: "+5 fetch energy", type: "energy", nftOnly: false, value: 5 },
  { level: 85, perk: "+25% XP per feed (50% total)", type: "xp", nftOnly: true, value: 0.25 },
  { level: 100, perk: "+10% extra fetch resource (25%)", type: "bonus", nftOnly: false, value: 0.10 },
  { level: 150, perk: "+25% extra Moonfur (50% total)", type: "moonfur", nftOnly: true, value: 0.25 },
  { level: 200, perk: "2nd hard request", type: "request", nftOnly: true, detail: "+300 energy, +300 XP per feed" },
];

// Every unlocked fetch of a pet with what a full tank of energy brings, best first.
export function petFetches(pet, p2pPrices = {}, fetchBoosts = {}) {
  const fetchData = PET_FETCH_DATA[pet.petType] || [];
  const unlocked = fetchData.filter((f) => pet.level >= f.level);
  const locked = fetchData.filter((f) => pet.level < f.level);
  const rows = unlocked.map((f) => {
    const price = p2pPrices[f.res] || 0;
    const fetches = Math.floor(pet.energy / f.energy);
    const perFetch = petFetchYield(f.res, pet.level, pet.isNft, fetchBoosts);
    return { ...f, price, ratio: price > 0 ? (price * perFetch) / f.energy : 0, fetches, totalSfl: fetches * price * perFetch };
  }).sort((a, b) => b.totalSfl - a.totalSfl);
  return { rows, locked, best: rows.find((f) => f.totalSfl > 0) || null, known: fetchData.length > 0 };
}

const petsNeed = (farmId) => ({ pets: { res: "compute", farm: farmId, section: "pets" } });

// ── 🐾 Summary ──
export const petsSummary = {
  type: "pets-summary",
  title: "🐾 Pets — earnings",
  page: "pets",
  needs: petsNeed,
  // data: { pets: section=pets }; ctx: { icon(name) → HTML, flower → HTML }
  view({ pets: d } = {}, ctx = {}) {
    if (!d || !Array.isArray(d.pets)) return { empty: "No pet data." };
    const pets = d.pets;
    if (!pets.length) return { html: `<div class="w-empty-msg">No pets found on this farm. <a class="v-rm-link" href="https://sfl.world/info/pets" target="_blank" rel="noopener">Learn about pets →</a></div>` };
    const energy = pets.reduce((s, p) => s + p.energy, 0);
    const nft = pets.filter((p) => p.isNft).length;
    let perFeed = 0, daily = 0;
    const lines = [];
    for (const p of pets) {
      const { best } = petFetches(p, d.p2pPrices || {}, d.fetchBoosts || {});
      const day = p.calc && p.calc.dailySfl > 0 ? p.calc.dailySfl : 0;
      daily += day;
      if (best) { perFeed += best.totalSfl; lines.push({ p, best, day }); }
    }
    let html = kpis([{ v: pets.length, l: "pets" }, { v: pets.length - nft, l: "common" }, { v: nft, l: "NFT" },
      { v: `${energy.toLocaleString()} ⚡`, l: "total energy" }]);
    if (perFeed > 0) {
      html += kpis([{ v: perFeed.toFixed(2), l: "FLOWER per full fetch round" }, ...(daily > 0 ? [{ v: `${daily.toFixed(2)}/day`, l: "daily pet income" }] : [])]);
      const top = Math.max(...lines.map((x) => x.best.totalSfl));
      html += `<div class="v-pet-lines">` + lines.map(({ p, best, day }) =>
        `<div class="v-pet-line"><span class="v-name">${petIcon(ctx, p)}<b>${esc(p.name)}</b></span>` +
        `<span>${item(ctx, best.res)} ×${best.fetches} = <b class="v-done">${best.totalSfl.toFixed(2)}</b> ${fl(ctx)}${day > 0 ? ` <span class="v-dim">(${day.toFixed(2)}/day)</span>` : ""}</span>` +
        bar((best.totalSfl / top) * 100, "ok") + `</div>`).join("") + `</div>`;
    }
    const boosts = [];
    if (d.hasVictoriasApron) boosts.push(`${icon(ctx, "Victoria's Apron")}Victoria's Apron (1.5× feeds)`);
    if (d.hasPetBowls) boosts.push(`${icon(ctx, "Pet Bowls")}Pet Bowls (+10 XP/request)`);
    if (boosts.length) html += `<div class="v-dim v-rm-note">🎯 ${boosts.join(" · ")}</div>`;
    return { html };
  },
};

// ── 🐉 NFT collection ──
// breed → { id, level, xp, energy } of the NFT pets the farm owns
function nftBreedsOwned(farm) {
  const owned = {};
  for (const [id, pet] of Object.entries((farm.pets && farm.pets.nfts) || {})) {
    const breed = (pet.traits && pet.traits.type) || "Unknown";
    if (NFT_BREED_TYPES.includes(breed)) {
      const xp = pet.experience || 0;
      owned[breed] = { id, level: petLevel(xp), xp, energy: pet.energy || 0 };
    }
  }
  return owned;
}
export const petsNftCollection = {
  type: "pets-nft-collection",
  title: "🐉 NFT pet collection",
  page: "pets",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  view({ farm } = {}, ctx = {}) {
    if (!farm) return { empty: "No farm data." };
    const owned = nftBreedsOwned(farm);
    const n = Object.keys(owned).length;
    let html = kpis([{ v: `${n} / ${NFT_BREED_TYPES.length}`, l: "breeds owned" }]) + bigBar((n / NFT_BREED_TYPES.length) * 100);
    html += `<div class="v-pet-grid">` + NFT_BREED_TYPES.map((breed) => {
      const o = owned[breed];
      const fd = PET_FETCH_DATA[breed] || [];
      const lv25 = fd.find((f) => f.level === 25);
      const res = fd.map((f) => `<span class="v-pet-chip${f.level === 25 ? " v-pet-unique" : f.res === "Moonfur" ? " v-pet-moon" : ""}">` +
        `${o && o.level >= f.level ? "✅" : "🔒"} ${icon(ctx, f.res)}${esc(f.res)} <small class="v-pol-sub">Lv${f.level} · ${f.energy}⚡</small></span>`).join("");
      return `<div class="v-pet-card${o ? "" : " v-pet-missing"}"><div class="v-pet-head"><span class="v-name">${icon(ctx, o ? `Pet #${o.id}` : breed)}<b>${esc(breed)}</b></span>` +
        `${o ? pill("OWNED", "ok") : pill("MISSING", "bad")}</div>` +
        (o ? `<div class="v-dim">Pet #${esc(o.id)} · Lv ${o.level} · ${o.energy.toLocaleString()} ⚡</div>` : `<div class="v-rm-neg">Not owned — buy from the marketplace</div>`) +
        `<div class="v-pet-chips">${res}</div>` +
        (lv25 ? `<div class="v-dim">Unique: ${item(ctx, lv25.res)} — ${o && o.level >= 25 ? "✅ unlocked" : "🔒 Lv25 required"}</div>` : "") + `</div>`;
    }).join("") + `</div>`;
    return { html };
  },
};

// ── 💱 Resource market ──
export const petsMarket = {
  type: "pets-market",
  title: "💱 Pet resource market",
  page: "pets",
  needs: petsNeed,
  defaults: {},
  rowKey: (r) => r.res,
  rowLabel: (r) => r.res,
  rowClass: (r) => (r.ratio > 0 ? "" : "w-st-done"),
  columns: [
    { key: "res", label: "resource", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<b>${esc(v)}</b></div>` },
    { key: "price", label: "price", align: "right", fmt: (v) => (v > 0 ? v.toFixed(2) : "—") },
    { key: "energy", label: "⚡ cost", align: "right" },
    { key: "ratio", label: "FLOWER/⚡", align: "right", title: "price ÷ the energy one fetch costs",
      fmt: (v, r) => (v > 0 ? `<div class="v-rm-val">${v.toFixed(4)}${bar(r.pct, "ok")}</div>` : "—") },
  ],
  build({ pets: d } = {}, ctx = {}) {
    if (!d || !d.p2pPrices) return { rows: [], footer: "", empty: "No price data." };
    const seen = new Map();
    for (const entries of Object.values(PET_FETCH_DATA)) for (const e of entries) {
      if (seen.has(e.res)) continue;
      const price = d.p2pPrices[e.res] || 0;
      seen.set(e.res, { res: e.res, price, energy: e.energy, ratio: price > 0 ? price / e.energy : 0, iconHtml: icon(ctx, e.res) });
    }
    const rows = [...seen.values()].sort((a, b) => b.ratio - a.ratio);
    const top = rows.length ? rows[0].ratio : 0;
    for (const r of rows) r.pct = top > 0 ? (r.ratio / top) * 100 : 0;
    return { rows, footer: "", empty: "No fetchable resources." };
  },
};

// ── 🐶 Pet cards ──
function perkDelta(perk, pet, calc, fetchData, p2p, feedMultiplier) {
  const span = (t, cls = "v-done") => `<span class="v-pet-delta ${cls}">${t}</span>`;
  if (!calc.bestRes) return "";
  const bestPrice = p2p[calc.bestRes.res] || 0;
  let d = 0;
  if (perk.type === "energy" && perk.value) d = (perk.value / calc.bestRes.energy) * bestPrice * (1 + calc.extraChance) * feedMultiplier;
  else if (perk.type === "bonus" && perk.value) d = calc.fetchesPerDay * bestPrice * perk.value;
  else if (perk.type === "acorn") d = (p2p["Acorn"] || 0) * feedMultiplier;
  else if (perk.type === "request") d = (((perk.detail && perk.detail.includes("300") ? 300 : 100) * feedMultiplier) / calc.bestRes.energy) * bestPrice * (1 + calc.extraChance);
  else if (perk.type === "resource") {
    const m = fetchData.find((f) => f.level === perk.level);
    if (m && (p2p[m.res] || 0) / m.energy > calc.bestSflPerEnergy) return span("better FLOWER/⚡!", "v-rm-gapok");
    return "";
  } else if (perk.type === "xp") return span("XP boost", "v-dim");
  else if (perk.type === "guaranteed") {
    const best = fetchData.filter((f) => pet.level >= f.level && f.res !== "Acorn" && f.res !== "Moonfur")
      .reduce((b, f) => { const p = p2p[f.res] || 0; return p > ((b && b.price) || 0) ? { res: f.res, price: p } : b; }, null);
    if (best && best.price > 0) d = best.price * calc.fetchesPerDay;
  } else if (perk.type === "moonfur" && perk.value) {
    const mf = fetchData.find((f) => f.res === "Moonfur"), price = p2p["Moonfur"] || 0;
    if (mf && price > 0) { const v = (calc.dailyEnergy / mf.energy) * price * perk.value; return v > 0.001 ? span(`+${v.toFixed(3)} FLOWER/d (Moonfur)`) : ""; }
  }
  return d > 0.001 ? span(`+${d.toFixed(3)} FLOWER/d`) : "";
}

function petDetail(pet, d, ctx, opts) {
  const p2p = d.p2pPrices || {};
  const fetchData = PET_FETCH_DATA[pet.petType] || [];
  const calc = pet.calc || {};
  const F = fl(ctx);
  let h = "";
  if (fetchData.length && pet.energy > 0) {
    const { rows, locked, best } = petFetches(pet, p2p, d.fetchBoosts || {});
    if (best) h += `<div class="v-pet-best">→ Fetch ${item(ctx, best.res)} ×${best.fetches} = <b>${best.totalSfl.toFixed(2)}</b> ${F} <span class="v-dim">(${best.energy} ⚡ each)</span></div>`;
    h += `<table class="w-table w-compact v-pet-t"><thead><tr><th>fetch</th><th style="text-align:right">price</th><th style="text-align:right">⚡</th><th style="text-align:right">×</th><th style="text-align:right">total</th></tr></thead><tbody>` +
      rows.map((f, i) => `<tr${i === 0 && f.totalSfl > 0 ? ` class="w-st-ready"` : ""}><td>${i === 0 && f.totalSfl > 0 ? "★ " : ""}${item(ctx, f.res)}</td>` +
        `<td style="text-align:right">${f.price > 0 ? f.price.toFixed(2) : "—"}</td><td style="text-align:right">${f.energy}</td><td style="text-align:right">×${f.fetches}</td>` +
        `<td style="text-align:right">${f.totalSfl > 0 ? `<b class="v-done">${f.totalSfl.toFixed(2)}</b>` : "—"}</td></tr>`).join("") +
      (opts.showLocked === false ? "" : locked.map((f) => `<tr class="w-st-done"><td>🔒 ${item(ctx, f.res)}</td><td colspan="4" style="text-align:right">Lv ${f.level}</td></tr>`).join("")) +
      `</tbody></table>`;
  } else if (fetchData.length) h += `<div class="v-dim">No energy — the pet needs to recharge</div>`;
  else h += `<div class="v-dim">Unknown pet type — no fetch data available</div>`;

  // today's requests: what each costs to cook and pays back, ranked by energy per FLOWER
  if (pet.feeding && pet.feeding.length) {
    const bestEff = Math.max(...pet.feeding.map((r) => r.energyPerSfl || 0), 0);
    const tone = { easy: "ok", medium: "run", hard: "bad" };
    h += `<div class="v-pet-sec">Feeding</div><table class="w-table w-compact v-pet-t"><thead><tr><th>food</th><th style="text-align:right">energy</th><th style="text-align:right">XP</th><th style="text-align:right">cost</th><th style="text-align:right">⚡ per ${F}</th></tr></thead><tbody>` +
      pet.feeding.map((r) => {
        const price = r.price != null ? (r.price < 0.01 ? r.price.toFixed(4) : r.price.toFixed(3)) : "—";
        const eff = r.energyPerSfl != null ? Math.round(r.energyPerSfl).toLocaleString() : "—";
        const pct = bestEff > 0 && r.energyPerSfl ? Math.max(4, Math.round((r.energyPerSfl / bestEff) * 100)) : 0;
        return `<tr class="${r.fed ? "w-st-done" : r.best ? "w-st-ready" : ""}"><td>${pill(r.difficulty.toUpperCase(), tone[r.difficulty] || "idle")} ${r.fed ? "✅ " : r.best ? "★ " : ""}${item(ctx, r.food)}</td>` +
          `<td style="text-align:right">${r.energy}</td><td style="text-align:right">${Math.round(r.xp)}</td><td style="text-align:right">${price}</td>` +
          `<td style="text-align:right"><div class="v-rm-val">${eff}${pct ? bar(pct, "ok") : ""}</div></td></tr>`;
      }).join("") + `</tbody></table>` +
      `<div class="v-dim v-rm-note">${pet.feeding.filter((r) => r.fed).length}/${pet.feeding.length} fed today · cost = cooking it from ingredients at market price · the last column is energy bought per ${F} — higher is better value</div>`;
  } else if (pet.foods && pet.foods.length) {
    h += `<div class="v-pet-sec">Food requests</div><div class="v-pet-chips">${pet.foods.map((f) => `<span class="v-pet-chip">${item(ctx, f)}</span>`).join("")}</div>`;
  }

  if (calc.dailySfl > 0 && calc.bestRes) {
    const extra = Math.round(calc.extraChance * 100);
    h += `<div class="v-pet-best">📈 <b>${calc.dailySfl.toFixed(2)}</b> ${F}/day <span class="v-dim">— fetch ${item(ctx, calc.bestRes.res)}</span>` +
      `<div class="v-dim">${calc.energyPerFeed}⚡/feed × ${calc.feedMult} feeds/day = ${Math.round(calc.dailyEnergy)}⚡/day → ${(calc.dailyEnergy / calc.bestRes.energy).toFixed(1)} fetches` +
      `${extra > 0 ? ` (+${extra}% extra)` : ""}${calc.acornBonus > 0 ? ` + ${calc.acornBonus.toFixed(2)} acorn bonus` : ""}${calc.guaranteedBonus > 0 ? ` + ${calc.guaranteedBonus.toFixed(2)} guaranteed` : ""}</div></div>`;
  }

  // XP to the next level, and when the next perk lands
  const lvXp = petCumulativeXp(pet.level), nextXp = petCumulativeXp(pet.level + 1);
  const inLv = pet.xp - lvXp, need = nextXp - lvXp;
  const pct = need > 0 ? Math.min(100, Math.round((inLv / need) * 100)) : 100;
  const applies = (p) => !((p.nftOnly && !pet.isNft) || (p.commonOnly && pet.isNft));
  const next = PET_LEVEL_PERKS.find((p) => p.level > pet.level && applies(p));
  let toNext = "";
  if (next && calc.dailyXp > 0) {
    const x = petCumulativeXp(next.level) - pet.xp;
    if (x > 0) toNext = ` → Lv ${next.level} (${next.perk}) in ~${Math.ceil(x / calc.dailyXp)}d`;
  }
  h += `<div class="v-pet-xp">📊 Lv ${pet.level} — ${inLv.toLocaleString()} / ${need.toLocaleString()} XP (${pct}%) <span class="v-dim">~${Math.round(calc.dailyXp || 0)} XP/day${esc(toNext)}</span>${bar(pct)}</div>`;

  const perks = PET_LEVEL_PERKS.map((perk) => {
    const na = !applies(perk), done = pet.level >= perk.level, isNext = !na && !done && perk === next;
    const mark = na ? "⛔" : done ? "✅" : isNext ? "🔸" : "🔒";
    let desc = esc(perk.perk);
    if (perk.type === "resource" && fetchData.length) {
      const m = fetchData.find((f) => f.level === perk.level);
      if (m) desc = `${item(ctx, m.res)} fetch (${m.energy}⚡)`;
    }
    let days = "";
    if (!na && !done && calc.dailyXp > 0) {
      const x = petCumulativeXp(perk.level) - pet.xp;
      if (x > 0) days = `<span class="v-dim">~${Math.ceil(x / calc.dailyXp)}d</span>`;
    }
    const delta = !na && !done ? perkDelta(perk, pet, calc, fetchData, p2p, d.feedMultiplier || 1) : "";
    const cls = na ? "v-pet-na" : done ? "v-pet-done" : isNext ? "v-pet-next" : "";
    return `<div class="v-pet-perk ${cls}"><span>${mark} Lv ${perk.level}</span><span class="v-pet-desc">${desc}${na ? (perk.nftOnly ? " [NFT only]" : " [Common only]") : ""}${isNext ? " ← NEXT" : ""}</span>${days}${delta}</div>`;
  }).join("");
  h += `<div class="v-pet-sec">Level perks</div>${perks}`;
  return h;
}

// XP inside the current level, and the next perk this pet can get with the days to it.
export function petProgress(pet) {
  const calc = pet.calc || {};
  const lvXp = petCumulativeXp(pet.level), nextXp = petCumulativeXp(pet.level + 1);
  const inLv = pet.xp - lvXp, need = nextXp - lvXp;
  const pct = need > 0 ? Math.min(100, Math.round((inLv / need) * 100)) : 100;
  const next = PET_LEVEL_PERKS.find((p) => p.level > pet.level && (!p.nftOnly || pet.isNft) && (!p.commonOnly || !pet.isNft));
  let days = null;
  if (next && calc.dailyXp > 0) { const x = petCumulativeXp(next.level) - pet.xp; if (x > 0) days = Math.ceil(x / calc.dailyXp); }
  return { inLv, need, pct, next: next || null, days };
}

const PET_PICK = [["", "All pets"], ["nft", "NFT pets"], ["common", "Common pets"]];
export const petCards = {
  type: "pet-cards",
  title: "🐶 Pets — one by one",
  titleFor: (o) => (o.which === "nft" ? "🐉 NFT pets — one by one" : o.which === "common" ? "🐶 Common pets — one by one" : "🐶 Pets — one by one"),
  page: "pets",
  needs: petsNeed,
  optionsLabel: "Show",
  options: [
    { key: "which", label: "Pets", kind: "select", choices: PET_PICK },
    { key: "showLocked", label: "Show locked fetches in the detail", kind: "bool" },
    { key: "openDetail", label: "Open every detail", kind: "bool" },
  ],
  defaults: { opts: { which: "", showLocked: true, openDetail: false } },
  rowKey: (r) => r.key,
  rowLabel: (r) => r.name,
  columns: [
    { key: "name", label: "pet", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b><small>${esc(r.sub)}</small></div></div>` },
    { key: "level", label: "Lv", align: "right" },
    { key: "energy", label: "⚡", align: "right", fmt: (v) => v.toLocaleString() },
    { key: "bestSfl", label: "best fetch now", align: "right", title: "The best unlocked fetch for the energy the pet has now",
      fmt: (v, r) => (r.best ? `${r.bestHtml} = <b class="v-done">${v.toFixed(2)}</b>` : `<span class="v-dim">${esc(r.noFetch)}</span>`) },
    { key: "daily", label: "FLOWER/day", align: "right", fmt: (v, r) => (v > 0 ? `<b>${v.toFixed(2)}</b><small class="v-dim v-pol-sub"> ${r.dailyRes}</small>` : "—") },
    { key: "xp", label: "XP", get: (r) => r.prog.pct, fmt: (v, r) => `<div class="v-rm-val"><small class="v-dim v-pol-sub">${r.prog.inLv.toLocaleString()} / ${r.prog.need.toLocaleString()} (${v}%)</small>${bar(v)}</div>` },
    { key: "next", label: "next perk", get: (r) => r.prog.days, fmt: (v, r) => (r.prog.next ? `Lv ${r.prog.next.level} <small class="v-dim v-pol-sub">${esc(r.prog.next.perk)}${v != null ? ` · ~${v}d` : ""}</small>` : "—") },
    { key: "fed", label: "fed today", align: "right", extra: true, get: (r) => (r.feedN ? r.fedN / r.feedN : null), fmt: (v, r) => (r.feedN ? `${r.fedN}/${r.feedN}` : "—") },
    { key: "detail", label: "detail", fmt: (v, r) => `<details class="v-rm-more"${r.open ? " open" : ""}><summary>fetches · feeding · perks</summary>${r.detailHtml}</details>` },
  ],
  // data: { pets: section=pets }; ctx: { icon(name) → HTML, flower → HTML }
  build({ pets: d } = {}, ctx = {}, opts = {}) {
    if (!d || !Array.isArray(d.pets)) return { rows: [], footer: "", empty: "No pet data." };
    const list = d.pets.filter((p) => (opts.which === "nft" ? p.isNft : opts.which === "common" ? !p.isNft : true));
    const rows = list.map((p) => {
      const known = (PET_FETCH_DATA[p.petType] || []).length > 0;
      const { best } = petFetches(p, d.p2pPrices || {}, d.fetchBoosts || {});
      const calc = p.calc || {};
      return { key: p.isNft ? `nft:${p.nftId}` : p.name, name: p.name, level: p.level, energy: p.energy,
        sub: `${p.species || ""}${p.isNft ? " · NFT" : ""}`, iconHtml: petIcon(ctx, p),
        best, bestSfl: best ? best.totalSfl : 0, bestHtml: best ? `${item(ctx, best.res)} ×${best.fetches}` : "",
        noFetch: !known ? "unknown pet type" : p.energy > 0 ? "nothing priced" : "no energy",
        daily: calc.dailySfl > 0 && calc.bestRes ? calc.dailySfl : 0, dailyRes: calc.bestRes ? item(ctx, calc.bestRes.res) : "",
        prog: petProgress(p), feedN: (p.feeding || []).length, fedN: (p.feeding || []).filter((r) => r.fed).length,
        open: !!opts.openDetail, detailHtml: petDetail(p, d, ctx, { showLocked: opts.showLocked !== false }) };
    });
    const boosts = [];
    if (d.hasVictoriasApron) boosts.push(`${icon(ctx, "Victoria's Apron")}Victoria's Apron (1.5× feeds)`);
    if (d.hasPetBowls) boosts.push(`${icon(ctx, "Pet Bowls")}Pet Bowls (+10 XP/request)`);
    return { rows, footer: boosts.length ? `<div class="v-dim">🎯 ${boosts.join(" · ")}</div>` : "",
      empty: d.pets.length ? "No pets of this kind." : "No pets found on this farm." };
  },
};

// ── iPhone glance faces ──
const daily = (p) => (p.calc && p.calc.dailySfl > 0 ? p.calc.dailySfl : 0);
// earnings: S = the daily pet income; M = beside the top three pets; L = the top six under it
petsSummary.sizes = ["s", "m", "l"];
petsSummary.size = "s";
petsSummary.glance = ({ pets: d } = {}, ctx = {}, opts = {}, size = "s") => {
  if (!d || !Array.isArray(d.pets)) return { empty: "No pet data." };
  if (!d.pets.length) return { empty: "No pets found on this farm." };
  const total = d.pets.reduce((s, p) => s + daily(p), 0), nft = d.pets.filter((p) => p.isNft).length;
  const head = big(total.toFixed(2), { unit: " 🌸/day", cap: `${d.pets.length} pets · ${nft} NFT` });
  if (size === "s") return { html: head };
  const list = gRows(d.pets.slice().sort((a, b) => daily(b) - daily(a)).slice(0, size === "m" ? 3 : 6).map((p) => ({ icon: petIcon(ctx, p), name: p.name,
    sub: `Lv ${p.level} · ${compact(p.energy)} ⚡`, value: daily(p) > 0 ? `${daily(p).toFixed(2)}/d` : "—", tone: daily(p) > 0 ? "ok" : "" })));
  return { html: size === "m" ? `<div class="g-split"><div>${head}</div>${list}</div>` : head + list };
};

// NFT collection: S = breeds owned with a ring; M = beside the missing breeds; L = all seven
petsNftCollection.sizes = ["s", "m", "l"];
petsNftCollection.size = "s";
petsNftCollection.glance = ({ farm } = {}, ctx = {}, opts = {}, size = "s") => {
  if (!farm) return { empty: "No farm data." };
  const owned = nftBreedsOwned(farm), n = Object.keys(owned).length, all = NFT_BREED_TYPES.length;
  const head = `<div class="g-corner">${gRing((n / all) * 100, { tone: n === all ? "ok" : "accent" })}</div>` +
    big(n, { unit: `/${all}`, cap: n === all ? "every NFT breed ✓" : "NFT breeds owned" });
  if (size === "s") return { html: head };
  const row = (b) => (owned[b] ? { icon: icon(ctx, `Pet #${owned[b].id}`), name: b, sub: `Lv ${owned[b].level} · ${compact(owned[b].energy)} ⚡`, chip: { text: "OWNED", tone: "ok" } }
    : { icon: icon(ctx, b), name: b, chip: { text: "MISSING", tone: "bad" } });
  if (size === "l") return { html: gRows(NFT_BREED_TYPES.map(row)) };
  const missing = NFT_BREED_TYPES.filter((b) => !owned[b]);
  return { html: `<div class="g-split"><div>${head}</div>${gRows((missing.length ? missing : NFT_BREED_TYPES).slice(0, 3).map(row))}</div>` };
};

// resource market: S = the best FLOWER per energy; M / L = the best resources
petsMarket.sizes = ["s", "m", "l"];
petsMarket.size = "m";
petsMarket.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = petsMarket.build(data, ctx, opts);
  const priced = out.rows.filter((r) => r.ratio > 0);
  if (!priced.length) return { empty: out.rows.length ? "No fetchable resource has a price." : out.empty };
  if (size === "s") {
    const r = priced[0];
    return { html: `<div class="g-hero">${r.iconHtml}</div>` + big(r.ratio.toFixed(4), { cap: `${r.res} · 🌸 per ⚡` }) };
  }
  return { html: gRows(priced.slice(0, size === "m" ? 3 : 7).map((r) => ({ icon: r.iconHtml, name: r.res,
    sub: `${r.price.toFixed(2)} · ${r.energy} ⚡`, value: r.ratio.toFixed(4) }))) };
};

// one by one: S = today's requests fed, with a ring; M / L = each pet with what is left to feed
petCards.sizes = ["s", "m", "l"];
petCards.size = "m";
petCards.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = petCards.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const fed = out.rows.reduce((s, r) => s + r.fedN, 0), all = out.rows.reduce((s, r) => s + r.feedN, 0);
  if (size === "s") {
    if (!all) return { html: big(out.rows.length, { unit: " pets", cap: "no food requests today" }) };
    return { html: `<div class="g-corner">${gRing((fed / all) * 100, { tone: fed === all ? "ok" : "warn" })}</div>` +
      big(fed, { unit: `/${all}`, cap: fed === all ? "all requests fed ✓" : "requests fed today" }) };
  }
  // the pets with the most left to feed first, then by FLOWER/day
  const list = out.rows.slice().sort((a, b) => (b.feedN - b.fedN) - (a.feedN - a.fedN) || b.daily - a.daily).slice(0, size === "m" ? 3 : 7);
  return { html: gRows(list.map((r) => ({ icon: r.iconHtml, name: r.name, sub: `Lv ${r.level}${r.daily > 0 ? ` · ${r.daily.toFixed(2)} 🌸/d` : ""}`,
    ...(r.feedN ? { chip: r.fedN < r.feedN ? { text: `${r.feedN - r.fedN} to feed`, tone: "warn" } : { text: "FED", tone: "ok" } } : {}) }))) };
};
