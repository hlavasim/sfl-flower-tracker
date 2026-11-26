// WORLD distributions as table widgets: how many farms sit in each bucket (island type, skill
// points, expansion slot, buyable nodes, ascension / ban / verified), the share, a coloured bar, and
// the viewer's own bucket highlighted with its rank ("YOU (top x% · #rank)", the way the old charts
// tagged it). Data: the cached world aggregates (store "worldAgg", "worldNodes") and the viewer's row
// ("worldMe"). Every copy may pick its own activity window (scope) — and the node chart its node
// type; a query other than the default one comes through the page context: ctx.pull(query) → the
// store's data, undefined while it loads, null when it failed.
import { big, compact, rows as gRows } from "../ui/glance.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n0 = (v) => Math.round(+v || 0).toLocaleString("en-US");
const icon = (ctx, n) => (typeof ctx.icon === "function" ? ctx.icon(n) : "");

// Island type: a fixed order (never re-sorted by count) and fixed colours, as on the old chart.
export const islandOrder = ["basic", "spring", "desert", "volcano", "swamp"];
export const islandColors = { basic: "#3987e5", spring: "#d95926", desert: "#199e70", volcano: "#c98500", swamp: "#d55181" };
export const LEVEL_BAR_COLOR = "#3987e5";
export const REACH_PRE_COLOR = "#3987e5";
export const REACH_ASC_COLOR = "#d55181";
// Merge tiers: one hue, a sequential ramp (rarest brightest).
export const nodeTierColors = ["#3378c4", "#5fb0f5", "#b9dffd"];

// Expansion slot integer → label; ordering is ALWAYS done on the integer.
// Mirrors decodeSlot() in azure-functions/shared/expansion-reach.js; keep in sync.
const reachPhases = ["basic", "spring", "desert", "volcano"];
export function decodeReachSlot(slot) {
  const phase = Math.floor(slot / 1000);
  const expansions = slot % 1000;
  if (phase < reachPhases.length) {
    const isl = reachPhases[phase];
    return { phase, expansions, ascension: 0, label: `${isl[0].toUpperCase()}${isl.slice(1)}-${expansions}` };
  }
  const ascension = phase - (reachPhases.length - 1);
  return { phase, expansions, ascension, label: `A${ascension}-${expansions}` };
}

// Nodes buyable with sunstones (= obsidian at 3:1): the first purchase's sunstone price and the island
// that gates it. Only Tree / Stone / Iron / Gold merge.
export const buyableNodes = [
  { key: "crops", label: "Crop Plot", icon: "Crop Plot", price: 3, island: "basic", merge: false },
  { key: "trees", label: "Tree", icon: "Tree", price: 4, island: "basic", merge: true },
  { key: "stones", label: "Stone Rock", icon: "Stone Rock", price: 4, island: "basic", merge: true },
  { key: "iron", label: "Iron Rock", icon: "Iron Rock", price: 7, island: "basic", merge: true },
  { key: "gold", label: "Gold Rock", icon: "Gold Rock", price: 10, island: "basic", merge: true },
  { key: "fruitPatches", label: "Fruit Patch", icon: "Fruit Patch", price: 5, island: "spring", merge: false },
  { key: "crimstones", label: "Crimstone Rock", icon: "Crimstone Rock", price: 20, island: "spring", merge: false },
  { key: "flowers", label: "Flower Bed", icon: "Flower Bed", price: 30, island: "spring", merge: false },
  { key: "oilReserves", label: "Oil Reserve", icon: "Oil Reserve", price: 40, island: "desert", merge: false },
  { key: "lavaPits", label: "Lava Pit", icon: "Lava Pit", price: 40, island: "volcano", merge: false },
];

/**
 * Where the viewer sits, from the chart's own rows (standard competition ranking: 1 + farms strictly
 * better). null when the viewer's bucket is not among the rows.
 */
export function rankIn(rows, mine, better) {
  if (mine == null || !rows || !rows.length) return null;
  let above = 0, total = 0, found = false;
  for (const r of rows) {
    total += r.n;
    if (better(r)) above += r.n;
    if (r.key === mine) found = true;
  }
  if (!found || !total) return null;
  const rank = above + 1;
  return { rank, of: total, pct: (rank / total) * 100, above };
}
export function youTag(rk) {
  if (!rk) return "YOU";
  const pct = rk.pct < 0.1 ? rk.pct.toFixed(2) : rk.pct.toFixed(1);
  return `YOU (top ${pct}% · #${n0(rk.rank)})`;
}

// Gap fills, as the old page did: one row per level from 1 to the highest seen; slots sorted on the
// integer with the gaps filled only between slots of the same phase (nothing invented across phases).
export function levelRows(agg) {
  const by = new Map((agg || []).filter((r) => r.key != null).map((r) => [Number(r.key), +r.n || 0]));
  const max = by.size ? Math.max(...by.keys()) : 0;
  const out = [];
  for (let k = 1; k <= max; k++) out.push({ key: k, n: by.get(k) || 0 });
  return out;
}
export function slotRows(agg) {
  const seen = new Map((agg || []).filter((r) => r.key != null).map((r) => [Number(r.key), +r.n || 0]));
  const keys = [...seen.keys()].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    out.push({ key: k, n: seen.get(k) });
    const next = keys[i + 1];
    if (next != null && Math.floor(k / 1000) === Math.floor(next / 1000)) for (let f = k + 1; f < next; f++) out.push({ key: f, n: 0 });
  }
  return out;
}
export function islandRows(agg) {
  const by = new Map((agg || []).map((r) => [r.key, +r.n || 0]));
  // the five known ones in their fixed order, then any island the game added since (crystal, marble…), by count
  const extra = [...by.keys()].filter((k) => !islandOrder.includes(k)).sort((a, b) => by.get(b) - by.get(a));
  return [...islandOrder, ...extra].map((key) => ({ key, n: by.get(key) || 0 }));
}
// Buyable-node bars: one row per T1-equivalent count (gap-filled), split into the three mutually
// exclusive farm classes (only T1 / has T2 but no T3 / has T3).
export function nodeRows(j) {
  if (!j || j.error || !Array.isArray(j.rows)) return [];
  const byEff = new Map();
  for (const r of j.rows) {
    if (!byEff.has(r.eff)) byEff.set(r.eff, { 1: 0, 2: 0, 3: 0 });
    byEff.get(r.eff)[r.cls] = r.n;
  }
  const effs = [...byEff.keys()].sort((a, b) => a - b);
  const hi = effs.length ? effs[effs.length - 1] : 0;
  const out = [];
  for (let e = effs.length ? Math.min(1, effs[0]) : 1; e <= hi; e++) {
    const c = byEff.get(e) || { 1: 0, 2: 0, 3: 0 };
    out.push({ key: e, n: c[1] + c[2] + c[3], segments: [
      { n: c[1], color: nodeTierColors[0], label: "T1 only" },
      { n: c[2], color: nodeTierColors[1], label: "has T2, no T3" },
      { n: c[3], color: nodeTierColors[2], label: "has T3" },
    ] });
  }
  return out;
}

// ── the activity window ──
export const SCOPES = [["", "same as the WORLD page"], ["all", "All farms"], ["90", "Active 90 days"], ["30", "Active 30 days"]];
const SCOPE_TITLE = { all: "", 90: " · active 90d", 30: " · active 30d" };
// The copy's own window, else the page's (null = every farm in the dataset).
export function scopeOf(opts = {}, ctx = {}) {
  if (opts.scope === "all") return null;
  if (opts.scope === "90" || opts.scope === "30") return Number(opts.scope);
  const p = typeof ctx.pageScope === "function" ? ctx.pageScope() : null;
  return p ? Number(p) : null;
}
const scopeText = (s) => (s ? `farms that played within ${s} days` : "every farm in the dataset");
// The default (all-farms) query comes with the data; any other through ctx.pull.
function pick(data, name, ctx, q, scope) {
  if (typeof ctx.pull === "function") return ctx.pull(scope ? { ...q, active: scope } : q);
  return scope ? undefined : data[name];
}
const loadingMsg = (v) => (v === undefined ? "Loading the WORLD data…" : "The WORLD data did not load.");

const barHtml = (r) => {
  if (r.segments) {
    const segs = r.segments.filter((s) => s.n > 0);
    return `<div class="w-hbar v-world-seg">` + segs.map((s) => `<span title="${esc(`${s.label}: ${n0(s.n)} farms (${r.n ? ((s.n / r.n) * 100).toFixed(1) : "0"}% of this bar)`)}" ` +
      `style="width:${((s.n / r.max) * 100).toFixed(1)}%;background:${s.color}"></span>`).join("") + `</div>`;
  }
  return `<div class="w-hbar"><span style="width:${(r.rel * 100).toFixed(1)}%${r.color ? `;background:${r.color}` : ""}"></span></div>`;
};

const COLUMNS = (logBar) => [
  { key: "key", label: "group", get: (r) => r.ord,
    fmt: (v, r) => `${r.mine ? "▶ " : ""}${r.iconHtml || ""}${esc(r.label)}${r.mine ? ` <span class="v-pill v-run">${esc(r.tag)}</span>` : ""}` },
  { key: "n", label: "farms", align: "right", fmt: n0 },
  { key: "share", label: "share", align: "right", fmt: (v) => `${(v * 100).toFixed(1)} %` },
  { key: "bar", label: logBar ? "log" : "", title: logBar ? "bar length on a log scale (otherwise the high levels would not show)" : undefined,
    get: (r) => r.n, fmt: (v, r) => barHtml(r) },
];

/*
 * One distribution table.
 *   rowsOf(raw, opts) → [{key, n, segments?}]   the buckets (gap-filled, ordered)
 *   label(key), colorFor(row), better(row, mine)  rank: which buckets are above the viewer's
 *   meOf(me, raw) → the viewer's bucket key        default me[meKey]
 *   shareBar: the bar is the share of all farms (the old breakdown tables) instead of the largest bucket
 */
function distWidget({ type, title, group, limit, meKey, label, defaults, better, logBar = false, rowsOf = (a) => a.map((r) => ({ key: r.key, n: +r.n || 0 })),
  colorFor = null, shareBar = false, zeros = false, extraOptions = [], query = null, meOf = null, summary = null, iconFor = null, numericKey = false, titleFn = null }) {
  const baseQuery = query || { res: "worldAgg", group, ...(limit ? { limit } : {}) };
  const w = {
    type, title, page: "world",
    titleFor: (o) => `${titleFn ? titleFn(o) : title}${SCOPE_TITLE[o.scope] || ""}`,
    needs: (farmId) => ({ agg: typeof baseQuery === "function" ? baseQuery({}, farmId) : baseQuery, ...(farmId ? { me: { res: "worldMe", farm: farmId } } : {}) }),
    optional: ["me"],
    optionsLabel: "Chart",
    options: [{ key: "scope", label: "Farms", kind: "select", choices: SCOPES },
      ...(zeros ? [{ key: "zeros", label: "Show empty buckets (no farms)", kind: "bool" }] : []), ...extraOptions],
    defaults,
    rowKey: (r) => String(r.key),
    rowLabel: (r) => r.label,
    rowClass: (r) => (r.mine ? "w-row-hl" : ""),
    keepRow: (r) => r.mine,   // your own bucket stays visible below the top N
    columns: COLUMNS(logBar),
    // data: { agg, me }; ctx: { pull?, pageScope?, icon?, farmId? }; opts: { scope?, zeros?, node? }
    build(data = {}, ctx = {}, opts = {}) {
      const scope = scopeOf(opts, ctx);
      const q = typeof baseQuery === "function" ? baseQuery(opts, ctx.farmId) : baseQuery;
      const raw = typeof baseQuery === "function" && typeof ctx.pull !== "function" && !scope ? data.agg : pick(data, "agg", ctx, q, scope);
      const ok = typeof baseQuery === "function" ? raw && Array.isArray(raw.rows) : Array.isArray(raw);
      if (!ok) return { rows: [], footer: "", empty: loadingMsg(raw) };
      let buckets = rowsOf(raw, opts);
      const me = data.me && data.me.found ? data.me : null;
      const mineRaw = meOf ? meOf(me, raw) : me && meKey ? me[meKey] : null;
      const mine = mineRaw == null ? null : numericKey ? Number(mineRaw) : mineRaw;
      const rk = mine != null && better ? rankIn(buckets, mine, (r) => better(r, mine)) : null;
      // the empty buckets the gap fill made, unless this copy shows them (yours always stays)
      if (zeros && !opts.zeros) buckets = buckets.filter((r) => r.n > 0 || r.key === mine);
      const total = buckets.reduce((a, r) => a + r.n, 0);
      const max = Math.max(1, ...buckets.map((r) => r.n));
      const scale = (v) => (shareBar ? (total ? v / total : 0) : logBar ? Math.log1p(v) / Math.log1p(max) : v / max);
      const rows = buckets.map((r, i) => {
        const isMine = mine != null && r.key === mine;
        return { ...r, ord: islandOrder.includes(r.key) ? islandOrder.indexOf(r.key) : r.key, label: label(r.key), max,
          share: total ? r.n / total : 0, rel: scale(r.n), mine: isMine, tag: isMine ? youTag(rk) : "",
          color: colorFor ? colorFor(r, i) : null, iconHtml: iconFor ? icon(ctx, iconFor(r.key)) : "" };
      });
      let footer = `<div style="color:var(--text-dim)">${n0(total)} farms · ${esc(scopeText(scope))}`;
      if (mine != null && rk) footer += ` · you: ${esc(label(mine))} · ${n0(rk.above)} farms above you · ${esc(youTag(rk))}`;
      return { rows, summary: summary ? summary(raw, rows, { ctx, opts, mine }) : "", footer: footer + "</div>", empty: "No farms." };
    },
  };
  w.sizes = ["s", "m", "l"];
  w.size = "s";
  w.glance = (data = {}, ctx = {}, opts = {}, size = "s") => distGlance(w.build(data, ctx, opts), better, size);
  return w;
}

// ── iPhone glance face (every distribution): S = your bucket and rank, or without one the largest
// bucket's share; M / L = the most common buckets, yours marked ──
function distGlance(out, better, size) {
  if (!out.rows.length) return { empty: out.empty };
  const total = out.rows.reduce((a, r) => a + r.n, 0);
  if (!total) return { empty: out.empty };
  const mine = out.rows.find((r) => r.mine);
  const rk = mine && better ? rankIn(out.rows, mine.key, (r) => better(r, mine.key)) : null;
  const pct = (v) => (v < 0.001 ? (v * 100).toFixed(2) : (v * 100).toFixed(1)) + "%";
  const topRow = out.rows.reduce((a, r) => (r.n > a.n ? r : a));
  const head = mine
    ? big(mine.label, { tone: "accent", cap: rk ? `you · top ${pct(rk.pct / 100)} · #${n0(rk.rank)}` : `you · ${pct(mine.share)} of ${compact(total)} farms` })
    : big(pct(topRow.share), { cap: `${topRow.label} · of ${compact(total)} farms` });
  if (size === "s") return { html: head };
  const list = out.rows.filter((r) => r.n > 0).sort((a, b) => b.n - a.n).slice(0, size === "m" ? 3 : 6);
  if (mine && !list.includes(mine)) list[list.length - 1] = mine;
  const html = gRows(list.map((r) => ({ icon: r.iconHtml || "", name: r.label, sub: `${compact(r.n)} farms`, value: pct(r.share), tone: r.mine ? "accent" : "" })));
  return { html: size === "m" ? `<div class="g-split"><div>${head}</div>${html}</div>` : head + html };
}

const slotLabel = (k) => decodeReachSlot(Number(k)).label;
const slotColor = (r) => (decodeReachSlot(r.key).ascension >= 1 ? REACH_ASC_COLOR : REACH_PRE_COLOR);
const higher = (r, mine) => r.key > mine;
const LADDER = { sort: { key: "key", dir: "desc" }, rows: { mode: "top", top: 30, picked: [] } };

export const worldIslands = distWidget({
  type: "world-islands", title: "🌍 Players by island", group: "island_type", meKey: "island_type",
  label: (k) => String(k), rowsOf: islandRows, colorFor: (r) => islandColors[r.key] || LEVEL_BAR_COLOR,
  // the ladder runs Basic → Spring → Desert → Volcano → Swamp; further along is "above"
  better: (r, mine) => islandOrder.indexOf(r.key) > islandOrder.indexOf(mine),
  defaults: { sort: { key: "key", dir: "asc" } },
});

export const worldSkillPoints = distWidget({
  type: "world-skill-points", title: "🌍 Players by skill points", group: "total_level", limit: 1000, meKey: "total_level",
  label: (k) => `${k} sp`, rowsOf: levelRows, better: higher, logBar: true, zeros: true, numericKey: true,
  colorFor: () => LEVEL_BAR_COLOR, defaults: LADDER,
});

export const worldEffLevel = distWidget({
  type: "world-eff-level", title: "🍲 Skill points after eating banked food", group: "effective_level", limit: 1000, meKey: "effective_level",
  label: (k) => `${k} sp`, rowsOf: levelRows, better: higher, zeros: true, numericKey: true, colorFor: () => REACH_ASC_COLOR, defaults: LADDER,
});

export const worldCurrentExpansion = distWidget({
  type: "world-current-expansion", title: "🏝️ Current expansion", group: "current_slot", limit: 1000, meKey: "current_slot",
  label: slotLabel, rowsOf: slotRows, better: higher, zeros: true, numericKey: true, colorFor: slotColor, defaults: LADDER,
});

export const worldReach = distWidget({
  type: "world-reach", title: "🚀 Expansion reach", group: "reach_slot", limit: 1000, meKey: "reach_slot",
  label: slotLabel, rowsOf: slotRows, better: higher, zeros: true, numericKey: true, colorFor: slotColor, defaults: LADDER,
});

// The breakdowns: DB order, the bar is the share of every farm (as the old tables drew it).
const breakdown = (type, title, group) => distWidget({
  type, title, group, label: (k) => (k === null ? "(none)" : String(k)), shareBar: true, colorFor: () => "var(--c-blue)", defaults: {},
});
export const worldAscension = breakdown("world-ascension", "⭐ Ascension (0 = never ascended)", "ascension_level");
export const worldBanStatus = breakdown("world-ban-status", "🚫 Ban status (farm.ban.status)", "ban_status");
export const worldVerified = breakdown("world-verified", "✔️ Verified (farm.verified)", "verified");

// ── buyable nodes ──
const nodeDef = (key) => buyableNodes.find((n) => n.key === key) || buyableNodes[1];
const nodeKeyOf = (opts) => nodeDef(opts.node).key;
const pctOf = (v, tot) => (tot ? ((v / tot) * 100).toFixed(v / tot < 0.01 ? 2 : 1) + " %" : "—");

function nodeSummary(j, rows, { ctx, opts }) {
  const def = nodeDef(j.node || opts.node);
  const tot = rows.reduce((a, r) => a + r.n, 0);
  const withT2 = rows.reduce((a, r) => a + r.segments[1].n, 0);
  const withT3 = rows.reduce((a, r) => a + r.segments[2].n, 0);
  const me = j.me || null;
  const sw = (c) => `<span style="color:${c}">■</span>`;
  const buttons = `<div class="v-world-nodes">` + buyableNodes.map((n) => `<button type="button" class="v-world-node${n.key === def.key ? " on" : ""}" ` +
    `data-action="opt:node" data-value="${esc(n.key)}" title="${esc(n.label)}${n.merge ? "" : " — cannot be merged"}">${icon(ctx, n.icon)}${esc(n.label)}</button>`).join("") + `</div>`;
  const c = j.coverage;
  const cover = c && c.total && c.filled < c.total
    ? `<div class="v-world-warn">⚠️ Computed for ${n0(c.filled)} of ${n0(c.total)} farms (${((c.filled / c.total) * 100).toFixed(1)} %) — the chart covers only that part so far; it fills in from the most active.</div>` : "";
  const line = `${n0(tot)} farms have at least one${j.zero ? ` · ${n0(j.zero)} have none` : ""}` +
    (def.merge ? ` · with T2: ${n0(withT2)} (${pctOf(withT2, tot)}) · with T3: ${n0(withT3)} (${pctOf(withT3, tot)})` : "") +
    (me ? ` · <b class="v-world-you">you: ${me.eff} T1-eq (${me.t1}×T1${me.t2 ? ` + ${me.t2}×T2` : ""}${me.t3 ? ` + ${me.t3}×T3` : ""})</b>` : "");
  return buttons + `<div class="v-world-note">How many nodes of this type farms have, in <b>T1 equivalent</b> (<code>t1 + 4·t2 + 16·t3</code>) — a merge ` +
    `uses up 4 nodes of the tier below, so this is the number a farm actually <b>acquired</b>. It measures cost, not yield: a merged node gives a little more than the four it replaced.<br>` +
    `The bar is split into three groups of farms that exclude each other — ${sw(nodeTierColors[0])} T1 only · ${sw(nodeTierColors[1])} at least one T2, no T3 · ${sw(nodeTierColors[2])} has T3. ` +
    (def.merge ? "Only Tree, Stone, Iron and Gold can be merged." : `<b>${esc(def.label)} cannot be merged</b>, so the whole bar is T1.`) +
    ` The first one costs <b>${def.price} sunstones</b> = ${def.price * 3} obsidian, each further one more; the type is gated by the <b>${esc(def.island)}</b> island.</div>` +
    cover + `<div class="v-dim" style="margin-bottom:8px">${line}</div>`;
}

export const worldNodes = distWidget({
  type: "world-nodes",
  title: "⛏️ Buyable nodes", titleFn: (o) => `⛏️ Buyable nodes – ${nodeDef(o.node).label}`,
  query: (opts, farmId) => ({ res: "worldNodes", node: nodeKeyOf(opts || {}), ...(farmId ? { farm: farmId } : {}) }),
  label: (k) => String(k), rowsOf: (j) => nodeRows(j), better: higher, numericKey: true, zeros: true,
  meOf: (_, j) => (j.me ? j.me.eff : null),
  extraOptions: [{ key: "node", label: "Node", kind: "select", choices: buyableNodes.map((n) => [n.key, n.label]) }],
  summary: nodeSummary,
  defaults: { opts: { node: "trees" }, ...LADDER },
});
