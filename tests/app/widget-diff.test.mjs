import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { invRepay, invEarning, repayRows, earningRows, diffDays, dayRows } from "../../widgets/diff.mjs";
import { diffRatesFor } from "../../core/sections/diff.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { looksFor, renderLook } from "../../ui/glance-templates.mjs";

// DIFF's read-only widgets: the page loads the owner-only ledger and hands the figures over ctx.
const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
const FIG = {
  aggSheet: { peakBtc: 0.1, netDebtBtc: 0.06, repaidPct: 40 }, flowerPerBtc: 1e6, btcBackOnChain: 0.01,
  liquidValueBtc: 0.02, walletLiquidBtc: 0.005, eggsLiquidBtc: 0, lpBtc: 0.003, lockedBtc: 0.004,
  planStats: { dailyTargetBtc: 0.0002, balanceBtc: 0.002, paceBtcPerDay: 0.0003, series: [] },
};
const ready = (extra = {}) => ({ inv: () => ({ ready: true, figures: FIG }), ...extra });

test("registered on DIFF; no store needs (the page loads the owner-only data)", () => {
  for (const w of [invRepay, invEarning]) {
    assert.strictEqual(WIDGETS[w.type], w);
    assert.strictEqual(w.page, "diff");
    assert.deepStrictEqual(w.needs("1"), {});
  }
  assert.match(SRC, /\["inv-repay", "inv-earning", "diff-days"\]\.map\(\(t\) => \{/);
  // one set of figures for the page's panels and the widget
  assert.match(SRC, /function _invFigures\(\) \{/);
  assert.match(SRC, /\} = _invFigures\(\);/);
});

test("repay: the peak, what is still inside, repaid %, the plan's lead and pace", () => {
  const rows = repayRows(FIG);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.strictEqual(by.peak.value, "0.1000 ₿");
  assert.strictEqual(by.inside.value, "0.0600 ₿");
  assert.strictEqual(by.inside.note, "≈ 60,000 FLOWER");
  assert.strictEqual(by.repaid.value, "40.0 %");
  assert.strictEqual(by.liquid.value, "0.0280 ₿");
  assert.deepStrictEqual([by.lead.label, by.lead.value, by.lead.tone], ["Ahead of plan", "+10 days", "done"]);
  assert.strictEqual(by.pace.value, "1.50 d/day");
  const m = invRepay.glanceModel({}, ready());
  assert.deepStrictEqual([m.head.value, m.head.ring, m.head.cap], ["40%", 40, "repaid · ahead by 10 d"]);
  assert.ok(looksFor(m).length >= 3);
  assert.match(renderLook(m, "gauge").html, /40%/);
});

test("repay: loading asks the page once; a lock or another farm says why; nothing is a number", () => {
  let asked = 0;
  assert.match(invRepay.build({}, { inv: () => ({ loading: "Loading the ledger…" }), ensure: () => asked++ }).empty, /Loading the ledger/);
  assert.strictEqual(asked, 1);
  assert.match(invRepay.glanceModel({}, { inv: () => ({ error: "🔒 The ledger is owner-only" }) }).empty, /owner-only/);
  assert.match(invRepay.build({}, {}).empty, /Loading/);
});

test("earning rate: 7 and 30 days in FLOWER and sats a day, the value series as the chart", () => {
  const ins = { ready: true, r7: { sflPerDay: -37.7, sampleSize: 15 }, r30: null, btcPerSfl: 2e-6, series: [10, 12, 11] };
  const rows = earningRows(ins);
  assert.deepStrictEqual(rows.map((r) => [r.label, r.value]), [["7-day", "−37.7 FLOWER/day"], ["30-day", "not enough data"]]);
  assert.strictEqual(rows[0].note, "−7,540 sats/day · 15 snapshots");
  const m = invEarning.glanceModel({}, { ins: () => ins });
  assert.deepStrictEqual([m.head.value, m.head.tone], ["−37.7", "bad"]);
  assert.deepStrictEqual(m.series, [10, 12, 11]);
  assert.ok(looksFor(m).includes("chart-2"));
});

test("farm changes by day: the store's farmChanges for the chosen days, newest day first, gains / losses / the biggest moves", () => {
  assert.strictEqual(WIDGETS["diff-days"], diffDays);
  assert.deepStrictEqual(diffDays.needs("7", { days: "14" }), { changes: { res: "farmChanges", farm: "7", days: 14 } });
  assert.deepStrictEqual(diffDays.needs("7", {}).changes.days, 7);
  const changes = [
    { period: "2026-11-24T12:00:00.000Z", count: 3, netSfl: -5, items: [{ itemName: "Wood", sflValue: -8 }, { itemName: "Egg", sflValue: 3 }] },
    { period: "2026-11-25T12:00:00.000Z", count: 2, netSfl: 10, items: [{ itemName: "Obsidian", sflValue: 12 }, { itemName: "Iron", sflValue: -2 }, { itemName: "Gem", sflValue: 0 }] },
  ];
  const rows = dayRows(changes);
  assert.deepStrictEqual(rows.map((r) => [r.day, r.net, r.gains, r.losses, r.top.map((i) => i.itemName)]),
    [["2026-11-25", 10, 12, -2, ["Obsidian", "Iron"]], ["2026-11-24", -5, 3, -8, ["Wood", "Egg"]]]);
  const m = diffDays.glanceModel({ changes }, {}, {});
  assert.deepStrictEqual([m.head.value, m.head.tone], ["+5.00", "ok"]);
  assert.deepStrictEqual(m.series, [-5, 10], "oldest day first");
  assert.ok(looksFor(m).includes("chart-2"));
  assert.match(diffDays.build({}, {}).empty, /No farm history/);
});

test("the DIFF rate profile is one core function: Betty coins, gems, FLOWER per XP, treasure boost, season", () => {
  const farm = { season: { season: "Autumn" }, collectibles: { Camel: [{ coordinates: { x: 1, y: 1 } }] }, bumpkin: { experience: 0 } };
  const td = { p2pPrices: {}, coinsPerSFL_betty: 320, coinsPerSFL_api: 300, gemsPerSFL: 0.035 };
  const r = diffRatesFor(farm, td);
  assert.deepStrictEqual([r.coinsPerSFL, r.gemsPerSFL, r.season, r.treasureBoost], [320, 0.035, "autumn", 1.3]);
  assert.strictEqual(typeof r.sflPerXP, "number");
  assert.deepStrictEqual(diffRatesFor(null, null), { coinsPerSFL: 0, sflPerXP: 0, season: "", treasureBoost: 1, gemsPerSFL: 0 });
  assert.match(SRC, /const roiRates = diffRatesFor\(data\.farm, _diffTd\);/);
});
