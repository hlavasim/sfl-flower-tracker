import { test } from "node:test";
import assert from "node:assert";
import { createHost } from "../../app/widget-host.mjs";

// A view widget (tile, chart) may have options of its own: then it gets ⚙ with just those.
function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test("a view widget with options gets ⚙ (just its options); one without has none; an option is per copy", () => {
  const V = { type: "v", title: "V", view: (d, c, o) => ({ html: `<b>${o.big ? "BIG" : "small"}</b>` }),
    options: [{ key: "big", label: "Big", kind: "bool" }] };
  const N = { type: "n", title: "N", view: () => ({ html: "x" }) };
  const h = createHost({ registry: { v: V, n: N }, storage: mem() });
  assert.match(h.renderPage("v", { data: {} }), /data-action="cog"/);
  assert.doesNotMatch(h.renderPage("n", { data: {} }), /data-action="cog"/);
  h.handle("page:v", "cog", "");
  const open = h.renderPage("v", { data: {} });
  assert.match(open, /data-action="opt:big"/);
  assert.doesNotMatch(open, /data-action="col-toggle"/);
  assert.match(h.renderPage("v", { data: {} }), /<b>small<\/b>/);
  h.handle("page:v", "opt:big", "1");
  assert.match(h.renderPage("v", { data: {} }), /<b>BIG<\/b>/);
  h.handle("page:v", "reset", "");
  assert.match(h.renderPage("v", { data: {} }), /<b>small<\/b>/);
});
