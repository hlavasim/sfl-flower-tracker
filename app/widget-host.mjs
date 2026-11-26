// Glue between a widget, its frame, the table and the boards document, so a widget on its own page
// and its pinned copies on the board render and react the same way.
//
// Frame ids: "page:<type>" on the widget's page, "b:<boardId>:<itemId>" on a board.
// handle(frameId, action, value) applies one frame/table action, saves the document when it
// changed, calls onChange(frameId) and returns whether it was handled.
import { renderTable, tableSettingsPanel, applyTableAction, applyOption } from "../ui/table.mjs";
import { renderFrame, freshness } from "../ui/frame.mjs";
import { loadBoards, saveBoards, pin, unpin, moveItemTo, resizeItem, updateItemSettings,
  pageSettings, setPageSettings, pinnedCount, pinTarget, addBoard, removeBoard, setLastBoard } from "./boards.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const TABLE_ACTIONS = new Set(["col-toggle", "col-move", "sort", "rows-mode", "rows-top", "pick", "density", "text-size", "reset"]);

export function createHost({ registry, storage, onChange = () => {}, onRefresh = () => {} }) {
  let doc = loadBoards(storage);
  const open = new Map();   // frame id → the popover's active tab
  // A page variant ("page:<type>@<variant>", e.g. the DOLLS page's 🎯 Do limitu): options the page
  // fixes (force), kept so a pinned copy starts from them. Its settings live under "<type>@<variant>".
  const forced = new Map();   // frame id → forced opts

  const save = (next, frameId) => { doc = next; saveBoards(storage, doc); onChange(frameId); return true; };
  // A widget's own options merge key by key, so an option added later still gets its default.
  const effective = (widget, saved) => {
    const d = widget.defaults || {}, s = saved || {};
    const out = { ...d, ...s };
    if (d.opts || s.opts) out.opts = { ...(d.opts || {}), ...(s.opts || {}) };
    return out;
  };
  const withForce = (settings, force) => (force ? { ...settings, opts: { ...(settings.opts || {}), ...force } } : settings);
  const titleOf = (widget, settings) => (typeof widget.titleFor === "function" ? widget.titleFor(settings.opts || {}) : widget.title);

  function parse(frameId) {
    const s = String(frameId);
    if (s.startsWith("page:")) {
      const key = s.slice(5), type = key.split("@")[0];
      return registry[type] ? { place: "page", type, key, widget: registry[type], force: forced.get(s) || null } : null;
    }
    const m = s.match(/^b:([^:]+):(.+)$/);
    if (!m) return null;
    const board = doc.boards.find((b) => b.id === m[1]);
    const item = board && board.items.find((x) => x.i === m[2]);
    if (!item) return null;
    return { place: "board", boardId: m[1], item, type: item.type, widget: registry[item.type] || null };
  }

  function body(widget, settings, data, ctx, tab, force = null) {
    try {
      if (widget.view) {
        // a tile or a chart: its own HTML, no table settings
        const out = widget.view(data || {}, ctx || {}, settings.opts || {}) || {};
        return { html: out.html || `<div class="w-empty-msg">${esc(out.empty || "Nothing to show.")}</div>`, settingsHtml: "" };
      }
      const out = widget.build(data || {}, ctx || {}, settings.opts || {});
      const opts = { rowKey: widget.rowKey, rowLabel: widget.rowLabel, rowClass: widget.rowClass, keepRow: widget.keepRow };
      return {
        // summary: trusted HTML from the widget above its table (tiles, a big bar)
        html: (out.summary || "") + (out.rows.length ? renderTable(widget.columns, out.rows, settings, opts) + (out.footer || "")
          : `<div class="w-empty-msg">${esc(out.empty || "Nothing to show.")}</div>`),
        settingsHtml: tableSettingsPanel(widget.columns, settings, { rows: out.rows, ...opts, tab,
          options: (widget.options || []).filter((o) => !force || !(o.key in force)), optionsLabel: widget.optionsLabel }),
      };
    } catch (e) {
      // The cog still offers a reset, so a bad saved setting is never a dead end.
      return { html: `<div class="w-error">The widget failed: ${esc((e && e.message) || e)}</div>`,
        settingsHtml: `<div class="w-settings"><button type="button" data-action="reset" data-value="">reset to defaults</button></div>` };
    }
  }

  function renderPage(type, { data, ctx, fresh, variant = "", force = null } = {}) {
    const widget = registry[type];
    const key = variant ? `${type}@${variant}` : type;
    const id = `page:${key}`;
    if (force) forced.set(id, force); else forced.delete(id);
    const settings = withForce(effective(widget, pageSettings(doc, key)), force);
    const b = body(widget, settings, data, ctx, open.get(id), force);
    return renderFrame({ id, title: titleOf(widget, settings), place: "page", body: b.html, fresh, pinned: pinnedCount(doc, type), cog: !widget.view,
      settingsHtml: b.settingsHtml, settingsOpen: open.has(id) });
  }

  function renderItem(boardId, item, { data, ctx, fresh, pending = false } = {}) {
    const id = `b:${boardId}:${item.i}`;
    const widget = registry[item.type];
    if (!widget) {
      return renderFrame({ id, title: item.type, place: "board", w: item.w, h: item.h, body: `<div class="w-error">This widget no longer exists — remove it.</div>` });
    }
    const settings = effective(widget, item.settings);
    const b = pending ? { html: `<div class="w-fresh">Loading…</div>`, settingsHtml: "" } : body(widget, settings, data, ctx, open.get(id));
    return renderFrame({ id, title: titleOf(widget, settings), place: "board", w: item.w, h: item.h, body: b.html, fresh, cog: !widget.view,
      settingsHtml: b.settingsHtml, settingsOpen: open.has(id) });
  }

  function handle(frameId, action, value) {
    const f = parse(frameId);
    if (!f || !f.widget && action !== "remove") return false;
    if (action === "refresh") { onRefresh(frameId, f.type); return true; }
    if (action === "cog") {
      open.has(frameId) ? open.delete(frameId) : open.set(frameId, "");   // "" = the panel's first tab
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
      const current = effective(f.widget, f.place === "page" ? pageSettings(doc, f.key) : f.item.settings);
      const next = applyTableAction(f.widget.columns, current, action, value);
      return save(f.place === "page" ? setPageSettings(doc, f.key, next) : updateItemSettings(doc, f.boardId, f.item.i, next), frameId);
    }
    if (String(action).startsWith("opt:")) {
      const current = effective(f.widget, f.place === "page" ? pageSettings(doc, f.key) : f.item.settings);
      const next = applyOption(f.widget.options || [], current, String(action).slice(4), value);
      if (next === current) return true;
      return save(f.place === "page" ? setPageSettings(doc, f.key, next) : updateItemSettings(doc, f.boardId, f.item.i, next), frameId);
    }
    if (f.place === "page" && action === "pin") {
      const settings = withForce(effective(f.widget, pageSettings(doc, f.key)), f.force);
      // value: optional JSON { board, opts }: the board to pin to (the one chosen in the 📌 menu) and
      // options to preset on the copy (📌 "Dolls to the limit" → { opts: { cat: "dolls" } })
      let v = null;
      try { v = value ? JSON.parse(value) : null; } catch { v = null; }
      if (!v || typeof v !== "object" || Array.isArray(v)) v = {};
      if (v.opts && typeof v.opts === "object" && !Array.isArray(v.opts)) settings.opts = { ...(settings.opts || {}), ...v.opts };
      // the chosen board, else the one visited last, else the first (a synced document may have no "main")
      const board = typeof v.board === "string" && doc.boards.some((b) => b.id === v.board) ? v.board : pinTarget(doc);
      return save(pin(doc, { type: f.type, settings }, board), frameId);
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

  // A page-level document change (add/remove a board, remember the visited one); saved, no re-render.
  const update = (fn) => { const next = fn(doc); if (next !== doc) { doc = next; saveBoards(storage, doc); } return doc; };

  // The gallery's preview: the widget's body with its defaults (plus opts), no frame or controls.
  function preview(type, { data, ctx, opts = null } = {}) {
    const widget = registry[type];
    if (!widget) return "";
    return body(widget, withForce(effective(widget, {}), opts), data, ctx, null).html;
  }

  return { doc: () => doc, update, preview,
    addBoard: (b) => update((d) => addBoard(d, b)), removeBoard: (id) => update((d) => removeBoard(d, id)),
    visit: (id) => update((d) => setLastBoard(d, id)), reload: () => { doc = loadBoards(storage); }, registry, renderPage, renderItem, handle,
    needsOf, loadData, peekData, freshOf };
}
