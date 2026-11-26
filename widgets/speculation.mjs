// SPECULATION (owner farm only) as widgets: 🌾 the seasonal crop calendar, 📒 the trade log, ₿ skimming
// to BTC and 🥚 the Genesis egg market. The reads are owner-only (the write token), so the page keeps
// loading them (_spec, _specLoad) and hands them over as ctx.spec; ctx.ensure() starts the load when
// nothing is there yet (a pinned copy on a board). The farm (inventory, balance) comes from the store.
//   ctx: { spec: {cal, trades, eggs, ledger, sats, btc, p2p, err}, ensure?(), icon?(name) → HTML,
//          flower?: FLOWER icon HTML, now? }
import { kpis, pill } from "../ui/viz.mjs";

export const SPEC_FEE = 0.10;
const SEASONS = ["spring", "summer", "autumn", "winter"];
const SEASON_ICON = { spring: "🌱", summer: "☀️", autumn: "🍂", winter: "❄️" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const fmt = (n, d) => (n == null || !isFinite(n)) ? "—" : (+n).toLocaleString("en-US", { maximumFractionDigits: d === undefined ? 0 : d });
export const pct = (v, d) => (v == null || !isFinite(v)) ? "—" : (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(d === undefined ? 0 : d) + " %";
export const date = (ms) => { const x = new Date(ms); return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`; };
// A DATE column comes back as a timestamp at the server's midnight; the calendar day is what counts.
const day = (v) => (v ? String(v).slice(0, 10) : "");
const count = (inv, name) => { const v = (inv || {})[name]; return v == null ? 0 : Math.floor(parseFloat(v)); };
const icon = (ctx, n) => (typeof ctx.icon === "function" ? ctx.icon(n) : "");
const fl = (ctx) => ctx.flower || "FLOWER";
const season = (s) => `${SEASON_ICON[s] || ""} ${s || "?"}`;
const nowOf = (ctx) => ctx.now || Date.now();
const specOf = (ctx) => ctx.spec || { err: {} };
const errOf = (ctx, k) => ((specOf(ctx).err || {})[k]);
// Nothing loaded yet: ask the page to load (once), say so meanwhile.
function waiting(ctx, key, what) {
  const e = errOf(ctx, key);
  if (e) return { html: `<div class="w-error">${esc(what)} did not load: ${esc(e)}</div>` };
  if (typeof ctx.ensure === "function") ctx.ensure();
  return { empty: `Loading the ${what.toLowerCase()}…` };
}

// ── 1. the seasonal crop calendar ──────────────────────────────────────
export const specCalendar = {
  type: "spec-calendar",
  title: "🌾 Seasonal crop calendar",
  page: "speculation",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  optional: ["farm"],
  view({ farm } = {}, ctx = {}) {
    const c = specOf(ctx).cal;
    if (!c) return waiting(ctx, "cal", "Calendar");
    const inv = (farm && farm.inventory) || {};
    const now = nowOf(ctx);
    const cur = c.current.season;
    const nextChange = c.current.startedAt + 7 * 86400000;
    const days = Math.max(0, Math.ceil((nextChange - now) / 86400000));
    const cell = (v) => {
      if (v == null) return `<td class="v-spec-cell v-dim">—</td>`;
      const a = Math.min(1, Math.abs(v) / 0.2);
      const bg = v < 0 ? `rgba(106,167,224,${(0.12 + 0.55 * a).toFixed(3)})` : `rgba(224,108,95,${(0.12 + 0.55 * a).toFixed(3)})`;
      return `<td class="v-spec-cell" style="background:${bg}">${pct(v)}</td>`;
    };
    const badge = (x) => x.signal === "buy" ? pill("BUY", "idle") : x.signal === "sell" ? pill("SELL", "bad")
      : x.signal === "hold" ? `<span class="v-dim">hold / wait</span>` : `<span class="v-dim">noise</span>`;
    const act = c.items.filter((x) => x.signal === "buy" || x.signal === "sell");
    let h = `<div class="v-dim v-spec-note">The game turns the season every week (Monday 00:00 UTC) and crops only grow in some of them, so supply and price swing in a 28-day cycle. Colour = how much dearer (<span style="color:var(--c-red)">red</span>) or cheaper (<span style="color:var(--c-blue)">blue</span>) the crop is in that season than its own trend. A signal shows only for crops whose pattern held <b>in both halves of the history</b> (stable) with a net return above 5 % after the ${Math.round(SPEC_FEE * 100)} % fee. “Max / day” = a tenth of what trades daily — more and you move the price yourself.</div>`;
    h += `<div class="v-spec-weeks">${c.weeks.map((w, i) => `<div class="v-spec-week${i === 0 ? " on" : ""}"><span>${i === 0 ? "NOW" : "from " + date(w.start)}</span><b>${season(w.season)}</b></div>`).join("")}</div>`;
    h += `<div class="v-spec-line">It is <b>${season(cur)}</b> now, the next season in <b>${days} d</b> (${date(nextChange)}).</div>`;
    if (act.length) {
      h += `<div class="v-spec-cards">` + act.map((x) => {
        const have = count(inv, x.item), buy = x.signal === "buy";
        return `<div class="v-spec-card ${buy ? "buy" : "sell"}"><div class="v-spec-card-h">${buy ? "🛒 BUY" : "💰 SELL"} ${icon(ctx, x.item)}${esc(x.item)}</div>
          <div class="v-dim">${buy ? `cheap now (${x.buy}), sell in ${x.sell} from ${date(x.nextSell)}` : `dear now (${x.sell}), cheap again in ${x.buy} from ${date(x.nextBuy)}`}<br>
          net return per cycle <b style="color:var(--c-green)">${pct(x.expectedNet)}</b> · out of sample ${pct(x.oosNet)}<br>
          price ${fmt(x.price, 6)} ${fl(ctx)} (${pct(x.nowVsTrend)} vs trend)<br>
          ${buy ? `the market takes ~<b>${fmt(x.maxQtyPerDay)}</b> / day ≈ <b>${fmt(x.maxFlowerPerDay, 1)}</b> ${fl(ctx)} / day`
            : `you hold <b>${fmt(have)}</b> ≈ ${fmt(have * x.price * (1 - SPEC_FEE), 2)} ${fl(ctx)} after the fee`}</div></div>`;
      }).join("") + `</div>`;
    } else {
      h += `<div class="v-dim v-spec-line">No stable crop is in its buying or selling season this week — wait for the next one.</div>`;
    }
    h += `<div class="v-spec-scroll"><table class="w-table v-spec-table"><tr><th>crop</th>${SEASONS.map((s) => `<th class="v-spec-c${s === cur ? " v-spec-cur" : ""}">${season(s)}${s === cur ? " ◀" : ""}</th>`).join("")}
      <th>buy → sell</th><th class="r">net / cycle</th><th class="r">out of sample</th><th>signal</th><th>next buy / sell</th><th class="r">price</th><th class="r">held</th><th class="r">max / day</th></tr>`;
    for (const x of c.items) {
      h += `<tr${x.stable ? "" : ` class="w-st-done"`}>
        <td><div class="v-name">${icon(ctx, x.item)}<b>${esc(x.item)}</b>${x.stable ? ` <span title="the pattern held in both halves of the history" style="color:var(--c-green)">✓</span>` : ""}</div></td>
        ${SEASONS.map((s) => cell(x.bySeason[s])).join("")}
        <td class="nw">${season(x.buy)} → ${season(x.sell)}</td>
        <td class="r" style="color:${x.expectedNet > 0 ? "var(--c-green)" : "var(--c-red)"}">${pct(x.expectedNet)}</td>
        <td class="r v-dim">${pct(x.oosNet)}</td>
        <td class="nw">${badge(x)}</td>
        <td class="nw">🛒 ${date(x.nextBuy)} · 💰 ${date(x.nextSell)}</td>
        <td class="r">${fmt(x.price, 6)}</td>
        <td class="r">${fmt(count(inv, x.item))}</td>
        <td class="r nw">${fmt(x.maxQtyPerDay)}<br><span class="v-dim">${fmt(x.maxFlowerPerDay, 1)} ${fl(ctx)}</span></td></tr>`;
    }
    h += `</table></div><div class="v-dim v-spec-note">Prices = the tracker's p2p feed since 24 Feb 2026 (daily). “Net / cycle” = the whole history, “out of sample” = the rule set on the first half and measured on the second. Volume = the last 28 days of the marketplace. The ${Math.round(SPEC_FEE * 100)} % fee is on the sale only. The past is no guarantee — new recipes or a chapter can change the pattern.</div>`;
    return { html: h };
  },
};

// ── 2. the trade log ───────────────────────────────────────────────────
// Each trade's P/L (closed) or mark (open, at the live price), and the FLOWER totals.
export function tradeStats(spec) {
  const s = spec || {};
  const price = (item) => { const p = (s.p2p || []).find((x) => x.item_name === item); return p ? Number(p.price) : null; };
  const last = (s.eggs || []).slice(-1)[0];
  const eggFloor = last && last.data ? Number(last.data.floor_hidden_ron) || null : null;
  let realized = 0, openCost = 0, openValue = 0, openValued = true;
  const rows = (s.trades || []).map((t) => {
    const qty = Number(t.qty), buy = Number(t.buy_price), sell = t.sell_price == null ? null : Number(t.sell_price);
    const isFlower = t.currency === "FLOWER";
    let pnl = null, mark = null, markNote = "";
    if (sell != null) { pnl = qty * (sell - buy); if (isFlower) realized += pnl; }
    else {
      const live = isFlower ? price(t.item) : (/egg/i.test(t.item) && t.currency === "RON" ? eggFloor : null);
      if (live != null) { mark = qty * (live * (isFlower ? 1 - SPEC_FEE : 1) - buy); markNote = isFlower ? "if sold now, after the fee" : "vs the valid egg floor"; }
      if (isFlower) { openCost += qty * buy; if (live != null) openValue += qty * live * (1 - SPEC_FEE); else openValued = false; }
    }
    return { t, qty, buy, sell, pnl, mark, markNote, val: pnl != null ? pnl : mark };
  });
  const satsNow = s.sats && s.sats.length ? s.sats[s.sats.length - 1].value : null;
  return { rows, realized, openCost, openValue, openValued, satsNow, realizedSats: satsNow ? realized * satsNow : null };
}

export const specTrades = {
  type: "spec-trades",
  title: "📒 Trade log",
  page: "speculation",
  needs: () => ({}),
  view(_data, ctx = {}) {
    const spec = specOf(ctx);
    if (spec.trades == null) return waiting(ctx, "trades", "Trade log");
    if (!spec.trades.length) return { empty: "No trades yet." };
    const st = tradeStats(spec);
    const signed = (v, cur) => `${v >= 0 ? "+" : ""}${fmt(v, 2)} ${cur}`;
    let h = kpis([
      { v: `${st.realized >= 0 ? "+" : ""}${fmt(st.realized, 2)}`, l: `realised FLOWER${st.realizedSats != null ? ` ≈ ${fmt(st.realizedSats)} sats` : ""}` },
      { v: fmt(st.openCost, 2), l: "open: bought for (FLOWER)" },
      { v: `${st.openValued ? "" : "≥ "}${fmt(st.openValue, 2)}`, l: "open: worth now, after the fee" },
      { v: st.rows.length, l: st.rows.length === 1 ? "trade" : "trades" },
    ]);
    h += `<div class="v-spec-scroll"><table class="w-table"><tr><th>bought</th><th>item</th><th class="r">qty</th><th class="r">price / unit</th><th class="r">total</th><th class="r">sold / unit</th><th class="r">P/L</th><th></th></tr>` +
      st.rows.map(({ t, qty, buy, sell, pnl, mark, markNote, val }) => `<tr>
        <td class="nw">${esc(day(t.buy_date))}</td>
        <td><div class="v-name">${icon(ctx, t.item)}<div><b>${esc(t.item)}</b>${t.notes ? `<small>${esc(t.notes)}</small>` : ""}</div></div></td>
        <td class="r">${fmt(qty, 4)}</td>
        <td class="r nw">${fmt(buy, 6)} ${esc(t.currency)}</td>
        <td class="r">${fmt(qty * buy, 2)}</td>
        <td class="r">${sell == null ? `<button type="button" class="v-spec-btn" onclick="_specSell(${Number(t.id)})">SELL</button>` : `${fmt(sell, 6)}<div class="v-dim">${esc(day(t.sell_date))}</div>`}</td>
        <td class="r"><b style="color:${val == null ? "var(--c-dim)" : val >= 0 ? "var(--c-green)" : "var(--c-red)"}">${val == null ? "—" : signed(val, esc(t.currency))}</b>${pnl == null && mark != null ? `<div class="v-dim">${markNote}</div>` : ""}</td>
        <td class="r nw"><button type="button" class="v-spec-btn" title="edit" onclick="_specEdit(${Number(t.id)})">✎</button> <button type="button" class="v-spec-btn" title="delete" onclick="_specDel(${Number(t.id)})">✕</button></td></tr>`).join("") +
      `</table></div><div class="v-dim v-spec-note">Open positions are valued at the live price (crops at p2p after the 10 % fee, eggs at the valid-egg floor). Enter a sale's <b>net</b> price per unit — what arrived after the fee.</div>`;
    return { html: h };
  },
};

// ── 3. skimming to BTC ─────────────────────────────────────────────────
export function skimStats(spec, farm) {
  const s = (spec && spec.sats) || [];
  const now = s.length ? s[s.length - 1].value : null;
  const last30 = s.slice(-30).map((p) => p.value);
  const avg30 = last30.length ? last30.reduce((a, b) => a + b, 0) / last30.length : null;
  const btc = spec && spec.btc;
  const btcChg = btc && typeof btc.usd_24h_change === "number" ? btc.usd_24h_change / 100 : null;
  const bal = Number((farm && farm.balance) || 0);
  const skims = ((spec && spec.ledger) || []).filter((t) => t.direction === "withdrawal" && (t.venue || "sfl").toLowerCase() === "sfl");
  const skimBtc = skims.reduce((a, t) => a + (Number(t.btc_amount) || 0), 0);
  const lastSkim = skims.map((t) => day(t.tx_date)).sort().slice(-1)[0] || null;
  const dump = btcChg != null && btcChg <= -0.04;
  const rich = now != null && avg30 != null && now >= avg30 * 1.10;
  return { now, avg30, btcChg, bal, skims, skimBtc, lastSkim, verdict: dump ? "dump" : rich ? "rich" : "normal" };
}

export const specSkim = {
  type: "spec-skim",
  title: "₿ Skim to BTC",
  page: "speculation",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  optional: ["farm"],
  view({ farm } = {}, ctx = {}) {
    const spec = specOf(ctx);
    if (!spec.sats && !spec.btc && !spec.ledger && typeof ctx.ensure === "function") ctx.ensure();
    const k = skimStats(spec, farm);
    const ledgerErr = errOf(ctx, "ledger");
    let h = `<div class="v-dim v-spec-note">The farm makes ~45–68 ${fl(ctx)} a day that could be skimmed, but today everything it earns is spent in the game again. Here is what sits in the game now, what has left already and whether today's rate is good. Record a skim as a withdrawal (venue SFL) in the Investment Tracker on the DIFF page.</div>`;
    h += `<div class="v-kpis">
      <div class="v-kpi"><b>${fmt(k.bal, 1)} ${fl(ctx)}</b><span>FLOWER in the game now${k.now ? ` · ≈ ${fmt(k.bal * k.now)} sats · ${fmt(k.bal * k.now / 1e8, 5)} ₿` : ""}</span></div>
      <div class="v-kpi"><b>${fmt(k.now, 1)}</b><span>sats / FLOWER · 30d avg ${fmt(k.avg30, 1)} (${k.avg30 ? pct(k.now / k.avg30 - 1) : "—"})</span></div>
      <div class="v-kpi"><b style="color:${k.btcChg != null && k.btcChg < 0 ? "var(--c-red)" : "var(--c-green)"}">${pct(k.btcChg, 1)}</b><span>BTC 24 h${spec.btc ? ` · $${fmt(spec.btc.usd)}` : ""}</span></div>
      <div class="v-kpi">${ledgerErr ? `<b>—</b><span><a class="v-spec-link" onclick="_specUnlock()">🔒 enter the key</a> · already skimmed from SFL</span>`
        : `<b style="color:var(--c-green)">${fmt(k.skimBtc, 5)} ₿</b><span>already skimmed from SFL · ${k.skims.length} withdrawals${k.lastSkim ? " · last " + esc(k.lastSkim) : ""}</span>`}</div></div>`;
    h += `<div class="v-spec-line">${k.verdict === "dump" ? `${pill("GOOD DAY TO SKIM", "ok")} BTC is ${pct(k.btcChg, 1)} today, so FLOWER is mechanically dearer in sats (historically ~+6 %).`
      : k.verdict === "rich" ? `${pill("GOOD DAY TO SKIM", "ok")} FLOWER is ${pct(k.now / k.avg30 - 1)} above its 30-day average in sats.`
      : `${pill("ordinary day", "idle")} Skimming pays mainly on a day BTC drops 4 % or more, or when FLOWER is ≥ 10 % above its 30-day average in sats.`}</div>`;
    return { html: h };
  },
};

// ── 4. Genesis eggs ────────────────────────────────────────────────────
// Two small panels on one time axis: the floor and the 10th cheapest ask (RON), then the official Bad Eggs.
export function eggChart(snaps) {
  const pts = (snaps || []).map((s) => ({ t: Date.parse(s.ts), d: s.data || {} })).filter((p) => p.t);
  if (pts.length < 2) return "";
  const W = 640, L = 52, R = 12, PH = 110, GAP = 26, TOP = 14;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t, span = Math.max(1, t1 - t0);
  const X = (t) => L + ((t - t0) / span) * (W - L - R);
  const panels = [
    { series: [["floor_hidden_ron", "var(--c-green)", 2], ["ask_10th_ron", "var(--c-yellow)", 1.2]], unit: "RON" },
    { series: [["official_bad_eggs", "var(--c-red)", 2]], unit: "" },
  ];
  let s = `<svg class="v-spec-chart" viewBox="0 0 ${W} ${TOP + panels.length * (PH + GAP) + 6}" role="img" aria-label="Genesis egg floor, 10th ask and Bad Eggs over time">`;
  panels.forEach((p, i) => {
    const top = TOP + i * (PH + GAP), bot = top + PH;
    const vals = p.series.flatMap(([k]) => pts.filter((q) => q.d[k] != null).map((q) => Number(q.d[k])));
    if (!vals.length) return;
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; } else { const pad = (hi - lo) * 0.1; lo -= pad; hi += pad; }
    const Y = (v) => bot - ((v - lo) / (hi - lo)) * (bot - top);
    for (const v of [hi, lo]) {
      s += `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--c-line)" stroke-width="1"/>`;
      s += `<text x="${L - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" fill="var(--c-dim)" font-size="10">${fmt(v)}</text>`;
    }
    for (const [k, color, w] of p.series) {
      const line = pts.filter((q) => q.d[k] != null);
      if (!line.length) continue;
      s += `<polyline fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" points="${line.map((q) => `${X(q.t).toFixed(1)},${Y(Number(q.d[k])).toFixed(1)}`).join(" ")}"/>`;
    }
  });
  const when = (t) => new Date(t).toISOString().slice(5, 16).replace("T", " ");
  const ay = TOP + panels.length * (PH + GAP) - 8;
  s += `<text x="${L}" y="${ay}" fill="var(--c-dim)" font-size="10">${when(t0)}</text><text x="${W - R}" y="${ay}" text-anchor="end" fill="var(--c-dim)" font-size="10">${when(t1)} UTC</text>`;
  return s + `</svg>`;
}

export const specEggs = {
  type: "spec-eggs",
  title: "🥚 Genesis eggs (Yakkamon)",
  page: "speculation",
  needs: () => ({}),
  view(_data, ctx = {}) {
    const spec = specOf(ctx);
    if (spec.eggs == null) return waiting(ctx, "eggs", "Egg snapshots");
    const snaps = spec.eggs;
    const last = snaps.length ? snaps[snaps.length - 1].data : null;
    let h = `<div class="v-dim v-spec-note">Hourly snapshots from the local collector (your PC): the floor of <b>valid</b> eggs checked against the official metadata, the wall of asks at the floor, the official Bad Egg count and sales. Official trading on Ronin Market since 21 Sep, reveal 14 Oct. Log egg purchases in the trade log as “Genesis egg #id” in RON.</div>`;
    if (!last) return { html: h + `<div class="v-dim">No snapshot yet — the collector sends one every hour at :05.</div>` };
    const now = nowOf(ctx);
    const dayAgo = snaps.filter((x) => Date.parse(x.ts) <= now - 24 * 3600000).slice(-1)[0];
    const prev = dayAgo ? dayAgo.data : null;
    const d = (a, b) => (a != null && b != null && b !== 0) ? pct(a / b - 1) + " in 24 h" : "";
    const tile = (k, v, sub) => `<div class="v-kpi"><b>${v}</b><span>${k}${sub ? ` · ${sub}` : ""}</span></div>`;
    h += `<div class="v-kpis">
      ${tile("valid egg floor", fmt(last.floor_hidden_ron) + " RON", d(last.floor_hidden_ron, prev && prev.floor_hidden_ron) || (last.usd_per_ron ? "≈ $" + fmt(last.floor_hidden_ron * last.usd_per_ron, 2) : ""))}
      ${tile("10th / 50th cheapest", fmt(last.ask_10th_ron) + " / " + fmt(last.ask_50th_ron), "within 2 % of the floor: " + fmt(last.asks_within_2pct) + " · within 5 %: " + fmt(last.asks_within_5pct))}
      ${tile("official Bad Eggs", fmt(last.official_bad_eggs), [last.newly_flagged ? "+" + fmt(last.newly_flagged) + " last run" : "", d(last.official_bad_eggs, prev && prev.official_bad_eggs)].filter(Boolean).join(" · "))}
      ${tile("asks listed", fmt(last.listed_total), "best offer to buy " + fmt(last.top_offer_wron, 1) + " WRON")}
      ${tile("sales in the last hour", fmt(last.sales_1h_hidden) + " valid", "median " + fmt(last.median_sale_1h_hidden_ron) + " RON · offers accepted " + fmt(last.offers_accepted_1h))}</div>`;
    h += `<div class="v-spec-legend">${[["var(--c-green)", "valid egg floor (RON)"], ["var(--c-yellow)", "10th cheapest ask (RON)"], ["var(--c-red)", "official Bad Eggs (count, lower panel)"]]
      .map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join("")}</div>`;
    h += eggChart(snaps);
    h += `<div class="v-dim v-spec-note">Last snapshot ${esc(String(snaps[snaps.length - 1].ts).replace("T", " ").slice(0, 16))} UTC · ${snaps.length} snapshots.</div>`;
    const mine = last.mine ? Object.entries(last.mine) : [];
    if (mine.length) h += `<div class="v-spec-line">Your eggs: ${mine.map(([id, st]) => `<b>#${esc(id)}</b> ${pill(st, st === "Hidden" ? "ok" : "bad")}`).join(" · ")}</div>`;
    if (last.cheapest && last.cheapest.length) {
      h += `<div class="v-spec-line">Cheapest valid now: ${last.cheapest.slice(0, 8).map((c) => `<a class="v-spec-link" href="https://opensea.io/item/ronin/0x6d1bc5247ca99d917d91ec52dbbb5ef6c2435107/${encodeURIComponent(c[0])}" target="_blank" rel="noopener">#${esc(String(c[0]))}</a> ${fmt(c[1])}${c[2] ? " ⚠" : ""}`).join(" · ")}
        <div class="v-dim">⚠ = an ID from the 4080–4615 group (probably a multi-account farm, higher risk of being flagged later)</div></div>`;
    }
    return { html: h };
  },
};

export const SPECULATION_WIDGETS = [specCalendar, specTrades, specSkim, specEggs];
