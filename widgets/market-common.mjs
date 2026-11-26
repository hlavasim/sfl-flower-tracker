// Small helpers the TREASURY, SALES, MY TRADES, MARKS and FLIPS widgets share: escaping, the
// page's number formats (the same digits the pages showed before they became widgets), the
// item icon from the page (ctx.icon) and "8× [icon] Feather" item lists.
export { sflIcon } from "../core/engine/power-formula.mjs";

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The page's icon <img> for an item name ("" when the page gave none, e.g. in a test).
export const icon = (ctx, name) => (ctx && typeof ctx.icon === "function" && name ? ctx.icon(name) : "");

// "8× [icon] Feather, 1× [icon] Doll" from { name: qty } or [[name, qty]].
export function itemList(ctx, items, { qtyFmt = (q) => q, sep = ", " } = {}) {
  const list = Array.isArray(items) ? items : Object.entries(items || {});
  return list.map(([n, q]) => `<span class="v-mkt-item">${esc(qtyFmt(q))}× ${icon(ctx, n)}${esc(n)}</span>`).join(sep);
}

// The page's formatSFL (TREASURY, price trackers).
export function formatSFL(v) {
  v = +v || 0;
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e4) return Math.round(v).toLocaleString();
  if (v >= 100) return v.toFixed(1);
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(4);
}
export const formatUSD = (v) => "$" + (+v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Compact SFL (FLIPS, MY TRADES): 1.2k · 140 · 0.55
export const kf = (v) => (v == null ? "—" : Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.abs(v) >= 1 ? v.toFixed(0) : v.toFixed(2));

// MARKS: rounded, 10k+ as "12.3k"
export function fmtNum(n) {
  if (n == null || isNaN(n)) return "0";
  n = Math.round(n);
  if (Math.abs(n) >= 10000) return (n / 1000).toFixed(1) + "k";
  return n.toLocaleString("en-US");
}

// A bar in a given colour (the category colours of TREASURY); p in percent.
export const colorBar = (p, color) =>
  `<div class="v-bar"><i style="width:${Math.max(0, Math.min(100, +p || 0)).toFixed(1)}%;background:${esc(color)}"></i></div>`;

// The marketplace collectors are paused since 2026-09-01 (RT-001): said only while the data is
// older than the collector's own threshold, so it clears itself if collection ever resumes.
export function pausedNotice(latestTs, thresholdH, now = Date.now()) {
  if (latestTs && (now - new Date(latestTs).getTime()) / 3600000 <= thresholdH) return "";
  const asOf = latestTs ? new Date(latestTs).toLocaleString("en-GB") : "—";
  return `<div class="v-mkt-note v-mkt-warn">⏸ <b>Marketplace API restricted by the game</b> (anti-bot protection, 1 Sep 2026). ` +
    `Server collection is paused — the data is frozen at <b>${esc(asOf)}</b> and no longer updates.</div>`;
}
