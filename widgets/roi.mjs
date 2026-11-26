// ROI as widgets: if you log in less often, are your boost NFTs pulling their weight? Per resource
// category: what its sellable NFTs would sell for against the yield they add at a login frequency
// (compute?section=roi precomputes all four frequencies). The login frequency and the currency are
// each copy's own ⚙ options; which categories you would sell (ticked in the table) and the home
// category of a multi-category NFT are yours, shared by every copy.
import { POWER_CATEGORIES, isAnimalCat, getAnimalData } from "../core/engine/power-helpers.mjs";
import { pill, bar } from "../ui/viz.mjs";
import { compact } from "../ui/glance.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (ctx, n) => (typeof ctx.icon === "function" && n ? ctx.icon(n) : "");
const call = (ctx, fn, d) => (typeof ctx[fn] === "function" ? ctx[fn]() : d);
const tiles = (list) => `<div class="v-kpis">` + list.map((k) =>
  `<div class="v-kpi"><b${k.c ? ` style="color:${k.c}"` : ""}>${k.h}</b><span>${esc(k.l)}</span></div>`).join("") + `</div>`;
const NO_DATA = { rows: [], footer: "", empty: "No ROI data yet." };
const catDef = (c) => POWER_CATEGORIES[c] || { label: String(c).toUpperCase(), emoji: "❓" };

function ls(k, d) { try { return (globalThis.localStorage && globalThis.localStorage.getItem(k)) || d; } catch { return d; } }
export const roiQuery = (farmId) => ({ res: "compute", farm: farmId, section: "roi", q: { multicat: ls("sfl_roi_multicat_assignment", "{}") } });
const needs = (farmId, opts = {}) => ({ roi: roiQuery(farmId) });

// FLOWER (the given mark), USD or BTC/sats.
export function roiFormatValue(sfl, currency, sflUsd, btcUsd, mark = "FLOWER") {
  if (!isFinite(sfl)) return "—";
  if (currency === "usd") {
    if (sflUsd <= 0) return "—";
    const usd = sfl * sflUsd;
    return Math.abs(usd) >= 100 ? `$${usd.toFixed(0)}` : `$${usd.toFixed(2)}`;
  }
  if (currency === "btc") {
    if (sflUsd <= 0 || btcUsd <= 0) return "—";
    const btc = (sfl * sflUsd) / btcUsd;
    return Math.abs(btc) >= 0.001 ? `₿${btc.toFixed(5)}` : `${Math.round(btc * 1e8)} sats`;
  }
  return Math.abs(sfl) >= 100 ? `${sfl.toFixed(0)} ${mark}` : `${sfl.toFixed(2)} ${mark}`;
}
// the copy's login frequency (2× a day by default) and currency (FLOWER by default)
const settingsOf = (opts) => ({
  L: [1, 2, 3, 4].includes(Number(opts.logins)) ? Number(opts.logins) : 2,
  currency: ["flower", "usd", "btc"].includes(opts.currency) ? opts.currency : "flower",
});
const fmtOf = (roi, currency, ctx) => (sfl) => roiFormatValue(sfl, currency, roi.sflUsd, roi.btcUsd, typeof ctx.sfl === "function" ? ctx.sfl() : "FLOWER");

const VERDICT_RANK = { "sell-now": 0, sell: 1, marginal: 2, keep: 3, "no-nodes": 4, "no-nfts": 5 };
const VERDICT = { "sell-now": ["SELL NOW", "bad"], sell: ["SELL", "bad"], marginal: ["MARGINAL", "run"], keep: ["KEEP", "ok"], "no-nfts": ["—", "idle"], "no-nodes": ["NO NODES", "idle"] };
const roiColor = (v) => (v === "sell-now" ? "var(--c-red)" : v === "sell" ? "#ff8c42" : v === "marginal" ? "var(--c-yellow)" : v === "keep" ? "var(--c-green)" : "var(--c-dim)");

// The categories to show at L logins a day, sell-first, then the longest payback first.
export function roiRows(roi, L) {
  const rows = ((roi.rowsByLogins || {})[L] || []).map((r) => ({ ...r, roiYears: r.roiYears == null ? Infinity : r.roiYears }));
  return rows.filter((r) => r.sellableInCat.length > 0 || r.externallyAssigned.length > 0 || (r.catId === "pets" && r.nodeCount > 0))
    .sort((a, b) => {
      const dr = (VERDICT_RANK[a.verdict] ?? 9) - (VERDICT_RANK[b.verdict] ?? 9);
      if (dr !== 0) return dr;
      if (isFinite(a.roiYears) && isFinite(b.roiYears)) return b.roiYears - a.roiYears;
      return 0;
    });
}

// The expanded calculation of one category (inside its row's <details>).
function detailHtml(row, fmtVal, multicat, L, ctx) {
  let h = `<div class="v-roi-detail"><div class="v-power-h">Sellable NFTs assigned here</div>`;
  if (!row.sellableInCat.length) h += `<div class="v-dim">None.</div>`;
  else {
    h += `<table class="w-table"><thead><tr><th>name</th><th>type</th><th>boost</th><th style="text-align:right">value</th><th>multi</th></tr></thead><tbody>` +
      row.sellableInCat.map((b) => {
        let multi = "—";
        if (b.isMultiCat) {
          const others = b.quantCats.filter((c) => c !== row.catId).map((c) => catDef(c).label).join(", ");
          const options = b.quantCats.map((c) => `<option value="${esc(c)}"${(multicat[b.name] || b.quantCats[0]) === c ? " selected" : ""}>${esc(catDef(c).label)}</option>`).join("");
          multi = `<span style="color:var(--c-red)" title="Also boosts: ${esc(others)}">⚠</span> <select onchange="window._roiSetMulticat && _roiSetMulticat(this.dataset.name, this.value)" data-name="${esc(b.name)}" onclick="event.stopPropagation()">${options}</select>`;
        }
        return `<tr><td>${icon(ctx, b.name)}${esc(b.name)}</td><td class="v-dim">${esc(b.type)}</td><td class="v-dim">${esc((b.boost || "").replace(/\n/g, " / ").slice(0, 55))}</td>` +
          `<td style="text-align:right;color:var(--c-yellow)">${fmtVal(b.floor)}</td><td>${multi}</td></tr>`;
      }).join("") + `</tbody></table>`;
  }
  if (row.externallyAssigned.length) {
    h += `<div class="v-power-note" style="margin-top:8px"><b>ℹ Also boosting this category but sale-attributed elsewhere:</b><br>` +
      row.externallyAssigned.map((b) => { const home = multicat[b.name] || b.quantCats[0]; return `<span style="white-space:nowrap">${icon(ctx, b.name)}${esc(b.name)} → ${esc(catDef(home).label)}</span>`; }).join(" &nbsp;·&nbsp; ") + `</div>`;
  }
  if (row.nodeCount > 0 || row.catId === "fishing") {
    const interval = 86400 / L;
    const hk = row.realisticCycleKeep > 0 ? 86400 / row.realisticCycleKeep : 0, hs = row.realisticCycleSold > 0 ? 86400 / row.realisticCycleSold : 0;
    const fmtH = (s) => (s < 7200 ? (s / 60).toFixed(0) + "m" : (s / 3600).toFixed(2) + "h");
    const red = (v) => `<span style="color:var(--c-red)">−${fmtVal(v)}</span>`;
    const saved = [["tool", row.toolCostSold - row.toolCostKeep], ["lava", row.lavaCostSold - row.lavaCostKeep], ["seed", row.seedCostSold - row.seedCostKeep],
      ["feed", row.feedCostSold - row.feedCostKeep], ["sickness", row.sicknessCostSold - row.sicknessCostKeep]].filter(([, d]) => d > 0.01).map(([k, d]) => `${k} saved ${fmtVal(d)}`);
    const tool = row.toolInfoKeep && row.toolInfoKeep.toolName;
    const product = isAnimalCat(row.catId) ? getAnimalData(row.catId).products.map((p) => `${icon(ctx, p)}${esc(p)}`).join(" + ") : null;
    h += `<div class="v-power-note" style="margin-top:8px"><b>Calculation</b> ${row.catId === "pets" ? "(pet fetches, daily cap)" : row.isDailyOutput ? "(daily cap, independent of logins)" : `(${L}×/day, ${(interval / 3600).toFixed(1)}h apart)`}<br>
      • ${row.catId === "pets" ? `Pets: ${row.nodeCount}` : `Nodes: ${row.nodeCount}`}<br>
      ${row.catId === "pets" ? "" : product ? `• Products: ${product} (level-based drops, both counted)<br>` : `• Product: ${icon(ctx, row.product)}${esc(row.product || "—")} @ ${row.price.toFixed(3)}/unit<br>`}
      ${row.catId === "pets" ? "" : `• Base cycle → with all boosts: ${fmtH(row.baseCycle)} → ${fmtH(row.cycleKeep)}<br>`}
      ${!row.isDailyOutput ? `• Realistic cycle at ${L}×/day: <b>${fmtH(row.realisticCycleKeep)}</b> keep / <b>${fmtH(row.realisticCycleSold)}</b> sold<br>
      • Harvests/day in total: ${hk.toFixed(2)} keep / ${hs.toFixed(2)} sold<br>` : ""}
      • Daily gross yield with the NFTs: <span style="color:var(--c-green)">${fmtVal(row.yieldKeepSfl)}</span><br>
      • Daily gross yield if sold: <span class="v-dim">${fmtVal(row.yieldSoldSfl)}</span><br>
      ${row.toolCostKeep > 0 || row.toolCostSold > 0 || (row.toolInfoKeep && row.toolInfoKeep.freeTool) ? `• Tool cost ${tool ? `(${icon(ctx, tool)}${esc(tool)} @ ${row.toolInfoKeep.sfl.toFixed(3)}/use)` : ""}: keep ${red(row.toolCostKeep)}${row.toolInfoKeep && row.toolInfoKeep.freeTool ? ` <span style="color:var(--c-green)">(FREE via a boost)</span>` : ""} / sold ${red(row.toolCostSold)}<br>` : ""}
      ${row.lavaCostKeep > 0 || row.lavaCostSold > 0 ? `• Lava pit ingredient cost: keep ${red(row.lavaCostKeep)} / sold ${red(row.lavaCostSold)}<br>` : ""}
      ${row.seedCostKeep > 0 || row.seedCostSold > 0 ? `• Seed cost: keep ${red(row.seedCostKeep)} / sold ${red(row.seedCostSold)}<br>` : ""}
      ${row.feedCostKeep > 0 || row.feedCostSold > 0 ? `• Feed cost: keep ${red(row.feedCostKeep)} / sold ${red(row.feedCostSold)}<br>` : ""}
      ${row.sicknessCostKeep > 0 || row.sicknessCostSold > 0 ? `• Sickness cost (expected): keep ${red(row.sicknessCostKeep)} / sold ${red(row.sicknessCostSold)}<br>` : ""}
      • Daily <b>net</b> with the NFTs: <b style="color:var(--c-green)">${fmtVal(row.netKeepSfl)}</b><br>
      • Daily <b>net</b> if sold: <b class="v-dim">${fmtVal(row.netSoldSfl)}</b><br>
      • <b style="color:var(--c-yellow)">Marginal: ${fmtVal(row.marginalSflPerDay)}/day</b>${saved.length ? ` <span class="v-dim">(yield Δ ${fmtVal(row.yieldKeepSfl - row.yieldSoldSfl)}, ${saved.join(", ")})</span>` : ""}
      ${row.saleSfl > 0 && row.marginalSflPerDay > 0 ? `<br>• ROI: ${fmtVal(row.saleSfl)} ÷ (${fmtVal(row.marginalSflPerDay)} × 365) = <b style="color:var(--c-yellow)">${row.roiYears.toFixed(2)} years</b>` : ""}
      ${row.wastedTimeBoost ? `<br>• ⏰ <span style="color:var(--c-yellow)">Time-reduction boosts wasted</span> — the cycle (${fmtH(row.cycleKeep)}) is shorter than the login interval (${(interval / 3600).toFixed(1)}h). Flat-yield boosts still count.` : ""}</div>`;
  } else if (row.nodeCount === 0) {
    h += `<div class="v-dim">No nodes on the farm for this category. The sale value still shows, but no marginal yield can be calculated.</div>`;
  }
  return h + `</div>`;
}

const LOGIN_CHOICES = [["1", "1× a day"], ["2", "2× a day"], ["3", "3× a day"], ["4", "4× a day"]];
const CURRENCY_CHOICES = [["flower", "FLOWER"], ["usd", "$ USD"], ["btc", "₿ BTC"]];

// ── 💸 Sell or farm? ─────────────────────────────────────────────────────────────────────────────
export const roiSellOrFarm = {
  type: "roi-sell-or-farm",
  title: "💸 Sell or farm?",
  titleFor: (o) => `💸 Sell or farm? – ${settingsOf(o).L}× a day`,
  page: "roi",
  needs,
  optionsLabel: "ROI",
  options: [
    { key: "logins", label: "Logins a day", kind: "select", choices: LOGIN_CHOICES },
    { key: "currency", label: "Currency", kind: "select", choices: CURRENCY_CHOICES },
  ],
  defaults: { opts: { logins: "2", currency: "flower" } },
  rowKey: (r) => r.catId,
  rowLabel: (r) => r.label,
  rowClass: (r) => (r.selected ? "w-st-ready" : ""),
  columns: [
    { key: "label", label: "resource", fmt: (v, r) => `<details class="v-roi-row"><summary><b>${r.emoji} ${esc(v)}</b></summary>${r.detail}</details>` },
    { key: "nfts", label: "NFTs", align: "right" },
    { key: "saleSfl", label: "sale", align: "right", fmt: (v, r) => (v > 0 ? `<span style="color:var(--c-yellow)">${r.fmt(v)}</span>` : "—") },
    { key: "cycle", label: "cycle", get: (r) => r.baseCycle, fmt: (v, r) => r.cycleHtml },
    { key: "marginalSflPerDay", label: "Δ / day", align: "right", title: "what the NFTs add a day at this login frequency",
      fmt: (v, r) => (v > 0.01 ? r.fmt(v) : v < -0.01 ? `<span style="color:var(--c-red)">${r.fmt(v)}</span>` : "—") },
    { key: "roiYears", label: "payback", align: "right", fmt: (v, r) => `<b style="color:${roiColor(r.verdict)}">${esc(r.roiText)}</b>` },
    { key: "verdict", label: "verdict", get: (r) => VERDICT_RANK[r.verdict] ?? 9, fmt: (v, r) => pill(...(VERDICT[r.verdict] || ["—", "idle"])) },
    { key: "sell", label: "sell?", title: "Mark the category as “I'd sell this” — the totals add up above the table", get: (r) => (r.selected ? 1 : 0),
      fmt: (v, r) => `<input type="checkbox" ${r.selected ? "checked" : ""} ${r.nfts ? "" : "disabled"} onclick="window._roiToggleSell && _roiToggleSell('${esc(r.catId)}')">` },
  ],
  // ctx: { sellSelection() → Set of catIds, multicat() → {name: catId}, icon, sfl }
  build({ roi } = {}, ctx = {}, opts = {}) {
    if (!roi || !roi.rowsByLogins) return NO_DATA;
    const { L, currency } = settingsOf(opts);
    const fmt = fmtOf(roi, currency, ctx);
    const sel = call(ctx, "sellSelection", new Set()) || new Set(), multicat = call(ctx, "multicat", {}) || {};
    const cycleH = (s) => (s < 7200 ? (s / 60).toFixed(0) + "m" : (s / 3600).toFixed(s < 36000 ? 1 : 0) + "h");
    const rows = roiRows(roi, L).map((r) => {
      const d = catDef(r.catId);
      const roiText = r.verdict === "sell-now" ? "INSTANT" : r.verdict === "no-nfts" ? "—" : r.verdict === "no-nodes" ? "n/a"
        : !isFinite(r.roiYears) ? "∞" : r.roiYears.toFixed(r.roiYears < 10 ? 1 : 0) + "y";
      const wasted = r.wastedTimeBoost ? ` <span style="color:var(--c-yellow)" title="The boosted cycle is shorter than the ${(24 / L).toFixed(1)}h login interval — the time-reduction part is wasted">⏰</span>` : "";
      return { ...r, label: d.label, emoji: d.emoji, nfts: r.sellableInCat.length, fmt, roiText, selected: sel.has(r.catId),
        cycleHtml: r.isDailyOutput ? "daily" : `${cycleH(r.baseCycle)} → ${cycleH(r.cycleKeep)}${wasted}`, detail: detailHtml(r, fmt, multicat, L, ctx) };
    });
    const summary = tiles([{ h: `${L}×`, l: `logins a day (${(24 / L).toFixed(1)}h apart)` }, { h: `$${(roi.sflUsd || 0).toFixed(4)}`, l: "FLOWER → USD" },
      { h: String(rows.filter((r) => r.verdict === "sell-now" || r.verdict === "sell").length), l: "categories to sell", c: "var(--c-red)" },
      { h: String(rows.filter((r) => r.verdict === "keep").length), l: "to keep", c: "var(--c-green)" }]) + sellingHtml(rows.filter((r) => r.selected), fmt, ctx);
    const footer = `<details class="v-power-more"><summary>How it is calculated</summary><div class="v-dim">
      • Realistic harvests per node a day: at the next login after the cycle completes (steady state). Time-reduction boosts that shrink the cycle below the login interval are wasted (⏰).<br>
      • Yield boosts (+1, +10% …) still count per harvest even when the time reduction is wasted.<br>
      • Crops are modelled with ${icon(ctx, "Wheat")}Wheat only (24h, no gem restocks needed); other categories use their default product.<br>
      • Multi-category NFTs (e.g. Volcano Gnome → Stone + Iron + Gold) are sale-attributed to one home category — change it in the expanded row. In the other categories the boost still counts as kept.<br>
      • Skills cannot be sold, but their boosts ARE in the yield.<br>
      • Sale values: the marketplace floor at load time; real prices may differ.<br>
      • Fishing and bees: the daily output is capped by the game (~20 fish a day, bee → honey rate), not by login frequency.</div></details>`;
    return { rows, summary, footer, empty: "No sellable boost NFTs owned for any resource category." };
  },
};

// ── 🧾 Selling the ticked categories (above the sell-or-farm table, on its frequency and currency) ──
function sellingHtml(picked, fmt, ctx) {
  if (!picked.length) return `<div class="v-dim" style="margin-bottom:10px">☑️ Tick “sell?” on the categories you'd consider selling — the totals appear here.</div>`;
  const sale = picked.reduce((s, r) => s + r.saleSfl, 0), lost = picked.reduce((s, r) => s + r.marginalSflPerDay, 0);
  const years = lost > 0 ? sale / (lost * 365) : Infinity;
  const nfts = picked.reduce((s, r) => s + r.sellableInCat.length, 0);
  const multi = new Set(picked.flatMap((r) => r.sellableInCat.filter((b) => b.isMultiCat).map((b) => b.name)));
  let html = `<div class="v-power-note" style="margin-bottom:10px"><div style="margin-bottom:8px">🧾 Selling <b style="color:var(--c-yellow)">${picked.map((r) => `${catDef(r.catId).emoji} ${esc(catDef(r.catId).label)}`).join(" + ")}</b>` +
    ` <button type="button" class="dash-toggle-btn" onclick="window._roiClearSell && _roiClearSell()">clear</button></div>` +
    tiles([{ h: fmt(sale), l: `sale value · ${nfts} NFT${nfts !== 1 ? "s" : ""}`, c: "var(--c-yellow)" },
      { h: `−${fmt(lost)}/day`, l: "daily yield lost (sum of the categories)", c: "var(--c-red)" },
      { h: !isFinite(years) ? "INSTANT" : years.toFixed(2) + "y", l: "combined payback",
        c: !isFinite(years) ? "var(--c-red)" : years < 1 ? "var(--c-green)" : years < 5 ? "var(--c-yellow)" : "#ff8c42" }]) +
    bar(isFinite(years) ? Math.min(100, (years / 5) * 100) : 0, "run");
  if (multi.size) html += `<div class="v-dim" style="margin-top:8px">⚠ ${multi.size} multi-category NFT${multi.size !== 1 ? "s" : ""} in the selection (${[...multi].slice(0, 5).map((n) => `${icon(ctx, n)}${esc(n)}`).join(", ")}${multi.size > 5 ? ", …" : ""}). Sold, they also stop boosting their other categories — the yield lost may be larger than shown.</div>`;
  return html + `</div>`;
}

// ── 🎁 NFTs that do not add yield ───────────────────────────────────────────────────────────────
const QUAL_ORDER = ["cooking", "coins", "protection", "other"];
const QUAL_DESC = { cooking: "Cooking / XP boosts — faster Bumpkin levelling, dish bonuses.", coins: "Coin / FLOWER boosts — sale-price multipliers, delivery rewards.",
  protection: "Protection — disaster resistance and the like.", other: "Other / unclassified boosts." };
export const roiPassive = {
  type: "roi-passive",
  title: "🎁 Owned NFTs without a yield",
  titleFor: (o) => (o.group && QUAL_ORDER.includes(o.group) ? `🎁 ${catDef(o.group).emoji} ${catDef(o.group).label} NFTs` : "🎁 Owned NFTs without a yield"),
  page: "roi",
  needs,
  optionsLabel: "NFTs",
  options: [{ key: "group", label: "Group", kind: "select", choices: [["", "all groups"], ...QUAL_ORDER.map((c) => [c, `${catDef(c).emoji} ${catDef(c).label}`])] },
    { key: "currency", label: "Currency", kind: "select", choices: CURRENCY_CHOICES }],
  defaults: { opts: { group: "", currency: "flower" } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  columns: [
    { key: "name", label: "NFT", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b><small>${esc(r.type)}</small></div></div>` },
    { key: "group", label: "group", filter: true, filterLabel: (v) => catDef(v).label, fmt: (v) => `${catDef(v).emoji} ${esc(catDef(v).label)}` },
    { key: "boost", label: "boost", fmt: (v) => `<span class="v-dim">${esc(v)}</span>` },
    { key: "floor", label: "sale", align: "right", fmt: (v, r) => `<span style="color:var(--c-yellow)">${r.fmt(v)}</span>` },
  ],
  build({ roi } = {}, ctx = {}, opts = {}) {
    if (!roi || !roi.boostItems) return NO_DATA;
    const { currency } = settingsOf(opts);
    const fmt = fmtOf(roi, currency, ctx);
    const items = roi.boostItems.filter((b) => b.has && !b.isDisabled && b.isSellable && b.quantCats.length === 0)
      .map((b) => ({ name: b.name, type: b.type, floor: b.floor, boost: (b.boost || "").replace(/\n/g, " • ").slice(0, 90),
        group: b.categories.find((c) => QUAL_ORDER.includes(c)) || "other", iconHtml: icon(ctx, b.name), fmt }))
      .filter((b) => !opts.group || b.group === opts.group)
      .sort((a, b) => QUAL_ORDER.indexOf(a.group) - QUAL_ORDER.indexOf(b.group) || b.floor - a.floor);
    const groups = QUAL_ORDER.filter((g) => items.some((b) => b.group === g));
    const summary = tiles(groups.map((g) => { const its = items.filter((b) => b.group === g); return { h: fmt(its.reduce((s, b) => s + b.floor, 0)), l: `${catDef(g).emoji} ${catDef(g).label} · ${its.length} NFT${its.length !== 1 ? "s" : ""}` }; }));
    const footer = `<div class="v-dim">${groups.map((g) => `${catDef(g).emoji} ${esc(QUAL_DESC[g])}`).join("<br>")}</div>`;
    return { rows: items, summary: items.length ? summary : "", footer, empty: "No owned sellable NFTs without a yield." };
  },
};

export const ROI_WIDGETS = [roiSellOrFarm, roiPassive];

// ── iPhone glance models (plain text, so FLOWER is 🌸, not the page's icon HTML); the glance
// templates (ui/glance-templates.mjs) offer every look each fills ──
const G_TONE = { bad: "bad", run: "warn", ok: "ok", idle: "" };
const gFmt = (roi, currency) => (sfl) => roiFormatValue(sfl, currency, roi.sflUsd, roi.btcUsd, "🌸");
// a tile's value: FLOWER compact and without the mark (a tile is narrow)
const gTile = (roi, currency) => (sfl) => (currency === "usd" || currency === "btc" ? roiFormatValue(sfl, currency, roi.sflUsd, roi.btcUsd) : compact(sfl));

// 💸 sell or farm: how many categories to sell at the copy's login frequency; the verdicts, sell first
// (bar = the category's share of the sale value)
roiSellOrFarm.look = "number";
roiSellOrFarm.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = roiSellOrFarm.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const { L, currency } = settingsOf(opts), fmt = gFmt(data.roi, currency), tile = gTile(data.roi, currency);
  const sell = out.rows.filter((r) => r.verdict === "sell-now" || r.verdict === "sell").length, keep = out.rows.filter((r) => r.verdict === "keep").length;
  const sale = out.rows.reduce((s, r) => s + (r.saleSfl > 0 ? r.saleSfl : 0), 0);
  return {
    head: { value: sell, unit: " to sell", tone: sell ? "bad" : "ok", cap: `${keep} to keep · ${L}× a day` },
    items: out.rows.map((r) => {
      const [text, t] = VERDICT[r.verdict] || ["—", "idle"];
      return { icon: r.emoji, name: r.label, sub: `${r.nfts} NFT${r.nfts !== 1 ? "s" : ""} · payback ${r.roiText}`, chip: { text, tone: G_TONE[t] },
        pct: sale > 0 && r.saleSfl > 0 ? (r.saleSfl / sale) * 100 : 0 };
    }),
    tiles: [{ label: "logins/day", value: `${L}×` }, { label: "to sell", value: sell }, { label: "to keep", value: keep }, { label: "sale value", value: tile(sale) }],
    foot: `logins ${(24 / L).toFixed(1)}h apart · bar = share of the sale value`,
  };
};

// 🎁 NFTs without a yield: what they would sell for; the most valuable ones; a tile per group
roiPassive.look = "number";
roiPassive.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = roiPassive.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const fmt = gFmt(data.roi, settingsOf(opts).currency), tile = gTile(data.roi, settingsOf(opts).currency), sum = out.rows.reduce((s, r) => s + r.floor, 0);
  const groups = QUAL_ORDER.filter((g) => out.rows.some((r) => r.group === g));
  return {
    head: { value: fmt(sum), tone: "warn", cap: `sale value · ${out.rows.length} NFT${out.rows.length !== 1 ? "s" : ""} without a yield` },
    items: out.rows.slice().sort((a, b) => b.floor - a.floor).map((r) => ({ icon: r.iconHtml, name: r.name, sub: `${catDef(r.group).emoji} ${catDef(r.group).label}`,
      value: fmt(r.floor), pct: sum > 0 ? (r.floor / sum) * 100 : 0 })),
    tiles: [{ label: "sale value", value: tile(sum) }, ...groups.map((g) => { const its = out.rows.filter((r) => r.group === g); return { label: catDef(g).label, value: tile(its.reduce((s, r) => s + r.floor, 0)) }; })],
    foot: "bar = share of the sale value",
  };
};
