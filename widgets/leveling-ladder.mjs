// LEVELING · "Po ascenzích": days and FLOWER to the end of each ascension on the saved LEVELING
// config (core levelingLadder). On the LEVELING page a row click sets the target (the page wires
// that); on the board it is read-only.
import { levelingInit, levelingPlan, levelingLadder, levelingInputsWithBook } from "../core/sections/leveling.mjs";
import { sflIcon } from "../core/engine/power-formula.mjs";
import { big, compact, rows as gRows } from "../ui/glance.mjs";

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

const num = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—");
const date = (d, now) => (Number.isFinite(d) && d > 0 ? new Date(now + d * 86400000).toLocaleDateString("en-US") : "");

export const levelingLadderWidget = {
  type: "leveling-ladder",
  title: "🪜 By ascension",
  page: "leveling",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId }, leveling: { res: "leveling", farm: farmId }, book: { res: "book" } }),
  // Without the book the bids and bud prices are missing; the ladder still stands and refills.
  optional: ["book"],
  defaults: {},
  rowKey: (r) => `A${r.ascension}`,
  rowLabel: (r) => `A${r.ascension}`,
  rowClass: (r) => [r.target && "w-row-hl", r.clickable && "w-row-click"].filter(Boolean).join(" "),
  columns: [
    { key: "ascension", label: "ascension", fmt: (v, r) => `<span style="white-space:nowrap">${r.target ? "▶ " : ""}${r.fromLevel > 1 ? `finish A${v} (L${r.fromLevel}→50)` : `A${v}`}</span>` },
    { key: "xp", label: "XP", align: "right", fmt: (v) => `${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })} M` },
    { key: "days", label: "days", align: "right", fmt: num },
    { key: "flower", label: "FLOWER", labelHtml: sflIcon(), align: "right", fmt: num },
    { key: "cumDays", label: "total days", align: "right", fmt: (v) => `<b>${num(v)}</b>` },
    { key: "date", label: "date", align: "right", get: (r) => r.cumDays, fmt: (v, r) => date(v, r.now) },
    { key: "cumFlower", label: "total FLOWER", labelHtml: `total ${sflIcon()}`, align: "right", fmt: (v) => `<b>${num(v)}</b>` },
    { key: "points", label: "points", title: "Free skill points at the end (1 per level; ascension levels count after the island upgrade)", align: "right", fmt: (v) => (v == null ? "" : String(v)) },
  ],

  // data: { farm, leveling: <compute?section=leveling data>, book: <marketplace book> }
  // ctx:  { plan?, cfg?, free? } — the LEVELING page passes what it already computed;
  //       otherwise { savedLeveling } and the plan is computed here like the page does.
  //       rowClick: the page wires a row click (sets the target).
  build({ farm, leveling, book }, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    let { plan, cfg, free } = ctx;
    if (!plan) {
      if (!leveling || !leveling.inputs) return { rows: [], footer: "", empty: "The LEVELING plan did not load." };
      ({ plan, cfg, free } = planFor(farm, leveling, book || null, ctx.savedLeveling));
    }
    const now = Date.now();
    const target = cfg && cfg.target ? cfg.target.ascension : null;
    const rows = levelingLadder(farm, plan, 10, free || 0).map((r) => ({ ...r, target: r.ascension === target, clickable: !!ctx.rowClick && r.ascension !== target, now }));
    return { rows, footer: "", empty: "All ascensions up to A10 are behind you." };
  },
};

// ── iPhone glance face: S = total days to the target ascension and its date; M / L = the next
// ascensions with their total days and FLOWER ──
levelingLadderWidget.sizes = ["s", "m", "l"];
levelingLadderWidget.size = "s";
levelingLadderWidget.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = levelingLadderWidget.build(data, { ...ctx, rowClick: false });
  if (!out.rows.length) return { empty: out.empty };
  const t = out.rows.find((r) => r.target) || out.rows[0];
  const d = date(t.cumDays, t.now);
  const head = big(num(t.cumDays), { unit: " days", cap: `to the end of A${t.ascension}${d ? ` · ${d}` : ""}` }) +
    `<div class="g-cap">${compact(t.cumFlower)} FLOWER in total</div>`;
  if (size === "s") return { html: head };
  const list = gRows(out.rows.slice(0, size === "m" ? 3 : 7).map((r) => ({ name: `${r.target ? "▶ " : ""}A${r.ascension}`, sub: date(r.cumDays, r.now) || "",
    value: `${num(r.cumDays)} d · ${compact(r.cumFlower)}`, tone: r.target ? "accent" : "" })));
  return { html: size === "m" ? `<div class="g-split"><div>${head}</div>${list}</div>` : head + list };
};
