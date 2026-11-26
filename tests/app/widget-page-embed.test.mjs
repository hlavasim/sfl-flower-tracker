import { test } from "node:test";
import assert from "node:assert";
import { pageEmbed as W } from "../../widgets/page-embed.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { createHost } from "../../app/widget-host.mjs";

// 📄 Stránka: any classic page, whole, inside a board widget (an iframe of ?page=X&embed=1), until
// the page has native widgets of its own.

const CTX = { embedUrl: (p) => `/flowers.html?page=${p}&embed=1`, pages: ["flowers", "power", "roadmap", "board", "dashboard"] };

test("registered; needs nothing (the embedded page loads its own data)", () => {
  assert.strictEqual(WIDGETS["page-embed"], W);
  assert.deepStrictEqual(W.needs(7), {});
});

test("the page in an iframe that sizes itself; the title is the page's label", () => {
  const { html } = W.view({}, CTX, { page: "power", label: "⚡ POWER" });
  assert.match(html, /<iframe class="w-embed" data-auto="1" src="\/flowers\.html\?page=power&amp;embed=1"/);
  assert.strictEqual(W.titleFor({ page: "power", label: "⚡ POWER" }), "📄 ⚡ POWER");
  assert.strictEqual(W.titleFor({ page: "power" }), "📄 power");
});

test("a board inside a board, an unknown page or none: a message, no iframe", () => {
  for (const page of ["board", "dashboard", "nope", undefined, "x\" onload=\"alert(1)"]) {
    const out = W.view({}, CTX, { page });
    assert.ok(!out.html, String(page));
    assert.match(out.empty, /stránk/);
  }
});

test("the host hands a view widget its own options", () => {
  const storage = { m: new Map(), getItem(k) { return this.m.get(k) ?? null; }, setItem(k, v) { this.m.set(k, String(v)); } };
  const h = createHost({ registry: { "page-embed": W }, storage });
  h.handle("page:page-embed", "pin", JSON.stringify({ page: "roadmap", label: "🗺 ROADMAP" }));
  const item = h.doc().boards[0].items[0];
  const html = h.renderItem("main", item, { data: {}, ctx: CTX });
  assert.match(html, /page=roadmap&amp;embed=1/);
  assert.match(html, /📄 🗺 ROADMAP/);
});
