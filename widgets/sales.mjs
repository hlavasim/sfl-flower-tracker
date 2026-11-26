// SALES as widgets: the farm's own marketplace listings and offers (farm.trades) against the market
// prices of section=treasury's td (p2p for resources, the NFT floors / last sales). The listings'
// live order-book line (rank among sellers, best offer) is fetched by the page, slowly, and handed
// over in ctx.live(id); a pinned copy shows it when the page has loaded it in this session.
//   🧾 Sales overview · 📤 Active listings · 💸 What can I sell · 📥 Active offers · ✅ Sold ·
//   📊 Weekly history
import { getCount } from "../core/engine/power-helpers.mjs";
import { toMs } from "../core/engine/power-costs.mjs";
import { nftUnitPrice } from "../core/engine/prices.mjs";
import { esc, icon, sflIcon, itemList } from "./market-common.mjs";
import { kpis, bar, pill } from "../ui/viz.mjs";
import { big, compact, rows as gRows } from "../ui/glance.mjs";

const need = (farmId) => ({ farm: { res: "farm", farm: farmId }, prices: { res: "compute", farm: farmId, section: "treasury" } });
const WEEK_MS = 7 * 24 * 3600000;
const NO_DATA = "The farm or the market prices did not load.";

export const fmtQty = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));
export const fmtSfl = (n) => (n >= 100 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(3));
export function formatAge(ms) {
  const h = Math.floor(ms / 3600000);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

// td → { nfts: name → {floor, lastSale, price, id, collection, boost}, p2p } (the page's mapping)
export function marketOf(td) {
  const nfts = {};
  for (const [name, c] of Object.entries(td.nftCollectibles || {})) {
    nfts[name] = { floor: parseFloat(c.floor) || 0, lastSale: parseFloat(c.lastSalePrice) || 0, price: parseFloat(c.floor) || 0, type: "collectible", id: c.id, collection: "collectibles", boost: c.boost_text || "" };
  }
  for (const [name, w] of Object.entries(td.nftWearables || {})) {
    nfts[name] = { floor: parseFloat(w.floor) || 0, lastSale: parseFloat(w.lastSalePrice) || 0, price: nftUnitPrice(w), type: "wearable", id: w.id, collection: "wearables", boost: w.boost_text || "" };
  }
  return { nfts, p2p: td.p2pPrices || {} };
}

const marketPriceOf = (market, itemName) => (market.p2p[itemName] ? { marketPrice: market.p2p[itemName], priceSource: "P2P" }
  : market.nfts[itemName] ? { marketPrice: market.nfts[itemName].price, priceSource: market.nfts[itemName].floor > 0 ? "Floor" : "Last sale" }
  : { marketPrice: 0, priceSource: "" });

// The farm's trades split the way the page shows them. ctx.nftIdOf(name, collection) resolves ids
// the NFT feed misses (wearable / resource ids, "Pet #262").
export function salesData(farm, td, ctx = {}) {
  const trades = farm.trades || {};
  const market = marketOf(td || {});
  const now = ctx.now || Date.now();
  const active = [], sold = [], offers = [];
  for (const [id, listing] of Object.entries(trades.listings || {})) {
    const items = Object.entries(listing.items || {});
    if (!items.length) continue;
    const [itemName, qty] = items[0];
    const priceSFL = listing.sfl || 0;
    const unitPrice = qty > 0 ? priceSFL / qty : priceSFL;
    const createdAt = toMs(listing.createdAt || 0);
    const collection = listing.collection || "unknown";
    const { marketPrice, priceSource } = marketPriceOf(market, itemName);
    const delta = marketPrice > 0 ? ((unitPrice - marketPrice) / marketPrice) * 100 : 0;
    let nftId = (market.nfts[itemName] && market.nfts[itemName].id) || null;
    if (!nftId && typeof ctx.nftIdOf === "function") nftId = ctx.nftIdOf(itemName, collection) || null;
    const e = { id, itemName, qty, priceSFL, unitPrice, createdAt, age: now - createdAt, marketPrice, priceSource, delta, collection, nftId,
      mkt: collection === "resources" ? "collectibles" : collection, boost: (market.nfts[itemName] && market.nfts[itemName].boost) || "",
      tradeType: listing.tradeType || "onchain" };
    if (listing.fulfilledAt || listing.boughtAt) { e.soldAt = toMs(listing.fulfilledAt || listing.boughtAt); sold.push(e); }
    else active.push(e);
  }
  for (const [id, offer] of Object.entries(trades.offers || {})) {
    const items = Object.entries(offer.items || {});
    if (!items.length || offer.fulfilledAt) continue;
    const [itemName, qty] = items[0];
    const priceSFL = offer.sfl || 0;
    const unitPrice = qty > 0 ? priceSFL / qty : priceSFL;
    const createdAt = toMs(offer.createdAt || 0);
    const { marketPrice, priceSource } = marketPriceOf(market, itemName);
    offers.push({ id, itemName, qty, priceSFL, unitPrice, createdAt, age: now - createdAt, marketPrice, priceSource,
      delta: marketPrice > 0 ? ((unitPrice - marketPrice) / marketPrice) * 100 : 0, collection: offer.collection || "unknown",
      boost: (market.nfts[itemName] && market.nfts[itemName].boost) || "" });
  }
  active.sort((a, b) => b.delta - a.delta);
  offers.sort((a, b) => a.delta - b.delta);
  sold.sort((a, b) => (b.soldAt || 0) - (a.soldAt || 0));
  const fulfilledOffers = Object.values(trades.offers || {}).filter((o) => o.fulfilledAt).length;
  return { market, active, sold, offers, readyToClaim: sold.length + fulfilledOffers, tradePoints: trades.tradePoints || 0 };
}

// Unlisted inventory / wardrobe worth something: resources at p2p, collectibles at the floor,
// wearables at the last sale (else the floor); what already sits in a listing is left out.
export function sellableRows(farm, market, active, ctx = {}) {
  const listed = new Set(active.map((x) => x.itemName));
  const inv = farm.inventory || {}, ward = farm.wardrobe || {};
  const rows = [];
  for (const [name, price] of Object.entries(market.p2p)) {
    const p = parseFloat(price) || 0, qty = getCount(inv, name);
    if (qty <= 0 || p <= 0 || listed.has(name)) continue;
    rows.push({ name, qty, unitPrice: p, total: qty * p, collection: "resources",
      nftId: typeof ctx.nftIdOf === "function" ? ctx.nftIdOf(name, "resources") || null : null });
  }
  for (const [name, nft] of Object.entries(market.nfts)) {
    if (listed.has(name)) continue;
    const isWear = nft.collection === "wearables";
    const qty = isWear ? (parseFloat(ward[name]) || 0) : getCount(inv, name);
    const p = isWear ? (nft.lastSale || nft.floor) : nft.floor;
    if (qty <= 0 || !p || p <= 0) continue;
    rows.push({ name, qty, unitPrice: p, total: qty * p, collection: nft.collection, nftId: nft.id || null, boost: nft.boost || "" });
  }
  return rows.sort((a, b) => b.total - a.total);
}

// The live order-book line of one listing (m from the page: rank among sellers, best offer).
export function liveLine(l, m) {
  if (!m) return "";
  const parts = [];
  const sfl = sflIcon("0.9em");
  if (m.total <= 1) parts.push(`<b class="v-sales-first">🥇 only ${m.isPet ? `${esc(m.type || "pet")} listed` : "listing"}</b>`);
  else if (m.isFirst) parts.push(`<b class="v-sales-first">🥇 1ST${m.isPet ? " " + esc(m.type) : ""}</b> <span class="v-dim">of ${m.total}</span>`);
  else if (m.isPet) { const diff = m.cheapest - l.unitPrice; parts.push(`<b class="v-sales-behind">#${m.rank}/${m.total} ${esc(m.type)}</b> <span class="v-dim">cheapest ${fmtSfl(m.cheapest)} ${sfl} (${diff < 0 ? "-" : "+"}${fmtSfl(Math.abs(diff))})</span>`); }
  else parts.push(`<b class="v-sales-behind">#${m.rank}/${m.total}</b> <span class="v-dim">cheapest ${fmtSfl(m.cheapest)} ${sfl}</span>`);
  if (m.bestBid > 0) {
    if (m.bestBid >= l.unitPrice - 1e-9) parts.push(`<b class="flip-good">💰 best offer ${fmtSfl(m.bestBid)} ≥ your ask!</b>`);
    else parts.push(`best offer <b>${fmtSfl(m.bestBid)}</b> ${sfl} <span class="v-dim">(−${m.gap.toFixed(0)}%, ${m.nBids} bid${m.nBids !== 1 ? "s" : ""})</span>`);
  } else parts.push(`<span class="v-dim">no offers</span>`);
  return parts.join(" · ");
}
// 1 = a live offer within 5 % of the ask, 2 = someone is cheaper, 3 = first / no close offer
export const liveGroup = (m) => (!m ? 3 : m.goodOffer ? 1 : !m.isFirst ? 2 : 3);
const GROUPS = { 1: ["💰 offer within 5 %", "ok"], 2: ["⚠️ not first", "bad"], 3: ["✓ first", "idle"] };

const mktLink = (coll, id, title) => (id && coll ? ` <a href="https://sunflower-land.com/play/#/marketplace/${esc(coll)}/${esc(id)}" target="_blank" rel="noopener" title="${esc(title)}" style="text-decoration:none">🔗</a>` : "");
const imgOf = (ctx, l) => (typeof ctx.listingIcon === "function" ? ctx.listingIcon(l) : icon(ctx, l.itemName));

// One listing / offer as the name cell: icon, name ×qty, badges, the age line, the boost, the live line.
function tradeCell(l, ctx, { sell, live }) {
  const badges = [];
  if (sell && l.delta > 20) badges.push(pill(`+${Math.round(l.delta)}%`, "bad"));
  else if (sell && l.delta < -10) badges.push(pill(`${Math.round(l.delta)}%`, "ok"));
  if (l.age > WEEK_MS) badges.push(pill("STALE", "run"));
  if (l.soldAt) badges.push(pill("SOLD", "ok"));
  const m = live ? (typeof ctx.live === "function" ? ctx.live(l.id) : null) : null;
  const liveHtml = live && l.nftId ? (m ? liveLine(l, m) : ctx.liveBusy && ctx.liveBusy(l.id) ? `<span class="v-pill v-run">⏳ market busy — reopen later</span>`
    : `<span class="v-dim">⟳ live market…</span>`) : "";
  return `<div class="v-name">${imgOf(ctx, l)}<div><b>${esc(l.itemName)}</b>${l.qty > 1 ? ` ×${fmtQty(l.qty)}` : ""} ${badges.join(" ")}` +
    `${sell ? mktLink(l.mkt || l.collection, l.nftId, "open in the marketplace — adjust the price / re-list") : ""}` +
    `<small>${formatAge(l.age)} ago · ${esc(l.tradeType || l.collection)}${l.marketPrice > 0 ? ` · market ${fmtSfl(l.marketPrice)} ${sflIcon("0.9em")}/${esc(l.priceSource)}` : ""}</small>` +
    (l.boost ? `<small class="v-sales-boost">⚡ ${esc(String(l.boost).replace(/\n+/g, " / "))}</small>` : "") +
    (liveHtml ? `<small class="v-sales-live">${liveHtml}</small>` : "") + `</div></div>`;
}
const priceCell = (v, r) => `<b>${fmtSfl(v)}</b> ${sflIcon()}`;
const vsCell = (v, r) => (r.marketPrice > 0 && r.qty > 0
  ? `<span class="v-dim">${fmtSfl(r.unitPrice)}/ea vs ${fmtSfl(r.marketPrice)}</span> <b class="${r.delta > 5 ? "flip-bad" : r.delta < -5 ? "flip-good" : "v-dim"}">${r.delta > 0 ? "+" : ""}${Math.round(r.delta)}%</b>` : "");
// how the price sits against the market: a centred scale, 50 % = at the market
const deltaBar = (v, r) => (r.marketPrice > 0 ? bar(Math.max(0, Math.min(100, 50 + r.delta / 2)), r.delta > 20 ? "bad" : r.delta > 5 ? "mid" : "ok") : "");

function tradeTable(type, title, pick, { sell, live, emptyText, sold }) {
  return {
    type, title, page: "sales", needs: need,
    defaults: sold ? { rows: { mode: "top", top: 20, picked: [] } } : {},
    rowKey: (r) => r.id,
    rowLabel: (r) => r.itemName,
    rowClass: (r) => (live && r.group === 1 ? "w-st-ready" : live && r.group === 2 ? "w-st-miss" : ""),
    columns: [
      ...(live ? [{ key: "group", label: "status", title: "from the live order book: 💰 an offer within 5 % of your ask · ⚠️ someone is cheaper · ✓ first / no close offer",
        fmt: (v) => (v ? pill(...GROUPS[v]) : `<span class="v-dim">…</span>`) }] : []),
      { key: "itemName", label: sell ? "listing" : "offer", fmt: (v, r) => tradeCell(r, r.ctx, { sell, live }) },
      { key: "delta", label: "vs market", title: "your price per unit against the market price", fmt: (v, r) => deltaBar(v, r) + vsCell(v, r) },
      { key: "priceSFL", label: sell ? "your price" : "your offer", align: "right", fmt: priceCell },
      { key: "age", label: "age", align: "right", extra: true, fmt: (v) => formatAge(v) },
      ...(sold ? [{ key: "soldAt", label: "sold", align: "right", fmt: (v) => (v ? new Date(v).toLocaleDateString("en-GB") : "") }] : []),
      { key: "collection", label: "kind", extra: true, filter: true },
    ],
    build({ farm, prices } = {}, ctx = {}) {
      if (!farm || !prices || !prices.td) return { rows: [], footer: "", empty: NO_DATA };
      const d = salesData(farm, prices.td, ctx);
      let rows = pick(d).map((l) => ({ ...l, ctx }));
      let footer = "";
      if (live) {
        // grouped by the live order book once it is in (most expensive first), until then by delta
        const done = typeof ctx.liveDone === "function" ? ctx.liveDone() : false;
        rows = rows.map((r) => ({ ...r, group: done ? liveGroup(ctx.live ? ctx.live(r.id) : null) : null }));
        if (done) rows.sort((a, b) => a.group - b.group || b.priceSFL - a.priceSFL);
        const p = typeof ctx.liveProgress === "function" ? ctx.liveProgress() : null;
        if (p && p.total) footer = `<div class="v-dim">${p.loaded < p.total ? `⟳ live market ${p.loaded}/${p.total}` : "✓ live market — sorted"}</div>`;
      }
      return { rows, footer, empty: emptyText };
    },
  };
}

export const salesListings = tradeTable("sales-listings", "📤 Active listings", (d) => d.active, { sell: true, live: true, emptyText: "No active listings." });
export const salesOffers = tradeTable("sales-offers", "📥 Active offers", (d) => d.offers, { sell: false, emptyText: "No active offers." });
export const salesSold = tradeTable("sales-sold", "✅ Sold", (d) => d.sold, { sell: true, sold: true, emptyText: "Nothing sold and unclaimed." });

export const salesSummary = {
  type: "sales-summary",
  title: "🧾 Sales overview",
  page: "sales",
  needs: need,

  view({ farm, prices } = {}, ctx = {}) {
    if (!farm || !prices || !prices.td) return { empty: NO_DATA };
    const d = salesData(farm, prices.td, ctx);
    const listed = d.active.reduce((s, l) => s + l.priceSFL, 0), offered = d.offers.reduce((s, o) => s + o.priceSFL, 0);
    const over = d.active.filter((l) => l.delta > 20).length, stale = d.active.filter((l) => l.age > WEEK_MS).length;
    const claim = d.readyToClaim > 0 ? `<div class="v-mkt-note v-mkt-ok">✅ <b>${d.readyToClaim}</b> ready to claim (sold listings and filled offers)</div>` : "";
    return {
      html: claim + kpis([{ v: d.active.length, l: "active listings" }, { v: `${listed.toFixed(1)} SFL`, l: "total listed" },
        { v: over, l: "overpriced (> +20 %)" }, { v: stale, l: "stale (> 7 days)" }, { v: d.offers.length, l: "active offers" },
        { v: `${offered.toFixed(1)} SFL`, l: "total offered" }, ...(d.tradePoints ? [{ v: Math.round(d.tradePoints), l: "trade points" }] : [])]) +
        (d.active.length ? `<div class="v-mkt-line">Priced at or below the market: ${d.active.length - over} of ${d.active.length}</div>` + bar(((d.active.length - over) / d.active.length) * 100) : ""),
    };
  },
};

const SELL_MIN_STEPS = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const SELL_TYPES = [["both", "Both"], ["nft", "🎴 NFT"], ["resources", "⛏️ Resources"]];
export const salesSellable = {
  type: "sales-sellable",
  title: "💸 What can I sell",
  titleFor: (o) => `💸 What can I sell${o.type === "nft" ? " · NFT" : o.type === "resources" ? " · resources" : ""}`,
  page: "sales",
  needs: need,
  optionsLabel: "Show",
  options: [
    { key: "type", label: "Show", kind: "select", choices: SELL_TYPES },
    { key: "min", label: "Min value (SFL)", kind: "select", choices: SELL_MIN_STEPS.map((v) => [String(v), `≥ ${v}`]) },
  ],
  defaults: { opts: { type: "both", min: "10" } },
  rowKey: (r) => `${r.collection}:${r.name}`,
  rowLabel: (r) => r.name,
  columns: [
    { key: "name", label: "item", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b>${r.qty > 1 ? ` ×${fmtQty(r.qty)}` : ""}` +
      mktLink(r.collection === "resources" ? "collectibles" : r.collection, r.nftId, "open in the marketplace — list it") +
      `<small>${esc(r.collection)} · ${fmtSfl(r.unitPrice)} ${sflIcon("0.9em")}/ea</small>` +
      (r.boost ? `<small class="v-sales-boost">⚡ ${esc(String(r.boost).replace(/\n+/g, " / "))}</small>` : "") + `</div></div>` },
    { key: "share", label: "share", title: "share of everything shown", fmt: (v) => bar(v, "ok") },
    { key: "total", label: "value", align: "right", fmt: (v) => `<b>${fmtSfl(v)}</b> ${sflIcon()}` },
    { key: "collection", label: "kind", extra: true, filter: true },
  ],

  build({ farm, prices } = {}, ctx = {}, opts = {}) {
    if (!farm || !prices || !prices.td) return { rows: [], footer: "", empty: NO_DATA };
    const d = salesData(farm, prices.td, ctx);
    const min = Number.isFinite(parseFloat(opts.min)) ? parseFloat(opts.min) : 10;
    const type = ["both", "nft", "resources"].includes(opts.type) ? opts.type : "both";
    const match = (r) => type === "both" || (type === "resources" ? r.collection === "resources" : r.collection !== "resources");
    const all = sellableRows(farm, d.market, d.active, ctx).filter((r) => r.total >= min && match(r));
    const sum = all.reduce((a, r) => a + r.total, 0);
    const rows = all.map((r) => ({ ...r, share: sum > 0 ? (r.total / sum) * 100 : 0, iconHtml: icon(ctx, r.name) }));
    const summary = rows.length ? kpis([{ v: rows.length, l: `items worth ≥ ${min} SFL` }, { v: `${fmtSfl(sum)} SFL`, l: "total value" }]) : "";
    return { rows, summary, footer: "", empty: `Nothing unlisted worth ≥ ${min} SFL.` };
  },
};

// "2025-09-29" (the game's week key) or epoch ms → the date
const weekDate = (k) => new Date(/^\d+$/.test(k) ? parseInt(k) : k);
export const salesWeekly = {
  type: "sales-weekly",
  title: "📊 Weekly history",
  page: "sales",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  defaults: { rows: { mode: "top", top: 8, picked: [] } },
  rowKey: (r) => r.week,
  rowLabel: (r) => r.dateText,
  columns: [
    { key: "week", label: "week", get: (r) => weekDate(r.week).getTime(), fmt: (v, r) => `<b>${esc(r.dateText)}</b>` },
    { key: "sold", label: "sold", get: (r) => r.soldN, fmt: (v, r) => (r.soldN ? `<span class="v-sales-sold">${itemList(r.ctx, r.sales, { qtyFmt: fmtQty })}</span>` : `<span class="v-dim">—</span>`) },
    { key: "bought", label: "bought", get: (r) => r.boughtN, fmt: (v, r) => (r.boughtN ? `<span class="v-sales-bought">${itemList(r.ctx, r.purchases, { qtyFmt: fmtQty })}</span>` : `<span class="v-dim">—</span>`) },
  ],

  build({ farm } = {}, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    const t = farm.trades || {}, ws = t.weeklySales || {}, wp = t.weeklyPurchases || {};
    const weeks = [...new Set([...Object.keys(ws), ...Object.keys(wp)])].sort().reverse();
    const rows = weeks.map((week) => ({ week, ctx, sales: ws[week] || {}, purchases: wp[week] || {},
      soldN: Object.keys(ws[week] || {}).length, boughtN: Object.keys(wp[week] || {}).length,
      dateText: weekDate(week).toLocaleDateString("en-GB") }));
    return { rows, footer: "", empty: "No weekly activity yet." };
  },
};

// The page fetches the live order book for exactly these rows (it has no other copy of the split).
salesListings.activeOf = (farm, td, ctx) => salesData(farm, td, ctx).active;

// ── iPhone glance faces ──
const pctText = (d) => `${d > 0 ? "+" : ""}${Math.round(d)}%`;
const qtyName = (l) => `${l.itemName}${l.qty > 1 ? ` ×${fmtQty(l.qty)}` : ""}`;
// overview: S = active listings (or what waits to be claimed); M = the totals beside it
salesSummary.sizes = ["s", "m"];
salesSummary.size = "s";
salesSummary.glance = ({ farm, prices } = {}, ctx = {}, opts = {}, size = "s") => {
  if (!farm || !prices || !prices.td) return { empty: NO_DATA };
  const d = salesData(farm, prices.td, ctx);
  if (!d.active.length && !d.offers.length && !d.readyToClaim) return { empty: "No listings, offers or sales to claim." };
  const listed = d.active.reduce((s, l) => s + l.priceSFL, 0), offered = d.offers.reduce((s, o) => s + o.priceSFL, 0);
  const over = d.active.filter((l) => l.delta > 20).length, stale = d.active.filter((l) => l.age > WEEK_MS).length;
  const head = big(d.active.length, { unit: " listed", cap: d.readyToClaim ? `✅ ${d.readyToClaim} ready to claim` : `${compact(listed)} SFL listed` });
  if (size === "s") return { html: head };
  return { html: `<div class="g-split"><div>${head}</div>` + gRows([
    { name: "Listed", value: `${compact(listed)} SFL` },
    { name: "Overpriced · stale", value: `${over} · ${stale}`, tone: over || stale ? "warn" : "ok" },
    { name: `${d.offers.length} offer${d.offers.length === 1 ? "" : "s"}`, value: `${compact(offered)} SFL` }]) + `</div>` };
};

// listings / offers / sold: S = how many and their total; M / L = the rows as the table orders them
function tradeGlance(widget, { what, chipOf }) {
  widget.sizes = ["s", "m", "l"];
  widget.size = "s";
  widget.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
    const out = widget.build(data, ctx, opts);
    if (!out.rows.length) return { empty: out.empty };
    const sum = out.rows.reduce((s, l) => s + l.priceSFL, 0);
    const head = big(out.rows.length, { unit: ` ${what}`, cap: `${compact(sum)} SFL in total` });
    if (size === "s") return { html: head };
    const list = out.rows.slice(0, size === "m" ? 3 : 6).map((l) => ({ icon: imgOf(ctx, l), name: qtyName(l),
      sub: `${fmtSfl(l.priceSFL)} SFL · ${formatAge(l.age)} ago`, ...chipOf(l) }));
    return { html: (size === "l" ? head : "") + gRows(list) };
  };
}
const deltaChip = (l) => (l.marketPrice > 0 ? { chip: { text: pctText(l.delta), tone: l.delta > 20 ? "bad" : l.delta > 5 ? "warn" : "ok" } } : {});
const LIVE_CHIP = { 1: { text: "OFFER", tone: "ok" }, 2: { text: "NOT 1ST", tone: "bad" }, 3: { text: "1ST", tone: "info" } };
tradeGlance(salesListings, { what: "listed", chipOf: (l) => (l.group ? { chip: LIVE_CHIP[l.group] } : deltaChip(l)) });
tradeGlance(salesOffers, { what: "offers", chipOf: (l) => (l.marketPrice > 0 ? { chip: { text: pctText(l.delta), tone: "info" } } : {}) });
tradeGlance(salesSold, { what: "sold", chipOf: () => ({ chip: { text: "CLAIM", tone: "ok" } }) });

// what can I sell: S = the total value; M = beside the three biggest; L = the top six
salesSellable.sizes = ["s", "m", "l"];
salesSellable.size = "m";
salesSellable.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = salesSellable.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const sum = out.rows.reduce((s, r) => s + r.total, 0);
  const head = big(compact(sum), { unit: " SFL", cap: `${out.rows.length} unlisted item${out.rows.length === 1 ? "" : "s"}` });
  if (size === "s") return { html: head };
  const list = gRows(out.rows.slice(0, size === "m" ? 3 : 6).map((r) => ({ icon: r.iconHtml, name: r.name,
    sub: `×${fmtQty(r.qty)} · ${fmtSfl(r.unitPrice)}/ea`, value: compact(r.total) })));
  return { html: size === "m" ? `<div class="g-split"><div>${head}</div>${list}</div>` : head + list };
};

// weekly history: S = what sold in the latest week; M / L = the latest weeks
salesWeekly.sizes = ["s", "m", "l"];
salesWeekly.size = "s";
salesWeekly.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = salesWeekly.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const w = out.rows[0];
  if (size === "s") return { html: big(w.soldN, { unit: " sold", cap: `week of ${w.dateText} · ${w.boughtN} bought` }) };
  return { html: gRows(out.rows.slice(0, size === "m" ? 3 : 7).map((r) => ({ name: `Week of ${r.dateText}`,
    sub: `${r.soldN} sold · ${r.boughtN} bought`, value: r.soldN ? `↑${r.soldN}` : "—", tone: r.soldN ? "ok" : "" }))) };
};
