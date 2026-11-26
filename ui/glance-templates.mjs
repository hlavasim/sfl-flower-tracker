// Glance templates (engine v3, docs/superpowers/plans/2026-11-26-glance-templates.md): a curated
// catalogue of hand-designed looks. A widget gives a layered model — head (the one number), items
// (the main list), tiles (key numbers), series (a time line) — and every template that its data
// fills well, and that shows something a smaller look of the same kind does not, is offered.
//
// Everything is designed at a 170 px reference cell and sized in em: the face scales with its width
// (.gx sets font-size from the container), so a template's slot counts hold at any board width.

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tone = (t) => (t ? ` g-${t}` : "");
const pct = (p) => Math.min(100, Math.max(0, Number(p) || 0));

// ── building blocks (em-sized; the face's font-size is 13 px at the reference cell) ──
export function countdown(at, now = Date.now()) {
  const ms = Number(at) - now;
  if (!(ms > 0)) return "Ready";
  const m = Math.ceil(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d >= 365) return `${(d / 365).toFixed(1)}y`;
  if (d >= 60) return `${Math.round(d / 30)}mo`;
  return d >= 1 ? `${d}d ${h % 24}h` : h >= 1 ? `${h}h ${m % 60}m` : `${m}m`;
}
// an item's tag: a live countdown (at), else its chip, else its value
function tagOf(it, now) {
  if (it.at != null) {
    const ready = Number(it.at) <= now;
    return { html: `<span class="g-at" data-at="${Number(it.at)}">${esc(countdown(it.at, now))}</span>`, tone: ready ? "ok" : "info", text: countdown(it.at, now) };
  }
  if (it.chip) return { html: esc(it.chip.text), tone: it.chip.tone, text: it.chip.text };
  if (it.value != null && it.value !== "") return { html: esc(it.value), tone: it.tone, text: String(it.value) };
  return null;
}
const icon = (it) => it.icon || `<span class="g-ini">${esc(String(it.name || "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2) || "?")}</span>`;
function ringSvg(p, t = "ok") {
  const r = 22, c = 2 * Math.PI * r;
  return `<svg class="gx-ring${tone(t)}" viewBox="0 0 54 54"><circle cx="27" cy="27" r="${r}" class="g-ring-bg"/>` +
    `<circle cx="27" cy="27" r="${r}" class="g-ring-fg" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - pct(p) / 100)).toFixed(2)}" transform="rotate(-90 27 27)"/></svg>`;
}
// The ring sits in the top-right corner of the box the head is in (the card, or its half of a
// split), never next to the number wherever that ends up; top = the head opens the box, so its text
// keeps clear of the ring.
// meter = a split or dashboard: the ring's share becomes a bar under the number instead.
function headBlock(h, { ring = true, big = "", top = false, meter = false } = {}) {
  if (!h) return "";
  if (meter && h.ring != null && h.meter == null) h = { ...h, meter: h.ring, meterTone: h.ringTone || "ok" };
  if (meter) ring = false;
  return (ring && h.ring != null ? `<div class="gx-corner">${ringSvg(h.ring, h.ringTone || "ok")}</div>` : "") +
    `<div class="gx-head${big ? ` gx-head-${big}` : ""}${top && ring && h.ring != null ? " gx-head-top" : ""}">` +
    `<div class="gx-num${tone(h.tone)}${String(h.value ?? "").length + String(h.unit ?? "").length >= 8 ? " gx-num-long" : ""}">${esc(h.value)}${h.unit ? `<small>${esc(h.unit)}</small>` : ""}</div>` +
    (h.cap ? `<div class="gx-cap">${esc(h.cap)}</div>` : "") +
    (h.meter != null ? `<div class="gx-meter"><i class="g-${h.meterTone || "accent"}" style="width:${Math.round(pct(h.meter))}%"></i></div>` : "") + `</div>`;
}
// stack: a narrow column — the tag goes under the name (coloured) instead of a chip beside it, so the
// name keeps its width
// A list that cannot show everything says so: its last slot is "+N more" (as the icon grids do).
const cut = (items, n) => (items.length > n ? [items.slice(0, Math.max(1, n - 1)), items.length - Math.max(1, n - 1)] : [items, 0]);
const moreRow = (k, cls) => (k ? `<div class="${cls} gx-more-row">+${k} more</div>` : "");
function rowsBlock(items, n, now, cols = 1, stack = false) {
  const [shown, rest] = cut(items, n);
  return `<div class="gx-rows${cols > 1 ? ` gx-cols-${cols}` : ""}">` + shown.map((it) => {
    const t = tagOf(it, now);
    if (stack) return `<div class="gx-row"><span class="gx-ic">${icon(it)}</span><div class="gx-n">${esc(it.name)}` +
      `${t ? `<div class="gx-sub-tag${tone(t.tone)}">${t.html}</div>` : it.sub ? `<div>${esc(it.sub)}</div>` : ""}</div></div>`;
    return `<div class="gx-row"><span class="gx-ic">${icon(it)}</span><div class="gx-n">${esc(it.name)}${it.sub ? `<div>${esc(it.sub)}</div>` : ""}</div>` +
      (t ? `<span class="gx-chip${tone(t.tone)}">${t.html}</span>` : "") + `</div>`;
  }).join("") + moreRow(rest, "gx-row") + `</div>`;
}
function linesBlock(items, n, now, cols = 1) {
  const [shown, rest] = cut(items, n);
  return `<div class="gx-lines${cols > 1 ? ` gx-cols-${cols}` : ""}">` + shown.map((it) => {
    const t = tagOf(it, now);
    return `<div class="gx-line"><span>${esc(it.name)}</span>${t ? `<b class="${tone(t.tone).trim()}">${t.html}</b>` : ""}</div>`;
  }).join("") + moreRow(rest, "gx-line") + `</div>`;
}
// Icons in c equal columns (1-4), rows centred; the last cell says "+N" when more than fit.
function iconsBlock(items, cap, cols, now) {
  const over = items.length > cap, shown = over ? items.slice(0, cap - 1) : items;
  return `<div class="gx-icons" style="--c:${cols}">` + shown.map((it) => {
    const t = tagOf(it, now);
    return `<div class="gx-cell" title="${esc(it.name)}${it.sub ? ` · ${esc(it.sub)}` : ""}"><span class="gx-ic">${icon(it)}</span>` +
      (t ? `<small class="gx-tag${tone(t.tone)}">${t.html}</small>` : "") + `</div>`;
  }).join("") + (over ? `<div class="gx-cell gx-more"><span>+${items.length - shown.length}</span></div>` : "") + `</div>`;
}
function tilesBlock(tiles, n, cols, asList = false) {
  if (asList) return `<div class="gx-numlist">` + tiles.slice(0, n).map((t) => `<div><span>${esc(t.label)}</span><b>${esc(t.value)}</b></div>`).join("") + `</div>`;
  return `<div class="gx-tiles${cols === 2 ? " gx-tiles-2" : ""}" style="--c:${cols}">` + tiles.slice(0, n).map((t) =>
    `<div><span>${esc(t.label)}</span><b>${esc(t.value)}</b>${t.sub ? `<small>${esc(t.sub)}</small>` : ""}</div>`).join("") + `</div>`;
}
function barsBlock(items, n, now) {
  return `<div class="gx-bars">` + items.filter((x) => Number.isFinite(Number(x.pct))).slice(0, n).map((it) => {
    const t = tagOf(it, now);
    return `<div class="gx-bar"><div class="gx-bar-top"><span>${esc(it.name)}</span>${t ? `<b class="${tone(t.tone).trim()}">${t.html}</b>` : ""}</div>` +
      `<div class="gx-meter"><i class="g-${it.tone || "ok"}" style="width:${Math.round(pct(it.pct))}%"></i></div></div>`;
  }).join("") + `</div>`;
}
function sparkSvg(values, t = "ok") {
  const v = (values || []).map(Number).filter(Number.isFinite);
  if (v.length < 2) return "";
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((x, k) => [(k / (v.length - 1)) * 300, 42 - ((x - lo) / span) * 36]);
  const line = pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(0)} ${y.toFixed(1)}`).join(" ");
  return `<svg class="gx-spark${tone(t)}" viewBox="0 0 300 46" preserveAspectRatio="none"><path d="${line} L300 46 L0 46Z" class="g-spark-fill"/><path d="${line}" class="g-spark-line"/></svg>`;
}
function gaugeBlock(h) {
  return `<div class="gx-gauge${String(h.value).length >= 5 ? " gx-gauge-long" : ""}">${ringSvg(h.ring, h.ringTone || "ok")}<div class="gx-gauge-in"><b class="${tone(h.tone).trim()}">${esc(h.value)}</b>${h.unit ? `<small>${esc(h.unit)}</small>` : ""}</div></div>` +
    (h.cap ? `<div class="gx-cap gx-center">${esc(h.cap)}</div>` : "");
}
function nextBlock(it, now, wide) {
  const t = tagOf(it, now);
  return `<div class="gx-next${wide ? " gx-next-wide" : ""}"><span class="gx-ic gx-ic-xl">${icon(it)}</span><div class="gx-next-txt">` +
    `<div class="gx-next-name">${esc(it.name)}</div>${it.sub ? `<div class="gx-cap">${esc(it.sub)}</div>` : ""}` +
    (t ? `<div class="gx-next-tag${tone(t.tone)}">${t.html}</div>` : "") + `</div></div>`;
}
const foot = (m) => (m.foot ? `<div class="gx-foot">${esc(m.foot)}</div>` : "");

// ── the catalogue ──
// pres: the kind of presentation (dedupe runs within one); needs: the layers it requires;
// slots(m): how many things it can show; shows(m): how many it shows; fill: the share that must be
// filled for it to be offered (lists 0.75, grids 0.5, a head-only look 1 = always).
const it = (m) => m.items || [];
const iconsOf = (m) => it(m).filter((x) => x.icon);
const withPct = (m) => it(m).filter((x) => Number.isFinite(Number(x.pct)));
const tl = (m) => m.tiles || [];
const LIST = 0.75, GRID = 0.5;
const T = (id, size, pres, needs, slots, render, extra = {}) => ({ id, size, pres, needs, slots, render, fill: extra.fill ?? (slots ? LIST : 1), narrow: extra.narrow || null, name: extra.name || id });

export const TEMPLATES = [
  // 1×1 — one piece of information
  T("number", "1x1", "number", ["head"], null, (m) => (m.head.hero ? `<div class="gx-hero-ic"><span class="gx-ic">${m.head.hero}</span></div>` : "") + headBlock(m.head), { name: "Number" }),
  T("gauge", "1x1", "gauge", ["ring"], null, (m) => gaugeBlock(m.head), { name: "Gauge" }),
  T("next", "1x1", "next", ["items"], null, (m, now) => nextBlock(it(m)[0], now, false), { name: "Next up" }),
  T("icons-1", "1x1", "icons", ["icons"], () => 6, (m, now) => iconsBlock(iconsOf(m), 6, iconCols(Math.min(6, iconsOf(m).length), 1, 1), now), { fill: GRID, name: "Icons" }),
  T("list-1", "1x1", "list", ["items"], () => 3, (m, now) => rowsBlock(it(m), 3, now, 1, true), { name: "List" }),
  T("lines-1", "1x1", "lines", ["items"], () => 4, (m, now) => linesBlock(it(m), 4, now), { name: "Lines" }),
  T("tiles-1", "1x1", "tiles", ["tiles3"], () => 3, (m) => tilesBlock(tl(m), 3, 1, true), { fill: GRID, name: "Numbers" }),
  // 2×1 — the number with one more layer
  T("number-list-2", "2x1", "number-list", ["head", "items"], () => 3, (m, now) => `<div class="gx-split"><div>${headBlock(m.head, { meter: true })}</div>${rowsBlock(it(m), 3, now, 1, true)}</div>`, { name: "Number + list" }),
  T("number-tiles-2", "2x1", "number-tiles", ["head", "tiles"], () => 3, (m) => `<div class="gx-split"><div>${headBlock(m.head, { meter: true })}</div>${tilesBlock(tl(m), 3, 1, true)}</div>`, { fill: GRID, name: "Number + numbers" }),
  T("strip-2", "2x1", "strip", ["icons"], () => 6, (m, now) => iconsBlock(iconsOf(m), 6, Math.min(6, iconsOf(m).length), now), { fill: 0.6, name: "Icon strip" }),
  T("next-2", "2x1", "next-list", ["items"], () => 3, (m, now) => `<div class="gx-split">${nextBlock(it(m)[0], now, true)}${rowsBlock(it(m).slice(1), 2, now, 1, true)}</div>`, { name: "Next up + list" }),
  T("list-2", "2x1", "list", ["items"], () => 6, (m, now) => rowsBlock(it(m), 6, now, 2, true), { name: "List" }),
  T("chart-2", "2x1", "chart", ["head", "series"], null, (m) => `<div class="gx-split gx-split-chart"><div>${headBlock(m.head, { ring: false })}</div>${sparkSvg(m.series)}</div>`, { name: "Chart" }),
  // 1×2 — a column
  T("number-list-t", "1x2", "number-list", ["head", "items"], () => 6, (m, now) => headBlock(m.head, { top: true }) + rowsBlock(it(m), 6, now, 1, true), { name: "Number + list" }),
  T("icons-t", "1x2", "icons", ["icons"], () => 8, (m, now) => iconsBlock(iconsOf(m), 8, 2, now), { fill: GRID, name: "Icons" }),
  T("bars-t", "1x2", "bars", ["pct"], () => 7, (m, now) => barsBlock(it(m), 7, now), { name: "Bars" }),
  T("lines-t", "1x2", "lines", ["items"], () => 12, (m, now) => linesBlock(it(m), 12, now), { name: "Lines" }),
  T("tiles-t", "1x2", "tiles", ["tiles3"], () => 6, (m) => tilesBlock(tl(m), 6, 1, true), { fill: GRID, name: "Numbers" }),
  // 2×2 — the overview
  T("overview-4", "2x2", "overview", ["head", "items", "tiles"], () => 4, (m, now) => headBlock(m.head, { top: true }) + tilesBlock(tl(m), 3, 3) + rowsBlock(it(m), 4, now), { fill: 0.5, name: "Overview" }),
  T("icons-4", "2x2", "icons", ["icons"], () => 16, (m, now) => iconsBlock(iconsOf(m), 16, iconCols(Math.min(16, iconsOf(m).length), 2, 2), now), { fill: GRID, name: "Icons" }),
  T("chart-4", "2x2", "chart-list", ["head", "series"], () => 3, (m, now) => headBlock(m.head, { ring: false }) + sparkSvg(m.series) + rowsBlock(it(m), 3, now), { fill: 0, name: "Chart + list" }),
  T("list-4", "2x2", "list", ["items"], () => 8, (m, now) => rowsBlock(it(m), 8, now), { name: "List" }),
  T("gauge-list-4", "2x2", "gauge-list", ["ring", "items"], () => 5, (m, now) => `<div class="gx-split gx-split-gauge">${`<div>${gaugeBlock(m.head)}</div>`}${rowsBlock(it(m), 5, now, 1, true)}</div>`, { name: "Gauge + list" }),
  T("bars-4", "2x2", "number-bars", ["head", "pct"], () => 6, (m, now) => headBlock(m.head, { top: true }) + barsBlock(it(m), 6, now), { name: "Number + bars" }),
  // 4×1 — a wide band (a narrow board shows its twin)
  T("strip-w", "4x1", "strip", ["icons"], () => 8, (m, now) => iconsBlock(iconsOf(m), 8, Math.min(8, iconsOf(m).length), now), { fill: 0.6, narrow: "icons-4", name: "Icon strip" }),
  T("number-list-w", "4x1", "number-list", ["head", "items"], () => 6, (m, now) => `<div class="gx-split gx-split-w">${`<div>${headBlock(m.head, { meter: true })}</div>`}${rowsBlock(it(m), 6, now, 2)}</div>`, { narrow: "number-list-t", name: "Number + list" }),
  T("tiles-w", "4x1", "tiles", ["tiles"], () => 6, (m) => tilesBlock(tl(m), 6, Math.min(6, tl(m).length)), { fill: 0.6, narrow: "tiles-t", name: "Tiles" }),
  T("chart-w", "4x1", "chart", ["head", "series"], null, (m) => `<div class="gx-split gx-split-w gx-split-chart"><div>${headBlock(m.head, { ring: false })}</div>${sparkSvg(m.series)}</div>`, { narrow: "chart-4", name: "Chart" }),
  T("list-w", "4x1", "list", ["items"], () => 9, (m, now) => rowsBlock(it(m), 9, now, 3), { narrow: "list-4", name: "List" }),
  // 1×4 — a tall column
  T("list-tall", "1x4", "list", ["items"], () => 17, (m, now) => rowsBlock(it(m), 17, now, 1, true), { narrow: null, name: "List" }),
  T("icons-tall", "1x4", "icons", ["icons"], () => 16, (m, now) => iconsBlock(iconsOf(m), 16, 2, now), { fill: GRID, name: "Icons" }),
  // 4×2 / 2×4 — everything
  T("dashboard", "4x2", "dashboard", ["head", "items", "tiles", "series"], () => 8, (m, now) => `<div class="gx-dash"><div>${headBlock(m.head, { meter: true })}${tilesBlock(tl(m), 4, 2)}${m.series ? sparkSvg(m.series) : ""}</div>${rowsBlock(it(m), 8, now, 1, true)}</div>`, { fill: 0.75, narrow: "overview-4", name: "Dashboard" }),
  T("icons-wall", "4x2", "icons", ["icons"], () => 32, (m, now) => iconsBlock(iconsOf(m), 32, 8, now), { fill: GRID, narrow: "icons-4", name: "Icon wall" }),
  T("long-list", "2x4", "list", ["items"], () => 15, (m, now) => headBlock(m.head, { top: true }) + rowsBlock(it(m), 15, now) + foot(m), { name: "Long list" }),
];
export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);
const byId = new Map(TEMPLATES.map((t) => [t.id, t]));

// Equal icon columns 1-4 per unit of width, for n items in a W×H area: the most room per icon.
export function iconCols(n, w, h) {
  let best = { c: 1, size: 0 };
  for (let c = 1; c <= Math.min(4 * w, Math.max(1, n)); c++) {
    const r = Math.ceil(n / c), size = Math.min(w / c, h / (1.3 * r));
    if (size > best.size + 1e-9) best = { c, size };
  }
  return best.c;
}

function has(m, need) {
  if (need === "head") return !!m.head;
  if (need === "ring") return !!m.head && m.head.ring != null;
  if (need === "icon") return !!(m.head && m.head.hero) || iconsOf(m).length > 0;
  if (need === "items") return it(m).length > 0;
  if (need === "icons") return iconsOf(m).length >= 2;
  if (need === "pct") return withPct(m).length >= 2;
  if (need === "tiles") return tl(m).length >= 2;
  if (need === "tiles3") return tl(m).length >= 3;
  if (need === "series") return (m.series || []).length >= 2;
  return false;
}
const countFor = (t, m) => (t.pres.includes("icons") || t.pres === "strip" ? iconsOf(m).length
  : t.pres.includes("bars") ? withPct(m).length : t.pres === "tiles" || t.pres === "number-tiles" ? tl(m).length : it(m).length);
export const renderable = (t, m) => t.needs.every((n) => has(m, n));

// The looks worth offering for this model: needs present, filled well, and showing more than any
// smaller look of the same presentation. In catalogue order (by size).
export function looksFor(m, { cols = 12 } = {}) {
  const out = [], seen = new Map();   // pres → the most things a look of it already shows
  const cutPres = new Set();          // kinds whose smaller look would hide one or two things
  for (const t of TEMPLATES) {
    if (!renderable(t, m)) continue;
    let shown = 1;
    if (t.slots) {
      const slots = t.slots(m), n = countFor(t, m);
      shown = Math.min(n, slots);
      // a list that would hide just one or two things looks broken ("4/4" over three rows): the next
      // look of its kind that shows them all is offered instead, however full; long lists end in "+N more"
      if (!/icons|strip|tiles/.test(t.pres) && n > slots && n - slots <= 2) { cutPres.add(t.pres); continue; }
      const roomy = cutPres.has(t.pres) && shown === n;
      if (slots && shown / slots < t.fill && !roomy) continue;
      cutPres.delete(t.pres);
    }
    if (seen.has(t.pres) && seen.get(t.pres) >= shown && t.slots) continue;
    if (seen.has(t.pres) && !t.slots) continue;
    seen.set(t.pres, Math.max(seen.get(t.pres) || 0, shown));
    out.push(t.id);
  }
  if (cols >= 4) return out;
  const twin = (id) => { const t = byId.get(id); return Number(t.size[0]) > cols && t.narrow ? t.narrow : id; };
  return [...new Set(out.map(twin))].filter((id) => Number(byId.get(id).size[0]) <= cols);
}

// One look rendered: the template (or its narrow twin when the board is too narrow), falling back to
// the same-size number when its needs fail. Returns { id, size, html }.
export function renderLook(m, id, { cols = 12, now = Date.now() } = {}) {
  let t = byId.get(id) || byId.get("number");
  const w = Number(t.size[0]);
  if (w > cols && t.narrow) t = byId.get(t.narrow) || t;
  if (!renderable(t, m)) t = TEMPLATES.find((x) => x.size === t.size && renderable(x, m)) || (m.head ? byId.get("number") : byId.get("list-1"));
  return { id: t.id, size: t.size, html: `<div class="gx gx-${t.size}" style="--gw:${t.size[0]}">${t.render(m, now)}</div>` };
}
export const templateById = (id) => byId.get(id) || null;
