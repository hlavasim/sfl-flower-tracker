// MARKS (the Nightshades marks war) as widgets. The leaderboard of a week comes from the store's
// "marks" resource (/api/marks-history latest + crawl state); the strategy, the shopping list and
// the cost to #1 also read the live farm (its kitchen / pet requests, stock, gear) and the p2p
// prices (section=treasury's td.p2pPrices). Everything here is the page's own arithmetic, moved:
// the numbers are the ones the MARKS page showed.
//   ⚔️ Marks overview · 🧭 Best marks sources · 🛒 Today's shopping list · 🏁 Leaderboard ·
//   🏆 Cost to reach #1 · 📈 Projections · 🔥 Resource burn rate
import { esc, icon, fmtNum } from "./market-common.mjs";
import { kpis, bar, bigBar, pill } from "../ui/viz.mjs";
import { big, compact, ring as gRing, rows as gRows, tiles as gTiles } from "../ui/glance.mjs";

const needLb = () => ({ marks: { res: "marks" } });
const needAll = (farmId) => ({ marks: { res: "marks" }, farm: { res: "farm", farm: farmId },
  prices: { res: "compute", farm: farmId, section: "treasury" } });
const NO_MARKS = "The marks data did not load.";
const NO_FARM = "Needs the live farm and the market prices.";

// The week's start as a Date ("2026-11-23" is midnight UTC).
const weekDate = (ws) => (ws ? new Date(typeof ws === "string" && ws.length === 10 ? ws + "T00:00:00Z" : ws) : null);
const isMe = (p, farmId) => p.farm_id === parseInt(farmId) || String(p.farm_id) === String(farmId);

// Players by rank, the viewer's row, #1, the kitchen items and the time left.
export function marksBoard(marks, ctx = {}) {
  const players = (marks.players || []).slice().sort((a, b) => (a.rank || 999) - (b.rank || 999));
  const week = marks.week || {};
  const me = players.find((p) => isMe(p, ctx.farmId)) || null;
  const ws = weekDate(week.week_start);
  const now = ctx.now || Date.now();
  const daysLeft = ws ? Math.max(0, (ws.getTime() + 7 * 86400000 - now) / 86400000) : 0;
  return { players, week, me, top: players[0] || null, kitchenItems: week.kitchen_items || [], daysLeft };
}

const TIER_TABLE = [[16850, 4], [8700, 3.8], [5500, 3.5], [2700, 3], [290, 1.5], [20, 0.05], [0, 0]];
const GEAR_BOOST = { "Nightshade Armor": 0.2, "Nightshade Helmet": 0.1, "Nightshade Crown": 0.1, "Nightshade Sword": 0.1, "Nightshade Pants": 0.05, "Nightshade Sabatons": 0.05 };
const PET_BASE = [4, 8, 12, 20];

// The live farm's multiplier, today's counters and what each kitchen / pet request is worth now.
// ctx.priceMap(p2p) → { item: SFL } (the page's delivery cost rule), ctx.recipe(food) → { ing: qty }.
export function marksStrategy(marks, farm, p2p, ctx = {}) {
  const { week, kitchenItems } = marksBoard(marks, ctx);
  const now = ctx.now || Date.now();
  const priceMap = typeof ctx.priceMap === "function" ? ctx.priceMap(p2p) || {} : {};
  const recipe = (f) => (typeof ctx.recipe === "function" ? ctx.recipe(f) : null);
  const inv = farm.inventory || {};
  const faction = farm.faction || {};
  const kitchen = faction.kitchen || {};
  const pet = faction.pet || {};
  const equipped = (farm.bumpkin || {}).equipped || {};

  const emblems = parseFloat(inv["Nightshade Emblem"] || 0);
  const rankBoost = (TIER_TABLE.find((t) => emblems >= t[0]) || [0, 0])[1];
  let wearBoost = 0;
  for (const [item, boost] of Object.entries(GEAR_BOOST)) if (Object.values(equipped).includes(item)) wearBoost += boost;
  const mult = 1 + rankBoost + wearBoost;
  const hasPawShield = equipped.secondaryTool === "Paw Shield";
  const petMult = mult + (hasPawShield ? 0.25 : 0);

  const num = (key) => parseFloat(inv[key] || 0) || 0;
  const wsDate = weekDate(week.week_start);
  const todayDay = Math.min(Math.max(Math.floor((now - (wsDate ? wsDate.getTime() : NaN)) / 86400000) + 1, 1), 7);
  const dayStr = String(todayDay);

  const kitchenReqs = kitchen.requests || [];
  const kitchenList = kitchenReqs.length > 0 ? kitchenReqs.map((r) => ({ item: r.item, amount: r.amount })) : kitchenItems;
  const kitchenAnalysis = kitchenList.map((ki) => {
    const stock = num(ki.item);
    const totalDlv = ki.amount > 0 ? Math.floor(stock / ki.amount) : 0;
    const req = kitchenReqs.find((r) => r.item === ki.item);
    const fulfilled = req ? ((req.dailyFulfilled || {})[dayStr] || 0) : 0;
    const nextRaw = Math.max(20 - fulfilled * 2, 1);
    let dailyRaw = 0;
    for (let i = 0; i < Math.min(10, totalDlv); i++) dailyRaw += Math.max(20 - i * 2, 1);
    return { item: ki.item, amount: ki.amount, stock, totalDlv, fulfilled, nextRaw, nextMarks: nextRaw * mult,
      dailyMarks: dailyRaw * mult, daysNeeded: totalDlv > 0 ? Math.ceil(totalDlv / 10) : 0 };
  });

  const petReqs = pet.requests || [];
  const petItems = petReqs.length > 0 ? petReqs.map((r) => ({ food: r.food, quantity: r.quantity })) : (week.pet_items || []);
  const petAnalysis = petItems.map((pi, slot) => {
    const qty = pi.quantity || 1;
    const have = num(pi.food);
    const base = PET_BASE[slot] || 4;
    const petReq = petReqs[slot];
    const fulfilled = petReq ? ((petReq.dailyFulfilled || {})[dayStr] || 0) : 0;
    const nextRaw = Math.max(base - fulfilled * 2, 1);
    return { food: pi.food, qty, have, dlv: qty > 0 ? Math.floor(have / qty) : 0, base, nextMarks: nextRaw * petMult,
      label: ["Easy", "Medium", "Hard", "Doll"][slot] || `Slot ${slot}`, slot, fulfilled };
  });

  // a pet food the price map cannot value: its ingredients at p2p (else the map)
  const petUnitCost = (food) => {
    let unit = priceMap[food] || 0;
    const rec = recipe(food);
    if (unit <= 0 && rec) {
      let rc = 0;
      for (const [ing, q] of Object.entries(rec)) rc += ((p2p || {})[ing] || priceMap[ing] || 0) * q;
      unit = rc;
    }
    return unit;
  };

  const sources = [];
  for (const ka of kitchenAnalysis) {
    const cost = (priceMap[ka.item] || 0) * ka.amount;
    sources.push({ type: "kitchen", label: `Donate ${ka.amount}× ${ka.item}`, icon: ka.item, nextMarks: ka.nextMarks,
      costPerDlv: cost, costPerMark: ka.nextMarks > 0 ? cost / ka.nextMarks : 0, stock: ka.totalDlv + " dlv left",
      dailyMarks: ka.dailyMarks, fulfilled: ka.fulfilled,
      hint: ka.fulfilled >= 10 ? "⚠️ Diminished (10+ today)" : ka.fulfilled > 0 ? `${ka.fulfilled}/10 done today` : "✅ Fresh counter" });
  }
  for (const pa of petAnalysis) {
    if (pa.dlv <= 0) continue;
    const cost = petUnitCost(pa.food) * pa.qty;
    sources.push({ type: "pet", label: `Feed pet: ${pa.food} (${pa.label})`, icon: pa.food, nextMarks: pa.nextMarks,
      costPerDlv: cost, costPerMark: pa.nextMarks > 0 ? cost / pa.nextMarks : 0, stock: pa.dlv + " feeds",
      dailyMarks: pa.nextMarks, fulfilled: 0,
      hint: (pa.fulfilled > 0 ? `${pa.fulfilled} fed today` : "✅ Fresh") + (hasPawShield ? " | 🛡️ Paw Shield" : "") });
  }
  // cheapest SFL/mark first; free (unpriced) ones last, by marks
  sources.sort((a, b) => {
    if (a.costPerMark === 0 && b.costPerMark === 0) return b.nextMarks - a.nextMarks;
    if (a.costPerMark === 0) return 1;
    if (b.costPerMark === 0) return -1;
    return a.costPerMark - b.costPerMark;
  });
  sources.forEach((s, i) => { s.n = i + 1; });
  return { mult, petMult, hasPawShield, todayDay, kitchenAnalysis, petAnalysis, sources, priceMap, petUnitCost, kitchenReqs, inv };
}

// Today's deliveries under a budget (SFL per mark): per kitchen resource / pet slot, deliver while
// the next one costs ≤ budget per mark (diminishing marks, fixed cost per delivery).
export function marksShopping(st, budget) {
  const rows = [];
  for (const ka of st.kitchenAnalysis) {
    const costPerDlv = (st.priceMap[ka.item] || 0) * ka.amount;
    if (costPerDlv <= 0) continue;
    let dlvCount = 0, marks = 0, cost = 0, ful = ka.fulfilled;
    while (dlvCount < 50) {
      const marksNext = Math.max(20 - ful * 2, 1) * st.mult;
      if (costPerDlv / marksNext > budget) break;
      dlvCount++; marks += marksNext; cost += costPerDlv; ful++;
    }
    const lastRaw = ful > 0 ? Math.max(20 - (ful - 1) * 2, 1) : 20;
    const lastCpm = dlvCount > 0 ? costPerDlv / (lastRaw * st.mult) : 0;
    const nextCpm = costPerDlv / (Math.max(20 - ful * 2, 1) * st.mult);
    const needBuyDlv = Math.max(0, dlvCount - ka.totalDlv);
    if (dlvCount > 0) rows.push({ key: `k:${ka.item}`, icon: ka.item, label: `${ka.item} (×${ka.amount})`, dlvCount, marks, cost,
      needUnits: needBuyDlv * ka.amount, buyCost: needBuyDlv * costPerDlv, have: ka.totalDlv, type: "kitchen", lastCpm, nextCpm,
      stockCovers: Math.min(dlvCount, ka.totalDlv), needBuyDlv });
  }
  for (const pa of st.petAnalysis) {
    const costPerFeed = st.petUnitCost(pa.food) * pa.qty;
    if (costPerFeed <= 0) continue;
    let feedCount = 0, marks = 0, cost = 0, ful = pa.fulfilled;
    while (feedCount < 30) {
      const marksNext = Math.max(pa.base - ful * 2, 1) * st.petMult;
      if (costPerFeed / marksNext > budget) break;
      feedCount++; marks += marksNext; cost += costPerFeed; ful++;
    }
    const lastRaw = ful > 0 ? Math.max(pa.base - (ful - 1) * 2, 1) : pa.base;
    const lastCpm = feedCount > 0 ? costPerFeed / (lastRaw * st.petMult) : 0;
    const nextCpm = costPerFeed / (Math.max(pa.base - ful * 2, 1) * st.petMult);
    const needBuyDlv = Math.max(0, feedCount - pa.dlv);
    if (feedCount > 0) rows.push({ key: `p:${pa.slot}:${pa.food}`, icon: pa.food, label: `${pa.food} (${pa.label})`, dlvCount: feedCount, marks, cost,
      needUnits: needBuyDlv * pa.qty, buyCost: needBuyDlv * costPerFeed, have: pa.dlv, type: "pet", lastCpm, nextCpm,
      stockCovers: Math.min(feedCount, pa.dlv), needBuyDlv });
  }
  for (const r of rows) {
    r.note = r.needBuyDlv > 0 && r.stockCovers < r.dlvCount ? `🛒 Stock covers ${r.stockCovers}/${r.dlvCount}, buy ${r.needBuyDlv} more`
      : r.needBuyDlv === 0 && r.nextCpm <= budget * 1.5 && r.nextCpm > budget ? `⚠️ Next would be ${r.nextCpm.toFixed(4)} SFL/m (${((r.nextCpm / budget - 1) * 100).toFixed(0)}% over budget)`
      : r.needBuyDlv === 0 ? "✅ All from stock" : "";
    r.lastTone = r.lastCpm <= budget * 0.5 ? "flip-good" : r.lastCpm > budget * 0.8 ? "v-marks-hot" : "";
  }
  return rows;
}

// Greedy: deliver the kitchen resource with the cheapest SFL/mark next, day by day, until the gap
// to #1 is closed or the week ends.
export function marksCostToFirst(st, gap, weekStartDay) {
  const dayNum = weekStartDay;
  const sim = st.kitchenReqs.map((r) => {
    const price = (st.priceMap[r.item] || 0) * r.amount;
    const stock = parseFloat(st.inv[r.item] || 0) || 0;
    return { item: r.item, price, amount: r.amount, fulfilled: (r.dailyFulfilled || {})[String(dayNum)] || 0, day: dayNum,
      totalDeliveries: 0, totalMarks: 0, totalCost: 0, haveDeliveries: r.amount > 0 ? Math.floor(stock / r.amount) : 0, needToBuy: 0 };
  });
  let gained = 0, totalCost = 0, steps = 0;
  while (gained < gap && steps < 50000) {
    let best = -1, bestCpm = Infinity;
    for (let i = 0; i < sim.length; i++) {
      const s = sim[i], m = Math.max(20 - s.fulfilled * 2, 1) * st.mult;
      if (m <= 0 || s.price <= 0) continue;
      if (s.price / m < bestCpm) { bestCpm = s.price / m; best = i; }
    }
    if (best < 0) break;
    const s = sim[best], m = Math.max(20 - s.fulfilled * 2, 1) * st.mult;
    s.fulfilled++; s.totalDeliveries++; s.totalMarks += m; s.totalCost += s.price;
    gained += m; totalCost += s.price; steps++;
    if (s.totalDeliveries > s.haveDeliveries) s.needToBuy++;
    if (sim.every((r) => r.fulfilled >= 10)) {
      const next = sim[0].day + 1;
      if (next > 7) break;
      for (const r of sim) { r.day = next; r.fulfilled = 0; }
    }
  }
  const buyCost = sim.reduce((a, s) => a + s.needToBuy * s.price, 0);
  return { sim, gained, totalCost, steps, buyCost, success: gained >= gap, daysRemaining: Math.max(0, 7 - dayNum + 1) };
}

const deltaCls = (d) => (d == null ? "" : d > 0 ? "flip-good" : d < 0 ? "flip-bad" : "v-dim");
const deltaStr = (d) => (d != null ? (d > 0 ? "+" : "") + fmtNum(d) : "-");
const rowMe = (r) => (r.me ? "v-marks-me" : "");
const kitchenHead = (ctx, items) => items.map((k) => `${icon(ctx, k.item)}${esc(k.item)}`).join(" · ");

// ── ⚔️ overview ──
export const marksSummary = {
  type: "marks-summary",
  title: "⚔️ Marks overview",
  page: "marks",
  needs: needLb,

  // ctx: { farmId, now?, icon? }
  view({ marks } = {}, ctx = {}) {
    if (!marks || !Array.isArray(marks.players)) return { empty: NO_MARKS };
    const { players, me, top, kitchenItems, daysLeft } = marksBoard(marks, ctx);
    const hoursLeft = Math.floor(daysLeft * 24), minsLeft = Math.floor((daysLeft * 24 - hoursLeft) * 60);
    const cs = marks.state || {};
    const now = ctx.now || Date.now();
    const crawl = cs.phase === "discover" ? `🔍 Discovering players… (${cs.discover_cursor || 0} calls)`
      : cs.phase === "crawl" ? `📡 Crawling farm data… (${cs.crawl_cursor || 0}/${cs.roster_size || "?"})`
      : `✅ Last cycle: ${cs.updated_at ? ago(now - new Date(cs.updated_at).getTime()) : "?"} ago`;
    const pct = me && top && top.marks > 0 ? (me.marks / top.marks) * 100 : 0;
    return {
      html: kpis([{ v: me ? "#" + me.rank : "N/A", l: "your rank" }, { v: me ? fmtNum(me.marks) : "N/A", l: "your marks" },
        { v: top ? fmtNum(top.marks) : "N/A", l: "#1 marks" }, { v: `${hoursLeft}h ${minsLeft}m`, l: "time left" },
        { v: me && me.multiplier ? me.multiplier.toFixed(1) + "x" : "N/A", l: "your multiplier" }, { v: players.length, l: "players" },
        { v: marks.snapshot_count || 0, l: "snapshots" }]) +
        (me && top ? `<div class="v-mkt-line">You have ${pct.toFixed(0)} % of #1's marks</div>` + bigBar(pct) : "") +
        `<div class="v-mkt-line">🍳 Kitchen: ${kitchenHead(ctx, kitchenItems) || "?"}</div>` +
        `<div class="v-dim">${esc(crawl)} · next snapshot ~${esc(nextSnapshot(now))}</div>`,
    };
  },
};

function ago(ms) {
  const sec = Math.floor(ms / 1000);
  return sec < 60 ? sec + "s" : sec < 3600 ? Math.floor(sec / 60) + "m" : sec < 86400 ? Math.floor(sec / 3600) + "h" : Math.floor(sec / 86400) + "d";
}
// The collector's snapshot cadence: every 8 h Mon–Thu, 4 h Fri, 2 h Sat, 1 h Sun (10 min after 20:00).
export function nextSnapshot(nowMs) {
  const nowUtc = new Date(nowMs);
  const day = nowUtc.getUTCDay(), hour = nowUtc.getUTCHours();
  let h = 8;
  if (day === 5) h = 4;
  if (day === 6) h = 2;
  if (day === 0) h = hour >= 20 ? 0.17 : 1;
  const nextHour = h > 0 ? Math.ceil(hour / h) * h : hour;
  const next = new Date(nowUtc);
  next.setUTCHours(nextHour <= hour && h > 0 ? nextHour + h : nextHour, 0, 0, 0);
  if (next <= nowUtc) next.setUTCHours(next.getUTCHours() + (h || 1));
  const mins = Math.max(0, Math.round((next - nowUtc) / 60000));
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60}m`;
}

// The strategy-based widgets share their inputs.
function strategyOf(data, ctx) {
  const { marks, farm, prices } = data || {};
  if (!marks || !Array.isArray(marks.players)) return { empty: NO_MARKS };
  if (!farm) return { empty: NO_FARM };
  const p2p = (prices && prices.td && prices.td.p2pPrices) || {};
  return { st: marksStrategy(marks, farm, p2p, ctx) };
}

// ── 🧭 best marks sources ──
export const marksSources = {
  type: "marks-sources",
  title: "🧭 Best marks sources",
  page: "marks",
  needs: needAll,
  optional: ["prices"],
  defaults: {},
  rowKey: (r) => `${r.type}:${r.icon}`,
  rowLabel: (r) => r.label,
  rowClass: (r) => (r.n === 1 ? "w-st-ready" : ""),
  columns: [
    { key: "n", label: "#", align: "right" },
    { key: "label", label: "action", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b><small>${esc(r.hint)}</small></div></div>` },
    { key: "nextMarks", label: "next marks", align: "right", title: "marks from the NEXT donation / feed, with today's diminishing returns", fmt: (v) => `<b>${v.toFixed(1)}</b>` },
    { key: "costPerDlv", label: "cost/dlv", align: "right", title: "SFL per delivery — kitchen: p2p price of the resources; pet food: its ingredients", fmt: (v) => `${v > 0 ? v.toFixed(2) : "?"} SFL` },
    { key: "costPerMark", label: "SFL/mark", align: "right", title: "lower = better; green under 0.01, red over 0.05",
      fmt: (v) => `<span class="${v > 0 && v < 0.01 ? "flip-good" : v > 0.05 ? "flip-bad" : ""}">${v > 0 ? v.toFixed(4) : "?"}</span>` },
    { key: "dailyMarks", label: "daily (fresh)", align: "right", title: "marks per day from a fresh counter (10 kitchen donations, or the pet feeds)", fmt: (v) => v.toFixed(0) },
    { key: "stock", label: "stock", title: "deliveries / feeds the inventory still covers", fmt: (v) => `<span class="v-dim">${esc(v)}</span>` },
  ],

  // ctx: { farmId, priceMap(p2p), recipe(food), icon, now? }
  build(data = {}, ctx = {}) {
    const { st, empty } = strategyOf(data, ctx);
    if (!st) return { rows: [], footer: "", empty };
    const rows = st.sources.map((s) => ({ ...s, iconHtml: icon(ctx, s.icon) }));
    const totalDaily = st.kitchenAnalysis.reduce((s, k) => s + k.dailyMarks, 0);
    const totalPet = st.petAnalysis.reduce((s, p) => s + p.nextMarks, 0);
    const supply = st.kitchenAnalysis.filter((k) => k.totalDlv > 0).map((k) => k.daysNeeded);
    const bottleneck = supply.length ? Math.min(...supply) : 0;
    const summary = kpis([{ v: `${st.mult.toFixed(2)}x`, l: "kitchen multiplier" },
      { v: `${st.petMult.toFixed(2)}x`, l: st.hasPawShield ? "pet (🛡️ Paw Shield +25 %)" : "pet multiplier" },
      { v: `${st.todayDay}/7`, l: "day" }, { v: fmtNum(Math.round(totalDaily + totalPet)), l: `marks/day (kitchen ${fmtNum(Math.round(totalDaily))} + pet ${fmtNum(Math.round(totalPet))})` },
      ...(bottleneck > 0 ? [{ v: `${bottleneck}d`, l: "shortest supply" }] : [])]);
    const footer = `<div class="v-dim">Sorted by SFL/mark (cheapest first). Kitchen donations give 20→2→1 raw marks after 10 a day per resource — spread across resources and days; pet slots diminish too.</div>`;
    return { rows, summary, footer, empty: "No resources available for donations." };
  },
};

// ── 🛒 shopping list under a budget ──
const BUDGETS = Array.from({ length: 20 }, (_, i) => ((i + 1) * 0.005).toFixed(3));
export const marksShoppingList = {
  type: "marks-shopping",
  title: "🛒 Today's shopping list",
  titleFor: (o) => (o.budget ? `🛒 Shopping list ≤ ${o.budget} SFL/mark` : "🛒 Today's shopping list"),
  page: "marks",
  needs: needAll,
  optional: ["prices"],
  optionsLabel: "Budget",
  options: [{ key: "budget", label: "Max SFL per mark", kind: "select", choices: [["", "same as the MARKS page"], ...BUDGETS.map((b) => [b, b])] }],
  defaults: { opts: { budget: "" } },
  rowKey: (r) => r.key,
  rowLabel: (r) => r.label,
  columns: [
    { key: "label", label: "item", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b><small>${esc(r.note)}</small></div></div>` },
    { key: "dlvCount", label: "do", align: "right" },
    { key: "marks", label: "marks", align: "right", fmt: (v) => `<b>${fmtNum(Math.round(v))}</b>` },
    { key: "lastCpm", label: "last SFL/m", align: "right", fmt: (v, r) => `<span class="${r.lastTone}">${v.toFixed(4)}</span>` },
    { key: "stockShare", label: "from stock", get: (r) => (r.dlvCount ? (r.stockCovers / r.dlvCount) * 100 : 0), fmt: (v) => bar(v) },
    { key: "have", label: "stock", align: "right", fmt: (v) => `<span class="v-dim">${esc(v)} in stock</span>` },
    { key: "needUnits", label: "buy", align: "right", fmt: (v) => (v > 0 ? `<span class="flip-bad">${fmtNum(v)} units</span>` : `<span class="flip-good">✅</span>`) },
    { key: "buyCost", label: "buy cost", align: "right", fmt: (v) => (v > 0 ? `${v.toFixed(2)} SFL` : "-") },
  ],

  // ctx also: budget (the page's saved value)
  build(data = {}, ctx = {}, opts = {}) {
    const { st, empty } = strategyOf(data, ctx);
    if (!st) return { rows: [], footer: "", empty };
    const budget = parseFloat(opts.budget) || parseFloat(ctx.budget) || 0.03;
    const rows = marksShopping(st, budget).map((r) => ({ ...r, iconHtml: icon(ctx, r.icon) }));
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    const summary = rows.length ? kpis([{ v: budget.toFixed(3), l: "max SFL/mark" }, { v: fmtNum(Math.round(sum("marks"))), l: "marks today" },
      { v: sum("dlvCount"), l: "deliveries" }, { v: `${sum("buyCost").toFixed(2)} SFL`, l: "to buy" }]) : "";
    return { rows, summary, footer: "", empty: `No actions under ${budget.toFixed(3)} SFL/mark today.` };
  },
};

// ── 🏁 leaderboard ──
export const marksLeaderboard = {
  type: "marks-leaderboard",
  title: "🏁 Leaderboard",
  page: "marks",
  needs: needLb,
  defaults: { rows: { mode: "top", top: 30, picked: [] } },
  rowKey: (r) => String(r.farm_id),
  rowLabel: (r) => r.player_name || String(r.farm_id),
  rowClass: rowMe,
  keepRow: (r) => r.me,
  columns: [
    { key: "rank", label: "#", align: "right", title: "rank within the Nightshades faction", fmt: (v) => esc(v || "?") },
    { key: "player_name", label: "name", title: "click the cog → columns for emblems, boosts, pet figures and the SFL balance",
      fmt: (v, r) => `<b>${esc(v || "?")}</b>${r.me ? ` ${pill("you", "idle")}` : ""}` },
    { key: "marks", label: "marks", align: "right", title: "marks earned this week", fmt: (v) => `<b>${fmtNum(v)}</b>` },
    { key: "delta", label: "Δ", align: "right", title: "change since the previous snapshot", fmt: (v) => `<span class="${deltaCls(v)}">${deltaStr(v)}</span>` },
    { key: "multiplier", label: "mult", align: "right", title: "1 + emblem tier boost + wearable boost", fmt: (v) => (v ? v.toFixed(1) + "x" : "?") },
    { key: "tier", label: "tier", filter: true, title: "emblem tier (Lich +400 %, Sorcerer +380 %, Witch +350 %, Raver +300 %, Enchanter +150 %, Occultist +5 %)",
      fmt: (v) => `<span class="marks-tier-${esc(String(v || "pagan").toLowerCase())}">${esc(v || "?")}</span>` },
    { key: "kitchen", label: "kitchen stock", title: "this week's kitchen items: stock (change) · deliveries · done today",
      get: (r) => r.kitchenTotal, fmt: (v, r) => `<div class="v-marks-stock">${r.kitchenHtml}</div>` },
    { key: "optimal", label: "optimal", align: "right", title: "more marks if the resources are spread optimally (10 a day per resource)", fmt: (v) => fmtNum(v) },
    { key: "dump", label: "dump", align: "right", title: "marks if everything is donated now; the arrow = ranks gained",
      fmt: (v, r) => `${fmtNum(v)}${r.rankGain ? ` <small class="${r.rankGain > 0 ? "flip-good" : "flip-bad"}">${r.rankGain > 0 ? "↑" : "↓"}${Math.abs(r.rankGain)}</small>` : ""}` },
    { key: "threat", label: "threat", title: "projected total (current + optimal) against the top one",
      fmt: (v) => bar(v, v > 80 ? "bad" : v > 50 ? "mid" : "ok") },
    { key: "farm_id", label: "farm", extra: true, align: "right" },
    { key: "emblems", label: "emblems", extra: true, align: "right", fmt: (v) => fmtNum(v || 0) },
    { key: "rank_boost", label: "rank boost", extra: true, align: "right", fmt: (v) => `+${((v || 0) * 100).toFixed(0)}%` },
    { key: "wear_boost", label: "wear boost", extra: true, align: "right", fmt: (v) => `+${((v || 0) * 100).toFixed(0)}%` },
    { key: "has_paw_shield", label: "paw shield", extra: true, fmt: (v) => (v ? "✅ Yes" : "❌ No") },
    { key: "pet_mult", label: "pet mult", extra: true, align: "right", fmt: (v) => `${(v || 1).toFixed(2)}x` },
    { key: "pet_daily", label: "pet daily", extra: true, align: "right", fmt: (v) => fmtNum(Math.round(v || 0)) },
    { key: "pet_weekly", label: "pet weekly", extra: true, align: "right", fmt: (v) => fmtNum(Math.round(v || 0)) },
    { key: "marks_daily_fresh", label: "daily fresh", extra: true, align: "right", fmt: (v) => fmtNum(Math.round(v || 0)) },
    { key: "petFood", label: "pet food", extra: true, get: (r) => Object.keys(r.pet_food_stock || {}).length,
      fmt: (v, r) => Object.entries(r.pet_food_stock || {}).map(([f, q]) => `<span class="v-mkt-item">${icon(r.ctx, f)}${esc(f)} ${fmtNum(q)}</span>`).join(" · ") },
    { key: "sfl", label: "SFL", extra: true, align: "right", fmt: (v) => (v || 0).toFixed(1) },
  ],

  build({ marks } = {}, ctx = {}) {
    if (!marks || !Array.isArray(marks.players)) return { rows: [], footer: "", empty: NO_MARKS };
    const { players, kitchenItems } = marksBoard(marks, ctx);
    const maxOptimal = Math.max(...players.map((p) => (p.marks || 0) + (p.marks_optimal || 0)), 1);
    const rows = players.map((p) => {
      const res = p.resources || {}, prev = p.prev_resources || {}, today = p.today_fulfilled || {};
      const dump = Math.round(p.marks_dump || 0);
      const afterDump = (p.marks || 0) + dump;
      const rankAfter = players.filter((op) => (op.marks || 0) > afterDump).length + 1;
      const kitchenHtml = kitchenItems.map((ki) => {
        const cur = res[ki.item] || 0, d = prev[ki.item] != null ? cur - prev[ki.item] : null;
        return `<span class="v-mkt-item">${icon(ctx, ki.item)}${fmtNum(cur)}${d != null ? ` <small class="${deltaCls(d)}">(${deltaStr(d)})</small>` : ""}` +
          ` <small class="v-dim">${ki.amount > 0 ? Math.floor(cur / ki.amount) : 0} dlv · ${today[ki.item] || 0} today</small></span>`;
      }).join("");
      return { ...p, ctx, me: isMe(p, ctx.farmId), delta: p.prev_marks != null ? p.marks - p.prev_marks : null,
        optimal: Math.round(p.marks_optimal || 0), dump, rankGain: (p.rank || 999) - rankAfter,
        threat: maxOptimal > 0 ? Math.min(100, ((p.marks || 0) + (p.marks_optimal || 0)) / maxOptimal * 100) : 0,
        kitchenHtml, kitchenTotal: kitchenItems.reduce((a, ki) => a + (res[ki.item] || 0), 0) };
    });
    return { rows, footer: "", empty: "No players this week." };
  },
};

// ── 🏆 cost to reach #1 ──
export const marksCostFirst = {
  type: "marks-cost1",
  title: "🏆 Cost to reach #1",
  page: "marks",
  needs: needAll,
  optional: ["prices"],
  defaults: {},
  rowKey: (r) => r.item,
  rowLabel: (r) => r.item,
  columns: [
    { key: "item", label: "resource", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b> <span class="v-dim">×${esc(r.amount)}</span></div></div>` },
    { key: "totalDeliveries", label: "deliveries", align: "right", fmt: (v) => fmtNum(v) },
    { key: "totalMarks", label: "marks gained", align: "right", fmt: (v) => `<b>${fmtNum(Math.round(v))}</b>` },
    { key: "haveDeliveries", label: "have", align: "right", title: "deliveries the inventory covers without buying", fmt: (v) => `${fmtNum(v)} dlv` },
    { key: "stockShare", label: "from stock", get: (r) => (r.totalDeliveries ? ((r.totalDeliveries - r.needToBuy) / r.totalDeliveries) * 100 : 100), fmt: (v) => bar(v) },
    { key: "needUnits", label: "need to buy", align: "right", title: "units to buy at p2p prices",
      fmt: (v, r) => (r.needToBuy > 0 ? `<span class="flip-bad">${fmtNum(v)} units</span>` : `<span class="flip-good">✅ enough</span>`) },
    { key: "buyCost", label: "buy cost", align: "right", fmt: (v, r) => (r.needToBuy > 0 ? `${v.toFixed(2)} SFL` : "-") },
  ],

  build(data = {}, ctx = {}) {
    const { st, empty } = strategyOf(data, ctx);
    if (!st) return { rows: [], footer: "", empty };
    const { me, top } = marksBoard(data.marks, ctx);
    if (!me || !top) return { rows: [], footer: "", empty: "You are not on this week's leaderboard." };
    const gap = (top.marks || 0) - (me.marks || 0);
    if (gap <= 0) return { rows: [], footer: "", empty: "🏆 You are #1." };
    if (!st.kitchenReqs.length) return { rows: [], footer: "", empty: "No kitchen requests on the live farm." };
    const r = marksCostToFirst(st, gap, st.todayDay);
    const rows = r.sim.map((s) => ({ ...s, needUnits: s.needToBuy * s.amount, buyCost: s.needToBuy * s.price, iconHtml: icon(ctx, s.item) }));
    const covered = Math.round(r.gained - r.buyCost / (r.totalCost / r.gained || 1));
    const summary = `<div class="v-mkt-line"><b>${esc(top.player_name || "?")}</b> has <b>${fmtNum(top.marks || 0)}</b> marks, you have <b>${fmtNum(me.marks || 0)}</b> → ` +
      `<b class="flip-bad">${fmtNum(Math.ceil(gap))}</b> more needed ${r.success ? pill("achievable", "ok") : pill("not with the kitchen alone", "bad")}</div>` +
      kpis([{ v: fmtNum(Math.round(r.gained)), l: "marks from the simulation" }, { v: fmtNum(covered), l: "covered by stock" },
        { v: `${r.buyCost.toFixed(2)} SFL`, l: "total buy cost" }, { v: `${fmtNum(r.steps)} / ${r.daysRemaining}d`, l: "deliveries / days left" }]) +
      bigBar(gap > 0 ? (r.gained / gap) * 100 : 100);
    const footer = `<div class="v-dim">Greedy simulation, kitchen resources only (cooking takes real time), multiplier ${st.mult.toFixed(2)}x, ` +
      `resets daily. Assumes #1 stops gaining marks — in reality the cost is higher.</div>`;
    return { rows, summary, footer, empty: "" };
  },
};

// ── 📈 projections ──
export const marksProjections = {
  type: "marks-projections",
  title: "📈 Projections & threat",
  page: "marks",
  needs: needLb,
  defaults: { rows: { mode: "top", top: 30, picked: [] } },
  rowKey: (r) => String(r.farm_id),
  rowLabel: (r) => r.player_name || String(r.farm_id),
  rowClass: rowMe,
  keepRow: (r) => r.me,
  columns: [
    { key: "n", label: "#", align: "right" },
    { key: "player_name", label: "name", fmt: (v, r) => `<b>${esc(v || "?")}</b>${r.me ? ` ${pill("you", "idle")}` : ""}` },
    { key: "marks", label: "current", align: "right", title: "marks earned this week", fmt: (v) => fmtNum(v) },
    { key: "optimal", label: "optimal", align: "right", title: "more from the kitchen if played optimally", fmt: (v) => fmtNum(v) },
    { key: "petWk", label: "pet wk", align: "right", title: "pet feeding marks possible this week (Easy 4, Medium 8, Hard 12, Doll 20 × pet multiplier)", fmt: (v) => fmtNum(v) },
    { key: "projected", label: "total proj", align: "right", title: "current + optimal + pet weekly", fmt: (v) => `<b>${fmtNum(v)}</b>` },
    { key: "bar", label: "", get: (r) => r.projected,
      fmt: (v, r) => `<div class="v-mkt-stack" title="current / kitchen optimal / pet weekly"><i class="v-mkt-s1" style="width:${r.curPct.toFixed(1)}%"></i>` +
        `<i class="v-mkt-s2" style="width:${r.optPct.toFixed(1)}%"></i><i class="v-mkt-s3" style="width:${r.petPct.toFixed(1)}%"></i></div>` },
  ],

  build({ marks } = {}, ctx = {}) {
    if (!marks || !Array.isArray(marks.players)) return { rows: [], footer: "", empty: NO_MARKS };
    const projected = marksBoard(marks, ctx).players.map((p) => ({ ...p, total: (p.marks || 0) + (p.marks_optimal || 0) }))
      .sort((a, b) => b.total - a.total);
    const maxProj = projected.length > 0 ? projected[0].total : 1;
    const rows = projected.map((p, i) => ({ ...p, n: i + 1, me: isMe(p, ctx.farmId), optimal: Math.round(p.marks_optimal || 0),
      petWk: Math.round(p.pet_weekly || 0), projected: Math.round(p.total + (p.pet_weekly || 0)),
      curPct: p.total > 0 ? (p.marks || 0) / maxProj * 100 : 0, optPct: p.total > 0 ? (p.marks_optimal || 0) / maxProj * 100 : 0,
      petPct: p.total > 0 ? (p.pet_weekly || 0) / maxProj * 100 : 0 }));
    const footer = `<div class="v-dim"><span class="v-mkt-key v-mkt-s1"></span> current · <span class="v-mkt-key v-mkt-s2"></span> kitchen optimal · ` +
      `<span class="v-mkt-key v-mkt-s3"></span> pet weekly — watch players below you with a high optimal: they can overtake by dumping.</div>`;
    return { rows, footer, empty: "No players this week." };
  },
};

// ── 🔥 resource burn rate ──
export const marksBurn = {
  type: "marks-burn",
  title: "🔥 Resource burn rate",
  page: "marks",
  needs: needLb,
  defaults: {},
  rowKey: (r) => String(r.farm_id),
  rowLabel: (r) => r.player_name || String(r.farm_id),
  rowClass: rowMe,
  columns: [
    { key: "rank", label: "#", align: "right", fmt: (v) => esc(v || "?") },
    { key: "player_name", label: "name", fmt: (v, r) => `<b>${esc(v || "?")}</b>` },
    { key: "burn", label: "change · deliveries left", title: "stock change since the previous snapshot (negative = donating) and the deliveries the stock still covers",
      get: (r) => r.burnTotal, fmt: (v, r) => `<div class="v-marks-stock">${r.burnHtml}</div>` },
    { key: "signals", label: "signal", title: "🟢 MARKS+ big marks jump · 🔻 resource dropping fast (dumping?) · 🔺 growing (stockpiling?)",
      get: (r) => r.signals.length, fmt: (v, r) => esc(r.signals.join(" ") || "•") },
  ],

  build({ marks } = {}, ctx = {}) {
    if (!marks || !Array.isArray(marks.players)) return { rows: [], footer: "", empty: NO_MARKS };
    const { players, kitchenItems } = marksBoard(marks, ctx);
    if (!kitchenItems.length) return { rows: [], footer: "", empty: "No kitchen items this week." };
    const withDelta = players.filter((p) => p.prev_resources && p.prev_captured_at);
    const rows = (withDelta.length > 0 ? withDelta : players).slice(0, 50).map((p) => {
      const res = p.resources || {}, prev = p.prev_resources || {};
      const signals = [];
      if ((p.prev_marks != null ? p.marks - p.prev_marks : 0) > 500) signals.push("🟢 MARKS+");
      let burnTotal = 0;
      const burnHtml = kitchenItems.map((ki) => {
        const cur = res[ki.item] || 0, d = prev[ki.item] != null ? cur - prev[ki.item] : null;
        if (d != null && d < -50) signals.push(`🔻 ${ki.item.slice(0, 4)}`);
        else if (d != null && d > 50) signals.push(`🔺 ${ki.item.slice(0, 4)}`);
        burnTotal += d || 0;
        return `<span class="v-mkt-item">${icon(ctx, ki.item)}<span class="${deltaCls(d)}">${deltaStr(d)}</span> <small class="v-dim">${fmtNum(ki.amount > 0 ? Math.floor(cur / ki.amount) : 0)} dlv</small></span>`;
      }).join("");
      return { ...p, me: isMe(p, ctx.farmId), signals, burnHtml, burnTotal };
    });
    return { rows, footer: "", empty: "No players this week." };
  },
};

// ── iPhone glance faces (boards and the ＋ gallery) ──
const corner = (pct, tone) => `<div class="g-corner">${gRing(pct, { tone })}</div>`;
const split = (head, list) => `<div class="g-split"><div>${head}</div>${gRows(list)}</div>`;
const hero = (html) => (html ? `<div class="g-hero">${html}</div>` : "");
const who = (r) => `#${r.rank || "?"} ${r.player_name || r.farm_id}`;
// the first n rows, the viewer's row kept in the last place when it is further down
const withMe = (list, n) => {
  const top = list.slice(0, n), me = list.find((r) => r.me);
  return me && !top.includes(me) ? [...top.slice(0, n - 1), me] : top;
};
const timeLeft = (days) => (days >= 1 ? `${Math.floor(days)}d ${Math.floor((days % 1) * 24)}h` : `${Math.floor(days * 24)}h`);

marksSummary.sizes = ["s", "m"];
marksSummary.size = "s";
marksSummary.glance = ({ marks } = {}, ctx = {}, opts = {}, size = "s") => {
  if (!marks || !Array.isArray(marks.players)) return { empty: NO_MARKS };
  if (!marks.players.length) return { empty: "No players this week." };
  const { me, top, daysLeft } = marksBoard(marks, ctx);
  const pct = me && top.marks > 0 ? (me.marks / top.marks) * 100 : 0;
  if (size === "s") return { html: me
    ? corner(pct, me.rank === 1 ? "ok" : "accent") + big(`#${me.rank}`, { cap: `${compact(me.marks)} marks · ${Math.round(pct)} % of #1 · ${timeLeft(daysLeft)} left` })
    : big(compact(top.marks), { cap: `#1's marks · you are not on the board · ${timeLeft(daysLeft)} left` }) };
  return { html: gTiles([
    me ? { label: "your rank", value: `#${me.rank}`, sub: `of ${marks.players.length}` } : { label: "players", value: String(marks.players.length) },
    me ? { label: "your marks", value: compact(me.marks), sub: `${Math.round(pct)} % of #1` } : { label: "#1 marks", value: compact(top.marks) },
    { label: "time left", value: timeLeft(daysLeft), sub: me && me.multiplier ? `${me.multiplier.toFixed(1)}x multiplier` : "" }]) };
};

marksSources.sizes = ["s", "m", "l"];
marksSources.size = "m";
marksSources.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = marksSources.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const cpm = (r) => (r.costPerMark > 0 ? `${r.costPerMark.toFixed(4)} SFL/mark` : "unpriced");
  if (size === "s") {
    const r = out.rows[0];
    return { html: hero(r.iconHtml) + big(r.nextMarks.toFixed(0), { unit: "marks", cap: `${r.label} · ${cpm(r)}` }) };
  }
  return { html: gRows(out.rows.slice(0, size === "m" ? 3 : 7).map((r) => ({ icon: r.iconHtml, name: r.label, sub: `${cpm(r)} · ${r.hint}`,
    value: r.nextMarks.toFixed(0), tone: r.n === 1 ? "ok" : "" }))) };
};

marksShoppingList.sizes = ["s", "m", "l"];
marksShoppingList.size = "s";
marksShoppingList.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = marksShoppingList.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const sum = (k) => out.rows.reduce((a, r) => a + r[k], 0), buy = sum("buyCost");
  const head = big(compact(Math.round(sum("marks"))), { unit: "marks", cap: `${sum("dlvCount")} deliveries today · ${buy > 0 ? `${buy.toFixed(2)} SFL to buy` : "all from stock"}` });
  if (size === "s") return { html: head };
  const list = out.rows.slice().sort((a, b) => b.marks - a.marks).slice(0, size === "m" ? 3 : 6).map((r) => ({ icon: r.iconHtml, name: r.label,
    sub: r.needUnits > 0 ? `${r.dlvCount}× · buy ${fmtNum(r.needUnits)} units` : `${r.dlvCount}× · from stock`, value: `+${compact(Math.round(r.marks))}`, tone: "ok" }));
  return { html: (size === "l" ? head : "") + gRows(list) };
};

marksLeaderboard.sizes = ["m", "l"];
marksLeaderboard.size = "m";
marksLeaderboard.glance = (data = {}, ctx = {}, opts = {}, size = "m") => {
  const out = marksLeaderboard.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  return { html: gRows(withMe(out.rows, size === "l" ? 7 : 3).map((r) => ({ name: who(r),
    sub: r.delta ? `${deltaStr(r.delta)} since the last snapshot` : r.tier || "", value: compact(r.marks), tone: r.me ? "accent" : "" }))) };
};

marksCostFirst.sizes = ["s", "m"];
marksCostFirst.size = "s";
marksCostFirst.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = marksCostFirst.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const { me, top } = marksBoard(data.marks, ctx);
  const gap = (top.marks || 0) - (me.marks || 0);
  const gained = out.rows.reduce((a, r) => a + r.totalMarks, 0), buy = out.rows.reduce((a, r) => a + r.buyCost, 0);
  const cap = gained >= gap ? `to #1 · ${buy > 0 ? `${buy.toFixed(2)} SFL to buy` : "all from stock"}` : "to #1 · not with the kitchen alone";
  const head = big(compact(Math.ceil(gap)), { unit: "marks", cap });
  if (size === "s") return { html: corner((gained / gap) * 100, gained >= gap ? "ok" : "bad") + head };
  return { html: split(head, out.rows.filter((r) => r.totalDeliveries > 0).sort((a, b) => b.totalMarks - a.totalMarks).slice(0, 3)
    .map((r) => ({ icon: r.iconHtml, name: r.item, sub: `${fmtNum(r.totalDeliveries)} deliveries`,
      value: r.needToBuy > 0 ? `buy ${fmtNum(r.needUnits)}` : "stock", tone: r.needToBuy > 0 ? "bad" : "ok" }))) };
};

marksProjections.sizes = ["s", "m", "l"];
marksProjections.size = "m";
marksProjections.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = marksProjections.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const first = out.rows[0];
  if (size === "s") {
    const me = out.rows.find((r) => r.me);
    return { html: me ? corner(first.projected > 0 ? (me.projected / first.projected) * 100 : 0, me.n === 1 ? "ok" : "accent") +
      big(`#${me.n}`, { cap: `projected · ${compact(me.projected)} marks${me.n > 1 ? ` · #1 ${compact(first.projected)}` : ""}` })
      : big(compact(first.projected), { cap: `#1 projected · ${first.player_name || first.farm_id}` }) };
  }
  return { html: gRows(withMe(out.rows, size === "l" ? 7 : 3).map((r) => ({ name: `#${r.n} ${r.player_name || r.farm_id}`,
    sub: `now ${compact(r.marks)} · +${compact(r.optimal + r.petWk)} possible`, value: compact(r.projected), tone: r.me ? "accent" : "" }))) };
};

marksBurn.sizes = ["m", "l"];
marksBurn.size = "m";
marksBurn.glance = (data = {}, ctx = {}, opts = {}, size = "m") => {
  const out = marksBurn.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const moving = out.rows.filter((r) => r.signals.length).sort((a, b) => b.signals.length - a.signals.length || (a.rank || 999) - (b.rank || 999));
  if (!moving.length) return { empty: "No big moves since the last snapshot." };
  return { html: gRows(moving.slice(0, size === "l" ? 7 : 3).map((r) => ({ name: who(r), sub: r.signals.slice(1).join(" ") || `${deltaStr(r.burnTotal)} kitchen stock`,
    chip: { text: r.signals[0], tone: r.signals[0].startsWith("🔻") ? "bad" : r.signals[0].startsWith("🟢") ? "ok" : "warn" } }))) };
};
