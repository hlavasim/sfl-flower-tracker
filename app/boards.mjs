// The boards document, kept in one synced localStorage key:
//   { schema: 1,
//     boards: [{ id, name, items: [{ i, type, settings, w, h }] }],   // w = columns of 12, h = rows (0 = auto)
//     page:   { [widgetType]: settings } }                            // each widget on its own page
// Every update returns a new document. A malformed document reads as empty: it must never break a page.

export const BOARDS_KEY = "sfl_boards";
const W_DEFAULT = 6;

export function emptyBoards() {
  return { schema: 1, boards: [{ id: "main", name: "Můj dashboard", items: [] }], page: {} };
}

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v, dflt) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.round(Number(v)) : dflt);
const clampW = (w) => Math.min(12, Math.max(1, num(w, W_DEFAULT)));
const clampH = (h) => Math.min(24, Math.max(0, num(h, 0)));

function cleanItem(x) {
  if (!isObj(x) || typeof x.i !== "string" || !x.i || typeof x.type !== "string" || !x.type) return null;
  return { i: x.i, type: x.type, settings: isObj(x.settings) ? x.settings : {}, w: clampW(x.w ?? W_DEFAULT), h: clampH(x.h) };
}

export function parseBoards(raw) {
  let d;
  try { d = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return emptyBoards(); }
  if (!isObj(d) || d.schema !== 1 || !Array.isArray(d.boards)) return emptyBoards();
  const boards = d.boards.filter((b) => isObj(b) && typeof b.id === "string" && b.id).map((b) => ({
    id: b.id,
    name: typeof b.name === "string" && b.name ? b.name : "Dashboard",
    items: (Array.isArray(b.items) ? b.items : []).map(cleanItem).filter(Boolean),
  }));
  const page = Object.fromEntries(Object.entries(isObj(d.page) ? d.page : {}).filter(([, v]) => isObj(v)));
  return { schema: 1, boards: boards.length ? boards : emptyBoards().boards, page };
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

export function moveItem(doc, boardId, i, delta) {
  return withBoard(doc, boardId, (items) => {
    const a = items.findIndex((x) => x.i === i), b = a + delta;
    if (a < 0 || b < 0 || b >= items.length) return items;
    [items[a], items[b]] = [items[b], items[a]];
    return items;
  });
}

export function resizeItem(doc, boardId, i, { w, h }) {
  return withBoard(doc, boardId, (items) => items.map((x) => (x.i === i
    ? { ...x, w: w === undefined ? x.w : clampW(w), h: h === undefined ? x.h : clampH(h) } : x)));
}

export function updateItemSettings(doc, boardId, i, settings) {
  return withBoard(doc, boardId, (items) => items.map((x) => (x.i === i ? { ...x, settings: copy(settings) } : x)));
}

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
