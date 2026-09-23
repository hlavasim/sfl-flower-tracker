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
