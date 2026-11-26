// The one table every widget renders through. A widget declares its columns; the owner's settings
// pick which show and in what order, the sort, which rows, the density and the text size.
//
// column:   { key, label, get?(row) → raw value, fmt?(value, row) → HTML, extra?, align? }
//           get defaults to row[key]; fmt output is trusted HTML from the widget, anything else is
//           escaped. extra = hidden until the owner adds it.
// settings: { columns?: [key], sort?: {key, dir: "asc"|"desc"},
//             rows?: {mode: "all"|"top"|"picked", top, picked: [rowKey]},
//             density?: "normal"|"compact", textSize?: percent }

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const valueOf = (col, row) => (col.get ? col.get(row) : row[col.key]);
const isBlank = (v) => v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
const TEXT_MIN = 70, TEXT_MAX = 160;

export function visibleColumns(columns, settings = {}) {
  if (!Array.isArray(settings.columns)) return columns.filter((c) => !c.extra);
  const byKey = new Map(columns.map((c) => [c.key, c]));
  return settings.columns.filter((k) => byKey.has(k)).map((k) => byKey.get(k));
}

function compare(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

// Sort (raw values, blanks last either way), then the row selection. Returns the rows to show and
// the picked keys that matched no row, so a pick that disappeared is visible instead of silent.
export function applyRows(columns, rows, settings = {}, rowKey = (r) => r.key, keepRow = null) {
  let out = rows.slice();
  // filters: { columnKey: [values switched off] } on columns marked filter
  for (const c of columns.filter((x) => x.filter)) {
    const off = new Set(((settings.filters || {})[c.key] || []).map(String));
    if (off.size) out = out.filter((r) => !off.has(String(valueOf(c, r))));
  }
  const sort = settings.sort;
  const col = sort && columns.find((c) => c.key === sort.key);
  if (col) {
    const sign = sort.dir === "asc" ? 1 : -1;
    out = out.map((r, i) => ({ r, i, v: valueOf(col, r) })).sort((x, y) => {
      const bx = isBlank(x.v), by = isBlank(y.v);
      if (bx || by) return bx === by ? x.i - y.i : bx ? 1 : -1;
      return sign * compare(x.v, y.v) || x.i - y.i;
    }).map((x) => x.r);
  }
  const sel = settings.rows || {};
  let missing = [], hidden = 0, kept = [];
  if (sel.mode === "top") {
    const n = Math.max(1, sel.top || 5);
    // rows the widget wants seen anyway (the viewer's own) stay, below the cut
    kept = keepRow ? out.slice(n).filter(keepRow) : [];
    hidden = Math.max(0, out.length - n - kept.length);
    out = out.slice(0, n);
  }
  else if (sel.mode === "picked") {
    const want = new Set((sel.picked || []).map(String));
    const have = new Set(out.map((r) => String(rowKey(r))));
    out = out.filter((r) => want.has(String(rowKey(r))));
    missing = (sel.picked || []).filter((k) => !have.has(String(k)));
  }
  return { rows: out, missing, hidden, kept };
}

// column extras: title (header tooltip), labelHtml (trusted header HTML instead of label),
// cumulative (the cell gets the running sum of get() in the order shown).
// opts.rowClass(row) → class names for the row; opts.keepRow(row) → shown even past "top N".
export function renderTable(columns, rows, settings = {}, { rowKey = (r) => r.key, empty = "No rows.", rowClass, keepRow } = {}) {
  const cols = visibleColumns(columns, settings);
  const { rows: shown, missing, hidden, kept } = applyRows(columns, rows, settings, rowKey, keepRow);
  const sort = settings.sort || {};
  const size = settings.textSize ? Math.min(TEXT_MAX, Math.max(TEXT_MIN, settings.textSize)) : 0;
  const cls = "w-table" + (settings.density === "compact" ? " w-compact" : "");
  const align = (c) => (c.align ? ` style="text-align:${c.align}"` : "");
  const head = cols.map((c) => {
    const aria = sort.key === c.key ? ` aria-sort="${sort.dir === "asc" ? "ascending" : "descending"}"` : "";
    const mark = sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
    const tip = c.title ? ` title="${esc(c.title)}"` : "";
    return `<th data-action="sort" data-value="${esc(c.key)}" data-sort="${esc(c.key)}"${aria}${tip}${align(c)}>${c.labelHtml || esc(c.label)}${mark}</th>`;
  }).join("");
  const sums = new Map(cols.filter((c) => c.cumulative).map((c) => [c.key, 0]));
  const rowHtml = (r) => {
    const cls = rowClass ? rowClass(r) : "";
    return `<tr data-row="${esc(rowKey(r))}"${cls ? ` class="${esc(cls)}"` : ""}>` + cols.map((c) => {
      let v = valueOf(c, r);
      if (c.cumulative) { sums.set(c.key, sums.get(c.key) + (+v || 0)); v = sums.get(c.key); }
      const cell = c.fmt ? c.fmt(v, r) : isBlank(v) ? "" : esc(v);
      return `<td${align(c)}>${cell}</td>`;
    }).join("") + "</tr>";
  };
  const gap = kept.length ? `<tr class="w-gap"><td colspan="${cols.length || 1}">…</td></tr>` + kept.map(rowHtml).join("") : "";
  const body = shown.map(rowHtml).join("") + gap;
  const more = hidden ? `<tr><td colspan="${cols.length || 1}" class="w-more">… and ${hidden} more</td></tr>` : "";
  const none = shown.length ? more : `<tr><td colspan="${cols.length || 1}" class="w-empty">${esc(empty)}</td></tr>`;
  const miss = missing.length ? `<div class="w-missing">Picked, but without a row now: ${missing.map(esc).join(", ")}</div>` : "";
  return `<table class="${cls}"${size ? ` style="font-size:${size}%"` : ""}><thead><tr>${head}</tr></thead><tbody>${body}${none}</tbody></table>${miss}`;
}

// Pure settings update for one panel/header action; never mutates its input.
export function applyTableAction(columns, settings = {}, action, value) {
  const s = { ...settings };
  const current = () => visibleColumns(columns, settings).map((c) => c.key);
  const rows = () => ({ mode: "all", top: 5, picked: [], ...(settings.rows || {}) });
  switch (action) {
    case "col-toggle": {
      const list = current();
      s.columns = list.includes(value) ? list.filter((k) => k !== value) : [...list, value];
      return s;
    }
    case "col-move": {
      // "key|index": a shown column dragged to position index of the shown list (clamped).
      const [k, at] = String(value).split("|");
      const list = current();
      const idx = Math.floor(Number(at));
      if (!list.includes(k) || !Number.isFinite(idx)) return s;
      const rest = list.filter((x) => x !== k);
      rest.splice(Math.max(0, Math.min(rest.length, idx)), 0, k);
      s.columns = rest;
      return s;
    }
    case "sort": {
      const cur = settings.sort;
      if (!cur || cur.key !== value) s.sort = { key: value, dir: "desc" };
      else if (cur.dir === "desc") s.sort = { key: value, dir: "asc" };
      else delete s.sort;
      return s;
    }
    case "rows-mode":
      s.rows = { ...rows(), mode: ["all", "top", "picked"].includes(value) ? value : "all" };
      return s;
    case "rows-top":
      s.rows = { ...rows(), top: Math.max(1, Math.floor(Number(value)) || 1) };
      return s;
    case "pick": {
      const r = rows();
      const k = String(value);
      s.rows = { ...r, picked: r.picked.map(String).includes(k) ? r.picked.filter((p) => String(p) !== k) : [...r.picked, k] };
      return s;
    }
    case "filter": {
      // "column|value": switch that value of a filter column off, or back on
      const at = String(value).indexOf("|");
      const k = String(value).slice(0, at), v = String(value).slice(at + 1);
      if (at < 0 || !columns.some((c) => c.key === k && c.filter)) return s;
      const off = ((settings.filters || {})[k] || []).map(String);
      s.filters = { ...(settings.filters || {}), [k]: off.includes(v) ? off.filter((x) => x !== v) : [...off, v] };
      return s;
    }
    case "density":
      s.density = value === "compact" ? "compact" : "normal";
      return s;
    case "text-size":
      s.textSize = Math.min(TEXT_MAX, Math.max(TEXT_MIN, Math.round(Number(value)) || 100));
      return s;
    case "summary":
      // the widget's summary (tiles, big bar): shown, compact (one line) or hidden
      if (["full", "compact", "off"].includes(value)) s.summary = value;
      return s;
    case "size":
      // a board copy's size: S / M / L (its glance face) or the full table
      if (["s", "m", "t", "l", "full"].includes(value) || /^[124]x[124]$/.test(value)) s.size = value;
      else if (value === "look") delete s.size;   // back to the chosen look (a model widget)
      return s;
    case "style":
      // how a glance shows its model: the number, a list of rows, or a grid of icons
      if (["number", "rows", "compact", "icons", "tiles", "bars", "chart", "hero"].includes(value)) s.style = value;
      return s;
    case "title": {
      // a name of the owner's for this copy; blank = the widget's own title again
      const t = String(value ?? "").trim().slice(0, TITLE_MAX);
      if (t) s.title = t; else delete s.title;
      return s;
    }
    case "reset":
      return {};
    default:
      return s;
  }
}

// A widget's own options: [{ key, label, kind: "number"|"bool"|"select"|"checklist", min?, max?,
// choices?: [[value, label]] | (opts) → [[value, label]] }], stored in settings.opts. Pure; an
// unknown key or a value outside the choices leaves the settings as they were.
const choicesOf = (o, opts) => (typeof o.choices === "function" ? o.choices(opts || {}) : o.choices || []);
export function applyOption(options = [], settings = {}, key, value) {
  const o = options.find((x) => x.key === key);
  if (!o) return settings;
  const opts = { ...(settings.opts || {}) };
  const v = String(value ?? "");
  if (o.kind === "number") {
    if (v.trim() === "") delete opts[key];
    else {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n)) return settings;
      opts[key] = Math.min(o.max ?? Infinity, Math.max(o.min ?? -Infinity, n));
    }
  } else if (o.kind === "bool") opts[key] = v === "1" || v === "true";
  else if (o.kind === "select") {
    if (!choicesOf(o, opts).some(([c]) => String(c) === v)) return settings;
    opts[key] = v;
  } else if (o.kind === "checklist") {
    const cur = Array.isArray(opts[key]) ? opts[key].map(String) : [];
    if (cur.includes(v)) opts[key] = cur.filter((x) => x !== v);
    else if (choicesOf(o, opts).some(([c]) => String(c) === v)) opts[key] = [...cur, v];
    else return settings;
  } else return settings;
  return { ...settings, opts };
}

function optionsHtml(options, opts) {
  return options.map((o) => {
    const a = `data-action="opt:${esc(o.key)}"`, cur = opts[o.key];
    if (o.kind === "number") {
      const lim = (o.min != null ? ` min="${o.min}"` : "") + (o.max != null ? ` max="${o.max}"` : "");
      return `<label class="w-line">${esc(o.label)} <input type="number"${lim} value="${cur == null ? "" : esc(cur)}" ${a}></label>`;
    }
    if (o.kind === "bool") return `<label class="w-line"><input type="checkbox" ${a} data-value="${cur ? "0" : "1"}"${cur ? " checked" : ""}> ${esc(o.label)}</label>`;
    if (o.kind === "select") {
      return `<label class="w-line">${esc(o.label)} <select ${a}>` + choicesOf(o, opts).map(([v, t]) =>
        `<option value="${esc(v)}"${String(v) === String(cur) ? " selected" : ""}>${esc(t)}</option>`).join("") + `</select></label>`;
    }
    if (o.kind === "checklist") {
      const list = choicesOf(o, opts);
      if (!list.length) return "";
      const on = new Set((Array.isArray(cur) ? cur : []).map(String));
      return `<div class="w-filter"><div class="w-filter-h">${esc(o.label)} (${on.size})</div><div class="w-picks">` + list.map(([v, t]) =>
        `<label class="w-pick"><input type="checkbox" ${a} data-value="${esc(v)}"${on.has(String(v)) ? " checked" : ""}> ${esc(t)}</label>`).join("") + `</div></div>`;
    }
    return "";
  }).join("");
}

// The cog panel of a view widget (a tile or a chart) that has options: just those, and a reset.
export function optionsPanel(options = [], settings = {}) {
  return `<div class="w-settings">${optionsHtml(options, settings.opts || {})}` +
    `<div class="w-foot"><button type="button" class="w-link" data-action="reset" data-value="">Reset to defaults</button></div></div>`;
}

// The cog panel's HTML: tabs (Columns / Rows / Filter / Look), the inactive ones hidden. Every
// control carries data-action / data-value; the frame delegates the events (and the drag of a
// column's grip, which reports col-move) and feeds them to applyTableAction.
const TABS = [["cols", "Columns"], ["rows", "Rows"], ["filter", "Filter"], ["look", "Look"]];
export const TITLE_MAX = 60;
export function tableSettingsPanel(columns, settings = {}, { rows = [], rowKey = (r) => r.key, rowLabel, tab, options = [], optionsLabel = "Options",
  summary = false, defaultTitle = "", view = false, sizes = [], styles = [] } = {}) {
  const filterCols = columns.filter((c) => c.filter);
  // the widget's own options, when it has any, come first and open by default; a view widget (a tile,
  // no table) has only its options and Look (the title)
  const tabsHere = [...(options.length ? [["opts", optionsLabel]] : []),
    ...TABS.filter(([t]) => (view ? t === "look" : t !== "filter" || filterCols.length))];
  const active = tabsHere.some(([t]) => t === tab) ? tab : tabsHere[0][0];
  const shown = visibleColumns(columns, settings).map((c) => c.key);
  const order = [...shown, ...columns.map((c) => c.key).filter((k) => !shown.includes(k))];
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const colRows = order.map((k) => {
    const on = shown.includes(k);
    return `<div class="w-col-row${on ? "" : " off"}" data-col="${esc(k)}">` +
      (on ? `<span class="w-grip" data-drag="col" title="drag to reorder">⠿</span>` : `<span class="w-grip-none"></span>`) +
      `<label><input type="checkbox" data-action="col-toggle" data-value="${esc(k)}"${on ? " checked" : ""}> ${esc(byKey.get(k).label)}</label></div>`;
  }).join("");
  // Coerced here too: the panel prints these into attributes.
  const r0 = settings.rows || {};
  const top0 = Math.floor(Number(r0.top));
  const sel = { mode: ["all", "top", "picked"].includes(r0.mode) ? r0.mode : "all", top: top0 >= 1 ? top0 : 5,
    picked: Array.isArray(r0.picked) ? r0.picked : [] };
  const picked = new Set(sel.picked.map(String));
  const label = rowLabel || rowKey;
  const mode = (m, t) => `<button type="button" class="w-seg${sel.mode === m ? " on" : ""}" data-action="rows-mode" data-value="${m}">${t}</button>`;
  const picks = rows.map((r) => {
    const k = String(rowKey(r));
    return `<label class="w-pick"><input type="checkbox" data-action="pick" data-value="${esc(k)}"${picked.has(k) ? " checked" : ""}> ${esc(label(r))}</label>`;
  }).join("");
  const size = Math.min(TEXT_MAX, Math.max(TEXT_MIN, Math.round(Number(settings.textSize)) || 100));
  // one group of checkboxes per filter column: every value the rows have, checked = shown
  const filters = filterCols.map((c) => {
    const off = new Set(((settings.filters || {})[c.key] || []).map(String));
    const vals = [...new Set(rows.map((r) => String(valueOf(c, r))))];
    return `<div class="w-filter"><div class="w-filter-h">${esc(c.label)}</div>` + vals.map((v) =>
      `<label class="w-pick"><input type="checkbox" data-action="filter" data-value="${esc(c.key + "|" + v)}"${off.has(v) ? "" : " checked"}> ${esc(c.filterLabel ? c.filterLabel(v) : v)}</label>`).join("") + `</div>`;
  }).join("");
  const tabs = tabsHere.map(([t, label]) =>
    `<button type="button" class="w-tab" data-action="settings-tab" data-value="${t}" aria-selected="${t === active}">${label}</button>`).join("");
  const section = (t, html) => `<div class="w-sec" data-tab="${t}"${t === active ? "" : " hidden"}>${html}</div>`;
  return `<div class="w-settings"><div class="w-tabs">${tabs}</div>` +
    (options.length ? section("opts", optionsHtml(options, settings.opts || {})) : "") +
    (view ? "" : section("cols", `<div class="w-cols">${colRows}</div><div class="w-hint">Tick what to show; drag ⠿ to reorder. Click a table header to sort.</div>`) +
    section("rows", `<div class="w-segs">${mode("all", "All")}${mode("top", "First N")}${mode("picked", "Picked only")}</div>` +
      (sel.mode === "top" ? `<label class="w-line">Count <input type="number" min="1" value="${sel.top}" data-action="rows-top"></label>` : "") +
      (sel.mode === "picked" ? `<div class="w-picks">${picks}</div>` : ""))) +
    (filterCols.length ? section("filter", filters) : "") +
    section("look", `<label class="w-line">Title <input type="text" data-action="title" value="${esc(settings.title || "")}" placeholder="${esc(defaultTitle)}" maxlength="${TITLE_MAX}"></label>` +
      // a board copy of a widget with a glance face: its size (sizes = [[value, label, on]])
      (sizes.length ? `<div class="w-line">Size <span class="w-segs">` + sizes.map(([v, t, on]) =>
        `<button type="button" class="w-seg${on ? " on" : ""}" data-action="size" data-value="${v}">${t}</button>`).join("") + `</span></div>` : "") +
      (styles.length ? `<div class="w-line">Style <span class="w-segs">` + styles.map(([v, t, on]) =>
        `<button type="button" class="w-seg${on ? " on" : ""}" data-action="style" data-value="${v}">${t}</button>`).join("") + `</span></div>` : "") +
      (summary ? `<div class="w-line">Summary <span class="w-segs">` + [["full", "Shown"], ["compact", "Compact"], ["off", "Hidden"]].map(([v, t]) =>
        `<button type="button" class="w-seg${(settings.summary || "full") === v ? " on" : ""}" data-action="summary" data-value="${v}">${t}</button>`).join("") + `</span></div>` : "") +
      (view ? "" : `<label class="w-line">Text size <input type="range" min="${TEXT_MIN}" max="${TEXT_MAX}" step="10" value="${size}" data-action="text-size"> ${size} %</label>` +
      `<label class="w-line"><input type="checkbox" data-action="density" data-value="${settings.density === "compact" ? "normal" : "compact"}"${settings.density === "compact" ? " checked" : ""}> Compact rows</label>`)) +
    `<div class="w-foot"><button type="button" class="w-link" data-action="reset" data-value="">Reset to defaults</button></div></div>`;
}
