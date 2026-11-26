// CONSTANTS: how much of the page's game data lives in core/ (compute?section=constants).
//   🧩 Coverage: every table with its status (inline → duplicated → core), summary tiles on top.
//   📚 Core data tables: each table's JSON, collapsed.
import { kpis, bigBar, pill } from "../ui/viz.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ORDER = { inline: 0, duplicated: 1, core: 2 };
const TONE = { core: "ok", duplicated: "run", inline: "bad" };
const needs = (farmId) => ({ constants: { res: "compute", farm: farmId, section: "constants" } });
const LOADING = "Loading the constants…";

export const constantsCoverage = {
  type: "constants-coverage",
  title: "🧩 Core coverage",
  page: "constants",
  needs,
  defaults: {},
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.status === "core" ? "w-st-done" : ""),
  columns: [
    { key: "name", label: "name", fmt: (v) => `<code style="font-size:12px">${esc(v)}</code>` },
    { key: "lines", label: "lines", align: "right", fmt: (v) => (v == null ? "—" : esc(v)) },
    { key: "status", label: "status", get: (r) => ORDER[r.status] ?? 9, filter: true, filterLabel: (v) => ["inline", "duplicated", "core"][v] || "?",
      fmt: (v, r) => pill(r.status, TONE[r.status] || "idle") },
    { key: "file", label: "file", fmt: (v) => `<span class="v-dim">${esc(v || "")}</span>` },
  ],

  // data: { constants: <compute?section=constants data> }
  build({ constants } = {}) {
    if (!constants || !Array.isArray(constants.coverage)) return { rows: [], footer: "", empty: LOADING };
    const s = constants.summary || {};
    const rows = constants.coverage.slice().sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || a.name.localeCompare(b.name));
    const summary = kpis([{ v: s.total, l: "total" }, { v: s.core, l: "in core" }, { v: s.duplicated, l: "duplicated" }, { v: s.inline, l: "inline" }])
      + bigBar(s.total ? (s.core / s.total) * 100 : 100);
    return { rows, summary, footer: "", empty: "No tables listed." };
  },
};

// ── iPhone glance model: the share of tables already in core (a ring), the three statuses with their
// share; ui/glance-templates offers the looks ──
const STATUS_ITEM = [["core", "in core", "✅", "ok"], ["duplicated", "duplicated", "🔁", "warn"], ["inline", "inline", "📝", "bad"]];
constantsCoverage.look = "number";
constantsCoverage.glanceModel = ({ constants } = {}) => {
  if (!constants || !Array.isArray(constants.coverage)) return { empty: LOADING };
  const s = constants.summary || {};
  if (!s.total) return { empty: "No tables listed." };
  const pct = (s.core / s.total) * 100;
  return {
    head: { value: Math.round(pct), unit: "%", ring: pct, ringTone: pct >= 100 ? "ok" : "accent", cap: `${s.core} of ${s.total} tables in core` },
    items: STATUS_ITEM.map(([k, name, ic, t]) => ({ icon: ic, name, sub: `${Math.round(((s[k] || 0) / s.total) * 100)}% of ${s.total}`, value: s[k] || 0, tone: t,
      pct: ((s[k] || 0) / s.total) * 100 })),
    tiles: [{ label: "total", value: s.total }, { label: "in core", value: s.core }, { label: "duplicated", value: s.duplicated }, { label: "inline", value: s.inline }],
    foot: `${s.duplicated + s.inline} tables still to move`,
  };
};

export const constantsTables = {
  type: "constants-tables",
  title: "📚 Core data tables",
  page: "constants",
  needs,
  view({ constants } = {}) {
    if (!constants || !constants.tables) return { empty: LOADING };
    const names = Object.keys(constants.tables).sort();
    return { html: `<div class="v-dim" style="margin-bottom:8px">${names.length} tables</div>` + names.map((n) =>
      `<details class="v-const-t"><summary>${esc(n)}</summary><pre>${esc(JSON.stringify(constants.tables[n], null, 2))}</pre></details>`).join("") };
  },
};

// glance model: how many core tables there are, each with its entry count (the biggest first)
const entries = (t) => (Array.isArray(t) ? t.length : t && typeof t === "object" ? Object.keys(t).length : 1);
constantsTables.look = "list-4";
constantsTables.glanceModel = ({ constants } = {}) => {
  if (!constants || !constants.tables) return { empty: LOADING };
  const list = Object.entries(constants.tables).map(([name, t]) => ({ name, n: entries(t) })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  if (!list.length) return { empty: "No core tables." };
  const sum = list.reduce((a, x) => a + x.n, 0), max = list[0].n || 1;
  return {
    head: { value: list.length, unit: " tables", cap: `${sum} entries in core` },
    items: list.map((x) => ({ name: x.name, value: x.n, pct: (x.n / max) * 100 })),
    tiles: [{ label: "tables", value: list.length }, { label: "entries", value: sum }, { label: "largest", value: list[0].n }],
  };
};
