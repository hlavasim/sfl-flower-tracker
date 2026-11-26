import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { SHRINES_WIDGETS, shrinesRoi, shrinesNeeds } from "../../widgets/shrines.mjs";
import { renderLook, looksFor } from "../../ui/glance-templates.mjs";

// SHRINES as a widget. The per-shrine maths stays the page's (_shrineRows over section=power and
// section=eff, shared with the roadmap's renew table); the widget shapes its rows.
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const sh = (o) => ({ effect: "+0.5 Honey per hive", duration_d: 7, ingredients: { Acorn: 5, "Heart leaf": 2 }, ...o });
const ROWS = [
  { name: "Bear Shrine", sh: sh({}), costSfl: 2, hasIngredients: true, status: { kind: "active", hoursLeft: 50 },
    margin: { sflPerDay: 0.5, note: "", breakdown: [{ cat: "bees", kind: "yield_flat", gain: 0.5 }] }, earnTotal: 3.5, netTotal: 1.5, verdict: "worth" },
  { name: "Boar Shrine", sh: sh({ effect: "cooking", duration_d: 1, ingredients: { Wood: 3 } }), costSfl: 1, hasIngredients: false, status: { kind: "inactive" },
    margin: { sflPerDay: 0, note: "indirect / indirect", breakdown: [] }, earnTotal: 0, netTotal: -1, verdict: "manual" },
];
const CTX = { icon: (n) => `<i>${n}</i>`, sfl: () => "<F>", shrineRows: () => ({ rows: ROWS, acornPrice: 0.123 }), detail: (b) => `<p>DETAIL ${b.length}</p>` };
const table = (out) => renderTable(shrinesRoi.columns, out.rows, shrinesRoi.defaults, { rowKey: shrinesRoi.rowKey });

test("registered on SHRINES; the farm, section=power as POWER has it, section=eff over the history", () => {
  assert.deepStrictEqual(SHRINES_WIDGETS, [shrinesRoi]);
  assert.strictEqual(WIDGETS["shrines-roi"], shrinesRoi);
  assert.strictEqual(shrinesRoi.page, "shrines");
  assert.deepStrictEqual(shrinesNeeds("7"), { farm: { res: "farm", farm: "7" }, power: { res: "compute", farm: "7", section: "power" },
    eff: { res: "computeHist", farm: "7", section: "eff" } });
  assert.deepStrictEqual(shrinesRoi.optional, ["eff"]);
});

test("a row per shrine: status, cost, boost, earn, profit, verdict, ingredients with icons, the calculation", () => {
  const out = shrinesRoi.build({ farm, power: {}, eff: {} }, CTX, shrinesRoi.defaults.opts);
  const html = table(out);
  assert.match(html, /ACTIVE/);
  assert.match(html, /2\.1 days left/);
  assert.match(html, /<b style="color:var\(--c-yellow\)">2\.00<\/b> <F>/);
  assert.match(html, /\+0\.5000<\/span> <F>\/d/);
  assert.match(html, /\+1\.50<\/b> <F><div class="v-dim">profit \(7 d\)/);
  assert.match(html, /-1\.00<\/b> <F><div class="v-dim">loss \(1 d\)/);
  assert.match(html, /WORTH IT/);
  assert.match(html, /JUDGE/);
  assert.match(html, /5× <i>Acorn<\/i>Acorn/);
  assert.match(html, /⚠ missing ingredients/);
  assert.match(html, /DETAIL 1/);
  assert.match(html, />indirect</);
  // totals: profitable, boost a day, the craft cost spread over the duration, net
  assert.match(out.summary, /<b[^>]*>1 \/ 2<\/b><span>profitable/);
  assert.match(out.summary, /\+0\.5000 <F><\/b><span>total boost/);
  assert.match(out.summary, /1\.2857 <F><\/b><span>total cost/);   // 2/7 + 1/1
  assert.match(out.summary, /-0\.7857 <F><\/b><span>net/);
  assert.match(out.footer, /0\.123 <F> per Acorn/);
});

test("a copy may show only the active or only the profitable shrines", () => {
  assert.deepStrictEqual(shrinesRoi.build({ farm, power: {} }, CTX, { show: "active" }).rows.map((r) => r.name), ["Bear Shrine"]);
  assert.deepStrictEqual(shrinesRoi.build({ farm, power: {} }, CTX, { show: "profitable" }).rows.map((r) => r.name), ["Bear Shrine"]);
  assert.match(shrinesRoi.build({}, CTX, {}).empty, /No shrine data/);
});

test("📱 glance model: active / total with a ring; the shrines, active first (counting down) then most profit, in the copy's filter", () => {
  const NOW = 1_800_000_000_000;
  const m = shrinesRoi.glanceModel({ farm, power: {} }, { ...CTX, now: NOW }, { show: "all" });
  assert.strictEqual(shrinesRoi.look, "number");
  assert.deepStrictEqual(m.head, { value: 1, unit: "/2", tone: "ok", ring: 50, ringTone: "ok", cap: "active · 1 profitable" });
  assert.strictEqual(m.items.length, 2);
  assert.deepStrictEqual(m.items[0], { icon: "<i>Bear Shrine</i>", name: "Bear Shrine", sub: "active · +1.50", at: NOW + 50 * 3600000, pct: 100 });
  assert.deepStrictEqual(m.items[1], { icon: "<i>Boar Shrine</i>", name: "Boar Shrine", sub: "judge · 1 d", value: "-1.00", tone: "bad" });
  assert.deepStrictEqual(m.tiles.map((t) => [t.label, t.value]), [["active", "1/2"], ["profitable", 1], ["boost/day", "+0.500"], ["net/day", "-0.786"]]);
  assert.match(renderLook(m, "number").html, /<div class="gx-num g-ok(?: gx-num-long)?">1<small>\/2<\/small><\/div><div class="gx-cap">active · 1 profitable<\/div>/);
  assert.ok(looksFor(m).length >= 3);
  assert.strictEqual(shrinesRoi.glanceModel({ farm, power: {} }, CTX, { show: "active" }).items.length, 1);
  assert.deepStrictEqual(shrinesRoi.glanceModel({}, CTX), { empty: "No shrine data yet." });
  assert.deepStrictEqual(shrinesRoi.glanceModel({ farm, power: {} }, { ...CTX, shrineRows: () => ({ rows: [], acornPrice: 0 }) }), { empty: "No shrines." });
  assert.strictEqual(shrinesRoi.glance, undefined);
});
