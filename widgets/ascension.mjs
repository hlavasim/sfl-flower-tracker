// ASCENSION as widgets, over the prestige-loop plan (/api/compute?section=ascension, POSTed with the
// farm-history snapshots — the store's `ascension` resource):
//   ♾️ Ascension status: island, land, ascension, standings, XP/day, shards, crystals, stock
//   🎯 Ascension outlook: how far the stock reaches, the bottleneck, where continuous expand jams,
//      and the date-gated ascensions
//   🏝️ Island completion: the steps before Ascension 1
//   ♾️ Ascension steps: one ascension's expansions and upgrade (the page shows one copy per ascension)
// Each copy may pick its own production mode (real / theoretical); Grinx's Hammer changes the
// server's plan, so it stays the page's setting.
import { bar, kpis, pill } from "../ui/viz.mjs";
import { big, compact, meter as gMeter, ring as gRing, rows as gRows } from "../ui/glance.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const RES3 = ["Crimstone", "Oil", "Obsidian"];
const MODES = [["", "same as the ASCENSION page"], ["eff", "📊 real (measured)"], ["theo", "🎯 theoretical"]];

function readSettings() {
  try { const ls = globalThis.localStorage; return JSON.parse((ls && ls.getItem("sfl_ascension_settings")) || "{}") || {}; } catch { return {}; }
}
function readRecipes() {
  try { const ls = globalThis.localStorage; return JSON.stringify(JSON.parse((ls && ls.getItem("sfl_bumpkin_recipes")) || "{}") || {}); } catch { return "{}"; }
}
// The plan query: the page's Grinx setting (the server halves Crim/Oil/Obs costs) and the BUMPKIN
// page's recipe pick (the XP/day behind every level ETA) are part of it.
export const ascensionQuery = (farmId) => ({ res: "ascension", farm: farmId, grinx: readSettings().grinx ? 1 : 0, recipes: readRecipes() });
const needs = (farmId) => ({ asc: ascensionQuery(farmId) });

const modeOf = (ctx, opts) => (opts.mode === "eff" || opts.mode === "theo" ? opts.mode
  : (typeof ctx.page === "function" ? (ctx.page() || {}).mode : readSettings().mode) === "theo" ? "theo" : "eff");
const MODE_OPT = { key: "mode", label: "Production", kind: "select", choices: MODES };

export const fd = (v, dec) => (v == null || !isFinite(v) ? "∞" : v.toFixed(dec == null ? 1 : dec));
export const fmtEta = (days) => (days == null ? "?" : days <= 0 ? "✓" : days < 1 ? (days * 24).toFixed(1) + "h" : days.toFixed(1) + "d");
const kFmt = (v) => (v >= 10000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1) + "k" : Math.round(v).toLocaleString());
const date = (ms) => new Date(ms).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
// a game sprite; the crystal gets its purple tint
const gi = (ctx, n) => {
  const h = typeof ctx.icon === "function" ? ctx.icon(n) : "";
  return n.startsWith("Ascension") ? `<span class="v-asc-crys">${h}</span>` : h;
};
const stepName = (s) => (s.asc === 0 ? (s.kind === "upgrade" ? s.island + " upgrade" : s.island + "·exp" + s.expansion)
  : s.kind === "upgrade" ? "A" + s.asc + " upgrade" : "A" + s.asc + "·exp" + s.expansion);

// ── ♾️ status ──
export const ascensionStatus = {
  type: "ascension-status",
  title: "♾️ Ascension status",
  page: "ascension",
  needs,

  view({ asc: d } = {}, ctx = {}) {
    if (!d || !d.current) return { empty: "No ascension plan yet." };
    const cur = d.current, rates = d.rates || {};
    const standings = Object.entries(cur.bandStandings || {}).filter(([, l]) => l > 0).map(([a, l]) => `A${a} L${l}`).join(" · ") || "—";
    let h = kpis([{ v: cur.island, l: "island" }, { v: cur.basicLand, l: "Basic Land" }, { v: `A${cur.ascensionLevel}`, l: "ascension" },
      { v: rates.xpPerDay > 0 ? Math.round(rates.xpPerDay).toLocaleString() : "0", l: "XP/day from cooking" }]);
    h += `<div class="v-asc-line">${cur.readyToAscend ? pill("READY TO ASCEND", "ok") + " " : ""}🧬 Standings: <b>${esc(standings)}</b></div>`;
    if (!(rates.xpPerDay > 0)) h += `<div class="v-asc-line">${pill("⚠️ 0 XP/day — level ETAs unavailable, showing remaining XP", "run")}</div>`;
    if (cur.bankedFoodXp > 0) h += `<div class="v-asc-line">🍲 Cooked food in stock: <b>+${(cur.bankedFoodXp / 1e6).toFixed(1)}M XP</b> <span class="v-dim">(with the ×1.5 pet boost, counted toward levels)</span></div>`;
    if (rates.farmSflPerDay > 0) h += `<div class="v-asc-line">🌻 Farming: <b>${rates.farmSflPerDay.toFixed(1)} FLOWER/day</b></div>`;
    h += `<div class="v-asc-stock">` +
      [["Ascension Shard", cur.shards, "shards"], ["Ascension Crystal", cur.crystals, "crystals"],
        ...RES3.map((r) => [r, Math.floor(cur.stock[r]), r]), ["Coins", Math.round(cur.stock.Coins).toLocaleString(), "Coins"]]
        .map(([n, v, l]) => `<div class="v-kpi">${gi(ctx, n)}<b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("") + `</div>`;
    return { html: `<div class="v-asc">${h}</div>` };
  },
};

// ── 🎯 outlook: reach, frontier, continuous-expand jam, date gates ──
export function gateBanner(d, ctx = {}) {
  const waitGates = (d.gates || []).filter((g) => g.waitDays > 0.01);
  if (!waitGates.length) return "";
  return `<div class="v-asc-note v-asc-gate">🔒 ${waitGates.map((g) => `<strong>A${g.asc} unlocks ${date(g.unlockMs)}</strong> — the game blocks it until then, so you cannot chain straight into it: the build queue reaches it ${fmtEta(g.buildSlotDays - g.waitDays)} from now and then idles <strong>${fmtEta(g.waitDays)}</strong>. Everything after it is shifted by that wait.`).join("<br>")}
    <div class="v-dim">Only this ascension has a date in the game (flags.ts <code>SPOOKY_ASCENSION</code>); A1 is ungated and A3+ have no date yet, so later bands are scheduled purely by build time.</div></div>`;
}
export const ascensionOutlook = {
  type: "ascension-outlook",
  title: "🎯 Ascension outlook",
  titleFor: (o) => (o.mode === "theo" ? "🎯 Ascension outlook · theoretical" : o.mode === "eff" ? "🎯 Ascension outlook · real" : "🎯 Ascension outlook"),
  page: "ascension",
  needs,
  options: [MODE_OPT],
  defaults: { opts: { mode: "" } },

  view({ asc: d } = {}, ctx = {}, opts = {}) {
    if (!d || !d.steps) return { empty: "No ascension plan yet." };
    const mode = modeOf(ctx, opts), rates = d.rates || {};
    const n = d.steps.length;
    let h = "";
    const fr = d.frontier;
    h += `<div class="v-asc-note">${fr ? `🎯 Stock alone (no farming) covers through <strong>${esc(stepName(fr))}</strong>` : "🛑 Stock alone covers no pending step"}${d.bottleneck
      ? ` — <strong class="v-asc-bad">${esc(d.bottleneck)}</strong> is the first you'd need to farm. Farming until each build slot IS counted in the tables.` : "."}</div>`;
    const isStuck = (s) => (s.sim && s.sim[mode] ? s.sim[mode].stuck : s.stuck);
    const firstStuck = d.steps.find(isStuck);
    h += `<div class="v-asc-note">${firstStuck
      ? `⚠️ Continuous expand (from 3.8.2026) <strong>jams at ${esc(stepName(firstStuck))}</strong> — build slot ${fmtEta(firstStuck.buildSlotDays)} vs farm ETA ${fmtEta(firstStuck.sim && firstStuck.sim[mode] && firstStuck.sim[mode].farmEtaDays)}.`
      : `📅 You keep continuous-expand pace through A${d.maxAsc} at ${mode === "theo" ? "theoretical" : "real"} production.`}</div>`;
    h += gateBanner(d, ctx);
    h += `<div class="v-asc-sub">Resource reach · stock only, no farming</div><div class="v-asc-reach">` +
      ["Crimstone", "Oil", "Obsidian", "Coins"].map((r) => {
        const rr = rates[r], k = d.reach[r];
        return `<div class="v-asc-reach-row${r === d.bottleneck ? " bad" : ""}"><span>${gi(ctx, r)}${r}</span>${bar(n ? (k / n) * 100 : 100)}` +
          `<span>covers <b>${esc(k)}</b> of ${n} steps${rr ? ` · +${fd(rr[mode], 2)}/day` : ""}${r === d.bottleneck ? ` ${pill("bottleneck", "bad")}` : ""}</span></div>`;
      }).join("") + `</div>`;
    h += `<div class="v-dim">Nodes grow as you expand (${RES3.map((r) => `${gi(ctx, r)}${r} ${esc(d.nodeCounts[r])}`).join(" · ")}) — mining compounds, later steps come faster. Production: ${mode === "theo" ? "🎯 theoretical" : `📊 real (last ${fd(rates.windowDays, 0)}d)`}.</div>`;
    return { html: `<div class="v-asc">${h}</div>` };
  },
};

// ── the step tables ──
// One row per step with its state: 🟢 cumulative stock + level cover it now, 🟡 farmable before
// its continuous-expand build slot, 🔴 misses the slot.
function stepRows(d, ctx, mode, steps) {
  const cur = d.current, rates = d.rates || {};
  return steps.map((s, k) => {
    const sim = s.sim && s.sim[mode];
    const resOk = {};
    let allRes = true;
    for (const r of Object.keys(s.cum || {})) {
      resOk[r] = (s.cum[r] || 0) <= (cur.stock[r] ?? 0);
      if (!resOk[r]) allRes = false;
    }
    const extraOk = {};
    for (const [r, q] of Object.entries(s.extraCost || {})) {
      extraOk[r] = ((cur.extraStock || {})[r] ?? 0) >= q;
      if (!extraOk[r]) allRes = false;
    }
    const state = allRes && s.levelMet ? "ok" : (sim ? sim.stuck : s.stuck) || (sim && sim.blocked) ? "stuck" : "pace";
    // banked cooked food counts toward the level gate, exactly like the core's farm ETA
    const xpLeft = Math.max(0, (s.levelXpNeeded || 0) - cur.experience - (cur.bankedFoodXp || 0));
    const lvlMiss = rates.xpPerDay > 0 ? fmtEta(xpLeft / rates.xpPerDay) : Math.round(xpLeft / 1e6) + "M XP";
    const resCell = (r, inline) => {
      const c = s.cost[r] || 0;
      if (!c) return "";
      const eta = sim && sim.res && sim.res[r];
      const showEta = !resOk[r] && eta != null && eta > 0;
      return `<span class="${resOk[r] ? "v-asc-have" : "v-asc-miss"}">${gi(ctx, r)}${r === "Coins" ? kFmt(c) : Math.round(c)}` +
        `${showEta ? `<span class="v-asc-eta${inline ? " in" : ""}">~${fmtEta(eta)}</span>` : ""}</span>`;
    };
    const costBits = [];
    if (s.asc === 0) {
      for (const r of ["Wood", "Stone", "Iron", "Gold", ...RES3]) { const c = resCell(r, true); if (c) costBits.push(c); }
      if (s.cost.Coins) costBits.push(`<span class="${resOk.Coins ? "v-asc-have" : "v-asc-miss"}">${gi(ctx, "Coins")}${kFmt(s.cost.Coins)}</span>`);
      for (const [r, q] of Object.entries(s.extraCost || {})) costBits.push(`<span class="${extraOk[r] ? "v-asc-have" : "v-asc-miss"}">${gi(ctx, r)}${Math.round(q)}</span>`);
    }
    const nodeBits = Object.entries(s.nodesAdded || {}).map(([nd, q]) => `${q > 1 ? q + "×" : "+"}${gi(ctx, nd)}`);
    if (s.crystals) nodeBits.unshift(`${gi(ctx, "Ascension Crystal")}<span class="v-asc-shards">${gi(ctx, "Ascension Shard")}${esc(s.shards)}</span>`);
    const gate = s.gatedUntilMs
      ? ` <span class="v-asc-gatebit" title="The game blocks this ascension until ${new Date(s.gatedUntilMs).toISOString().slice(0, 10)}">🔒 ${date(s.gatedUntilMs)}${s.gateWaitDays > 0.01 ? ` (+${fmtEta(s.gateWaitDays)} wait)` : ""}</span>` : "";
    const name = s.asc === 0 ? (s.kind === "upgrade" ? `<b>⬆ ${esc(s.next)}</b>` : `${esc(s.island)} <b>${esc(s.expansion)}</b>`)
      : s.kind === "upgrade" ? `<b>⬆ A${s.asc}</b>` : `exp <b>${esc(s.expansion)}</b>`;
    const time = s.time ? (s.time >= 3600 ? +(s.time / 3600).toFixed(1) + "h" : s.time + "s") : "";
    return { k, s, sim, state,
      stepHtml: `${name} <span class="v-dim">${time}</span>${gate}`,
      levelHtml: s.kind === "upgrade"
        ? (s.asc === 0 ? "—" : s.levelMet ? '<span class="v-asc-have">band ✓</span>' : `<span class="v-asc-miss">band<span class="v-asc-eta">in ${lvlMiss}</span></span>`)
        : (s.levelMet ? `<span class="v-asc-have">L${s.band} ✓</span>` : `<span class="v-asc-miss">L${s.band}<span class="v-asc-eta">in ${lvlMiss}</span></span>`),
      res: Object.fromEntries([...RES3, "Coins"].map((r) => [r, resCell(r) || "—"])),
      costsHtml: costBits.join(" ") || "—", nodesHtml: nodeBits.join(" ") || "—",
      gain: s.flowerPerDay > 0.005 ? s.flowerPerDay : null, roi: s.roiDays,
      farmHtml: sim ? (sim.blocked ? '<span class="v-asc-miss">∞</span>' : state === "ok" ? '<span class="v-asc-have">✓</span>' : fmtEta(sim.farmEtaDays)) : "?",
      slotStuck: !!(sim ? sim.stuck : s.stuck) };
  });
}
const STATE = { ok: ["have it", "ok"], pace: ["on pace", "run"], stuck: ["stuck", "bad"] };
const LEGEND = `<div class="v-asc-legend">${pill("have it", "ok")} stock and level cover it (cumulatively) · ${pill("on pace", "run")} farmable in time (ETA ≤ build slot) · ${pill("stuck", "bad")} misses its build slot</div>`;
const COMMON_HEAD = [
  { key: "step", label: "step", get: (r) => r.k, fmt: (v, r) => r.stepHtml },
  { key: "state", label: "state", get: (r) => ["ok", "pace", "stuck"].indexOf(r.state), fmt: (v, r) => pill(...STATE[r.state]) },
  { key: "level", label: "level", get: (r) => r.s.band || 0, fmt: (v, r) => r.levelHtml },
];
const COMMON_TAIL = [
  { key: "nodes", label: "+nodes", get: (r) => Object.keys(r.s.nodesAdded || {}).length, fmt: (v, r) => `<span class="v-asc-nodes">${r.nodesHtml}</span>` },
  { key: "gain", label: "+🌻/day", align: "right", title: "FLOWER/day the step's new nodes add", fmt: (v) => (v == null ? "—" : `+${v.toFixed(2)}`) },
  { key: "roi", label: "ROI", align: "right", fmt: (v, r) => (v != null ? `${r.s.costUnpriced ? "≥" : ""}${fmtEta(v)}` : "—") },
  { key: "farm", label: "farm", align: "right", title: "days of farming until you can pay it", get: (r) => (r.sim ? (r.sim.blocked ? Infinity : r.sim.farmEtaDays) : null), fmt: (v, r) => r.farmHtml },
  { key: "slot", label: "slot", align: "right", title: "when the continuous-expand build queue reaches it", get: (r) => r.s.buildSlotDays,
    fmt: (v, r) => `<span class="${r.slotStuck ? "v-asc-miss" : ""}">${fmtEta(v)}</span>` },
];
const rowClass = (r) => (r.state === "ok" ? "w-st-ready" : r.state === "stuck" ? "w-st-miss" : "v-asc-pace");
const resCol = (r) => ({ key: r, label: r, align: "right", get: (x) => x.s.cost[r] || 0, fmt: (v, x) => x.res[r] });
// header icons: the column labels get the page's sprites once a ctx with icons is seen
function headIcons(cols, ctx) {
  if (typeof ctx.icon !== "function") return;
  for (const c of cols) if ([...RES3, "Coins"].includes(c.key)) c.labelHtml = `${gi(ctx, c.key)}<span class="v-asc-hlbl">${c.label}</span>`;
}

export const ascensionIsland = {
  type: "ascension-island",
  title: "🏝️ Island completion",
  page: "ascension",
  needs,
  options: [MODE_OPT],
  defaults: { opts: { mode: "" } },
  rowKey: (r) => `${r.s.kind}|${r.s.island}|${r.s.expansion ?? r.s.next}`,
  rowLabel: (r) => stepName(r.s),
  rowClass,
  columns: [...COMMON_HEAD,
    { key: "costs", label: "costs", get: (r) => Object.keys(r.s.cost || {}).length, fmt: (v, r) => `<span class="v-asc-costs">${r.costsHtml}</span>` },
    ...COMMON_TAIL],

  build({ asc: d } = {}, ctx = {}, opts = {}) {
    if (!d || !d.steps) return { rows: [], footer: "", empty: "No ascension plan yet." };
    const rows = stepRows(d, ctx, modeOf(ctx, opts), d.steps.filter((s) => s.asc === 0));
    return { rows, summary: `<div class="v-dim">Finishing the islands before Ascension 1.</div>`, footer: LEGEND, empty: "✓ Every island is complete." };
  },
};

const ASC_CHOICES = Array.from({ length: 10 }, (_, k) => [String(k + 1), `Ascension ${k + 1}`]);
export const ascensionSteps = {
  type: "ascension-steps",
  title: "♾️ Ascension steps",
  titleFor: (o) => `♾️ Ascension ${o.asc || 1}`,
  page: "ascension",
  needs,
  options: [{ key: "asc", label: "Ascension", kind: "select", choices: ASC_CHOICES }, MODE_OPT],
  defaults: { opts: { asc: "1", mode: "" } },
  rowKey: (r) => `${r.s.kind}|${r.s.asc}|${r.s.expansion ?? ""}`,
  rowLabel: (r) => stepName(r.s),
  rowClass,
  columns: [...COMMON_HEAD, ...["Crimstone", "Oil", "Obsidian", "Coins"].map(resCol), ...COMMON_TAIL],

  build({ asc: d } = {}, ctx = {}, opts = {}) {
    if (!d || !d.steps) return { rows: [], footer: "", empty: "No ascension plan yet." };
    headIcons(ascensionSteps.columns, ctx);
    const a = Math.max(1, Math.min(10, parseInt(opts.asc) || 1));
    const rows = stepRows(d, ctx, modeOf(ctx, opts), d.steps.filter((s) => s.asc === a));
    const ok = rows.filter((r) => r.state === "ok").length, stuck = rows.filter((r) => r.state === "stuck").length;
    const summary = rows.length ? kpis([{ v: `${ok} / ${rows.length}`, l: "covered now" }, { v: rows.length - ok - stuck, l: "on pace" }, { v: stuck, l: "stuck" },
      { v: `${150 + (a - 1) * 50}+`, l: "absolute level · band L1–L50" }]) : "";
    return { rows, summary, footer: LEGEND, empty: `Ascension ${a} is not in the plan (done, or past the plan's ${d.maxAsc || 10} ascensions).` };
  },
};

// ── iPhone glance face: the ascension and band; M adds the stock it is built from ──
ascensionStatus.sizes = ["s", "m"];
ascensionStatus.size = "s";
ascensionStatus.glance = ({ asc: d } = {}, ctx = {}, opts = {}, size = "s") => {
  if (!d || !d.current) return { empty: "No ascension plan yet." };
  const cur = d.current, rates = d.rates || {};
  const bands = Object.entries(cur.bandStandings || {}).filter(([, l]) => l > 0);
  const [band, lvl] = bands.length ? bands[bands.length - 1] : [cur.ascensionLevel, 0];
  let h = big(`A${band}`, { unit: ` L${lvl}` }) + gMeter((lvl / 50) * 100, "accent") +
    `<div class="g-cap">${cur.readyToAscend ? "ready to ascend ✦" : `${esc(cur.island)} · ${compact(rates.xpPerDay || 0)} XP/day`}</div>`;
  if (size === "m") {
    // wide and short: the headline on the left, the stock on the right
    h = `<div class="g-split"><div>${h}</div>` + gRows([["Ascension Shard", cur.shards], ["Ascension Crystal", cur.crystals], ["Oil", Math.floor(cur.stock.Oil || 0)], ["Obsidian", Math.floor(cur.stock.Obsidian || 0)]]
      .map(([n, v]) => ({ icon: gi(ctx, n), name: n.replace("Ascension ", ""), value: compact(v) }))) + `</div>`;
  }
  return { html: h };
};

// outlook: S = how many pending steps the stock alone covers (the scarcest resource) and where
// continuous expand jams; M = the three scarcest resources beside it; L = all four
ascensionOutlook.sizes = ["s", "m", "l"];
ascensionOutlook.size = "s";
ascensionOutlook.glance = ({ asc: d } = {}, ctx = {}, opts = {}, size = "s") => {
  if (!d || !d.steps) return { empty: "No ascension plan yet." };
  const mode = modeOf(ctx, opts), n = d.steps.length, reach = d.reach || {};
  const res = ["Crimstone", "Oil", "Obsidian", "Coins"].sort((a, b) => (reach[a] ?? 0) - (reach[b] ?? 0));
  const k = reach[res[0]] ?? 0;
  const jam = d.steps.find((s) => (s.sim && s.sim[mode] ? s.sim[mode].stuck : s.stuck));
  const head = big(k, { unit: `/${n}`, cap: d.bottleneck ? `steps from stock · ${d.bottleneck} first` : "steps from stock" }) +
    `<div class="g-cap">${jam ? `jams at ${esc(stepName(jam))}` : `on pace through A${esc(d.maxAsc || 10)}`}</div>`;
  const corner = `<div class="g-corner">${gRing(n ? (k / n) * 100 : 100, { tone: jam ? "warn" : "ok" })}</div>`;
  if (size === "s") return { html: corner + head };
  const list = gRows(res.slice(0, size === "m" ? 3 : 4).map((r) => ({ icon: gi(ctx, r), name: r, value: `${reach[r] ?? 0}/${n}`, tone: r === d.bottleneck ? "bad" : "" })));
  return { html: size === "m" ? `<div class="g-split"><div>${head}</div>${list}</div>` : corner + head + list };
};

// island completion and one ascension's steps: S = steps covered now (ring) and the next one;
// M = the next pending steps beside it; L = more of them
const GLANCE_STATE = { ok: "ok", pace: "info", stuck: "bad" };
function stepsGlance(widget, doneCap) {
  return (data = {}, ctx = {}, opts = {}, size = "s") => {
    const d = data.asc;
    if (!d || !d.steps) return { empty: "No ascension plan yet." };
    const out = widget.build(data, ctx, opts);
    if (!out.rows.length) return doneCap ? { html: big("✓", { tone: "ok", cap: doneCap }) } : { empty: out.empty };
    const n = out.rows.length, ok = out.rows.filter((r) => r.state === "ok").length, stuck = out.rows.filter((r) => r.state === "stuck").length;
    const pending = out.rows.filter((r) => r.state !== "ok");
    const farm = (r) => (r.sim ? (r.sim.blocked ? "∞" : fmtEta(r.sim.farmEtaDays)) : "?");
    const head = big(ok, { unit: `/${n}`, cap: stuck ? `covered · ${stuck} stuck` : "covered now" });
    const corner = `<div class="g-corner">${gRing((ok / n) * 100, { tone: stuck ? "bad" : "ok" })}</div>`;
    if (size === "s") return { html: corner + head + (pending.length ? `<div class="g-cap">next: ${esc(stepName(pending[0].s))} · farm ${esc(farm(pending[0]))}</div>` : "") };
    if (!pending.length) return { html: corner + big("✓", { tone: "ok", cap: "every step covered now" }) };
    const list = gRows(pending.slice(0, size === "m" ? 3 : 6).map((r) => ({ name: stepName(r.s), sub: `farm ${farm(r)} · slot ${fmtEta(r.s.buildSlotDays)}`,
      chip: { text: STATE[r.state][0], tone: GLANCE_STATE[r.state] } })));
    return { html: size === "m" ? `<div class="g-split"><div>${head}</div>${list}</div>` : corner + head + list };
  };
}
for (const w of [ascensionIsland, ascensionSteps]) { w.sizes = ["s", "m", "l"]; w.size = "s"; }
ascensionIsland.glance = stepsGlance(ascensionIsland, "every island complete");
ascensionSteps.glance = stepsGlance(ascensionSteps, "");
