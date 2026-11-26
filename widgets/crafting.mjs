// What is on the way right now: 🦀 the crab traps (CRABS page) and 🪆 the crafting box (DOLLS page).
import { toMs } from "../core/engine/power-costs.mjs";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (ctx, n) => (typeof ctx.icon === "function" ? ctx.icon(n) : "");
const when = (r) => (r.ready ? `<span class="dash-ready-badge green">READY</span>`
  : r.readyAt ? `<span class="dash-time growing-bed-time" data-ready="${r.readyAt}">${esc(r.countdown)}</span>` : "");

export const crabTraps = {
  type: "crab-traps",
  title: "🦀 Pasti",
  page: "crustaceans",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  defaults: { sort: { key: "when", dir: "asc" } },
  rowKey: (r) => `${r.id}|${r.name}`,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.ready ? "w-st-ready" : ""),
  columns: [
    { key: "name", label: "úlovek", fmt: (v, r) => `<span style="white-space:nowrap">${r.iconHtml}${esc(v)}</span>` },
    { key: "qty", label: "kusů", align: "right" },
    { key: "when", label: "kdy", get: (r) => (r.ready ? 0 : r.readyAt), fmt: (v, r) => when(r) },
  ],

  // ctx: { countdown(ms) → text, icon(name) → HTML, now? }
  build({ farm } = {}, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "Chybí data farmy." };
    const now = ctx.now || Date.now();
    const spots = (farm.crabTraps && farm.crabTraps.trapSpots) || {};
    const rows = [];
    for (const [id, spot] of Object.entries(spots)) {
      const wt = spot && spot.waterTrap;
      if (!wt) continue;
      const readyAt = toMs(wt.readyAt || 0), ready = readyAt <= now;
      for (const [name, qty] of Object.entries(wt.caught || {})) {
        rows.push({ id, name, qty, readyAt, ready, iconHtml: icon(ctx, name),
          countdown: !ready && typeof ctx.countdown === "function" ? ctx.countdown(readyAt - now) : "" });
      }
    }
    const n = Object.keys(spots).length, ready = rows.filter((r) => r.ready).length;
    const footer = `<div style="color:var(--text-dim)">${ready} k vybrání · ${rows.length - ready} v pasti · ${n} ${n === 1 ? "past" : n < 5 ? "pasti" : "pastí"}</div>`;
    return { rows, footer, empty: "V pastech nic není." };
  },
};

export const craftingBox = {
  type: "crafting-box",
  title: "🪆 Crafting box",
  page: "dolls",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  defaults: {},
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.ready ? "w-st-ready" : ""),
  columns: [
    { key: "name", label: "vyrábí se", fmt: (v, r) => `<span style="white-space:nowrap">${r.iconHtml}${esc(v)}</span>` },
    { key: "when", label: "kdy", get: (r) => r.readyAt, fmt: (v, r) => when(r) },
  ],

  build({ farm } = {}, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "Chybí data farmy." };
    const now = ctx.now || Date.now();
    const cb = farm.craftingBox;
    const name = cb && cb.status === "crafting" && cb.item ? cb.item.collectible || cb.item.wearable : null;
    if (!name) return { rows: [], footer: "", empty: "Crafting box teď nic nevyrábí." };
    const readyAt = toMs(cb.readyAt || 0), ready = !!readyAt && readyAt <= now;
    return { rows: [{ name, readyAt, ready, iconHtml: icon(ctx, name),
      countdown: !ready && readyAt && typeof ctx.countdown === "function" ? ctx.countdown(readyAt - now) : "" }], footer: "", empty: "" };
  },
};
