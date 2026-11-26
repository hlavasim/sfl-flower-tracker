// FISHING · "Do sudu teď": what to put in the Aging Shed now (core agingNow), with the XP it gives,
// the running salt and why each fish is on the list. Pure: data in, rows out; the page and the
// board both render it through the frame and the table.
import { agingNow } from "../core/engine/aging-now.mjs";
import { computeFoodXP, detectCookingBoosts } from "../core/engine/cooking.mjs";
import { levelingInit, levelingPlan } from "../core/sections/leveling.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n) => (+n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const GROUP_COLOR = { free: "var(--green)", surplus: "var(--text-secondary)", bait: "#e8a060" };
const SALT_COLOR = { ok: "var(--text-dim)", partial: "#e8a060", over: "var(--red)" };

// Whether recipe fish should be kept for baits: the LEVELING plan says baits help, or a Marvel
// route is ticked; no plan yet = keep them (the page's rule).
// The plan is reused while the farm, the inputs and the saved config are the same (board repaints).
let last = null;
function baitsWanted(farm, leveling, ctx) {
  if (ctx.marvelPlanned) return true;
  let plan = ctx.lvPlan;
  if (plan === undefined) {
    plan = null;
    if (farm && leveling && leveling.inputs) {
      const savedKey = JSON.stringify(ctx.savedLeveling || null);
      if (last && last.farm === farm && last.leveling === leveling && last.savedKey === savedKey) plan = last.plan;
      else {
        try {
          const lin = { ...leveling.inputs };
          plan = levelingPlan(farm, lin, levelingInit(farm, lin, ctx.savedLeveling || null).cfg);
        } catch { plan = null; }
        last = { farm, leveling, savedKey, plan };
      }
    }
  }
  return !plan || !!plan.fish.baitsHelp;
}

export const fishingAgeNow = {
  type: "fishing-age-now",
  title: "🧂 Do sudu teď",
  page: "fishing",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId }, leveling: { res: "leveling", farm: farmId } }),
  // The plan only decides whether recipe fish are kept for baits; without it they are kept.
  optional: ["leveling"],
  defaults: { rows: { mode: "top", top: 14, picked: [] } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  columns: [
    { key: "name", label: "ryba", fmt: (v, r) => `<span style="white-space:nowrap">${r.iconHtml || ""} ${esc(v)}</span>` },
    { key: "age", label: "kolik", align: "right", fmt: (v) => `<b style="color:var(--sunpetal)">${fmt(v)}</b>` },
    { key: "why", label: "proč", fmt: (v, r) => `<span style="color:${GROUP_COLOR[r.group]}">${esc(v)}</span>` },
    { key: "xp", label: "XP", align: "right", fmt: (v) => fmt(v) },
    // running salt in the order shown (the table sums it), coloured against the salt held
    { key: "run", label: "sůl Σ", align: "right", title: "sůl průběžně, v pořadí tabulky", get: (r) => r.salt, cumulative: true,
      fmt: (v, r) => `<span style="color:${SALT_COLOR[v <= r.saltHeld + 1e-9 ? "ok" : v - r.salt < r.saltHeld ? "partial" : "over"]}" title="${fmt(r.salt)} na tenhle řádek">${fmt(v)}</span>` },
    { key: "qty", label: "máš", align: "right", extra: true, fmt: (v) => fmt(v) },
    { key: "keep", label: "necháš", align: "right", extra: true, fmt: (v) => (v ? fmt(v) : "") },
    { key: "salt", label: "sůl", align: "right", extra: true, fmt: (v) => fmt(v) },
    { key: "agedXp", label: "XP/ks", align: "right", extra: true, get: (r) => r.agedXp * r.mult, fmt: (v) => fmt(v) },
    { key: "gainPerSalt", label: "XP/sůl", align: "right", extra: true, get: (r) => (r.salt ? r.xp / r.salt : null), fmt: (v) => (v == null ? "" : fmt(v)) },
  ],

  // data: { farm: <game farm>, leveling: <compute?section=leveling data> }
  // ctx:  { lvPlan?, savedLeveling?, marvelPlanned?, cookSettings?, icon?(name), bestWorm? }
  build({ farm, leveling }, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "Chybí data farmy." };
    const owned = farm.inventory || {};
    const ownedLc = {};
    for (const [k, v] of Object.entries(owned)) ownedLc[k.toLowerCase()] = +v || 0;
    const saltHeld = ownedLc.salt || 0;
    const mult = computeFoodXP("Aged Fish", { xp: 1, usesHoney: false }, "Aging Shed", detectCookingBoosts(farm, ctx.cookSettings || {}));
    let run = 0;
    const rows = agingNow({ owned, baitsWanted: baitsWanted(farm, leveling, ctx) }).map((r) => {
      const before = run;
      run += r.salt;
      const why = r.group === "free" ? "žádný bait ji nechce"
        : r.group === "surplus" ? `přebytek: máš ${fmt(r.qty)}, necháš ${fmt(r.keep)} (2× na ${fmt(ownedLc[String(r.partner).toLowerCase()] || 0)}× ${r.partner})`
        : `drží ji ${r.bait}, ale baity teď neděláš`;
      return {
        ...r, mult, why, xp: r.age * r.agedXp * mult, run, saltHeld,
        saltState: run <= saltHeld + 1e-9 ? "ok" : before < saltHeld ? "partial" : "over",
        iconHtml: ctx.icon ? ctx.icon(r.name) : "",
      };
    });
    const tot = rows.reduce((a, r) => ({ n: a.n + r.age, xp: a.xp + r.xp, salt: a.salt + r.salt }), { n: 0, xp: 0, salt: 0 });
    const shed = farm.agingShed || {};
    const slots = Math.min(Math.max(shed.level || 1, 1), 6);
    const busy = ((shed.racks && shed.racks.aging) || []).length;
    const over = tot.salt > saltHeld;
    const footer = rows.length
      ? `<div style="color:var(--text-dim)">Celkem <b>${fmt(tot.n)}</b> ryb · <b>${fmt(tot.xp)}</b> XP · sůl <b${over ? ' style="color:var(--red)"' : ""}>${fmt(tot.salt)}</b> z tvých ${fmt(saltHeld)}` +
        ` · sud ${busy}/${slots} slotů běží${over ? ' · <span style="color:var(--red)">červené už sůl nepokryje</span>' : ""}</div>`
      : "";
    const empty = `Nemáš co stárnout — všechno, co držíš, je v poměru, který recepty spárují. Chytej${ctx.bestWorm ? ` (${ctx.bestWorm})` : ""}.`;
    return { rows, footer, empty, totals: { ...tot, saltHeld, slots, busy } };
  },
};
