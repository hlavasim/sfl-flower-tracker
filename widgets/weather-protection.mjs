// DASH · weather protection: the four Weather Shop items and whether each protects right now.
// The state per item (none / spent / partial / ok) is the DASH page's dashWeatherState
// (ctx.weatherRows); this module turns it into rows and words.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const STATE = {
  ok: { mark: "✓ active", color: "var(--green)", tip: (p) => `Active — protects against ${p}.` },
  partial: { mark: "✓/⚠ partly used", color: "#e8a060", tip: () => "Still covered, but some pieces are used up." },
  spent: { mark: "⚠ used up", color: "var(--red)", tip: (p) => `Placed, but used up by the last ${p} — renew it at the Weather Shop.` },
  none: { mark: "✗ missing", color: "var(--red)", tip: (p) => `Not placed — ${p} will hit you unprotected.` },
};
const missing = (s) => s === "none" || s === "spent";

export const weatherProtection = {
  type: "weather-protection",
  title: "🌦 Weather protection",
  page: "chores",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  defaults: {},
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (missing(r.state) ? "w-st-miss" : ""),
  columns: [
    { key: "name", label: "item", fmt: (v, r) => `<span style="white-space:nowrap">${r.iconHtml || ""} ${esc(v)}</span>` },
    { key: "state", label: "status", filter: true, filterLabel: (v) => (STATE[v] || {}).mark || v,
      fmt: (v, r) => { const s = STATE[v] || STATE.none; return `<span style="color:${s.color}" title="${esc(s.tip(r.prevents))}">${s.mark}</span>`; } },
    { key: "prevents", label: "protects against", fmt: (v) => esc(v) },
  ],

  // ctx: { weatherRows(farm) → [{ name, state, prevents, iconHtml? }] }
  build({ farm }, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    if (typeof ctx.weatherRows !== "function") return { rows: [], footer: "", empty: "The DASH weather state did not load." };
    const rows = ctx.weatherRows(farm);
    const gaps = rows.filter((r) => missing(r.state));
    const footer = gaps.length
      ? `<div style="color:var(--red)">${gaps.length}/${rows.length} uncovered — ${gaps.map((r) => esc(r.prevents)).join(", ")}</div>`
      : `<div style="color:var(--green)">All ${rows.length} active.</div>`;
    return { rows, footer, empty: "No weather items." };
  },
};

// ── iPhone glance model: the count protecting now (a ring) and every item with its state; the
// layout engine (ui/glance.mjs) lays it out at every size and style ──
const CHIP = { ok: ["active", "ok"], partial: ["partly used", "warn"], spent: ["used up", "bad"], none: ["missing", "bad"] };
weatherProtection.size = "1x1";
weatherProtection.glanceModel = (data = {}, ctx = {}) => {
  const out = weatherProtection.build(data, ctx);
  if (!out.rows.length) return { empty: out.empty };
  const n = out.rows.length, gaps = out.rows.filter((r) => missing(r.state));
  return {
    head: { value: n - gaps.length, unit: `/${n}`, tone: gaps.length ? "bad" : "ok", ring: ((n - gaps.length) / n) * 100, ringTone: gaps.length ? "bad" : "ok",
      cap: gaps.length ? `uncovered: ${gaps.map((r) => r.prevents).join(", ")}` : "all protected" },
    items: out.rows.map((r) => { const c = CHIP[r.state] || CHIP.none; return { icon: r.iconHtml || "", name: r.name, sub: r.prevents, chip: { text: c[0], tone: c[1] } }; }),
    tiles: [{ label: "protected", value: `${n - gaps.length}/${n}` }, { label: "uncovered", value: gaps.length }],
  };
};
