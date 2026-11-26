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
