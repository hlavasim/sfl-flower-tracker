// NODES as widgets: what the next resource node earns and costs, the buy plan, the road to 2× T3
// and expand-vs-buy. ONE SOURCE: everything is read from compute?section=ascension (nodeAcq) — what
// a node earns, what the next one costs, the measured efficiency, tier counts, merge gains and the
// expand-vs-buy verdict — so this page cannot disagree with the roadmap and the ascension plan.
// The ordering below (options, the greedy plan, the road) is page-local arithmetic on that answer.
import { bar, pill } from "../ui/viz.mjs";
import { compact } from "../ui/glance.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (ctx, n) => (typeof ctx.icon === "function" && n ? ctx.icon(n) : "");
// node types (Tree, Gold Rock…) have no art under their own name; the page maps them
const nodeIcon = (ctx, n) => (typeof ctx.nodeIcon === "function" ? ctx.nodeIcon(n) : icon(ctx, n));
const fl = (ctx) => (typeof ctx.sfl === "function" ? ctx.sfl() : "FLOWER");
const tiles = (list) => `<div class="v-kpis">` + list.map((k) =>
  `<div class="v-kpi"><b${k.c ? ` style="color:${k.c}"` : ""}${k.t ? ` title="${esc(k.t)}"` : ""}>${k.h}</b><span>${esc(k.l)}</span></div>`).join("") + `</div>`;
const NO_DATA = { rows: [], footer: "", empty: "Could not load the node calculation — every figure comes ready from the API (compute?section=ascension). Try reloading." };
const roiColor = (d) => (d <= 30 ? "var(--c-green)" : d <= 90 ? "var(--c-yellow)" : d <= 365 ? "var(--c-text)" : "var(--c-dim)");
const roiText = (d) => (d >= 9999 ? "9999+" : Math.ceil(d) + "d");
const tone = (v) => (v > 0 ? "var(--c-green)" : v < 0 ? "var(--c-red)" : "var(--c-dim)");
const mergeNodeName = { trees: "Tree", stones: "Stone Rock", iron: "Iron Rock", gold: "Gold Rock" };

function ls(k, d) { try { return (globalThis.localStorage && globalThis.localStorage.getItem(k)) || d; } catch { return d; } }
// section=ascension as the page asks for it (grinx from the ASCENSION settings, the saved recipes)
export const nodesQuery = (farmId) => {
  let st = {};
  try { st = JSON.parse(ls("sfl_ascension_settings", "{}")) || {}; } catch { st = {}; }
  return { res: "computeHist", farm: farmId, section: "ascension", q: { grinx: st.grinx ? 1 : 0, max: 10, recipes: ls("sfl_bumpkin_recipes", "{}") } };
};
const needs = (farmId, opts = {}) => ({ farm: { res: "farm", farm: farmId }, asc: nodesQuery(farmId) });
const acqOf = (asc) => (asc && asc.nodeAcq && asc.nodeAcq.perType ? asc.nodeAcq : null);

// The served escalation rule: the k-th further purchase of this node costs this many sunstones.
const sunAt = (r, k) => r.base + (r.bought + k) * r.inc;
const player = (farm) => {
  const inv = (farm && farm.inventory) || {};
  return { obsidian: parseFloat(inv["Obsidian"]) || 0, sunstones: parseFloat(inv["Sunstone"]) || 0, coins: (farm && farm.coins) || 0 };
};
const sunSfl = (acq) => ((acq.prodCost || {}).Obsidian || 0) * (acq.obsidianPerSunstone || 3);

// The efficiency of a row, from the measurement that already scaled every figure.
export function effCell(acq, d) {
  if (d.effRatio == null) return `<span class="v-dim">—</span>`;
  const pct = Math.round(d.effRatio * 100);
  const color = pct >= 80 ? "var(--c-green)" : pct >= 40 ? "var(--c-yellow)" : "var(--c-red)";
  const e = ((acq.eff && acq.eff.byCat) || {})[d.cat] || null, meta = (acq.eff && acq.eff.meta) || null;
  let tip = d.effMeasured
    ? `Measured: ${e && e.sessions != null ? `${e.sessions} harvests` : "from the history"}${e && e.actualPerDay ? ` · ${e.actualPerDay.toFixed(1)}/day against the theoretical ${(e.theoPerDay || 0).toFixed(1)}` : ""}`
    : "Not measured for this category — your average over the others is used.";
  if (meta && meta.days) tip += ` (window ${meta.days.toFixed(1)} d, ${meta.snaps} snapshots)`;
  return `<span style="color:${color};font-weight:700" title="${esc(tip)}">${pct}%${d.effMeasured ? "" : "~"}</span>`;
}

// The next single action of each kind: buy one more node, or merge to the next tier.
export function nodeOptions(acq, farm) {
  const p = player(farm), options = [];
  for (const [node, d] of Object.entries(acq.perType)) {
    const bu = (d.buy || [])[0];
    if (!bu) continue;
    const canAfford = p.sunstones >= bu.sunstones || p.obsidian >= bu.obsidian;
    options.push({ key: `buy|${node}`, action: `Buy ${node}`, node, cat: d.cat, isMerge: false, costSfl: bu.matSfl, costDetail: `${bu.sunstones} ☀`, sunstoneCost: bu.sunstones,
      theo: d.netPerNode, real: d.profitPerDay, effRatio: d.effRatio, effMeasured: d.effMeasured,
      roiDays: d.profitPerDay > 0 && bu.matSfl > 0 ? bu.matSfl / d.profitPerDay : Infinity,
      canAfford, need: canAfford ? "" : `Need ${Math.max(0, Math.ceil(bu.obsidian - p.obsidian))} more Obsidian`,
      unitName: d.unitName, unpriced: d.unpriced, sellable: d.sellable !== false, unitsPerNode: d.unitsPerNode });
  }
  for (const t of acq.merge || []) {
    const node = mergeNodeName[t.mergeKey] || t.mergeKey;
    for (const x of t.merges) {
      const hasSrc = x.ready, hasObs = p.obsidian >= x.obsidian, hasCoins = p.coins >= x.coins;
      options.push({ key: `merge|${node}|${x.tier}`, action: `Merge ${node} → t${x.tier}`, node, cat: t.cat, isMerge: true, tier: x.tier,
        costSfl: x.matSfl, costDetail: `${x.obsidian} Obs + ${(x.coins / 1000).toFixed(0)}k coins`, obsidian: x.obsidian, coins: x.coins, sunstoneCost: 0,
        // the flat yield bonus is what merging buys; core divides the ratio out for THEO
        theo: x.effRatio > 0 ? x.gainPerDay / x.effRatio : null, real: x.gainPerDay, effRatio: x.effRatio, effMeasured: true,
        roiDays: x.gainPerDay > 0 && x.matSfl > 0 ? x.matSfl / x.gainPerDay : Infinity,
        canAfford: hasSrc && hasObs && hasCoins,
        need: !hasSrc ? `Need ${x.need - x.have} more T${x.tier - 1}` : !hasObs ? `Need ${x.obsidian - Math.floor(p.obsidian)} Obsidian`
          : !hasCoins ? `Need ${(x.coins - p.coins).toLocaleString("en-US")} coins` : "",
        ready: x.ready, sellable: true });
    }
  }
  // ROI is cost / real income — the income already carries the efficiency, no second step.
  return options.sort((a, b) => a.roiDays - b.roiDays);
}

// The greedy save-up order by ROI (not gated by what you can afford today); each simulated
// purchase makes the next of that type dearer. capDays: 365 | 730 | Infinity.
export const PLAN_STEP_CAP = 50;
export function nodePlan(acq, farm, capDays) {
  const plan = [], planned = {};
  const perSun = sunSfl(acq);
  let capped = false;
  for (let step = 0; step < PLAN_STEP_CAP; step++) {
    let best = null;
    for (const [node, d] of Object.entries(acq.perType)) {
      if (!(d.profitPerDay > 0) || !d.buyRule) continue;
      const sun = sunAt(d.buyRule, planned[node] || 0), costSfl = sun * perSun;
      if (!(costSfl > 0)) continue;
      const roi = costSfl / d.profitPerDay;
      if (!best || roi < best.roi) best = { node, d, sun, costSfl, roi };
    }
    if (!best || best.roi > capDays) break;
    // a safety cap, not an answer — when it is what stopped the plan, the widget says so
    if (step === PLAN_STEP_CAP - 1) capped = true;
    planned[best.node] = (planned[best.node] || 0) + 1;
    plan.push({ label: `Buy ${best.node}`, node: best.node, cat: best.d.cat, isMerge: false, sunstoneCost: best.sun, costSfl: best.costSfl,
      theo: best.d.netPerNode, real: best.d.profitPerDay, effRatio: best.d.effRatio, effMeasured: best.d.effMeasured, roi: best.roi });
  }
  // merges are one-shot; the structural prereq (four of the lower tier) gates them
  for (const o of nodeOptions(acq, farm).filter((o) => o.isMerge && o.ready && o.real > 0 && isFinite(o.roiDays))) {
    plan.push({ label: o.action, node: o.node, cat: o.cat, isMerge: true, sunstoneCost: 0, costSfl: o.costSfl, costDetail: o.costDetail, obsidian: o.obsidian, coins: o.coins,
      theo: o.theo, real: o.real, effRatio: o.effRatio, effMeasured: o.effMeasured, roi: o.roiDays });
  }
  plan.sort((a, b) => a.roi - b.roi);
  while (plan.length && plan[plan.length - 1].roi > capDays) plan.pop();
  let cost = 0, real = 0, theo = 0;
  plan.forEach((p, i) => { cost += p.costSfl; real += p.real; theo += p.theo == null ? p.real : p.theo; p.cumCost = cost; p.cumReal = real; p.step = i + 1; });
  return { plan, capped, cost, real, theo };
}

// What is still missing to have 2 T3 nodes of every mergeable type.
export function nodeRoad(acq, target = 2) {
  const rows = [], tot = { sfl: 0, sunstones: 0, obsidian: 0, coins: 0 };
  const perSun = sunSfl(acq);
  for (const t of acq.merge || []) {
    const node = mergeNodeName[t.mergeKey], d = acq.perType[node];
    if (!d || !d.buyRule) continue;
    const m2 = t.merges.find((x) => x.tier === 2), m3 = t.merges.find((x) => x.tier === 3);
    if (!m2 || !m3) continue;
    const tiers = t.tiers;
    const t3 = Math.max(0, target - tiers.t3), t2 = Math.max(0, 4 * t3 - tiers.t2), t1 = Math.max(0, 4 * t2 - tiers.t1);
    let sunstones = 0;
    for (let i = 0; i < t1; i++) sunstones += sunAt(d.buyRule, i);
    const buyCostSfl = sunstones * perSun;
    const r = { label: node, current: tiers, t1ToBuy: t1, sunstones, buyCostSfl,
      t2ToCreate: t2, t2MergeObs: t2 * m2.obsidian, t2MergeCoins: t2 * m2.coins,
      t3ToMake: t3, t3MergeObs: t3 * m3.obsidian, t3MergeCoins: t3 * m3.coins,
      totalSfl: buyCostSfl + t2 * (m2.matSfl || 0) + t3 * (m3.matSfl || 0) };
    r.done = !t3 && !t2 && !t1;
    tot.sfl += r.totalSfl; tot.sunstones += sunstones; tot.obsidian += r.t2MergeObs + r.t3MergeObs; tot.coins += r.t2MergeCoins + r.t3MergeCoins;
    rows.push(r);
  }
  return { rows, tot };
}

// ── 🪨 Nodes – where you stand ───────────────────────────────────────────────────────────────────
export const nodesSummary = {
  type: "nodes-summary",
  title: "🪨 Nodes – where you stand",
  page: "nodes",
  needs,
  view({ farm, asc } = {}, ctx = {}) {
    const acq = acqOf(asc);
    if (!acq || !farm) return { empty: NO_DATA.empty };
    const p = player(farm), obsSfl = (acq.prodCost || {}).Obsidian || 0, per = acq.obsidianPerSunstone || 3;
    const meta = (acq.eff && acq.eff.meta) || null;
    const isl = ((farm.island && farm.island.type) || "basic").toLowerCase();
    return { html: tiles([
      { h: `${sunSfl(acq).toFixed(4)} ${fl(ctx)}`, l: "a sunstone costs", c: "var(--c-yellow)", t: `${per} obsidian per sunstone, obsidian at its production cost ${obsSfl.toFixed(3)} FLOWER` },
      { h: `${Math.floor(p.obsidian)} ${icon(ctx, "Obsidian")}`, l: "obsidian" },
      { h: `${Math.floor(p.sunstones)} ${icon(ctx, "Sunstone")}`, l: "sunstones" },
      { h: `${p.coins.toLocaleString("en-US")}`, l: "coins" },
      { h: esc(isl.charAt(0).toUpperCase() + isl.slice(1)), l: "island" },
      { h: meta && meta.snaps ? `${(meta.days || 0).toFixed(1)}d · ${meta.snaps}` : "none", l: meta && meta.snaps ? "efficiency window · snapshots" : "no history for efficiency",
        c: meta && meta.available ? "var(--c-green)" : "var(--c-dim)" },
    ]) };
  },
};

const actionName = (ctx, r) => `<div class="v-name">${nodeIcon(ctx, r.node)}<div><b>${esc(r.label || r.action)}</b>${r.needHtml || ""}</div></div>`;
const costCell = (ctx, r) => (r.isMerge
  ? `${r.obsidian != null ? `${r.obsidian} ${icon(ctx, "Obsidian")}+ ${(r.coins / 1000).toFixed(0)}k ${icon(ctx, "Coins")}` : esc(r.costDetail)}`
  : `${r.sunstoneCost} ${icon(ctx, "Sunstone")}`);

// ── 📋 Recommended purchase plan ────────────────────────────────────────────────────────────────
const CAPS = [["1y", "1 year"], ["2y", "2 years"], ["all", "no cap"]];
const capDays = (v) => (v === "1y" ? 365 : v === "all" ? Infinity : 730);
export const nodesPlan = {
  type: "nodes-plan",
  title: "📋 Recommended purchase plan",
  titleFor: (o) => (o.cap === "all" ? "📋 Node plan – any ROI" : `📋 Node plan – ROI ≤ ${o.cap === "1y" ? "1 year" : "2 years"}`),
  page: "nodes",
  needs,
  optionsLabel: "Plan",
  options: [{ key: "cap", label: "ROI cap", kind: "select", choices: CAPS }],
  defaults: { opts: { cap: "2y" } },
  rowKey: (r) => `${r.step}|${r.label}`,
  rowLabel: (r) => `${r.step}. ${r.label}`,
  columns: [
    { key: "step", label: "#", align: "right", fmt: (v) => `<span class="v-dim">${v}</span>` },
    { key: "label", label: "buy", fmt: (v, r) => actionName(r.ctx, r) },
    { key: "costSfl", label: "cost", align: "right", fmt: (v, r) => costCell(r.ctx, r) },
    { key: "theo", label: "theo /d", align: "right", title: "Without the efficiency correction — the theoretical ceiling with non-stop harvesting", fmt: (v) => (v == null ? "—" : `<span class="v-dim">+${v.toFixed(4)}</span>`) },
    { key: "effRatio", label: "eff", align: "right", fmt: (v, r) => effCell(r.acq, r) },
    { key: "real", label: "real /d", align: "right", title: "What you really earn at your measured harvest cadence. ROI divides by this.", fmt: (v) => `<b style="color:var(--c-green)">+${v.toFixed(4)}</b>` },
    { key: "roi", label: "ROI", align: "right", fmt: (v) => `<b style="color:${roiColor(v)}">${roiText(v)}</b>` },
    { key: "cumReal", label: "cum real /d", align: "right", title: "The cumulative REAL after this step", fmt: (v) => `<span style="color:var(--c-yellow)">+${v.toFixed(4)}</span>` },
    { key: "cumCost", label: "cum cost", align: "right", extra: true, fmt: (v, r) => `${v.toFixed(1)} ${fl(r.ctx)}` },
  ],
  // ctx: { icon, nodeIcon, sfl }
  build({ farm, asc } = {}, ctx = {}, opts = {}) {
    const acq = acqOf(asc);
    if (!acq) return NO_DATA;
    const cap = opts.cap === "1y" || opts.cap === "all" ? opts.cap : "2y";
    const r = nodePlan(acq, farm, capDays(cap));
    const F = fl(ctx);
    const rows = r.plan.map((p) => ({ ...p, ctx, acq }));
    const summary = rows.length ? tiles([{ h: String(rows.length), l: "purchases" }, { h: `${r.cost.toFixed(1)} ${F}`, l: "invested", c: "var(--c-yellow)" },
      { h: `+${r.real.toFixed(4)} ${F}`, l: "a day, realistic", c: "var(--c-green)" }, { h: `+${r.theo.toFixed(2)} ${F}`, l: "a day, theoretical" }]) : "";
    const footer = `<div class="v-dim">Greedy order by ROI, capped at ${cap === "1y" ? "1 year" : cap === "all" ? "no limit" : "2 years"}. Not limited by what you can afford now — the plan says what to save for.</div>` +
      (r.capped ? `<div style="color:var(--c-yellow)">⚠ The list stops at ${PLAN_STEP_CAP} purchases — at this ROI cap it would go on. That is not “nothing more pays”, only this table's limit.</div>` : "");
    return { rows, summary, footer, empty: "Nothing pays back within this ROI cap." };
  },
};

// ── 🧮 All options (the next node of each kind) ──────────────────────────────────────────────────
const unitsCell = (o) => (!o.sellable ? `<span class="v-dim">${(o.unitsPerNode || 0).toFixed(2)} ${esc(o.unitName || "units")}/day</span>`
  : o.unpriced ? `<span style="color:var(--c-yellow)">${(o.unitsPerNode || 0).toFixed(2)} ${esc(o.unitName || "units")}/day ⚠</span>` : null);
export const nodesOptions = {
  type: "nodes-options",
  title: "🧮 All options (next node only)",
  titleFor: (o) => (o.which === "unprofitable" ? "🚫 Unprofitable nodes" : o.which === "all" ? "🧮 Every node option" : "🧮 All options (next node only)"),
  page: "nodes",
  needs,
  optionsLabel: "Options",
  options: [{ key: "which", label: "Show", kind: "select", choices: [["profitable", "profitable"], ["unprofitable", "unprofitable"], ["all", "all"]] }],
  defaults: { opts: { which: "profitable" } },
  rowKey: (r) => r.key,
  rowLabel: (r) => r.action,
  rowClass: (r) => (r.canAfford ? "" : "w-st-done"),
  columns: [
    { key: "action", label: "action", fmt: (v, r) => actionName(r.ctx, r) },
    { key: "costSfl", label: "cost", align: "right", fmt: (v, r) => (v == null ? "?" : `${v.toFixed(1)} ${fl(r.ctx)}`) },
    { key: "theo", label: "theo /d", align: "right", title: "Without the efficiency correction", fmt: (v) => (v == null ? "—" : `<span class="v-dim">+${v.toFixed(4)}</span>`) },
    { key: "effRatio", label: "eff", align: "right", fmt: (v, r) => effCell(r.acq, r) },
    { key: "real", label: "real /d", align: "right", title: "Theoretical × efficiency — ROI divides by this",
      fmt: (v, r) => unitsCell(r) || (v > 0 ? `<b style="color:var(--c-green)">+${v.toFixed(4)}</b>` : `<span style="color:var(--c-red)">${(v || 0).toFixed(4)}</span>`) },
    { key: "roiDays", label: "ROI", align: "right", fmt: (v, r) => (r.real > 0 ? `<b style="color:${roiColor(v)}">${roiText(v)}</b>` : "") },
  ],
  build({ farm, asc } = {}, ctx = {}, opts = {}) {
    const acq = acqOf(asc);
    if (!acq) return NO_DATA;
    const all = nodeOptions(acq, farm).map((o) => ({ ...o, ctx, acq,
      needHtml: !o.canAfford && o.need ? `<small>${esc(o.need)}</small>` : o.isMerge ? `<small>${esc(o.costDetail)}</small>` : "" }));
    const which = opts.which || "profitable";
    const rows = which === "all" ? all : all.filter((o) => (which === "unprofitable" ? !(o.real > 0) : o.real > 0));
    const footer = which === "profitable" ? `<div class="v-dim">Faded = you cannot afford it yet.</div>`
      : `<div class="v-dim">Nothing is clamped to zero and nothing is hidden: a minus means the node uses up more (tools, seeds) than it sells for. For resources with no price in the p2p feed you see units a day instead of FLOWER — it produces, we just cannot convert it.</div>`;
    return { rows, footer, empty: which === "unprofitable" ? "No unprofitable options." : "No profitable options." };
  },
};

// ── 🛤️ Road to 2× T3 of each ────────────────────────────────────────────────────────────────────
export const nodesRoad = {
  type: "nodes-road",
  title: "🛤️ Road to 2× T3 of each",
  page: "nodes",
  needs,
  defaults: {},
  rowKey: (r) => r.label,
  rowLabel: (r) => r.label,
  rowClass: (r) => (r.done ? "w-st-ready" : ""),
  columns: [
    { key: "label", label: "resource", fmt: (v, r) => `<div class="v-name">${nodeIcon(r.ctx, v)}<div><b>${esc(v)}</b><small>T1/T2/T3 ${r.current.t1}/${r.current.t2}/${r.current.t3}</small></div></div>` },
    { key: "progress", label: "T3", get: (r) => Math.min(100, (r.current.t3 / 2) * 100), fmt: (v) => bar(v) },
    { key: "t1ToBuy", label: "buy T1", align: "right", fmt: (v, r) => (r.done ? "" : v > 0 ? `<b style="color:var(--c-yellow)">${v}×</b> <span class="v-dim">(${r.sunstones} ${icon(r.ctx, "Sunstone")}· ${r.buyCostSfl.toFixed(1)} ${fl(r.ctx)})</span>` : `<span class="v-dim">—</span>`) },
    { key: "t2ToCreate", label: "merge → T2", align: "right", fmt: (v, r) => (r.done ? "" : v > 0 ? `<b style="color:var(--c-yellow)">${v}×</b> <span class="v-dim">(${r.t2MergeObs} ${icon(r.ctx, "Obsidian")}+ ${(r.t2MergeCoins / 1000).toFixed(0)}k ${icon(r.ctx, "Coins")})</span>` : `<span class="v-dim">—</span>`) },
    { key: "t3ToMake", label: "merge → T3", align: "right", fmt: (v, r) => (r.done ? "" : v > 0 ? `<b style="color:var(--c-yellow)">${v}×</b> <span class="v-dim">(${r.t3MergeObs} ${icon(r.ctx, "Obsidian")}+ ${(r.t3MergeCoins / 1000).toFixed(0)}k ${icon(r.ctx, "Coins")})</span>` : `<span class="v-dim">—</span>`) },
    { key: "totalSfl", label: "FLOWER total", align: "right", fmt: (v, r) => (r.done ? pill("DONE", "ok") : `<b style="color:var(--c-yellow)">${v.toFixed(1)}</b> ${fl(r.ctx)}`) },
  ],
  build({ asc } = {}, ctx = {}) {
    const acq = acqOf(asc);
    if (!acq) return NO_DATA;
    const { rows, tot } = nodeRoad(acq);
    const F = fl(ctx);
    const summary = tiles([{ h: `${tot.sfl.toFixed(1)} ${F}`, l: "in total", c: "var(--c-yellow)" }, { h: `${tot.sunstones} ${icon(ctx, "Sunstone")}`, l: "sunstones" },
      { h: `${tot.obsidian} ${icon(ctx, "Obsidian")}`, l: "obsidian for merges" }, { h: `${(tot.coins / 1000).toFixed(0)}k ${icon(ctx, "Coins")}`, l: "coins for merges" }]);
    return { rows: rows.map((r) => ({ ...r, ctx })), summary,
      footer: `<div class="v-dim">What is still missing to have 2 T3 nodes of every mergeable type. The buy price rises with every node bought, so “buy T1” already includes that escalation.</div>`, empty: "No mergeable nodes." };
  },
};

// ── 🗺️ Current nodes ────────────────────────────────────────────────────────────────────────────
export const nodesCurrent = {
  type: "nodes-current",
  title: "🗺️ Current nodes",
  page: "nodes",
  needs,
  defaults: {},
  rowKey: (r) => r.node,
  rowLabel: (r) => r.node,
  columns: [
    { key: "node", label: "resource", fmt: (v, r) => `<div class="v-name">${nodeIcon(r.ctx, v)}<div><b>${esc(v)}</b>${r.unitName ? `<small>${icon(r.ctx, r.unitName)}${esc(r.unitName)}</small>` : ""}</div></div>` },
    { key: "effective", label: "nodes", align: "right", title: "Effective count — a T2 counts as 4 nodes, a T3 as 16",
      fmt: (v, r) => `${v}${r.bought > 0 ? ` <span style="color:var(--c-yellow)" title="bought with sunstones">+${r.bought}</span>` : ""}` },
    { key: "tiers", label: "tiers", align: "right", get: (r) => r.t2 + r.t3, fmt: (v, r) => (r.t2 || r.t3 ? `<span class="v-dim">${r.t1}/${r.t2}/${r.t3}</span>` : "") },
    { key: "totalNet", label: "net /day", align: "right", fmt: (v, r) => (r.units ? `<span class="v-dim">${r.units.total}</span>` : `<b style="color:${tone(v)}">${v.toFixed(2)}</b>`) },
    { key: "netPerNode", label: "per node", align: "right", fmt: (v, r) => (r.units ? `<span class="v-dim">${r.units.per}</span>` : `<span style="color:${tone(v)}">${v.toFixed(4)}</span>`) },
    { key: "effRatio", label: "eff", align: "right", fmt: (v, r) => effCell(r.acq, r) },
    { key: "realTotal", label: "real /d", align: "right", fmt: (v, r) => (r.units ? `<span class="v-dim">${r.units.real}</span>` : `<b style="color:${tone(v)}">${v.toFixed(2)}</b>`) },
  ],
  build({ asc } = {}, ctx = {}) {
    const acq = acqOf(asc);
    if (!acq) return NO_DATA;
    const rows = Object.entries(acq.perType).map(([node, d]) => {
      const t = d.tiers || { t1: 0, t2: 0, t3: 0, effective: 0 };
      /*
       * Oil, obsidian and flowers have no FLOWER figure — the first two cannot be sold and no flower
       * has a price in the p2p feed — so a plain 0.00 would read as worthless. Units instead, with ⚠
       * where the resource DOES sell and only the price is missing.
       */
      const u = d.unitName || "units";
      const units = !d.sellable || d.unpriced ? {
        per: `${(d.unitsPerNode || 0).toFixed(2)}${d.unpriced ? " ⚠" : ""}`,
        total: `${((d.unitsPerNode || 0) * t.effective / (d.effRatio || 1)).toFixed(1)} ${esc(u)}/d`,
        real: `${((d.unitsPerNode || 0) * t.effective).toFixed(1)} ${esc(u)}/d`,
      } : null;
      return { node, cat: d.cat, effective: t.effective, t1: t.t1, t2: t.t2, t3: t.t3, bought: d.bought || 0, unitName: d.unitName, units,
        totalNet: d.netPerNode * t.effective, netPerNode: d.netPerNode, realTotal: d.profitPerDay * t.effective,
        effRatio: d.effRatio, effMeasured: d.effMeasured, ctx, acq };
    });
    return { rows, footer: "", empty: "No nodes." };
  },
};

// ── 🌱 New node: expand vs buy ──────────────────────────────────────────────────────────────────
const kf = (v) => (v == null ? "—" : Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1));
const eta = (d) => (d == null ? "?" : d < 1 ? (d * 24).toFixed(0) + "h" : d < 100 ? d.toFixed(1) + "d" : d.toFixed(0) + "d");
const WIN = "var(--c-green)";
export const nodesAcq = {
  type: "nodes-acq",
  title: "🌱 New node: expand vs buy",
  page: "nodes",
  needs,
  defaults: {},
  rowKey: (r) => r.node,
  rowLabel: (r) => r.node,
  columns: [
    { key: "node", label: "node", fmt: (v, r) => `<div class="v-name">${nodeIcon(r.ctx, v)}<div><b>${esc(v)}</b><small>you have ${r.d.currentCount}</small></div></div>` },
    { key: "profit", label: "net profit /day", align: "right", get: (r) => r.d.profitPerDay,
      title: "One node's yield after production costs (seeds, tools), times your measured efficiency (~ = not measured, your average used).", fmt: (v, r) => r.profitHtml },
    { key: "exObs", label: "expand (obsidian)", align: "right", title: "The gate. The whole expansion — what you pay when you want just this node; the ✓ is decided on this.", fmt: (v, r) => r.exObsHtml },
    { key: "buObs", label: "buy (obsidian)", align: "right", fmt: (v, r) => r.buObsHtml },
    { key: "exMat", label: "expand (material)", align: "right", fmt: (v, r) => r.exMatHtml },
    { key: "buMat", label: "buy (material)", align: "right", fmt: (v, r) => r.buMatHtml },
    { key: "shareObs", label: "expand per node", align: "right", extra: true, title: "The same price split over every node the expansion gives — true only if you use them all.", fmt: (v, r) => r.shareHtml },
    { key: "verdict", label: "verdict", fmt: (v, r) => `<span style="color:${r.vcol}">${esc(v)}</span>` },
  ],
  build({ asc } = {}, ctx = {}) {
    const acq = acqOf(asc);
    if (!acq) return NO_DATA;
    const F = fl(ctx), OBS = icon(ctx, "Obsidian"), per = acq.obsidianPerSunstone || 3;
    const rows = Object.entries(acq.perType).map(([node, d]) => {
      const ex = d.expand && d.expand[0], bu = d.buy && d.buy[0];
      // the verdict is DECIDED in core (nodeAcq.perType[].verdict) and only read here
      const v = d.verdict || {};
      const { exObs = null, buObs = null, obsWin, matWin = null, buMat = null } = v;
      const mark = (side, who) => (side === who ? `<span style="color:${WIN}">✓</span> ` : "");
      const st = (side, who) => (side === who ? ` style="color:${WIN};font-weight:700"` : "");
      const exTip = ex ? `${ex.label}${ex.bundle > 1 ? ` — gives ${ex.bundle} nodes` : ""}${ex.farmEtaDays == null ? "" : ex.farmEtaDays > 0 ? `, you farm the material in ${eta(ex.farmEtaDays)}` : ", you already have the material"}` : "";
      const buTip = bu ? `${bu.sunstones} sunstone × ${per} obsidian = ${bu.obsidian} obsidian` : "";
      let verdict, vcol = "var(--c-dim)";
      if (!ex) verdict = "buy only (no expansion in the plan)";
      else if (obsWin === matWin) {
        verdict = `${obsWin === "expand" ? "EXPAND" : "BUY"}${v.obsSaved > 0 ? ` — ${kf(v.obsSaved)} obsidian less` : ""}`;
        vcol = WIN;
      } else verdict = `${obsWin === "expand" ? "EXPAND" : "BUY"} (less obsidian), but ${matWin === "expand" ? "expanding" : "buying"} is cheaper in material`;
      const unit = esc(d.unitName || "units");
      const profitHtml = (d.sellable === false
        ? `<span title="${esc(`${d.unitName || "This resource"} cannot be sold (neither P2P nor for coins), so FLOWER/day would be a made-up number. The yield is in units a day.`)}">${d.unitsPerNode.toFixed(2)} ${unit}/day</span>`
        : d.unpriced ? `<span style="color:var(--c-yellow)" title="${esc(`${d.unitName || "This resource"} DOES sell, but has no price in sfl.world's p2p feed. The node produces, we just cannot turn it into FLOWER.`)}">${d.unitsPerNode.toFixed(2)} ${unit}/day ⚠</span>`
        : `${d.profitPerDay.toFixed(2)} ${F}`) + (d.effRatio != null ? ` <span class="v-dim">×${d.effRatio.toFixed(2)}${d.effMeasured ? "" : "~"}</span>` : "");
      return { node, d, ctx, verdict, vcol, profitHtml, exObs, buObs,
        exObsHtml: ex ? `<span${st("expand", obsWin)} title="${esc(exTip)}">${mark("expand", obsWin)}${exObs > 0 ? `${kf(exObs)} ${OBS}<span class="v-dim">(${eta(ex.totalObsidianDays)})</span>` : `0 ${OBS}`}</span>` : "—",
        buObsHtml: bu ? `<span${st("buy", obsWin)} title="${esc(buTip)}">${mark("buy", obsWin)}${buObs} ${OBS}<span class="v-dim">(${eta(bu.obsidianDays)})</span></span>` : "—",
        exMat: ex ? ex.totalMatSfl : null, buMat,
        exMatHtml: ex ? `<span${st("expand", matWin)} title="${esc(exTip)}">${mark("expand", matWin)}${kf(ex.totalMatSfl)}${ex.totalMatUnpriced ? "≥" : ""} ${F}</span>` : "—",
        buMatHtml: buMat != null ? `<span${st("buy", matWin)} title="${esc(buTip)}">${mark("buy", matWin)}${kf(buMat)} ${F}</span>` : "?",
        shareObs: ex ? ex.obsidian : null,
        shareHtml: ex ? `<span class="v-dim">${ex.obsidian > 0 ? kf(ex.obsidian) : "0"} ${OBS} · ${kf(ex.matSfl)}${ex.matUnpriced ? "≥" : ""} ${F}</span>` : "—" };
    });
    const pc = acq.prodCost || {};
    const prodNote = [pc.Obsidian > 0 ? `obsidian ${pc.Obsidian.toFixed(2)}` : null, pc.Oil > 0 ? `oil ${pc.Oil.toFixed(3)}` : null].filter(Boolean).join(" · ");
    const footer = `<div class="v-dim"><b>Obsidian is the gate:</b> buying a node is paid in sunstone, and a sunstone costs ${per} obsidian, so buying is all obsidian; an expansion needs it only sometimes. ` +
      `In brackets the time at your ${acq.obsidianPerDay ? acq.obsidianPerDay.toFixed(1) : "0"} obsidian/day. ` +
      `<b>Material</b>: what can be bought at its purchase price; obsidian and oil (which cannot be bought) at their PRODUCTION cost${prodNote ? ` — ${prodNote} FLOWER each` : ""}.</div>`;
    return { rows, footer, empty: "No node types." };
  },
};

export const NODES_WIDGETS = [nodesSummary, nodesPlan, nodesOptions, nodesRoad, nodesCurrent, nodesAcq];

// ── iPhone glance models: ui/glance-templates offers the looks ──
const gFl = (v) => (Math.abs(v) >= 10 ? compact(v) : (v || 0).toFixed(2));
const roiTone = (d) => (d <= 30 ? "ok" : d <= 90 ? "warn" : "");
const share = (v, max) => (max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0);

// obsidian in hand (the gate for every node), and how far the stock goes toward the cheapest next node
nodesSummary.look = "number";
nodesSummary.glanceModel = ({ farm, asc } = {}, ctx = {}) => {
  const acq = acqOf(asc);
  if (!acq || !farm) return { empty: NO_DATA.empty };
  const p = player(farm), sun = sunSfl(acq);
  const buys = Object.values(acq.perType).map((d) => (d.buy || [])[0]).filter(Boolean);
  const minObs = buys.length ? Math.min(...buys.map((b) => b.obsidian)) : 0, minSun = buys.length ? Math.min(...buys.map((b) => b.sunstones)) : 0;
  const isl = ((farm.island && farm.island.type) || "basic").toLowerCase();
  return {
    head: { value: Math.floor(p.obsidian), unit: " obs", hero: icon(ctx, "Obsidian"), cap: `obsidian · ${Math.floor(p.sunstones)} sunstones`,
      ...(minObs > 0 ? { meter: share(p.obsidian, minObs), meterTone: p.obsidian >= minObs ? "ok" : "accent" } : {}) },
    items: [
      { icon: icon(ctx, "Obsidian"), name: "Obsidian", sub: minObs ? `${minObs} buy a node` : "", value: Math.floor(p.obsidian), ...(minObs ? { pct: share(p.obsidian, minObs) } : {}) },
      { icon: icon(ctx, "Sunstone"), name: "Sunstones", sub: minSun ? `${minSun} buy a node` : "", value: Math.floor(p.sunstones), ...(minSun ? { pct: share(p.sunstones, minSun) } : {}) },
      { icon: icon(ctx, "Sunstone"), name: "A sunstone", sub: `${acq.obsidianPerSunstone || 3} obsidian`, value: sun.toFixed(2), tone: "warn" },
      { icon: icon(ctx, "Coins"), name: "Coins", value: compact(p.coins) },
      { icon: "🏝️", name: "Island", value: isl.charAt(0).toUpperCase() + isl.slice(1) },
    ],
    tiles: [{ label: "obsidian", value: Math.floor(p.obsidian) }, { label: "sunstones", value: Math.floor(p.sunstones) },
      { label: "a sunstone", value: sun.toFixed(2) }, { label: "coins", value: compact(p.coins) }],
  };
};

// the next buy and its payback; the plan's steps; the income as the plan buys its way up
nodesPlan.look = "overview-4";
nodesPlan.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = nodesPlan.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const r = out.rows[0], last = out.rows[out.rows.length - 1];
  const maxReal = Math.max(...out.rows.map((x) => x.real));
  return {
    head: { value: roiText(r.roi), tone: roiTone(r.roi), hero: nodeIcon(ctx, r.node), cap: `next: ${r.label}` },
    items: out.rows.map((x) => ({ icon: nodeIcon(ctx, x.node), name: x.label,
      sub: `${x.isMerge ? `${x.obsidian} obs + ${compact(x.coins)} coins` : `${x.sunstoneCost} sunstones`} · +${x.real.toFixed(3)}/d`,
      value: roiText(x.roi), tone: roiTone(x.roi), pct: share(x.real, maxReal) })),
    tiles: [{ label: "buys", value: out.rows.length }, { label: "invested", value: gFl(last.cumCost) },
      { label: "real/day", value: `+${last.cumReal.toFixed(2)}` }, { label: "first ROI", value: roiText(r.roi) }],
    series: [0, ...out.rows.map((x) => x.cumReal)],
    foot: `${out.rows.length} buys · +${last.cumReal.toFixed(2)} FLOWER/d for ${gFl(last.cumCost)}`,
  };
};

// the best option by payback; every option, what is missing when you cannot afford it yet
nodesOptions.look = "list-4";
nodesOptions.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = nodesOptions.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const o = out.rows[0], afford = out.rows.filter((x) => x.canAfford).length;
  const maxReal = Math.max(0, ...out.rows.map((x) => x.real || 0));
  return {
    head: { value: o.real > 0 ? roiText(o.roiDays) : (o.real || 0).toFixed(3), tone: o.real > 0 ? roiTone(o.roiDays) : "bad", hero: nodeIcon(ctx, o.node),
      cap: `${o.action}${o.canAfford ? "" : " · can't afford yet"}`, ring: (afford / out.rows.length) * 100, ringTone: afford ? "ok" : "warn" },
    items: out.rows.map((x) => ({ icon: nodeIcon(ctx, x.node), name: x.action,
      sub: x.canAfford ? `${x.costSfl == null ? "?" : gFl(x.costSfl)} FLOWER · +${(x.real || 0).toFixed(3)}/d` : x.need,
      ...(x.real > 0 ? { value: roiText(x.roiDays), tone: x.canAfford ? roiTone(x.roiDays) : "" } : { value: (x.real || 0).toFixed(3), tone: "bad" }),
      ...(maxReal > 0 ? { pct: share(x.real || 0, maxReal) } : {}) })),
    tiles: [{ label: "options", value: out.rows.length }, { label: "affordable", value: afford },
      { label: "best ROI", value: o.real > 0 ? roiText(o.roiDays) : "—" }],
  };
};

// what the road to 2× T3 still costs; each type's progress in T1-equivalent (a T3 = 16, 2× T3 = 32)
nodesRoad.look = "number";
nodesRoad.glanceModel = ({ asc } = {}, ctx = {}) => {
  const acq = acqOf(asc);
  if (!acq) return { empty: NO_DATA.empty };
  const { rows, tot } = nodeRoad(acq);
  if (!rows.length) return { empty: "No mergeable nodes." };
  const pct = (rows.reduce((a, r) => a + Math.min(2, r.current.t3), 0) / (2 * rows.length)) * 100;
  const done = rows.filter((r) => r.done).length, all = done === rows.length;
  const eq = (c) => c.t1 + 4 * c.t2 + 16 * c.t3;
  return {
    head: { value: all ? "Done" : gFl(tot.sfl), tone: all ? "ok" : "", ring: pct, ringTone: pct >= 100 ? "ok" : "accent",
      cap: all ? "2× T3 of every type" : `FLOWER to 2× T3 · ${done}/${rows.length} done` },
    // the types still on the road first, the done ones last
    items: rows.slice().sort((a, b) => a.done - b.done).map((r) => ({ icon: nodeIcon(ctx, r.label), name: r.label, sub: `T1 ${r.current.t1} · T2 ${r.current.t2} · T3 ${r.current.t3}`,
      ...(r.done ? { chip: { text: "DONE", tone: "ok" } } : { value: gFl(r.totalSfl) }), pct: r.done ? 100 : share(eq(r.current), 32) })),
    tiles: [{ label: "FLOWER", value: gFl(tot.sfl) }, { label: "sunstones", value: compact(tot.sunstones) },
      { label: "obsidian", value: compact(tot.obsidian) }, { label: "coins", value: compact(tot.coins) }],
    foot: `${done}/${rows.length} types at 2× T3`,
  };
};

// what the nodes earn a day; the biggest earners first, the unit-only ones (oil, obsidian…) after them
nodesCurrent.look = "overview-4";
nodesCurrent.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = nodesCurrent.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const priced = out.rows.filter((r) => !r.units);
  const real = priced.reduce((a, r) => a + r.realTotal, 0), theo = priced.reduce((a, r) => a + r.totalNet, 0);
  const n = out.rows.reduce((a, r) => a + (r.effective || 0), 0);
  const key = (r) => (r.units ? -Infinity : r.realTotal);
  const top = out.rows.filter((r) => r.effective > 0).sort((a, b) => (key(b) > key(a) ? 1 : key(b) < key(a) ? -1 : 0));
  const maxReal = Math.max(0, ...priced.map((r) => r.realTotal));
  return {
    head: { value: gFl(real), unit: "/d", tone: real < 0 ? "bad" : "", cap: `FLOWER, real · ${n} nodes` },
    items: top.map((r) => ({ icon: nodeIcon(ctx, r.node), name: r.node, sub: `${r.effective} nodes`,
      value: r.units ? r.units.real : r.realTotal.toFixed(2), tone: r.units ? "" : r.realTotal < 0 ? "bad" : "ok",
      ...(!r.units && maxReal > 0 ? { pct: share(r.realTotal, maxReal) } : {}) })),
    tiles: [{ label: "real /d", value: gFl(real) }, { label: "theo /d", value: gFl(theo) }, { label: "nodes", value: n }, { label: "types", value: top.length }],
  };
};

// for how many types expanding beats buying; the served verdict per type
nodesAcq.look = "list-4";
nodesAcq.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = nodesAcq.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const word = (r) => (!(r.d.expand && r.d.expand[0]) ? "BUY ONLY" : (r.d.verdict || {}).obsWin === "expand" ? "EXPAND" : "BUY");
  const count = (w) => out.rows.filter((r) => word(r) === w).length;
  const exp = count("EXPAND");
  return {
    head: { value: exp, unit: `/${out.rows.length}`, tone: exp ? "ok" : "", ring: (exp / out.rows.length) * 100, cap: "types where expanding beats buying" },
    items: out.rows.map((r) => { const w = word(r);
      return { icon: nodeIcon(ctx, r.node), name: r.node, sub: `you have ${r.d.currentCount}`, chip: { text: w, tone: w === "EXPAND" ? "ok" : w === "BUY" ? "info" : "" } }; }),
    tiles: [{ label: "expand", value: exp }, { label: "buy", value: count("BUY") }, { label: "buy only", value: count("BUY ONLY") }],
  };
};
