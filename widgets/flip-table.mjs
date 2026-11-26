// FLIPS · boosted NFTs worth flipping: buy on the bid, relist on the ask (−10 % fee). The feed is
// /api/marketplace-orderbook?flips=1 (store "flips"); sorting and filtering are the table's.
// The marketplace collectors are paused since 2026-09-01 (RT-001): the footer says so while the
// data is older than the collector's own threshold.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kf = (v) => (v == null ? "—" : Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.abs(v) >= 1 ? v.toFixed(0) : v.toFixed(2));
const STALE_H = 3;

export const flipTable = {
  type: "flip-table",
  title: "💱 NFT flips",
  page: "flips",
  needs: () => ({ flips: { res: "flips" } }),
  defaults: { sort: { key: "margin", dir: "desc" }, rows: { mode: "top", top: 20, picked: [] } },
  rowKey: (r) => `${r.collection}:${r.itemId}`,
  rowLabel: (r) => r.name || `#${r.itemId}`,
  columns: [
    { key: "name", label: "NFT", fmt: (v, r) => `<a href="https://sunflower-land.com/play/#/marketplace/${esc(r.collection)}/${esc(r.itemId)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${r.iconHtml || ""}${esc(v || "#" + r.itemId)} 🔗</a>` +
      (r.boost ? `<div class="dash-detail">⚡ ${esc(String(r.boost).replace(/\n+/g, " / "))}</div>` : "") },
    { key: "bidAsk", label: "bid→ask", align: "right", get: (r) => r.bestListing, fmt: (v, r) => `${kf(r.bestOffer)}→${kf(r.bestListing)}` },
    { key: "avgTrade10", label: "avg10", align: "right", extra: true, fmt: kf },
    { key: "spreadPct", label: "spread", align: "right", fmt: (v) => (v == null ? "—" : `${v.toFixed(0)}%`) },
    { key: "net", label: "net", align: "right", fmt: (v) => `<span class="${v <= 0 ? "flip-bad" : "flip-good"}">${kf(v)}</span>` },
    { key: "margin", label: "margin", align: "right", fmt: (v, r) => `<span class="${v >= 15 ? "flip-good" : r.net <= 0 ? "flip-bad" : ""}">${(+v || 0).toFixed(0)}%</span>` },
    { key: "trades", label: "trades/day", align: "right", get: (r) => r.tradesToday || 0, fmt: (v, r) => `${v}/d ${r.nTrades10 || 0}/10` },
    { key: "pressure", label: "pressure o/l", align: "right", extra: true, get: (r) => (r.offerPressure || 0) - (r.listingPressure || 0), fmt: (v, r) => `${r.offerPressure || 0}/${r.listingPressure || 0}` },
    { key: "collection", label: "kind", extra: true, filter: true, fmt: (v) => esc(v) },
  ],

  // data: { flips: { count, items } }   ctx: { icon?(name) → html }
  build({ flips }, ctx = {}) {
    if (!flips || !Array.isArray(flips.items)) return { rows: [], footer: "", empty: "The orderbook data did not load." };
    const rows = flips.items.map((it) => ({ ...it, iconHtml: ctx.icon ? ctx.icon(it.name) : "" }));
    const upd = rows[0] && rows[0].updatedAt;
    const stale = upd && (Date.now() - new Date(upd).getTime()) / 3600000 > STALE_H;
    const footer = `<div style="color:var(--text-dim)">${stale ? "⏸ Collection paused (the game restricted the marketplace API) — data frozen" : "Collected hourly"}` +
      `${upd ? ` · last: ${new Date(upd).toLocaleString("en-US")}` : ""}</div>`;
    return { rows, footer, empty: "No NFTs with both a bid and an ask." };
  },
};
