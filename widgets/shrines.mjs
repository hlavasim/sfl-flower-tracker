// SHRINES as a widget: every craftable pet shrine — its craft cost (ingredients × p2p), what it adds
// a day at your real efficiency, what one placement earns over its duration, and whether it is up.
// Valued on exactly POWER's numbers: section=power's prices, Oil, coin rate and owned boosts, and
// section=eff's measured efficiency (the Power/Roadmap rule). The per-shrine marginal is the page's
// _shrineMarginalSflPerDay (also used by the roadmap's renew table), reached through ctx.
import { pill, bar } from "../ui/viz.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (ctx, n) => (typeof ctx.icon === "function" && n ? ctx.icon(n) : "");
const fl = (ctx) => (typeof ctx.sfl === "function" ? ctx.sfl() : "FLOWER");
const tiles = (list) => `<div class="v-kpis">` + list.map((k) =>
  `<div class="v-kpi"><b${k.c ? ` style="color:${k.c}"` : ""}>${k.h}</b><span>${esc(k.l)}</span></div>`).join("") + `</div>`;
const VERDICT = { great: ["GREAT", "ok"], worth: ["WORTH IT", "ok"], marginal: ["MARGINAL", "run"], skip: ["SKIP", "bad"], manual: ["JUDGE", "idle"] };

// section=power exactly as the page asks for it (no product / roadmap parameters) and section=eff
// over the 7-day harvest history.
export const shrinesNeeds = (farmId) => ({
  farm: { res: "farm", farm: farmId },
  power: { res: "compute", farm: farmId, section: "power" },
  eff: { res: "computeHist", farm: farmId, section: "eff" },
});

export const shrinesRoi = {
  type: "shrines-roi",
  title: "⛩ Pet shrines – cost and ROI",
  titleFor: (o) => (o.show === "active" ? "⛩ Active shrines" : o.show === "profitable" ? "⛩ Profitable shrines" : "⛩ Pet shrines – cost and ROI"),
  page: "shrines",
  needs: shrinesNeeds,
  optional: ["eff"],
  optionsLabel: "Shrines",
  options: [{ key: "show", label: "Show", kind: "select", choices: [["all", "all shrines"], ["profitable", "profitable only"], ["active", "active only"]] }],
  defaults: { opts: { show: "all" } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.active ? "w-st-ready" : ""),
  columns: [
    { key: "name", label: "shrine", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b><small>${esc(r.effect)}</small>` +
      (r.detailHtml ? `<details class="v-roi-row"><summary class="v-dim">calculation</summary><div class="v-power-detail">${r.detailHtml}</div></details>` : "") + `</div></div>` },
    { key: "active", label: "status", get: (r) => (r.active ? r.hoursLeft : -1),
      fmt: (v, r) => `${r.active ? pill("ACTIVE", "ok") : pill("INACTIVE", "idle")}<div class="v-dim">${esc(r.timeLeft)}</div>` },
    { key: "costSfl", label: "cost", align: "right", fmt: (v, r) => `<b style="color:var(--c-yellow)">${v.toFixed(2)}</b> ${r.fl}` },
    { key: "perDay", label: "boost", align: "right", title: "what it adds a day at your measured efficiency",
      fmt: (v, r) => (r.indirect ? `<span class="v-dim">—</span>` : `<span style="color:var(--c-green)">+${v.toFixed(4)}</span> ${r.fl}/d`) },
    { key: "earnTotal", label: "earn", align: "right", title: "boost × the shrine's duration", fmt: (v, r) => (r.indirect ? `<span class="v-dim">indirect</span>` : `${v.toFixed(2)} ${r.fl}<div class="v-dim">${r.days} d</div>`) },
    { key: "netTotal", label: "profit", align: "right", fmt: (v, r) => `<b style="color:${v >= 0 ? "var(--c-green)" : "var(--c-red)"}">${v >= 0 ? "+" : ""}${v.toFixed(2)}</b> ${r.fl}<div class="v-dim">${v >= 0 ? "profit" : "loss"} (${r.days} d)</div>` },
    { key: "payback", label: "earned back", get: (r) => (r.costSfl > 0 ? (r.earnTotal / r.costSfl) * 100 : null), fmt: (v) => (v == null ? "" : bar(v)) },
    { key: "verdict", label: "verdict", fmt: (v) => pill(...(VERDICT[v] || ["—", "idle"])) },
    { key: "ingredients", label: "ingredients", get: (r) => (r.hasIngredients ? 1 : 0),
      fmt: (v, r) => `${r.ingredientsHtml}${r.hasIngredients ? "" : `<div style="color:var(--c-yellow)">⚠ missing ingredients</div>`}` },
  ],
  // ctx: { shrineRows(farm, power, eff) → { rows: [{name, sh, costSfl, hasIngredients, status, margin, earnTotal, netTotal, verdict}], acornPrice },
  //   detail(breakdown, sh) → HTML, icon, sfl }
  build({ farm, power, eff } = {}, ctx = {}, opts = {}) {
    if (!farm || !power || typeof ctx.shrineRows !== "function") return { rows: [], footer: "", empty: "No shrine data yet." };
    const { rows: all, acornPrice } = ctx.shrineRows(farm, power, eff || null);
    const F = fl(ctx);
    const rows = all.map((r) => {
      const active = r.status.kind === "active";
      const indirect = !!(r.margin.note && r.margin.note.indexOf("indirect") !== -1);
      return { name: r.name, effect: r.sh.effect, days: r.sh.duration_d, costSfl: r.costSfl, perDay: r.margin.sflPerDay || 0, earnTotal: r.earnTotal, netTotal: r.netTotal,
        verdict: r.verdict, active, hoursLeft: active ? r.status.hoursLeft : 0, indirect, hasIngredients: r.hasIngredients, fl: F, iconHtml: icon(ctx, r.name),
        timeLeft: active ? (r.status.hoursLeft >= 24 ? `${(r.status.hoursLeft / 24).toFixed(1)} days left` : `${r.status.hoursLeft.toFixed(0)}h left`) : `lasts ${r.sh.duration_d} day${r.sh.duration_d !== 1 ? "s" : ""}`,
        ingredientsHtml: Object.entries(r.sh.ingredients || {}).map(([k, q]) => `${q}× ${icon(ctx, k)}${esc(k)}`).join(", "),
        detailHtml: r.margin.breakdown && r.margin.breakdown.length && typeof ctx.detail === "function" ? ctx.detail(r.margin.breakdown, r.sh) : "" };
    });
    let profitable = 0, boost = 0, cost = 0;
    for (const r of all) { if (r.netTotal > 0) profitable++; boost += r.margin.sflPerDay || 0; cost += r.costSfl > 0 ? r.costSfl / r.sh.duration_d : 0; }
    const net = boost - cost;
    const summary = tiles([{ h: `${profitable} / ${all.length}`, l: "profitable", c: "var(--c-green)" }, { h: `+${boost.toFixed(4)} ${F}`, l: "total boost / day", c: "var(--c-green)" },
      { h: `${cost.toFixed(4)} ${F}`, l: "total cost / day", c: "var(--c-red)" }, { h: `${net >= 0 ? "+" : ""}${net.toFixed(4)} ${F}`, l: "net / day (real efficiency)", c: net >= 0 ? "var(--c-green)" : "var(--c-red)" }]);
    const shown = opts.show === "active" ? rows.filter((r) => r.active) : opts.show === "profitable" ? rows.filter((r) => r.netTotal > 0) : rows;
    const footer = `<details class="v-power-more"><summary>How BOOST and EARN are computed (real efficiency)</summary><div class="v-dim">
      • <b>BOOST</b> = today's daily FLOWER of each affected resource × the shrine's effect × <b>the category's efficiency</b> — the same measured efficiency and rule as Power/Roadmap (7-day harvest cadence; animals and obsidian count as 100%, categories without their own signal use your average activity, your Roadmap sliders win). Prices, Oil and the coin rate are the Power page's.<br>
      • <b>EARN</b> = BOOST × the shrine's duration in days (7 / 1 / 30).<br>
      • <b>Indirect</b> (Boar cooking, Fox crafting, Hound pet XP, Trading): no clean FLOWER/day — judge them yourself.<br>
      • <b>${icon(ctx, "Acorn")}Acorn opportunity cost</b>: not on p2p, priced at <b>${acornPrice.toFixed(3)} ${F} per Acorn</b> = 100 energy × the best FLOWER per energy your pets can fetch.<br>
      • Most speed-only shrines do nothing at the usual 12h login interval — the flat-yield ones (Legendary, Bear, Stag, Moth) usually pay.</div></details>`;
    return { rows: shown, summary, footer, empty: "No shrines to show with this filter." };
  },
};

// ── iPhone glance model: how many shrines are up (a ring); the items are the shrines of this copy's
// filter, active first (counting down live to when they run out), then most profit, each with how
// much of its cost it earns back ──
shrinesRoi.look = "number";
shrinesRoi.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const all = shrinesRoi.build(data, ctx, { show: "all" });
  if (!all.rows.length) return { empty: all.empty === "No shrine data yet." ? all.empty : "No shrines." };
  const n = all.rows.length, active = all.rows.filter((r) => r.active).length, profitable = all.rows.filter((r) => r.netTotal > 0).length;
  const now = ctx.now || Date.now();
  let boost = 0, cost = 0;
  for (const r of all.rows) { boost += r.perDay || 0; cost += r.costSfl > 0 ? r.costSfl / r.days : 0; }
  const net = boost - cost, sign = (v, dec) => `${v >= 0 ? "+" : ""}${v.toFixed(dec)}`;
  const dec = (v) => (Math.abs(v) >= 10 ? 0 : Math.abs(v) >= 1 ? 1 : 3);   // a tile keeps to a few digits
  const shown = shrinesRoi.build(data, ctx, opts).rows.slice().sort((a, b) => (b.active - a.active) || (b.netTotal - a.netTotal));
  return {
    head: { value: active, unit: `/${n}`, tone: active ? "ok" : "", ring: (active / n) * 100, ringTone: "ok", cap: `active · ${profitable} profitable` },
    items: shown.map((r) => ({ icon: r.iconHtml, name: r.name,
      sub: r.active ? `active · ${sign(r.netTotal, 2)}` : `${(VERDICT[r.verdict] || ["—"])[0].toLowerCase()} · ${r.days} d`,
      ...(r.active ? { at: now + r.hoursLeft * 3600000 } : { value: sign(r.netTotal, 2), tone: r.netTotal >= 0 ? "ok" : "bad" }),
      ...(r.costSfl > 0 && !r.indirect ? { pct: Math.min(100, (r.earnTotal / r.costSfl) * 100) } : {}) })),
    tiles: [{ label: "active", value: `${active}/${n}` }, { label: "profitable", value: profitable },
      { label: "boost/day", value: sign(boost, dec(boost)) }, { label: "net/day", value: sign(net, dec(net)) }],
  };
};

export const SHRINES_WIDGETS = [shrinesRoi];
