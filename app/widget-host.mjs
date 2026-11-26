// Glue between a widget, its frame, the table and the boards document, so a widget on its own page
// and its pinned copies on the board render and react the same way.
//
// Frame ids: "page:<type>" on the widget's page, "b:<boardId>:<itemId>" on a board.
// handle(frameId, action, value) applies one frame/table action, saves the document when it
// changed, calls onChange(frameId) and returns whether it was handled.
import { renderTable, tableSettingsPanel, applyTableAction } from "../ui/table.mjs";
import { renderFrame, freshness } from "../ui/frame.mjs";
import { loadBoards, saveBoards, pin, unpin, moveItemTo, resizeItem, updateItemSettings,
  pageSettings, setPageSettings, pinnedCount } from "./boards.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const TABLE_ACTIONS = new Set(["col-toggle", "col-move", "sort", "rows-mode", "rows-top", "pick", "density", "text-size", "reset"]);

export function createHost({ registry, storage, onChange = () => {} }) {
  let doc = loadBoards(storage);
  const open = new Map();   // frame id → the popover's active tab

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

  function body(widget, settings, data, ctx, tab) {
    try {
      const out = widget.build(data || {}, ctx || {});
      const opts = { rowKey: widget.rowKey, rowLabel: widget.rowLabel };
      return {
        html: out.rows.length ? renderTable(widget.columns, out.rows, settings, opts) + (out.footer || "")
          : `<div class="w-empty-msg">${esc(out.empty || "Nic k zobrazení.")}</div>`,
        settingsHtml: tableSettingsPanel(widget.columns, settings, { rows: out.rows, ...opts, tab }),
      };
    } catch (e) {
      // The cog still offers a reset, so a bad saved setting is never a dead end.
      return { html: `<div class="w-error">Widget spadl: ${esc((e && e.message) || e)}</div>`,
        settingsHtml: `<div class="w-settings"><button type="button" data-action="reset" data-value="">výchozí nastavení</button></div>` };
    }
  }

  function renderPage(type, { data, ctx, fresh } = {}) {
    const widget = registry[type];
    const id = `page:${type}`;
    const settings = effective(widget, pageSettings(doc, type));
    const b = body(widget, settings, data, ctx, open.get(id));
    return renderFrame({ id, title: widget.title, place: "page", body: b.html, fresh, pinned: pinnedCount(doc, type),
      settingsHtml: b.settingsHtml, settingsOpen: open.has(id) });
  }

  function renderItem(boardId, item, { data, ctx, fresh, pending = false } = {}) {
    const id = `b:${boardId}:${item.i}`;
    const widget = registry[item.type];
    if (!widget) {
      return renderFrame({ id, title: item.type, place: "board", w: item.w, h: item.h, body: `<div class="w-error">Tenhle widget už neexistuje — odeber ho.</div>` });
    }
    const settings = effective(widget, item.settings);
    const b = pending ? { html: `<div class="w-fresh">Načítám…</div>`, settingsHtml: "" } : body(widget, settings, data, ctx, open.get(id));
    return renderFrame({ id, title: widget.title, place: "board", w: item.w, h: item.h, body: b.html, fresh,
      settingsHtml: b.settingsHtml, settingsOpen: open.has(id) });
  }

  function handle(frameId, action, value) {
    const f = parse(frameId);
    if (!f || !f.widget && action !== "remove") return false;
    if (action === "cog") {
      open.has(frameId) ? open.delete(frameId) : open.set(frameId, "cols");
      onChange(frameId);
      return true;
    }
    if (action === "settings-close") {
      if (!open.delete(frameId)) return false;
      onChange(frameId);
      return true;
    }
    if (action === "settings-tab") {
      open.set(frameId, String(value));
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
      if (action === "move-to") {
        const t = parse(value);
        if (!t || t.place !== "board" || t.boardId !== f.boardId || t.item.i === f.item.i) return false;
        return save(moveItemTo(doc, f.boardId, f.item.i, t.item.i), frameId);
      }
      if (action === "resize") {
        const [w, h] = String(value).split("|");
        return save(resizeItem(doc, f.boardId, f.item.i, { w, h: h === undefined ? undefined : h }), frameId);
      }
    }
    return false;
  }

  // A widget's needs, fetched through the store. data[name] is the entry's data, except that a need
  // named "farm" gets the game farm itself (the farm resource is the proxy's {farm: …} answer).
  const needList = (type, farmId) => {
    const widget = registry[type];
    return widget && widget.needs ? Object.entries(widget.needs(farmId)) : [];
  };
  const needsOf = (type, farmId) => needList(type, farmId).map(([, q]) => q);
  function shape(needs, entries) {
    const data = {};
    needs.forEach(([name], k) => {
      const d = entries[k] ? entries[k].data : null;
      data[name] = name === "farm" ? (d && d.farm) || null : d;
    });
    return data;
  }
  async function loadData(type, farmId, store) {
    const needs = needList(type, farmId);
    if (!needs.length) return { data: {}, entries: [] };
    const entries = await Promise.all(needs.map(([, q]) => store.get(q)));
    return { data: shape(needs, entries), entries };
  }
  // The same from what the store already holds, without waiting. pending = a need the widget cannot
  // do without (not in widget.optional) has no entry yet.
  function peekData(type, farmId, store) {
    const needs = needList(type, farmId);
    const optional = new Set((registry[type] && registry[type].optional) || []);
    const got = needs.map(([, q]) => store.peek(q));
    const pending = needs.some(([name], k) => !got[k] && !optional.has(name));
    return { data: shape(needs, got), entries: got.filter(Boolean), pending };
  }

  // The badge for several entries: any error wins, otherwise the oldest.
  function freshOf(entries, now = Date.now()) {
    if (!entries.length) return freshness(null, now);
    const bad = entries.find((e) => e.status !== "ok");
    if (bad) return freshness(bad, now);
    return freshness(entries.reduce((a, e) => (e.asOf < a.asOf ? e : a)), now);
  }

  return { doc: () => doc, reload: () => { doc = loadBoards(storage); }, registry, renderPage, renderItem, handle,
    needsOf, loadData, peekData, freshOf };
}
