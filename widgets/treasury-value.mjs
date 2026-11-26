// TREASURY · farm value: the total (SFL, USD, BTC) and each category's share as a pie. The numbers
// are the server's section=treasury valuation (store resource "treasury"), the same as the page;
// the page hands over its category colours (ctx.catColors).
import { sflIcon } from "../core/engine/power-formula.mjs";

const CATS = [
  ["resources", "Resources"], ["treasures", "Treasures"], ["collectibles", "Collectibles"], ["produced", "Produced"],
  ["wearables", "Wearables"], ["pets", "Pets"], ["listings", "Listings"], ["liquid", "Liquid"],
];
const sfl = (n) => (+n || 0).toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 });
const usd = (n) => "$" + (+n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

export const treasuryValue = {
  type: "treasury-value",
  title: "💰 Hodnota farmy",
  page: "treasury",
  needs: (farmId) => ({ treasury: { res: "treasury", farm: farmId } }),

  // data: { treasury: { value: { totals, rates }, pricesOk } }   ctx: { catColors? }
  view({ treasury }, ctx = {}) {
    const v = treasury && treasury.value;
    if (!v || !v.totals) return { empty: "Ocenění z Treasury se nenačetlo." };
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
    const warn = treasury.pricesOk === false
      ? `<div style="color:#ff8c42">⚠ ceny se nenačetly — část farmy počítá jako 0</div>` : "";
    return {
      html: `<div class="w-tile">${warn}<div class="w-tile-big">${sfl(grand)} ${sflIcon()}</div>` +
        `<div class="w-tile-sub">${usd(usdTotal)} · ${btc.toFixed(8)} BTC</div></div>` +
        `<div class="w-pie-wrap"><div class="w-pie" style="background:conic-gradient(${slices.join(", ") || "#333 0% 100%"})"></div>` +
        `<div class="w-pie-legend">${legend.join("")}</div></div>`,
    };
  },
};
