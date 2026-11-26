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

test("islands: share and bar per row, my island highlighted", () => {
  const { rows, footer } = worldIslands.build({ agg: ISL, me: ME });
  const html = renderTable(worldIslands.columns, rows, worldIslands.defaults, opts(worldIslands));
  assert.deepStrictEqual(keys(html), ["basic", "spring", "volcano"]);
  assert.match(html, /60\.0 %/);
  assert.match(html, /class="w-hbar"><span style="width:100\.0%/);
  assert.match(html, /data-row="volcano" class="w-row-hl"/);
  assert.match(footer, /1[\s ]?000 farem/);
});

test("skill points: highest first, my level highlighted, farms above me in the footer", () => {
  const { rows, footer } = worldSkillPoints.build({ agg: SP, me: ME });
  const html = renderTable(worldSkillPoints.columns, rows, worldSkillPoints.defaults, opts(worldSkillPoints));
  assert.deepStrictEqual(keys(html), ["300", "285", "150", "1"]);
  assert.match(html, /data-row="285" class="w-row-hl"/);
  assert.match(footer, /nad tebou 50 farem/);
  assert.match(footer, /top 5[,.]0 %/);
});

test("my row stays visible past the top N (host passes keepRow)", async () => {
  const { createHost } = await import("../../app/widget-host.mjs");
  const m = new Map();
  const h = createHost({ registry: { "world-skill-points": worldSkillPoints }, storage: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } });
  h.handle("page:world-skill-points", "rows-top", "1");
  const html = h.renderPage("world-skill-points", { data: { agg: SP, me: ME } });
  assert.deepStrictEqual(keys(html), ["300", "285"]);
});

test("without my farm the charts still stand; no data → an explanation", () => {
  assert.strictEqual(worldSkillPoints.build({ agg: SP, me: null }).rows.length, 4);
  assert.match(worldIslands.build({ agg: null }).empty, /WORLD/);
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
