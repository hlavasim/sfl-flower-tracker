import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { bumpkinLevel } from "../../widgets/bumpkin-level.mjs";
import { weatherProtection } from "../../widgets/weather-protection.mjs";
import { beehives } from "../../widgets/beehives.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { createHost } from "../../app/widget-host.mjs";
import { layout, variants } from "../../ui/glance.mjs";
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
  assert.match(h.renderItem("main", item, { data: { farm: FARM } }), /class="g-big">L\d+</);
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
test("📱 glance, bumpkin level: S = L<level> with a meter and the way to the next level; M = the XP numbers beside it", () => {
  const lvl = getTotalBumpkinLevel(XP, 0);
  assert.deepStrictEqual(bumpkinLevel.sizes, ["s", "m"]);
  const s = bumpkinLevel.glance({ farm: FARM }, {}, {}, "s").html;
  assert.match(s, new RegExp(`^<div class="g-big">L${lvl}</div><div class="g-meter"><i class="g-accent" style="width:\\d+%"></i></div><div class="g-cap">\\d+ % to L${lvl + 1}</div>$`));
  assert.doesNotMatch(s, /LVL|w-tile/, "the glance, not the old yellow tile");
  const m = bumpkinLevel.glance({ farm: FARM }, {}, {}, "m").html;
  assert.match(m, /^<div class="g-split">/);
  assert.match(m, new RegExp(`<div class="g-n">to L${lvl + 1}</div><span class="g-v">[\\d.]+[kM]?</span>`));
  assert.match(m, /<div class="g-n">to L200<\/div>/);
  // ascended: the band being filled and what the XP is worth
  const asc = { ...FARM, island: { ...FARM.island, ascensionLevel: 1 } };
  assert.match(bumpkinLevel.glance({ farm: asc }, {}, {}, "s").html, /<div class="g-cap">A2 L\d+\/50 · \d+ %<\/div>/);
  assert.match(bumpkinLevel.glance({ farm: asc }, {}, {}, "m").html, /<div class="g-n">XP worth<\/div><span class="g-v">L\d+<\/span>/);
  assert.deepStrictEqual(bumpkinLevel.glance({ farm: null }, {}, {}, "s"), { empty: "No farm data." });
  assert.match(bumpkinLevel.glance({ farm: {} }, {}, {}, "m").empty, /Bumpkin/);
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
  const icons = layout(mi, "1x1", "icons");
  assert.strictEqual((icons.match(/class="g-cell"/g) || []).length, 4);
  assert.match(icons, /<small class="g-tag g-bad">used up<\/small>/);
  assert.match(layout(m, "1x1", "number"), /<div class="g-big g-bad">2<small>\/4<\/small><\/div><div class="g-cap">uncovered: tsunami, insect plague<\/div>/);
  assert.ok(variants(mi).length >= 6, "a handful of looks that each show something different");
  const all = weatherProtection.glanceModel({ farm: FARM }, { weatherRows: () => WCTX.weatherRows().map((r) => ({ ...r, state: "ok" })) });
  assert.strictEqual(all.head.cap, "all protected");
  assert.match(weatherProtection.glanceModel({ farm: FARM }, { weatherRows: () => [] }).empty, /No weather items/);
  assert.match(weatherProtection.glanceModel({ farm: null }, WCTX).empty, /No farm data/);
});

test("📱 glance, beehives: S = full hives with a ring and the swarm; M / L = the hives, full first, with a READY / countdown chip", () => {
  assert.deepStrictEqual(beehives.sizes, ["s", "m", "l"]);
  const s = beehives.glance({ farm: FARM }, HCTX, {}, "s").html;
  assert.match(s, /^<div class="g-corner"><svg class="g-ring g-warn"/);
  assert.match(s, /<div class="g-big g-ok">1<small>\/4<\/small><\/div><div class="g-cap">hives full · 🐝 swarm<\/div>/);
  const m = beehives.glance({ farm: FARM }, HCTX, {}, "m").html;
  assert.strictEqual((m.match(/class="g-row"/g) || []).length, 3);
  assert.match(m, /^<div class="g-rows"><div class="g-row"><span class="g-ic">🍯<\/span><div class="g-n">Hive #111<div>100 % · 🐝 swarm<\/div><\/div><span class="g-chip g-ok">READY<\/span>/);
  assert.match(m, /Hive #222<div>40 %<\/div><\/div><span class="g-chip g-info">120m<\/span>/);
  const l = beehives.glance({ farm: FARM }, HCTX, {}, "l").html;
  assert.strictEqual((l.match(/class="g-row"/g) || []).length, 4);
  assert.match(l, /Hive #444<\/div><span class="g-v">empty<\/span>/);
  assert.match(l, /1 full · 1 filling · 🐝 swarm/);
  // nothing full yet: the next one's countdown
  const later = beehives.glance({ farm: FARM }, { ...HCTX, hives: () => HCTX.hives().slice(1) }, {}, "s").html;
  assert.match(later, /<div class="g-big">0<small>\/3<\/small><\/div><div class="g-cap">next in 120m<\/div>/);
  assert.match(beehives.glance({ farm: FARM }, { ...HCTX, hives: () => [] }, {}, "s").empty, /No beehives/);
  assert.match(beehives.glance({ farm: null }, HCTX, {}, "m").empty, /No farm data/);
});
