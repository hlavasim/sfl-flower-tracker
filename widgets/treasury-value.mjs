// TREASURY · farm value: the total (SFL, USD, BTC), the rates it stands on and each category's
// share as a pie. The numbers are the server's section=treasury valuation (store resource
// "treasury"), the same as the page; the page hands over its category colours (ctx.catColors) and,
// on the page, the full list of what failed to load (treasury.warnings).
import { sflIcon, esc, formatSFL, formatUSD } from "./market-common.mjs";
import { big, compact } from "../ui/glance.mjs";

export const CATS = [
  ["resources", "Resources"], ["treasures", "Treasures"], ["collectibles", "Collectibles"], ["produced", "Produced"],
  ["wearables", "Wearables"], ["pets", "Pets"], ["listings", "Listings"], ["liquid", "Liquid"],
];
const btcText = (v) => (v >= 0.01 ? v.toFixed(4) : v.toFixed(8)) + " BTC";

export const treasuryValue = {
  type: "treasury-value",
  title: "💰 Farm value",
  page: "treasury",
  needs: (farmId) => ({ treasury: { res: "treasury", farm: farmId } }),

  // data: { treasury: { value: { totals, rates }, pricesOk, warnings? } }   ctx: { catColors? }
  view({ treasury }, ctx = {}) {
    const v = treasury && treasury.value;
    if (!v || !v.totals) return { empty: "The Treasury valuation did not load." };
    const { totals, rates = {} } = v;
    const grand = totals.grand || 0;
    const colors = ctx.catColors || {};
    let at = 0;
    const slices = [], legend = [];
    for (const [k, label] of CATS) {
      const pct = grand > 0 ? ((totals[k] || 0) / grand) * 100 : 0;
      if (pct < 0.1) continue;
      const c = colors[k] || "#666";
      slices.push(`${c} ${+at.toFixed(2)}% ${+(at + pct).toFixed(2)}%`);
      legend.push(`<div><span class="w-swatch" style="background:${c}"></span>${label}: ${pct.toFixed(1)} %</div>`);
      at += pct;
    }
    const usdTotal = grand * (rates.sflUsd || 0);
    const btc = rates.btcUsd > 0 ? usdTotal / rates.btcUsd : 0;
    const warns = Array.isArray(treasury.warnings) && treasury.warnings.length ? treasury.warnings
      : treasury.pricesOk === false ? ["prices did not load — part of the farm counts as 0"] : [];
    const warn = warns.length ? `<div class="v-mkt-note v-mkt-warn">⚠ Incomplete valuation: ${warns.map(esc).join(" · ")}</div>` : "";
    const rateLine = `1 ${sflIcon()} = ${(rates.sflUsd || 0).toFixed(4)} USD · 1 BTC = ${formatUSD(rates.btcUsd || 0)}`;
    return {
      html: `${warn}<div class="w-tile v-treasury-tile"><div class="w-tile-big v-treasury-total">${formatSFL(grand)} ${sflIcon()}</div>` +
        `<div class="w-tile-sub">${formatUSD(usdTotal)} · ${btcText(btc)}</div><div class="v-dim v-treasury-rates">${rateLine}</div></div>` +
        `<div class="w-pie-wrap"><div class="w-pie" style="background:conic-gradient(${slices.join(", ") || "#333 0% 100%"})"></div>` +
        `<div class="w-pie-legend">${legend.join("")}</div></div>`,
    };
  },
};

// ── iPhone glance face: the total, and (M) each category's share as one stacked bar ──
treasuryValue.sizes = ["s", "m"];
treasuryValue.size = "s";
treasuryValue.glance = ({ treasury } = {}, ctx = {}, opts = {}, size = "s") => {
  const v = treasury && treasury.value;
  if (!v || !v.totals) return { empty: "The Treasury valuation did not load." };
  const { totals, rates = {} } = v;
  const grand = totals.grand || 0, usd = grand * (rates.sflUsd || 0), btc = rates.btcUsd > 0 ? usd / rates.btcUsd : 0;
  let h = big(compact(grand), { unit: " 🌸", cap: `${formatUSD(usd)} · ${btcText(btc)}` });
  if (size === "m") {
    const colors = ctx.catColors || {};
    const parts = CATS.map(([k, label]) => ({ k, label, pct: grand > 0 ? ((totals[k] || 0) / grand) * 100 : 0 })).filter((p) => p.pct >= 0.5).sort((a, b) => b.pct - a.pct);
    h += `<div class="g-stack">` + parts.map((p) => `<i style="width:${p.pct.toFixed(1)}%;background:${colors[p.k] || "#888"}" title="${esc(p.label)} ${p.pct.toFixed(1)} %"></i>`).join("") + `</div>` +
      `<div class="g-legend">` + parts.slice(0, 4).map((p) => `<span><i style="background:${colors[p.k] || "#888"}"></i>${esc(p.label)} ${p.pct.toFixed(0)} %</span>`).join("") + `</div>`;
  }
  return { html: h };
};
