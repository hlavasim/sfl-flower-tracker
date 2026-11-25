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
export function applyRows(columns, rows, settings = {}, rowKey = (r) => r.key) {
  let out = rows.slice();
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
  let missing = [];
  if (sel.mode === "top") out = out.slice(0, Math.max(1, sel.top || 5));
  else if (sel.mode === "picked") {
    const want = new Set((sel.picked || []).map(String));
    const have = new Set(out.map((r) => String(rowKey(r))));
    out = out.filter((r) => want.has(String(rowKey(r))));
    missing = (sel.picked || []).filter((k) => !have.has(String(k)));
  }
  return { rows: out, missing };
}

export function renderTable(columns, rows, settings = {}, { rowKey = (r) => r.key, empty = "Žádné řádky." } = {}) {
  const cols = visibleColumns(columns, settings);
  const { rows: shown, missing } = applyRows(columns, rows, settings, rowKey);
  const sort = settings.sort || {};
  const size = settings.textSize ? Math.min(TEXT_MAX, Math.max(TEXT_MIN, settings.textSize)) : 0;
  const cls = "w-table" + (settings.density === "compact" ? " w-compact" : "");
  const align = (c) => (c.align ? ` style="text-align:${c.align}"` : "");
  const head = cols.map((c) => {
    const aria = sort.key === c.key ? ` aria-sort="${sort.dir === "asc" ? "ascending" : "descending"}"` : "";
    const mark = sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
    return `<th data-action="sort" data-value="${esc(c.key)}" data-sort="${esc(c.key)}"${aria}${align(c)}>${esc(c.label)}${mark}</th>`;
  }).join("");
  const body = shown.map((r) => `<tr data-row="${esc(rowKey(r))}">` + cols.map((c) => {
    const v = valueOf(c, r);
    const cell = c.fmt ? c.fmt(v, r) : isBlank(v) ? "" : esc(v);
    return `<td${align(c)}>${cell}</td>`;
  }).join("") + "</tr>").join("");
  const none = shown.length ? "" : `<tr><td colspan="${cols.length || 1}" class="w-empty">${esc(empty)}</td></tr>`;
  const miss = missing.length ? `<div class="w-missing">Vybrané, ale teď bez řádku: ${missing.map(esc).join(", ")}</div>` : "";
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
    case "col-up":
    case "col-down": {
      const list = current();
      const i = list.indexOf(value), j = action === "col-up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= list.length) return s;
      [list[i], list[j]] = [list[j], list[i]];
      s.columns = list;
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
    case "density":
      s.density = value === "compact" ? "compact" : "normal";
      return s;
    case "text-size":
      s.textSize = Math.min(TEXT_MAX, Math.max(TEXT_MIN, Math.round(Number(value)) || 100));
      return s;
    case "reset":
      return {};
    default:
      return s;
  }
}

// The cog panel's HTML. Every control carries data-action / data-value; the frame delegates the
// events and feeds them to applyTableAction.
export function tableSettingsPanel(columns, settings = {}, { rows = [], rowKey = (r) => r.key, rowLabel } = {}) {
  const shown = visibleColumns(columns, settings).map((c) => c.key);
  const order = [...shown, ...columns.map((c) => c.key).filter((k) => !shown.includes(k))];
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const colRows = order.map((k) => {
    const on = shown.includes(k);
    return `<div class="w-set-col"><label><input type="checkbox" data-action="col-toggle" data-value="${esc(k)}"${on ? " checked" : ""}> ${esc(byKey.get(k).label)}</label>` +
      (on ? ` <button type="button" data-action="col-up" data-value="${esc(k)}" title="výš">▲</button><button type="button" data-action="col-down" data-value="${esc(k)}" title="níž">▼</button>` : "") + `</div>`;
  }).join("");
  // Coerced here too: the panel prints these into attributes.
  const r0 = settings.rows || {};
  const top0 = Math.floor(Number(r0.top));
  const sel = { mode: ["all", "top", "picked"].includes(r0.mode) ? r0.mode : "all", top: top0 >= 1 ? top0 : 5,
    picked: Array.isArray(r0.picked) ? r0.picked : [] };
  const picked = new Set(sel.picked.map(String));
  const label = rowLabel || rowKey;
  const mode = (m, t) => `<label><input type="radio" name="w-rows" data-action="rows-mode" data-value="${m}"${sel.mode === m ? " checked" : ""}> ${t}</label>`;
  const picks = rows.map((r) => {
    const k = String(rowKey(r));
    return `<label class="w-pick"><input type="checkbox" data-action="pick" data-value="${esc(k)}"${picked.has(k) ? " checked" : ""}> ${esc(label(r))}</label>`;
  }).join("");
  const size = Math.min(TEXT_MAX, Math.max(TEXT_MIN, Math.round(Number(settings.textSize)) || 100));
  return `<div class="w-settings">
<fieldset><legend>Sloupce</legend>${colRows}</fieldset>
<fieldset><legend>Řádky</legend>${mode("all", "všechny")} ${mode("top", "prvních")} <input type="number" min="1" value="${sel.top}" data-action="rows-top" style="width:4em"> ${mode("picked", "jen vybrané")}
${sel.mode === "picked" ? `<div class="w-picks">${picks}</div>` : ""}</fieldset>
<fieldset><legend>Vzhled</legend><label>Písmo <input type="range" min="${TEXT_MIN}" max="${TEXT_MAX}" step="10" value="${size}" data-action="text-size"> ${size} %</label>
<label><input type="checkbox" data-action="density" data-value="${settings.density === "compact" ? "normal" : "compact"}"${settings.density === "compact" ? " checked" : ""}> husté řádky</label>
<button type="button" data-action="reset" data-value="">výchozí</button></fieldset>
</div>`;
}
