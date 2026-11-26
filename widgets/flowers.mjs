// FLOWERS as widgets. The maths is core/engine/flower-plan.mjs (from the farm alone); these shape it.
//   🌸 Květiny – potřeba: each flower against its target (own + what the flowers grown from it miss),
//      with the page's summary as the footer; each copy may set its own mode and N.
//   🌱 Záhony: what grows in each bed and when it is ready.
import { flowerPlan } from "../core/engine/flower-plan.mjs";
import { bar, kpis, bigBar, pill, ring } from "../ui/viz.mjs";
import { big, ring as gRing, rows as gRows } from "../ui/glance.mjs";

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
  rowClass: (r) => (r.done ? "w-st-done" : ""),
  columns: [
    // icon, name, and under it the seed (its colour), what it grows from and which flowers use it
    { key: "name", label: "flower", fmt: (v, r) => `<div class="v-name">${r.iconHtml || ""}<div><b>${esc(v)}</b><small>` +
      `<span class="v-dot" style="background:${esc(r.seedColor)}"></span>${esc(r.seedLabel)} · from ${r.inputIcon}${esc(r.input)}` +
      `${r.usedIn.length ? ` · used in ${r.usedIn.map((u) => `${u.icon}${esc(u.name)} ×${esc(u.need)}`).join(", ")}` : ""}</small></div></div>` },
    { key: "progress", label: "progress", get: (r) => (r.need ? ((r.have + r.pend) / r.need) * 100 : 100), fmt: (v) => bar(v) },
    { key: "have", label: "have / target", align: "right", title: "have + growing / own target + what the flowers grown from it use up",
      fmt: (v, r) => `<span class="v-count">${esc(v)}${r.pend ? `<em>+${esc(r.pend)}</em>` : ""} / ${esc(r.need)}</span>` },
    { key: "missing", label: "missing", align: "right", fmt: (v) => (v ? `<span class="v-miss">−${esc(v)}</span>` : `<span class="v-done">✓</span>`) },
    { key: "hoursLeft", label: "time", align: "right", title: "missing × grow time (with boosts), one bed",
      fmt: (v, r) => (r.missing ? `<span class="v-dim">${esc(r.timeText)}</span>` : "") },
    { key: "seed", label: "seed", extra: true, filter: true, filterLabel: (v) => v.replace(/ Seed$/, ""),
      fmt: (v, r) => `<span style="color:${esc(r.seedColor)}">${esc(r.seedLabel)}</span>` },
    { key: "input", label: "from", extra: true, fmt: (v, r) => `<span style="color:${r.inputAvail > 0 ? "var(--green)" : "var(--red)"}">${esc(v)}</span> <span class="v-dim">(${esc(r.inputAvail)})</span>` },
    { key: "usedIn", label: "used in", extra: true, get: (r) => r.usedIn.length, fmt: (v, r) => esc(r.usedIn.map((u) => `${u.name} (×${u.need})`).join(", ")) },
  ],

  // data: { farm }; ctx: { pageFlowers() → {mode, n, giftPlan}, hours(h) → text, icon(name) → HTML, now? }
  build({ farm } = {}, ctx = {}, opts = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    const { rows: all, summary: s } = planOf(farm, ctx, opts);
    const rows = (opts.hideDone ? all.filter((r) => !r.done) : all)
      .map((r) => ({ ...r, timeText: hrs(ctx, r.hoursLeft), iconHtml: icon(ctx, r.name), inputIcon: icon(ctx, r.input),
        usedIn: r.usedIn.map((u) => ({ ...u, icon: icon(ctx, u.name) })) }));
    const pct = s.total ? (s.complete / s.total) * 100 : 100;
    const boost = s.boosts.length ? ` · boosts ${s.multiplier <= 1 ? "−" : "+"}${Math.round(Math.abs(1 - s.multiplier) * 100)} %` : "";
    const summary = kpis([{ v: `${s.complete} / ${s.total}`, l: "at target" }, { v: s.remaining, l: "grows left" },
      { v: s.beds, l: s.beds === 1 ? "bed" : "beds" }, { v: hrs(ctx, s.hours), l: `est.${boost}` }]) + bigBar(pct);
    return { rows, summary, footer: "", empty: `✓ All flowers at target (${s.total}).` };
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
    // a ring around the flower filling up as it grows; the seed and the yield under the name
    { key: "name", label: "flower", fmt: (v, r) => (v
      ? `<div class="v-name">${ring(r.pct, r.iconHtml || "🌱")}<div><b>${esc(v)}</b><small>${esc(r.seedLabel || "")} · yield ${esc(r.totalYield)}${r.bonus ? ` (1+${esc(r.bonus)})` : ""}</small></div></div>`
      : `<div class="v-name">${ring(0, "·")}<div class="v-dim">empty</div></div>`) },
    { key: "when", label: "when", align: "right", get: (r) => (r.empty ? null : r.readyAt),
      fmt: (v, r) => r.kind === "ready" ? pill("READY", "ok")
        : r.kind === "growing" ? `<span class="v-pill v-run growing-bed-time" data-ready="${r.readyAt}">${esc(r.countdown)}</span>` : "" },
  ],

  // ctx: { countdown(ms) → text, icon(name) → HTML, now? }
  build({ farm } = {}, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    const now = ctx.now || Date.now();
    const rows = flowerPlan(farm, { now }).beds.map((b) => {
      const kind = b.empty ? "empty" : b.readyAt <= now ? "ready" : "growing";
      const pct = b.empty ? 0 : b.readyAt <= now ? 100 : Math.max(0, Math.min(100, ((now - b.plantedAt) / (b.readyAt - b.plantedAt)) * 100));
      return { ...b, kind, pct, iconHtml: b.name ? icon(ctx, b.name) : "",
        countdown: kind === "growing" && typeof ctx.countdown === "function" ? ctx.countdown(b.readyAt - now) : "" };
    });
    const n = (k) => rows.filter((r) => r.kind === k).length;
    const footer = rows.length ? `<div style="color:var(--text-dim)">${n("ready")} ready · ${n("growing")} growing · ${n("empty")} empty</div>` : "";
    return { rows, footer, empty: "No flower beds on the farm." };
  },
};

// ── iPhone glance faces ──
// flowers needed: S = complete / total with a ring; M/L = the most-missing flowers
flowersNeeds.sizes = ["s", "m", "l"];
flowersNeeds.size = "s";
flowersNeeds.glance = ({ farm } = {}, ctx = {}, opts = {}, size = "s") => {
  if (!farm) return { empty: "No farm data." };
  const { rows: all, summary: s } = planOf(farm, ctx, opts);
  const pct = s.total ? (s.complete / s.total) * 100 : 100;
  const head = `<div class="g-corner">${gRing(pct, { tone: pct >= 100 ? "ok" : "accent" })}</div>` +
    big(s.complete, { unit: `/${s.total}`, cap: s.remaining ? `${s.remaining} grows left · ${hrs(ctx, s.hours)}` : "all at target ✓" });
  if (size === "s") return { html: head };
  const miss = all.filter((r) => r.missing > 0).sort((a, b) => b.missing - a.missing).slice(0, size === "m" ? 3 : 7);
  return { html: (size === "l" ? head : "") + (miss.length ? gRows(miss.map((r) => ({ icon: icon(ctx, r.name), name: r.name, sub: `${r.have + r.pend} / ${r.need}`,
    value: `−${r.missing}`, tone: "bad" }))) : big("✓", { tone: "ok", cap: "all at target" })) };
};

// beds: S = how many are ready (ring of the beds in use); M = the beds, soonest first
flowerBeds.sizes = ["s", "m"];
flowerBeds.size = "s";
flowerBeds.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = flowerBeds.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const ready = out.rows.filter((r) => r.kind === "ready").length, used = out.rows.filter((r) => !r.empty).length;
  if (size === "s") {
    const next = out.rows.filter((r) => r.kind === "growing").sort((a, b) => a.readyAt - b.readyAt)[0];
    return { html: `<div class="g-corner">${gRing(out.rows.length ? (used / out.rows.length) * 100 : 0)}</div>` +
      big(ready, { tone: ready ? "ok" : "", cap: ready ? `ready of ${out.rows.length} beds` : next ? `next in ${next.countdown}` : `${out.rows.length} beds empty` }) };
  }
  const list = out.rows.slice().sort((a, b) => (a.empty - b.empty) || (a.readyAt || 0) - (b.readyAt || 0)).slice(0, 4);
  return { html: gRows(list.map((r) => ({ icon: r.iconHtml || "🌱", name: r.name || "empty", sub: r.name ? `yield ${r.totalYield}` : "",
    ...(r.kind === "ready" ? { chip: { text: "READY", tone: "ok" } } : r.kind === "growing" ? { chip: { text: r.countdown || "…", tone: "info" } } : {}) }))) };
};
