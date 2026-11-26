// The pieces an iPhone-style glance face is built from (a widget's glance(): the compact face shown on
// boards and in the ＋ gallery). Plain HTML strings; text is escaped, an `icon` is trusted HTML (the
// widget's ctx.icon). Tones: ok (green), warn (orange), bad (red), info (blue), accent.

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tone = (t) => (t ? ` g-${t}` : "");
const pct = (p) => Math.min(100, Math.max(0, Number(p) || 0));

// 142474 → "142k", 1712000 → "1.7M", 53712 → "53.7k", 87.67 → "87.7"
export function compact(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v), a = Math.abs(n), sign = n < 0 ? "−" : "";
  const fix = (x) => (x >= 100 ? Math.round(x).toString() : x.toFixed(1).replace(/\.0$/, ""));
  if (a >= 1e6) return sign + fix(a / 1e6) + "M";
  if (a >= 1e3) return sign + fix(a / 1e3) + "k";
  return sign + fix(a);
}

// The headline number, with a small unit and a caption under it.
export function big(value, { unit = "", cap = "", tone: t = "" } = {}) {
  return `<div class="g-big${tone(t)}">${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ""}</div>` + (cap ? `<div class="g-cap">${esc(cap)}</div>` : "");
}

// A progress ring (top right of a small widget).
export function ring(p, { tone: t = "ok", size = 54 } = {}) {
  const r = 22, c = 2 * Math.PI * r;
  return `<svg class="g-ring${tone(t)}" width="${size}" height="${size}" viewBox="0 0 54 54"><circle cx="27" cy="27" r="${r}" class="g-ring-bg"/>` +
    `<circle cx="27" cy="27" r="${r}" class="g-ring-fg" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - pct(p) / 100)).toFixed(2)}" transform="rotate(-90 27 27)"/></svg>`;
}

// A thin bar.
export const meter = (p, t = "ok") => `<div class="g-meter"><i class="g-${t}" style="width:${Math.round(pct(p))}%"></i></div>`;

// A filled line over the values (oldest first), stretched to the widget's width.
export function spark(values, t = "ok") {
  const v = (values || []).map(Number).filter(Number.isFinite);
  if (v.length < 2) return "";
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((x, k) => [(k / (v.length - 1)) * 300, 42 - ((x - lo) / span) * 36]);
  const line = pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(0)} ${y.toFixed(1)}`).join(" ");
  return `<svg class="g-spark${tone(t)}" viewBox="0 0 300 46" preserveAspectRatio="none"><path d="${line} L300 46 L0 46Z" class="g-spark-fill"/><path d="${line}" class="g-spark-line"/></svg>`;
}

// Icon rows: [{ icon?, name, sub?, value?, tone?, chip?: { text, tone } }]
export function rows(list) {
  return `<div class="g-rows">` + (list || []).map((r) =>
    `<div class="g-row">${r.icon ? `<span class="g-ic">${r.icon}</span>` : ""}<div class="g-n">${esc(r.name)}${r.sub ? `<div>${esc(r.sub)}</div>` : ""}</div>` +
    (r.chip ? `<span class="g-chip${tone(r.chip.tone)}">${esc(r.chip.text)}</span>` : r.value != null ? `<span class="g-v${tone(r.tone)}">${esc(r.value)}</span>` : "") +
    `</div>`).join("") + `</div>`;
}

// Small tiles side by side: [{ label, value, sub? }]
export function tiles(list) {
  return `<div class="g-tiles">` + (list || []).map((t) =>
    `<div><span>${esc(t.label)}</span><b>${esc(t.value)}</b>${t.sub ? `<small>${esc(t.sub)}</small>` : ""}</div>`).join("") + `</div>`;
}

// ── One layout engine for every widget: a model → any size × style ──
// model: {
//   head?:   { value, unit?, cap?, tone?, ring?: pct, ringTone?, meter?: pct, meterTone?, hero?: iconHtml },
//   items?:  [{ icon?, name, sub?, value?, tone?, chip?: { text, tone }, pct? }],   the list (rows, icons, bars)
//   tiles?:  [{ label, value, sub? }],                                            key numbers
//   series?: [numbers], oldest first,                                             a chart
//   foot?:   text, a closing line }
// Sizes are W×H in board cells (an iPhone small widget = 1×1). Styles:
//   number  the headline (with its ring / meter), then the list as space allows
//   rows    the list: icon, name, sub line, value or chip
//   compact the list as dense text lines (no icons), more of them
//   icons   a grid of icons with a tag under each
//   tiles   the key numbers as tiles
//   bars    the list as horizontal bars (each item's pct)
//   chart   the series as a filled line, the headline over it
//   hero    the first item's (or the headline's) big icon and the headline
export const SIZES = ["1x1", "2x1", "1x2", "2x2", "4x1", "1x4", "4x2", "2x4"];
export const STYLES = ["number", "rows", "compact", "icons", "tiles", "bars", "chart", "hero"];
const ALIAS = { s: "1x1", m: "2x1", t: "1x2", l: "2x2" };
export const dims = (size) => { const [w, h] = (ALIAS[size] || size || "1x1").split("x").map(Number); return { w: w || 1, h: h || 1 }; };

function headHtml(h) {
  if (!h) return "";
  return (h.ring != null ? `<div class="g-corner">${ring(h.ring, { tone: h.ringTone || "ok" })}</div>` : "") +
    (h.hero ? `<div class="g-hero">${h.hero}</div>` : "") + big(h.value, { unit: h.unit, cap: h.cap, tone: h.tone }) +
    (h.meter != null ? meter(h.meter, h.meterTone || "accent") : "");
}
const footHtml = (m) => (m.foot ? `<div class="g-cap g-foot">${esc(m.foot)}</div>` : "");
// a list in `cols` columns of `per` rows each
function listHtml(list, cols, cls = "g-rows") {
  return `<div class="${cls}${cols > 1 ? ` g-cols-${cols}` : ""}">` + rows(list).slice('<div class="g-rows">'.length);
}
// The icon grid for n items in a W×H area: the columns × rows that give each icon the most room (a
// cell is about 1 wide × 1.3 tall with its tag), so 4 items are 2×2 in 1×1, 4×1 in a wide one, 1×4
// in a tall one. More than fit at a readable size: the last cell says how many more.
const ICON_MIN = 0.3;   // the smallest icon cell, in board cells
function iconGrid(n, w, h) {
  let best = { c: 1, r: Math.max(1, n), size: 0 };
  for (let c = 1; c <= Math.max(1, n); c++) {
    const r = Math.ceil(n / c), size = Math.min(w / c, h / (1.3 * r));
    if (size > best.size + 1e-9 || (Math.abs(size - best.size) < 1e-9 && c * r < best.c * best.r)) best = { c, r, size };
  }
  return best;
}
export function iconCap(w, h) {
  let k = 1;
  while (k < 200 && iconGrid(k + 1, w, h).size >= ICON_MIN) k++;
  return k;
}
function iconsHtml(items, w, h) {
  const cap = iconCap(w, h);
  const shown = items.length > cap ? items.slice(0, cap - 1) : items;
  const cells = shown.length + (items.length > cap ? 1 : 0);
  const { c, r } = iconGrid(cells, w, h);
  const more = items.length > cap ? `<div class="g-cell g-more">+${items.length - shown.length}</div>` : "";
  return `<div class="g-icons" style="--gc:${c};--gr:${r}">` + shown.map((it) => {
    const tag = it.chip ? it.chip.text : it.value != null ? it.value : "";
    const tt = it.chip ? it.chip.tone : it.tone;
    return `<div class="g-cell" title="${esc(it.name)}${it.sub ? ` · ${esc(it.sub)}` : ""}"><span class="g-ic">${it.icon || esc(String(it.name || "?").slice(0, 2))}</span>` +
      (tag !== "" ? `<small class="g-tag${tone(tt)}">${esc(tag)}</small>` : "") + `</div>`;
  }).join("") + more + `</div>`;
}
function compactHtml(items, cols, n) {
  return `<div class="g-lines${cols > 1 ? ` g-cols-${cols}` : ""}">` + items.slice(0, n).map((it) =>
    `<div class="g-line"><span>${esc(it.name)}</span><b class="${it.chip ? `g-chip-t${tone(it.chip.tone)}` : tone(it.tone).trim()}">${esc(it.chip ? it.chip.text : it.value ?? "")}</b></div>`).join("") + `</div>`;
}
function barsHtml(items, n) {
  return `<div class="g-bars">` + items.slice(0, n).map((it) =>
    `<div class="g-bar-row">${it.icon ? `<span class="g-ic g-ic-s">${it.icon}</span>` : ""}<div class="g-bar-main"><div class="g-bar-top"><span>${esc(it.name)}</span>` +
    `<b>${esc(it.chip ? it.chip.text : it.value ?? "")}</b></div>${meter(it.pct, it.tone || "ok")}</div></div>`).join("") + `</div>`;
}
// tiles: the model's own, else the headline and the first items as tiles
const tilesOf = (m) => (m.tiles && m.tiles.length ? m.tiles
  : [...(m.head ? [{ label: m.head.cap || "", value: `${m.head.value}${m.head.unit || ""}` }] : []),
    ...(m.items || []).map((it) => ({ label: it.name, value: it.chip ? it.chip.text : it.value ?? "", sub: it.sub }))]);
function tilesHtml(list, w, h) {
  const cols = Math.max(2, w * 2), cap = cols * h * (w === 1 ? 2 : 1);
  return `<div class="g-tgrid" style="--gc:${Math.min(cols, list.length) || 1}">` + list.slice(0, cap).map((t) =>
    `<div><span>${esc(t.label)}</span><b>${esc(t.value)}</b>${t.sub ? `<small>${esc(t.sub)}</small>` : ""}</div>`).join("") + `</div>`;
}

// Which styles this model can fill.
export function stylesFor(m) {
  const it = (m && m.items) || [];
  return STYLES.filter((st) => (st === "number" ? !!m.head
    : st === "rows" || st === "compact" ? it.length > 0
    : st === "icons" ? it.some((x) => x.icon)
    : st === "tiles" ? tilesOf(m).length >= 2
    : st === "bars" ? it.some((x) => Number.isFinite(Number(x.pct)))
    : st === "chart" ? (m.series || []).length >= 2
    : st === "hero" ? !!m.head && !!(m.head.hero || (it[0] && it[0].icon)) : false));
}
// How many of the model's things a size shows in a style (the same numbers layout() uses).
const listCols = (w) => (w >= 4 ? 2 : 1);
function shows(st, w, hh) {
  if (st === "number") return w === 1 && hh === 1 ? 0 : hh === 1 ? 3 * listCols(w) : listCols(w) * (hh * 3 - 2);
  if (st === "rows") return (w === 2 && hh === 1 ? 2 : listCols(w)) * hh * 3;
  if (st === "compact") return (w >= 2 ? 2 : 1) * hh * 5;
  if (st === "icons") return iconCap(w, hh);
  if (st === "bars") return hh * 3;
  if (st === "tiles") return Math.max(2, w * 2) * hh * (w === 1 ? 2 : 1);
  return 1;
}
function needs(st, m) {
  const it = m.items || [];
  if (st === "tiles") return tilesOf(m).length;
  if (st === "bars") return it.filter((x) => Number.isFinite(Number(x.pct))).length;
  return it.length;
}
// Only the sizes that show something a smaller one cannot: a style grows through the sizes (by area)
// until all its content fits, so four weather items never offer a 4×2 that is mostly empty. A chart
// and a hero have nothing to grow into: they come at their own few sizes.
const FIXED = { chart: ["2x1", "4x1"], hero: ["1x1", "2x1"] };
export function sizesFor(m, st) {
  if (FIXED[st]) return FIXED[st];
  const need = needs(st, m), out = [];
  let best = -1;
  for (const size of SIZES) {
    const { w, h } = dims(size), n = Math.min(need, shows(st, w, h));
    if (out.length && (best >= need || n <= best)) continue;
    out.push(size);
    best = Math.max(best, n);
  }
  return out;
}
// Every look worth offering, in the order the ◀ ▶ arrows walk them (size by size).
export function variants(m) {
  const st = stylesFor(m || {});
  const per = Object.fromEntries(st.map((s) => [s, new Set(sizesFor(m, s))]));
  return SIZES.flatMap((size) => st.filter((s) => per[s].has(size)).map((style) => ({ size, style })));
}

export function layout(model, size = "1x1", style = "number") {
  const m = model || {}, items = m.items || [], h = m.head;
  const { w, h: hh } = dims(size);
  const ok = stylesFor(m);
  let st = STYLES.includes(style) && ok.includes(style) ? style : ok.includes("number") ? "number" : ok[0] || "number";
  const cols = listCols(w);
  if (st === "icons") return iconsHtml(items, w, hh);
  if (st === "rows") { const c = w === 2 && hh === 1 ? 2 : cols; return listHtml(items.slice(0, shows("rows", w, hh)), c) + (hh > 1 ? footHtml(m) : ""); }
  if (st === "compact") return compactHtml(items, w >= 2 ? 2 : 1, shows("compact", w, hh)) + (hh > 1 ? footHtml(m) : "");
  if (st === "tiles") return tilesHtml(tilesOf(m), w, hh);
  if (st === "bars") return barsHtml(items.filter((x) => Number.isFinite(Number(x.pct))), shows("bars", w, hh));
  if (st === "chart") return `<div class="g-head-top">${headHtml(h ? { ...h, ring: undefined } : null)}</div>` + spark(m.series) + (hh > 1 ? footHtml(m) : "");
  if (st === "hero") {
    const icon = h.hero || (items[0] && items[0].icon);
    return `<div class="g-heroline"><div class="g-hero g-hero-xl">${icon}</div><div>${big(h.value, { unit: h.unit, cap: h.cap, tone: h.tone })}</div></div>`;
  }
  // number
  const n = shows("number", w, hh);
  if (!items.length || n === 0) return headHtml(h) + (hh > 1 && m.spark ? spark(m.spark) : "") + (hh > 1 || w > 1 ? footHtml(m) : "");
  if (hh === 1) return `<div class="g-split${w >= 4 ? " g-split-wide" : ""}"><div>${headHtml(h)}</div>${listHtml(items.slice(0, n), cols)}</div>`;
  return `<div class="g-head-top">${headHtml(h)}</div>` + listHtml(items.slice(0, n), cols) + footHtml(m);
}
