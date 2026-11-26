import { test } from "node:test";
import assert from "node:assert";
import { TEMPLATES, TEMPLATE_IDS, looksFor, renderLook, templateById, iconCols, countdown } from "../../ui/glance-templates.mjs";
import { createHost } from "../../app/widget-host.mjs";
import { parseBoards, setBoardCols, emptyBoards, cleanSettings } from "../../app/boards.mjs";

// Glance templates (engine v3, docs/superpowers/plans/2026-11-26-glance-templates.md): a curated
// catalogue of looks over a layered model; a look is offered when it fills well and shows more than a
// smaller look of the same kind; a board copy keeps its chosen look (settings.look).

const NOW = Date.UTC(2026, 10, 26, 12), H = 3600e3;
const four = Array.from({ length: 4 }, (_, k) => ({ icon: `<i>${k}</i>`, name: `n${k}`, sub: `s${k}`, chip: { text: "active", tone: "ok" } }));
const WEATHER = { head: { value: 2, unit: "/4", ring: 50, ringTone: "bad", cap: "uncovered" }, items: four, tiles: [{ label: "a", value: 1 }, { label: "b", value: 2 }] };
const RICH = { head: { value: 1, unit: "/15", ring: 7 }, items: Array.from({ length: 14 }, (_, k) => ({ icon: `<i>${k}</i>`, name: `Doll ${k}`, value: `−${k}`, pct: k * 7 })),
  tiles: [{ label: "a", value: 1 }, { label: "b", value: 2 }, { label: "c", value: 3 }], series: [1, 2, 3, 5, 4] };

test("the catalogue: unique, never-renamed ids, each with a size, a presentation and its needs", () => {
  assert.strictEqual(new Set(TEMPLATE_IDS).size, TEMPLATE_IDS.length);
  for (const t of TEMPLATES) {
    assert.match(t.size, /^[124]x[124]$/, t.id);
    assert.ok(t.pres && Array.isArray(t.needs) && t.needs.length, t.id);
    if (t.narrow) assert.ok(templateById(t.narrow) && Number(templateById(t.narrow).size[0]) <= 2, `${t.id} → ${t.narrow}`);
  }
  // ids saved on boards: renaming one would lose people's choices
  for (const id of ["number", "gauge", "next", "icons-1", "list-1", "number-list-2", "strip-2", "overview-4", "icons-4", "dashboard"]) assert.ok(templateById(id), id);
});

test("only looks that fill well and show more than a smaller one of the same kind: four items never get an empty 4×2", () => {
  const looks = looksFor(WEATHER);
  assert.ok(looks.includes("icons-1") && looks.includes("strip-2"), "a 1×1 grid and a 2×1 strip are different presentations");
  assert.ok(!looks.includes("icons-4"), "four icons in a 16-cell grid: not offered");
  assert.ok(!looks.includes("dashboard"), "a dashboard needs a series");
  assert.ok(!looks.some((id) => ["4x2", "1x4", "2x4"].includes(templateById(id).size)));
  assert.ok(looksFor(RICH).length > looks.length, "more data, more looks");
  assert.ok(looksFor(RICH).includes("dashboard"));
});

test("icon grids use equal columns: 4 items are 2×2 in a 1×1, a row in a 4×1, a column in a 1×4", () => {
  assert.strictEqual(iconCols(4, 1, 1), 2);
  assert.strictEqual(iconCols(4, 4, 1), 4);
  assert.strictEqual(iconCols(4, 1, 4), 1);
  const html = renderLook(WEATHER, "icons-1").html;
  assert.match(html, /class="gx-icons" style="--c:2"/);
  assert.strictEqual((html.match(/class="gx-cell"/g) || []).length, 4, "all four, none cut off");
});

test("a live countdown for an item with a time; Ready once it has passed", () => {
  assert.strictEqual(countdown(NOW + 2.1 * H, NOW), "2h 6m");
  assert.strictEqual(countdown(NOW + 30 * H, NOW), "1d 6h");
  assert.strictEqual(countdown(NOW - 1, NOW), "Ready");
  const m = { items: [{ icon: "<i></i>", name: "Wooly Doll", at: NOW - 1 }, { icon: "<i></i>", name: "Gilded Doll", at: NOW + 2.1 * H }] };
  const html = renderLook(m, "icons-1", { now: NOW }).html;
  assert.match(html, /<small class="gx-tag g-ok"><span class="g-at" data-at="\d+">Ready<\/span><\/small>/);
  assert.match(html, /<small class="gx-tag g-info"><span class="g-at" data-at="\d+">2h 6m<\/span><\/small>/);
});

test("a narrow board shows a wide look's narrow twin, and offers no twin twice", () => {
  assert.strictEqual(renderLook(RICH, "dashboard", { cols: 2 }).id, "overview-4");
  assert.strictEqual(renderLook(RICH, "dashboard", { cols: 8 }).id, "dashboard");
  const phone = looksFor(RICH, { cols: 2 });
  assert.strictEqual(new Set(phone).size, phone.length);
  assert.ok(phone.every((id) => Number(templateById(id).size[0]) <= 2));
});

test("a look whose needs fail falls back to one that can render (never blank)", () => {
  const r = renderLook({ head: { value: 3 } }, "icons-4");
  assert.match(r.html, /gx-num/);
});

// ── the host ──
const W = {
  type: "w", title: "Weather", look: "icons-1", columns: [{ key: "n", label: "N" }], rowKey: (r) => r.n, build: () => ({ rows: [{ n: "a" }] }),
  glanceModel: () => WEATHER,
};
function mem() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; }
const first = (h) => h.doc().boards[0].items[0];

test("a board copy shows its look; ◀ ▶ walks the offered looks; ▦ opens the picker with all of them; a pick is saved", () => {
  const h = createHost({ registry: { w: W }, storage: mem() });
  h.handle("page:w", "pin", JSON.stringify({ board: "main" }));
  const id = `b:main:${first(h).i}`, offered = looksFor(WEATHER, { cols: 6 });
  let html = h.renderItem("main", first(h), { data: {} });
  assert.match(html, /w-g-1x1/);
  assert.match(html, /class="gx-icons"/, "the widget's natural look");
  assert.match(html, new RegExp(`<span class="w-var-n">${offered.indexOf("icons-1") + 1} / ${offered.length}</span>`));
  assert.match(html, /data-action="looks"/);
  h.handle(id, "variant", "1");
  assert.strictEqual(first(h).settings.look, offered[offered.indexOf("icons-1") + 1]);
  h.handle(id, "looks", "");
  html = h.renderItem("main", first(h), { data: {} });
  assert.match(html, /class="w-sheet-card w-picker"/);
  assert.strictEqual((html.match(/class="w-look[ "]/g) || []).length, offered.length + 1, "every look, and the full table");
  h.handle(id, "look", "strip-2");
  assert.strictEqual(first(h).settings.look, "strip-2");
  html = h.renderItem("main", first(h), { data: {} });
  assert.doesNotMatch(html, /w-picker/, "the pick closes the picker");
  assert.match(html, /style="--gw:2;--gh:1"/);
  h.handle(id, "look", "full");
  assert.match(h.renderItem("main", first(h), { data: {} }), /<table/);
  // a saved look the list does not offer (the nav shows "–"): ▶ starts at the first offered, ◀ at the last
  const away = TEMPLATE_IDS.find((x) => !offered.includes(x) && templateById(x).size === "2x4");
  for (const [dir, want] of [["1", offered[0]], ["-1", offered[offered.length - 1]]]) {
    h.handle(id, "look", away);
    assert.match(h.renderItem("main", first(h), { data: {} }), /<span class="w-var-n">– \/ /);
    h.handle(id, "variant", dir);
    assert.strictEqual(first(h).settings.look, want, dir);
  }
});

test("phones: a 2-column board renders a wide look's narrow twin", () => {
  const h = createHost({ registry: { w: { ...W, glanceModel: () => RICH, look: "dashboard" } }, storage: mem() });
  h.handle("page:w", "pin", JSON.stringify({ board: "main" }));
  assert.match(h.renderItem("main", first(h), { data: {}, cols: 8 }), /w-g-4x2/);
  assert.match(h.renderItem("main", first(h), { data: {}, cols: 2 }), /w-g-2x2/);
});

test("saved settings: look kept, v2 size read as a look of that size", () => {
  assert.deepStrictEqual(cleanSettings({ look: "strip-2" }), { look: "strip-2" });
  assert.deepStrictEqual(cleanSettings({ look: "<bad>" }), {});
  const h = createHost({ registry: { w: W }, storage: mem() });
  h.handle("page:w", "pin", JSON.stringify({ board: "main", size: "2x1", style: "icons" }));
  assert.match(h.renderItem("main", first(h), { data: {} }), /w-g-2x1/, "a v2 copy at 2×1 keeps a 2×1 look");
  const g = createHost({ registry: { w: W }, storage: mem() });
  g.handle("page:w", "pin", JSON.stringify({ board: "main", look: "overview-4" }));
  assert.strictEqual(g.doc().boards[0].items[0].settings.look, "overview-4", "the gallery's pick");
  assert.ok(g.lookPreview("w", { data: {} }).offered.length > 3);
  assert.match(g.lookPicker("w", { data: {} }), /data-look="icons-1"/);
});

test("a board keeps its own column count (2-12, default 6); a full table spans its share of them", () => {
  let d = emptyBoards();
  d = setBoardCols(d, "main", 12);
  assert.strictEqual(d.boards[0].cols, 12);
  assert.strictEqual(setBoardCols(d, "main", 40).boards[0].cols, 12);
  assert.strictEqual(setBoardCols(d, "main", 1).boards[0].cols, 2);
  assert.strictEqual(parseBoards(JSON.stringify(setBoardCols(d, "main", 8))).boards[0].cols, 8);
  const h = createHost({ registry: { w: { ...W, glanceModel: undefined } }, storage: mem() });
  h.handle("page:w", "pin", JSON.stringify({ board: "main" }));
  h.setBoardCols("main", 12);
  assert.match(h.renderItem("main", first(h), { data: {} }), /style="grid-column:span 6;--tw:6"/);
  h.setBoardCols("main", 4);
  assert.match(h.renderItem("main", first(h), { data: {} }), /style="grid-column:span 2;--tw:6"/);
});

test("long countdowns read as months / years; initials skip symbols; three tiles stay one row", () => {
  assert.strictEqual(countdown(NOW + 90 * 24 * H, NOW), "3mo");
  assert.strictEqual(countdown(NOW + 3395 * 24 * H, NOW), "9.3y");
  assert.match(renderLook({ items: [{ name: "▶ A5 · target" }, { name: "x" }, { name: "y" }] }, "list-1").html, /<span class="g-ini">A5<\/span>/);
  const ov = renderLook({ head: { value: 1 }, items: [{ name: "a" }, { name: "b" }, { name: "c" }], tiles: [{ label: "a", value: 1 }, { label: "b", value: 2 }, { label: "c", value: 3 }] }, "overview-4").html;
  assert.match(ov, /class="gx-tiles" style="--c:3"/, "a 3-column row, not the 2-column orphan rule");
});

test("a list never hides one or two things: 4 things get looks that show all 4; a long list ends in +N more", () => {
  const m = { head: { value: 4, unit: "/4", cap: "all protected", ring: 1 }, items: four, tiles: [{ label: "a", value: 1 }, { label: "b", value: 2 }] };
  const offered = looksFor(m);
  for (const id of ["list-1", "number-list-2", "next-2"]) assert.ok(!offered.includes(id), `${id} would show 3 of 4`);
  assert.ok(offered.includes("lines-1") && offered.includes("overview-4"));
  assert.strictEqual((renderLook(m, "overview-4", { now: NOW }).html.match(/class="gx-row"/g) || []).length, 4, "the overview shows all four");
  const many = { items: Array.from({ length: 20 }, (_, k) => ({ name: `n${k}` })) };
  const html = renderLook(many, "list-4", { now: NOW }).html;
  assert.strictEqual((html.match(/class="gx-row"/g) || []).length, 7);
  assert.match(html, /gx-more-row">\+13 more</);
});
