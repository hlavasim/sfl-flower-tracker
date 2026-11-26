// What is on the way right now: 🦀 the crab traps (CRABS page) and 🪆 the crafting box (DOLLS page).
import { toMs } from "../core/engine/power-costs.mjs";
import { craftingJobs } from "../core/engine/crafting-box.mjs";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (ctx, n) => (typeof ctx.icon === "function" ? ctx.icon(n) : "");
const when = (r) => (r.ready ? `<span class="v-pill v-ok">READY</span>`
  : r.readyAt ? `<span class="v-pill v-run growing-bed-time" data-ready="${r.readyAt}">${esc(r.countdown)}</span>` : "");

export const crabTraps = {
  type: "crab-traps",
  title: "🦀 Crab traps",
  page: "crustaceans",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  defaults: { sort: { key: "when", dir: "asc" } },
  rowKey: (r) => `${r.id}|${r.name}`,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.ready ? "w-st-ready" : ""),
  columns: [
    { key: "name", label: "catch", fmt: (v, r) => `<span style="white-space:nowrap">${r.iconHtml}${esc(v)}</span>` },
    { key: "qty", label: "qty", align: "right" },
    { key: "when", label: "when", get: (r) => (r.ready ? 0 : r.readyAt), fmt: (v, r) => when(r) },
  ],

  // ctx: { countdown(ms) → text, icon(name) → HTML, now? }
  build({ farm } = {}, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
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
    const footer = `<div style="color:var(--text-dim)">${ready} to collect · ${rows.length - ready} in traps · ${n} ${n === 1 ? "trap" : "traps"}</div>`;
    return { rows, footer, empty: "Nothing in the traps." };
  },
};

export const craftingBox = {
  type: "crafting-box",
  title: "🪆 Crafting box",
  page: "dolls",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  defaults: {},
  rowKey: (r) => `${r.k}|${r.name}`,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.ready ? "w-st-ready" : ""),
  columns: [
    { key: "name", label: "crafting", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b></div></div>` },
    { key: "when", label: "when", get: (r) => r.readyAt, fmt: (v, r) => when(r) },
  ],

  build({ farm } = {}, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    const now = ctx.now || Date.now();
    // the game's queue (or an older farm's single item), soonest first
    const rows = craftingJobs(farm.craftingBox).map((j, k) => {
      const ready = !!j.readyAt && j.readyAt <= now;
      return { k, name: j.name, readyAt: j.readyAt, ready, iconHtml: icon(ctx, j.name),
        countdown: !ready && j.readyAt && typeof ctx.countdown === "function" ? ctx.countdown(j.readyAt - now) : "" };
    });
    if (!rows.length) return { rows: [], footer: "", empty: "The crafting box is idle right now." };
    const ready = rows.filter((r) => r.ready).length;
    return { rows, footer: `<div class="v-dim">${ready} ready · ${rows.length - ready} crafting</div>`, empty: "" };
  },
};
