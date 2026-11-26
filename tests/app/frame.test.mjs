import { test } from "node:test";
import assert from "node:assert";
import { renderFrame, freshness, bindFrames, spanAt, rowsAt, dropIndex, patchFrames } from "../../ui/frame.mjs";

// The widget frame: title, freshness, cog, pin (on its page) or remove/move/width (on the board).

test("freshness reads the store entry: loading, ok with age, stale, error", () => {
  const now = 10 * 60_000;
  assert.deepStrictEqual(freshness(null, now), { text: "načítám…", level: "loading" });
  assert.deepStrictEqual(freshness({ status: "ok", asOf: now - 30_000 }, now), { text: "teď", level: "ok" });
  assert.deepStrictEqual(freshness({ status: "ok", asOf: now - 5 * 60_000 }, now), { text: "před 5 min", level: "ok" });
  assert.deepStrictEqual(freshness({ status: "error", stale: true, asOf: now - 3 * 60_000, error: "x 429" }, now),
    { text: "starší data (před 3 min) — x 429", level: "stale" });
  assert.deepStrictEqual(freshness({ status: "error", stale: false, error: "boom" }, now), { text: "chyba — boom", level: "error" });
});

test("on its page: title, badge, cog and a pin button; no board controls", () => {
  const html = renderFrame({ id: "fishing-age-now", title: "Do sudu <teď>", place: "page", body: "<p>B</p>", fresh: { text: "teď", level: "ok" } });
  assert.match(html, /data-frame="fishing-age-now"/);
  assert.match(html, /Do sudu &lt;teď&gt;/);
  assert.match(html, /data-action="cog"/);
  assert.match(html, /data-action="pin"/);
  assert.doesNotMatch(html, /data-action="remove"/);
  assert.match(html, /<p>B<\/p>/);
  assert.match(html, /w-fresh-ok[^>]*>teď/);
});

test("a pinned page widget says so on its pin button", () => {
  assert.match(renderFrame({ id: "x", title: "X", place: "page", body: "", pinned: 2 }), /data-action="pin"[^>]*>📌 2/);
});

test("on the board: a drag handle, cog, remove and a resize corner; no pin, arrows or width select; w and h size it", () => {
  const html = renderFrame({ id: "w3", title: "X", place: "board", body: "", w: 8, h: 10 });
  assert.match(html, /data-drag="item"/);
  assert.match(html, /data-resize/);
  assert.match(html, /data-action="remove"/);
  assert.match(html, /data-action="cog"/);
  assert.doesNotMatch(html, /data-action="(pin|move-up|move-down|width)"/);
  assert.doesNotMatch(html, /<select/);
  assert.match(html, /grid-column:span 8/);
  assert.match(html, /height:400px/);
  assert.doesNotMatch(renderFrame({ id: "w3", title: "X", place: "board", body: "", w: 8, h: 0 }), /height:/);
});

test("the settings open as a popover with its own close button, only when open", () => {
  assert.doesNotMatch(renderFrame({ id: "x", title: "X", place: "page", body: "", settingsHtml: "<i>S</i>" }), /<i>S<\/i>|data-pop/);
  const html = renderFrame({ id: "x", title: "X", place: "page", body: "", settingsHtml: "<i>S</i>", settingsOpen: true });
  assert.match(html, /<div class="w-pop" data-pop[^>]*>.*Nastavení.*data-action="cog".*<i>S<\/i>/s);
});

test("resize geometry: the pointer position snaps to twelfths of the grid and to 40 px rows", () => {
  // grid 1200 px wide, 8 px gaps → a column is (1200 - 88) / 12 = 92.67 px, a step 100.67 px
  const g = { gridWidth: 1200, gap: 8 };
  assert.strictEqual(spanAt({ ...g, frameLeft: 100, pointerX: 100 + 6 * 100.67 - 8 }), 6);
  assert.strictEqual(spanAt({ ...g, frameLeft: 100, pointerX: 100 + 2 }), 1);
  assert.strictEqual(spanAt({ ...g, frameLeft: 100, pointerX: 9999 }), 12);
  assert.strictEqual(spanAt({ ...g, frameLeft: 100, pointerX: 100 + 3.6 * 100.67 }), 4);
  assert.strictEqual(rowsAt({ frameTop: 50, pointerY: 50 + 405 }), 10);
  assert.strictEqual(rowsAt({ frameTop: 50, pointerY: 10 }), 1);
  assert.strictEqual(rowsAt({ frameTop: 0, pointerY: 99999 }), 24);
});

test("drop index: how many of the other rows' midpoints lie above the pointer", () => {
  const mids = [{ top: 0, height: 20 }, { top: 20, height: 20 }, { top: 40, height: 20 }];
  assert.strictEqual(dropIndex(mids, -5), 0);
  assert.strictEqual(dropIndex(mids, 15), 1);
  assert.strictEqual(dropIndex(mids, 31), 2);
  assert.strictEqual(dropIndex(mids, 500), 3);
});

// A minimal stand-in for the DOM the delegation touches: closest() and dataset.
function el(attrs, parent) {
  return {
    parent, attrs, dataset: Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith("data-")).map(([k, v]) => [k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase()), v])),
    type: attrs.type, value: attrs.value, checked: attrs.checked,
    closest(sel) {
      const want = sel.match(/^\[(.+)\]$/)[1];
      for (let n = this; n; n = n.parent) if (want in n.attrs) return n;
      return null;
    },
  };
}

test("delegated events: an action inside a frame reaches the handler with frame id, action, value", () => {
  const listeners = {};
  const root = { addEventListener: (t, fn) => { listeners[t] = fn; }, removeEventListener: (t) => { delete listeners[t]; } };
  const got = [];
  const off = bindFrames(root, (frame, action, value) => got.push([frame, action, value]));
  const frame = el({ "data-frame": "w1" });
  listeners.click({ target: el({ "data-action": "remove", "data-value": "" }, frame) });
  listeners.click({ target: el({ "data-action": "sort", "data-value": "qty" }, el({}, frame)) });
  listeners.change({ target: el({ "data-action": "rows-top", type: "number", value: "7" }, frame) });
  listeners.change({ target: el({ "data-action": "text-size", type: "range", value: "120" }, frame) });
  listeners.click({ target: el({ "data-action": "rows-top", type: "number", value: "7" }, frame) });
  listeners.click({ target: el({ "data-action": "x" }, null) });
  assert.deepStrictEqual(got, [["w1", "remove", ""], ["w1", "sort", "qty"], ["w1", "rows-top", "7"], ["w1", "text-size", "120"]]);
  off();
  assert.deepStrictEqual(Object.keys(listeners), []);
});

test("a click outside an open popover, or Escape, closes it; a click inside does not", () => {
  const listeners = {};
  const frame = el({ "data-frame": "w1" });
  const pop = el({ "data-pop": "" }, frame);
  const root = { addEventListener: (t, fn) => { listeners[t] = fn; }, removeEventListener() {}, querySelectorAll: (sel) => (sel === "[data-pop]" ? [pop] : []) };
  const got = [];
  bindFrames(root, (f, action) => got.push([f, action]));
  listeners.click({ target: el({ "data-value": "" }, pop) });
  assert.deepStrictEqual(got, []);
  listeners.click({ target: el({}, null) });
  assert.deepStrictEqual(got, [["w1", "settings-close"]]);
  listeners.click({ target: el({ "data-action": "cog" }, frame) });
  assert.deepStrictEqual(got, [["w1", "settings-close"], ["w1", "cog"]]);
  listeners.keydown({ key: "Escape", target: el({}, null) });
  assert.deepStrictEqual(got.at(-1), ["w1", "settings-close"]);
});

test("patchFrames: a repaint replaces only the frames whose HTML changed (an embedded page is not reloaded)", () => {
  const child = (id, html) => {
    const c = { dataset: { frame: id }, _wHtml: html, replaced: 0 };
    Object.defineProperty(c, "outerHTML", { set(v) { c.replaced++; c._set = v; } });
    return c;
  };
  const a = child("b:m:a", "<A>"), b = child("b:m:b", "<B>");
  const grid = { children: [a, b] };
  assert.strictEqual(patchFrames(grid, [{ id: "b:m:a", html: "<A>" }, { id: "b:m:b", html: "<B2>" }]), true);
  assert.deepStrictEqual([a.replaced, b.replaced, b._set], [0, 1, "<B2>"]);
  // a different set or order of frames: the caller rebuilds the grid
  assert.strictEqual(patchFrames(grid, [{ id: "b:m:b", html: "<B>" }, { id: "b:m:a", html: "<A>" }]), false);
  assert.strictEqual(patchFrames(grid, [{ id: "b:m:a", html: "<A>" }]), false);
  assert.strictEqual(patchFrames(null, []), false);
});
