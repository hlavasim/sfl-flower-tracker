// POWER as widgets: what the farm's boosts earn, what to buy next, and what is owned but idle.
// The numbers come from compute?section=power (core/sections/power.mjs, POSTed with the measured
// harvests: the store's computeHist resource); these widgets only shape them. What the page still
// computes in the browser (the skill-rank ladder, the crop machine queue, pets, cost tables, the
// production breakdown) reaches a widget through ctx, so a pinned copy shows the same figures.
import { POWER_CATEGORIES, getDefaultProduct, isAnimalCat, SEED_DATA } from "../core/engine/power-helpers.mjs";
import { CROP_GROW_DATA, FRUIT_GROW_DATA, GREENHOUSE_GROW_DATA } from "../core/engine/power-boosts.mjs";
import { getPriceProduct } from "../core/engine/buds.mjs";
import { bar, kpis, bigBar, pill } from "../ui/viz.mjs";
import { compact } from "../ui/glance.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (ctx, n) => (typeof ctx.icon === "function" && n ? ctx.icon(n) : "");
const fl = (ctx) => (typeof ctx.sfl === "function" ? ctx.sfl() : "FLOWER");
const call = (ctx, fn, ...a) => (typeof ctx[fn] === "function" ? ctx[fn](...a) : null);
const tone = (v) => (v > 0 ? "var(--c-green)" : v < 0 ? "var(--c-red)" : "var(--c-dim)");
const signed = (v, d) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;
const colored = (v, d, suffix = "") => `<span style="color:${tone(v)};font-weight:600">${signed(v, d)}${suffix}</span>`;
const units = (u) => (u % 1 < 0.01 ? u.toFixed(0) : u.toFixed(1));
// tiles like kpis(), but a value may carry trusted HTML (an icon) and a colour
const tiles = (list) => `<div class="v-kpis">` + list.map((k) =>
  `<div class="v-kpi"><b${k.c ? ` style="color:${k.c}"` : ""}>${k.h}</b><span>${esc(k.l)}</span></div>`).join("") + `</div>`;
const NO_DATA = { rows: [], footer: "", empty: "No POWER data yet." };
const CAT_CHOICES = Object.entries(POWER_CATEGORIES).map(([id, d]) => [id, `${d.emoji} ${d.label}`]);

// What the store loads for every POWER widget: the farm and section=power with the saved products
// and the roadmap settings (shared with ROADMAP), a copy's own product for its category and its own
// efficiency basis laid over them. Without own options the key is the same for every widget.
function ls(k, d) { try { return (globalThis.localStorage && globalThis.localStorage.getItem(k)) || d; } catch { return d; } }
const parsed = (k) => { try { return JSON.parse(ls(k, "{}")) || {}; } catch { return {}; } };
export const powerQuery = (farmId, opts = {}) => {
  const ownProduct = validProduct(opts.cat, opts.product);
  const ownEff = opts.eff === "real" || opts.eff === "theoretical";
  return { res: "computeHist", farm: farmId, section: "power", weeks: true, q: {
    products: ownProduct ? JSON.stringify({ ...parsed("sfl_power_products"), [opts.cat]: opts.product }) : ls("sfl_power_products", "{}"),
    roadmap: ownEff ? JSON.stringify({ ...parsed("sfl_roadmap_settings"), effMode: opts.eff }) : ls("sfl_roadmap_settings", "{}") } };
};
const needs = (farmId, opts = {}) => ({ farm: { res: "farm", farm: farmId }, power: powerQuery(farmId, opts) });
// The efficiency basis a copy may fix (blank = the setting shared with ROADMAP).
const EFF_OPT = { key: "eff", label: "Efficiency basis", kind: "select", choices: [["", "same as ROADMAP"], ["real", "last 7 days (actual)"], ["theoretical", "100% (theoretical)"]] };
// The products a category can be valued on (crops, fruits, greenhouse, flowers).
export function productChoices(catId) {
  const sel = (POWER_CATEGORIES[catId] || {}).selector;
  const list = sel === "crop" ? Object.keys(CROP_GROW_DATA).map((k) => [k, k]) : sel === "fruit" ? Object.keys(FRUIT_GROW_DATA).map((k) => [k, k])
    : sel === "greenhouse" ? Object.keys(GREENHOUSE_GROW_DATA).map((k) => [k, k]) : sel === "flower" ? Object.keys(SEED_DATA).map((k) => [k, SEED_DATA[k].label]) : [];
  return list.length ? [["", "the saved one (default)"], ...list] : [];
}
// a copy's product only counts for the category it belongs to (the category may have changed since)
const validProduct = (catId, product) => (product && productChoices(catId).some(([v]) => v === product) ? product : "");

// ROI colour ramp: green (fast) → white at 2 years → red at 4 years and more.
export function roiColor(days) {
  if (!isFinite(days) || !(days > 0)) return "";
  const G = [48, 209, 88], W = [255, 255, 255], R = [255, 107, 107];
  const mix = (a, b, u) => a.map((v, i) => Math.round(v + (b[i] - v) * u));
  const c = days <= 730 ? mix(G, W, days / 730) : mix(W, R, Math.min(1, (days - 730) / 730));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// category → its boosts (the same objects as boostItems)
export function catBoostsOf(power) {
  const all = (power && power.boostItems) || [];
  const out = {};
  for (const catId of Object.keys(POWER_CATEGORIES)) out[catId] = all.filter((b) => (b.categories || []).includes(catId));
  return out;
}
// A boost's served value in a category; roi null (JSON Infinity) → Infinity.
export function boostVal(power, catId, b) {
  const v = (power.boostValues && power.boostValues[catId] && power.boostValues[catId][b.name]) || { solo: 0, synergy: 0, roi: null };
  return { ...v, roi: v.roi == null ? Infinity : v.roi };
}
const productOf = (ctx, catId, own) => own || ((call(ctx, "products") || {})[catId]) || getDefaultProduct(catId);
const costLabel = (b, ctx) => (b.type === "Skill" && b.floor > 0 ? `~${b.floor.toFixed(0)} ${fl(ctx)} (${b.skillPoints}pt${b.rankShards ? ` + ${b.rankShards}◆` : ""})`
  : b.markCost > 0 ? `${b.floor.toFixed(0)} ${fl(ctx)} (${(b.markCost / 1000).toFixed(0)}k⚔️)`
  : b.floor > 0 ? `${b.floor.toFixed(0)} ${fl(ctx)}` : "");
const typeLabel = (b) => (b.type === "Skill" ? `Skill (${b.skillTree}, ${b.skillPoints}pt)` : b.type);
const boostIcon = (ctx, b) => (b.type !== "Skill" ? icon(ctx, b.name) : `<span class="v-power-skill">🧠</span>`);

// The missing boosts with a value, best payback first.
export function bestBuys(power) {
  const cb = catBoostsOf(power), out = [];
  for (const [catId, def] of Object.entries(POWER_CATEGORIES)) {
    if (!def.quantifiable && !def.side) continue;
    for (const b of cb[catId].filter((x) => !x.has && !x.owned && !x.isDisabled && x.floor > 0)) {
      const v = boostVal(power, catId, b);
      if (v.synergy > 0.0001) out.push({ boost: b, catId, catLabel: def.label, synergy: v.synergy, roi: v.roi, floor: b.floor });
    }
  }
  return out.sort((a, b) => a.roi - b.roi);
}

// ── 💰 POWER totals ──────────────────────────────────────────────────────────────────────────────
export const powerTotals = {
  type: "power-totals",
  title: "💰 POWER – totals",
  page: "power",
  needs,
  // ctx: { restock(power) → {restockPerDay, restockFrequencyDays, gemCost}, sfl() → FLOWER icon HTML, icon(name) }
  view({ power } = {}, ctx = {}) {
    if (!power || !power.boostItems) return { empty: "No POWER data yet." };
    const c = power.categories || { totalBaseSfl: 0, totalBoostedSfl: 0, totalCostSfl: 0 };
    const r = call(ctx, "restock", power) || { restockPerDay: 0 };
    const owned = power.boostItems.filter((b) => b.has || b.owned).length, total = power.boostItems.length;
    const cost = c.totalCostSfl + (r.restockPerDay || 0), gross = c.totalBoostedSfl, net = gross - cost;
    const delta = gross - c.totalBaseSfl, pct = c.totalBaseSfl > 0 ? ((delta / c.totalBaseSfl) * 100).toFixed(0) : 0;
    const F = fl(ctx);
    let html = tiles([
      { h: `${owned} / ${total}`, l: "boosts owned", c: "var(--c-green)" },
      { h: `${gross.toFixed(2)} ${F}`, l: "gross revenue / day", c: "var(--c-yellow)" },
      { h: `-${cost.toFixed(2)} ${F}`, l: "costs / day", c: "var(--c-red)" },
      { h: `${net.toFixed(2)} ${F}`, l: "net profit / day", c: net >= 0 ? "var(--c-green)" : "var(--c-red)" },
      { h: `+${delta.toFixed(2)} ${F} (+${pct}%)`, l: "boost value / day" },
    ]) + bigBar(total ? (owned / total) * 100 : 0);
    if (r.restockPerDay > 0) html += `<div class="v-dim">Costs include the restock: ${r.restockPerDay.toFixed(4)} ${F}/day — every ${r.restockFrequencyDays.toFixed(1)} d, ${r.gemCost}💎.</div>`;
    const s = power.skillCostInfo;
    if (s && s.sflPerPoint > 0) {
      const br = s.bestRecipe, xpb = s.xpBoostNames && s.xpBoostNames.length;
      html += `<div class="v-power-note"><b>🧠 Skill point cost</b> · 1 point ≈ <b style="color:var(--c-yellow)">${s.sflPerPoint.toFixed(1)} ${F}</b>` +
        ` <span class="v-dim">(= the next level, ${((s.nextLevelXp || 0) / 1e6).toFixed(2)}M XP · average so far ${s.sflPerLevel.toFixed(1)} ${F}/level)</span><br>` +
        `Bumpkin level <b>${s.level}</b> → ${(s.totalXP / 1e6).toFixed(1)}M XP in total · best recipe ${icon(ctx, br.name)}<b>${esc(br.name)}</b> (${esc(br.building)}) — base ${br.xp} XP` +
        `${xpb ? ` → <span style="color:var(--c-green)">${br.boostedXP} XP</span> with boosts` : ""}<br>` +
        `${xpb ? `XP boosts: ${esc(s.xpBoostNames.join(", "))}<br>` : ""}` +
        `Ingredients: ${Object.entries(br.ingredients).map(([k, v]) => `${v}× ${icon(ctx, k)}${esc(k)}`).join(", ")} = ${br.cost.toFixed(4)} ${F}<br>` +
        `Efficiency <b>${br.ratio.toFixed(0)} XP/${F}</b> · to level ${s.level} in total ~${s.totalSFL.toFixed(0)} ${F}</div>`;
    }
    const marks = power.boostItems.filter((b) => b.markCost > 0).length;
    if (marks) html += `<div class="v-power-note"><b>⚔️ Faction marks</b> · 100 Marks = 1 ${F} · ${marks} faction items — priced from their Marks cost instead of an NFT floor.</div>`;
    if (power.valueBasis) html += `<div class="v-dim">Value basis: ${esc(power.valueBasis === "theoretical" ? "100% (theoretical)" : "measured last 7 days")}.</div>`;
    return { html };
  },
};

// ── 🏆 Best buys ─────────────────────────────────────────────────────────────────────────────────
export const powerBestBuys = {
  type: "power-best-buys",
  title: "🏆 Best buys (by ROI)",
  titleFor: (o) => `🏆 Top ${o.n || 10} buys${o.cat && POWER_CATEGORIES[o.cat] ? ` – ${POWER_CATEGORIES[o.cat].label}` : " (by ROI)"}`,
  page: "power",
  needs,
  optionsLabel: "Buys",
  options: [
    { key: "n", label: "How many", kind: "number", min: 1, max: 100 },
    { key: "cat", label: "Category", kind: "select", choices: [["", "all categories"], ...CAT_CHOICES.filter(([id]) => POWER_CATEGORIES[id].quantifiable || POWER_CATEGORIES[id].side)] },
    EFF_OPT,
  ],
  defaults: { opts: { n: 10, cat: "", eff: "" } },
  rowKey: (r) => `${r.name}|${r.catId}`,
  rowLabel: (r) => r.name,
  columns: [
    { key: "rank", label: "#", align: "right", fmt: (v) => `<span class="v-dim">${v}.</span>` },
    { key: "name", label: "boost", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b><small>${esc(r.emoji)} ${esc(r.catLabel)} · ${esc(r.type)}</small></div></div>` },
    { key: "synergy", label: "gain", align: "right", title: "FLOWER a day it would add (with what you own)", fmt: (v) => `<span style="color:var(--c-green);font-weight:600">+${v.toFixed(2)}</span><span class="v-dim">/day</span>` },
    { key: "floor", label: "price", align: "right", fmt: (v, r) => `${v.toFixed(0)} ${r.fl}` },
    { key: "roi", label: "ROI", align: "right", title: "days to earn the price back — green fast, white ≈ 2 years, red ≥ 4 years", fmt: (v) => `<b style="color:${roiColor(v)}">${v.toFixed(0)}d</b>` },
    { key: "year", label: "paid back in a year", get: (r) => Math.min(100, (365 / r.roi) * 100), fmt: (v) => bar(v) },
  ],
  build({ power } = {}, ctx = {}, opts = {}) {
    if (!power || !power.boostItems) return NO_DATA;
    const n = Math.max(1, Math.round(Number(opts.n)) || 10);
    const all = bestBuys(power).filter((x) => !opts.cat || x.catId === opts.cat);
    const rows = all.slice(0, n).map((x, i) => ({ rank: i + 1, name: x.boost.name, type: x.boost.type, catId: x.catId, catLabel: x.catLabel,
      emoji: POWER_CATEGORIES[x.catId].emoji, synergy: x.synergy, floor: x.floor, roi: x.roi, fl: fl(ctx), iconHtml: boostIcon(ctx, x.boost) }));
    const cost = rows.reduce((a, r) => a + r.floor, 0), gain = rows.reduce((a, r) => a + r.synergy, 0);
    const summary = rows.length ? tiles([{ h: String(all.length), l: "buys with a value" }, { h: `${rows[0].roi.toFixed(0)}d`, l: "best payback", c: roiColor(rows[0].roi) },
      { h: `${cost.toFixed(0)} ${fl(ctx)}`, l: `cost of these ${rows.length}` }, { h: `+${gain.toFixed(2)} ${fl(ctx)}`, l: "they would add / day", c: "var(--c-green)" }]) : "";
    return { rows, summary, footer: "", empty: "Nothing left to buy with a FLOWER value." };
  },
};

// ── 📊 Categories ────────────────────────────────────────────────────────────────────────────────
const KINDS = [["", "all"], ["quantifiable", "production"], ["side", "other activities"], ["qualitative", "qualitative"]];
export const powerCategories = {
  type: "power-categories",
  title: "📊 POWER categories",
  page: "power",
  needs,
  optionsLabel: "Categories",
  options: [{ key: "kind", label: "Show", kind: "select", choices: KINDS }, EFF_OPT],
  defaults: { opts: { kind: "", eff: "" } },
  rowKey: (r) => r.catId,
  rowLabel: (r) => r.label,
  columns: [
    { key: "label", label: "category", fmt: (v, r) => `<div class="v-name"><span class="v-power-emoji">${r.emoji}</span><div>` +
      `<a href="?page=power" class="v-power-link" onclick="return window._powerPickCat ? _powerPickCat('${r.catId}') : true" title="show its boosts on the POWER page"><b>${esc(v)}</b></a>` +
      `<small>${r.productHtml}${esc(r.kindLabel)}</small></div></div>` },
    { key: "output", label: "output / day", align: "right", get: (r) => r.unitsTotal, fmt: (v, r) => r.unitsHtml || `<span class="v-dim">—</span>` },
    { key: "net", label: "net / day", align: "right", title: "revenue with your boosts minus production costs",
      fmt: (v, r) => (r.kind !== "quantifiable" ? "" : r.unvalued ? `<span class="v-dim" title="${esc(r.unvaluedReason)}">not priced</span>` : `${colored(v, 2)} ${r.fl}`) },
    { key: "owned", label: "owned", align: "right", get: (r) => r.owned / r.total, fmt: (v, r) => `<span class="v-count">${r.owned} / ${r.total}</span>` },
    { key: "share", label: "", get: (r) => (r.owned / r.total) * 100, fmt: (v) => bar(v) },
  ],
  // ctx: { products() → saved product per category, icon(name), sfl() }
  build({ power } = {}, ctx = {}, opts = {}) {
    if (!power || !power.boostItems) return NO_DATA;
    const cb = catBoostsOf(power), sums = (power.categories || {}).catSummaries || {};
    const rows = [];
    for (const [catId, def] of Object.entries(POWER_CATEGORIES)) {
      const items = cb[catId];
      if (!items.length) continue;
      const kind = def.quantifiable ? "quantifiable" : def.side ? "side" : "qualitative";
      if (opts.kind && opts.kind !== kind) continue;
      const s = sums[catId] || { baseSfl: 0, boostedSfl: 0, delta: 0 };
      const product = def.quantifiable ? productOf(ctx, catId) : null;
      let parts = [];
      if (kind === "quantifiable") {
        if (isAnimalCat(catId) && s.animalBreakdown && s.animalBreakdown.length) parts = s.animalBreakdown.filter((b) => b.unitsPerDay > 0).map((b) => ({ u: b.unitsPerDay, item: b.product }));
        else if (!isAnimalCat(catId) && catId !== "fishing" && s.boostedUnitsPerDay > 0) parts = [{ u: s.boostedUnitsPerDay, item: catId === "flowers" ? product : getPriceProduct(catId, product) }];
      }
      rows.push({ catId, label: def.label, emoji: def.emoji, kind, kindLabel: kind === "quantifiable" ? "production" : kind === "side" ? "other activity" : "qualitative",
        productHtml: product && def.selector ? `${icon(ctx, product)}${esc(product)} · ` : "",
        unitsHtml: parts.map((p) => `${units(p.u)} ${icon(ctx, p.item)}${esc(p.item)}`).join(" + "), unitsTotal: parts.reduce((a, p) => a + p.u, 0) || null,
        net: kind === "quantifiable" && !s.unvalued ? s.boostedSfl - (s.costPerDay || 0) : null, unvalued: !!s.unvalued, unvaluedReason: s.unvaluedReason || "no price basis",
        owned: items.filter((b) => b.has || b.owned).length, total: items.length, fl: fl(ctx) });
    }
    return { rows, footer: `<div class="v-dim">Click a category for its boosts.</div>`, empty: "No categories." };
  },
};

// ── ⚡ Boosts of one category ────────────────────────────────────────────────────────────────────
function valueText(val) {
  if (val.disabled) return `<span class="v-dim">DISABLED</span>`;
  if (val.redundantFreeTool) return `<span class="v-dim">NO EFFECT</span>`;
  if (val.synergy === 0) return "—";
  const s = val.synergy.toFixed(2);
  const t = val.isFreeTool ? `🆓⬇${s}` : val.isCostReduction ? `⬇${s}` : val.isLavaCostReduction ? `🌋⬇${s}`
    : val.isFruitStump ? `🪵${val.synergy > 0 ? "+" : ""}${s}` : `${val.synergy > 0 ? "+" : ""}${s}`;
  return `<span style="color:${tone(val.synergy)};font-weight:600">${t}</span><span class="v-dim">/day</span>`;
}
function boostRow(b, catId, val, isOwned, ctx, { qual = false, rank = null } = {}) {
  const dimmed = !!(val && (val.disabled || val.redundantFreeTool));
  const roi = !qual && !dimmed && val.roi < Infinity && val.roi > 0 ? val.roi : null;
  return { key: `${b.name}|${isOwned ? "o" : "m"}`, name: b.name, typeLabel: typeLabel(b), boost: b.boost || "", owned: isOwned, qual, dimmed, rank,
    iconHtml: boostIcon(ctx, b), value: qual || dimmed ? null : val.synergy, valueHtml: qual ? "" : valueText(val), roi,
    loss: !qual && !dimmed && !(roi) && val.synergy < 0 && b.floor > 0, cost: b.floor || 0, costHtml: qual && isOwned ? "" : costLabel(b, ctx),
    note: dimmed ? (val.disabled ? `<div class="v-power-warn">⛔ Superseded by ${esc(val.disabledByName || "a stronger item")}</div>` : `<div class="v-dim">🆓 No effect — tools are already free</div>`)
      : qual && b.noValueReason ? `<div class="v-dim"><i>No FLOWER value: ${esc(b.noValueReason)}</i></div>` : "",
    chainHtml: qual ? "" : chainHtml(call(ctx, "chain", catId, b)), formulaCat: qual ? "qual" : catId };
}
function chainHtml(ds) {
  if (!ds || !ds.length) return "";
  const f = (x) => (x < 0.1 ? x.toFixed(4) : x.toFixed(3));
  return `<div class="v-power-chain" title="Per unit: ${esc(ds.map((d) => `${d.res} −${f(d.perUnit)}/u`).join(", "))}">⛓️ also cheapens (if self-supplied): ` +
    ds.map((d) => `${esc(d.res)} <b>−${d.perDay.toFixed(2)}</b>/d`).join(" · ") + `</div>`;
}

export const powerBoosts = {
  type: "power-boosts",
  title: "⚡ Boosts",
  titleFor: (o) => { const d = POWER_CATEGORIES[o.cat]; return d ? `${d.emoji} ${d.label} boosts${o.product && d.selector ? ` – ${(SEED_DATA[o.product] || {}).label || o.product}` : ""}` : "⚡ Boosts"; },
  page: "power",
  needs,
  optionsLabel: "Boosts",
  options: [
    { key: "cat", label: "Category", kind: "select", choices: CAT_CHOICES },
    { key: "product", label: "Product (valued on)", kind: "select", choices: (o) => productChoices(o.cat) },
    { key: "show", label: "Show", kind: "select", choices: [["all", "owned and missing"], ["owned", "owned only"], ["missing", "missing only"]] },
    EFF_OPT,
  ],
  defaults: { opts: { cat: "crops", product: "", show: "all", eff: "" } },
  rowKey: (r) => r.key,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.dimmed ? "w-st-done" : r.rank ? "v-power-rank" : ""),
  columns: [
    { key: "name", label: "boost", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b> <span class="v-dim">${esc(r.typeLabel)}</span>` +
      `<button type="button" class="w-btn v-power-f" data-boost="${esc(v)}" data-cat="${esc(r.formulaCat)}" onclick="window._powerFormula && _powerFormula(this)" title="how this value is derived">ƒ</button>` +
      `<small${r.rank ? ` title="${esc(r.rank)}"` : ""}>${esc(r.boost)}</small>${r.chainHtml}${r.note}</div></div>` },
    { key: "owned", label: "status", get: (r) => (r.owned ? 1 : 0), fmt: (v, r) => (r.owned ? pill("OWNED", "ok") : pill("MISSING", "idle")) },
    { key: "value", label: "value", align: "right", title: "FLOWER a day this boost adds to what you have", fmt: (v, r) => r.valueHtml },
    { key: "roi", label: "ROI", align: "right", title: "payback in days — green fast, white ≈ 2 years, red ≥ 4 years",
      fmt: (v, r) => (r.loss ? pill("LOSS", "bad") : v ? `<b style="color:${roiColor(v)}">${v.toFixed(0)}d</b>` : "") },
    { key: "cost", label: "cost", align: "right", fmt: (v, r) => `<span class="v-dim">${r.costHtml}</span>` },
  ],
  // ctx: { products(), chain(catId, boost) → [{res, perUnit, perDay}], rankRows(power, farm, boost, catId, product, owned) →
  //   {title, rows:[{name, boost, floor, skillPoints, rankShards, synergy, roi}]}, breakdown(power, farm, catId, product) → HTML,
  //   costDetail(power, farm, catId, product) → HTML, cavePigs(power, catId) → HTML, icon, sfl }
  build({ farm, power } = {}, ctx = {}, opts = {}) {
    if (!power || !power.boostItems) return NO_DATA;
    const catId = POWER_CATEGORIES[opts.cat] ? opts.cat : "crops";
    const def = POWER_CATEGORIES[catId], items = catBoostsOf(power)[catId];
    const qual = !def.quantifiable && !def.side;
    const product = def.quantifiable ? productOf(ctx, catId, validProduct(catId, opts.product)) : null;
    const owned = items.filter((b) => b.has || b.owned), missing = items.filter((b) => !b.has && !b.owned);
    const all = [];
    const add = (b, isOwned, val) => {
      all.push(boostRow(b, catId, val, isOwned, ctx, { qual }));
      if (qual) return;
      const rr = call(ctx, "rankRows", power, farm, b, catId, product, isOwned);
      for (const x of (rr && rr.rows) || []) {
        all.push({ ...boostRow({ ...b, name: x.name, boost: x.boost, floor: x.floor, skillPoints: x.skillPoints, rankShards: x.rankShards }, catId,
          { synergy: x.synergy, roi: x.roi }, isOwned, ctx, { rank: rr.title }), key: `${x.name}|${isOwned ? "o" : "m"}` });
      }
    };
    if (qual) {
      for (const b of owned) add(b, true, null);
      for (const b of missing.slice().sort((a, b) => a.floor - b.floor)) add(b, false, null);
    } else {
      for (const b of owned) add(b, true, boostVal(power, catId, b));
      for (const { b, v } of missing.map((b) => ({ b, v: boostVal(power, catId, b) })).sort((x, y) => x.v.roi - y.v.roi)) add(b, false, v);
    }
    const rows = opts.show === "owned" ? all.filter((r) => r.owned) : opts.show === "missing" ? all.filter((r) => !r.owned) : all;
    const F = fl(ctx);
    let summary;
    if (def.quantifiable) {
      const s = ((power.categories || {}).catSummaries || {})[catId] || { baseSfl: 0, boostedSfl: 0, delta: 0 };
      const net = s.boostedSfl - (s.costPerDay || 0);
      summary = tiles([
        { h: s.unvalued ? "not priced" : `${signed(net, 2)} ${F}`, l: "net / day", c: s.unvalued ? "" : tone(net) },
        { h: `${s.boostedSfl.toFixed(2)} ${F}`, l: `revenue / day (base ${s.baseSfl.toFixed(2)})` },
        { h: `${(s.costPerDay || 0).toFixed(2)} ${F}`, l: "costs / day", c: "var(--c-red)" },
        { h: `${owned.length} / ${items.length}`, l: "boosts owned", c: "var(--c-green)" },
      ]) + bigBar(items.length ? (owned.length / items.length) * 100 : 0);
      const more = (call(ctx, "breakdown", power, farm, catId, product) || "") + (call(ctx, "costDetail", power, farm, catId, product) || "");
      if (more) summary += `<details class="v-power-more"><summary>Production and costs${product ? ` — ${icon(ctx, product)}${esc(product)}` : ""}</summary><div class="v-power-detail">${more}</div></details>`;
    } else {
      summary = tiles([{ h: `${owned.length} / ${items.length}`, l: "boosts owned", c: "var(--c-green)" }]) + bigBar(items.length ? (owned.length / items.length) * 100 : 0);
      if (def.side) summary += call(ctx, "cavePigs", power, catId) || "";
    }
    return { rows, summary, footer: def.side ? `<div class="v-dim">Valued by the game's rule for the activity at your measured activity.</div>` : "",
      empty: items.length ? "Nothing to show with this filter." : "No boosts in this category." };
  },
};

// ── 💤 Owned but not active ──────────────────────────────────────────────────────────────────────
export const powerDormant = {
  type: "power-dormant",
  title: "💤 Owned but not active",
  page: "power",
  needs,
  defaults: {},
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  columns: [
    { key: "name", label: "item", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b><small>${esc(r.boost)}</small></div></div>` },
    { key: "group", label: "to do", fmt: (v) => pill(v === "wear" ? "EQUIP" : "PLACE", v === "wear" ? "run" : "idle") },
    { key: "value", label: "would add", align: "right", fmt: (v, r) => (v > 0 ? `<span style="color:var(--c-green);font-weight:600">+${v.toFixed(2)}</span> ${r.fl}<span class="v-dim">/d</span>` : `<span class="v-dim">—</span>`) },
  ],
  build({ power } = {}, ctx = {}) {
    if (!power) return NO_DATA;
    const all = power.dormantBoosts || [];
    const wear = all.filter((d) => d.type === "Wearable");
    const coll = all.filter((d) => d.type === "Collectible" && d.value >= 0.01);
    const rest = all.length - wear.length - coll.length;
    const total = all.reduce((s, d) => s + (d.value > 0 ? d.value : 0), 0);
    const rows = [...wear.map((d) => ({ ...d, group: "wear" })), ...coll.map((d) => ({ ...d, group: "place" }))]
      .map((d) => ({ name: d.name, boost: d.boost || "", value: d.value, group: d.group, iconHtml: icon(ctx, d.name), fl: fl(ctx) }));
    if (!rows.length) return { rows: [], footer: "", empty: "✓ Every boost you own is active." };
    const summary = tiles([{ h: `${Math.round(total).toLocaleString("en-US")} ${fl(ctx)}`, l: "a day sitting idle (at most)", c: "var(--c-yellow)" },
      { h: String(wear.length), l: "wearables not equipped" }, { h: String(coll.length), l: "collectibles not placed" }]) +
      `<div class="v-power-note">A wearable boosts only when <b>equipped</b>, a collectible only when <b>placed</b>. Wearables first — a slot is nearly free. ` +
      `Collectibles compete for space, so their /day is a ceiling. <b style="color:var(--c-yellow)">These are also counted as active in the totals — a known overstatement.</b></div>`;
    return { rows, summary, footer: rest > 0 ? `<div class="v-dim">+ ${rest} more owned but unplaced, each under 0.01 FLOWER/day (decorations, XP, one-offs) — not worth the space.</div>` : "", empty: "" };
  },
};

// ── 🌱 Crop machine (served economics) ──────────────────────────────────────────────────────────
const hms = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h}h${m ? ` ${m}m` : ""}`; };
const chip = (e) => `<span class="v-power-chip${e.debuff ? " v-power-debuff" : ""}">${e.kind === "Skill" ? "◆" : "◈"} ${esc(e.name)} <b>${esc(e.label)}</b></span>`;
export const powerCropMachine = {
  type: "power-crop-machine",
  title: "🌱 Crop machine",
  page: "power",
  needs,
  defaults: {},
  rowKey: (r) => r.crop,
  rowLabel: (r) => r.crop,
  rowClass: (r) => (r.locked ? "w-st-done" : ""),
  columns: [
    { key: "crop", label: "crop", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${r.locked ? "🔒 " : ""}${esc(v)}</b><small>${esc(r.tier || "")}${r.locked ? ` · needs ${esc(r.unlockSkill)}` : ""}</small></div></div>` },
    { key: "yieldPerSeed", label: "yield", align: "right", title: "crops per seed with your yield boosts", fmt: (v) => v.toFixed(2) },
    { key: "cycleSec", label: "cycle", align: "right", fmt: (v) => hms(v) },
    { key: "net", label: "net / day", align: "right", fmt: (v, r) => `${colored(v, 4)} ${r.fl}` },
    { key: "perCycle", label: "per cycle", extra: true, get: (r) => r.pack, fmt: (v, r) => `${r.pack} seeds · ${hms(r.cycleSec)} · ${r.oilPerCycle.toFixed(2)} ${r.oilIcon}oil` },
    { key: "perDay", label: "per day", extra: true, get: (r) => r.revenue, fmt: (v, r) => `${r.cyclesPerDay.toFixed(1)} cycles · ${r.cropsPerDay.toFixed(1)} crops · revenue ${r.revenue.toFixed(3)} · oil −${r.oilCost.toFixed(3)} · seeds −${r.seedCost.toFixed(3)}` },
    { key: "active", label: "active boosts", extra: true, get: (r) => r.active.length, fmt: (v, r) => (r.active.length ? r.active.map(chip).join("") : `<span class="v-dim">none — base yield only</span>`) },
    { key: "available", label: "still available", extra: true, get: (r) => r.available.length, fmt: (v, r) => (r.available.length ? r.available.map(chip).join("") : `<span class="v-dim">nothing left to add</span>`) },
  ],
  build({ power } = {}, ctx = {}) {
    const cm = power && power.cropMachine;
    if (!cm || !cm.rows || !cm.rows.length) return { rows: [], footer: "", empty: "No crop machine on this farm." };
    const F = fl(ctx);
    const rows = cm.rows.map((r) => ({ ...r, iconHtml: icon(ctx, r.crop), oilIcon: icon(ctx, "Oil"), fl: F }));
    const summary = tiles([{ h: String(cm.plots), l: "plots" }, { h: `${+cm.oilPerHour.toFixed(3)} ${icon(ctx, "Oil")}`, l: "oil / hour" },
      { h: `${cm.oilFlowerPerDay.toFixed(3)} ${F}`, l: "oil cost / day", c: "var(--c-red)" }, { h: `×${cm.speedMult.toFixed(2)}`, l: "machine speed" }]);
    return { rows, summary, footer: `<div class="v-dim">A cycle is pack × base ÷ plots — ordinary crop <b>speed</b> boosts do not apply, only the machine's own; crop <b>yield</b> boosts do. ` +
      `Add the ⚙ columns “active boosts” / “still available” to see them (◆ skill · ◈ NFT · red = a debuff).</div>`, empty: "" };
  },
};

// ── ⚙️ Crop machine restock queue ───────────────────────────────────────────────────────────────
export const powerCmQueue = {
  type: "power-cm-queue",
  title: "⚙️ Crop machine – restock queue",
  page: "power",
  needs,
  defaults: {},
  rowKey: (r) => r.crop,
  rowLabel: (r) => r.crop,
  columns: [
    { key: "i", label: "#", align: "right", fmt: (v) => `<span class="v-dim">${v}.</span>` },
    { key: "crop", label: "crop", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b>${r.partial ? `<small>partial</small>` : ""}</div></div>` },
    { key: "seedsUsed", label: "seeds", align: "right", fmt: (v, r) => `${v} / ${r.restockCap}` },
    { key: "timeSec", label: "time", align: "right", fmt: (v) => `${(v / 3600).toFixed(2)}h` },
    { key: "revenue", label: "revenue", align: "right", fmt: (v) => `<span style="color:var(--c-green)">+${v.toFixed(2)}</span>` },
    { key: "oilCost", label: "oil", align: "right", fmt: (v) => `<span style="color:var(--c-red)">−${v.toFixed(2)}</span>` },
    { key: "seedCost", label: "seed cost", align: "right", fmt: (v) => `<span style="color:var(--c-red)">−${v.toFixed(2)}</span>` },
    { key: "net", label: "net", align: "right", fmt: (v, r) => `${colored(v, 2)} ${r.fl}` },
  ],
  // ctx.cmQueue(power, farm) → { sim, windowHours, wheatRestock, hasWarehouse, plotCount, wheatBatches, wheatGrowH, wheatGrowBaseH,
  //   wheatBoosts: {mult, boosts}, skNames, oilCostPerH, dailyFactor } | null
  build({ farm, power } = {}, ctx = {}) {
    if (!power || !farm) return NO_DATA;
    const q = call(ctx, "cmQueue", power, farm);
    if (!q) return { rows: [], footer: "", empty: "No crop machine on this farm." };
    const F = fl(ctx), sim = q.sim;
    const rows = sim.queue.map((x, k) => ({ ...x, i: k + 1, iconHtml: icon(ctx, x.crop), fl: F }));
    const idleH = Math.max(0, (sim.windowSec - sim.timeUsed) / 3600);
    const summary = tiles([{ h: `${q.windowHours.toFixed(1)}h`, l: `restock window (${(q.windowHours / 24).toFixed(2)} d)` },
      { h: String(Math.round(sim.totalCrops)), l: `crops · ${(sim.timeUsed / 3600).toFixed(2)}h used${idleH > 0.05 ? `, ${idleH.toFixed(2)}h idle` : ""}` },
      { h: `${signed(sim.totalNet, 2)} ${F}`, l: "net per window", c: tone(sim.totalNet) },
      { h: `${(sim.totalNet * q.dailyFactor).toFixed(2)} ${F}`, l: "daily rate", c: tone(sim.totalNet) }]);
    const wb = q.wheatBoosts || { mult: 1, boosts: [] };
    const footer = `<div class="v-power-note">Window = <b>${q.wheatRestock}</b> ${icon(ctx, "Wheat")}Wheat${q.hasWarehouse ? ` <span style="color:var(--c-green)">(Warehouse +20%)</span>` : ""} on ${q.plotCount} plots = ` +
      `${q.wheatBatches} batch${q.wheatBatches > 1 ? "es" : ""} × ${q.wheatGrowH.toFixed(2)}h grow${wb.mult < 1 ? ` <span class="v-dim">(base ${q.wheatGrowBaseH}h)</span>` : ""}` +
      (wb.boosts.length ? ` <span style="color:var(--c-green)">[${wb.boosts.map((b) => `${esc(b.name)} ×${b.mult}`).join(", ")} = ×${wb.mult.toFixed(3)}]</span>` : ` <span class="v-dim">[no outdoor crop-speed boosts]</span>`) +
      `<br>Machine: ${sim.plots} plots · cycle ×${sim.speedMult.toFixed(3)}${q.skNames.length ? ` <span class="v-dim">(${esc(q.skNames.join(", "))})</span>` : ""}` +
      ` · ${icon(ctx, "Oil")}Oil ${sim.oilPerHour.toFixed(2)}/h = ${q.oilCostPerH.toFixed(3)} ${F}/h<br>` +
      `Window total: <span style="color:var(--c-green)">+${sim.totalRevenue.toFixed(2)}</span> revenue − <span style="color:var(--c-red)">${sim.totalOilCost.toFixed(2)}</span> oil − <span style="color:var(--c-red)">${sim.totalSeedCost.toFixed(2)}</span> seeds = ${colored(sim.totalNet, 2)} ${F}</div>`;
    return { rows, summary, footer, empty: "No profitable crops in the queue." };
  },
};

// ── ⛏️ Does it pay? digging and the composters ──────────────────────────────────────────────────
export const powerActivity = {
  type: "power-activity",
  title: "⛏️ Does it pay? Digging and composters",
  page: "power",
  needs,
  view({ power } = {}, ctx = {}) {
    const dg = power && power.digging, comps = (power && power.composters) || [];
    if (!dg && !comps.length) return { empty: "No digging or composters to judge." };
    const F = fl(ctx);
    const f = (v, d = 3) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`);
    const c = (v) => (v == null ? "var(--c-dim)" : tone(v));
    let h = `<div class="v-dim" style="margin-bottom:8px">Repeated activities that use up inputs — only the answer whether they pay back. The figures come ready from the API.</div>`;
    if (dg) {
      if (!dg.measured) h += `<div>🏜️ <b>Digging</b> — you have not dug yet, so there is nothing to measure.</div>`;
      else {
        const pd = dg.perDig || {};
        h += tiles([{ h: `${f(pd.netWithCoins, 4)} ${F}`, l: "per hole, coins counted", c: c(pd.netWithCoins) },
          { h: `${f(pd.netMarketOnly, 4)} ${F}`, l: "per hole, market only", c: c(pd.netMarketOnly) },
          { h: `${dg.coins.toFixed(0)} ${icon(ctx, "Coins")}`, l: "coins on the whole site" }, { h: `${dg.costSfl.toFixed(2)} ${F}`, l: "shovels" },
          ...(dg.remaining > 0 ? [{ h: String(dg.remaining), l: "holes left", c: "var(--c-yellow)" }] : [])]);
        h += `<div class="v-dim">🏜️ Digging — measured from the ${dg.digs} holes you dug, not from a probability model. ${esc(dg.coinAssumption || "")}</div>`;
        const top = (dg.items || []).slice(0, 6).map((i) => `${icon(ctx, i.item)}${esc(i.item)} ×${i.qty}${i.sellCoins ? ` <span class="v-dim">${i.sellCoins.toFixed(0)}c</span>` : ""}`).join(" · ");
        if (top) h += `<div>Most valuable finds: ${top}</div>`;
        if ((dg.unpriced || []).length) h += `<div style="color:var(--c-yellow)">⚠ No price (not counted, not zero): ${dg.unpriced.map((n) => `${icon(ctx, n)}${esc(n)}`).join(", ")}</div>`;
      }
    }
    if (comps.length) {
      h += `<div style="margin-top:12px"><b>🐛 Composters</b> <span class="v-dim">net a day running non-stop, inputs by season</span></div>`;
      h += `<table class="w-table"><thead><tr><th>composter</th><th style="text-align:right">batches/day</th><th style="text-align:right">fertiliser /d</th><th style="text-align:right">inputs /d</th><th style="text-align:right">net /d</th><th></th></tr></thead><tbody>` +
        comps.map((x) => `<tr><td><div class="v-name">${icon(ctx, x.name)}<div><b>${esc(x.name)}</b>${x.built ? "" : `<small>not built</small>`}</div></div></td>` +
          `<td style="text-align:right" class="v-dim">${x.batchesPerDay}</td><td style="text-align:right">${x.grossPerDay.toFixed(3)}</td>` +
          `<td style="text-align:right" class="v-dim">${x.costPerDay.toFixed(3)}</td><td style="text-align:right"><b style="color:${c(x.netPerDay)}">${f(x.netPerDay, 3)}</b> ${F}</td>` +
          `<td>${x.unpriced ? `<span style="color:var(--c-yellow)" title="Some inputs or outputs have no price — the net is only a lower bound.">⚠</span>` : ""}</td></tr>`).join("") + `</tbody></table>`;
      const anyPos = comps.some((x) => x.netPerDay > 0);
      h += `<div class="${anyPos ? "v-dim" : ""}" style="${anyPos ? "" : "color:var(--c-red)"}">${anyPos
        ? "A positive net = the fertiliser you make is worth more than the crops it eats."
        : "Every composter loses — the crops going in are worth more than the fertiliser coming out. That is why even a skill that speeds them up (Swift Decomposer) comes out negative: you lose faster."}</div>`;
    }
    return { html: h };
  },
};

// ── 🐾 Pets ──────────────────────────────────────────────────────────────────────────────────────
const roiDaysColor = (d) => (d <= 30 ? "var(--c-green)" : d <= 90 ? "var(--c-yellow)" : d <= 365 ? "var(--c-text)" : "var(--c-dim)");
export const powerPets = {
  type: "power-pets",
  title: "🐾 Pets – fetch income and ROI",
  page: "power",
  needs,
  defaults: {},
  rowKey: (r) => r.key,
  rowLabel: (r) => r.displayName,
  columns: [
    { key: "displayName", label: "pet", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b><small>${r.isNft ? `NFT ${esc(r.petType)}` : esc(r.species || "?")}</small></div></div>` },
    { key: "level", label: "lv", align: "right" },
    { key: "energy", label: "⚡", align: "right", fmt: (v) => v.toLocaleString("en-US") },
    { key: "dailySfl", label: "FLOWER / day", align: "right", fmt: (v) => (v > 0 ? `<span style="color:var(--c-green);font-weight:600">+${v.toFixed(3)}</span>` : "—") },
    { key: "price", label: "price paid", align: "right", title: "what you paid for it (FLOWER) — saved in this browser",
      fmt: (v, r) => `<input type="number" step="0.01" min="0" value="${v > 0 ? v : ""}" placeholder="?" class="v-power-input" onchange="window.powerSetPetPrice && powerSetPetPrice('${esc(r.key)}', this.value)">` },
    { key: "roiDays", label: "ROI", align: "right", fmt: (v, r) => (v != null ? `<b style="color:${roiDaysColor(v)}">${Math.ceil(v)}d</b>` : r.price > 0 ? "—" : `<span class="v-dim"><i>no price</i></span>`) },
  ],
  // ctx.pets(power, farm) → { pets: [...], totalDaily, totalPrice, grossRoi, feedMult, hasApron, hasBowls, boosts: [{name, boost, floor, has, gain, gainText}] } | null
  build({ farm, power } = {}, ctx = {}) {
    if (!power || !farm) return NO_DATA;
    const p = call(ctx, "pets", power, farm);
    if (!p) return { rows: [], footer: "", empty: "No pets on this farm." };
    const F = fl(ctx);
    const rows = p.pets.map((x) => ({ ...x, iconHtml: icon(ctx, x.isNft ? `${x.petType} Pet` : x.species || x.displayName) }));
    const summary = tiles([{ h: String(p.pets.length), l: "pets" }, { h: `+${p.totalDaily.toFixed(3)} ${F}`, l: "a day from fetches", c: "var(--c-green)" },
      ...(p.totalPrice > 0 ? [{ h: `${p.totalPrice.toFixed(2)} ${F}`, l: "invested" },
        { h: p.grossRoi !== null ? `${Math.ceil(p.grossRoi)}d` : "—", l: "portfolio ROI", c: p.grossRoi !== null ? roiDaysColor(p.grossRoi) : "" }] : [])]) +
      `<div class="v-dim">Feed ×${p.feedMult.toFixed(2)}${p.hasApron ? " (Victoria's Apron ✓)" : ""}${p.hasBowls ? " · Pet Bowls ✓" : ""}</div>`;
    const boosts = p.boosts.filter(Boolean);
    const footer = boosts.length ? `<div style="margin-top:10px"><b>Pet-boost NFTs</b></div><table class="w-table"><thead><tr><th>item</th><th>effect</th>` +
      `<th style="text-align:right">floor</th><th style="text-align:right">gain</th><th style="text-align:right">status / ROI</th></tr></thead><tbody>` +
      boosts.map((b) => {
        const roi = b.gain > 0 && b.floor > 0 ? b.floor / b.gain : null;
        const roiHtml = roi !== null ? `<b style="color:${roiDaysColor(roi)}">${Math.ceil(roi)}d</b>` : `<span class="v-dim">—</span>`;
        return `<tr><td><div class="v-name">${icon(ctx, b.name)}<div><b>${esc(b.name)}</b></div></div></td><td class="v-dim">${esc(b.boost || "")}</td>` +
          `<td style="text-align:right">${b.floor > 0 ? `${b.floor.toFixed(2)} ${F}` : "—"}</td><td style="text-align:right;color:${b.gain > 0 ? "var(--c-green)" : "var(--c-dim)"}">${b.gainText}</td>` +
          `<td style="text-align:right">${b.has ? `${pill("OWNED", "ok")} ` : ""}${roiHtml}</td></tr>`;
      }).join("") + `</tbody></table>` : "";
    return { rows, summary, footer, empty: "No pets." };
  },
};

// ── Cost tables (seeds, tools, lava pits, animal feed) ──────────────────────────────────────────
// ctx.costTables(power, farm) → { coinsPerSFL, bettyItem, seeds: [...], tools: [...], lava: {season, pits, rows}, feed: [...], stockMods }
const tablesOf = (power, farm, ctx) => (power ? call(ctx, "costTables", power, farm) : null);
const dash = `<span class="v-dim">—</span>`;
const catIconOf = (ctx, catId) => { const m = { crops: "Wheat", fruits: "Apple", greenhouse: "Grape", trees: "Wood", stone: "Stone", iron: "Iron", gold: "Gold", crimstone: "Crimstone", oil: "Oil" }; return m[catId] ? icon(ctx, m[catId]) : ""; };

export const powerSeedCosts = {
  type: "power-seed-costs",
  title: "🌱 Seed costs",
  page: "power",
  needs,
  defaults: {},
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  columns: [
    { key: "name", label: "crop", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b><small>${catIconOf(r.ctx, r.catId)}${esc(r.catId)}</small></div></div>` },
    { key: "coinCost", label: "coins", align: "right" },
    { key: "oilCost", label: "oil", align: "right", fmt: (v, r) => (v > 0 ? `${v} ${r.oilIcon}` : dash) },
    { key: "sflCost", label: "FLOWER", align: "right", fmt: (v) => v.toFixed(6) },
    { key: "stock", label: "stock", align: "right" },
    { key: "growSec", label: "grow", align: "right", fmt: (v, r) => r.growText },
    { key: "harvests", label: "harvests", align: "right", fmt: (v) => (v > 1 ? v : dash) },
  ],
  build({ farm, power } = {}, ctx = {}) {
    const t = tablesOf(power, farm, ctx);
    if (!t) return NO_DATA;
    const rows = t.seeds.map((r) => ({ ...r, ctx, iconHtml: icon(ctx, r.name), oilIcon: icon(ctx, "Oil") }));
    return { rows, footer: `<div class="v-dim">${Math.round(t.coinsPerSFL)} coins / FLOWER${t.bettyItem ? ` via ${icon(ctx, t.bettyItem)}${esc(t.bettyItem)}` : ""}.</div>`, empty: "No seeds." };
  },
};

export const powerToolCosts = {
  type: "power-tool-costs",
  title: "⛏️ Tool costs",
  page: "power",
  needs,
  defaults: {},
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  columns: [
    { key: "name", label: "tool", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b><small>${r.catId ? `for ${catIconOf(r.ctx, r.catId)}${esc(r.catId)}` : ""}</small></div></div>` },
    { key: "coins", label: "coins", align: "right", fmt: (v, r) => (r.discount > 0 ? `<s class="v-dim">${v}</s> → ${r.effectiveCoins}` : String(v)) },
    { key: "discountLabel", label: "discount", fmt: (v) => (v ? `<span style="color:var(--c-green)">${esc(v)}</span>` : dash) },
    { key: "mats", label: "materials", get: (r) => r.mats.length, fmt: (v, r) => (r.mats.length ? r.mats.map((m) => `${m.qty}× ${icon(r.ctx, m.item)}${esc(m.item)}`).join(", ") : dash) },
    { key: "sfl", label: "total FLOWER", align: "right", fmt: (v) => v.toFixed(4) },
    { key: "stock", label: "stock", align: "right" },
  ],
  build({ farm, power } = {}, ctx = {}) {
    const t = tablesOf(power, farm, ctx);
    if (!t) return NO_DATA;
    const m = t.stockMods || {};
    const yes = (on, t1, t0) => (on ? `✅ ${t1}` : `❌ ${t0}`);
    const footer = `<div class="v-dim">${yes(m.hasWarehouse, "Warehouse (+20% seed stock)", "No Warehouse")} · ${yes(m.hasToolshed, "Toolshed (+50% tool stock)", "No Toolshed")}` +
      `${m.moreAxes ? " · ✅ More Axes" : ""}${m.morePicks ? " · ✅ More Picks" : ""}<br>${yes(m.fellersDiscount, "Feller's Discount (−20% axe coin cost)", "No Feller's Discount")} · ` +
      `${yes(m.frugalMiner, "Frugal Miner (−20% pickaxe coin cost)", "No Frugal Miner")}</div>`;
    return { rows: t.tools.map((r) => ({ ...r, ctx, iconHtml: icon(ctx, r.name) })), footer, empty: "No tools." };
  },
};

export const powerLavaCosts = {
  type: "power-lava-costs",
  title: "🌋 Lava pit requirements",
  page: "power",
  needs,
  defaults: {},
  rowKey: (r) => `${r.season}|${r.item}`,
  rowLabel: (r) => `${r.season} ${r.item}`,
  rowClass: (r) => (r.current ? "w-st-ready" : ""),
  columns: [
    { key: "season", label: "season", fmt: (v, r) => `${esc(v[0].toUpperCase() + v.slice(1))}${r.current ? " 🔥" : ""}`, filter: true },
    { key: "item", label: "material", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b></div></div>` },
    { key: "qty", label: "qty", align: "right" },
    { key: "price", label: "P2P price", align: "right", fmt: (v) => v.toFixed(4) },
    { key: "cost", label: "cost", align: "right", fmt: (v) => v.toFixed(4) },
  ],
  build({ farm, power } = {}, ctx = {}) {
    const t = tablesOf(power, farm, ctx);
    if (!t) return NO_DATA;
    if (!t.lava) return { rows: [], footer: "", empty: "No lava pits on this farm." };
    const F = fl(ctx);
    const rows = t.lava.rows.map((r) => ({ ...r, iconHtml: icon(ctx, r.item) }));
    const totals = t.lava.totals.map((x) => `${x.current ? "<b>" : ""}${esc(x.season[0].toUpperCase() + x.season.slice(1))} ${x.total.toFixed(2)} ${F}${x.current ? "</b>" : ""}`).join(" · ");
    return { rows, summary: tiles([{ h: String(t.lava.pits), l: "lava pits" }, { h: esc(t.lava.season), l: "season now" }]),
      footer: `<div class="v-dim">Total per ignition: ${totals}</div>`, empty: "" };
  },
};

export const powerFeedCosts = {
  type: "power-feed-costs",
  title: "🐾 Animal feed costs",
  page: "power",
  needs,
  defaults: {},
  rowKey: (r) => r.catId,
  rowLabel: (r) => r.animal,
  columns: [
    { key: "animal", label: "animal", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b><small>avg L${r.avgLevel.toFixed(1)}</small></div></div>` },
    { key: "count", label: "qty", align: "right" },
    { key: "feed", label: "feed / animal", get: (r) => r.feedQty, fmt: (v, r) => (r.isGolden ? `<span style="color:var(--c-green)">FREE</span>` : `${r.feedQty}× ${r.feeds.map((n) => `${icon(r.ctx, n)}${esc(n)}`).join(", ") || "—"}`) },
    { key: "costPerFeed", label: "cost / feed", align: "right", fmt: (v, r) => (r.isGolden ? "—" : v.toFixed(4)) },
    { key: "feedPerDay", label: "feed /d", align: "right", fmt: (v) => v.toFixed(4) },
    { key: "sickPerDay", label: "💉 sick /d", align: "right", fmt: (v, r) => (r.sickPrevented ? `<span style="color:var(--c-green)">🛡️ 0</span>` : `<span style="color:var(--c-red)">${v.toFixed(4)}</span>`) },
    { key: "total", label: "total /d", align: "right", fmt: (v) => `<b style="color:var(--c-red)">${v.toFixed(4)}</b>` },
  ],
  build({ farm, power } = {}, ctx = {}) {
    const t = tablesOf(power, farm, ctx);
    if (!t) return NO_DATA;
    const prod = { chickens: "Egg", cows: "Milk", sheep: "Wool" };
    const rows = t.feed.map((r) => ({ ...r, ctx, iconHtml: icon(ctx, prod[r.catId] || r.animal) }));
    return { rows, footer: "", empty: "No animals." };
  },
};

// ── 🔍 Every boost the tracker knows ────────────────────────────────────────────────────────────
function effectText(e) {
  if (e.type === "qualitative") return `<span class="v-dim">qualitative: ${esc(e.raw || "?")}</span>`;
  let d = `<span style="color:var(--c-blue)">${esc(e.type)}</span>`;
  if (e.value !== undefined) d += ` <b>${e.value > 0 ? "+" : ""}${esc(e.value)}</b>`;
  if (e.pct !== undefined) d += ` ${esc(e.pct)}%`;
  if (e.extra !== undefined) d += ` +${esc(e.extra)}`;
  if (e.product) d += ` <span style="color:var(--c-yellow)">${esc(e.product)}</span>`;
  if (e.cropTier) d += ` <span class="v-dim">[${esc(e.cropTier)}]</span>`;
  if (e.conditional) d += ` <span class="v-dim">(${esc(e.conditional)})</span>`;
  if (e.tool) d += ` <span class="v-dim">[tool:${esc(e.tool)}]</span>`;
  return `${d} → <span style="color:var(--c-green)">${esc(e.cat || "?")}</span>`;
}
export const powerAllBoosts = {
  type: "power-all-boosts",
  title: "🔍 All boosts (how each is read)",
  page: "power",
  needs,
  defaults: { rows: { mode: "top", top: 25 } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  columns: [
    { key: "name", label: "name", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b></div></div>` },
    { key: "type", label: "type", filter: true, fmt: (v, r) => `${esc(v)}${r.skillTree ? ` <span class="v-dim">(${esc(r.skillTree)})</span>` : ""}` },
    { key: "has", label: "own", get: (r) => (r.has ? 1 : 0), fmt: (v) => (v ? "✅" : "❌") },
    { key: "boost", label: "boost text", fmt: (v) => `<span style="white-space:pre-wrap">${esc(v)}</span>` },
    { key: "cats", label: "categories", get: (r) => r.categories.join(" "), fmt: (v, r) => r.categories.map((c) => `<span class="v-power-chip">${esc(c)}</span>`).join("") },
    { key: "effects", label: "parsed effects", get: (r) => r.effects.length, fmt: (v, r) => r.effects.map(effectText).join("<br>") || "<em>none</em>" },
  ],
  build({ power } = {}, ctx = {}) {
    if (!power || !power.boostItems) return NO_DATA;
    const rows = [...power.boostItems].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
      .map((b) => ({ name: b.name, type: b.type, skillTree: b.skillTree, has: !!b.has, boost: b.boost || "", categories: b.categories || [], effects: b.effects || [], iconHtml: boostIcon(ctx, b) }));
    return { rows, footer: `<div class="v-dim">${rows.length} boosts.</div>`, empty: "No boosts." };
  },
};

export const POWER_WIDGETS = [powerTotals, powerDormant, powerBestBuys, powerCategories, powerBoosts, powerCropMachine, powerCmQueue,
  powerActivity, powerPets, powerSeedCosts, powerToolCosts, powerLavaCosts, powerFeedCosts, powerAllBoosts];

// ── iPhone glance models: one model per widget; the glance templates (ui/glance-templates.mjs) offer
// every look it fills. Plain text (the engine escapes it), so FLOWER is 🌸 here, not the page's icon HTML.
const FLW = " 🌸";
// 0.0123 → "0.0123", 1.234 → "1.23", 1234 → "1.2k" (compact() would round the small ones to 0)
const amt = (v) => { const a = Math.abs(v); return a >= 100 ? compact(a) : a >= 1 ? a.toFixed(2) : a >= 0.01 ? a.toFixed(3) : a.toFixed(4); };
const sgn = (v) => `${v < 0 ? "−" : "+"}${amt(v)}`;
const gTone = (v) => (v > 0 ? "ok" : v < 0 ? "bad" : "");
// payback in days: within a year green, within 4 years orange, longer red
const roiTone = (d) => (d <= 365 ? "ok" : d <= 1460 ? "warn" : "bad");
// the share of a year's payback (the best buys table's bar)
const yearPct = (roi) => Math.min(100, (365 / roi) * 100);
const share = (v, max) => (max > 0 ? Math.max(0, (v / max) * 100) : 0);
const ownedPct = (o, t) => (t ? (o / t) * 100 : 0);
// a tile's number: at most ~5 characters
const short = (a) => (a >= 100 ? compact(a) : a >= 10 ? a.toFixed(0) : a >= 1 ? a.toFixed(1) : a >= 0.005 ? a.toFixed(2) : "0");
const ta = (v) => short(Math.abs(v));
const tv = (v) => (short(Math.abs(v)) === "0" ? "0" : `${v < 0 ? "−" : "+"}${short(Math.abs(v))}`);

// 💰 totals: net a day with the owned share as a ring; gross / costs / boost value as the list
powerTotals.look = "number";
powerTotals.glanceModel = ({ power } = {}, ctx = {}) => {
  if (!power || !power.boostItems) return { empty: "No POWER data yet." };
  const c = power.categories || { totalBaseSfl: 0, totalBoostedSfl: 0, totalCostSfl: 0 };
  const r = call(ctx, "restock", power) || { restockPerDay: 0 };
  const owned = power.boostItems.filter((b) => b.has || b.owned).length, total = power.boostItems.length;
  const cost = c.totalCostSfl + (r.restockPerDay || 0), gross = c.totalBoostedSfl, net = gross - cost, delta = gross - c.totalBaseSfl;
  const s = power.skillCostInfo;
  return {
    head: { value: sgn(net), unit: FLW, tone: gTone(net), cap: `net a day · ${owned}/${total} boosts owned`, ring: ownedPct(owned, total), ringTone: "ok" },
    items: [
      { icon: "💰", name: "Gross", sub: "revenue / day", value: sgn(gross), tone: "ok", pct: 100 },
      { icon: "🧾", name: "Costs", sub: r.restockPerDay > 0 ? "incl. restock" : "/ day", value: sgn(-cost), tone: "bad", pct: share(cost, gross) },
      { icon: "⚡", name: "Boosts add", sub: "/ day", value: sgn(delta), tone: "info", pct: share(delta, gross) },
      { icon: "🎒", name: "Boosts owned", value: `${owned}/${total}`, pct: ownedPct(owned, total) },
      ...(s && s.sflPerPoint > 0 ? [{ icon: "🧠", name: "Skill point", sub: `level ${s.level}`, value: `~${ta(s.sflPerPoint)}` }] : []),
    ],
    tiles: [{ label: "net/day", value: tv(net) }, { label: "gross/day", value: tv(gross) }, { label: "costs/day", value: tv(-cost) },
      { label: "owned", value: `${Math.round(ownedPct(owned, total))}%` }],
    foot: power.valueBasis === "theoretical" ? "at 100% (theoretical)" : "measured last 7 days",
  };
};

// 🏆 best buys: the fastest payback (its icon as the hero); the next buys with their payback chips
powerBestBuys.look = "number-list-2";
powerBestBuys.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = powerBestBuys.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const all = bestBuys(data.power).filter((x) => !opts.cat || x.catId === opts.cat);
  const r = out.rows[0], cost = out.rows.reduce((a, x) => a + x.floor, 0), gain = out.rows.reduce((a, x) => a + x.synergy, 0);
  return {
    head: { value: r.roi.toFixed(0), unit: "d", tone: roiTone(r.roi), cap: `${r.name} · ${sgn(r.synergy)}/day`, hero: r.iconHtml },
    items: out.rows.map((x) => ({ icon: x.iconHtml, name: x.name, sub: `${sgn(x.synergy)}/day · ${amt(x.floor)}${FLW}`,
      chip: { text: `${x.roi.toFixed(0)}d`, tone: roiTone(x.roi) }, pct: yearPct(x.roi) })),
    tiles: [{ label: "buys", value: all.length }, { label: "payback", value: `${r.roi.toFixed(0)}d` },
      { label: "total cost", value: `${ta(cost)}` }, { label: "adds/day", value: tv(gain) }],
    foot: "bar = share of the price earned back in a year",
  };
};

// 📊 categories: net a day over the priced categories (owned share as a ring); the categories, best earners first
powerCategories.look = "number-list-2";
powerCategories.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = powerCategories.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const priced = out.rows.filter((r) => r.net != null);
  const owned = out.rows.reduce((a, r) => a + r.owned, 0), total = out.rows.reduce((a, r) => a + r.total, 0);
  const net = priced.reduce((a, r) => a + r.net, 0);
  const head = priced.length
    ? { value: sgn(net), unit: FLW, tone: gTone(net), cap: `net a day · ${priced.length} priced categories` }
    : { value: owned, unit: `/${total}`, cap: `boosts owned · ${out.rows.length} categories` };
  const list = out.rows.slice().sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity) || b.owned / b.total - a.owned / a.total);
  return {
    head: { ...head, ring: ownedPct(owned, total), ringTone: "ok" },
    items: list.map((r) => ({ icon: r.emoji, name: r.label, sub: `${r.owned}/${r.total} boosts owned`, pct: ownedPct(r.owned, r.total),
      ...(r.net != null ? { value: sgn(r.net), tone: gTone(r.net) } : r.unvalued ? { chip: { text: "not priced" } } : { value: `${r.owned}/${r.total}` }) })),
    tiles: [...(priced.length ? [{ label: "net/day", value: tv(net) }] : []), { label: "owned", value: `${Math.round(ownedPct(owned, total))}%` },
      { label: "categories", value: out.rows.length }, { label: "priced", value: priced.length }],
    foot: "bar = boosts owned in the category",
  };
};

// ⚡ boosts of one category: owned / total with a ring; the missing ones by payback, then the owned
powerBoosts.look = "number";
powerBoosts.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = powerBoosts.build(data, ctx, { ...opts, show: "all" });
  if (!out.rows.length) return { empty: out.empty };
  const catId = POWER_CATEGORIES[opts.cat] ? opts.cat : "crops", d = POWER_CATEGORIES[catId];
  const base = out.rows.filter((r) => !r.rank), owned = base.filter((r) => r.owned);
  const buys = base.filter((r) => !r.owned && r.roi != null), rest = base.filter((r) => !r.owned && r.roi == null);
  const val = (r) => (r.value ? `${sgn(r.value)}/day` : "");
  const s = d.quantifiable ? ((data.power.categories || {}).catSummaries || {})[catId] : null;
  return {
    head: { value: owned.length, unit: `/${base.length}`, cap: `${d.emoji} ${d.label} boosts owned`, ring: ownedPct(owned.length, base.length), ringTone: "ok" },
    // the head counts the whole category; the list follows the copy's Show (owned / missing / all)
    items: [
      ...(opts.show === "owned" ? [] : buys.map((r) => ({ icon: r.iconHtml, name: r.name, sub: val(r), chip: { text: `${r.roi.toFixed(0)}d`, tone: roiTone(r.roi) }, pct: yearPct(r.roi) }))),
      ...(opts.show === "owned" ? [] : rest.map((r) => ({ icon: r.iconHtml, name: r.name, sub: val(r), chip: { text: r.loss ? "loss" : "missing", tone: r.loss ? "bad" : "" } }))),
      ...(opts.show === "missing" ? [] : owned.map((r) => ({ icon: r.iconHtml, name: r.name, sub: r.dimmed ? "no effect" : val(r), chip: { text: "owned", tone: "ok" } }))),
    ],
    tiles: [{ label: "owned", value: `${owned.length}/${base.length}` }, { label: "missing", value: base.length - owned.length },
      ...(s && !s.unvalued ? [{ label: "net/day", value: tv(s.boostedSfl - (s.costPerDay || 0)) }] : []),
      ...(buys.length ? [{ label: "payback", value: `${buys[0].roi.toFixed(0)}d` }] : [])],
    foot: buys.length ? `best buy: ${buys[0].name}` : rest.length ? `${rest.length} missing` : "every boost owned",
  };
};

// 💤 dormant: what the idle boosts could add a day; the biggest ones to equip or place
powerDormant.look = "number";
powerDormant.glanceModel = (data = {}, ctx = {}) => {
  const out = powerDormant.build(data, ctx);
  if (!out.rows.length) return { empty: out.empty };
  const total = ((data.power || {}).dormantBoosts || []).reduce((s, d) => s + (d.value > 0 ? d.value : 0), 0);
  const wear = out.rows.filter((r) => r.group === "wear").length, place = out.rows.length - wear;
  const list = out.rows.slice().sort((a, b) => b.value - a.value), top = Math.max(0, ...list.map((r) => r.value));
  return {
    head: { value: `+${amt(total)}`, unit: FLW, tone: "warn", cap: `idle, a day · ${wear} to equip · ${place} to place` },
    items: list.map((r) => ({ icon: r.iconHtml, name: r.name, sub: r.value > 0 ? `${sgn(r.value)}/day` : "",
      chip: { text: r.group === "wear" ? "EQUIP" : "PLACE", tone: r.group === "wear" ? "info" : "" }, pct: share(r.value, top) })),
    tiles: [{ label: "idle/day", value: `+${ta(total)}` }, { label: "to equip", value: wear }, { label: "to place", value: place }],
    foot: "a placed collectible's /day is a ceiling",
  };
};

// 🌱 crop machine: the best crop (its icon as the hero); the crops by net a day, the locked ones last
powerCropMachine.look = "number";
powerCropMachine.glanceModel = (data = {}, ctx = {}) => {
  const out = powerCropMachine.build(data, ctx);
  if (!out.rows.length) return { empty: out.empty };
  const list = out.rows.filter((r) => !r.locked).sort((a, b) => b.net - a.net);
  if (!list.length) return { empty: "Every crop machine crop is locked." };
  const r = list[0], cm = data.power.cropMachine, top = Math.max(0, ...list.map((x) => x.net));
  return {
    head: { value: sgn(r.net), unit: FLW, tone: gTone(r.net), cap: `a day · ${r.crop} · best of ${list.length}`, hero: r.iconHtml },
    items: [...list.map((x) => ({ icon: x.iconHtml, name: x.crop, sub: `${x.yieldPerSeed.toFixed(2)}/seed · ${hms(x.cycleSec)}`, value: sgn(x.net), tone: gTone(x.net), pct: share(x.net, top) })),
      ...out.rows.filter((x) => x.locked).map((x) => ({ icon: x.iconHtml, name: x.crop, sub: `needs ${x.unlockSkill}`, chip: { text: "locked" } }))],
    tiles: [{ label: "plots", value: cm.plots }, { label: "oil/hour", value: +cm.oilPerHour.toFixed(3) },
      { label: "oil/day", value: `${tv(-cm.oilFlowerPerDay)}` }, { label: "speed", value: `×${cm.speedMult.toFixed(2)}` }],
  };
};

// ⚙️ restock queue: the daily rate, the machine's busy share of the window as a ring; the queue
powerCmQueue.look = "number";
powerCmQueue.glanceModel = (data = {}, ctx = {}) => {
  const out = powerCmQueue.build(data, ctx);
  if (!out.rows.length) return { empty: out.empty };
  const q = call(ctx, "cmQueue", data.power, data.farm), sim = q.sim, daily = sim.totalNet * q.dailyFactor;
  const busy = sim.windowSec > 0 ? Math.min(100, (sim.timeUsed / sim.windowSec) * 100) : 0;
  return {
    head: { value: sgn(daily), unit: FLW, tone: gTone(daily), cap: `a day · ${out.rows.length} crops · ${q.windowHours.toFixed(1)}h window`, ring: busy, ringTone: "info" },
    items: out.rows.map((r) => ({ icon: r.iconHtml, name: r.crop, sub: `${r.seedsUsed}/${r.restockCap} seeds${r.partial ? " · partial" : ""}`, value: sgn(r.net), tone: gTone(r.net),
      pct: r.restockCap > 0 ? (r.seedsUsed / r.restockCap) * 100 : 0 })),
    tiles: [{ label: "window", value: `${q.windowHours.toFixed(1)}h` }, { label: "crops", value: Math.round(sim.totalCrops) },
      { label: "net", value: tv(sim.totalNet) }, { label: "daily rate", value: tv(daily) }],
    foot: `machine busy ${busy.toFixed(0)}% of the window · bar = seeds of the restock`,
  };
};

// ⛏️ does it pay: digging per hole (or the best composter); digging and the composters as the list
powerActivity.look = "number";
powerActivity.glanceModel = ({ power } = {}, ctx = {}) => {
  const dg = power && power.digging, comps = (power && power.composters) || [];
  if (!dg && !comps.length) return { empty: "No digging or composters to judge." };
  const pd = dg && dg.measured ? dg.perDig || {} : null;
  const sorted = comps.slice().sort((a, b) => b.netPerDay - a.netPerDay), best = sorted[0];
  const head = pd && pd.netWithCoins != null
    ? { value: sgn(pd.netWithCoins), unit: FLW, tone: gTone(pd.netWithCoins), cap: `per hole, coins counted${dg.remaining > 0 ? ` · ${dg.remaining} holes left` : ""}`, hero: icon(ctx, "Sand Shovel") }
    : best ? { value: sgn(best.netPerDay), unit: FLW, tone: gTone(best.netPerDay), cap: `a day · ${best.name}${comps.length > 1 ? " · best composter" : ""}`, hero: icon(ctx, best.name) }
    : { value: "—", cap: "digging: nothing dug yet" };
  const items = [];
  if (dg) items.push(pd && pd.netWithCoins != null ? { icon: icon(ctx, "Sand Shovel"), name: "Digging", sub: `per hole · ${dg.digs} dug`, value: sgn(pd.netWithCoins), tone: gTone(pd.netWithCoins) }
    : { icon: icon(ctx, "Sand Shovel"), name: "Digging", sub: "nothing dug yet", value: "—" });
  for (const x of sorted) items.push({ icon: icon(ctx, x.name), name: x.name, sub: x.built ? "net / day" : "not built", value: sgn(x.netPerDay), tone: gTone(x.netPerDay) });
  const tiles = [];
  if (pd && pd.netWithCoins != null) tiles.push({ label: "per hole", value: tv(pd.netWithCoins) }, { label: "w/o coins", value: pd.netMarketOnly == null ? "—" : tv(pd.netMarketOnly) });
  if (dg && dg.remaining > 0) tiles.push({ label: "holes left", value: dg.remaining });
  if (best) tiles.push({ label: "composter", value: tv(best.netPerDay) });
  return { head, items, tiles, foot: comps.length && !comps.some((x) => x.netPerDay > 0) ? "every composter loses" : "" };
};

// 🐾 pets: fetch income a day; the pets, best earners first
powerPets.look = "number";
powerPets.glanceModel = (data = {}, ctx = {}) => {
  const out = powerPets.build(data, ctx);
  if (!out.rows.length) return { empty: out.empty };
  const p = call(ctx, "pets", data.power, data.farm);
  const list = out.rows.slice().sort((a, b) => b.dailySfl - a.dailySfl), top = Math.max(0, ...list.map((r) => r.dailySfl));
  return {
    head: { value: `+${amt(p.totalDaily)}`, unit: FLW, tone: "ok", cap: `a day · ${p.pets.length} pets${p.grossRoi != null ? ` · ROI ${Math.ceil(p.grossRoi)}d` : ""}` },
    items: list.map((r) => ({ icon: r.iconHtml, name: r.displayName, sub: `lv ${r.level}`, value: r.dailySfl > 0 ? `+${amt(r.dailySfl)}` : "—", tone: r.dailySfl > 0 ? "ok" : "", pct: share(r.dailySfl, top) })),
    tiles: [{ label: "pets", value: p.pets.length }, { label: "a day", value: `+${ta(p.totalDaily)}` },
      ...(p.totalPrice > 0 ? [{ label: "invested", value: `${ta(p.totalPrice)}` }, { label: "ROI", value: p.grossRoi != null ? `${Math.ceil(p.grossRoi)}d` : "—" }] : [])],
  };
};

// 🌱 seed costs: the coin rate seeds are priced at; the seeds with their FLOWER price
powerSeedCosts.look = "list-4";
powerSeedCosts.glanceModel = (data = {}, ctx = {}) => {
  const t = tablesOf(data.power, data.farm, ctx);
  if (!t) return { empty: NO_DATA.empty };
  const out = powerSeedCosts.build(data, ctx);
  if (!out.rows.length) return { empty: out.empty };
  const top = Math.max(0, ...out.rows.map((r) => r.sflCost)), dear = out.rows.reduce((a, r) => (r.sflCost > a.sflCost ? r : a));
  return {
    head: { value: compact(Math.round(t.coinsPerSFL)), unit: " coins/🌸", cap: `seed prices${t.bettyItem ? ` · via ${t.bettyItem}` : ""}` },
    items: out.rows.map((r) => ({ icon: r.iconHtml, name: r.name, sub: `${r.growText}${r.oilCost > 0 ? ` · ${r.oilCost} oil` : ""}`, value: amt(r.sflCost), pct: share(r.sflCost, top) })),
    tiles: [{ label: "coins/🌸", value: Math.round(t.coinsPerSFL) }, { label: "seeds", value: out.rows.length }, { label: "dearest", value: `${ta(dear.sflCost)}` }],
    foot: "FLOWER per seed",
  };
};

// ⛏️ tool costs: how many stock / discount boosts you have (a ring); the tools with their FLOWER price
powerToolCosts.look = "list-4";
powerToolCosts.glanceModel = (data = {}, ctx = {}) => {
  const t = tablesOf(data.power, data.farm, ctx);
  if (!t) return { empty: NO_DATA.empty };
  const out = powerToolCosts.build(data, ctx);
  if (!out.rows.length) return { empty: out.empty };
  const m = t.stockMods || {}, mods = [m.hasWarehouse, m.hasToolshed, m.fellersDiscount, m.frugalMiner], on = mods.filter(Boolean).length;
  const top = Math.max(0, ...out.rows.map((r) => r.sfl)), dear = out.rows.reduce((a, r) => (r.sfl > a.sfl ? r : a));
  return {
    head: { value: on, unit: `/${mods.length}`, cap: "stock & discount boosts", ring: (on / mods.length) * 100, ringTone: on === mods.length ? "ok" : "warn" },
    items: out.rows.map((r) => ({ icon: r.iconHtml, name: r.name, sub: r.discountLabel || `stock ${r.stock}`, value: amt(r.sfl), tone: r.discount > 0 ? "ok" : "", pct: share(r.sfl, top) })),
    tiles: [{ label: "tools", value: out.rows.length }, { label: "discounted", value: out.rows.filter((r) => r.discount > 0).length },
      { label: "dearest", value: `${ta(dear.sfl)}` }, { label: "boosts", value: `${on}/${mods.length}` }],
    foot: "FLOWER per tool, materials included",
  };
};

// 🌋 lava pits: this season's cost per ignition; its materials, dearest first; every season as a tile
powerLavaCosts.look = "number";
powerLavaCosts.glanceModel = (data = {}, ctx = {}) => {
  const out = powerLavaCosts.build(data, ctx);
  if (!out.rows.length) return { empty: out.empty };
  const t = tablesOf(data.power, data.farm, ctx).lava, now = t.totals.find((x) => x.current);
  const cur = out.rows.filter((r) => r.current), list = (cur.length ? cur : out.rows).slice().sort((a, b) => b.cost - a.cost);
  const sum = list.reduce((a, r) => a + r.cost, 0);
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  return {
    head: { value: now ? amt(now.total) : "—", unit: now ? FLW : "", cap: `per ignition · ${t.season} · ${t.pits} pits` },
    items: list.map((r) => ({ icon: r.iconHtml, name: r.item, sub: `${r.qty}×`, value: amt(r.cost), pct: share(r.cost, sum) })),
    tiles: t.totals.map((x) => ({ label: `${cap(x.season)}${x.current ? " ●" : ""}`, value: ta(x.total) })),
    foot: "bar = share of the ignition cost",
  };
};

// 🐾 feed: what the animals cost a day; the dearest animals
powerFeedCosts.look = "number";
powerFeedCosts.glanceModel = (data = {}, ctx = {}) => {
  const out = powerFeedCosts.build(data, ctx);
  if (!out.rows.length) return { empty: out.empty };
  const total = out.rows.reduce((a, r) => a + r.total, 0), n = out.rows.reduce((a, r) => a + r.count, 0);
  const feed = out.rows.reduce((a, r) => a + (r.feedPerDay || 0), 0), sick = out.rows.reduce((a, r) => a + (r.sickPerDay || 0), 0);
  return {
    head: { value: `−${amt(total)}`, unit: FLW, tone: "bad", cap: `a day · feed + sickness · ${n} animals` },
    items: out.rows.slice().sort((a, b) => b.total - a.total).map((r) => ({ icon: r.iconHtml, name: r.animal,
      sub: r.isGolden ? `${r.count}× · free feed` : `${r.count}× · ${r.feedQty} feed`, value: `−${amt(r.total)}`, tone: "bad", pct: share(r.total, total) })),
    tiles: [{ label: "a day", value: tv(-total) }, { label: "feed", value: tv(-feed) }, { label: "sickness", value: tv(-sick) }, { label: "animals", value: n }],
    foot: "bar = share of the feed bill",
  };
};

// 🔍 every boost: how many you own (a ring); the boost types with their owned share
const TYPE_ICON = { Collectible: "🗿", Wearable: "👕", Skill: "🧠", Bud: "🌱", Game: "🎮" };
powerAllBoosts.look = "number";
powerAllBoosts.glanceModel = (data = {}, ctx = {}) => {
  const out = powerAllBoosts.build(data, ctx);
  if (!out.rows.length) return { empty: out.empty };
  const owned = out.rows.filter((r) => r.has).length, types = {};
  for (const r of out.rows) { const g = types[r.type] || (types[r.type] = { n: 0, has: 0 }); g.n++; if (r.has) g.has++; }
  const list = Object.entries(types).sort((a, b) => b[1].n - a[1].n);
  const qual = out.rows.filter((r) => r.effects.some((e) => e.type === "qualitative")).length;
  return {
    head: { value: owned, unit: `/${out.rows.length}`, cap: "boosts owned", ring: ownedPct(owned, out.rows.length), ringTone: "ok" },
    items: list.map(([type, g]) => ({ icon: TYPE_ICON[type] || "✨", name: type, sub: `${g.n} known`, value: `${g.has}/${g.n}`, pct: ownedPct(g.has, g.n) })),
    tiles: [{ label: "known", value: out.rows.length }, { label: "owned", value: owned }, { label: "types", value: list.length }, { label: "no value", value: qual }],
    foot: "bar = owned share of the type",
  };
};
