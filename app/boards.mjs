// The boards document, kept in one synced localStorage key:
//   { schema: 1,
//     boards: [{ id, name, items: [{ i, type, settings, w, h }] }],   // w = columns of 12, h = rows (0 = auto)
//     page:   { [widgetType]: settings },                             // each widget on its own page
//     last:   boardId }                                                // the board visited last = where 📌 pins
// Every update returns a new document. A malformed document reads as empty: it must never break a page.

export const BOARDS_KEY = "sfl_boards";
const W_DEFAULT = 6;

export function emptyBoards() {
  return { schema: 1, boards: [{ id: "main", name: "My dashboard", items: [] }], page: {} };
}

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v, dflt) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.round(Number(v)) : dflt);
const clampW = (w) => Math.min(12, Math.max(1, num(w, W_DEFAULT)));
const clampH = (h) => Math.min(24, Math.max(0, num(h, 0)));
export const COLS_DEFAULT = 6;
const clampCols = (c) => Math.min(12, Math.max(2, num(c, COLS_DEFAULT)));

// Table settings arrive from other devices (prefs sync): the keys the table reads are checked and
// coerced, a wrong one is dropped; keys it does not know are kept for widgets that add their own.
const ROW_MODES = ["all", "top", "picked"];
export function cleanSettings(raw) {
  if (!isObj(raw)) return {};
  const s = { ...raw };
  delete s.columns; delete s.sort; delete s.rows; delete s.density; delete s.textSize; delete s.filters; delete s.opts; delete s.summary; delete s.title; delete s.size; delete s.style; delete s.look;
  if (["full", "compact", "off"].includes(raw.summary)) s.summary = raw.summary;
  if (["s", "m", "t", "l", "full", "look"].includes(raw.size) || /^[124]x[124]$/.test(raw.size)) s.size = raw.size;   // a board copy: its glance (a look) or the full table; v2 sizes still read
  if (["number", "rows", "compact", "icons", "tiles", "bars", "chart", "hero"].includes(raw.style)) s.style = raw.style;   // v2 (read for migration)
  if (typeof raw.look === "string" && /^[a-z0-9-]{1,40}$/.test(raw.look)) s.look = raw.look;   // a glance template id (ui/glance-templates)
  if (typeof raw.title === "string" && raw.title.trim()) s.title = raw.title.trim().slice(0, 60);
  // a widget's own options: plain values and lists of strings only
  if (isObj(raw.opts)) {
    const plain = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);
    s.opts = Object.fromEntries(Object.entries(raw.opts).flatMap(([k, v]) =>
      plain(v) ? [[k, v]] : Array.isArray(v) ? [[k, v.filter((x) => typeof x === "string" || typeof x === "number").map(String)]] : []));
  }
  if (isObj(raw.filters)) {
    s.filters = Object.fromEntries(Object.entries(raw.filters).filter(([k, v]) => k && Array.isArray(v))
      .map(([k, v]) => [k, v.filter((x) => typeof x === "string" || typeof x === "number").map(String)]));
  }
  if (Array.isArray(raw.columns)) s.columns = raw.columns.filter((k) => typeof k === "string");
  if (isObj(raw.sort) && typeof raw.sort.key === "string" && ["asc", "desc"].includes(raw.sort.dir)) s.sort = { key: raw.sort.key, dir: raw.sort.dir };
  if (isObj(raw.rows)) {
    const top = Math.floor(Number(raw.rows.top));
    s.rows = {
      mode: ROW_MODES.includes(raw.rows.mode) ? raw.rows.mode : "all",
      top: Number.isFinite(top) && top >= 1 ? top : 5,
      picked: Array.isArray(raw.rows.picked) ? raw.rows.picked.filter((k) => typeof k === "string" || typeof k === "number").map(String) : [],
    };
  }
  if (raw.density === "compact" || raw.density === "normal") s.density = raw.density;
  const ts = Number(raw.textSize);
  if (raw.textSize != null && Number.isFinite(ts)) s.textSize = Math.min(160, Math.max(70, Math.round(ts)));
  return s;
}

function cleanItem(x) {
  if (!isObj(x) || typeof x.i !== "string" || !x.i || typeof x.type !== "string" || !x.type) return null;
  return { i: x.i, type: x.type, settings: cleanSettings(x.settings), w: clampW(x.w ?? W_DEFAULT), h: clampH(x.h) };
}

export function parseBoards(raw) {
  let d;
  try { d = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return emptyBoards(); }
  if (!isObj(d) || d.schema !== 1 || !Array.isArray(d.boards)) return emptyBoards();
  // ":" separates board and item in frame ids (b:<board>:<item>).
  const boards = d.boards.filter((b) => isObj(b) && typeof b.id === "string" && b.id && !b.id.includes(":")).map((b) => ({
    id: b.id,
    name: typeof b.name === "string" && b.name ? b.name : "Dashboard",
    items: (Array.isArray(b.items) ? b.items : []).map(cleanItem).filter(Boolean),
    ...(Number.isFinite(Number(b.cols)) && b.cols !== null && b.cols !== "" ? { cols: clampCols(b.cols) } : {}),
  }));
  const page = Object.fromEntries(Object.entries(isObj(d.page) ? d.page : {}).filter(([, v]) => isObj(v)).map(([k, v]) => [k, cleanSettings(v)]));
  const out = { schema: 1, boards: boards.length ? boards : emptyBoards().boards, page };
  if (typeof d.last === "string" && out.boards.some((b) => b.id === d.last)) out.last = d.last;
  return out;
}

const copy = (v) => JSON.parse(JSON.stringify(v));

function withBoard(doc, boardId, fn) {
  return { ...doc, boards: doc.boards.map((b) => (b.id === boardId ? { ...b, items: fn(b.items.slice()) } : b)) };
}

const newId = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Pins a copy of the widget with its current settings (the page copy and the board copy then
// change independently).
export function pin(doc, { type, settings = {}, w = W_DEFAULT, h = 0 }, boardId = "main", makeId = newId) {
  return withBoard(doc, boardId, (items) => [...items, { i: makeId(), type, settings: copy(settings), w: clampW(w), h: clampH(h) }]);
}

export function unpin(doc, boardId, i) {
  return withBoard(doc, boardId, (items) => items.filter((x) => x.i !== i));
}

// Dragged item i dropped onto item target: i takes target's place, the items between shift by one.
export function moveItemTo(doc, boardId, i, target) {
  return withBoard(doc, boardId, (items) => {
    const a = items.findIndex((x) => x.i === i), b = items.findIndex((x) => x.i === target);
    if (a < 0 || b < 0 || a === b) return items;
    const [moved] = items.splice(a, 1);
    items.splice(b, 0, moved);
    return items;
  });
}

export function resizeItem(doc, boardId, i, { w, h }) {
  return withBoard(doc, boardId, (items) => items.map((x) => (x.i === i
    ? { ...x, w: w === undefined ? x.w : clampW(w), h: h === undefined ? x.h : clampH(h) } : x)));
}

// How many small widgets fit side by side on this board (2-12); a full table spans its share.
export function setBoardCols(doc, boardId, cols) {
  return { ...doc, boards: doc.boards.map((b) => (b.id === boardId ? { ...b, cols: clampCols(cols) } : b)) };
}

export function updateItemSettings(doc, boardId, i, settings) {
  return withBoard(doc, boardId, (items) => items.map((x) => (x.i === i ? { ...x, settings: copy(settings) } : x)));
}

// Another board (DASH is one, seeded with its widgets on the first visit). An existing id is left as it is.
export function addBoard(doc, { id, name, items = [] }) {
  if (typeof id !== "string" || !id || id.includes(":") || doc.boards.some((b) => b.id === id)) return doc;
  return { ...doc, boards: [...doc.boards, { id, name: name || "Dashboard", items: items.map(cleanItem).filter(Boolean) }] };
}

// Never the last board: a page always has one to show.
export function removeBoard(doc, id) {
  if (doc.boards.length < 2 || !doc.boards.some((b) => b.id === id)) return doc;
  const out = { ...doc, boards: doc.boards.filter((b) => b.id !== id) };
  if (out.last === id) delete out.last;
  return out;
}

export function setLastBoard(doc, id) {
  if (doc.last === id || !doc.boards.some((b) => b.id === id)) return doc;
  return { ...doc, last: id };
}

// Where 📌 on a page pins: the board visited last, else the first one.
export const pinTarget = (doc) => (doc.last && doc.boards.some((b) => b.id === doc.last) ? doc.last : doc.boards[0].id);

export const pageSettings = (doc, type) => (doc.page && doc.page[type]) || {};

export function setPageSettings(doc, type, settings) {
  return { ...doc, page: { ...doc.page, [type]: copy(settings) } };
}

export const pinnedCount = (doc, type) => doc.boards.reduce((n, b) => n + b.items.filter((x) => x.type === type).length, 0);

export function loadBoards(storage) {
  try { return parseBoards(storage.getItem(BOARDS_KEY)); } catch { return emptyBoards(); }
}

export function saveBoards(storage, doc) {
  storage.setItem(BOARDS_KEY, JSON.stringify(doc));
}
