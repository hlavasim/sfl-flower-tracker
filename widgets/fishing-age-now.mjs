// FISHING · "Do sudu teď": what to put in the Aging Shed now (core agingNow), with the XP it gives,
// the running salt and why each fish is on the list. Pure: data in, rows out; the page and the
// board both render it through the frame and the table.
import { agingNow } from "../core/engine/aging-now.mjs";
import { computeFoodXP, detectCookingBoosts } from "../core/engine/cooking.mjs";
import { levelingInit, levelingPlan } from "../core/sections/leveling.mjs";
import { big, compact, ring, rows } from "../ui/glance.mjs";

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
  title: "🧂 Age now",
  page: "fishing",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId }, leveling: { res: "leveling", farm: farmId } }),
  // The plan only decides whether recipe fish are kept for baits; without it they are kept.
  optional: ["leveling"],
  defaults: { rows: { mode: "top", top: 14, picked: [] } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  columns: [
    { key: "name", label: "fish", fmt: (v, r) => `<span style="white-space:nowrap">${r.iconHtml || ""} ${esc(v)}</span>` },
    { key: "age", label: "how many", align: "right", fmt: (v) => `<b style="color:var(--sunpetal)">${fmt(v)}</b>` },
    { key: "why", label: "why", fmt: (v, r) => `<span style="color:${GROUP_COLOR[r.group]}">${esc(v)}</span>` },
    { key: "xp", label: "XP", align: "right", fmt: (v) => fmt(v) },
    // running salt in the order shown (the table sums it), coloured against the salt held
    { key: "run", label: "salt Σ", align: "right", title: "running salt, in table order", get: (r) => r.salt, cumulative: true,
      fmt: (v, r) => `<span style="color:${SALT_COLOR[v <= r.saltHeld + 1e-9 ? "ok" : v - r.salt < r.saltHeld ? "partial" : "over"]}" title="${fmt(r.salt)} for this row">${fmt(v)}</span>` },
    { key: "qty", label: "have", align: "right", extra: true, fmt: (v) => fmt(v) },
    { key: "keep", label: "keep", align: "right", extra: true, fmt: (v) => (v ? fmt(v) : "") },
    { key: "salt", label: "salt", align: "right", extra: true, fmt: (v) => fmt(v) },
    { key: "agedXp", label: "XP/pc", align: "right", extra: true, get: (r) => r.agedXp * r.mult, fmt: (v) => fmt(v) },
    { key: "gainPerSalt", label: "XP/salt", align: "right", extra: true, get: (r) => (r.salt ? r.xp / r.salt : null), fmt: (v) => (v == null ? "" : fmt(v)) },
  ],

  // data: { farm: <game farm>, leveling: <compute?section=leveling data> }
  // ctx:  { lvPlan?, savedLeveling?, marvelPlanned?, cookSettings?, icon?(name), bestWorm? }
  build({ farm, leveling }, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    const owned = farm.inventory || {};
    const ownedLc = {};
    for (const [k, v] of Object.entries(owned)) ownedLc[k.toLowerCase()] = +v || 0;
    const saltHeld = ownedLc.salt || 0;
    const mult = computeFoodXP("Aged Fish", { xp: 1, usesHoney: false }, "Aging Shed", detectCookingBoosts(farm, ctx.cookSettings || {}));
    let run = 0;
    const rows = agingNow({ owned, baitsWanted: baitsWanted(farm, leveling, ctx) }).map((r) => {
      const before = run;
      run += r.salt;
      const why = r.group === "free" ? "no bait needs it"
        : r.group === "surplus" ? `surplus: have ${fmt(r.qty)}, keep ${fmt(r.keep)} (2× per ${fmt(ownedLc[String(r.partner).toLowerCase()] || 0)}× ${r.partner})`
        : `held for ${r.bait}, but you are not making baits now`;
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
      ? `<div style="color:var(--text-dim)">Total <b>${fmt(tot.n)}</b> fish · <b>${fmt(tot.xp)}</b> XP · salt <b${over ? ' style="color:var(--red)"' : ""}>${fmt(tot.salt)}</b> of your ${fmt(saltHeld)}` +
        ` · shed ${busy}/${slots} slots running${over ? ' · <span style="color:var(--red)">your salt does not cover the red ones</span>' : ""}</div>`
      : "";
    const empty = `Nothing to age — everything you hold is in the ratio the recipes pair up. Go fishing${ctx.bestWorm ? ` (${ctx.bestWorm})` : ""}.`;
    return { rows, footer, empty, totals: { ...tot, saltHeld, slots, busy } };
  },
};

// ── iPhone glance face: S = how many fish to age now (ring: the salt held against their need);
// M = beside it, the first fish; L = over the list. A fish the salt does not cover is orange / red.
fishingAgeNow.sizes = ["s", "m", "l"];
fishingAgeNow.size = "s";
fishingAgeNow.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = fishingAgeNow.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const t = out.totals, cover = t.salt > 0 ? (t.saltHeld / t.salt) * 100 : 100;
  const head = big(compact(t.n), { unit: " fish", cap: `${compact(t.xp)} XP · ${compact(t.salt)} salt` });
  const ringed = `<div class="g-corner">${ring(cover, { tone: cover >= 100 ? "ok" : "warn" })}</div>` + head;
  if (size === "s") return { html: ringed };
  const list = rows(out.rows.slice(0, size === "m" ? 3 : 7).map((r) => ({ icon: r.iconHtml, name: r.name, sub: `${compact(r.xp)} XP`,
    value: `×${fmt(r.age)}`, tone: r.saltState === "ok" ? "" : r.saltState === "partial" ? "warn" : "bad" })));
  return { html: size === "m" ? `<div class="g-split"><div>${head}</div>${list}</div>` : ringed + list };
};
