// FLOWERS as widgets. The maths is core/engine/flower-plan.mjs (from the farm alone); these shape it.
//   🌸 Květiny – potřeba: each flower against its target (own + what the flowers grown from it miss),
//      with the page's summary as the footer; each copy may set its own mode and N.
//   🌱 Záhony: what grows in each bed and when it is ready.
import { flowerPlan } from "../core/engine/flower-plan.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hrs = (ctx, h) => (typeof ctx.hours === "function" ? ctx.hours(h) : `${Math.round(h)} h`);
const icon = (ctx, n) => (typeof ctx.icon === "function" ? ctx.icon(n) : "");
const MODES = [["", "same as the FLOWERS page"], ["collection", "📦 Collection (N of each)"], ["gifts", "🎁 Gifts (gifts for N days)"]];

// The page's mode and N (and the NPC gift plan) unless this copy sets its own.
function planOf(farm, ctx, opts) {
  const page = typeof ctx.pageFlowers === "function" ? ctx.pageFlowers() || {} : {};
  const mode = opts.mode === "collection" || opts.mode === "gifts" ? opts.mode : page.mode || "collection";
  const n = Number.isFinite(Number(opts.n)) && opts.n !== null && opts.n !== "" ? Number(opts.n) : page.n || 2;
  return flowerPlan(farm, { mode, n, giftPlan: page.giftPlan || {}, now: ctx.now || Date.now() });
}

export const flowersNeeds = {
  type: "flowers-needs",
  title: "🌸 Flowers – needed",
  titleFor: (o) => (o.mode === "collection" || o.mode === "gifts"
    ? `🌸 Flowers – ${o.mode === "gifts" ? "🎁" : "📦"} ${o.n ?? "N"}` : "🌸 Flowers – needed"),
  page: "flowers",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  optionsLabel: "Target",
  options: [
    { key: "mode", label: "Mode", kind: "select", choices: MODES },
    { key: "n", label: "N (blank = same as the page)", kind: "number", min: 1, max: 99 },
    { key: "hideDone", label: "Hide done", kind: "bool" },
  ],
  defaults: { opts: { mode: "", hideDone: false } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.done ? "w-st-ready" : ""),
  columns: [
    { key: "name", label: "flower", fmt: (v, r) => `<span style="white-space:nowrap">${r.iconHtml || ""}${esc(v)}</span>` },
    { key: "seed", label: "seed", filter: true, filterLabel: (v) => v.replace(/ Seed$/, ""),
      fmt: (v, r) => `<span style="color:${esc(r.seedColor)}">${esc(r.seedLabel)}</span>` },
    { key: "have", label: "have", align: "right", fmt: (v, r) => `${esc(v)}${r.pend ? ` <span style="color:var(--yellow)" title="growing">+${esc(r.pend)}</span>` : ""}` },
    { key: "need", label: "target", align: "right", title: "own target + what the flowers grown from this one use up",
      fmt: (v, r) => (r.dep > 0 ? `${esc(v)} <span style="color:var(--text-dim)">(${esc(r.own)}+${esc(r.dep)})</span>` : esc(v)) },
    { key: "missing", label: "missing", align: "right", fmt: (v) => (v ? `<b>${esc(v)}</b>` : "✓") },
    { key: "hoursLeft", label: "time", align: "right", title: "missing × grow time (with boosts), one bed",
      fmt: (v, r) => (r.missing ? esc(r.timeText) : "") },
    { key: "input", label: "from", fmt: (v, r) => `<span style="color:${r.inputAvail > 0 ? "var(--green)" : "var(--red)"}">${esc(v)}</span> <span style="color:var(--text-dim)">(${esc(r.inputAvail)})</span>` },
    { key: "usedIn", label: "used in", get: (r) => r.usedIn.length, fmt: (v, r) => esc(r.usedIn.map((u) => `${u.name} (×${u.need})`).join(", ")) },
  ],

  // data: { farm }; ctx: { pageFlowers() → {mode, n, giftPlan}, hours(h) → text, icon(name) → HTML, now? }
  build({ farm } = {}, ctx = {}, opts = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    const { rows: all, summary: s } = planOf(farm, ctx, opts);
    const rows = (opts.hideDone ? all.filter((r) => !r.done) : all)
      .map((r) => ({ ...r, timeText: hrs(ctx, r.hoursLeft), iconHtml: icon(ctx, r.name) }));
    const pct = s.total ? Math.round((s.complete / s.total) * 100) : 100;
    const boost = s.boosts.length
      ? ` · boosts ${s.multiplier <= 1 ? "−" : "+"}${Math.round(Math.abs(1 - s.multiplier) * 100)} % <span title="${esc(s.boosts.map((b) => `${b.name} ×${b.multiplier}`).join(", "))}">ⓘ</span>` : "";
    const footer = `<div style="color:var(--text-dim)">${s.complete} / ${s.total} done (${pct} %) · ${s.remaining} left · ` +
      `${s.beds} bed${s.beds === 1 ? "" : "s"} · est. ${esc(hrs(ctx, s.hours))}${boost}</div>`;
    return { rows, footer, empty: `✓ All flowers at target (${s.total}).` };
  },
};

export const flowerBeds = {
  type: "flower-beds",
  title: "🌱 Flower beds",
  page: "flowers",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  defaults: {},
  rowKey: (r) => r.id,
  rowLabel: (r) => r.name || "empty",
  rowClass: (r) => (r.kind === "ready" ? "w-st-ready" : ""),
  columns: [
    { key: "name", label: "flower", fmt: (v, r) => (v ? `<span style="white-space:nowrap">${r.iconHtml || ""}${esc(v)}</span>` : `<span style="color:var(--text-dim)">empty</span>`) },
    { key: "seedLabel", label: "seed", fmt: (v) => esc(v || "") },
    { key: "totalYield", label: "yield", align: "right", fmt: (v, r) => (r.empty ? "" : `${esc(v)}${r.bonus ? ` <span style="color:var(--text-dim)">(1+${esc(r.bonus)})</span>` : ""}`) },
    { key: "when", label: "when", get: (r) => (r.empty ? null : r.readyAt),
      fmt: (v, r) => r.kind === "ready" ? `<span class="dash-ready-badge green">READY</span>`
        : r.kind === "growing" ? `<span class="dash-time growing-bed-time" data-ready="${r.readyAt}">${esc(r.countdown)}</span>` : "" },
  ],

  // ctx: { countdown(ms) → text, icon(name) → HTML, now? }
  build({ farm } = {}, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    const now = ctx.now || Date.now();
    const rows = flowerPlan(farm, { now }).beds.map((b) => {
      const kind = b.empty ? "empty" : b.readyAt <= now ? "ready" : "growing";
      return { ...b, kind, iconHtml: b.name ? icon(ctx, b.name) : "",
        countdown: kind === "growing" && typeof ctx.countdown === "function" ? ctx.countdown(b.readyAt - now) : "" };
    });
    const n = (k) => rows.filter((r) => r.kind === k).length;
    const footer = rows.length ? `<div style="color:var(--text-dim)">${n("ready")} ready · ${n("growing")} growing · ${n("empty")} empty</div>` : "";
    return { rows, footer, empty: "No flower beds on the farm." };
  },
};
