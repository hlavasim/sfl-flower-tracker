// MY TRADES as widgets: every marketplace trade the farm was a party to (store "myTrades" =
// /api/marketplace-trades?mytrades=1). The ledger stops growing while the collectors are paused
// (RT-001), which the summary says.
//   💰 Trade totals: bought, sold, cash net, trade count, a bought-vs-sold bar.
//   📒 Trades per item: quantities, average prices, realized P&L and cash net per NFT.
//   🧾 Recent trades: date, side, price, quantity, total and the counterparty.
import { esc, icon, kf, sflIcon, pausedNotice } from "./market-common.mjs";
import { kpis, bar, pill } from "../ui/viz.mjs";

const need = (farmId) => ({ trades: { res: "myTrades", farm: farmId } });
const signed = (v) => `${(v || 0) >= 0 ? "+" : ""}${kf(v || 0)}`;
const tone = (v) => ((v || 0) >= 0 ? "flip-good" : "flip-bad");
const nameCell = (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v || "#" + r.itemId)}</b></div></div>`;
const NO_DATA = "Trade history unavailable.";

export const myTradesSummary = {
  type: "my-trades-summary",
  title: "💰 Trade totals",
  page: "mytrades",
  needs: need,

  // data: { trades: { totals, items, trades } }
  view({ trades: d } = {}, ctx = {}) {
    if (!d || !d.totals) return { empty: NO_DATA };
    const t = d.totals;
    const bought = t.boughtSfl || 0, sold = t.soldSfl || 0;
    const soldShare = bought + sold > 0 ? (sold / (bought + sold)) * 100 : 0;
    return {
      html: pausedNotice(d.trades && d.trades[0] && d.trades[0].date, 6, ctx.now || Date.now()) +
        kpis([{ v: `${kf(bought)} SFL`, l: `💸 bought (${t.buyCount || 0}×)` }, { v: `${kf(sold)} SFL`, l: `💰 sold (${t.sellCount || 0}×)` },
          { v: `${signed(t.cashNet)} SFL`, l: "📊 cash net" }, { v: t.tradeCount || 0, l: "🔁 trades" }]) +
        `<div class="v-mkt-split"><span class="flip-bad">bought ${kf(bought)} ${sflIcon()}</span>${bar(soldShare, (t.cashNet || 0) >= 0 ? "ok" : "bad")}` +
        `<span class="flip-good">sold ${kf(sold)} ${sflIcon()}</span></div>`,
    };
  },
};

export const myTradesItems = {
  type: "my-trades-items",
  title: "📒 Trades per item",
  page: "mytrades",
  needs: need,
  defaults: { rows: { mode: "top", top: 100, picked: [] } },
  rowKey: (r) => `${r.collection || ""}:${r.itemId}:${r.name || ""}`,
  rowLabel: (r) => r.name || `#${r.itemId}`,
  columns: [
    { key: "name", label: "NFT", fmt: nameCell },
    { key: "boughtQty", label: "bought", align: "right", fmt: (v) => `<span class="v-dim">${v || 0}×</span>` },
    { key: "avgBuy", label: "avg buy", align: "right", fmt: (v) => `<span class="v-dim">${v != null ? kf(v) : "—"}</span>` },
    { key: "soldQty", label: "sold", align: "right", fmt: (v) => `<span class="v-dim">${v || 0}×</span>` },
    { key: "avgSell", label: "avg sell", align: "right", fmt: (v) => `<span class="v-dim">${v != null ? kf(v) : "—"}</span>` },
    // how much of what was bought has been sold again
    { key: "sellThrough", label: "sold of bought", title: "sold quantity ÷ bought quantity",
      get: (r) => (r.boughtQty > 0 ? Math.min(100, ((r.soldQty || 0) / r.boughtQty) * 100) : null), fmt: (v) => (v == null ? "" : bar(v)) },
    { key: "realized", label: "realized", align: "right", fmt: (v) => (v == null ? `<span class="v-dim">—</span>` : `<span class="${tone(v)}">${signed(v)}</span>`) },
    { key: "cashNet", label: "cash net", align: "right", fmt: (v) => `<span class="${tone(v)}">${signed(v)}</span>` },
  ],

  build({ trades: d } = {}, ctx = {}) {
    if (!d || !Array.isArray(d.items)) return { rows: [], footer: "", empty: NO_DATA };
    const rows = d.items.map((it) => ({ ...it, iconHtml: icon(ctx, it.name || "") }));
    return { rows, footer: "", empty: "No trades yet." };
  },
};

export const myTradesRecent = {
  type: "my-trades-recent",
  title: "🧾 Recent trades",
  page: "mytrades",
  needs: need,
  defaults: { rows: { mode: "top", top: 80, picked: [] } },
  rowKey: (r) => r.k,
  rowLabel: (r) => `${r.name || "#" + r.itemId} ${r.dateText}`,
  columns: [
    { key: "date", label: "date", get: (r) => new Date(r.date).getTime(), fmt: (v, r) => `<span class="v-dim">${esc(r.dateText)}</span>` },
    { key: "name", label: "NFT", fmt: nameCell },
    { key: "side", label: "side", filter: true, filterLabel: (v) => (v === "buy" ? "bought" : "sold"), fmt: (v) => (v === "buy" ? pill("bought", "bad") : pill("sold", "ok")) },
    { key: "unitPrice", label: "price/unit", align: "right", fmt: (v) => `<span class="v-dim">${kf(v)}</span>` },
    { key: "qty", label: "qty", align: "right", fmt: (v) => `<span class="v-dim">${esc(v)}</span>` },
    { key: "sfl", label: "total", align: "right", fmt: (v, r) => `<span class="${r.side === "buy" ? "flip-bad" : "flip-good"}">${r.side === "buy" ? "−" : "+"}${kf(v)}</span>` },
    { key: "counterparty", label: "counterparty", fmt: (v) => `<span class="v-dim">${esc(v || "?")}</span>` },
  ],

  build({ trades: d } = {}, ctx = {}) {
    if (!d || !Array.isArray(d.trades)) return { rows: [], footer: "", empty: NO_DATA };
    const rows = d.trades.map((tr, k) => ({ ...tr, k: String(k), iconHtml: icon(ctx, tr.name || ""),
      dateText: new Date(tr.date).toLocaleDateString("en-GB") }));
    return { rows, footer: "", empty: "No trades yet." };
  },
};

// ── iPhone glance models (ui/glance-templates.mjs offers the looks) ──
const gTone = (v) => ((v || 0) >= 0 ? "ok" : "bad");
const nameOf = (r) => r.name || `#${r.itemId}`;
// totals: the cash net with the sold share of the volume as a meter; bought / sold / trades
myTradesSummary.look = "number";
myTradesSummary.glanceModel = ({ trades: d } = {}) => {
  if (!d || !d.totals) return { empty: NO_DATA };
  const t = d.totals;
  if (!t.tradeCount) return { empty: "No trades yet." };
  const bought = t.boughtSfl || 0, sold = t.soldSfl || 0, vol = bought + sold;
  const soldShare = vol > 0 ? (sold / vol) * 100 : 0;
  return {
    head: { value: signed(t.cashNet), unit: " SFL", tone: gTone(t.cashNet), cap: `cash net · ${t.tradeCount} trades`, meter: soldShare, meterTone: gTone(t.cashNet) },
    items: [
      { icon: "💰", name: "Sold", sub: `${t.sellCount || 0}×`, value: kf(sold), tone: "ok", pct: soldShare },
      { icon: "💸", name: "Bought", sub: `${t.buyCount || 0}×`, value: kf(bought), tone: "bad", pct: vol > 0 ? 100 - soldShare : 0 },
      { icon: "🔁", name: "Trades", sub: `${t.buyCount || 0} buys · ${t.sellCount || 0} sells`, value: t.tradeCount },
    ],
    tiles: [{ label: "bought", value: kf(bought) }, { label: "sold", value: kf(sold) },
      { label: "cash net", value: signed(t.cashNet) }, { label: "trades", value: t.tradeCount }],
  };
};

// per item: the realized P&L over all items; the items that moved the most SFL (the bar against the biggest)
myTradesItems.look = "number-list-2";
myTradesItems.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = myTradesItems.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const realized = out.rows.reduce((s, r) => s + (r.realized || 0), 0), n = out.rows.filter((r) => r.realized != null).length;
  const cash = out.rows.reduce((s, r) => s + (r.cashNet || 0), 0);
  const list = out.rows.slice().sort((a, b) => Math.abs(b.cashNet || 0) - Math.abs(a.cashNet || 0));
  const top = Math.abs(list[0].cashNet || 0);
  return {
    head: { value: signed(realized), unit: " SFL", tone: gTone(realized), cap: `realized on ${n} of ${out.rows.length} items` },
    items: list.map((r) => ({ icon: r.iconHtml, name: nameOf(r), sub: `${r.boughtQty || 0} bought · ${r.soldQty || 0} sold`,
      value: signed(r.cashNet), tone: gTone(r.cashNet), pct: top > 0 ? (Math.abs(r.cashNet || 0) / top) * 100 : 0 })),
    tiles: [{ label: "items", value: out.rows.length }, { label: "realized", value: signed(realized) }, { label: "cash net", value: signed(cash) },
      { label: "sold some", value: out.rows.filter((r) => (r.soldQty || 0) > 0).length }],
  };
};

// recent: the latest trade; the latest trades; the series = the running cash net, oldest first
myTradesRecent.look = "list-2";
myTradesRecent.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = myTradesRecent.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const list = out.rows.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const amt = (r) => `${r.side === "buy" ? "−" : "+"}${kf(r.sfl)}`;
  const top = Math.max(...list.map((r) => r.sfl || 0)), r = list[0];
  let run = 0;
  const series = list.slice().reverse().map((x) => (run += x.side === "buy" ? -(x.sfl || 0) : x.sfl || 0));
  const sum = (side) => list.filter((x) => x.side === side).reduce((s, x) => s + (x.sfl || 0), 0);
  return {
    head: { value: amt(r), unit: " SFL", tone: r.side === "buy" ? "bad" : "ok", cap: `${r.side === "buy" ? "bought" : "sold"} ${nameOf(r)} · ${r.dateText}`, hero: r.iconHtml || undefined },
    items: list.map((x) => ({ icon: x.iconHtml, name: nameOf(x), sub: `${x.side === "buy" ? "bought" : "sold"} · ${x.dateText}`,
      value: amt(x), tone: x.side === "buy" ? "bad" : "ok", pct: top > 0 ? ((x.sfl || 0) / top) * 100 : 0 })),
    tiles: [{ label: "trades", value: list.length }, { label: "bought", value: kf(sum("buy")) }, { label: "sold", value: kf(sum("sell")) }],
    series,
  };
};
