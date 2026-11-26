// DASH · weather protection: the four Weather Shop items and whether each protects right now.
// The state per item (none / spent / partial / ok) is the DASH page's dashWeatherState
// (ctx.weatherRows); this module turns it into rows and words.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const STATE = {
  ok: { mark: "✓ aktivní", color: "var(--green)", tip: (p) => `Aktivní — chrání proti ${p}.` },
  partial: { mark: "✓/⚠ část spotřebovaná", color: "#e8a060", tip: () => "Krytí zbývá, ale část kusů je spotřebovaná." },
  spent: { mark: "⚠ spotřebovaný", color: "var(--red)", tip: (p) => `Postavený, ale spotřebovaný předchozí ${p} — obnov ho ve Weather Shopu.` },
  none: { mark: "✗ chybí", color: "var(--red)", tip: (p) => `Nemáš postavený — ${p} tě zasáhne bez ochrany.` },
};
const missing = (s) => s === "none" || s === "spent";

export const weatherProtection = {
  type: "weather-protection",
  title: "🌦 Ochrana před počasím",
  page: "chores",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  defaults: {},
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (missing(r.state) ? "w-st-miss" : ""),
  columns: [
    { key: "name", label: "předmět", fmt: (v, r) => `<span style="white-space:nowrap">${r.iconHtml || ""} ${esc(v)}</span>` },
    { key: "state", label: "stav", filter: true, filterLabel: (v) => (STATE[v] || {}).mark || v,
      fmt: (v, r) => { const s = STATE[v] || STATE.none; return `<span style="color:${s.color}" title="${esc(s.tip(r.prevents))}">${s.mark}</span>`; } },
    { key: "prevents", label: "chrání proti", fmt: (v) => esc(v) },
  ],

  // ctx: { weatherRows(farm) → [{ name, state, prevents, iconHtml? }] }
  build({ farm }, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "Chybí data farmy." };
    if (typeof ctx.weatherRows !== "function") return { rows: [], footer: "", empty: "Stav počasí z DASH se nenačetl." };
    const rows = ctx.weatherRows(farm);
    const gaps = rows.filter((r) => missing(r.state));
    const footer = gaps.length
      ? `<div style="color:var(--red)">${gaps.length}/${rows.length} nekrytých — ${gaps.map((r) => esc(r.prevents)).join(", ")}</div>`
      : `<div style="color:var(--green)">Všechny ${rows.length} aktivní.</div>`;
    return { rows, footer, empty: "Žádné předměty počasí." };
  },
};
