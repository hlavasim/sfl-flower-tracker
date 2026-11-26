// ROADMAP as widgets. The numbers are section=roadmap's (the store's roadmap resource POSTs it the
// way the page always did); these only shape them:
//   📈 Income now and after the plan — the hero: FLOWER/day now, after the plan, the plan's cost and
//      length, what is in hand at the horizon, and where today's income comes from.
//   🛒 Buy path — the ranked order (IN PLAN, CONDITIONAL, beyond the horizon), each row with its
//      cost, best offer, +FLOWER/day, payback, horizon result, Σ cost and ETA.
//   🏷 Offers — the tradeable rows against the marketplace book: your offer on top / outbid / none.
import { bar, kpis, bigBar, pill } from "../ui/viz.mjs";
import { big, compact, rows, spark, tiles } from "../ui/glance.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (ctx, n) => (typeof ctx.icon === "function" ? ctx.icon(n) : "");
const fl = (ctx) => (ctx.flower || "🌸");

// The page's roadmapFmt* (same output).
export function fmtDays(d) {
  if (!isFinite(d)) return "∞";
  if (d < 1) return Math.max(1, Math.round(d * 24)) + "h";
  if (d < 60) return d.toFixed(d < 10 ? 1 : 0) + "d";
  if (d < 730) return (d / 30.44).toFixed(1) + "mo";
  return (d / 365.25).toFixed(1) + "y";
}
export function fmtDate(d, now = Date.now()) {
  if (!isFinite(d)) return "—";
  // "27 Nov", the year only when it is not this one ("3 Mar 2028")
  const t = new Date(now + d * 86400000), mon = t.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${t.getUTCDate()} ${mon}` + (t.getUTCFullYear() !== new Date(now).getUTCFullYear() ? ` ${t.getUTCFullYear()}` : "");
}
export function fmtFlower(v) {
  if (!isFinite(v)) return "∞";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e4) return Math.round(v).toLocaleString();
  if (v >= 100) return v.toFixed(0);
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

// A served Infinity arrives as null (JSON); back to Infinity, in place and idempotent.
export function normRoadmap(d) {
  if (!d || !d.sim) return d;
  const inf = (v) => (v == null ? Infinity : v);
  for (const t of d.sim.timeline || []) { t.roi = inf(t.roi); t.atDay = inf(t.atDay); }
  for (const r of d.sim.ranked || []) { r.roi = inf(r.roi); r.atDay = inf(r.atDay); }
  d.sim.totalDays = inf(d.sim.totalDays);
  d.sim.coreDays = inf(d.sim.coreDays);
  return d;
}

// One entry per row type (label = the badge, full = what it is, icon = the emoji fallback).
export const TYPE_META = {
  Collectible: { label: "C", full: "NFT collectibles", icon: "🖼️" },
  Wearable: { label: "W", full: "Wearables", icon: "👕" },
  Skill: { label: "SKILL", full: "Skills and ascension ranks", icon: "⭐" },
  Node: { label: "NODE", full: "Nodes (buy / merge)", icon: "⛏️" },
  Ascension: { label: "EXP", full: "Ascension expansions", icon: "🗺️" },
  Scenario: { label: "START", full: "Starting a new activity", icon: "🌱" },
  Bud: { label: "BUD", full: "Buds (1 best per resource)", icon: "🌱" },
};
const typeOf = (r) => (TYPE_META[r.type] ? r.type : "Collectible");
const TRADE = new Set(["Collectible", "Wearable", "Bud"]);
export const isTrade = (r) => !r.type || TRADE.has(r.type);

// The row's icon: marketplace items get their artwork; a skill rank tries the base skill's art over
// the star; generated rows (nodes, expansions…) their type's emoji.
function rowIcon(ctx, r) {
  const meta = TYPE_META[typeOf(r)];
  if (isTrade(r) && r.type !== "Bud") return icon(ctx, r.name) || meta.icon;
  if (r.type === "Skill") return icon(ctx, String(r.name || "").replace(/ → Level \d+$/, "")) || meta.icon;
  return `<span title="${esc(meta.full)}">${meta.icon}</span>`;
}

// The owner's live offers per item: the best unit price (sfl ÷ qty) and its quantity.
export function myOffers(farm) {
  const out = {};
  const offers = (farm && farm.trades && farm.trades.offers) || {};
  for (const o of Object.values(offers)) {
    if (!o || o.fulfilledAt || o.clearedAt) continue;
    for (const [name, qty] of Object.entries(o.items || {})) {
      const unit = (+o.sfl || 0) / (+qty || 1);
      if (!out[name] || unit > out[name].unit) out[name] = { unit, qty: +qty || 1 };
    }
  }
  return out;
}

// The price the offer cell shows: your offer if you have one, else the best bid to beat.
export function offerPrice(name, book, mine) {
  if (mine[name]) return mine[name].unit;
  const m = book && book.items && book.items[name];
  return m && m.b != null ? m.b : null;
}

// 🟢 your offer is the best (or tied) · 🟠 you have one, someone bids more · ⚪ no offer of yours.
export function offerState(name, book, mine) {
  const m = book && book.items && book.items[name];
  const own = mine[name];
  if (!m) return own ? { state: "mine-nobook", icon: "🟠", price: own.unit, tip: `Your offer ${fmtFlower(own.unit)} — the market has no data for this item` } : null;
  const bid = m.b, ask = m.f;
  const gap = bid != null && ask ? Math.round(((ask - bid) / ask) * 100) : null;
  const book2 = `best offer ${bid != null ? fmtFlower(bid) : "none"} (${m.oc} offers) · floor ${ask != null ? fmtFlower(ask) : "—"} (${m.lc} listings)` +
    `${gap != null ? ` · gap ${gap} %` : ""}${m.ls != null ? ` · last sale ${fmtFlower(m.ls)}` : ""}`;
  let out;
  if (own && (bid == null || own.unit >= bid - 1e-9)) {
    out = { state: "top", icon: "🟢", price: own.unit,
      tip: `Your offer ${fmtFlower(own.unit)}${own.qty > 1 ? ` ×${own.qty}` : ""} is the highest${bid != null && Math.abs(own.unit - bid) < 1e-9 ? " (or tied for first)" : ""}. ${book2}` };
  } else if (own) {
    out = { state: "outbid", icon: "🟠", price: own.unit,
      tip: `Outbid: yours ${fmtFlower(own.unit)}, the highest ${fmtFlower(bid)} (${fmtFlower(bid - own.unit)} more). ${book2}` };
  } else out = { state: "none", icon: "⚪", price: bid, tip: `You have no offer. ${book2}` };
  return { ...out, bid, ask, gap, oc: m.oc, lc: m.lc, ls: m.ls, mine: own || null,
    href: `https://sunflower-land.com/play/#/marketplace/${m.c}/${m.id}` };
}

function offerCell(o) {
  if (!o) return `<span class="v-dim">—</span>`;
  const price = o.price != null ? fmtFlower(o.price) : "—";
  const gap = o.gap != null ? ` <small class="${o.gap >= 15 ? "v-rm-gapok" : "v-dim"}">−${o.gap}%</small>` : "";
  if (!o.href) return `<span title="${esc(o.tip)}">${o.icon} ${price}</span>`;
  return `<a class="v-rm-link" href="${esc(o.href)}" target="_blank" rel="noopener" title="${esc(o.tip + " · click = open in the marketplace")}">${o.icon} ${price}${gap}</a>`;
}

const roadmapNeeds = (farmId) => ({ roadmap: { res: "roadmap", farm: farmId }, book: { res: "book" }, farm: { res: "farm", farm: farmId } });

// ── 📈 Income ──
const CAT_COLOR = { trees: "#63c74d", stone: "#9a8060", iron: "#c4a882", gold: "#FFD700", crimstone: "#FF6B6B", crops: "#30D158", fruits: "#FF69B4",
  greenhouse: "#5DADE2", chickens: "#FFD60A", cows: "#C8A2C8", sheep: "#B07CD8", bees: "#FFD700", fishing: "#5DADE2", obsidian: "#8b6914",
  flowers: "#FF69B4", oil: "#8b6914", pets: "#F5A9BC", cropMachine: "#E67E22", buds: "#9ACD32" };

export const roadmapIncome = {
  type: "roadmap-income",
  title: "📈 Income — now and after the plan",
  page: "roadmap",
  needs: (farmId) => ({ roadmap: { res: "roadmap", farm: farmId } }),
  // data: { roadmap }; ctx: { catLabel(cat) → text, catIcon(cat) → HTML, flower → HTML }
  view({ roadmap } = {}, ctx = {}) {
    if (!roadmap || !roadmap.sim) return { empty: "No roadmap data." };
    const d = normRoadmap(roadmap), sim = d.sim;
    const prod = d.currentProd || { total: 0, breakdown: [] };
    const total = d.startIncome > 0 ? d.startIncome : prod.total || 0;
    const lbl = (c) => (typeof ctx.catLabel === "function" ? ctx.catLabel(c) : c);
    const ci = (c) => (typeof ctx.catIcon === "function" ? ctx.catIcon(c) : "");
    const doneIn = (sim.timeline || []).filter((t) => t.kind === "econ").reduce((a, t) => Math.max(a, t.atDay || 0), 0);
    let html = kpis([
      { v: `${fmtFlower(total)}/day`, l: "income now" },
      { v: `${fmtFlower(sim.finalRate)}/day`, l: "after the plan" },
      { v: fmtFlower(sim.econCost), l: `${sim.econSteps} buys cost` },
      { v: fmtDays(doneIn), l: "plan done in" },
      ...(sim.wealth != null ? [{ v: fmtFlower(sim.wealth), l: `in hand after ${sim.horizonYears} y` }] : []),
    ]);
    // how far today's income is from the plan's end rate
    html += bigBar(sim.finalRate > 0 ? (total / sim.finalRate) * 100 : 100);
    const bd = (prod.breakdown || []).filter((b) => b.sfl > 0.01).sort((a, b) => b.sfl - a.sfl);
    const base = bd.reduce((s, b) => s + b.sfl, 0);
    if (bd.length) {
      html += `<div class="v-rm-stack">` + bd.map((b) => `<i style="width:${base > 0 ? Math.max(1, (b.sfl / base) * 100) : 0}%;background:${CAT_COLOR[b.cat] || "#8b6914"}" title="${esc(lbl(b.cat))} ${fmtFlower(b.sfl)}/d"></i>`).join("") + `</div>`;
      html += `<div class="v-rm-legend">` + bd.map((b) => `<span><span class="v-dot" style="background:${CAT_COLOR[b.cat] || "#8b6914"}"></span>${ci(b.cat)} ${esc(lbl(b.cat))} <b>${fmtFlower(b.sfl)}</b></span>`).join("") + `</div>`;
    }
    // oil and lava pits burn resources for expansions and nodes: what comes off the gross
    const inputs = (prod.inputs || []).filter((x) => x.sfl < -0.01);
    if (inputs.length) {
      const inLbl = { oil: "Oil", obsidian: "Lava pit" };
      html += `<div class="v-dim v-rm-note">earned <b>${fmtFlower(prod.gross || 0)}</b>` + inputs.map((x) => ` <span class="v-rm-neg">− ${ci(x.cat)} ${esc(inLbl[x.cat] || x.cat)} ${fmtFlower(-x.sfl)}</span>`).join("") +
        ` = <b>${fmtFlower(total)}/day</b> (oil and obsidian go into expansions and nodes, not to the market — running them is a cost)</div>`;
    }
    const notes = [];
    if (sim.wealth != null) notes.push(`in hand after ${sim.horizonYears} y = cash ${fmtFlower(sim.cashAtHorizon)} + resale of the bought NFTs ${fmtFlower(sim.resaleAtHorizon)}`);
    if (sim.withdrawPerDay > 0) notes.push(`−${fmtFlower(sim.withdrawPerDay)}/day to BTC`);
    if (sim.beyondCount) notes.push(`${sim.beyondCount} items don’t pay back within ${sim.horizonYears} y`);
    if (notes.length) html += `<div class="v-dim v-rm-note">${esc(notes.join(" · "))}</div>`;
    return { html };
  },
};

// ── 🛒 Buy path ──
const STATUS = [["", "All rows"], ["plan", "In plan only"], ["worth", "Hide what doesn’t pay back"]];
const statusPill = (r, years) => (r.status === "plan" ? pill("IN PLAN", "ok")
  : r.status === "beyond" ? `<span class="v-pill v-bad" title="Doesn’t earn even 10 % of its price within ${esc(years)} years — not worth it.">&gt; ${esc(years)} Y</span>`
  : `<span class="v-pill v-run" title="${esc(r.reason || "")}">CONDITIONAL</span>`);

export const roadmapBuyPath = {
  type: "roadmap-buy-path",
  title: "🛒 Buy path — what to buy next, in order",
  page: "roadmap",
  needs: roadmapNeeds,
  optional: ["book", "farm"],
  optionsLabel: "Rows",
  options: [
    { key: "status", label: "Show", kind: "select", choices: STATUS },
    { key: "hide", label: "Hide types", kind: "checklist", choices: Object.entries(TYPE_META).map(([t, m]) => [t, `${m.icon} ${m.full}`]) },
  ],
  defaults: { opts: { status: "", hide: [] } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.status === "beyond" ? "w-st-done" : ""),
  columns: [
    { key: "rank", label: "#", align: "right", title: "Position in the full order (hidden rows keep their numbers). Tick to add it to the total below.",
      fmt: (v, r) => `<span class="v-rm-rank"><input type="checkbox" class="rm-pick" title="Add to the total below"${r.picked ? " checked" : ""} onchange="_rmTogglePick(${esc(JSON.stringify(r.name))},this.checked)">${esc(v)}</span>` },
    { key: "name", label: "item", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${r.linkHtml}</b> ${r.badgesHtml}<small>${r.boostHtml}</small></div></div>` },
    { key: "boost", label: "boost", extra: true, fmt: (v) => esc(String(v || "").split("\n").join(" · ")) },
    { key: "floor", label: "cost", align: "right", title: "Buy price in FLOWER — the marketplace floor; for crafted items derived from the materials.",
      fmt: (v) => `<span class="v-count">${fmtFlower(v)}</span>` },
    { key: "offer", label: "offer", align: "right", get: (r) => (r.offer ? r.offer.price : null),
      title: "The best offer (bid) on the marketplace and your offer’s state: 🟢 yours is the highest · 🟠 you have an offer, someone bids more · ⚪ no offer of yours (price = the highest bid). −X % = how far the bid is under the floor (yellow from 15 %, where offering pays). Hover for the detail.",
      fmt: (v, r) => (r.trade ? offerCell(r.offer) : `<span class="v-dim">—</span>`) },
    { key: "value", label: "+/day", align: "right", title: "What the item adds per day to your current farm, in FLOWER.",
      fmt: (v, r) => `<div class="v-rm-val"><span class="v-done">+${fmtFlower(v)}</span>${r.status === "conditional" ? ` <small class="v-dim">if used</small>` : ""}${bar(r.valuePct, "ok")}</div>` },
    { key: "roi", label: "payback", align: "right",
      title: "Sorted by payback. A step of a chain (ascension expansions, Level 2 → 3) is placed by the payback of the WHOLE chain up to it — it can’t be bought before the steps above it; that figure shows under its own as ‘in a chain’.",
      fmt: (v, r) => `${fmtDays(v)}${r.offerRoiHtml}${r.chainHtml}` },
    { key: "horizonGain", label: "at horizon", align: "right",
      title: "How much more FLOWER you hold at the end of the horizon if you buy this when the plan has saved up for it: earnings to the horizon − price + what the NFT then sells for (by price bucket, nothing above 10k). Negative = not worth it.",
      fmt: (v, r) => r.horizonHtml },
    { key: "cumCost", label: "Σ cost", align: "right", title: "Cumulative cost in FLOWER, buying top to bottom.",
      get: (r) => (r.status === "plan" ? r.cumCost : null), fmt: (v) => (v == null ? "—" : `<span class="v-dim">${fmtFlower(v)}</span>`) },
    { key: "rateAfter", label: "FL/day", align: "right", title: "Income per day after this buy.",
      get: (r) => (r.status === "plan" ? r.rateAfter : null), fmt: (v) => (v == null ? "—" : fmtFlower(v)) },
    { key: "atDay", label: "ETA", align: "right", title: "When the plan has saved up for it.",
      get: (r) => (r.status === "plan" ? r.atDay : null), fmt: (v, r) => (v == null ? "—" : `<span class="v-dim v-nowrap">${esc(r.eta)}</span>`) },
  ],

  // data: { roadmap, book?, farm? }; ctx: { icon(name) → HTML, flower → HTML, picks() → [names], now? }
  build({ roadmap, book, farm } = {}, ctx = {}, opts = {}) {
    if (!roadmap || !roadmap.sim) return { rows: [], footer: "", empty: "No roadmap data." };
    const d = normRoadmap(roadmap), sim = d.sim;
    const now = ctx.now || Date.now();
    const years = sim.horizonYears;
    const mine = myOffers(farm);
    const picks = new Set(typeof ctx.picks === "function" ? ctx.picks() || [] : []);
    const hide = new Set(Array.isArray(opts.hide) ? opts.hide : []);
    const ranked = sim.ranked || [];
    const maxVal = ranked.reduce((a, r) => Math.max(a, r.value || 0), 0);
    const counts = {};
    for (const r of ranked) counts[typeOf(r)] = (counts[typeOf(r)] || 0) + 1;
    const all = ranked.map((r, k) => {
      const trade = isTrade(r);
      const isPlan = r.status === "plan", grouped = isPlan && r.bundle && r.horizonGain === 0;
      const offer = trade ? offerState(r.name, book, mine) : null;
      const op = trade ? offerPrice(r.name, book, mine) : null;
      const meta = TYPE_META[typeOf(r)];
      const badges = [`<span class="v-pill v-idle" title="${esc(meta.full)}">${meta.label}</span>`, statusPill(r, years)];
      if (isPlan && r.bundle && r.horizonGain !== 0) badges.push(`<span class="v-pill v-idle" title="These ${esc(r.bundle)} items only pay off together (e.g. an ascension step that gives nothing by itself before one that earns). They are bought at once; the gain is for the whole group.">GROUP ×${esc(r.bundle)}</span>`);
      if (r.skillTakeNow) badges.push(`<span class="v-pill v-ok" title="You already have the skill points for this — take it now. The cost still counts the XP the point took: holding a point doesn’t make it free, as holding FLOWER doesn’t make an NFT free.">TAKE NOW</span>`);
      const boost = esc(String(r.boost || "").split("\n").join(" · ")) +
        (isPlan || r.status === "beyond" ? "" : ` · <span class="v-rm-cond">${esc(r.reason || "only if you run that activity")}</span>`);
      const name = r.type === "Bud" && r.budId
        ? `<a class="v-rm-link" href="https://sunflower-land.com/play/#/marketplace/buds/${esc(r.budId)}" target="_blank" rel="noopener" title="${esc(r.budTraits || "")} · open in the marketplace">${esc(r.name)}</a>`
        : esc(r.name);
      const p2y = r.value * 730.5;   // the offer price whose payback is exactly 2 years
      const offerRoiHtml = trade && r.value > 0 && op > 0
        ? `<div class="v-dim" title="Payback if bought at the offer price (${fmtFlower(op)} FLOWER) instead of the floor ${fmtFlower(r.floor)}: ${fmtFlower(op)} ÷ ${fmtFlower(r.value)}/day. For a payback of exactly 2 years offer at most ${fmtFlower(p2y)} FLOWER (${fmtFlower(r.value)}/day × 730.5 days).">(${fmtDays(op / r.value)} offer · 2y ≤ ${fmtFlower(p2y)})</div>` : "";
      const chainHtml = r.prefixRoi != null && Math.abs(r.prefixRoi - r.roi) > 1
        ? `<div class="v-dim" title="Placed by the payback of the WHOLE chain up to here: ${fmtFlower(r.prefixCost)} FLOWER for every step including this one. This step’s own payback is ${fmtDays(r.roi)}, but it can’t be bought before the ones above it.">in a chain ${fmtDays(r.sortRoi)}</div>` : "";
      const horizonHtml = grouped ? `<span class="v-rm-group">in the group</span>`
        : r.horizonGain != null && isFinite(r.horizonGain)
          ? `<span class="${r.horizonGain > 0 ? "v-done" : "v-rm-neg"}"${r.resale > 0 ? ` title="including the NFT’s resale at the end for ${fmtFlower(r.resale)}"` : ""}>${r.horizonGain > 0 ? "+" : "−"}${fmtFlower(Math.abs(r.horizonGain))}</span>` +
            (!r.bundle && r.floor > 0 ? `<small class="v-dim v-rm-pct" title="result after ${esc(years)} years as % of the buy price ${fmtFlower(r.floor)}">(${r.horizonGain >= 0 ? "+" : "−"}${Math.round((Math.abs(r.horizonGain) / r.floor) * 100)} %)</small>` : "")
          : "—";
      return { ...r, rank: k + 1, trade, offer, offerAt: op > 0 ? op : r.floor || 0, picked: picks.has(r.name),
        iconHtml: (grouped ? `<span class="v-rm-group" title="Belongs to the group above — bought with it.">↳</span>` : "") + rowIcon(ctx, r),
        linkHtml: name, badgesHtml: `<span class="v-rm-badges">${badges.join("")}</span>`, boostHtml: boost, valuePct: maxVal > 0 ? ((r.value || 0) / maxVal) * 100 : 0,
        offerRoiHtml, chainHtml, horizonHtml, eta: fmtDate(r.atDay, now) };
    });
    const rows = all.filter((r) => !hide.has(typeOf(r)) && (opts.status === "plan" ? r.status === "plan" : opts.status === "worth" ? r.status !== "beyond" : true));
    const plan = all.filter((r) => r.status === "plan");
    const summary = kpis([
      { v: plan.length, l: "in the plan" },
      { v: fmtFlower(sim.econCost), l: "plan cost" },
      { v: `${fmtFlower(sim.finalRate)}/day`, l: "after the plan" },
      { v: all.filter((r) => r.status === "conditional").length, l: "conditional" },
      { v: sim.beyondCount || 0, l: `beyond ${years} y` },
    ]) + `<div class="v-rm-types">` + Object.keys(TYPE_META).filter((t) => counts[t]).map((t) =>
      `<span class="v-pill ${hide.has(t) ? "v-idle v-rm-off" : "v-idle"}" title="${esc(TYPE_META[t].full)}${hide.has(t) ? " (hidden — ⚙ Rows)" : ""}">${TYPE_META[t].icon} ${esc(TYPE_META[t].full)} ${counts[t]}</span>`).join(" ") +
      (rows.length < all.length ? ` <small class="v-dim">${all.length - rows.length} of ${all.length} hidden — order, Σ cost and ETA still count the whole list</small>` : "") + `</div>`;
    return { rows, summary, footer: buyPathFooter(sim, d, all, picks, ctx), empty: "Nothing on the buy path with these filters." };
  },
};

function buyPathFooter(sim, d, all, picks, ctx) {
  const years = sim.horizonYears;
  let h = "";
  // the ticked rows: bought now at the floor vs via offers, and the FLOWER/day they add
  const sel = all.filter((r) => picks.has(r.name));
  if (sel.length) {
    const nowC = sel.reduce((a, r) => a + (r.floor || 0), 0), off = sel.reduce((a, r) => a + r.offerAt, 0), val = sel.reduce((a, r) => a + (r.value || 0), 0);
    const f = (v) => Math.round(v).toLocaleString("en-US");
    const pb = (c) => (val > 0 ? ` (${fmtDays(c / val)})` : "");
    h += `<div class="v-rm-picks">✓ ${sel.length} picked · buy now <b>${f(nowC)} 🌸</b>${pb(nowC)} · via offers <b class="v-done">${f(off)} 🌸</b>${pb(off)}` +
      `${nowC > 0 ? ` <span class="v-rm-gapok">−${Math.round((1 - off / nowC) * 100)} %</span>` : ""} · +${val.toFixed(2)} 🌸/day · <a class="v-rm-link" onclick="_rmClearPicks()">clear</a></div>`;
  }
  h += `<div class="v-dim v-rm-note"><b>IN PLAN</b> = the buy order that leaves the most FLOWER in hand after ${esc(years)} years, top to bottom (Σ cost and ETA assume you reinvest income minus the BTC withdrawal, buying each item once it is saved up). <b>&gt; ${esc(years)} Y</b> = earns something, but not its price back within the horizon. <b>CONDITIONAL</b> = boosts a category not in your profitable mix yet (e.g. crimstone below break-even) — ranked by what it WOULD add at full scale, so nothing is hidden. <b>+/day is each item’s value added to your CURRENT farm</b>, so it doesn’t depend on what you buy first.</div>`;
  const cosmetic = (sim.timeline || []).filter((x) => x.kind === "cosmetic");
  if (cosmetic.length) {
    if (ctx.showCosmetic) {
      h += `<details class="v-rm-more"><summary>${cosmetic.length} no-FLOWER-value boost NFTs (qualitative / net ≤ 0) — cheapest first</summary><div>` +
        cosmetic.slice(0, 100).map((m) => `<div class="v-rm-line">${icon(ctx, m.name)} <b>${esc(m.name)}</b> <span class="v-pill v-idle">${TYPE_META[typeOf(m)].label}</span> <span class="v-dim">${esc(String(m.boost || "").split("\n").join(" · "))}${m.reason ? ` — <i>${esc(m.reason)}</i>` : ""}</span> <span class="v-count">${fmtFlower(m.floor)}</span></div>`).join("") + `</div></details>`;
    } else h += `<div class="v-dim v-rm-note">+ ${cosmetic.length} boost NFTs with no FLOWER value hidden — tick “Show no-value boosts” in the page’s Settings to list them.</div>`;
  }
  if (sim.noBoostCount) h += `<div class="v-dim v-rm-note">Excluded ${sim.noBoostCount} no-boost collectibles / decorations (Coin Aura, banners, bears…) — they generate no FLOWER, so they’re not part of this profit roadmap.</div>`;
  if (sim.tail && sim.tail.length) h += `<div class="v-dim v-rm-note">+ ${sim.tail.length} NFTs above your ${fmtFlower(ctx.maxPrice || 0)} 🌸 price cap (${fmtFlower(sim.tailCost)} 🌸 total) — excluded from the plan and the totals above.</div>`;
  if (sim.untradeable && sim.untradeable.length) {
    h += `<details class="v-rm-more"><summary>${sim.untradeable.length} NFTs with no realistic market (no floor, or troll-priced &gt;500k) — excluded</summary><div class="v-rm-chips">` +
      sim.untradeable.map((u) => `<span>${icon(ctx, u.name)} ${esc(u.name)}</span>`).join("") + `</div></details>`;
  }
  h += `<details class="v-rm-more"><summary>How this is calculated</summary><div class="v-rm-how">
    • <b>Order</b> = the most FLOWER in hand after your horizon (default 5 years). Each step buys the item that adds the most FLOWER-at-the-horizon per FLOWER spent, given what you already own, as soon as it is saved up; the plan stops when nothing still pays for itself in time. Income the repay plan takes to BTC is not reinvested. NFT resale at the end is measured on the market by price bucket (listing price after the 10 % fee, value change per year from the last six months; nothing above 10k, where nothing sells).<br>
    • <b>Coins are free</b> (when you hold &gt;10k) — coin-priced costs like axes and seeds aren’t charged, since coins don’t convert to FLOWER.<br>
    • <b>Obsidian</b> sells only ~1/week, so its income is capped at one obsidian (minus a lava ignition) per week.<br>
    • <b>Net, not gross</b> — every category subtracts its running costs (animal feed and sickness, seeds, mining tools, lava-pit fuel) before counting.<br>
    • <b>Boost value</b> = the floored net FLOWER/day the boost adds, vs what you already own (stacking synergy included) × your real harvest efficiency.<br>
    • <b>Efficiency</b> = your harvest sessions/day ÷ theoretical, per category from the last 7 days of history; bees/fishing (no session signal) use your average activity.<br>
    • <b>Synergy</b> — after each simulated purchase, every same-category item’s marginal is recomputed.<br>
    • <b>Scope</b> — only NFTs that carry a boost are on the path; boost NFTs with no measurable FLOWER value are bought last, cheapest first.<br>
    • <b>Always live</b> — ownership is read from your farm and floor prices from the marketplace on every load.<br>
    • <b>Prices</b> are the marketplace floor in FLOWER. Listings above 500k FLOWER are treated as troll / no-liquidity and dropped.
  </div></details>`;
  return h;
}

// ── 🏷 Offers ──
const STATE_PILL = { top: ["TOP", "ok"], outbid: ["OUTBID", "run"], "mine-nobook": ["NO BOOK", "run"], none: ["NO OFFER", "idle"] };
export const roadmapOffers = {
  type: "roadmap-offers",
  title: "🏷 Offers on the buy path",
  page: "roadmap",
  needs: roadmapNeeds,
  optionsLabel: "Rows",
  options: [
    { key: "mineOnly", label: "Only items with my offer", kind: "bool" },
    { key: "planOnly", label: "Only items in the plan", kind: "bool" },
  ],
  defaults: { opts: { mineOnly: false, planOnly: false } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.state === "top" ? "w-st-ready" : ""),
  columns: [
    { key: "name", label: "item", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b><small>${esc(r.statusText)}</small></div></div>` },
    { key: "state", label: "state", fmt: (v, r) => (r.href
      ? `<a class="v-rm-link" href="${esc(r.href)}" target="_blank" rel="noopener" title="${esc(r.tip + " · click = open in the marketplace")}">${r.icon} ${pill(STATE_PILL[v][0], STATE_PILL[v][1])}</a>`
      : `<span title="${esc(r.tip)}">${r.icon} ${pill(STATE_PILL[v][0], STATE_PILL[v][1])}</span>`) },
    { key: "mine", label: "my offer", align: "right", get: (r) => (r.own ? r.own.unit : null),
      fmt: (v, r) => (v == null ? "—" : `${fmtFlower(v)}${r.own.qty > 1 ? ` <small class="v-dim">×${r.own.qty}</small>` : ""}`) },
    { key: "bid", label: "best offer", align: "right", fmt: (v, r) => (v == null ? "—" : `${fmtFlower(v)} <small class="v-dim">(${esc(r.oc ?? 0)})</small>`) },
    { key: "ask", label: "floor", align: "right", fmt: (v, r) => (v == null ? "—" : `${fmtFlower(v)} <small class="v-dim">(${esc(r.lc ?? 0)})</small>`) },
    { key: "gap", label: "gap", align: "right", title: "How far the best offer is under the floor (yellow from 15 %, where offering pays).",
      fmt: (v) => (v == null ? "—" : `<span class="${v >= 15 ? "v-rm-gapok" : "v-dim"}">−${v}%</span>`) },
    { key: "ls", label: "last sale", align: "right", extra: true, fmt: (v) => (v == null ? "—" : fmtFlower(v)) },
    { key: "value", label: "+/day", align: "right", fmt: (v) => `<span class="v-done">+${fmtFlower(v)}</span>` },
    { key: "payAt", label: "payback at offer", align: "right", title: "Price shown (your offer, else the best bid) ÷ +/day.",
      fmt: (v) => (v == null ? "—" : fmtDays(v)) },
    { key: "max2y", label: "2y max offer", align: "right", title: "The highest offer that still pays back in exactly 2 years: +/day × 730.5 days.",
      fmt: (v) => (v > 0 ? fmtFlower(v) : "—") },
  ],

  build({ roadmap, book, farm } = {}, ctx = {}, opts = {}) {
    if (!roadmap || !roadmap.sim) return { rows: [], footer: "", empty: "No roadmap data." };
    const sim = normRoadmap(roadmap).sim;
    const mine = myOffers(farm);
    const all = [];
    for (const r of sim.ranked || []) {
      if (!isTrade(r)) continue;
      const o = offerState(r.name, book, mine);
      if (!o) continue;
      const op = offerPrice(r.name, book, mine);
      all.push({ name: r.name, status: r.status, value: r.value || 0, state: o.state, icon: o.icon, tip: o.tip, href: o.href || "",
        own: o.mine || (mine[r.name] || null), bid: o.bid ?? null, ask: o.ask ?? null, gap: o.gap ?? null, oc: o.oc, lc: o.lc, ls: o.ls ?? null,
        payAt: r.value > 0 && op > 0 ? op / r.value : null, max2y: r.value * 730.5,
        statusText: r.status === "plan" ? "in the plan" : r.status === "beyond" ? `beyond ${sim.horizonYears} y` : "conditional",
        iconHtml: icon(ctx, r.name) });
    }
    const rows = all.filter((r) => (!opts.mineOnly || r.own) && (!opts.planOnly || r.status === "plan"));
    const n = (s) => all.filter((r) => r.state === s).length;
    const mineN = all.filter((r) => r.own).length;
    const summary = kpis([{ v: mineN, l: "my offers" }, { v: n("top"), l: "on top" }, { v: n("outbid") + n("mine-nobook"), l: "outbid / no book" }, { v: all.length, l: "items in the book" }]) +
      bigBar(mineN ? (n("top") / mineN) * 100 : 0);
    return { rows, summary, footer: `<div class="v-dim">🟢 your offer is the highest · 🟠 someone bids more · ⚪ no offer of yours — the price is the bid to beat</div>`,
      empty: book ? "No buy-path item has offers or listings." : "The marketplace book is loading." };
  },
};

// ── iPhone glance faces ──
roadmapIncome.sizes = ["s", "m"];
roadmapIncome.size = "m";
roadmapIncome.glance = ({ roadmap } = {}, ctx = {}, opts = {}, size = "m") => {
  if (!roadmap || !roadmap.sim) return { empty: "No roadmap data." };
  const d = normRoadmap(roadmap), sim = d.sim;
  const total = d.startIncome > 0 ? d.startIncome : (d.currentProd && d.currentProd.total) || 0;
  if (size === "s") return { html: big(compact(total), { unit: "/day", cap: `→ ${compact(sim.finalRate)}/day after the plan` }) };
  // the income as the plan buys its way up, a point per buy
  const steps = (sim.ranked || []).filter((r) => r.status === "plan" && Number.isFinite(r.rateAfter)).map((r) => r.rateAfter);
  return { html: tiles([{ label: "now", value: `${compact(total)}/d` }, { label: "after the plan", value: `${compact(sim.finalRate)}/d` },
    { label: `${sim.econSteps} buys`, value: compact(sim.econCost) }]) + spark([total, ...steps]) };
};

roadmapBuyPath.sizes = ["s", "m", "l"];
roadmapBuyPath.size = "l";
roadmapBuyPath.glance = (data = {}, ctx = {}, opts = {}, size = "l") => {
  const out = roadmapBuyPath.build(data, ctx, { ...opts, status: "plan" });
  const plan = out.rows.filter((r) => r.status === "plan");
  if (!plan.length) return { empty: out.empty || "Nothing to buy." };
  const row = (r) => ({ icon: r.iconHtml, name: r.name, sub: `${TYPE_META[typeOf(r)].label.toLowerCase()} · pays back in ${fmtDays(r.sortRoi ?? r.roi)}`,
    ...(r.skillTakeNow ? { chip: { text: "TAKE NOW", tone: "ok" } } : { value: `+${fmtFlower(r.value)}/d`, tone: "ok" }) });
  if (size === "s") {
    const r = plan[0];
    return { html: `<div class="g-hero">${r.iconHtml}</div>` + big(fmtDays(r.sortRoi ?? r.roi), { cap: `${r.name} · +${fmtFlower(r.value)}/d` }) };
  }
  const n = size === "m" ? 3 : 6;
  return { html: rows(plan.slice(0, n).map(row)) + `<div class="g-cap g-foot">${plan.length} in the plan · next ${esc(plan[0].eta)}</div>` };
};
