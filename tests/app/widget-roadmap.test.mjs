import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { roadmapIncome, roadmapBuyPath, roadmapOffers, fmtFlower, fmtDays, normRoadmap, myOffers, offerState } from "../../widgets/roadmap.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { createStore } from "../../app/store.mjs";
import { renderLook, looksFor } from "../../ui/glance-templates.mjs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildRoadmapSection } from "../../core/sections/roadmap.mjs";

// ROADMAP as widgets, over a real section=roadmap payload for the fixture farm (JSON round trip, so
// Infinity arrives as null exactly as it does from the API).
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
buildPowerSection(farm, p2p, nfts, null, {});
const fresh = () => JSON.parse(JSON.stringify(buildRoadmapSection([], { roadmapSettings: { incCollectibles: true, incWearables: true }, farm, p2p })));
const RM = fresh();
const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
const CTX = { now: Date.UTC(2026, 10, 26), icon: (n) => `<img data-i="${n}">`, catLabel: (c) => `L:${c}`, catIcon: (c) => `<i data-c="${c}"></i>` };
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);
const STATUE = "Test Unowned Statue";
const BOOK = { items: { [STATUE]: { b: 30, f: 42, oc: 2, lc: 3, ls: 40, c: "collectibles", id: 123 } } };
const withOffer = (sfl) => ({ ...farm, trades: { ...(farm.trades || {}), offers: { o1: { sfl, items: { [STATUE]: 1 } } } } });

test("registered on ROADMAP; the table widgets also read the book and the farm (offers)", () => {
  for (const w of [roadmapIncome, roadmapBuyPath, roadmapOffers]) {
    assert.strictEqual(WIDGETS[w.type], w);
    assert.strictEqual(w.page, "roadmap");
  }
  assert.deepStrictEqual(roadmapIncome.needs(7), { roadmap: { res: "roadmap", farm: 7 } });
  assert.deepStrictEqual(roadmapBuyPath.needs(7), { roadmap: { res: "roadmap", farm: 7 }, book: { res: "book" }, farm: { res: "farm", farm: 7 } });
  assert.deepStrictEqual(roadmapBuyPath.optional, ["book", "farm"]);
});

test("the formatters are the page's roadmapFmt* — same text for the same number", () => {
  const grab = (name) => {
    const at = SRC.indexOf(`function ${name}(`);
    assert.ok(at > 0, name);
    const end = SRC.indexOf("\n    }\n", at);
    return new Function(`${SRC.slice(at, end + 6)}; return ${name};`)();
  };
  const pf = grab("roadmapFmtFlower"), pd = grab("roadmapFmtDays");
  for (const v of [0, 0.0123, 0.5, 1, 7.456, 99.99, 100, 512.4, 9999, 12345.6, 2.5e6, Infinity]) assert.strictEqual(fmtFlower(v), pf(v), `flower ${v}`);
  for (const v of [0.01, 0.4, 3.3, 12, 59, 61, 400, 729, 800, 4000, Infinity]) assert.strictEqual(fmtDays(v), pd(v), `days ${v}`);
});

test("normRoadmap: served nulls back to Infinity, idempotent", () => {
  const d = normRoadmap(fresh());
  const r = d.sim.ranked.find((x) => x.atDay === Infinity || x.roi === Infinity) || d.sim.ranked[0];
  assert.ok(r);
  assert.ok(d.sim.ranked.every((x) => x.roi !== null && x.atDay !== null));
  const again = normRoadmap(d);
  assert.strictEqual(again, d);
});

test("📈 income: the page hero's numbers as tiles, a big bar and the category split", () => {
  const out = roadmapIncome.view({ roadmap: fresh() }, CTX);
  const sim = RM.sim;
  assert.match(out.html, new RegExp(`<b>${fmtFlower(RM.startIncome).replace(".", "\\.")}/day</b><span>income now</span>`));
  assert.match(out.html, new RegExp(`<b>${fmtFlower(sim.finalRate).replace(".", "\\.")}/day</b><span>after the plan</span>`));
  assert.match(out.html, new RegExp(`<span>${sim.econSteps} buys cost</span>`));
  assert.match(out.html, /class="v-big"/);
  assert.match(out.html, /class="v-rm-stack"/);
  // biggest category first in the legend, with its icon and label
  const top = RM.currentProd.breakdown.filter((b) => b.sfl > 0.01).sort((a, b) => b.sfl - a.sfl)[0];
  assert.ok(out.html.indexOf(`L:${top.cat}`) < out.html.indexOf("L:trees") || top.cat === "trees");
  assert.match(out.html, new RegExp(`<i data-c="${top.cat}"></i> L:${top.cat} <b>${fmtFlower(top.sfl).replace(".", "\\.")}</b>`));
  assert.deepStrictEqual(roadmapIncome.view({}, CTX), { empty: "No roadmap data." });
});

test("🛒 buy path: every ranked row in the server's order, real ranks, status pills, a value bar", () => {
  const out = roadmapBuyPath.build({ roadmap: fresh() }, CTX, {});
  assert.strictEqual(out.rows.length, RM.sim.ranked.length);
  assert.deepStrictEqual(out.rows.map((r) => r.rank), RM.sim.ranked.map((_, k) => k + 1));
  const html = renderTable(roadmapBuyPath.columns, out.rows, roadmapBuyPath.defaults, { rowKey: roadmapBuyPath.rowKey });
  assert.deepStrictEqual(keys(html), RM.sim.ranked.map((r) => r.name));
  assert.match(html, /IN PLAN/);
  assert.match(html, /&gt; 5 Y/, "beyond-the-horizon rows say so");
  assert.match(html, /class="v-bar"/);
  assert.match(html, new RegExp(`<img data-i="${STATUE}">`), "a collectible shows its artwork");
  const first = out.rows[0];
  assert.strictEqual(first.name, STATUE);
  assert.match(html, new RegExp(`>${fmtFlower(first.floor)}<`));
  assert.match(html, new RegExp(`\\+${fmtFlower(first.value).replace(".", "\\.")}`));
  assert.match(html, new RegExp(fmtDays(first.roi).replace(".", "\\.")));
  assert.match(out.summary, /<b>\d+<\/b><span>in the plan<\/span>/);
  assert.match(out.footer, /How this is calculated/);
});

test("🛒 per-copy options: hide types and show only the plan; ranks stay the full order's", () => {
  const noSkills = roadmapBuyPath.build({ roadmap: fresh() }, CTX, { hide: ["Skill"] });
  assert.ok(noSkills.rows.every((r) => r.type !== "Skill"));
  assert.strictEqual(noSkills.rows[0].rank, 1);
  assert.match(noSkills.summary, /hidden — order, Σ cost and ETA still count the whole list/);
  const plan = roadmapBuyPath.build({ roadmap: fresh() }, CTX, { status: "plan" });
  assert.ok(plan.rows.length > 0 && plan.rows.every((r) => r.status === "plan"));
  const worth = roadmapBuyPath.build({ roadmap: fresh() }, CTX, { status: "worth" });
  assert.ok(worth.rows.every((r) => r.status !== "beyond"));
});

test("🛒 offers in the table and the picked total: floor vs offer, payback, saving", () => {
  const out = roadmapBuyPath.build({ roadmap: fresh(), book: BOOK, farm: withOffer(35) }, { ...CTX, picks: () => [STATUE] }, {});
  const r = out.rows.find((x) => x.name === STATUE);
  assert.strictEqual(r.offer.state, "top");
  assert.strictEqual(r.offerAt, 35);
  const html = renderTable(roadmapBuyPath.columns, [r], {}, { rowKey: roadmapBuyPath.rowKey });
  assert.match(html, /🟢 35\.00/);
  assert.match(html, /−29%/, "the bid is 29 % under the floor");
  assert.match(html, /checked/);
  assert.match(out.footer, /✓ 1 picked · buy now <b>42 🌸<\/b>/);
  assert.match(out.footer, /via offers <b class="v-done">35 🌸<\/b>/);
  assert.match(out.footer, /−17 %/);
  const outbid = roadmapBuyPath.build({ roadmap: fresh(), book: BOOK, farm: withOffer(20) }, CTX, {}).rows.find((x) => x.name === STATUE);
  assert.strictEqual(outbid.offer.icon, "🟠");
  assert.match(outbid.offer.tip, /^Outbid: yours 20\.00, the highest 30\.00/);
});

test("myOffers / offerState: the best unit price per item; fulfilled or cleared offers ignored", () => {
  const f = { trades: { offers: { a: { sfl: 30, items: { X: 2 } }, b: { sfl: 20, items: { X: 1 } }, c: { sfl: 99, items: { X: 1 }, fulfilledAt: 1 } } } };
  assert.deepStrictEqual(myOffers(f), { X: { unit: 20, qty: 1 } });
  assert.strictEqual(offerState("X", { items: {} }, myOffers(f)).icon, "🟠");
  assert.strictEqual(offerState("X", { items: {} }, {}), null);
  assert.strictEqual(offerState("X", { items: { X: { b: 10, f: 12, oc: 1, lc: 1 } } }, {}).state, "none");
});

test("🏷 offers widget: book rows with state pills, my offer, gap and the 2-year ceiling", () => {
  const out = roadmapOffers.build({ roadmap: fresh(), book: BOOK, farm: withOffer(35) }, CTX, {});
  assert.strictEqual(out.rows.length, 1);
  const r = out.rows[0];
  assert.deepStrictEqual([r.state, r.bid, r.ask, r.gap, r.own.unit], ["top", 30, 42, 29, 35]);
  assert.strictEqual(r.max2y, r.value * 730.5);
  const html = renderTable(roadmapOffers.columns, out.rows, roadmapOffers.defaults, { rowKey: roadmapOffers.rowKey });
  assert.match(html, /v-pill v-ok">TOP</);
  assert.match(html, /sunflower-land\.com\/play\/#\/marketplace\/collectibles\/123/);
  assert.match(out.summary, /<b>1<\/b><span>my offers<\/span>/);
  assert.match(out.summary, /<b>1<\/b><span>on top<\/span>/);
  assert.strictEqual(roadmapOffers.build({ roadmap: fresh(), book: BOOK, farm }, CTX, { mineOnly: true }).rows.length, 0);
});

test("store: the roadmap resource POSTs history, bud floors and weeks with the page's settings", async () => {
  const calls = [];
  const mem = { sfl_roadmap_settings: JSON.stringify({ horizonYears: 3 }), sfl_repay_daily_flower: "12.5", sfl_power_products: JSON.stringify({ crops: "Wheat" }) };
  const prevLs = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null) };
  try {
    const fetch = async (url, init) => {
      calls.push({ url, init });
      const body = url.includes("budfloors=1") ? { items: [{ id: 5, floor: 99 }] }
        : url.includes("ticket-weeks") ? { weeks: [{ w: 1 }] }
        : url.includes("farm-history") ? { snapshots: [{ captured_at: "t", diff: { "_h.trees": 1, other: 2 } }] }
        : { data: { sim: { ranked: [] } } };
      return { ok: true, json: async () => body };
    };
    const store = createStore({ fetch });
    const e = await store.get({ res: "roadmap", farm: 9 });
    assert.strictEqual(e.status, "ok");
    assert.deepStrictEqual(e.data, { sim: { ranked: [] } });
    const post = calls.find((c) => c.url.includes("section=roadmap"));
    assert.strictEqual(post.init.method, "POST");
    const u = new URL(post.url, "http://x");
    assert.deepStrictEqual(JSON.parse(u.searchParams.get("roadmap")), { horizonYears: 3, withdrawPerDay: 12.5 });
    assert.deepStrictEqual(JSON.parse(u.searchParams.get("products")), { crops: "Wheat" });
    assert.deepStrictEqual(JSON.parse(post.init.body), { snapshots: [{ captured_at: "t", diff: { "_h.trees": 1 } }], budFloors: { 5: 99 }, weeks: [{ w: 1 }] });
  } finally { globalThis.localStorage = prevLs; }
});

test("the ROADMAP page renders its widgets through the host and registers their context", () => {
  const body = SRC.slice(SRC.indexOf("function _renderRoadmapContentWith("), SRC.indexOf("window._roadmapSetIncome"));
  for (const t of ["roadmap-income", "roadmap-buy-path", "roadmap-offers"]) {
    assert.ok(body.includes(`_w("${t}")`), t);
    assert.ok(SRC.includes(`_wCtxMap["${t}"] = ctx;`), t);
  }
  assert.match(body, /function _rmWidget\(type\) \{[\s\S]*?__widgets\.renderPage\(type, \{ data: \{ roadmap: _roadmapServer, book: _rmBook, farm: powerState && powerState\.farm \}/);
  assert.match(SRC, /const _wCtxMap = \{\};\n\s*_rmRegisterWCtx\(\);/, "registered once _wCtxMap exists (the roadmap code sits above it)");
  assert.match(SRC, /__store\.get\(\{ res: "roadmap", farm: FARM_ID \}, \{ force: true \}\)/);
  const page = SRC.slice(SRC.indexOf("async function renderRoadmap("), SRC.indexOf("let _sideWeeksCache"));
  assert.match(page, /_wPageHead\("🗺 NFT Roadmap"/);
  assert.doesNotMatch(body, /class="pixel-font"/, "no retro headings in the content");
  assert.doesNotMatch(SRC, /function _rmOfferCell|function roadmapIncomeHeroHtml|function _roadmapHiddenTypes/, "the replaced helpers are gone");
});

test("🛒 buy path cells stay on one line: a short ETA, the horizon % under its gain, badges never wrap", () => {
  const out = roadmapBuyPath.build({ roadmap: fresh() }, { ...CTX, now: Date.UTC(2026, 10, 26) }, {});
  const r = out.rows.find((x) => x.status === "plan" && !x.bundle && x.floor > 0);
  assert.match(r.eta, /^\d{1,2} [A-Z][a-z]{2}( \d{4})?$/, `ETA "${r.eta}" like "27 Nov" (the year only when not this one)`);
  assert.match(r.horizonHtml, /<small class="v-dim v-rm-pct"/, "the % sits under the gain");
  assert.match(r.badgesHtml, /^<span class="v-rm-badges">/);
  const eta = roadmapBuyPath.columns.find((c) => c.key === "atDay").fmt(r.atDay, r);
  assert.match(eta, /class="v-dim v-nowrap"/);
});

test("📱 glance models: income (now → after the plan, where it comes from, a chart), buy path (the next buys with icons)", () => {
  for (const w of [roadmapIncome, roadmapBuyPath, roadmapOffers]) {
    assert.strictEqual(w.glance, undefined, `${w.type}: the hand-written face is gone`);
    assert.strictEqual(w.sizes, undefined, w.type);
  }
  assert.strictEqual(roadmapIncome.look, "chart-2");
  const m = roadmapIncome.glanceModel({ roadmap: fresh() }, CTX, {});
  assert.strictEqual(m.head.unit, "/day");
  assert.match(m.head.cap, /^→ [\d.]+k?\/day after the plan$/);
  assert.ok(m.head.meter >= 0 && m.head.meter <= 100);
  assert.ok(m.items.length >= 1 && m.items.every((i) => i.icon.startsWith("<i data-c=") && i.name.startsWith("L:")), "the categories, labelled with icons");
  assert.ok(m.series.length >= 2);
  assert.match(renderLook(m, "chart-2").html, /<svg class="gx-spark/);
  assert.ok(looksFor(m).length >= 3);
  assert.deepStrictEqual(roadmapIncome.glanceModel({}, CTX, {}), { empty: "No roadmap data." });

  const plan = RM.sim.ranked.filter((r) => r.status === "plan");
  const b = roadmapBuyPath.glanceModel({ roadmap: fresh() }, CTX, {});
  assert.strictEqual(b.items.length, plan.length);
  assert.deepStrictEqual([b.items[0].name, b.items[0].icon], [plan[0].name, `<img data-i="${plan[0].name}">`], "the next buy first");
  assert.strictEqual(b.head.hero, `<img data-i="${plan[0].name}">`);
  assert.match(b.foot, new RegExp(`^${plan.length} in the plan · next `));
  assert.strictEqual((renderLook(b, "list-4").html.match(/class="gx-row"/g) || []).length, Math.min(8, plan.length));
  assert.ok(looksFor(b).length >= 3);
});

test("📱 glance model: offers = my offers on top (a ring), outbid first with state chips; no data → empty", () => {
  const BOOK2 = { items: { ...BOOK.items, "Test Other": { b: 10, f: 20, oc: 1, lc: 1, ls: 15, c: "collectibles", id: 9 } } };
  const rm = fresh();
  rm.sim.ranked = [...rm.sim.ranked, { ...rm.sim.ranked.find((r) => r.name === STATUE), name: "Test Other" }];
  const top = roadmapOffers.glanceModel({ roadmap: rm, book: BOOK2, farm: withOffer(35) }, CTX, {});
  assert.deepStrictEqual(top.head, { value: 1, unit: "/1", tone: "ok", ring: 100, ringTone: "ok", cap: "my offers on top" });
  assert.match(renderLook(top, "number").html, /<div class="gx-num g-ok(?: gx-num-long)?">1<small>\/1<\/small><\/div><div class="gx-cap">my offers on top<\/div>/);
  const m = roadmapOffers.glanceModel({ roadmap: rm, book: BOOK2, farm: withOffer(20) }, CTX, {});
  assert.deepStrictEqual([m.head.value, m.head.tone, m.head.cap], [0, "warn", "my offers on top · 1 outbid"]);
  assert.deepStrictEqual(m.items.map((i) => i.name), [STATUE, "Test Other"]);
  assert.deepStrictEqual([m.items[0].icon, m.items[0].sub, m.items[0].chip], ['<img data-i="Test Unowned Statue">', "mine 20.00 · best 30.00", { text: "OUTBID", tone: "warn" }]);
  assert.deepStrictEqual([m.items[1].sub, m.items[1].chip], ["best 10.00 · floor 20.00", { text: "NO OFFER", tone: "" }]);
  assert.ok(looksFor(m).length >= 3);
  assert.deepStrictEqual(roadmapOffers.glanceModel({ roadmap: rm, book: BOOK2, farm }, CTX, {}).head, { value: 2, cap: "buy-path items in the book · no offers of mine" });
  assert.deepStrictEqual(roadmapOffers.glanceModel({}, CTX, {}), { empty: "No roadmap data." });
  assert.deepStrictEqual(roadmapOffers.glanceModel({ roadmap: fresh(), book: null, farm }, CTX, {}), { empty: "The marketplace book is loading." });
});
