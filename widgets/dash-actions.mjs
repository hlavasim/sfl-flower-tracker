// DASH · "Co je hotové": every pending action on the farm (crops, trees, hives, cooking, bounties…)
// as one table — when it is ready, the category, what it is. The action list is the DASH page's own
// parser (ctx.dashActions, still inline in the page); this module only shapes it into rows.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const STATUS = { ready: "hotové", upcoming: "běží", empty: "nečinné" };
// Ready first (most overdue first), then upcoming (soonest first); idle is blank → always last.
const whenKey = (r) => (r.status === "ready" ? (r.readyAt || 0) - 1e13 : r.status === "upcoming" ? r.readyAt : null);

export const dashActions = {
  type: "dash-actions",
  title: "🚨 Co je hotové",
  page: "dashboard",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  // deliveries alone can be 50+ rows: the first 20 by default, the rest via the cog (top N / Filtr)
  defaults: { sort: { key: "when", dir: "asc" }, rows: { mode: "top", top: 20, picked: [] } },
  // the "➡ Craft / ➡ Catch" suggestions stop at these limits; blank = the page's LIMIT
  optionsLabel: "Limity",
  options: [
    { key: "dollLimit", label: "Panenky do (prázdné = LIMIT stránky)", kind: "number", min: 1, max: 9999 },
    { key: "crabLimit", label: "Korýši do (prázdné = LIMIT stránky)", kind: "number", min: 1, max: 9999 },
  ],
  rowKey: (r) => `${r.category}|${r.label}`,
  rowLabel: (r) => `${r.category}: ${r.label}`,
  rowClass: (r) => `w-st-${r.status}`,
  columns: [
    { key: "when", label: "kdy", get: whenKey, fmt: (v, r) => r.status === "ready" ? `<span class="dash-ready-badge green">READY</span>`
      : r.status === "upcoming" ? (r.readyAt > 0 && r.readyAt < Infinity ? `<span class="dash-time growing-bed-time" data-ready="${r.readyAt}">${esc(r.countdown)}</span>` : "")
      : `<span class="dash-ready-badge blue">IDLE</span>` },
    { key: "category", label: "kategorie", filter: true, fmt: (v, r) => `<span style="white-space:nowrap">${r.icon || ""} ${esc(v)}</span>` },
    { key: "label", label: "co", fmt: (v, r) => (r.labelHtml || esc(v)) +
      (r.detailHtml || r.detail ? `<div class="dash-detail">${r.detailHtml || esc(r.detail)}</div>` : "") },
    { key: "eff", label: "efektivita", get: (r) => (r.efficiency ? r.efficiency.value : null),
      fmt: (v, r) => (r.efficiency ? `<span class="dash-eff">${esc(r.efficiency.label)}</span>` : "") },
    { key: "status", label: "stav", extra: true, filter: true, filterLabel: (v) => STATUS[v] || v, fmt: (v) => esc(STATUS[v] || v) },
  ],

  // data: { farm: <game farm> }
  // ctx:  { dashActions(farm, {dolls, crabs}) → actions (the page's parser), countdown(ms) → text, now? }
  build({ farm }, ctx = {}, opts = {}) {
    if (!farm) return { rows: [], footer: "", empty: "Chybí data farmy." };
    if (typeof ctx.dashActions !== "function") return { rows: [], footer: "", empty: "Seznam akcí z DASH se nenačetl." };
    const now = ctx.now || Date.now();
    const limits = { dolls: opts.dollLimit ?? null, crabs: opts.crabLimit ?? null };
    const rows = ctx.dashActions(farm, limits).map((a) => ({
      ...a,
      countdown: a.status === "upcoming" && ctx.countdown ? ctx.countdown(a.readyAt - now) : "",
    }));
    const n = (s) => rows.filter((r) => r.status === s).length;
    const footer = rows.length ? `<div style="color:var(--text-dim)">${n("ready")} hotových · ${n("upcoming")} běží · ${n("empty")} nečinných</div>` : "";
    return { rows, footer, empty: "Všechno hotové — teď nic nečeká." };
  },
};
