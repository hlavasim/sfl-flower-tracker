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

// ── iPhone glance model: what is on the way, ready first, then the soonest. The headline is the
// soonest job (its icon, READY or its countdown, a ring of how far along it is); the items are the
// whole queue, each with a READY / countdown chip and its progress (where the farm says when it
// started); every item with a time counts down live (at); ui/glance-templates offers the looks ──
function onTheWay(widget, startOf, runningWord) {
  return (data = {}, ctx = {}, opts = {}) => {
    const out = widget.build(data, ctx, opts);
    if (!out.rows.length) return { empty: out.empty };
    const now = ctx.now || Date.now();
    // ready first, then by when; a queued job with no time yet goes after the timed ones
    const at = (r) => (r.readyAt > 0 ? r.readyAt : Infinity);
    const list = out.rows.slice().sort((a, b) => (a.ready === b.ready ? (at(a) === at(b) ? 0 : at(a) < at(b) ? -1 : 1) : a.ready ? -1 : 1));
    const pctOf = (r) => {
      if (r.ready) return 100;
      const s = startOf(data.farm, r);
      return s && r.readyAt > s ? Math.min(100, Math.max(0, ((now - s) / (r.readyAt - s)) * 100)) : null;
    };
    const ready = list.filter((r) => r.ready).length, running = list.filter((r) => !r.ready);
    const r0 = list[0], p0 = pctOf(r0);
    const when = (r) => (r.ready ? "Ready" : r.countdown || "…");
    return {
      head: { value: when(r0), tone: r0.ready ? "ok" : "", ...(r0.iconHtml ? { hero: r0.iconHtml } : {}),
        ...(p0 != null ? { ring: p0, ringTone: r0.ready ? "ok" : "info" } : {}),
        cap: `${r0.name}${list.length > 1 ? ` · ${ready} of ${list.length} ready` : ""}` },
      items: list.map((r) => { const p = pctOf(r); return { icon: r.iconHtml || "", name: r.qty ? `${r.qty}× ${r.name}` : r.name,
        ...(r.readyAt ? { at: r.readyAt } : { chip: r.ready ? { text: "READY", tone: "ok" } : { text: r.countdown || "…", tone: "info" } }),
        ...(p != null ? { pct: p } : {}) }; }),
      tiles: [{ label: "ready", value: ready }, { label: runningWord, value: running.length },
        ...(running.length ? [{ label: "next", value: running[0].countdown || "…" }] : []),
        ...(running.length > 1 ? [{ label: "all done in", value: running[running.length - 1].countdown || "…" }] : [])],
      foot: `${ready} ready · ${running.length} ${runningWord}`,
    };
  };
}
// a job's start: the queue's startedAt (rows keep the queue's order as k); a trap's placedAt
const jobStart = (farm, r) => ((craftingJobs(farm && farm.craftingBox)[r.k] || {}).startedAt || 0);
const trapStart = (farm, r) => { const wt = ((((farm || {}).crabTraps || {}).trapSpots || {})[r.id] || {}).waterTrap; return wt && wt.placedAt ? toMs(wt.placedAt) : 0; };
craftingBox.look = "icons-1";   // the whole queue as icons with the time under each
craftingBox.glanceModel = onTheWay(craftingBox, jobStart, "crafting");
crabTraps.look = "next";   // the soonest catch, big, with its countdown
crabTraps.glanceModel = onTheWay(crabTraps, trapStart, "in traps");
