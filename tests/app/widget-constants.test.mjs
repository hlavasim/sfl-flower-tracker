import { test } from "node:test";
import assert from "node:assert";
import { constantsCoverage, constantsTables } from "../../widgets/constants.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { buildConstantsSection } from "../../core/sections/constants.mjs";

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

test("📱 glance: S = the share already in core with a ring, M = the three counts; no data → empty", () => {
  const s = DATA.summary;
  const S = constantsCoverage.glance({ constants: DATA }, {}, {}, "s").html;
  assert.match(S, /class="g-corner"><svg class="g-ring/);
  assert.ok(S.includes(`<div class="g-big">${Math.round((s.core / s.total) * 100)}<small>%</small></div><div class="g-cap">${s.core} of ${s.total} tables in core</div>`));
  const M = constantsCoverage.glance({ constants: DATA }, {}, {}, "m").html;
  assert.ok(M.includes(`<span>duplicated</span><b>${s.duplicated}</b>`) && M.includes(`<span>inline</span><b>${s.inline}</b>`));
  assert.match(M, /class="g-meter"/);
  assert.deepStrictEqual(constantsCoverage.glance({}, {}, {}, "s"), { empty: "Loading the constants…" });
  assert.strictEqual(constantsTables.glance, undefined, "the raw tables have no face");
});
