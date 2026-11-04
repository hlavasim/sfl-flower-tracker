import { test } from "node:test";
import assert from "node:assert";
import { repayPlanStats } from "../../core/engine/repay-plan.mjs";

/*
 * The plan is a pace laid over the ledger: a daily target from start_date, credited with every
 * withdrawal made since. These pin the arithmetic the ④ REPAY PLAN card and its chart are built on.
 */
const ctx = { peakBtc: 0.3, netDebtBtc: 0.3, today: "2026-09-22" };
const tx = [
  { tx_date: "2026-09-01", direction: "withdrawal", btc_amount: "0.001" },   // before start — ignored
  { tx_date: "2026-09-12", direction: "withdrawal", btc_amount: "0.002" },
  { tx_date: "2026-09-20", direction: "withdrawal", btc_amount: "0.0005" },
  { tx_date: "2026-09-30", direction: "withdrawal", btc_amount: "1" },       // future — ignored
];

test("10 % yearly of a 0.3 ₿ peak is 0.03 ₿ a year, accrued per day from the start date", () => {
  const s = repayPlanStats({ start_date: "2026-09-12", rate: 10, period: "year" }, tx, ctx);
  assert.ok(Math.abs(s.dailyTargetBtc - 0.03 / 365) < 1e-12);
  assert.equal(s.daysElapsed, 10);
  assert.ok(Math.abs(s.targetBtc - 10 * 0.03 / 365) < 1e-12);
  assert.ok(Math.abs(s.etaDays - 0.3 / (0.03 / 365)) < 1e-6, "3650 days to repay 0.3 at 0.03/yr");
});

test("a start in the past credits the withdrawals made since — and only those", () => {
  const s = repayPlanStats({ start_date: "2026-09-12", rate: 10, period: "year" }, tx, ctx);
  assert.ok(Math.abs(s.actualBtc - 0.0025) < 1e-12, "0.002 on the start day + 0.0005 later; not the one before start, not the future one");
  assert.ok(Math.abs(s.balanceBtc - (0.0025 - s.targetBtc)) < 1e-12);
});

test("the series steps through withdrawals while the target climbs linearly", () => {
  const s = repayPlanStats({ start_date: "2026-09-12", rate: 10, period: "year" }, tx, ctx);
  assert.equal(s.series.length, 11);
  assert.deepEqual(s.series[0], { time: "2026-09-12", target: 0, actual: 0.002 });
  assert.equal(s.series[7].actual, 0.002, "flat until the next withdrawal");
  assert.ok(Math.abs(s.series[8].actual - 0.0025) < 1e-12);
  assert.ok(Math.abs(s.series[10].target - s.targetBtc) < 1e-12);
});

test("the next 50 days carry the target on and extend the realized pace as the trend", () => {
  const s = repayPlanStats({ start_date: "2026-09-12", rate: 10, period: "year" }, tx, ctx);
  assert.equal(s.future.length, 50);
  assert.equal(s.future[0].time, "2026-09-23");
  // 10 days elapsed: pace = (0.0025 − 0.002 on the start day) / 10
  assert.ok(Math.abs(s.paceBtcPerDay - 0.00005) < 1e-12);
  assert.ok(Math.abs(s.future[49].trend - (0.0025 + 0.00005 * 50)) < 1e-12);
  assert.ok(Math.abs(s.future[0].target - s.dailyTargetBtc * 11) < 1e-12, "the target line does not break at today");
  const long = repayPlanStats({ start_date: "2025-01-01", rate: 10, period: "year" }, tx, { ...ctx, horizonDays: 20 });
  assert.equal(long.future.length, 20);
  assert.ok(Math.abs(long.paceBtcPerDay - 0.0025 / 20) < 1e-12, "a long-running plan measures its pace over the last horizon only");
});

test("monthly and daily periods scale the same rate", () => {
  const m = repayPlanStats({ start_date: "2026-09-22", rate: 1, period: "month" }, [], ctx);
  const d = repayPlanStats({ start_date: "2026-09-22", rate: 1, period: "day" }, [], ctx);
  assert.ok(Math.abs(m.dailyTargetBtc - 0.003 / (365 / 12)) < 1e-12);
  assert.ok(Math.abs(d.dailyTargetBtc - 0.003) < 1e-12);
  assert.equal(m.daysElapsed, 0);
  assert.equal(m.series.length, 1, "start today: one point, nothing accrued yet");
});

test("a future start, a bad rate or no peak yields no plan rather than nonsense", () => {
  const f = repayPlanStats({ start_date: "2026-10-01", rate: 10, period: "year" }, tx, ctx);
  assert.equal(f.daysElapsed, 0);
  assert.equal(f.actualBtc, 0);
  assert.equal(repayPlanStats({ start_date: "2026-09-12", rate: 0, period: "year" }, tx, ctx), null);
  assert.equal(repayPlanStats({ start_date: "2026-09-12", rate: 10, period: "week" }, tx, ctx), null);
  assert.equal(repayPlanStats({ start_date: "2026-09-12", rate: 10, period: "year" }, tx, { ...ctx, peakBtc: 0 }), null);
});

/*
 * E13: a round trip is not a repayment. Pull 0.05 out and put the same 0.05 back and nothing has
 * been repaid — gross withdrawals booked 0.052 here. Net withdrawals since the start, floored at 0
 * in the running series, book the 0.002 that actually stayed out.
 */
test("a withdraw-then-redeposit round trip repays nothing — net withdrawals count", () => {
  const plan = { start_date: "2026-09-12", rate: 10, period: "year" };
  const rt = [
    { tx_date: "2026-09-13", direction: "withdrawal", btc_amount: "0.05" },
    { tx_date: "2026-09-15", direction: "deposit",    btc_amount: "0.05" },   // put straight back
    { tx_date: "2026-09-18", direction: "withdrawal", btc_amount: "0.002" },
  ];
  const s = repayPlanStats(plan, rt, ctx);
  assert.ok(Math.abs(s.actualBtc - 0.002) < 1e-12, `actual ${s.actualBtc}, gross would be 0.052`);
  assert.equal(s.series[1].actual, 0.05, "the withdrawal shows on its day");
  assert.equal(s.series[3].actual, 0, "and the re-deposit takes it back");
  assert.ok(Math.abs(s.series[6].actual - 0.002) < 1e-12);
  // The floor: a deposit ahead of any withdrawal cannot bank negative repayment.
  const early = repayPlanStats(plan, [
    { tx_date: "2026-09-13", direction: "deposit",    btc_amount: "0.1" },
    { tx_date: "2026-09-14", direction: "withdrawal", btc_amount: "0.01" },
  ], ctx);
  assert.ok(early.series.every((p) => p.actual >= 0), "never below zero");
  assert.ok(Math.abs(early.actualBtc - 0.01) < 1e-12);
});

/*
 * E15: dates are the owner's LOCAL days. At 01:30 in Prague on 23 Sep the UTC date is still
 * 22 Sep, so the plan used to end "today" a day early and treat a withdrawal logged today as
 * being in the future.
 */
test("today is the local date, not the UTC one", () => {
  const RealDate = Date, tz = process.env.TZ;
  const at = RealDate.parse("2026-09-22T23:30:00Z");   // 01:30 on the 23rd in Prague
  class FakeDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [at])); }
    static now() { return at; }
  }
  process.env.TZ = "Europe/Prague";
  globalThis.Date = FakeDate;
  try {
    const s = repayPlanStats({ start_date: "2026-09-20", rate: 10, period: "year" },
      [{ tx_date: "2026-09-23", direction: "withdrawal", btc_amount: "0.004" }], { peakBtc: 0.3, netDebtBtc: 0.3 });
    assert.equal(s.series[s.series.length - 1].time, "2026-09-23", "the plan runs to the local today");
    assert.equal(s.daysElapsed, 3);
    assert.ok(Math.abs(s.actualBtc - 0.004) < 1e-12, "a withdrawal made today counts today");
  } finally {
    globalThis.Date = RealDate;
    if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
  }
});

// The chart is weekly: each withdrawal lands in the week it was made, not all on one day.
test("weeks bucket the withdrawals by the week they were made (Monday start)", () => {
  const plan = { start_date: "2026-09-01", rate: 10, period: "year" };   // a Tuesday
  const s = repayPlanStats(plan, [
    { tx_date: "2026-09-02", direction: "withdrawal", btc_amount: "0.001" },
    { tx_date: "2026-09-06", direction: "withdrawal", btc_amount: "0.002" },   // Sunday, same week
    { tx_date: "2026-09-16", direction: "withdrawal", btc_amount: "0.004" },
  ], ctx);   // today 2026-09-22, a Tuesday
  assert.deepEqual(s.weeks.map((w) => w.time), ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"]);
  assert.deepEqual(s.weeks.map((w) => +w.withdrawn.toFixed(6)), [0.003, 0, 0.004, 0]);
  assert.ok(Math.abs(s.weeks[2].actual - 0.007) < 1e-12, "running total at the week's end");
  assert.ok(Math.abs(s.weeks[3].target - s.targetBtc) < 1e-12, "the current week ends today");
  assert.ok(Math.abs(s.weeks[0].target - s.dailyTargetBtc * 5) < 1e-12, "target at Sunday 6 Sep");
  assert.equal(s.futureWeeks.length, 10);
  assert.equal(s.futureWeeks[0].time, "2026-09-28");
  assert.ok(Math.abs(s.futureWeeks[0].target - s.dailyTargetBtc * 33) < 1e-12, "target at Sunday 4 Oct");
  const short = repayPlanStats({ start_date: "2025-01-01", rate: 10, period: "year" }, [], { ...ctx, weeksBack: 3 });
  assert.equal(short.weeks.length, 3, "history capped at weeksBack");
});

test("a start still in the future anchors the chart at today — no date appears twice", () => {
  const f = repayPlanStats({ start_date: "2026-10-01", rate: 10, period: "year" }, [], ctx);
  const times = f.series.concat(f.future).map((p) => p.time);
  assert.equal(new Set(times).size, times.length, "every date once");
  assert.ok(times.every((t, i) => i === 0 || t > times[i - 1]), "strictly ascending, as the chart needs");
  assert.equal(f.series[0].time, "2026-09-22");
  const at = (d) => f.future.find((p) => p.time === d).target;
  assert.equal(at("2026-10-01"), 0, "nothing accrues before the start");
  assert.ok(Math.abs(at("2026-10-02") - f.dailyTargetBtc) < 1e-12, "and it accrues from the start on");
});

// cbBTC on chain is a balance; its transfer history (Basescan CSV) dates it for the plan.
import { datedOnChainBtc, parseTokenTransfersCsv } from "../../core/engine/repay-plan.mjs";
const W = "0x57D158E5e9761553e06e475524808301c567892e";
const CSV = `﻿Transaction Hash,Status,Method,BlockNo,DateTime (UTC),From,From_Nametag,To,To_Nametag,Amount,Value (USD)
"0xaa","Success","Execute","1","2026-10-06 11:33:33","0xfBB6","","${W}","","0.00541761","$429.35"
"0xbb","Success","Execute","2","2026-10-08 16:16:47","${W}","","0x4985","Uniswap V4: Pool Manager","0.00027089","$21.47"
"0xbb","Success","Execute","2","2026-10-08 16:16:47","${W}","","0xfBB6","","0.00514672","$407.88"
"0xcc","Success","Execute","3","2026-10-11 19:25:15","0x4985","Uniswap V4: Pool Manager","${W}","","0.00074051","$1,058.69"
"0xdd","Success","Execute","4","2026-10-12 09:00:00","${W}","","0x3ef234bc2a04d86f6041e419458d9acbd077f2c1","","0.001","$1"`;

test("the explorer's cbBTC CSV becomes dated rows: in = withdrawal, out = deposit, own-to-own skipped", () => {
  const rows = parseTokenTransfersCsv(CSV, [W, "0x3ef234bc2a04d86f6041e419458d9acbd077f2c1"]);
  assert.deepEqual(rows.map((r) => [r.tx_date, r.direction, r.btc_amount]), [
    ["2026-10-06", "withdrawal", 0.00541761], ["2026-10-08", "deposit", 0.00027089],
    ["2026-10-08", "deposit", 0.00514672], ["2026-10-11", "withdrawal", 0.00074051]]);
  assert.equal(rows[3].usd_amount, 1058.69, "thousands separator and $ stripped");
  assert.equal(new Set(rows.map((r) => r.notes)).size, 4, "two transfers of one tx stay distinct");
  assert.throws(() => parseTokenTransfersCsv("a,b\n1,2", [W]));
});

test("dated cbBTC rows move the on-chain BTC to their days; the unexplained rest lands today", () => {
  const rows = parseTokenTransfersCsv(CSV, [W, "0x3ef234bc2a04d86f6041e419458d9acbd077f2c1"]);
  const net = 0.00541761 - 0.00027089 - 0.00514672 + 0.00074051;
  const d = datedOnChainBtc(rows, net + 0.002, "2026-11-04");
  assert.equal(d.length, 5);
  assert.deepEqual(d[4].tx_date, "2026-11-04");
  assert.ok(Math.abs(d[4].btc_amount - 0.002) < 1e-12);
  assert.equal(datedOnChainBtc(rows, net, "2026-11-04").length, 4, "fully explained: nothing booked today");
  const s = repayPlanStats({ start_date: "2026-09-23", rate: 10, period: "year" }, datedOnChainBtc(rows, net, "2026-11-04"), { ...ctx, today: "2026-11-04" });
  assert.ok(Math.abs(s.actualBtc - net) < 1e-12);
  assert.ok(Math.abs(s.series.find((p) => p.time === "2026-10-06").actual - 0.00541761) < 1e-12, "the 6 Oct buy shows on its day");
  assert.ok(Math.abs(s.weeks.find((w) => w.time === "2026-10-05").withdrawn - 0.00074051) < 1e-12, "and its week nets the swap back out");
  assert.equal(datedOnChainBtc([], 0.009, "2026-11-04")[0].tx_date, "2026-11-04", "no history: all of it today, as before");
});
