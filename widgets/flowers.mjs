// FLOWERS as widgets. The maths is core/engine/flower-plan.mjs (from the farm alone); these shape it.
//   🌸 Květiny – potřeba: each flower against its target (own + what the flowers grown from it miss),
//      with the page's summary as the footer; each copy may set its own mode and N.
//   🌱 Záhony: what grows in each bed and when it is ready.
import { flowerPlan } from "../core/engine/flower-plan.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hrs = (ctx, h) => (typeof ctx.hours === "function" ? ctx.hours(h) : `${Math.round(h)} h`);
const icon = (ctx, n) => (typeof ctx.icon === "function" ? ctx.icon(n) : "");
const MODES = [["", "jako stránka FLOWERS"], ["collection", "📦 Collection (N od každé)"], ["gifts", "🎁 Gifts (dárky na N dní)"]];

// The page's mode and N (and the NPC gift plan) unless this copy sets its own.
function planOf(farm, ctx, opts) {
  const page = typeof ctx.pageFlowers === "function" ? ctx.pageFlowers() || {} : {};
  const mode = opts.mode === "collection" || opts.mode === "gifts" ? opts.mode : page.mode || "collection";
  const n = Number.isFinite(Number(opts.n)) && opts.n !== null && opts.n !== "" ? Number(opts.n) : page.n || 2;
  return flowerPlan(farm, { mode, n, giftPlan: page.giftPlan || {}, now: ctx.now || Date.now() });
}

export const flowersNeeds = {
  type: "flowers-needs",
  title: "🌸 Květiny – potřeba",
  titleFor: (o) => (o.mode === "collection" || o.mode === "gifts"
    ? `🌸 Květiny – ${o.mode === "gifts" ? "🎁" : "📦"} ${o.n ?? "N"}` : "🌸 Květiny – potřeba"),
  page: "flowers",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  optionsLabel: "Cíl",
  options: [
    { key: "mode", label: "Režim", kind: "select", choices: MODES },
    { key: "n", label: "N (prázdné = jako stránka)", kind: "number", min: 1, max: 99 },
    { key: "hideDone", label: "Skrýt hotové", kind: "bool" },
  ],
  defaults: { opts: { mode: "", hideDone: false } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.done ? "w-st-ready" : ""),
  columns: [
    { key: "name", label: "květina", fmt: (v, r) => `<span style="white-space:nowrap">${r.iconHtml || ""}${esc(v)}</span>` },
    { key: "seed", label: "semínko", filter: true, filterLabel: (v) => v.replace(/ Seed$/, ""),
      fmt: (v, r) => `<span style="color:${esc(r.seedColor)}">${esc(r.seedLabel)}</span>` },
    { key: "have", label: "máš", align: "right", fmt: (v, r) => `${esc(v)}${r.pend ? ` <span style="color:var(--yellow)" title="roste">+${esc(r.pend)}</span>` : ""}` },
    { key: "need", label: "cíl", align: "right", title: "vlastní cíl + co spotřebují květiny pěstované z této",
      fmt: (v, r) => (r.dep > 0 ? `${esc(v)} <span style="color:var(--text-dim)">(${esc(r.own)}+${esc(r.dep)})</span>` : esc(v)) },
    { key: "missing", label: "chybí", align: "right", fmt: (v) => (v ? `<b>${esc(v)}</b>` : "✓") },
    { key: "hoursLeft", label: "čas", align: "right", title: "chybějící × doba růstu (s boosty), jeden záhon",
      fmt: (v, r) => (r.missing ? esc(r.timeText) : "") },
    { key: "input", label: "z čeho", fmt: (v, r) => `<span style="color:${r.inputAvail > 0 ? "var(--green)" : "var(--red)"}">${esc(v)}</span> <span style="color:var(--text-dim)">(${esc(r.inputAvail)})</span>` },
    { key: "usedIn", label: "použito v", get: (r) => r.usedIn.length, fmt: (v, r) => esc(r.usedIn.map((u) => `${u.name} (×${u.need})`).join(", ")) },
  ],

  // data: { farm }; ctx: { pageFlowers() → {mode, n, giftPlan}, hours(h) → text, icon(name) → HTML, now? }
  build({ farm } = {}, ctx = {}, opts = {}) {
    if (!farm) return { rows: [], footer: "", empty: "Chybí data farmy." };
    const { rows: all, summary: s } = planOf(farm, ctx, opts);
    const rows = (opts.hideDone ? all.filter((r) => !r.done) : all)
      .map((r) => ({ ...r, timeText: hrs(ctx, r.hoursLeft), iconHtml: icon(ctx, r.name) }));
    const pct = s.total ? Math.round((s.complete / s.total) * 100) : 100;
    const boost = s.boosts.length
      ? ` · boosty ${s.multiplier <= 1 ? "−" : "+"}${Math.round(Math.abs(1 - s.multiplier) * 100)} % <span title="${esc(s.boosts.map((b) => `${b.name} ×${b.multiplier}`).join(", "))}">ⓘ</span>` : "";
    const footer = `<div style="color:var(--text-dim)">${s.complete} / ${s.total} hotovo (${pct} %) · zbývá ${s.remaining} · ` +
      `${s.beds} záhon${s.beds === 1 ? "" : s.beds < 5 ? "y" : "ů"} · odhad ${esc(hrs(ctx, s.hours))}${boost}</div>`;
    return { rows, footer, empty: `✓ Všechny květiny na cíli (${s.total}).` };
  },
};

export const flowerBeds = {
  type: "flower-beds",
  title: "🌱 Záhony",
  page: "flowers",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  defaults: {},
  rowKey: (r) => r.id,
  rowLabel: (r) => r.name || "prázdný",
  rowClass: (r) => (r.kind === "ready" ? "w-st-ready" : ""),
  columns: [
    { key: "name", label: "květina", fmt: (v, r) => (v ? `<span style="white-space:nowrap">${r.iconHtml || ""}${esc(v)}</span>` : `<span style="color:var(--text-dim)">prázdný</span>`) },
    { key: "seedLabel", label: "semínko", fmt: (v) => esc(v || "") },
    { key: "totalYield", label: "výnos", align: "right", fmt: (v, r) => (r.empty ? "" : `${esc(v)}${r.bonus ? ` <span style="color:var(--text-dim)">(1+${esc(r.bonus)})</span>` : ""}`) },
    { key: "when", label: "kdy", get: (r) => (r.empty ? null : r.readyAt),
      fmt: (v, r) => r.kind === "ready" ? `<span class="dash-ready-badge green">READY</span>`
        : r.kind === "growing" ? `<span class="dash-time growing-bed-time" data-ready="${r.readyAt}">${esc(r.countdown)}</span>` : "" },
  ],

  // ctx: { countdown(ms) → text, icon(name) → HTML, now? }
  build({ farm } = {}, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "Chybí data farmy." };
    const now = ctx.now || Date.now();
    const rows = flowerPlan(farm, { now }).beds.map((b) => {
      const kind = b.empty ? "empty" : b.readyAt <= now ? "ready" : "growing";
      return { ...b, kind, iconHtml: b.name ? icon(ctx, b.name) : "",
        countdown: kind === "growing" && typeof ctx.countdown === "function" ? ctx.countdown(b.readyAt - now) : "" };
    });
    const n = (k) => rows.filter((r) => r.kind === k).length;
    const footer = rows.length ? `<div style="color:var(--text-dim)">${n("ready")} hotový · ${n("growing")} roste · ${n("empty")} prázdný</div>` : "";
    return { rows, footer, empty: "Na farmě nejsou záhony na květiny." };
  },
};
