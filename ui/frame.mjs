// The frame around every widget, on its own page and on the board alike. Plain HTML with
// data-frame / data-action attributes (no element ids, so two copies of a widget never clash);
// bindFrames() delegates the events of everything inside a root to one handler.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const ROW_PX = 40;   // one unit of a board item's height (h)

// A store entry → the freshness badge: { text, level: loading|ok|stale|error }.
export function freshness(entry, now = Date.now()) {
  if (!entry) return { text: "načítám…", level: "loading" };
  const age = (t) => {
    const min = Math.floor((now - t) / 60_000);
    return min < 1 ? "teď" : `před ${min} min`;
  };
  if (entry.status === "ok") return { text: age(entry.asOf), level: "ok" };
  if (entry.stale) return { text: `starší data (${age(entry.asOf)}) — ${entry.error}`, level: "stale" };
  return { text: `chyba — ${entry.error}`, level: "error" };
}

// place "page": cog + pin (pinned = how many copies are on boards). place "board": a drag handle
// (⠿, drop onto another widget to move), cog, remove and a resize corner; w (1-12) becomes the
// grid span, h (rows of ROW_PX, 0 = auto) the height. The settings open as a popover.
export function renderFrame({ id, title, place, body, fresh, pinned = 0, w = 6, h = 0, settingsHtml = "", settingsOpen = false, cog = true }) {
  const badge = fresh ? `<span class="w-fresh w-fresh-${fresh.level}" title="${esc(fresh.text)}">${esc(fresh.text)}</span>` : "";
  const btn = (action, label, title, value = "", cls = "") =>
    `<button type="button" class="w-btn${cls}" data-action="${action}" data-value="${esc(value)}" title="${esc(title)}" aria-label="${esc(title)}">${label}</button>`;
  const board = place === "board";
  const tools = btn("refresh", "↻", "načíst znovu") + (cog ? btn("cog", "⚙", "nastavení", "", settingsOpen ? " on" : "") : "") + (board
    ? btn("remove", "✕", "odebrat z dashboardu")
    : btn("pin", pinned ? `📌 ${pinned}` : "📌", pinned ? `připnuto ${pinned}× — připnout další kopii` : "připnout na můj dashboard"));
  const grip = board ? `<span class="w-grip" data-drag="item" title="táhni a pusť na jiný widget">⠿</span>` : "";
  const style = board
    ? ` style="grid-column:span ${Math.min(12, Math.max(1, w))}${h > 0 ? `;height:${h * ROW_PX}px` : ""}"` : "";
  const pop = settingsOpen && settingsHtml
    ? `<div class="w-pop" data-pop role="dialog" aria-label="Nastavení"><div class="w-pop-head"><span>Nastavení</span>` +
      `<button type="button" class="w-btn" data-action="cog" data-value="" title="zavřít" aria-label="zavřít">✕</button></div>${settingsHtml}</div>` : "";
  return `<section class="w-frame pixel-panel${board ? " w-on-board" : ""}" data-frame="${esc(id)}"${style}>` +
    `<header class="w-head">${grip}<span class="w-title">${esc(title)}</span>${badge}<span class="w-tools">${tools}</span></header>` +
    pop + `<div class="w-body">${body}</div>` + (board ? `<span class="w-resize" data-resize title="táhni pro změnu velikosti"></span>` : "") + `</section>`;
}

// Resize geometry. The pointer's distance from the frame's left edge, in grid steps (a column plus
// a gap) → the span 1-12; its distance from the top, in ROW_PX → the height 1-24.
export function spanAt({ frameLeft, pointerX, gridWidth, gap }) {
  const step = (gridWidth - 11 * gap) / 12 + gap;
  return Math.min(12, Math.max(1, Math.round((pointerX - frameLeft + gap) / step)));
}
export function rowsAt({ frameTop, pointerY }) {
  return Math.min(24, Math.max(1, Math.round((pointerY - frameTop) / ROW_PX)));
}
// Where a dragged row lands: how many of the OTHER rows' midpoints lie above the pointer.
export function dropIndex(rects, y) {
  return rects.filter((r) => r.top + r.height / 2 < y).length;
}

// Inputs that report a value (number, range, text, select) act on change, and number / range /
// text also live while typing or dragging (after a short pause, the field keeps the focus across
// the re-render); everything else (buttons, headers, checkboxes) acts on click. handler(frameId, action, value, event).
// A click outside an open popover, or Escape, sends "settings-close" for it. Pointer drags:
// a column grip reports "col-move" ("key|index"), a board item's grip "move-to" (the frame it was
// dropped on), the resize corner "resize" ("w|h"); all three show a live preview while dragging.
const VALUE_INPUT = new Set(["number", "range", "text", "select-one"]);
const LIVE_INPUT = new Set(["number", "range", "text"]);
const LIVE_MS = 350;

// The focused control inside a frame, as something that survives a re-render of that frame.
export function focusKey(t) {
  const frame = t && t.closest ? t.closest("[data-frame]") : null;
  if (!frame || !t.dataset || !t.dataset.action) return null;
  return { frame: frame.dataset.frame, action: t.dataset.action };
}
export function refocus(root, key) {
  if (!key || !root || !root.querySelector) return;
  const el = root.querySelector(`[data-frame="${key.frame}"] [data-action="${key.action}"]`);
  if (!el || typeof el.focus !== "function") return;
  el.focus();
  try { if (el.type === "text" && el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* not selectable */ }
}

export function bindFrames(root, handler) {
  const closeOpen = (except) => {
    const pops = root.querySelectorAll ? [...root.querySelectorAll("[data-pop]")] : [];
    for (const p of pops) {
      const f = p.closest("[data-frame]");
      if (f && f !== except) handler(f.dataset.frame, "settings-close", "");
    }
  };
  const fire = (kind) => (e) => {
    const t = e.target && e.target.closest ? e.target.closest("[data-action]") : null;
    if (kind === "click" && !(e.target && e.target.closest && e.target.closest("[data-pop]"))) {
      // outside every popover: close them (the cog of the same frame toggles its own)
      const own = t && t.dataset.action === "cog" ? t.closest("[data-frame]") : null;
      closeOpen(own);
    }
    if (!t) return;
    const isValue = VALUE_INPUT.has(t.type) || t.tagName === "SELECT";
    if ((kind === "change") !== isValue) return;
    const frame = t.closest("[data-frame]");
    if (!frame) return;
    if (kind === "change" && t._wSent === t.value) return;   // already applied while typing
    const key = isValue ? focusKey(t) : null;
    handler(frame.dataset.frame, t.dataset.action, isValue ? t.value : (t.dataset.value ?? ""), e);
    if (key) refocus(root, key);
  };
  const timers = new Map();   // "frame|action" → pending live update
  const onInput = (e) => {
    const t = e.target && e.target.closest ? e.target.closest("[data-action]") : null;
    if (!t || !LIVE_INPUT.has(t.type)) return;
    const key = focusKey(t);
    if (!key) return;
    const k = key.frame + "|" + key.action;
    clearTimeout(timers.get(k));
    timers.set(k, setTimeout(() => {
      timers.delete(k);
      t._wSent = t.value;
      handler(key.frame, key.action, t.value, e);
      refocus(root, key);
    }, LIVE_MS));
  };
  const onClick = fire("click"), onChange = fire("change");
  const onKey = (e) => { if (e.key === "Escape") closeOpen(null); };
  const onDown = (e) => startDrag(e, handler);
  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  root.addEventListener("input", onInput);
  root.addEventListener("keydown", onKey);
  root.addEventListener("pointerdown", onDown);
  return () => {
    root.removeEventListener("click", onClick); root.removeEventListener("change", onChange); root.removeEventListener("input", onInput);
    root.removeEventListener("keydown", onKey); root.removeEventListener("pointerdown", onDown);
  };
}

// The three pointer drags (browser only).
function startDrag(e, handler) {
  const t = e.target && e.target.closest ? e.target.closest("[data-drag],[data-resize]") : null;
  if (!t || e.button > 0) return;
  const frame = t.closest("[data-frame]");
  if (!frame) return;
  const id = frame.dataset.frame;
  e.preventDefault();
  const doc = frame.ownerDocument;
  let move, end;

  if (t.hasAttribute("data-resize")) {
    const grid = frame.parentElement, gs = getComputedStyle(grid);
    const gap = parseFloat(gs.columnGap) || 0;
    let w = 0, h = 0;
    move = (ev) => {
      const g = grid.getBoundingClientRect(), f = frame.getBoundingClientRect();
      w = spanAt({ frameLeft: f.left, pointerX: ev.clientX, gridWidth: g.width, gap });
      h = rowsAt({ frameTop: f.top, pointerY: ev.clientY });
      frame.style.gridColumn = `span ${w}`;
      frame.style.height = `${h * ROW_PX}px`;
    };
    end = () => { if (w) handler(id, "resize", `${w}|${h}`); };
    frame.classList.add("w-resizing");
  } else if (t.dataset.drag === "col") {
    const row = t.closest("[data-col]"), list = row.parentElement;
    const others = () => [...list.querySelectorAll(".w-col-row:not(.off)")].filter((r) => r !== row);
    let idx = null;
    move = (ev) => {
      const rows = others();
      idx = dropIndex(rows.map((r) => r.getBoundingClientRect()), ev.clientY);
      rows.forEach((r, k) => r.classList.toggle("w-drop-before", k === idx));
      list.classList.toggle("w-drop-end", idx === rows.length);
    };
    end = () => {
      others().forEach((r) => r.classList.remove("w-drop-before"));
      list.classList.remove("w-drop-end");
      if (idx !== null) handler(id, "col-move", `${row.dataset.col}|${idx}`);
    };
    row.classList.add("w-dragging");
  } else {
    let target = null;
    move = (ev) => {
      const under = doc.elementFromPoint(ev.clientX, ev.clientY);
      const f = under && under.closest ? under.closest(".w-on-board[data-frame]") : null;
      const next = f && f !== frame ? f : null;
      if (next !== target) {
        if (target) target.classList.remove("w-drop-target");
        if (next) next.classList.add("w-drop-target");
        target = next;
      }
    };
    end = () => {
      if (target) { target.classList.remove("w-drop-target"); handler(id, "move-to", target.dataset.frame); }
    };
    frame.classList.add("w-dragging");
  }

  const up = () => {
    doc.removeEventListener("pointermove", move);
    doc.removeEventListener("pointerup", up);
    doc.removeEventListener("pointercancel", up);
    frame.classList.remove("w-dragging", "w-resizing");
    const r = t.closest("[data-col]");
    if (r) r.classList.remove("w-dragging");
    end();
  };
  doc.addEventListener("pointermove", move);
  doc.addEventListener("pointerup", up);
  doc.addEventListener("pointercancel", up);
}

// A board repaint, frame by frame: only a frame whose HTML changed is replaced, so an open settings
// panel or a typed value is not lost to a neighbour's update. false = a different set or order of frames:
// the caller rebuilds the grid (and stamps each child's _wHtml).
export function patchFrames(grid, frames) {
  if (!grid || !grid.children || grid.children.length !== frames.length) return false;
  for (let k = 0; k < frames.length; k++) if (!grid.children[k].dataset || grid.children[k].dataset.frame !== frames[k].id) return false;
  frames.forEach((f, k) => {
    const el = grid.children[k];
    if (el._wHtml === f.html) return;
    el.outerHTML = f.html;
    grid.children[k]._wHtml = f.html;
  });
  return true;
}
