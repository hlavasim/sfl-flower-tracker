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
