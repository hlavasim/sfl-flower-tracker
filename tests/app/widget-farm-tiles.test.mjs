import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { bumpkinLevel } from "../../widgets/bumpkin-level.mjs";
import { weatherProtection } from "../../widgets/weather-protection.mjs";
import { beehives } from "../../widgets/beehives.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { createHost } from "../../app/widget-host.mjs";
import { renderLook, looksFor } from "../../ui/glance-templates.mjs";
import { renderTable } from "../../ui/table.mjs";
import { getTotalBumpkinLevel, _ascBaseline, _ascBandXp, BUMPKIN_XP_TABLE } from "../../core/engine/power-helpers.mjs";

const FARM = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url), "utf8")).farm;
const XP = +FARM.bumpkin.experience;
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);

test("registered, each needs only the farm", () => {
  for (const w of [bumpkinLevel, weatherProtection, beehives]) {
    assert.strictEqual(WIDGETS[w.type], w);
    assert.deepStrictEqual(w.needs(3), { farm: { res: "farm", farm: 3 } });
  }
});

// ── Bumpkin level: a tile, not a table ──
test("bumpkin: not ascended → the table level and the XP to the next one", () => {
  const out = bumpkinLevel.view({ farm: FARM });
  const lvl = getTotalBumpkinLevel(XP, 0);
  assert.match(out.html, new RegExp(`LVL ${lvl}<`));
  const toNext = Math.round((BUMPKIN_XP_TABLE[lvl] - XP) / 1e3);
  assert.match(out.html, new RegExp(`to L${lvl + 1}`));
  assert.ok(toNext > 0);
});

test("bumpkin: ascended → absolute level, the band being filled and the XP left in it", () => {
  const farm = { ...FARM, island: { ...FARM.island, ascensionLevel: 1 } };
  const out = bumpkinLevel.view({ farm });
  assert.match(out.html, new RegExp(`LVL ${getTotalBumpkinLevel(XP, 1)}<`));
  // 179 M XP is past band 1 (94 M + 50 M): the work band is A2
  assert.ok(XP >= _ascBaseline(1) + _ascBandXp(1));
  assert.match(out.html, /band A2/);
  assert.match(out.html, /w-bar/);
});

test("bumpkin: no farm or no bumpkin → an explanation", () => {
  assert.match(bumpkinLevel.view({ farm: null }).empty, /No farm data/);
  assert.match(bumpkinLevel.view({ farm: {} }).empty, /Bumpkin/);
});

test("host: a view widget renders its html, with a cog; the page's pin still works", () => {
  const h = createHost({ registry: { "bumpkin-level": bumpkinLevel }, storage: mem() });
  const html = h.renderPage("bumpkin-level", { data: { farm: FARM } });
  assert.match(html, /LVL \d+/);
  assert.match(html, /data-action="cog"/, "a tile has a cog too (its title, its options)");
  assert.match(html, /data-action="refresh"/);
  h.handle("page:bumpkin-level", "pin", "");
  const [item] = h.doc().boards[0].items;
  // pinned on a board it shows its glance face
  assert.match(h.renderItem("main", item, { data: { farm: FARM } }), /class="gx-num(?: gx-num-long)?">L\d+</);
});

// ── Weather protection ──
const WCTX = { weatherRows: () => [
  { name: "Tornado Pinwheel", state: "ok", prevents: "tornado" },
  { name: "Mangrove", state: "spent", prevents: "tsunami" },
  { name: "Thermal Stone", state: "partial", prevents: "great freeze" },
  { name: "Protective Pesticide", state: "none", prevents: "insect plague" },
] };

test("weather: one row per item, state in words, uncovered rows marked; the footer names what is uncovered", () => {
  const out = weatherProtection.build({ farm: FARM }, WCTX);
  const html = renderTable(weatherProtection.columns, out.rows, weatherProtection.defaults, { rowKey: weatherProtection.rowKey, rowClass: weatherProtection.rowClass });
  assert.deepStrictEqual(keys(html), ["Tornado Pinwheel", "Mangrove", "Thermal Stone", "Protective Pesticide"]);
  assert.match(html, /used up/);
  assert.match(html, /data-row="Mangrove" class="w-st-miss"/);
  assert.match(html, /data-row="Tornado Pinwheel">/);
  assert.match(out.footer, /2\/4 uncovered — tsunami, insect plague/);
  const all = weatherProtection.build({ farm: FARM }, { weatherRows: () => WCTX.weatherRows().map((r) => ({ ...r, state: "ok" })) });
  assert.match(all.footer, /All 4 active/);
});

// ── Beehives ──
const NOW = Date.UTC(2026, 10, 26, 8);
const HCTX = { now: NOW, countdown: (ms) => `${Math.round(ms / 60000)}m`, hives: () => [
  { id: "aaa111", readyAt: NOW, progressPct: 100, hasSwarm: true },
  { id: "bbb222", readyAt: NOW + 7_200_000, progressPct: 40, hasSwarm: false },
  { id: "ccc333", readyAt: undefined, progressPct: 10, idle: true },
  { id: "ddd444", empty: true },
] };

test("beehives: full first, then by time; idle and empty hives say so; a swarm is flagged", () => {
  const out = beehives.build({ farm: FARM }, HCTX);
  const html = renderTable(beehives.columns, out.rows, beehives.defaults, { rowKey: beehives.rowKey });
  assert.deepStrictEqual(keys(html), ["aaa111", "bbb222", "ccc333", "ddd444"]);
  assert.match(html, /#111/);
  assert.match(html, /READY/);
  assert.match(html, /data-ready="\d+">120m</);
  assert.match(html, /no flowers/);
  assert.match(html, />empty</);
  assert.match(html, /🐝 swarm/);
  assert.match(out.footer, /1 full/);
});

test("beehives: no hives → an explanation", () => {
  assert.match(beehives.build({ farm: FARM }, { ...HCTX, hives: () => [] }).empty, /beehive/);
  assert.match(beehives.build({ farm: null }, HCTX).empty, /No farm data/);
});

// ── 📱 glance faces ──
test("📱 glance model, bumpkin level: L<level> with a ring of the way to the next level; the XP numbers as tiles", () => {
  const lvl = getTotalBumpkinLevel(XP, 0);
  const m = bumpkinLevel.glanceModel({ farm: FARM });
  assert.strictEqual(bumpkinLevel.look, "number");
  assert.strictEqual(m.head.value, `L${lvl}`);
  assert.match(m.head.cap, new RegExp(`^\\d+ % to L${lvl + 1}$`));
  assert.ok(m.head.ring > 0 && m.head.ring < 100);
  assert.deepStrictEqual(m.tiles.map((t) => t.label), ["XP", `to L${lvl + 1}`, "to L200"]);
  assert.match(renderLook(m, "number").html, new RegExp(`<div class="gx-num(?: gx-num-long)?">L${lvl}</div><div class="gx-cap">\\d+ % to L${lvl + 1}</div>`));
  assert.ok(looksFor(m).length >= 3);
  // ascended: the band being filled and what the XP is worth
  const asc = bumpkinLevel.glanceModel({ farm: { ...FARM, island: { ...FARM.island, ascensionLevel: 1 } } });
  assert.match(asc.head.cap, /^A2 L\d+\/50 · \d+ %$/);
  assert.match(asc.tiles[2].value, /^L\d+$/);
  assert.deepStrictEqual(bumpkinLevel.glanceModel({ farm: null }), { empty: "No farm data." });
  assert.match(bumpkinLevel.glanceModel({ farm: {} }).empty, /Bumpkin/);
  assert.strictEqual(bumpkinLevel.glance, undefined);
  // the view keeps its tile
  assert.match(bumpkinLevel.view({ farm: FARM }).html, /^<div class="w-tile"><div class="w-tile-big">LVL \d+<\/div>/);
});

test("📱 glance model, weather: the count protecting now (ring) and every item with its state chip — every size × style", () => {
  const m = weatherProtection.glanceModel({ farm: FARM }, WCTX);
  assert.deepStrictEqual({ ...m.head, cap: m.head.cap }, { value: 2, unit: "/4", tone: "bad", ring: 50, ringTone: "bad", cap: "uncovered: tsunami, insect plague" });
  assert.strictEqual(m.items.length, 4);
  assert.deepStrictEqual(m.items[1], { icon: m.items[1].icon, name: "Mangrove", sub: "tsunami", chip: { text: "used up", tone: "bad" } });
  assert.deepStrictEqual(m.items[2].chip, { text: "partly used", tone: "warn" });
  // laid out by the engine: 1×1 icons shows all four with their state under each
  const mi = weatherProtection.glanceModel({ farm: FARM }, { weatherRows: () => WCTX.weatherRows().map((r) => ({ ...r, iconHtml: `<i>${r.name}</i>` })) });
  const icons = renderLook(mi, "icons-1").html;
  assert.strictEqual((icons.match(/class="gx-cell"/g) || []).length, 4, "all four items");
  assert.match(icons, /<small class="gx-tag g-bad">used up<\/small>/);
  assert.match(renderLook(m, "number").html, /<div class="gx-num g-bad(?: gx-num-long)?">2<small>\/4<\/small><\/div><div class="gx-cap">uncovered: tsunami, insect plague<\/div>/);
  assert.ok(looksFor(mi).length >= 6, "a handful of looks that each show something different");
  const all = weatherProtection.glanceModel({ farm: FARM }, { weatherRows: () => WCTX.weatherRows().map((r) => ({ ...r, state: "ok" })) });
  assert.strictEqual(all.head.cap, "all protected");
  assert.match(weatherProtection.glanceModel({ farm: FARM }, { weatherRows: () => [] }).empty, /No weather items/);
  assert.match(weatherProtection.glanceModel({ farm: null }, WCTX).empty, /No farm data/);
});

test("📱 glance model, beehives: full hives with a ring; the hives, full first, each counting down live with how full it is", () => {
  const m = beehives.glanceModel({ farm: FARM }, HCTX);
  assert.strictEqual(beehives.look, "number");
  assert.deepStrictEqual(m.head, { value: 1, unit: "/4", tone: "ok", ring: 40, ringTone: "warn", cap: "hives full · swarm" });
  assert.strictEqual(m.items.length, 4);
  assert.deepStrictEqual(m.items[0], { icon: "", name: "Hive #111", sub: "swarm", at: NOW, pct: 100 });
  assert.deepStrictEqual(m.items[1], { icon: "", name: "Hive #222", at: NOW + 7_200_000, pct: 40 });
  assert.deepStrictEqual(m.items[3], { icon: "", name: "Hive #444", value: "empty" });
  assert.deepStrictEqual(m.tiles.map((t) => [t.label, t.value]), [["full", 1], ["filling", 1], ["idle", 1]]);
  const list = renderLook(m, "list-4", { now: NOW }).html;
  assert.strictEqual((list.match(/class="gx-row"/g) || []).length, 4);
  assert.match(list, /<span class="gx-chip g-ok"><span class="g-at" data-at="\d+">Ready<\/span><\/span>/);
  assert.match(list, /<span class="gx-chip g-info"><span class="g-at" data-at="\d+">2h 0m<\/span><\/span>/);
  assert.ok(looksFor(m).length >= 3);
  // nothing full yet: the next one's countdown
  assert.strictEqual(beehives.glanceModel({ farm: FARM }, { ...HCTX, hives: () => HCTX.hives().slice(1) }).head.cap, "next in 120m");
  assert.match(beehives.glanceModel({ farm: FARM }, { ...HCTX, hives: () => [] }).empty, /No beehives/);
  assert.match(beehives.glanceModel({ farm: null }, HCTX).empty, /No farm data/);
  assert.strictEqual(beehives.glance, undefined);
});
