// Small graphics the widgets share (styled by the .v-* rules in flowers.html): a progress bar per
// row, summary tiles with a big bar, a status pill, a progress ring. Plain HTML strings.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (p) => (Number.isFinite(+p) ? Math.max(0, Math.min(100, Math.round(+p))) : 0);

// How far along → a tone: under half "bad" (red), under full "mid" (yellow), full "ok" (green).
export const toneOf = (p) => (p >= 100 ? "ok" : p >= 50 ? "mid" : "bad");

export const bar = (p, tone = toneOf(p)) => `<div class="v-bar"><i class="v-${tone}" style="width:${pct(p)}%"></i></div>`;

// [{ v, l }] → a row of tiles (value big, label small)
export const kpis = (list) => `<div class="v-kpis">` + list.map((k) => `<div class="v-kpi"><b>${esc(k.v)}</b><span>${esc(k.l)}</span></div>`).join("") + `</div>`;

export const bigBar = (p) => `<div class="v-big"><i style="width:${pct(p)}%"></i></div>`;

// tone: ok (green) · run (yellow) · idle (blue) · bad (red)
export const pill = (text, tone) => `<span class="v-pill v-${tone}">${esc(text)}</span>`;

// a ring filled to p % around a small icon (trusted HTML)
export const ring = (p, inner = "") => `<span class="v-ring" style="--p:${pct(p)}"><span>${inner}</span></span>`;
