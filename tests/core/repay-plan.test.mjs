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
  { tx_date: "2026-09-12", direction: "deposit",    btc_amount: "0.050" },   // deposits never count
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
