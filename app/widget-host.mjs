// Glue between a widget, its frame, the table and the boards document, so a widget on its own page
// and its pinned copies on the board render and react the same way.
//
// Frame ids: "page:<type>" on the widget's page, "b:<boardId>:<itemId>" on a board.
// handle(frameId, action, value) applies one frame/table action, saves the document when it
// changed, calls onChange(frameId) and returns whether it was handled.
import { renderTable, tableSettingsPanel, applyTableAction } from "../ui/table.mjs";
import { renderFrame } from "../ui/frame.mjs";
import { loadBoards, saveBoards, pin, unpin, moveItem, resizeItem, updateItemSettings,
  pageSettings, setPageSettings, pinnedCount } from "./boards.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const TABLE_ACTIONS = new Set(["col-toggle", "col-up", "col-down", "sort", "rows-mode", "rows-top", "pick", "density", "text-size", "reset"]);

export function createHost({ registry, storage, onChange = () => {} }) {
  let doc = loadBoards(storage);
  const open = new Set();

  const save = (next, frameId) => { doc = next; saveBoards(storage, doc); onChange(frameId); return true; };
  const effective = (widget, saved) => ({ ...(widget.defaults || {}), ...(saved || {}) });

  function parse(frameId) {
    const s = String(frameId);
    if (s.startsWith("page:")) {
      const type = s.slice(5);
      return registry[type] ? { place: "page", type, widget: registry[type] } : null;
    }
    const m = s.match(/^b:([^:]+):(.+)$/);
    if (!m) return null;
    const board = doc.boards.find((b) => b.id === m[1]);
    const item = board && board.items.find((x) => x.i === m[2]);
    if (!item) return null;
    return { place: "board", boardId: m[1], item, type: item.type, widget: registry[item.type] || null };
  }

  function body(widget, settings, data, ctx) {
    try {
      const out = widget.build(data || {}, ctx || {});
      const opts = { rowKey: widget.rowKey, rowLabel: widget.rowLabel };
      return {
        html: out.rows.length ? renderTable(widget.columns, out.rows, settings, opts) + (out.footer || "")
          : `<div class="w-empty-msg">${esc(out.empty || "Nic k zobrazení.")}</div>`,
        settingsHtml: tableSettingsPanel(widget.columns, settings, { rows: out.rows, ...opts }),
      };
    } catch (e) {
      return { html: `<div class="w-error">Widget spadl: ${esc((e && e.message) || e)}</div>`, settingsHtml: "" };
    }
  }

  function renderPage(type, { data, ctx, fresh } = {}) {
    const widget = registry[type];
    const id = `page:${type}`;
    const settings = effective(widget, pageSettings(doc, type));
    const b = body(widget, settings, data, ctx);
    return renderFrame({ id, title: widget.title, place: "page", body: b.html, fresh, pinned: pinnedCount(doc, type),
      settingsHtml: b.settingsHtml, settingsOpen: open.has(id) });
  }

  function renderItem(boardId, item, { data, ctx, fresh } = {}) {
    const id = `b:${boardId}:${item.i}`;
    const widget = registry[item.type];
    if (!widget) {
      return renderFrame({ id, title: item.type, place: "board", w: item.w, body: `<div class="w-error">Tenhle widget už neexistuje — odeber ho.</div>` });
    }
    const settings = effective(widget, item.settings);
    const b = body(widget, settings, data, ctx);
    return renderFrame({ id, title: widget.title, place: "board", w: item.w, body: b.html, fresh,
      settingsHtml: b.settingsHtml, settingsOpen: open.has(id) });
  }

  function handle(frameId, action, value) {
    const f = parse(frameId);
    if (!f || !f.widget && action !== "remove") return false;
    if (action === "cog") {
      open.has(frameId) ? open.delete(frameId) : open.add(frameId);
      onChange(frameId);
      return true;
    }
    if (TABLE_ACTIONS.has(action)) {
      const current = effective(f.widget, f.place === "page" ? pageSettings(doc, f.type) : f.item.settings);
      const next = applyTableAction(f.widget.columns, current, action, value);
      return save(f.place === "page" ? setPageSettings(doc, f.type, next) : updateItemSettings(doc, f.boardId, f.item.i, next), frameId);
    }
    if (f.place === "page" && action === "pin") {
      const settings = effective(f.widget, pageSettings(doc, f.type));
      return save(pin(doc, { type: f.type, settings }), frameId);
    }
    if (f.place === "board") {
      if (action === "remove") { open.delete(frameId); return save(unpin(doc, f.boardId, f.item.i), frameId); }
      if (action === "move-up") return save(moveItem(doc, f.boardId, f.item.i, -1), frameId);
      if (action === "move-down") return save(moveItem(doc, f.boardId, f.item.i, 1), frameId);
      if (action === "width") return save(resizeItem(doc, f.boardId, f.item.i, { w: value }), frameId);
    }
    return false;
  }

  return { doc: () => doc, reload: () => { doc = loadBoards(storage); }, renderPage, renderItem, handle };
}
