// DECORATIONS as widgets: the flower plan for the ascension band, its colour balance and what is
// left to grow (with the step-by-step placement guide per flower). The plan itself — the game's
// expansion geometry, the chosen layout, what stands on the farm — is the page's _decCompute(farm),
// handed over as ctx.plan; these only lay out its numbers.
import { bar, bigBar, pill } from "../ui/viz.mjs";
import { big, ring as gRing, rows as gRows, tiles as gTiles } from "../ui/glance.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n0 = (v) => Math.round(+v || 0).toLocaleString("en-US");
const icon = (ctx, n) => (typeof ctx.icon === "function" ? ctx.icon(n) : "");
const COLOURS = ["Red", "Yellow", "Purple", "Blue", "White"];
const SWATCH = { Red: "#e05a5a", Yellow: "#e8c85a", Purple: "#a878d8", Blue: "#5aa8e0", White: "#e8e4dc" };

const needs = (farmId) => ({ farm: { res: "farm", farm: farmId } });
// ctx: { plan(farm) → the page's _decCompute result, icon(name) → HTML, open() → Set of open guides }
function planOf({ farm } = {}, ctx = {}) {
  if (!farm) return { empty: "No farm data." };
  if (typeof ctx.plan !== "function") return { empty: "The plan is computed by the DECORATIONS page." };
  return { P: ctx.plan(farm) };
}
const tile = (v, l, s) => `<div class="v-kpi"><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(s)}</small></div>`;

export const decSummary = {
  type: "dec-summary",
  title: "🌸 Flower plan",
  page: "decorations",
  needs,
  view(data, ctx = {}) {
    const { P, empty } = planOf(data, ctx);
    if (!P) return { empty };
    const html = `<div class="v-kpis v-dec-kpis">` +
      tile("12 expansions", "ascension band", `${P.built} built, ${P.toCome} to come`) +
      tile(n0(P.ascTiles), "tiles there", "12 × 36") +
      tile(n0(P.plantable), "plantable", P.plantableNote) +
      tile(n0(P.planSize), "plan uses", P.totalNeed ? `${P.kinds} kinds` : "—") +
      tile(n0(P.totalMissing), "still to grow", P.totalMissing ? "not in inventory" : "all in hand ✓") +
      `</div>` + bigBar(P.totalNeed ? (P.totalDone / P.totalNeed) * 100 : 0) +
      `<div class="v-dim">${n0(P.totalDone)} of ${n0(P.totalNeed)} planned flowers already planted · ${P.expansions} expansions · ascension A${P.ascLevel}</div>`;
    return { html };
  },
};

export const decColours = {
  type: "dec-colours",
  title: "🎨 Colour balance",
  page: "decorations",
  needs,
  view(data, ctx = {}) {
    const { P, empty } = planOf(data, ctx);
    if (!P) return { empty };
    const by = P.byColour || {};
    const max = Math.max(1, ...COLOURS.map((c) => by[c] || 0));
    const even = new Set(COLOURS.map((c) => by[c] || 0)).size === 1;
    const html = `<div class="v-dec-colours">` + COLOURS.map((c) =>
      `<div class="v-dec-colour"><span class="v-dot" style="background:${SWATCH[c]}"></span><b>${c}</b>` +
      `<span class="v-count">${n0(by[c] || 0)}</span>${bar(((by[c] || 0) / max) * 100, even ? "ok" : "mid")}</div>`).join("") + `</div>` +
      (even ? pill("perfectly even across all five colours", "ok")
        : pill("not even — adjust the per-flower count or your JSON", "bad"));
    return { html };
  },
};

// ── iPhone glance faces ──
// summary: S = what is still to grow (ring: planned flowers already planted); M = planted / to grow / plantable
decSummary.sizes = ["s", "m"];
decSummary.size = "s";
decSummary.glance = (data, ctx = {}, opts = {}, size = "s") => {
  const { P, empty } = planOf(data, ctx);
  if (!P) return { empty };
  const pct = P.totalNeed ? (P.totalDone / P.totalNeed) * 100 : 0;
  if (size === "m") return { html: gTiles([{ label: "planted", value: n0(P.totalDone), sub: `of ${n0(P.totalNeed)}` },
    { label: "to grow", value: n0(P.totalMissing), sub: P.totalMissing ? "not in the bag" : "all in hand ✓" }, { label: "plantable", value: n0(P.plantable), sub: `A${P.ascLevel} band` }]) };
  return { html: `<div class="g-corner">${gRing(pct, { tone: pct >= 100 ? "ok" : "accent" })}</div>` + (P.totalMissing
    ? big(n0(P.totalMissing), { cap: `still to grow · ${n0(P.totalDone)} of ${n0(P.totalNeed)} planted` })
    : big("✓", { tone: "ok", cap: `all in hand · ${n0(P.totalDone)} of ${n0(P.totalNeed)} planted` })) };
};

// colours: S = even or not, with the five colours as one stacked bar
decColours.sizes = ["s"];
decColours.size = "s";
decColours.glance = (data, ctx = {}) => {
  const { P, empty } = planOf(data, ctx);
  if (!P) return { empty };
  const by = P.byColour || {}, total = COLOURS.reduce((s, c) => s + (by[c] || 0), 0);
  if (!total) return { empty: "The plan has no flowers in scope." };
  const even = new Set(COLOURS.map((c) => by[c] || 0)).size === 1;
  return { html: big(even ? "Even" : "Uneven", { tone: even ? "ok" : "bad", cap: `${n0(total)} flowers, five colours` }) +
    `<div class="g-stack">` + COLOURS.map((c) => `<i style="width:${(((by[c] || 0) / total) * 100).toFixed(1)}%;background:${SWATCH[c]}" title="${c} ${n0(by[c] || 0)}"></i>`).join("") + `</div>` };
};

// One flower's placement guide: the band (in scope) as a small grid with each target square's step
// number, and the walk from the previous tile of the same flower.
function guideHtml(r) {
  const g = r.guide || { steps: [], mini: { cols: 1, cells: [] } };
  const cells = g.mini.cells.map((c) => `<div title="${esc(c.title)}" class="${c.step ? (c.done ? "v-dec-done" : "v-dec-todo") : c.occ ? "v-dec-occ" : ""}" ` +
    `style="grid-column:${c.col};grid-row:${c.row}">${c.step ? `<span>${c.step}</span>` : ""}</div>`).join("");
  const steps = g.steps.map((s) => `<span class="v-dec-step ${s.done ? "v-dec-done" : "v-dec-todo"}"><b>${s.n}.</b> ${esc(s.move)}${s.done ? " ✓" : ""}</span>`).join("");
  return `<div class="v-dim" style="margin-bottom:8px">Each step is the move from the <b>previous ${esc(r.name)}</b> — <b class="v-done">green</b> is already standing there, ` +
    `<b style="color:var(--c-yellow)">amber</b> still to place. The number in a square is its step below. Follow them in order with the flower selected in your inventory.</div>` +
    `<div style="overflow-x:auto;margin-bottom:8px"><div class="v-dec-mini" style="grid-template-columns:repeat(${g.mini.cols},20px)">${cells}</div></div>` +
    `<div class="v-dec-steps">${steps}</div>`;
}

export const decGrow = {
  type: "dec-grow",
  title: "🌱 What to grow",
  page: "decorations",
  needs,
  view(data, ctx = {}) {
    const { P, empty } = planOf(data, ctx);
    if (!P) return { empty };
    if (!P.rows.length) return { empty: "The plan has no flowers in scope." };
    const open = typeof ctx.open === "function" ? ctx.open() : new Set();
    const head = `<div class="v-dim" style="margin-bottom:8px">plan needs ${n0(P.totalNeed)} · <b class="v-done">${n0(P.totalDone)} already planted</b>` +
      `${P.flowersDone ? ` (${P.flowersDone} of ${P.rows.length} flowers finished)` : ""} · ${n0(P.totalMissing)} still to grow · click a flower for its placement guide</div>`;
    const rows = P.rows.map((r) => {
      const fin = r.left === 0, on = open.has(r.name);
      return `<tr data-flower="${esc(r.name)}"${fin ? ` class="v-dec-fin"` : ""} onclick="_decToggleRow(this)" title="click for the placement guide" style="cursor:pointer">` +
        `<td><div class="v-name"><span class="dec-caret v-dim">${on ? "▾" : "▸"}</span>${icon(ctx, r.name)}<b>${esc(r.name)}</b></div></td>` +
        `<td>${bar(r.n ? (r.done / r.n) * 100 : 100)}</td>` +
        `<td class="v-dec-r">${n0(r.n)}</td>` +
        `<td class="v-dec-r">${r.done ? `<b class="v-done">${n0(r.done)}</b>` : `<span class="v-dim">–</span>`}</td>` +
        `<td class="v-dec-r v-dim">${n0(r.have)}</td>` +
        `<td class="v-dec-r">${fin ? pill("done", "ok") : r.missing ? `<span class="v-miss">${n0(r.missing)}</span>` : `<span class="v-done">✓</span>`}</td></tr>` +
        `<tr class="v-dec-guide" style="display:${on ? "table-row" : "none"}"><td colspan="6">${guideHtml(r)}</td></tr>`;
    }).join("");
    const html = head + `<div style="overflow-x:auto"><table class="w-table v-dec-table"><thead><tr><th>flower</th><th>planted</th>` +
      `<th class="v-dec-r">need</th><th class="v-dec-r">planted</th><th class="v-dec-r">in bag</th><th class="v-dec-r">to grow</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    return { html };
  },
};

// what to grow: S = the flower most still to grow; M / L = the flowers not yet finished, most missing first
decGrow.sizes = ["s", "m", "l"];
decGrow.size = "m";
decGrow.glance = (data, ctx = {}, opts = {}, size = "s") => {
  const { P, empty } = planOf(data, ctx);
  if (!P) return { empty };
  if (!P.rows.length) return { empty: "The plan has no flowers in scope." };
  const left = P.rows.filter((r) => r.left > 0).sort((a, b) => b.missing - a.missing || b.left - a.left);
  if (!left.length) return { html: big("✓", { tone: "ok", cap: `all ${P.rows.length} flower${P.rows.length === 1 ? "" : "s"} planted` }) };
  if (size === "s") {
    const r = left[0];
    return { html: `<div class="g-hero">${icon(ctx, r.name)}</div>` + (r.missing
      ? big(n0(r.missing), { tone: "bad", cap: `${r.name} to grow · ${left.length} flowers left` })
      : big(n0(r.left), { cap: `${r.name} to plant from the bag · ${left.length} flowers left` })) };
  }
  return { html: gRows(left.slice(0, size === "m" ? 3 : 7).map((r) => ({ icon: icon(ctx, r.name), name: r.name, sub: `${n0(r.done)} of ${n0(r.n)} planted`,
    ...(r.missing ? { value: `−${n0(r.missing)}`, tone: "bad" } : { chip: { text: "in bag", tone: "info" } }) }))) };
};
