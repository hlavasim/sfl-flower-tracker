// 🌱 BUDS as a widget: every bud priced against this farm (section=buds — the same product picks as
// POWER), owned ones first. Each copy can keep its own type / aura / owned-only filter.
import { BUD_TYPE_NAMES, BUD_AURA_NAMES, BUD_AURA_MULTIPLIERS } from "../core/engine/buds.mjs";
import { bar, kpis } from "../ui/viz.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The POWER page's product picks (sfl_power_products), as the BUDS page sends them.
export function savedProducts() {
  try { return JSON.parse((globalThis.localStorage && globalThis.localStorage.getItem("sfl_power_products")) || "{}") || {}; } catch { return {}; }
}
export const budsQuery = (farmId) => ({ res: "compute", farm: farmId, section: "buds", q: { products: JSON.stringify(savedProducts()) } });

const AURA_TONE = { Mythical: "v-bud-myth", Rare: "v-bud-rare", Green: "v-bud-green", Basic: "v-bud-basic" };
const auraLabel = (a) => (a !== "No Aura" ? `${a} (${((BUD_AURA_MULTIPLIERS[a] - 1) * 100).toFixed(0)}%)` : "—");

export const budsTable = {
  type: "buds-table",
  title: "🌱 Buds — FLOWER per day on this farm",
  titleFor: (o) => `🌱 ${o.owned ? "My buds" : "Buds"}${o.type ? ` · ${o.type}` : ""}${o.aura ? ` · ${o.aura}` : ""}`,
  page: "buds",
  needs: (farmId) => ({ buds: budsQuery(farmId) }),
  optionsLabel: "Filter",
  options: [
    { key: "type", label: "Type", kind: "select", choices: [["", "All"], ...BUD_TYPE_NAMES.map((t) => [t, t])] },
    { key: "aura", label: "Aura", kind: "select", choices: [["", "All"], ...BUD_AURA_NAMES.map((a) => [a, a])] },
    { key: "owned", label: "Owned only", kind: "bool" },
  ],
  defaults: { opts: { type: "", aura: "", owned: false }, rows: { mode: "top", top: 50 } },
  rowKey: (r) => String(r.id),
  rowLabel: (r) => `Bud #${r.id} ${r.type}`,
  rowClass: (r) => (r.owned ? "w-st-ready" : ""),
  keepRow: (r) => r.owned,
  columns: [
    { key: "id", label: "bud", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${r.owned ? "✅ " : ""}#${esc(v)}</b><small>${esc(r.type)} · ${esc(r.stem)}</small></div></div>` },
    { key: "type", label: "type", extra: true },
    { key: "stem", label: "stem", extra: true },
    { key: "aura", label: "aura", fmt: (v) => `<span class="${AURA_TONE[v] || "v-dim"}">${esc(auraLabel(v))}</span>` },
    { key: "boosts", label: "boosts (after aura)", get: (r) => r.boostDescs.length, fmt: (v, r) => r.boostDescs.join("<br>") || `<span class="v-dim">—</span>` },
    { key: "breakdown", label: "breakdown", extra: true, get: (r) => r.breakdown.length, fmt: (v, r) => r.breakdownHtml || "—" },
    { key: "sflPerDay", label: "FLOWER/day", align: "right",
      fmt: (v, r) => `<div class="v-rm-val"><b class="${v > 0 ? "v-done" : "v-dim"}">+${v.toFixed(4)}</b>${bar(r.pct, "ok")}</div>` },
    { key: "sflPerYear", label: "FLOWER/year", align: "right", fmt: (v) => `<span class="${v > 0 ? "" : "v-dim"}">+${v.toFixed(2)}</span>` },
  ],

  // data: { buds: section=buds { rows, capacity } }; ctx: { describe(bud) → [HTML], catIcon(cat) → HTML, budIcon(id) → HTML }
  build({ buds } = {}, ctx = {}, opts = {}) {
    if (!buds || !Array.isArray(buds.rows)) return { rows: [], footer: "", empty: "No bud data." };
    const describe = typeof ctx.describe === "function" ? ctx.describe : () => [];
    const ci = (c) => (typeof ctx.catIcon === "function" ? ctx.catIcon(c) : "");
    const all = buds.rows.map((r) => ({ id: r.id, type: r.type, stem: r.stem, aura: r.aura, owned: !!r.owned, breakdown: r.breakdown || [],
      sflPerDay: r.sflPerDay, sflPerYear: r.sflPerDay * 365 }));
    // owned first, then by FLOWER/day
    all.sort((a, b) => (a.owned !== b.owned ? (a.owned ? -1 : 1) : b.sflPerDay - a.sflPerDay));
    const top = all.reduce((a, r) => Math.max(a, r.sflPerDay), 0);
    const rows = all.filter((r) => (!opts.type || r.type === opts.type) && (!opts.aura || r.aura === opts.aura) && (!opts.owned || r.owned))
      .map((r) => ({ ...r, pct: top > 0 ? (r.sflPerDay / top) * 100 : 0,
        iconHtml: typeof ctx.budIcon === "function" ? ctx.budIcon(r.id) : "",
        boostDescs: describe({ type: r.type, stem: r.stem, aura: r.aura }),
        breakdownHtml: r.breakdown.map((b) => `${ci(b.catId)} ${b.sflPerDay.toFixed(4)}`).join(" · ") }));
    const owned = all.filter((r) => r.owned);
    const c = buds.capacity || {};
    const summary = kpis([{ v: all.length, l: "buds in total" }, { v: owned.length, l: "owned" }, { v: all.filter((r) => r.sflPerDay > 0).length, l: "with a priced boost" },
      { v: owned.length ? `+${owned.reduce((a, r) => Math.max(a, r.sflPerDay), 0).toFixed(4)}` : "—", l: "best owned bud, FLOWER/day" }]) +
      `<div class="v-dim v-rm-note">Capacity: ${c.crops} plots, ${c.fruitPatches} fruit, ${c.greenhouse || 0} greenhouse, ${c.lavaPits || 0} lava pits, ${c.oilReserves || 0} oil reserves, ${c.trees} trees</div>`;
    return { rows, summary, footer: "", empty: "No bud matches the filter." };
  },
};

// ── iPhone glance model: the best owned bud's FLOWER a day (its picture as the hero); the owned buds,
// best first (the best buds overall when none of the filtered ones is owned); bar = share of the best
// bud on the farm ──
const perDay = (v) => `+${v >= 1 ? v.toFixed(2) : v.toFixed(4)}`;
budsTable.look = "number";
budsTable.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = budsTable.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const owned = out.rows.filter((r) => r.owned);
  const list = (owned.length ? owned : out.rows).slice().sort((a, b) => b.sflPerDay - a.sflPerDay), r = list[0];
  const sumOwned = owned.reduce((a, x) => a + x.sflPerDay, 0);
  return {
    head: { value: perDay(r.sflPerDay), unit: " 🌸", tone: r.sflPerDay > 0 ? "ok" : "",
      cap: owned.length ? `a day · #${r.id} · best of ${owned.length}` : `a day · #${r.id} · none owned`, ...(r.iconHtml ? { hero: r.iconHtml } : {}) },
    items: list.slice(0, 40).map((x) => ({ icon: x.iconHtml || "🌱", name: `#${x.id} ${x.type}`, sub: x.aura !== "No Aura" ? `${x.aura} aura` : x.stem,
      value: perDay(x.sflPerDay), tone: x.sflPerDay > 0 ? "ok" : "", pct: x.pct })),
    tiles: [{ label: "buds shown", value: out.rows.length }, { label: "owned", value: owned.length },
      { label: "best / day", value: perDay(r.sflPerDay) }, ...(owned.length ? [{ label: "owned/day", value: perDay(sumOwned) }] : [])],
    foot: owned.length ? "your buds, best first" : "none owned — the best buds",
  };
};
