import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fishingAgeNow as W } from "../../widgets/fishing-age-now.mjs";
import { agingNow } from "../../core/engine/aging-now.mjs";
import { computeFoodXP, detectCookingBoosts } from "../../core/engine/cooking.mjs";
import { renderTable } from "../../ui/table.mjs";

const FARM = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url), "utf8")).farm;
const MULT = computeFoodXP("Aged Fish", { xp: 1, usesHoney: false }, "Aging Shed", detectCookingBoosts(FARM, {}));

test("needs: the farm and the leveling inputs of the given farm", () => {
  assert.deepStrictEqual(W.needs(42), { farm: { res: "farm", farm: 42 }, leveling: { res: "leveling", farm: 42 } });
});

test("rows are core agingNow's, in its order, with XP at the farm's aged-fish multiplier", () => {
  const out = W.build({ farm: FARM, leveling: null }, { lvPlan: null });
  const core = agingNow({ owned: FARM.inventory, baitsWanted: true });
  assert.ok(core.length > 0, "fixture has something to age");
  assert.deepStrictEqual(out.rows.map((r) => [r.name, r.age, r.group]), core.map((r) => [r.name, r.age, r.group]));
  for (const r of out.rows) assert.ok(Math.abs(r.xp - r.age * r.agedXp * MULT) < 1e-6);
  assert.ok(MULT > 1);
});

test("running salt against the salt held: ok, then the row that crosses it partial, the rest over", () => {
  const farm = { ...FARM, inventory: { ...FARM.inventory, Salt: "1" } };
  const rows = W.build({ farm, leveling: null }, { lvPlan: null }).rows;
  let run = 0;
  for (const r of rows) { run += r.salt; assert.strictEqual(r.run, run); }
  assert.strictEqual(rows[0].saltState, rows[0].salt <= 1 ? "ok" : "partial");
  assert.ok(rows.slice(1).every((r) => r.saltState === "over"));
});

test("recipe fish are offered only when baits are not wanted (plan says they do not help, no Marvel route)", () => {
  const groups = (ctx) => new Set(W.build({ farm: FARM, leveling: null }, ctx).rows.map((r) => r.group));
  assert.ok(!groups({ lvPlan: null }).has("bait"));
  assert.ok(groups({ lvPlan: { fish: { baitsHelp: false } } }).has("bait"));
  assert.ok(!groups({ lvPlan: { fish: { baitsHelp: false } }, marvelPlanned: true }).has("bait"));
});

test("footer totals and the empty message", () => {
  const out = W.build({ farm: FARM, leveling: null }, { lvPlan: null });
  assert.match(out.footer, /Total <b>[\d,]+<\/b> fish/);
  assert.match(out.footer, /slots running/);
  const none = W.build({ farm: { inventory: {} }, leveling: null }, { lvPlan: null, bestWorm: "Grub" });
  assert.deepStrictEqual(none.rows, []);
  assert.match(none.empty, /Go fishing \(Grub\)/);
  assert.match(W.build({ farm: null }).empty, /No farm data/);
});

test("renders through the table: defaults show 14 rows; an extra column can be added", () => {
  const { rows } = W.build({ farm: FARM, leveling: null }, { lvPlan: null });
  const html = renderTable(W.columns, rows, W.defaults, { rowKey: W.rowKey });
  assert.strictEqual((html.match(/<tr data-row=/g) || []).length, Math.min(14, rows.length));
  assert.doesNotMatch(html, />XP\/salt</);
  const withExtra = renderTable(W.columns, rows, { ...W.defaults, columns: ["name", "gainPerSalt"] }, { rowKey: W.rowKey });
  assert.match(withExtra, />XP\/salt</);
});

test("salt Σ follows the order shown: sorted by XP, the running salt and its colour are recomputed", () => {
  const farm = { ...FARM, inventory: { ...FARM.inventory, Salt: "40" } };
  const { rows } = W.build({ farm, leveling: null }, { lvPlan: null });
  assert.ok(rows.length >= 3);
  const html = renderTable(W.columns, rows, { columns: ["name", "run"], sort: { key: "xp", dir: "desc" } }, { rowKey: W.rowKey });
  const shown = [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);
  const byName = new Map(rows.map((r) => [r.name, r]));
  let run = 0;
  const want = shown.map((n) => (run += byName.get(n).salt));
  const got = [...html.matchAll(/title="[\d,]+ for this row">([\d,]+)</g)].map((m) => Number(m[1].replace(/,/g, "")));
  assert.deepStrictEqual(got, want.map((v) => Math.round(v)));
});

test("the hidden rest is counted under the table", () => {
  const { rows } = W.build({ farm: FARM, leveling: null }, { lvPlan: null });
  if (rows.length > 14) assert.match(renderTable(W.columns, rows, W.defaults, { rowKey: W.rowKey }), new RegExp(`and ${rows.length - 14} more`));
});

test("the leveling plan is optional: the board paints without it and fills it in later", () => {
  assert.deepStrictEqual(W.optional, ["leveling"]);
});
