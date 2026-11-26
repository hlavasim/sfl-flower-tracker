// TREASURY as widgets, over the server's section=treasury valuation (store resource "treasury"):
//   🗂 Value by category: each category's value, its share of the farm (a bar in the category's
//      colour) and its top items with icons; Liquid splits into SFL, coins and gems.
//   📦 Treasury items: the items of one category (a per-copy option), with quantity, unit price,
//      total and each item's share of the category.
import { sflIcon, esc, icon, formatSFL, colorBar } from "./market-common.mjs";
import { kpis } from "../ui/viz.mjs";
import { big, compact, rows as gRows } from "../ui/glance.mjs";

const need = (farmId) => ({ treasury: { res: "treasury", farm: farmId } });
const valueOf = (t) => (t && t.value && t.value.totals ? t.value : null);

// key, icon, label; "show" = the page showed the card only when the category had items
const CAT_INFO = {
  resources: { icon: "⛏️", label: "Resources" },
  treasures: { icon: "🏴‍☠️", label: "Treasures" },
  collectibles: { icon: "🏆", label: "Collectibles" },
  produced: { icon: "🍲", label: "Produced", onlyIfAny: true, note: "at production cost, not marketplace-sellable" },
  wearables: { icon: "👕", label: "Wearables" },
  pets: { icon: "🐾", label: "Pets", onlyIfAny: true },
  listings: { icon: "🏷️", label: "Listings", onlyIfAny: true },
};
const ITEM_CATS = Object.keys(CAT_INFO);

export const treasuryCategories = {
  type: "treasury-categories",
  title: "🗂 Value by category",
  page: "treasury",
  needs: need,
  defaults: {},
  rowKey: (r) => r.key,
  rowLabel: (r) => r.label,
  columns: [
    { key: "label", label: "category", fmt: (v, r) => `<div class="v-name"><span class="v-treasury-ico">${r.emoji}</span><div><b>${esc(v)}</b>` +
      `<small>${r.sub}</small></div></div>` },
    { key: "pct", label: "share", fmt: (v, r) => `<div class="v-treasury-share">${colorBar(v, r.color)}<span class="v-dim">${v.toFixed(1)} %</span></div>` },
    { key: "total", label: "value", align: "right", fmt: (v) => `<b>${formatSFL(v)}</b> ${sflIcon()}` },
    { key: "count", label: "items", align: "right", extra: true },
  ],

  // data: { treasury: { value } }   ctx: { catColors, icon(name) → HTML }
  build({ treasury } = {}, ctx = {}) {
    const v = valueOf(treasury);
    if (!v) return { rows: [], footer: "", empty: "The Treasury valuation did not load." };
    const grand = v.totals.grand || 0, colors = ctx.catColors || {};
    const pct = (x) => (grand > 0 ? (x / grand) * 100 : 0);
    const rows = [];
    for (const k of ITEM_CATS) {
      const info = CAT_INFO[k], items = v[k] || [];
      if (info.onlyIfAny && !items.length) continue;
      const total = v.totals[k] || 0;
      const top = items.slice(0, 5).map((it) => `<span class="v-mkt-item">${icon(ctx, it.name)}${esc(it.name)} <span class="v-treasury-num">${formatSFL(it.total)}</span></span>`).join(" · ");
      rows.push({ key: k, emoji: info.icon, label: info.label, total, pct: pct(total), color: colors[k] || "#666", count: items.length,
        sub: top || "no items" });
    }
    const l = v.liquid || {};
    rows.push({ key: "liquid", emoji: "💧", label: "Liquid", total: v.totals.liquid || 0, pct: pct(v.totals.liquid || 0),
      color: colors.liquid || "#666", count: null,
      sub: `${sflIcon()} balance ${formatSFL(l.sflBalance || 0)} · ${icon(ctx, "Coins")}coins ${Math.floor(l.coinBalance || 0).toLocaleString()} (≈ ${formatSFL(l.coinsAsSFL || 0)}) · ` +
        `${icon(ctx, "Gem")}gems ${Math.floor(l.gemBalance || 0).toLocaleString()} (≈ ${formatSFL(l.gemsAsSFL || 0)})` });
    return { rows, footer: "", empty: "" };
  },
};

const CAT_CHOICES = ITEM_CATS.map((k) => [k, `${CAT_INFO[k].icon} ${CAT_INFO[k].label}`]);

export const treasuryItems = {
  type: "treasury-items",
  title: "📦 Treasury items",
  titleFor: (o) => (CAT_INFO[o.cat] ? `${CAT_INFO[o.cat].icon} ${CAT_INFO[o.cat].label}` : "📦 Treasury items"),
  page: "treasury",
  needs: need,
  optionsLabel: "Category",
  options: [{ key: "cat", label: "Category", kind: "select", choices: CAT_CHOICES }],
  defaults: { opts: { cat: "resources" }, sort: { key: "total", dir: "desc" }, rows: { mode: "top", top: 10, picked: [] } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  columns: [
    { key: "name", label: "item", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b></div></div>` },
    { key: "qty", label: "qty", align: "right", fmt: (v) => `<span class="v-count">×${esc(v)}</span>` },
    { key: "unitPrice", label: "unit", align: "right", fmt: (v) => `<span class="v-dim">${formatSFL(v)}</span>` },
    { key: "share", label: "share", title: "share of the category's value", fmt: (v, r) => colorBar(v, r.color) },
    { key: "total", label: "total", align: "right", fmt: (v) => `<b>${formatSFL(v)}</b> ${sflIcon()}` },
  ],

  build({ treasury } = {}, ctx = {}, opts = {}) {
    const v = valueOf(treasury);
    if (!v) return { rows: [], footer: "", empty: "The Treasury valuation did not load." };
    const cat = CAT_INFO[opts.cat] ? opts.cat : "resources";
    const info = CAT_INFO[cat], items = v[cat] || [];
    const catTotal = v.totals[cat] || 0, grand = v.totals.grand || 0;
    const color = (ctx.catColors || {})[cat] || "var(--c-accent)";
    const rows = items.map((it) => ({ ...it, color, share: catTotal > 0 ? (it.total / catTotal) * 100 : 0, iconHtml: icon(ctx, it.name) }));
    const boost = cat === "treasures" && v.treasureBoost > 1 ? `×${v.treasureBoost.toFixed(1)} boost` : "";
    const summary = kpis([{ v: items.length, l: "items" }, { v: `${formatSFL(catTotal)} SFL`, l: "value" },
      { v: `${(grand > 0 ? (catTotal / grand) * 100 : 0).toFixed(1)} %`, l: "of the farm" }, ...(boost ? [{ v: boost, l: "treasure boost" }] : [])]) +
      (info.note ? `<div class="v-dim v-treasury-note">${esc(info.note)}</div>` : "");
    return { rows, summary, footer: "", empty: "No items found." };
  },
};

// ── iPhone glance faces ──
// categories: S = the biggest category's share; M / L = the categories by value
treasuryCategories.sizes = ["s", "m", "l"];
treasuryCategories.size = "m";
treasuryCategories.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = treasuryCategories.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const list = out.rows.slice().sort((a, b) => b.total - a.total);
  if (size === "s") {
    const r = list[0];
    return { html: `<div class="g-hero">${r.emoji}</div>` + big(r.pct.toFixed(0), { unit: " %", cap: `${r.label} · ${compact(r.total)} 🌸` }) };
  }
  return { html: gRows(list.slice(0, size === "m" ? 3 : 8).map((r) => ({ icon: r.emoji, name: r.label,
    sub: `${r.pct.toFixed(1)} %${r.count != null ? ` · ${r.count} items` : ""}`, value: compact(r.total) }))) };
};

// items of one category: S = the category's value; M = beside its top three; L = its top six under it
treasuryItems.sizes = ["s", "m", "l"];
treasuryItems.size = "m";
treasuryItems.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = treasuryItems.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const v = valueOf(data.treasury), cat = CAT_INFO[opts.cat] ? opts.cat : "resources";
  const head = big(compact(v.totals[cat] || 0), { unit: " 🌸", cap: `${out.rows.length} items` });
  if (size === "s") return { html: head };
  const list = gRows(out.rows.slice().sort((a, b) => b.total - a.total).slice(0, size === "m" ? 3 : 6).map((r) => ({ icon: r.iconHtml, name: r.name,
    sub: `×${r.qty} · ${formatSFL(r.unitPrice)}`, value: compact(r.total) })));
  return { html: size === "m" ? `<div class="g-split"><div>${head}</div>${list}</div>` : head + list };
};
