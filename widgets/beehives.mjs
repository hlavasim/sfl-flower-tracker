// Beehives: each hive's honey, swarm and when it is full. The hive maths (flowers attached, rates)
// is the page's extractBeehiveDetails (ctx.hives); this module shapes it into rows.
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
    { key: "id", label: "hive", fmt: (v, r) => `Hive #${esc(String(v).slice(-3))}${r.hasSwarm ? ' <span title="swarm: the next harvest gives extra">🐝 swarm</span>' : ""}` },
    { key: "pct", label: "full", align: "right", get: (r) => (r.kind === "empty" ? null : r.progressPct), fmt: (v) => (v == null ? "" : `${Math.round(v)} %`) },
    { key: "when", label: "when", get: whenKey, fmt: (v, r) => r.kind === "full" ? `<span class="dash-ready-badge green">READY</span>`
      : r.kind === "filling" ? `<span class="dash-time growing-bed-time" data-ready="${r.readyAt}">${esc(r.countdown)}</span>`
      : r.kind === "idle" ? `<span style="color:var(--text-dim)">no flowers</span>` : `<span style="color:var(--text-dim)">empty</span>` },
  ],

  // ctx: { hives(farm) → extractBeehiveDetails rows, countdown(ms) → text, now? }
  build({ farm }, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    if (typeof ctx.hives !== "function") return { rows: [], footer: "", empty: "The hive calculation did not load." };
    const now = ctx.now || Date.now();
    const rows = ctx.hives(farm).map((h) => {
      const k = kind(h, now);
      return { ...h, kind: k, countdown: k === "filling" && ctx.countdown ? ctx.countdown(h.readyAt - now) : "" };
    });
    const full = rows.filter((r) => r.kind === "full").length, idle = rows.filter((r) => r.kind === "idle").length;
    const footer = rows.length ? `<div style="color:var(--text-dim)">${full} full · ${rows.length - full - idle} filling · ${idle} no flowers</div>` : "";
    return { rows, footer, empty: "No beehives on the farm." };
  },
};
