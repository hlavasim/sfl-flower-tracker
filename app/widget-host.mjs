// Glue between a widget, its frame, the table and the boards document, so a widget on its own page
// and its pinned copies on the board render and react the same way.
//
// Frame ids: "page:<type>" on the widget's page, "b:<boardId>:<itemId>" on a board.
// handle(frameId, action, value) applies one frame/table action, saves the document when it
// changed, calls onChange(frameId) and returns whether it was handled.
import { renderTable, tableSettingsPanel, optionsPanel, applyTableAction, applyOption } from "../ui/table.mjs";
import { renderFrame, freshness } from "../ui/frame.mjs";
import { SIZES } from "../ui/glance.mjs";
import { looksFor, renderLook, templateById } from "../ui/glance-templates.mjs";
import { loadBoards, saveBoards, pin, unpin, moveItemTo, resizeItem, updateItemSettings,
  pageSettings, setPageSettings, pinnedCount, pinTarget, addBoard, removeBoard, setLastBoard, setBoardCols, COLS_DEFAULT } from "./boards.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const TABLE_ACTIONS = new Set(["col-toggle", "col-move", "sort", "rows-mode", "rows-top", "pick", "density", "text-size", "summary", "title", "size", "style", "reset"]);
const SIZE_LABEL = { full: "Full table", look: "Widget" };
const ALIAS = { s: "1x1", m: "2x1", t: "1x2", l: "2x2" };   // the S / M / T / L a v1 copy may have saved

export function createHost({ registry, storage, onChange = () => {}, onRefresh = () => {} }) {
  let doc = loadBoards(storage);
  const open = new Map();   // frame id → the popover's active tab
  const expanded = new Set();   // board frames whose full widget is open in a sheet
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
  const ownTitle = (widget, settings) => (typeof widget.titleFor === "function" ? widget.titleFor(settings.opts || {}) : widget.title);
  // the copy's own name (Look → Title) wins over the widget's title
  const titleOf = (widget, settings) => settings.title || ownTitle(widget, settings);

  // A model widget (widget.glanceModel, ui/glance-templates) shows a look on a board ("look") or the full
  // table (settings.size "full"); any other widget is always the table.
  const hasModel = (w) => !!w && typeof w.glanceModel === "function";
  const sizesOf = (type) => (hasModel(registry[type]) ? ["look"] : []);
  const sizeOf = (type, settings = {}) => (hasModel(registry[type]) && settings.size !== "full" ? "look" : "full");
  // the model a model widget's glance is laid out from ({ error } when it threw)
  function modelOf(widget, settings, data, ctx) {
    try { return widget.glanceModel(data || {}, ctx || {}, settings.opts || {}) || {}; } catch (e) { return { error: (e && e.message) || String(e) }; }
  }
  // The look a model widget's copy shows (ui/glance-templates): its own choice (settings.look), else an
  // offered look of the size a v2 copy saved (settings.size), else the widget's natural look, else the
  // first offered. The board's live column count picks a narrow twin on phones and tablets.
  const lastLooks = new Map();   // board frame → { offered: [ids], id } at the last render
  const picking = new Set();     // board frames with the look picker open
  function lookOf(widget, settings, m, cols) {
    const offered = looksFor(m, { cols });
    let id = settings.look && templateById(settings.look) ? settings.look : null;
    const v2 = ALIAS[settings.size] || settings.size;
    if (!id && /^[124]x[124]$/.test(v2 || "")) id = offered.find((x) => templateById(x).size === v2) || null;
    // the natural look counts as offered when the board shows its narrow twin instead
    const ok = (x) => !!x && (offered.includes(x) || (templateById(x) && offered.includes(templateById(x).narrow)));
    if (!id) id = ok(widget.look) ? widget.look : offered[0] || "number";
    return { id, offered };
  }
  // every offered look of this model, rendered small to pick from; action = a board copy's picker
  function pickerHtml(m, offered, current, cols, { action = true } = {}) {
    const btn = (value, inner, span, label) => `<button type="button" class="w-look${value === current ? " on" : ""}" ${action ? `data-action="look" data-value="${esc(value)}"` : `data-look="${esc(value)}"`} style="${span}">${inner}<span class="w-look-n">${esc(label)}</span></button>`;
    return `<div class="w-looks">` + offered.map((id) => {
      const r = renderLook(m, id, { cols }), [w, h] = r.size.split("x").map(Number), t = templateById(r.id);
      return btn(id, `<div class="gcard">${r.html}</div>`, `grid-column:span ${w};grid-row:span ${h}`, `${t.name} · ${r.size.replace("x", "×")}`);
    }).join("") + btn("full", `<div class="gcard w-look-table"><span>▦</span><small>the full table</small></div>`, "grid-column:span 1;grid-row:span 1", "Full table") + `</div>`;
  }
  const sizeChoices = (type, settings) => {
    const s = sizesOf(type), cur = sizeOf(type, settings);
    return s.length ? [...s, "full"].map((v) => [v, SIZE_LABEL[v], v === cur]) : [];
  };
  // a copy's settings with a look chosen: a template id, or "full" for the table
  const withLook = (s, look) => {
    const out = { ...s };
    delete out.style;
    if (look === "full") { out.size = "full"; delete out.look; } else { out.look = look; delete out.size; }
    return out;
  };
  const colsOf = (boardId) => { const b = doc.boards.find((x) => x.id === boardId); return (b && b.cols) || COLS_DEFAULT; };

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

  const summaryHtml = (html, mode) => (!html || mode === "off" ? "" : mode === "compact" ? `<div class="w-sum-compact">${html}</div>` : html);
  function body(widget, settings, data, ctx, tab, force = null, sizes = []) {
    try {
      if (widget.view) {
        // a tile or a chart: its own HTML, no table settings; its own options (if any) are the panel
        const out = widget.view(data || {}, ctx || {}, settings.opts || {}) || {};
        return { html: out.html || `<div class="w-empty-msg">${esc(out.empty || "Nothing to show.")}</div>`,
          settingsHtml: tableSettingsPanel([], settings, { tab, view: true, options: (widget.options || []).filter((o) => !force || !(o.key in force)),
            optionsLabel: widget.optionsLabel, defaultTitle: ownTitle(widget, settings), sizes }) };
      }
      const out = widget.build(data || {}, ctx || {}, settings.opts || {});
      const opts = { rowKey: widget.rowKey, rowLabel: widget.rowLabel, rowClass: widget.rowClass, keepRow: widget.keepRow };
      return {
        // summary: trusted HTML from the widget above its table (tiles, a big bar) — shown, compact or hidden
        html: summaryHtml(out.summary, settings.summary) + (out.rows.length ? renderTable(widget.columns, out.rows, settings, opts) + (out.footer || "")
          : `<div class="w-empty-msg">${esc(out.empty || "Nothing to show.")}</div>`),
        settingsHtml: tableSettingsPanel(widget.columns, settings, { rows: out.rows, ...opts, tab,
          options: (widget.options || []).filter((o) => !force || !(o.key in force)), optionsLabel: widget.optionsLabel,
          summary: !!out.summary, defaultTitle: ownTitle(widget, settings), sizes }),
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
    return renderFrame({ id, title: titleOf(widget, settings), place: "page", body: b.html, fresh, pinned: pinnedCount(doc, type), cog: true,
      settingsHtml: b.settingsHtml, settingsOpen: open.has(id) });
  }

  function renderItem(boardId, item, { data, ctx, fresh, pending = false, cols: liveCols = 0 } = {}) {
    const id = `b:${boardId}:${item.i}`;
    const widget = registry[item.type];
    if (!widget) {
      return renderFrame({ id, title: item.type, place: "board", w: item.w, h: item.h, body: `<div class="w-error">This widget no longer exists — remove it.</div>` });
    }
    const settings = effective(widget, item.settings);
    const size = sizeOf(item.type, settings), sizes = sizeChoices(item.type, settings);
    const loading = `<div class="w-fresh">Loading…</div>`;
    const b = pending ? { html: loading, settingsHtml: "" } : body(widget, settings, data, ctx, open.get(id), null, sizes);
    const title = titleOf(widget, settings);
    if (size === "full") {
      expanded.delete(id);
      // w is the share of 12 the table was given; on a board of N columns it spans that share of N
      const cols = colsOf(boardId);
      return renderFrame({ id, title, place: "board", w: Math.max(1, Math.round((item.w * cols) / 12)), h: item.h, body: b.html, fresh, cog: true,
        settingsHtml: b.settingsHtml, settingsOpen: open.has(id) });
    }
    // the glance face; open, the full widget in a sheet over the board (the ⚙ then lives in the sheet)
    const isOpen = expanded.has(id);
    if (hasModel(widget)) {
      // a model widget: its look; ◀ n / total ▶ walks the offered looks, ▦ opens the picker with all of them
      const cols = liveCols || colsOf(boardId);
      let html = loading, lookSize = "1x1", nav = null, m = null, offered = [], current = null;
      if (!pending) {
        m = modelOf(widget, settings, data, ctx);
        if (m.error) html = `<div class="w-error">The widget failed: ${esc(m.error)}</div>`;
        else if (m.empty) html = `<div class="w-empty-msg">${esc(m.empty)}</div>`;
        else {
          const pick = lookOf(widget, settings, m, cols), r = renderLook(m, pick.id, { cols });
          offered = pick.offered; current = r.id;
          html = r.html; lookSize = r.size;
          lastLooks.set(id, { offered, id: r.id });
          if (offered.length > 1) nav = { n: offered.indexOf(r.id) + 1 || "–", total: offered.length };
        }
      }
      const [gw, gh] = lookSize.split("x").map(Number);
      const face = renderFrame({ id, title, place: "board", glance: lookSize, body: html, fresh, cog: true, looks: offered.length > 0,
        settingsHtml: b.settingsHtml, settingsOpen: !isOpen && !picking.has(id) && open.has(id), variant: nav, gw: Math.min(gw, cols), gh });
      if (picking.has(id) && offered.length) {
        return face.slice(0, -"</section>".length) + `<div class="w-sheet" data-action="collapse" data-value=""><div class="w-sheet-card w-picker" data-action="noop" data-value="">` +
          `<div class="w-picker-h"><b>Choose a look</b><span>${esc(title)} · ${offered.length} looks with your data</span><button type="button" class="w-btn" data-action="collapse" data-value="" title="close">✕</button></div>` +
          pickerHtml(m, offered, current, cols) + `</div></div></section>`;
      }
      if (!isOpen) return face;
      const sheet = renderFrame({ id, title, place: "sheet", body: b.html, fresh, cog: true, settingsHtml: b.settingsHtml, settingsOpen: open.has(id), looks: offered.length > 0 });
      return face.slice(0, -"</section>".length) +
        `<div class="w-sheet" data-action="collapse" data-value=""><div class="w-sheet-card" data-action="noop" data-value="">${sheet}</div></div></section>`;
    }
    return "";   // not reached: a widget without a model is always the table
  }

  function handle(frameId, action, value) {
    const f = parse(frameId);
    if (!f || !f.widget && action !== "remove") return false;
    if (action === "refresh") {
      onRefresh(frameId, f.type, f.place === "page" ? pageOpts(f.type, f.key.includes("@") ? f.key.split("@")[1] : "", f.force) : itemOpts(f.item));
      return true;
    }
    if (action === "noop") return true;   // a click inside an open sheet that is not on a control
    if (action === "variant" && f.place === "board") {
      // ◀ ▶: the previous / next offered look (wrapping), from the list the last render offered
      const last = lastLooks.get(frameId);
      if (!last || !last.offered.length) return false;
      const list = last.offered, at = Math.max(0, list.indexOf(last.id));
      const next = list[((at + (Number(value) < 0 ? -1 : 1)) % list.length + list.length) % list.length];
      return save(updateItemSettings(doc, f.boardId, f.item.i, withLook(effective(f.widget, f.item.settings), next)), frameId);
    }
    if (action === "looks" && f.place === "board") { picking.add(frameId); open.delete(frameId); onChange(frameId); return true; }
    if (action === "look" && f.place === "board") {
      // a look picked in the picker ("full" = the table)
      picking.delete(frameId);
      return save(updateItemSettings(doc, f.boardId, f.item.i, withLook(effective(f.widget, f.item.settings), String(value))), frameId);
    }
    if (action === "expand" || action === "collapse") {
      if (f.place !== "board") return false;
      if (action === "expand") expanded.add(frameId);
      else if (!expanded.delete(frameId) && !picking.delete(frameId)) return false;
      else picking.delete(frameId);
      onChange(frameId);
      return true;
    }
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
      if (["s", "m", "t", "l", "full", ...SIZES].includes(v.size)) settings.size = v.size;   // the size and style picked in the gallery
      if (typeof v.look === "string" && (v.look === "full" || templateById(v.look))) Object.assign(settings, withLook(settings, v.look));
      // the chosen board, else the one visited last, else the first (a synced document may have no "main")
      const board = typeof v.board === "string" && doc.boards.some((b) => b.id === v.board) ? v.board : pinTarget(doc);
      return save(pin(doc, { type: f.type, settings }, board), frameId);
    }
    if (f.place === "board") {
      if (action === "remove") { open.delete(frameId); expanded.delete(frameId); return save(unpin(doc, f.boardId, f.item.i), frameId); }
      if (action === "move-to") {
        const t = parse(value);
        if (!t || t.place !== "board" || t.boardId !== f.boardId || t.item.i === f.item.i) return false;
        return save(moveItemTo(doc, f.boardId, f.item.i, t.item.i), frameId);
      }
      if (action === "resize") {
        // the drag reports columns of this board; a table keeps its width as a share of 12
        const [w, h] = String(value).split("|");
        const cols = colsOf(f.boardId);
        const w12 = Math.round((Math.min(cols, Math.max(1, Number(w) || 1)) * 12) / cols);
        return save(resizeItem(doc, f.boardId, f.item.i, { w: w12, h: h === undefined ? undefined : h }), frameId);
      }
    }
    return false;
  }

  // A widget's needs, fetched through the store. data[name] is the entry's data, except that a need
  // named "farm" gets the game farm itself (the farm resource is the proxy's {farm: …} answer).
  // needs(farmId, opts): a widget may ask for different data per copy (its own options); without
  // opts the widget's defaults.
  const optsFor = (type, saved) => (registry[type] ? effective(registry[type], saved || {}).opts || {} : {});
  const needList = (type, farmId, opts) => {
    const widget = registry[type];
    return widget && widget.needs ? Object.entries(widget.needs(farmId, opts || optsFor(type))) : [];
  };
  const needsOf = (type, farmId, opts) => needList(type, farmId, opts).map(([, q]) => q);
  // the options of the page copy (with what the page forces) and of a board item
  const pageOpts = (type, variant = "", force = null) =>
    ({ ...optsFor(type, pageSettings(doc, variant ? `${type}@${variant}` : type)), ...(force || {}) });
  const itemOpts = (item) => optsFor(item.type, item.settings);
  function shape(needs, entries) {
    const data = {};
    needs.forEach(([name], k) => {
      const d = entries[k] ? entries[k].data : null;
      data[name] = name === "farm" ? (d && d.farm) || null : d;
    });
    return data;
  }
  async function loadData(type, farmId, store, opts) {
    const needs = needList(type, farmId, opts);
    if (!needs.length) return { data: {}, entries: [] };
    const entries = await Promise.all(needs.map(([, q]) => store.get(q)));
    return { data: shape(needs, entries), entries };
  }
  // The same from what the store already holds, without waiting. pending = a need the widget cannot
  // do without (not in widget.optional) has no entry yet.
  function peekData(type, farmId, store, opts) {
    const needs = needList(type, farmId, opts);
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

  // The gallery's table preview: the widget's body with its defaults (plus opts), no frame or controls.
  // (A model widget's look preview is lookPreview.)
  function preview(type, { data, ctx, opts = null } = {}) {
    const widget = registry[type];
    if (!widget) return "";
    return body(widget, withForce(effective(widget, {}), opts), data, ctx, null).html;
  }

  return { doc: () => doc, update, preview, optsFor, pageOpts, itemOpts, sizesOf, sizeOf: (type, settings) => sizeOf(type, settings),
    colsOf,
    // the gallery: a model widget's look (default: its natural one) with what it offers, and the picker
    lookPreview: (type, { data, ctx, opts = null, look = "", cols = 8 } = {}) => {
      const w = registry[type];
      if (!hasModel(w)) return null;
      const settings = withForce(effective(w, {}), opts), m = modelOf(w, settings, data, ctx);
      if (m.error || m.empty) return { id: null, size: "1x1", offered: [], html: `<div class="w-empty-msg">${esc(m.error || m.empty)}</div>` };
      const pick = lookOf(w, look ? { look } : {}, m, cols), r = renderLook(m, pick.id, { cols });
      return { id: r.id, size: r.size, offered: pick.offered, html: r.html };
    },
    lookPicker: (type, { data, ctx, opts = null, current = "", cols = 8 } = {}) => {
      const w = registry[type];
      if (!hasModel(w)) return "";
      const m = modelOf(w, withForce(effective(w, {}), opts), data, ctx);
      if (m.error || m.empty) return "";
      return pickerHtml(m, looksFor(m, { cols }), current, cols, { action: false });
    },
    setBoardCols: (id, n) => update((d) => setBoardCols(d, id, n)),
    addBoard: (b) => update((d) => addBoard(d, b)), removeBoard: (id) => update((d) => removeBoard(d, id)),
    visit: (id) => update((d) => setLastBoard(d, id)), reload: () => { doc = loadBoards(storage); }, registry, renderPage, renderItem, handle,
    needsOf, loadData, peekData, freshOf };
}
