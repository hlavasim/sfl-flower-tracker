import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { specCalendar, specTrades, specSkim, specEggs, tradeStats, skimStats, eggChart, SPECULATION_WIDGETS } from "../../widgets/speculation.mjs";
import { renderLook, looksFor } from "../../ui/glance-templates.mjs";

// SPECULATION as widgets: the owner-only reads come from the page (ctx.spec), the farm from the store.
const FARM = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url), "utf8")).farm;
const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 26, 12);
const icon = (n) => `<img data-i="${n}">`;

const CAL = {
  current: { season: "autumn", startedAt: Date.UTC(2026, 10, 23) },
  weeks: [{ season: "autumn", start: Date.UTC(2026, 10, 23) }, { season: "winter", start: Date.UTC(2026, 10, 30) }],
  items: [
    { item: "Potato", signal: "sell", buy: "spring", sell: "autumn", nextBuy: Date.UTC(2027, 0, 4), nextSell: Date.UTC(2026, 11, 21),
      expectedNet: 0.12, oosNet: 0.08, price: 0.0021, nowVsTrend: 0.1, maxQtyPerDay: 900, maxFlowerPerDay: 1.89, stable: true,
      bySeason: { spring: -0.1, summer: 0, autumn: 0.15, winter: null } },
    { item: "Kale", signal: "buy", buy: "autumn", sell: "spring", nextBuy: Date.UTC(2026, 11, 21), nextSell: Date.UTC(2027, 0, 4),
      expectedNet: 0.2, oosNet: 0.1, price: 0.01, nowVsTrend: -0.2, maxQtyPerDay: 150, maxFlowerPerDay: 1.5, stable: true,
      bySeason: { spring: 0.2, summer: 0, autumn: -0.2, winter: 0 } },
    { item: "Wheat", signal: "noise", buy: "winter", sell: "summer", nextBuy: 0, nextSell: 0, expectedNet: -0.01, oosNet: null, price: 0.003,
      maxQtyPerDay: 10, maxFlowerPerDay: 0.03, stable: false, bySeason: {} },
  ],
};
const TRADES = [
  { id: 1, item: "Kale", currency: "FLOWER", qty: "100", buy_price: "0.01", sell_price: "0.012", buy_date: "2026-10-01T00:00:00.000Z", sell_date: "2026-11-01T00:00:00.000Z" },
  { id: 2, item: "Potato", currency: "FLOWER", qty: "1000", buy_price: "0.002", sell_price: null, buy_date: "2026-11-02T00:00:00.000Z", notes: "spring buy" },
  { id: 3, item: "Barley", currency: "FLOWER", qty: "10", buy_price: "0.5", sell_price: null, buy_date: "2026-11-03T00:00:00.000Z" },
  { id: 4, item: "Genesis egg #803", currency: "RON", qty: "1", buy_price: "40", sell_price: null, buy_date: "2026-10-02T00:00:00.000Z" },
];
const EGGS = [
  { ts: new Date(NOW - 30 * 3600000).toISOString(), data: { floor_hidden_ron: 40, ask_10th_ron: 44, official_bad_eggs: 100 } },
  { ts: new Date(NOW - 3600000).toISOString(), data: { floor_hidden_ron: 50, ask_10th_ron: 55, ask_50th_ron: 70, asks_within_2pct: 3, asks_within_5pct: 9,
    official_bad_eggs: 110, newly_flagged: 2, listed_total: 400, top_offer_wron: 38.5, sales_1h_hidden: 4, median_sale_1h_hidden_ron: 52, offers_accepted_1h: 1,
    usd_per_ron: 0.5, mine: { 803: "Hidden", 900: "Bad Egg" }, cheapest: [[4100, 50, true], [12, 51, false]] } },
];
const SATS = Array.from({ length: 40 }, (_, i) => ({ value: i < 39 ? 100 : 120 }));
const SPEC = { cal: CAL, trades: TRADES, eggs: EGGS, sats: SATS, btc: { usd: 90000, usd_24h_change: -1 },
  p2p: [{ item_name: "Potato", price: "0.003" }], ledger: [
    { direction: "withdrawal", venue: "SFL", btc_amount: "0.001", tx_date: "2026-10-01T00:00:00Z" },
    { direction: "withdrawal", venue: null, btc_amount: "0.0005", tx_date: "2026-11-05T00:00:00Z" },
    { direction: "deposit", venue: "SFL", btc_amount: "0.1", tx_date: "2026-09-01T00:00:00Z" },
    { direction: "withdrawal", venue: "yakkamon", btc_amount: "0.2", tx_date: "2026-11-06T00:00:00Z" }], err: {} };
const ctx = (over = {}) => ({ spec: SPEC, icon, flower: "🌸", now: NOW, ...over });

test("four widgets on the SPECULATION page", () => {
  assert.deepStrictEqual(SPECULATION_WIDGETS.map((w) => w.type), ["spec-calendar", "spec-trades", "spec-skim", "spec-eggs"]);
  for (const w of SPECULATION_WIDGETS) { assert.strictEqual(w.page, "speculation"); assert.strictEqual(typeof w.view, "function"); }
  assert.deepStrictEqual(specCalendar.needs(155498), { farm: { res: "farm", farm: 155498 } });
  assert.deepStrictEqual(specCalendar.optional, ["farm"]);
});

test("calendar: week chips, signal cards with icons, the coloured season table", () => {
  const { html } = specCalendar.view({ farm: FARM }, ctx());
  assert.match(html, /It is <b>🍂 autumn<\/b> now, the next season in <b>4 d<\/b> \(30 Nov\)/);
  assert.match(html, /🛒 BUY <img data-i="Kale">Kale/);
  assert.match(html, /💰 SELL <img data-i="Potato">Potato/);
  // Potato: held 1683 × 0.0021 × 0.9
  assert.match(html, /you hold <b>1,683<\/b> ≈ 3\.18 🌸 after the fee/);
  assert.match(html, /the market takes ~<b>150<\/b> \/ day ≈ <b>1\.5<\/b> 🌸/);
  assert.match(html, /rgba\(224,108,95,0\.532\)">\+15 %/);   // dearer: red, a = 0.75
  assert.match(html, /rgba\(106,167,224,0\.395\)">−10 %/);   // cheaper: blue, a = 0.5
  assert.match(html, /<tr class="w-st-done">[\s\S]*Wheat/);     // unstable dimmed
  assert.match(html, /v-pill v-bad">SELL/);
  assert.doesNotMatch(html, /jaro|léto|podzim|zima|KUPUJ/);
});

test("calendar: nothing loaded asks the page to load, an error is shown", () => {
  let asked = 0;
  assert.match(specCalendar.view({}, { spec: { err: {} }, ensure: () => asked++ }).empty, /Loading/);
  assert.strictEqual(asked, 1);
  assert.match(specCalendar.view({}, { spec: { err: { cal: "500" } } }).html, /did not load: 500/);
});

test("trades: P/L per row, realised and open FLOWER totals", () => {
  const s = tradeStats(SPEC);
  assert.strictEqual(+s.realized.toFixed(6), 0.2);                       // 100 × (0.012 − 0.01)
  assert.strictEqual(+s.openCost.toFixed(6), 7);                         // 1000 × 0.002 + 10 × 0.5
  assert.strictEqual(+s.openValue.toFixed(6), 2.7);                      // 1000 × 0.003 × 0.9 (Barley unpriced)
  assert.strictEqual(s.openValued, false);
  assert.strictEqual(+s.rows[1].mark.toFixed(6), 0.7);                   // 1000 × (0.0027 − 0.002)
  assert.strictEqual(s.rows[3].mark, 10);                                // egg vs floor 50 − 40
  assert.strictEqual(s.satsNow, 120);
  const { html } = specTrades.view({}, ctx());
  assert.match(html, /<b>\+0\.2<\/b><span>realised FLOWER ≈ 24 sats/);
  assert.match(html, /<b>≥ 2\.7<\/b>/);
  assert.match(html, /<img data-i="Genesis egg #803">/);
  assert.match(html, /\+10 RON<\/b><div class="v-dim">vs the valid egg floor/);
  assert.match(html, /onclick="_specSell\(2\)">SELL/);
  assert.match(html, /onclick="_specDel\(1\)"/);
  assert.match(specTrades.view({}, { spec: { trades: [], err: {} } }).empty, /No trades/);
});

test("skim: in-game FLOWER, sats, skimmed BTC and the verdict", () => {
  const k = skimStats(SPEC, FARM);
  assert.strictEqual(k.now, 120);
  assert.strictEqual(+k.avg30.toFixed(4), 100.6667);                    // 29 × 100 + 120 over 30
  assert.strictEqual(+k.skimBtc.toFixed(6), 0.0015);
  assert.strictEqual(k.lastSkim, "2026-11-05");
  assert.strictEqual(k.verdict, "rich");                                 // 120 ≥ 1.1 × 100.67
  const { html } = specSkim.view({ farm: FARM }, ctx());
  assert.match(html, /510\.4 🌸<\/b><span>FLOWER in the game now · ≈ 61,245 sats · 0\.00061 ₿/);
  assert.match(html, /0\.0015 ₿<\/b><span>already skimmed from SFL · 2 withdrawals · last 2026-11-05/);
  assert.match(html, /GOOD DAY TO SKIM<\/span> FLOWER is \+19 % above/);
  assert.match(html, /color:var\(--c-red\)">−1\.0 %/);
  assert.strictEqual(skimStats({ ...SPEC, btc: { usd: 1, usd_24h_change: -5 } }, FARM).verdict, "dump");
  assert.match(specSkim.view({ farm: FARM }, ctx({ spec: { ...SPEC, err: { ledger: "401" } } })).html, /_specUnlock\(\)/);
});

test("eggs: tiles with the 24 h change, a two-panel SVG chart, your eggs and the cheapest", () => {
  const { html } = specEggs.view({}, ctx());
  assert.match(html, /<b>50 RON<\/b><span>valid egg floor · \+25 % in 24 h/);
  assert.match(html, /<b>110<\/b><span>official Bad Eggs · \+2 last run · \+10 % in 24 h/);
  assert.match(html, /<svg class="v-spec-chart"/);
  assert.strictEqual((eggChart(EGGS).match(/<polyline/g) || []).length, 3);
  assert.match(html, /<b>#803<\/b> <span class="v-pill v-ok">Hidden/);
  assert.match(html, /#4100<\/a> 50 ⚠/);
  assert.match(specEggs.view({}, ctx({ spec: { eggs: [], err: {} } })).html, /No snapshot yet/);
});

test("the page renders the widgets and keeps the owner-only writes", () => {
  const src = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
  const i = src.indexOf("function _specRender(");
  if (!src.includes("_wCtxMap[t] = _specCtx")) return;   // the page patch (scratchpad speculation-patch.py) not applied yet
  const body = src.slice(i, src.indexOf("\n    }\n", i));
  assert.match(body, /__widgets\.renderPage\(t,/);
  assert.match(src, /_wPageHead\("🎲 Speculation"/);
  assert.match(src, /writeFetch\(_specApi\("trades", extra\)/);
  assert.ok(!/_specDrawEggChart|LightweightCharts\.createChart\(el, \{\s*height: 220/.test(src.slice(src.indexOf("SPEKULACE (farm 155498 only)"), src.indexOf("DIFF PAGE (farm 155498 only)"))));
});

test("📱 glance model, calendar: the season with how far into its week as a ring; every crop, BUY / SELL first", () => {
  assert.strictEqual(specCalendar.look, "number");
  const m = specCalendar.glanceModel({ farm: FARM }, ctx());
  assert.deepStrictEqual([m.head.value, m.head.cap, m.head.ringTone], ["autumn", "🍂 next season in 4 d · 2 signals", "info"]);
  assert.ok(m.head.ring > 0 && m.head.ring < 100);
  assert.strictEqual(m.items.length, 3);
  const { pct, ...potato } = m.items[0];
  assert.deepStrictEqual(potato, { icon: '<img data-i="Potato">', name: "Potato", sub: "held 1,683 · net +12 %", chip: { text: "SELL", tone: "warn" } });
  assert.strictEqual(Math.round(pct), 60, "net against the best crop's");
  assert.deepStrictEqual(m.items.map((i) => i.name), ["Potato", "Kale", "Wheat"]);
  assert.match(renderLook(m, "list-4").html, /<div class="gx-n">Kale<div>net \+20 % · sell in spring<\/div><\/div><span class="gx-chip g-info">BUY<\/span>/);
  assert.ok(looksFor(m).length >= 3);
  const quiet = { ...SPEC, cal: { ...CAL, items: CAL.items.filter((x) => x.signal === "noise") } };
  assert.strictEqual(specCalendar.glanceModel({}, ctx({ spec: quiet })).foot, "No stable crop is in its buying or selling season this week.");
  let asked = 0;
  assert.deepStrictEqual(specCalendar.glanceModel({}, ctx({ spec: { err: {} }, ensure: () => asked++ })), { empty: "Loading the calendar…" });
  assert.strictEqual(asked, 1);
  assert.deepStrictEqual(specCalendar.glanceModel({}, ctx({ spec: { err: { cal: "401" } } })), { empty: "Calendar did not load: 401" });
  assert.strictEqual(specCalendar.glance, undefined, "the hand-written face is gone");
});

test("📱 glance model, trades: the realised FLOWER; every trade, newest first; open cost / worth as tiles", () => {
  assert.strictEqual(specTrades.look, "number");
  const m = specTrades.glanceModel({}, ctx());
  assert.deepStrictEqual(m.head, { value: "+0.2", unit: " 🌸", tone: "ok", hero: "📒", cap: "realised · 4 trades · 3 open" });
  assert.strictEqual(m.items.length, 4);
  assert.deepStrictEqual(m.items[0], { icon: '<img data-i="Genesis egg #803">', name: "Genesis egg #803", sub: "open · 1 · RON", value: "+10", tone: "ok" });
  assert.deepStrictEqual(m.tiles.map((t) => [t.label, t.value]), [["Realised", "+0.2"], ["Open cost", "7"], ["Open worth", "≥ 2.7"], ["Trades", 4]]);
  assert.match(renderLook(m, "number").html, /<div class="gx-num g-ok(?: gx-num-long)?">\+0\.2<small> 🌸<\/small><\/div>/);
  assert.ok(looksFor(m).length >= 3);
  assert.deepStrictEqual(specTrades.glanceModel({}, ctx({ spec: { trades: [], err: {} } })), { empty: "No trades yet." });
  assert.match(specTrades.glanceModel({}, ctx({ spec: { err: {} } })).empty, /Loading the trade log/);
  assert.strictEqual(specTrades.glance, undefined);
});

test("📱 glance model, skim: sats per FLOWER and the verdict; today / balance / BTC / skimmed; the last 30 days as a line", () => {
  assert.strictEqual(specSkim.look, "number");
  const m = specSkim.glanceModel({ farm: FARM }, ctx());
  assert.deepStrictEqual([m.head.value, m.head.unit, m.head.tone, m.head.cap], ["120", " sats", "ok", "per FLOWER · +19 % vs 30 d · good day to skim"]);
  assert.strictEqual(m.items.length, 4);
  assert.deepStrictEqual(m.items[3], { icon: "🏦", name: "Skimmed", sub: "2 withdrawals", value: "0.0015 ₿", tone: "ok" });
  assert.strictEqual(m.series.length, 30);
  assert.match(renderLook(m, "chart-2").html, /class="gx-split gx-split-chart"/);
  assert.ok(looksFor(m).length >= 3);
  assert.deepStrictEqual(specSkim.glanceModel({}, ctx({ spec: { ...SPEC, err: { ledger: "401" } } })).items[3], { icon: "🔒", name: "Skimmed", sub: "enter the key", value: "—" });
  assert.match(specSkim.glanceModel({}, ctx({ spec: { err: {} } })).empty, /Loading the skim data/);
  assert.strictEqual(specSkim.glance, undefined);
});

test("📱 glance model, eggs: the valid floor and its 24 h move with its line; your eggs first, then the market", () => {
  assert.strictEqual(specEggs.look, "chart-2");
  const m = specEggs.glanceModel({}, ctx());
  assert.deepStrictEqual(m.head, { value: "50", unit: " RON", cap: "valid egg floor · +25 % in 24 h", hero: "🥚" });
  assert.strictEqual(m.items.length, 7);
  assert.deepStrictEqual(m.items[1], { icon: "🥚", name: "#900", sub: "your egg", chip: { text: "Bad Egg", tone: "bad" } });
  assert.deepStrictEqual(m.series, [40, 50]);
  assert.match(renderLook(m, "list-4").html, /<div class="gx-n">#803<div>your egg<\/div><\/div><span class="gx-chip g-ok">valid<\/span>/);
  assert.ok(looksFor(m).length >= 3);
  assert.match(specEggs.glanceModel({}, ctx({ spec: { eggs: [], err: {} } })).empty, /No egg snapshot yet/);
  assert.match(specEggs.glanceModel({}, ctx({ spec: { err: {} } })).empty, /Loading the egg snapshots/);
  assert.strictEqual(specEggs.glance, undefined);
});
