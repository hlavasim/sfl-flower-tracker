// Beehives: each hive's honey, swarm and when it is full. The hive maths (flowers attached, rates)
// is the page's extractBeehiveDetails (ctx.hives); this module shapes it into rows.
import { ring } from "../ui/viz.mjs";
import { big, ring as gRing, rows as gRows } from "../ui/glance.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kind = (h, now) => (h.empty ? "empty" : h.idle || h.readyAt === undefined ? "idle" : h.readyAt <= now ? "full" : "filling");
// Full first, then the soonest; idle and empty (blank) last.
const whenKey = (r) => (r.kind === "full" ? 0 : r.kind === "filling" ? r.readyAt : null);

export const beehives = {
  type: "beehives",
  title: "🐝 Beehives",
  page: "flowers",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  defaults: { sort: { key: "when", dir: "asc" } },
  rowKey: (r) => r.id,
  rowLabel: (r) => `Hive #${String(r.id).slice(-3)}`,
  rowClass: (r) => (r.kind === "full" ? "w-st-ready" : ""),
  columns: [
    // a ring filling with honey around the honey icon; the swarm under the name
    { key: "id", label: "hive", fmt: (v, r) => `<div class="v-name">${ring(r.kind === "empty" ? 0 : r.progressPct, r.kind === "empty" ? "🍯" : r.iconHtml || "🍯")}` +
      `<div><b>Hive #${esc(String(v).slice(-3))}</b>${r.hasSwarm ? '<small title="swarm: the next harvest gives extra">🐝 swarm</small>' : ""}</div></div>` },
    { key: "pct", label: "full", align: "right", get: (r) => (r.kind === "empty" ? null : r.progressPct), fmt: (v) => (v == null ? "" : `${Math.round(v)} %`) },
    { key: "when", label: "when", get: whenKey, fmt: (v, r) => r.kind === "full" ? `<span class="v-pill v-ok">READY</span>`
      : r.kind === "filling" ? `<span class="v-pill v-run growing-bed-time" data-ready="${r.readyAt}">${esc(r.countdown)}</span>`
      : r.kind === "idle" ? `<span style="color:var(--text-dim)">no flowers</span>` : `<span style="color:var(--text-dim)">empty</span>` },
  ],

  // ctx: { hives(farm) → extractBeehiveDetails rows, countdown(ms) → text, icon?(name), now? }
  build({ farm }, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    if (typeof ctx.hives !== "function") return { rows: [], footer: "", empty: "The hive calculation did not load." };
    const now = ctx.now || Date.now();
    const rows = ctx.hives(farm).map((h) => {
      const k = kind(h, now);
      return { ...h, kind: k, iconHtml: typeof ctx.icon === "function" ? ctx.icon("Honey") : "",
        countdown: k === "filling" && ctx.countdown ? ctx.countdown(h.readyAt - now) : "" };
    });
    const full = rows.filter((r) => r.kind === "full").length, idle = rows.filter((r) => r.kind === "idle").length;
    const swarm = rows.some((r) => r.hasSwarm)
      ? `<div class="v-warn">🐝 Bee swarm active — collecting honey now adds +0.2 yield to all growing crops!</div>` : "";
    const footer = rows.length ? `<div style="color:var(--text-dim)">${full} full · ${rows.length - full - idle} filling · ${idle} no flowers</div>${swarm}` : "";
    return { rows, footer, empty: "No beehives on the farm." };
  },
};

// ── iPhone glance face: S = how many hives are full (ring = the fullest one still filling) and the
// next one; M / L = the hives, full first, then the soonest ──
beehives.sizes = ["s", "m", "l"];
beehives.size = "s";
beehives.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = beehives.build(data, ctx);
  if (!out.rows.length) return { empty: out.empty };
  const full = out.rows.filter((r) => r.kind === "full").length;
  const filling = out.rows.filter((r) => r.kind === "filling").sort((a, b) => a.readyAt - b.readyAt);
  const swarm = out.rows.some((r) => r.hasSwarm) ? " · 🐝 swarm" : "";
  if (size === "s") {
    const top = filling.length ? Math.max(...filling.map((r) => r.progressPct || 0)) : full ? 100 : 0;
    return { html: `<div class="g-corner">${gRing(top, { tone: "warn" })}</div>` +
      big(full, { unit: `/${out.rows.length}`, tone: full ? "ok" : "", cap: (full ? "hives full" : filling.length ? `next in ${filling[0].countdown}` : "no hive is filling") + swarm }) };
  }
  const order = { full: 0, filling: 1, idle: 2, empty: 3 };
  const list = out.rows.slice().sort((a, b) => order[a.kind] - order[b.kind] || (a.readyAt || 0) - (b.readyAt || 0)).slice(0, size === "m" ? 3 : 7);
  return { html: gRows(list.map((r) => ({ icon: r.iconHtml || "🍯", name: `Hive #${String(r.id).slice(-3)}`,
    sub: [r.kind === "empty" ? "" : `${Math.round(r.progressPct || 0)} %`, r.hasSwarm ? "🐝 swarm" : ""].filter(Boolean).join(" · "),
    ...(r.kind === "full" ? { chip: { text: "READY", tone: "ok" } } : r.kind === "filling" ? { chip: { text: r.countdown || "…", tone: "info" } }
      : { value: r.kind === "idle" ? "no flowers" : "empty" }) }))) +
    (size === "l" ? `<div class="g-cap g-foot">${full} full · ${filling.length} filling${swarm}</div>` : "") };
};
