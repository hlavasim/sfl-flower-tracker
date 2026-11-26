import { test } from "node:test";
import assert from "node:assert";
import { worldIslands, worldSkillPoints } from "../../widgets/world-dist.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { createStore } from "../../app/store.mjs";

// WORLD distributions as table widgets: farms per bucket, share, a bar; the viewer's own bucket
// highlighted and how many farms are above it.
const ISL = [{ key: "basic", n: 600 }, { key: "spring", n: 300 }, { key: "volcano", n: 100 }];
const SP = [{ key: 1, n: 500 }, { key: 150, n: 300 }, { key: 285, n: 150 }, { key: 300, n: 50 }];
const ME = { found: true, island_type: "volcano", total_level: 285 };
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);
const opts = (w) => ({ rowKey: w.rowKey, rowClass: w.rowClass });

test("registered; needs the aggregate and (optionally) the viewer's farm", () => {
  assert.strictEqual(WIDGETS["world-islands"], worldIslands);
  assert.strictEqual(WIDGETS["world-skill-points"], worldSkillPoints);
  assert.deepStrictEqual(worldIslands.needs(5), { agg: { res: "worldAgg", group: "island_type" }, me: { res: "worldMe", farm: 5 } });
  assert.deepStrictEqual(worldSkillPoints.needs(5).agg, { res: "worldAgg", group: "total_level", limit: 1000 });
  assert.deepStrictEqual(worldIslands.optional, ["me"]);
});

test("islands: the fixed island order (unseen ones at 0), share and bar per row, my island highlighted with its rank", () => {
  const { rows, footer } = worldIslands.build({ agg: ISL, me: ME });
  const html = renderTable(worldIslands.columns, rows, worldIslands.defaults, opts(worldIslands));
  assert.deepStrictEqual(keys(html), ["basic", "spring", "desert", "volcano", "swamp"]);
  assert.match(html, /60\.0 %/);
  assert.match(html, /class="w-hbar"><span style="width:100\.0%;background:#3987e5/);
  assert.match(html, /data-row="volcano" class="w-row-hl"/);
  // nobody is past volcano: rank #1 of 1,000 → top 0.1 %
  assert.match(html, /YOU \(top 0\.1% · #1\)/);
  assert.match(footer, /1,000 farms/);
});

test("skill points: highest first, my level highlighted, farms above me in the footer", () => {
  const { rows, footer } = worldSkillPoints.build({ agg: SP, me: ME });
  const html = renderTable(worldSkillPoints.columns, rows, worldSkillPoints.defaults, opts(worldSkillPoints));
  assert.deepStrictEqual(keys(html), ["300", "285", "150", "1"]);
  assert.match(html, /data-row="285" class="w-row-hl"/);
  assert.match(footer, /50 farms above you/);
  // the old chart's tag: rank = 1 + farms above, top = rank / all farms
  assert.match(footer, /YOU \(top 5\.1% · #51\)/);
});

test("my row stays visible past the top N (host passes keepRow)", async () => {
  const { createHost } = await import("../../app/widget-host.mjs");
  const m = new Map();
  const h = createHost({ registry: { "world-skill-points": worldSkillPoints }, storage: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } });
  h.handle("page:world-skill-points", "rows-top", "1");
  const html = h.renderPage("world-skill-points", { data: { agg: SP, me: ME } });
  assert.deepStrictEqual(keys(html), ["300", "285"]);
  // the gap fill's empty levels are hidden unless the copy shows them
  h.handle("page:world-skill-points", "opt:zeros", "1");
  h.handle("page:world-skill-points", "rows-top", "3");
  assert.deepStrictEqual(keys(h.renderPage("world-skill-points", { data: { agg: SP, me: ME } })), ["300", "299", "298", "285"]);
});

test("without my farm the charts still stand; no data → an explanation", () => {
  assert.strictEqual(worldSkillPoints.build({ agg: SP, me: null }).rows.length, 4);
  assert.match(worldIslands.build({ agg: null }).empty, /WORLD/);
});

test("📱 glance: my island and its rank (S), the islands by count with mine marked (L), no data → empty", () => {
  assert.strictEqual(worldIslands.glance({ agg: ISL, me: ME }, {}, {}, "s").html, `<div class="g-big g-accent">volcano</div><div class="g-cap">you · top 0.1% · #1</div>`);
  const l = worldIslands.glance({ agg: ISL, me: ME }, {}, {}, "l").html;
  assert.deepStrictEqual([...l.matchAll(/<div class="g-n">([^<]+)</g)].map((x) => x[1]), ["basic", "spring", "volcano"], "the islands nobody is on are left out");
  assert.match(l, /volcano<div>100 farms<\/div><\/div><span class="g-v g-accent">10\.0%/);
  assert.match(worldIslands.glance({ agg: ISL }, {}, {}, "s").html, /60\.0%.*basic · of 1k farms/);
  assert.match(worldIslands.glance({ agg: null }, {}, {}, "m").empty, /WORLD/);
});

test("store: worldAgg asks mode=agg with the group and limit, worldMe mode=farm", async () => {
  const urls = [];
  const f = async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => (url.includes("mode=agg") ? { rows: SP } : ME) }; };
  const s = createStore({ fetch: f });
  assert.deepStrictEqual((await s.get({ res: "worldAgg", group: "total_level", limit: 1000 })).data, SP);
  assert.deepStrictEqual((await s.get({ res: "worldMe", farm: 7 })).data, ME);
  assert.match(urls[0], /type=world&mode=agg&group=total_level&limit=1000/);
  assert.match(urls[1], /type=world&mode=farm&farm=7/);
});

test("islands: the five known ones in their fixed order, then any newer island (crystal, marble…) by count — none dropped", async () => {
  const { islandRows } = await import("../../widgets/world-dist.mjs");
  const rows = islandRows([{ key: "basic", n: 9 }, { key: "crystal", n: 47 }, { key: "galaxy", n: 48 }, { key: "volcano", n: 3 }]);
  assert.deepStrictEqual(rows.map((r) => r.key), ["basic", "spring", "desert", "volcano", "swamp", "galaxy", "crystal"]);
  assert.strictEqual(rows.find((r) => r.key === "crystal").n, 47);
});
