import { test } from "node:test";
import assert from "node:assert";
import { constantsCoverage, constantsTables } from "../../widgets/constants.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { buildConstantsSection } from "../../core/sections/constants.mjs";
import { renderLook, looksFor } from "../../ui/glance-templates.mjs";

// CONSTANTS: the core/ vs flowers.html coverage (a table with summary tiles) and the core data tables.
const DATA = buildConstantsSection();
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);

test("registered on the CONSTANTS page; the data is the store's compute section=constants", () => {
  assert.strictEqual(WIDGETS["constants-coverage"], constantsCoverage);
  assert.strictEqual(WIDGETS["constants-tables"], constantsTables);
  assert.strictEqual(constantsCoverage.page, "constants");
  assert.strictEqual(constantsTables.page, "constants");
  assert.deepStrictEqual(constantsCoverage.needs(7), { constants: { res: "compute", farm: 7, section: "constants" } });
  assert.deepStrictEqual(constantsTables.needs(7), constantsCoverage.needs(7));
});

test("coverage: the summary counts, the work left first (inline, duplicated, core), a status pill per row", () => {
  const out = constantsCoverage.build({ constants: DATA }, {});
  const s = DATA.summary;
  assert.strictEqual(out.rows.length, DATA.coverage.length);
  assert.match(out.summary, new RegExp(`<b>${s.total}</b><span>total</span>`));
  assert.match(out.summary, new RegExp(`<b>${s.core}</b><span>in core</span>`));
  assert.match(out.summary, new RegExp(`<b>${s.duplicated}</b><span>duplicated</span>`));
  assert.match(out.summary, new RegExp(`<b>${s.inline}</b><span>inline</span>`));
  assert.match(out.summary, /class="v-big"/);
  const order = { inline: 0, duplicated: 1, core: 2 };
  for (let i = 1; i < out.rows.length; i++) {
    const a = out.rows[i - 1], b = out.rows[i];
    assert.ok(order[a.status] < order[b.status] || (a.status === b.status && a.name.localeCompare(b.name) <= 0), `${a.name} before ${b.name}`);
  }
  const html = renderTable(constantsCoverage.columns, out.rows, constantsCoverage.defaults, { rowKey: constantsCoverage.rowKey });
  assert.deepStrictEqual(keys(html), out.rows.map((r) => r.name));
  assert.match(html, /class="v-pill v-ok">core</);
});

test("no data: says it is loading", () => {
  assert.match(constantsCoverage.build({}, {}).empty, /Loading/);
  assert.match(constantsTables.view({}, {}).empty, /Loading/);
});

test("tables: one collapsed block per core table, the JSON escaped", () => {
  const out = constantsTables.view({ constants: { tables: { B_T: { a: "<x>" }, A_T: [1, 2] } } }, {});
  assert.ok(out.html.indexOf("A_T") < out.html.indexOf("B_T"), "sorted by name");
  assert.strictEqual((out.html.match(/<details/g) || []).length, 2);
  assert.match(out.html, /&lt;x&gt;/);
  assert.match(out.html, /2 tables/);
  const real = constantsTables.view({ constants: DATA }, {});
  assert.strictEqual((real.html.match(/<details/g) || []).length, Object.keys(DATA.tables).length);
});

test("📱 glance model: the share already in core with a ring, the three statuses with their share; the core tables by size; no data → empty", () => {
  const s = DATA.summary;
  assert.strictEqual(constantsCoverage.glance, undefined, "the hand-written face is gone");
  assert.strictEqual(constantsCoverage.look, "number");
  const m = constantsCoverage.glanceModel({ constants: DATA }, {}, {});
  const pct = (s.core / s.total) * 100;
  assert.deepStrictEqual(m.head, { value: Math.round(pct), unit: "%", ring: pct, ringTone: pct >= 100 ? "ok" : "accent", cap: `${s.core} of ${s.total} tables in core` });
  assert.deepStrictEqual(m.items.map((i) => [i.name, i.value]), [["in core", s.core], ["duplicated", s.duplicated], ["inline", s.inline]]);
  assert.deepStrictEqual(m.items[0], { icon: "✅", name: "in core", sub: `${Math.round(pct)}% of ${s.total}`, value: s.core, tone: "ok", pct });
  const html = renderLook(m, "number").html;
  assert.match(html, /class="gx-corner"><svg class="gx-ring/);
  assert.ok(html.includes(`<div class="gx-num">${Math.round(pct)}<small>%</small></div><div class="gx-cap">${s.core} of ${s.total} tables in core</div>`));
  assert.ok(looksFor(m).length >= 3);
  assert.deepStrictEqual(constantsCoverage.glanceModel({}, {}, {}), { empty: "Loading the constants…" });

  assert.strictEqual(constantsTables.glance, undefined);
  const t = constantsTables.glanceModel({ constants: DATA }, {}, {});
  const n = Object.keys(DATA.tables).length;
  assert.deepStrictEqual([t.head.value, t.head.unit], [n, " tables"]);
  assert.strictEqual(t.items.length, n);
  assert.strictEqual(t.items[0].pct, 100, "the biggest table first");
  assert.ok(t.items.every((x, i) => !i || x.value <= t.items[i - 1].value));
  assert.strictEqual((renderLook(t, "list-4").html.match(/class="gx-row[" ]/g) || []).length, Math.min(8, n));
  assert.ok(looksFor(t).length >= 3);
  assert.deepStrictEqual(constantsTables.glanceModel({}, {}, {}), { empty: "Loading the constants…" });
});
