// The frame around every widget, on its own page and on the board alike. Plain HTML with
// data-frame / data-action attributes (no element ids, so two copies of a widget never clash);
// bindFrames() delegates the events of everything inside a root to one handler.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

// place "page": cog + pin (pinned = how many copies are on boards). place "board": cog, move,
// width, remove; w (1-12) becomes the grid span.
export function renderFrame({ id, title, place, body, fresh, pinned = 0, w = 6, settingsHtml = "", settingsOpen = false }) {
  const badge = fresh ? `<span class="w-fresh w-fresh-${fresh.level}" title="${esc(fresh.text)}">${esc(fresh.text)}</span>` : "";
  const btn = (action, label, title, value = "") =>
    `<button type="button" class="w-btn" data-action="${action}" data-value="${esc(value)}" title="${esc(title)}">${label}</button>`;
  const tools = place === "board"
    ? btn("move-up", "◀", "dřív") + btn("move-down", "▶", "později") +
      `<select class="w-btn" data-action="width" title="šířka">${[3, 4, 6, 8, 12].map((n) => `<option value="${n}"${n === w ? " selected" : ""}>${n}/12</option>`).join("")}</select>` +
      btn("cog", "⚙", "nastavení") + btn("remove", "✕", "odebrat z dashboardu")
    : btn("cog", "⚙", "nastavení") + btn("pin", pinned ? `📌 ${pinned}` : "📌", pinned ? `připnuto ${pinned}× — připnout další kopii` : "připnout na můj dashboard");
  const style = place === "board" ? ` style="grid-column:span ${Math.min(12, Math.max(1, w))}"` : "";
  return `<section class="w-frame pixel-panel" data-frame="${esc(id)}"${style}>` +
    `<header class="w-head"><span class="w-title">${esc(title)}</span>${badge}<span class="w-tools">${tools}</span></header>` +
    (settingsOpen && settingsHtml ? `<div class="w-settings-wrap">${settingsHtml}</div>` : "") +
    `<div class="w-body">${body}</div></section>`;
}

// Inputs that report a value (number, range, text, select) act on change; everything else
// (buttons, headers, checkboxes, radios) acts on click. handler(frameId, action, value, event).
const VALUE_INPUT = new Set(["number", "range", "text", "select-one"]);

export function bindFrames(root, handler) {
  const fire = (kind) => (e) => {
    const t = e.target && e.target.closest ? e.target.closest("[data-action]") : null;
    if (!t) return;
    const isValue = VALUE_INPUT.has(t.type) || t.tagName === "SELECT";
    if ((kind === "change") !== isValue) return;
    const frame = t.closest("[data-frame]");
    if (!frame) return;
    handler(frame.dataset.frame, t.dataset.action, isValue ? t.value : (t.dataset.value ?? ""), e);
  };
  const onClick = fire("click"), onChange = fire("change");
  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  return () => { root.removeEventListener("click", onClick); root.removeEventListener("change", onChange); };
}
