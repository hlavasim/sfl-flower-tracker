import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { roadmapGifts, roadmapDeliveries, roadmapAnimalFeed, roadmapAnimalLife, roadmapExpired, roadmapSkills } from "../../widgets/roadmap-extras.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { looksFor, renderLook } from "../../ui/glance-templates.mjs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { buildRoadmapSection } from "../../core/sections/roadmap.mjs";

// The ROADMAP panels below the buy path (gifts, deliveries, animal feeding, animal lifecycle) as
// widgets over section=roadmap's `extras`, for the fixture farm (JSON round trip, as from the API).
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));
buildPowerSection(farm, p2p, nfts, null, {});
const RM = JSON.parse(JSON.stringify(buildRoadmapSection([], { roadmapSettings: { incCollectibles: true, incWearables: true, ticketValueSfl: 0.5 }, farm, p2p })));
const X = RM.extras;
const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
const CTX = { icon: (n) => `<i>${n}</i>`, npcIcon: (n) => `<n>${n}</n>`, flower: "🌸" };
const W = [roadmapGifts, roadmapDeliveries, roadmapAnimalFeed, roadmapAnimalLife];
const near = (a, b) => Math.abs(a - b) < 1e-9;
const table = (w, out) => renderTable(w.columns, out.rows, { columns: w.columns.map((c) => c.key) }, { rowKey: w.rowKey, rowClass: w.rowClass });

test("registered on ROADMAP, the page lists them in place of the old HTML panels; they need only the roadmap", () => {
  for (const w of W) {
    assert.strictEqual(WIDGETS[w.type], w);
    assert.strictEqual(w.page, "roadmap");
    assert.deepStrictEqual(w.needs("7"), { roadmap: { res: "roadmap", farm: "7" } });
    assert.strictEqual(typeof w.glanceModel, "function");
    assert.ok(w.build({}, CTX).empty, "no roadmap → empty");
  }
  assert.match(SRC, /const rmExtraWidgets = \["roadmap-gifts", "roadmap-deliveries", "roadmap-animal-feed", "roadmap-animal-life"\];/);
  assert.match(SRC, /h \+= rmExtraWidgets\.map\(_w\)\.join\(""\);/);
  assert.doesNotMatch(SRC, /_rmCollapse\("🎁 Gifts/, "the old gifts panel is no longer on the page");
});

test("section=roadmap extras: gifts by FLOWER a day, deliveries and bounties as reward − cost, the ticket value applied", () => {
  const g = X.gifts.rows;
  assert.ok(g.length > 5 && X.gifts.beds > 0);
  for (let k = 1; k < g.length; k++) assert.ok(g[k - 1].perDay >= g[k].perDay, "best FLOWER a day first");
  for (const r of g) if (r.daysToReward != null && r.repVal > 0) assert.ok(near(r.perDay, r.repVal / r.daysToReward));
  assert.ok(X.deliveries.length && X.bounties.length);
  for (const d of [...X.deliveries, ...X.bounties]) assert.ok(near(d.net, d.rv - d.cost));
  assert.strictEqual(X.ticketValue, 0.5);
  assert.ok(Object.keys(X.keys).length === 3 && X.keys["Luxury Key"] > X.keys["Treasure Key"]);
});

test("gifts: the top <beds> NPCs carry ✓; the glance sums their FLOWER a day", () => {
  const out = roadmapGifts.build({ roadmap: RM }, CTX);
  assert.strictEqual(out.rows.filter((r) => r.bed).length, Math.min(X.gifts.beds, out.rows.length));
  assert.ok(out.rows.slice(0, X.gifts.beds).every((r) => r.bed));
  const html = table(roadmapGifts, out);
  assert.match(html, /<n>[a-z' ]+<\/n><b>[A-Z]/, "the NPC's icon and its name");
  const m = roadmapGifts.glanceModel({ roadmap: RM }, CTX);
  const day = out.rows.filter((r) => r.bed).reduce((a, r) => a + r.perDay, 0);
  assert.strictEqual(m.head.value, `+${day >= 1 ? day.toFixed(2) : day.toFixed(3)}`);
  assert.strictEqual(m.items.length, out.rows.length);
  assert.ok(looksFor(m).length >= 3);
});

test("deliveries: deliveries and bounties together by net; Show filters; worth doing in the glance", () => {
  const out = roadmapDeliveries.build({ roadmap: RM }, CTX, {});
  assert.strictEqual(out.rows.length, X.deliveries.length + X.bounties.length);
  for (let k = 1; k < out.rows.length; k++) assert.ok(out.rows[k - 1].net >= out.rows[k].net);
  assert.ok(roadmapDeliveries.build({ roadmap: RM }, CTX, { show: "bounties" }).rows.every((r) => r.kind === "bounty"));
  assert.ok(roadmapDeliveries.build({ roadmap: RM }, CTX, { show: "worth" }).rows.every((r) => r.net > 0.001));
  const d = out.rows.find((r) => r.kind === "delivery");
  assert.match(d.giveHtml, /^\d+× <i>/);
  const m = roadmapDeliveries.glanceModel({ roadmap: RM }, CTX, {});
  const worth = out.rows.filter((r) => r.net > 0.001).length;
  assert.deepStrictEqual([m.head.value, m.head.unit], [worth, `/${out.rows.length}`]);
  assert.ok(looksFor(m).length >= 3);
});

test("animal feeding: every pen × food, the best ★ first per pen; best only; the glance per pen", () => {
  const out = roadmapAnimalFeed.build({ roadmap: RM }, CTX, {});
  assert.ok(X.animalFeed.length >= 1);
  for (const b of X.animalFeed) {
    const mine = out.rows.filter((r) => r.animalType === b.animalType);
    assert.strictEqual(mine.length, b.rows.length);
    assert.ok(mine[0].best && mine.slice(1).every((r) => !r.best));
    for (const r of mine) assert.ok(near(r.net, b.produce - b.sick - r.feedDay));
  }
  assert.strictEqual(roadmapAnimalFeed.build({ roadmap: RM }, CTX, { bestOnly: true }).rows.length, X.animalFeed.length);
  const m = roadmapAnimalFeed.glanceModel({ roadmap: RM }, CTX);
  assert.strictEqual(m.items.length, X.animalFeed.length);
  assert.ok(looksFor(m).length >= 2);
});

test("animal lifecycle: 15 levels per animal, the peak is the best level, pays-to is the last positive one", () => {
  for (const b of X.animalLife) {
    assert.strictEqual(b.per.length, 15);
    assert.strictEqual(b.peak, b.per.reduce((p, x) => (x.net > p.net ? x : p), b.per[0]).L);
    const pos = b.per.filter((p) => p.net > 0.0001);
    assert.strictEqual(b.lastPos, pos.length ? pos[pos.length - 1].L : 0);
  }
  const out = roadmapAnimalLife.build({ roadmap: RM }, CTX);
  const html = table(roadmapAnimalLife, out);
  assert.strictEqual((html.match(/class="v-rms-lvl/g) || []).length, 15 * X.animalLife.length);
  const m = roadmapAnimalLife.glanceModel({ roadmap: RM }, CTX);
  assert.strictEqual(m.items.length, X.animalLife.length);
  assert.match(renderLook(m, "number").html, /class="gx-num/);
});

test("expired: the page's rows (roadmapExpiredRows over the board's power payload), warnings first-class, a value where there is one", () => {
  assert.strictEqual(WIDGETS["roadmap-expired"], roadmapExpired);
  assert.deepStrictEqual(Object.keys(roadmapExpired.needs("7")), ["power", "farm"]);
  const ROWS = [
    { what: "Renew Badger Shrine", icon: "Badger Shrine", now: true, warn: true, gain: 29.65, note: "earns 208 in 7 days, costs 8.37 (15x Acorn)" },
    { what: "Buy Tornado Pinwheel", icon: "Tornado Pinwheel", now: false, warn: true, gain: null, note: "you have none &mdash; <img src=x>tornado hits you" },
  ];
  let got = null;
  const ctx = { ...CTX, expiredRows: (power, farm) => { got = [power, farm]; return ROWS; } };
  const out = roadmapExpired.build({ power: { p: 1 }, farm: { f: 1 } }, ctx);
  assert.deepStrictEqual(got, [{ p: 1 }, { f: 1 }], "the board's payload reaches the page function");
  assert.strictEqual(out.rows.length, 2);
  const html = table(roadmapExpired, out);
  assert.match(html, /<span class="v-rmf-warn">⚠<\/span> Renew Badger Shrine/);
  assert.match(html, /\+29\.65\/d/);
  const m = roadmapExpired.glanceModel({ power: {}, farm: {} }, ctx);
  assert.deepStrictEqual([m.head.value, m.head.tone], [2, "warn"]);
  assert.strictEqual(m.items[1].sub, "you have none &mdash; tornado hits you".replace("&mdash;", "&mdash;"));
  assert.deepStrictEqual(m.items[1].chip, { text: "now", tone: "warn" });
  assert.match(roadmapExpired.build({}, {}).empty, /Loading/);
  assert.match(roadmapExpired.build({}, { expiredRows: () => [] }).empty, /Nothing has lapsed/);
  // the page: the rows are one function shared by the old panel and the widget; the widget replaces the panel
  assert.match(SRC, /function roadmapExpiredRows\(ps, owned\)/);
  assert.match(SRC, /h \+= _w\("roadmap-expired"\);/);
  assert.doesNotMatch(SRC, /h \+= roadmapPeriodicHtml\(\);/);
});

test("skills: every skill valued server-side (the buy path's breakdown), take / reset verdicts, Show filters, the glance's best pick", () => {
  assert.strictEqual(WIDGETS["roadmap-skills"], roadmapSkills);
  const k = X.skills;
  assert.ok(!k.error && k.rows.length > 100 && k.level > 0);
  for (const r of k.rows) assert.ok(Math.abs(r.net - r.parts.reduce((a, p) => a + p.delta, 0)) < 1e-9, `${r.name}: net = its parts`);
  const out = roadmapSkills.build({ roadmap: RM }, CTX, {});
  assert.strictEqual(out.rows.length, k.rows.length);
  for (const r of out.rows) assert.strictEqual(r.verdict, r.has ? (r.net < -0.01 ? "reset" : "owned") : (r.net > 0.01 ? "take" : "skip"));
  assert.ok(roadmapSkills.build({ roadmap: RM }, CTX, { show: "take" }).rows.every((r) => !r.has && r.net > 0.01));
  assert.ok(roadmapSkills.build({ roadmap: RM }, CTX, { show: "owned" }).rows.every((r) => r.has));
  const m = roadmapSkills.glanceModel({ roadmap: RM }, CTX);
  const take = out.rows.filter((r) => r.verdict === "take").sort((a, b) => b.net - a.net);
  if (take.length) assert.match(m.head.cap, new RegExp(`^best to take: ${take[0].name.replace(/[()]/g, "\$&")}`));
  assert.deepStrictEqual(m.tiles.map((t) => t.label), ["level", "free pts", "to take", "to reset"]);
  assert.ok(looksFor(m).length >= 3);
  // the page: the ⭐ Skills tab holds the widget and the upgrade ladder; the valuation is the engine's
  assert.match(SRC, /<div id="rmw-roadmap-skills">\$\{_rmWidget\("roadmap-skills"\)\}<\/div>/);
  assert.doesNotMatch(SRC, /function roadmapSkillBreakdown\(/, "moved to core/engine/roadmap.mjs");
});
