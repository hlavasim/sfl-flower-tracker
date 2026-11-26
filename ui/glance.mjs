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
function iconsHtml(items, w, h) {
  const cols = w * 2, cap = cols * h * 2;
  const shown = items.length > cap ? items.slice(0, cap - 1) : items;
  const more = items.length > cap ? `<div class="g-cell g-more">+${items.length - shown.length}</div>` : "";
  return `<div class="g-icons" style="--gc:${cols}">` + shown.map((it) => {
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
// Every size × style the model can fill, in the order the ◀ ▶ arrows walk them (size by size).
export function variants(m) {
  const st = stylesFor(m || {});
  return SIZES.flatMap((size) => st.filter((s) => s !== "hero" || ["1x1", "2x1"].includes(size)).map((style) => ({ size, style })));
}

export function layout(model, size = "1x1", style = "number") {
  const m = model || {}, items = m.items || [], h = m.head;
  const { w, h: hh } = dims(size);
  const ok = stylesFor(m);
  let st = STYLES.includes(style) && ok.includes(style) ? style : ok.includes("number") ? "number" : ok[0] || "number";
  const cols = w >= 4 ? 2 : 1;                   // a wide widget lists in two columns
  const perCol = hh * 3;                          // about three rows fit one cell's height
  if (st === "icons") return iconsHtml(items, w, hh);
  if (st === "rows") return listHtml(items.slice(0, (w === 2 && hh === 1 ? 2 : cols) * perCol), w === 2 && hh === 1 ? 2 : cols) + (hh > 1 ? footHtml(m) : "");
  if (st === "compact") return compactHtml(items, w >= 2 ? 2 : 1, (w >= 2 ? 2 : 1) * hh * 5) + (hh > 1 ? footHtml(m) : "");
  if (st === "tiles") return tilesHtml(tilesOf(m), w, hh);
  if (st === "bars") return barsHtml(items.filter((x) => Number.isFinite(Number(x.pct))), hh * 3 * (w >= 4 ? 1 : 1));
  if (st === "chart") return `<div class="g-head-top">${headHtml(h ? { ...h, ring: undefined } : null)}</div>` + spark(m.series) + (hh > 1 ? footHtml(m) : "");
  if (st === "hero") {
    const icon = h.hero || (items[0] && items[0].icon);
    return `<div class="g-heroline"><div class="g-hero g-hero-xl">${icon}</div><div>${big(h.value, { unit: h.unit, cap: h.cap, tone: h.tone })}</div></div>`;
  }
  // number
  if (!items.length || (w === 1 && hh === 1)) return headHtml(h) + (hh > 1 && m.spark ? spark(m.spark) : "") + (hh > 1 || w > 1 ? footHtml(m) : "");
  if (hh === 1) return `<div class="g-split${w >= 4 ? " g-split-wide" : ""}"><div>${headHtml(h)}</div>${listHtml(items.slice(0, 3 * cols), cols)}</div>`;
  return `<div class="g-head-top">${headHtml(h)}</div>` + listHtml(items.slice(0, cols * (perCol - 2)), cols) + footHtml(m);
}
