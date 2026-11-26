import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { bumpkinLevel } from "../../widgets/bumpkin-level.mjs";
import { weatherProtection } from "../../widgets/weather-protection.mjs";
import { beehives } from "../../widgets/beehives.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { createHost } from "../../app/widget-host.mjs";
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
  assert.match(h.renderItem("main", item, { data: { farm: FARM } }), /LVL \d+/);
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
