import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { createHost } from "../../app/widget-host.mjs";

// Every registered widget, rendered the way a board renders a pinned copy that has no data yet, and
// with only the farm: it must show its frame (a message is fine), never "The widget failed", also
// with its ⚙ open. A widget that throws here breaks a whole board for whoever pins it.

const farm = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url))).farm;
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

for (const [type, w] of Object.entries(WIDGETS)) {
  test(`smoke: ${type} renders with no data and with only the farm, ⚙ open too`, () => {
    const h = createHost({ registry: WIDGETS, storage: mem() });
    for (const data of [{}, { farm }]) {
      const html = h.renderPage(type, { data, ctx: {} });
      assert.match(html, new RegExp(`data-frame="page:${type}"`));
      assert.doesNotMatch(html, /The widget failed/, `${type} with ${Object.keys(data).join(",") || "no data"}: ${(html.match(/The widget failed:[^<]*/) || [""])[0]}`);
    }
    h.handle(`page:${type}`, "cog", "");
    const open = h.renderPage(type, { data: { farm }, ctx: {} });
    assert.match(open, /data-pop/, `${type}: the settings panel opens`);
    assert.doesNotMatch(open, /The widget failed/);
  });
}

test("glance looks: no widget keeps a hand-written glance face, and every natural look is in the catalogue", async () => {
  const { templateById } = await import("../../ui/glance-templates.mjs");
  for (const [type, w] of Object.entries(WIDGETS)) {
    assert.strictEqual(w.glance, undefined, `${type} still has a glance()`);
    if (typeof w.glanceModel === "function" && w.look) assert.ok(templateById(w.look), `${type}: look "${w.look}" is not a template`);
  }
});
