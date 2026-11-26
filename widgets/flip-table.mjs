// FLIPS · boosted NFTs worth flipping: buy on the bid, relist on the ask (−10 % fee). The feed is
// /api/marketplace-orderbook?flips=1 (store "flips"); sorting and filtering are the table's (the
// page's old sort chips are its columns: score, margin, net, spread, liquidity, pressure, floor).
// The marketplace collectors are paused since 2026-09-01 (RT-001): the footer says so while the
// data is older than the collector's own threshold.
//   💱 NFT flips: the table.   📊 Flip overview: tiles, the colour legend and the paused notice.
import { esc, kf, pausedNotice } from "./market-common.mjs";
import { kpis, bar } from "../ui/viz.mjs";
import { big, rows as gRows } from "../ui/glance.mjs";

const STALE_H = 3;
const isStale = (upd, now = Date.now()) => !!upd && (now - new Date(upd).getTime()) / 3600000 > STALE_H;

export const flipTable = {
  type: "flip-table",
  title: "💱 NFT flips",
  page: "flips",
  needs: () => ({ flips: { res: "flips" } }),
  defaults: { sort: { key: "score", dir: "desc" }, rows: { mode: "top", top: 50, picked: [] } },
  rowKey: (r) => `${r.collection}:${r.itemId}`,
  rowLabel: (r) => r.name || `#${r.itemId}`,
  columns: [
    { key: "name", label: "NFT", fmt: (v, r) => `<div class="v-name">${r.iconHtml || ""}<div><a href="https://sunflower-land.com/play/#/marketplace/${esc(r.collection)}/${esc(r.itemId)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none"><b>${esc(v || "#" + r.itemId)}</b> 🔗</a>` +
      (r.boost ? `<small>⚡ ${esc(String(r.boost).replace(/\n+/g, " / "))}</small>` : "") + `</div></div>` },
    { key: "bidAsk", label: "bid→ask", align: "right", get: (r) => r.bestListing, fmt: (v, r) => `${kf(r.bestOffer)}→${kf(r.bestListing)}` },
    { key: "avgTrade10", label: "avg10", align: "right", extra: true, fmt: kf },
    { key: "spreadPct", label: "spread", align: "right", fmt: (v) => (v == null ? "—" : `${v.toFixed(0)}%`) },
    { key: "net", label: "net", align: "right", fmt: (v) => `<span class="${v <= 0 ? "flip-bad" : "flip-good"}">${kf(v)}</span>` },
    { key: "margin", label: "margin", align: "right", fmt: (v, r) => `<span class="${v >= 15 ? "flip-good" : r.net <= 0 ? "flip-bad" : ""}">${(+v || 0).toFixed(0)}%</span>` },
    // margin as a bar: full at 30 % and more, the colours of the margin column
    { key: "marginBar", label: "", get: (r) => r.margin, fmt: (v, r) => bar(Math.max(0, (+v || 0) / 30 * 100), v >= 15 ? "ok" : r.net <= 0 ? "bad" : "mid") },
    { key: "score", label: "score", align: "right", title: "margin × (1 + liquidity)", fmt: (v) => (v == null ? "—" : `🔥 ${(+v).toFixed(0)}`) },
    { key: "trades", label: "trades", align: "right", get: (r) => r.tradesToday || 0, fmt: (v, r) => `${v}/d ${r.nTrades10 || 0}/10` },
    { key: "liq", label: "liquidity", align: "right", extra: true, title: "trades today + offer pressure × 0.5" },
    { key: "pressure", label: "pressure o/l", align: "right", extra: true, get: (r) => (r.offerPressure || 0) - (r.listingPressure || 0), fmt: (v, r) => `${r.offerPressure || 0}/${r.listingPressure || 0}` },
    { key: "floor", label: "floor", align: "right", extra: true, fmt: kf },
    { key: "collection", label: "kind", extra: true, filter: true, fmt: (v) => esc(v) },
  ],

  // data: { flips: { count, items } }   ctx: { icon?(name) → html }
  build({ flips }, ctx = {}) {
    if (!flips || !Array.isArray(flips.items)) return { rows: [], footer: "", empty: "The orderbook data did not load." };
    const rows = flips.items.map((it) => ({ ...it, iconHtml: ctx.icon ? ctx.icon(it.name) : "" }));
    const upd = rows[0] && rows[0].updatedAt;
    const footer = `<div style="color:var(--text-dim)">${isStale(upd) ? "⏸ Collection paused (the game restricted the marketplace API) — data frozen" : "Collected hourly"}` +
      `${upd ? ` · last: ${new Date(upd).toLocaleString("en-GB")}` : ""}</div>`;
    return { rows, footer, empty: "No NFTs with both a bid and an ask." };
  },
};

export const flipSummary = {
  type: "flip-summary",
  title: "📊 Flip overview",
  page: "flips",
  needs: () => ({ flips: { res: "flips" } }),

  view({ flips } = {}, ctx = {}) {
    if (!flips || !Array.isArray(flips.items)) return { empty: "The orderbook data did not load." };
    const items = flips.items, n = items.length;
    const good = items.filter((i) => i.margin >= 15).length, bad = items.filter((i) => i.net <= 0).length;
    const best = items.reduce((a, i) => (!a || i.margin > a.margin ? i : a), null);
    const upd = items[0] && items[0].updatedAt;
    return {
      html: pausedNotice(upd, STALE_H, ctx.now || Date.now()) +
        kpis([{ v: flips.count ?? n, l: "boosted NFTs with bid and ask" }, { v: good, l: "margin ≥ 15 %" }, { v: bad, l: "net ≤ 0" },
          { v: best ? `${best.margin.toFixed(0)} %` : "—", l: "best margin" }]) +
        (best ? `<div class="v-mkt-line">Best margin: <span class="v-mkt-item">${ctx.icon ? ctx.icon(best.name) : ""}${esc(best.name || "#" + best.itemId)}</span> ` +
          `${kf(best.bestOffer)}→${kf(best.bestListing)}, net ${kf(best.net)}</div>` : "") +
        `<div class="v-dim">Buy on the bid → relist on the ask (−10 % fee) · <span class="flip-good">green</span> margin ≥ 15 % (a healthy flip) · ` +
        `<span class="flip-bad">red</span> net ≤ 0 (the spread does not cover the fee)</div>`,
    };
  },
};

// ── iPhone glance faces ──
const pctOf = (v) => `${(+v || 0).toFixed(0)}%`;
const marginTone = (i) => (i.margin >= 15 ? "ok" : i.net <= 0 ? "bad" : "warn");
const frozen = (items, now) => isStale(items[0] && items[0].updatedAt, now);
// flips: S = the top flip by score; M / L = the best flips by score
flipTable.sizes = ["s", "m", "l"];
flipTable.size = "m";
flipTable.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = flipTable.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const list = out.rows.slice().sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  const paused = frozen(out.rows, ctx.now || Date.now()) ? " · ⏸ paused" : "";
  if (size === "s") {
    const r = list[0];
    return { html: `<div class="g-hero">${r.iconHtml || ""}</div>` + big(pctOf(r.margin), { tone: marginTone(r), cap: `${r.name || "#" + r.itemId} · net ${kf(r.net)}${paused}` }) };
  }
  return { html: gRows(list.slice(0, size === "m" ? 3 : 6).map((r) => ({ icon: r.iconHtml, name: r.name || `#${r.itemId}`,
    sub: `${kf(r.bestOffer)}→${kf(r.bestListing)} · net ${kf(r.net)}`, value: pctOf(r.margin), tone: marginTone(r) }))) +
    (size === "l" && paused ? `<div class="g-cap g-foot">⏸ collection paused — data frozen</div>` : "") };
};

// overview: S = how many flips have a healthy margin; M = beside the best one and the losers
flipSummary.sizes = ["s", "m"];
flipSummary.size = "s";
flipSummary.glance = ({ flips } = {}, ctx = {}, opts = {}, size = "s") => {
  if (!flips || !Array.isArray(flips.items)) return { empty: "The orderbook data did not load." };
  const items = flips.items;
  if (!items.length) return { empty: "No NFTs with both a bid and an ask." };
  const good = items.filter((i) => i.margin >= 15).length, bad = items.filter((i) => i.net <= 0).length;
  const paused = frozen(items, ctx.now || Date.now());
  const head = big(good, { unit: `/${items.length}`, tone: good ? "ok" : "", cap: `margin ≥ 15 %${paused ? " · ⏸ paused" : ""}` });
  if (size === "s") return { html: head };
  const best = items.reduce((a, i) => (!a || i.margin > a.margin ? i : a), null);
  return { html: `<div class="g-split"><div>${head}</div>` + gRows([
    { icon: ctx.icon ? ctx.icon(best.name) : "", name: best.name || `#${best.itemId}`, sub: "best margin", value: pctOf(best.margin), tone: marginTone(best) },
    { name: "Net ≤ 0", value: bad, tone: bad ? "bad" : "" }]) + `</div>` };
};
