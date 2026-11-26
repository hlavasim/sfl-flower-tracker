// LEVELING · "Po ascenzích": days and FLOWER to the end of each ascension on the saved LEVELING
// config (core levelingLadder). On the LEVELING page a row click sets the target (the page wires
// that); on the board it is read-only.
import { levelingInit, levelingPlan, levelingLadder, levelingInputsWithBook } from "../core/sections/leveling.mjs";
import { sflIcon } from "../core/engine/power-formula.mjs";

// The board repaints often (each settings change, each data arrival): the plan is reused while the
// farm, the inputs, the book and the saved config are the same.
let last = null;
function planFor(farm, leveling, book, saved) {
  const savedKey = JSON.stringify(saved || null);
  if (last && last.farm === farm && last.leveling === leveling && last.book === book && last.savedKey === savedKey) return last.out;
  const inputs = levelingInputsWithBook(leveling.inputs, book && book.items);
  const cfg = levelingInit(farm, inputs, saved || null).cfg;
  const out = { plan: levelingPlan(farm, inputs, cfg), cfg, free: inputs.freePoints || 0 };
  last = { farm, leveling, book, savedKey, out };
  return out;
}

const num = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("cs-CZ") : "—");
const date = (d, now) => (Number.isFinite(d) && d > 0 ? new Date(now + d * 86400000).toLocaleDateString("cs-CZ") : "");

export const levelingLadderWidget = {
  type: "leveling-ladder",
  title: "🪜 Po ascenzích",
  page: "leveling",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId }, leveling: { res: "leveling", farm: farmId }, book: { res: "book" } }),
  // Without the book the bids and bud prices are missing; the ladder still stands and refills.
  optional: ["book"],
  defaults: {},
  rowKey: (r) => `A${r.ascension}`,
  rowLabel: (r) => `A${r.ascension}`,
  rowClass: (r) => [r.target && "w-row-hl", r.clickable && "w-row-click"].filter(Boolean).join(" "),
  columns: [
    { key: "ascension", label: "ascenze", fmt: (v, r) => `<span style="white-space:nowrap">${r.target ? "▶ " : ""}${r.fromLevel > 1 ? `dodělat A${v} (L${r.fromLevel}→50)` : `A${v}`}</span>` },
    { key: "xp", label: "XP", align: "right", fmt: (v) => `${(v / 1e6).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} M` },
    { key: "days", label: "dní", align: "right", fmt: num },
    { key: "flower", label: "FLOWER", labelHtml: sflIcon(), align: "right", fmt: num },
    { key: "cumDays", label: "celkem dní", align: "right", fmt: (v) => `<b>${num(v)}</b>` },
    { key: "date", label: "datum", align: "right", get: (r) => r.cumDays, fmt: (v, r) => date(v, r.now) },
    { key: "cumFlower", label: "celkem FLOWER", labelHtml: `celkem ${sflIcon()}`, align: "right", fmt: (v) => `<b>${num(v)}</b>` },
    { key: "points", label: "body", title: "Volné skill body na konci (1 za level; levely ascenze se počítají po vylepšení ostrova)", align: "right", fmt: (v) => (v == null ? "" : String(v)) },
  ],

  // data: { farm, leveling: <compute?section=leveling data>, book: <marketplace book> }
  // ctx:  { plan?, cfg?, free? } — the LEVELING page passes what it already computed;
  //       otherwise { savedLeveling } and the plan is computed here like the page does.
  //       rowClick: the page wires a row click (sets the target).
  build({ farm, leveling, book }, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "Chybí data farmy." };
    let { plan, cfg, free } = ctx;
    if (!plan) {
      if (!leveling || !leveling.inputs) return { rows: [], footer: "", empty: "Plán LEVELINGu se nenačetl." };
      ({ plan, cfg, free } = planFor(farm, leveling, book || null, ctx.savedLeveling));
    }
    const now = Date.now();
    const target = cfg && cfg.target ? cfg.target.ascension : null;
    const rows = levelingLadder(farm, plan, 10, free || 0).map((r) => ({ ...r, target: r.ascension === target, clickable: !!ctx.rowClick && r.ascension !== target, now }));
    return { rows, footer: "", empty: "Všechny ascenze do A10 máš za sebou." };
  },
};
