/*
 * REPAY PLAN — "take X % of what I risked back out into BTC every day / month / year".
 *
 * The plan is a pace, not a balance: from `start_date` a target accrues at a constant rate, and
 * the NET withdrawals logged in the ledger on or after that date count against it. Set the start
 * in the past and the withdrawals already made since then are credited, so the plan can be laid
 * over history rather than only counting from the day it was typed in.
 *
 * Net, not gross: a round trip — pull 0.05 ₿ out, put the same 0.05 ₿ back — repays nothing, so
 * each day contributes withdrawals − deposits (any venue), and the running total is floored at 0
 * so a deposit cannot bank "negative repayment" ahead of later withdrawals.
 *
 * The rate is a percentage of PEAK exposure — the high-water mark that ① RECOVERED divides by —
 * so "10 % yearly" of a 0.300 ₿ peak is a fixed 0.030 ₿ a year whatever has been repaid since.
 *
 * Days are the owner's LOCAL calendar days: `today` defaults to the local date, not the UTC one,
 * so between 00:00 and 02:00 CEST a withdrawal made today is not "in the future". A start date
 * still ahead of today anchors the series at today (target 0 until the start), so the chart
 * never gets the same date twice.
 *
 * Twin copy: flowers.html carries this function verbatim (tests/core/twin-copies.test.mjs).
 */
export function repayPlanStats(plan, transactions, ctx) {
  const perDay = { day: 1, month: 365 / 12, year: 365 };
  const dayMs = 86400000;
  const rate = parseFloat(plan && plan.rate);
  const divisor = perDay[(plan && plan.period) || "year"];
  const peakBtc = (ctx && ctx.peakBtc) || 0;
  const netDebtBtc = (ctx && ctx.netDebtBtc) || 0;
  const now = new Date();
  const localToday = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  const startMs = Date.parse(String((plan && plan.start_date) || "").slice(0, 10) + "T00:00:00Z");
  const todayMs = Date.parse(String((ctx && ctx.today) || localToday).slice(0, 10) + "T00:00:00Z");
  if (!isFinite(rate) || rate <= 0 || !divisor || !isFinite(startMs) || !isFinite(todayMs) || peakBtc <= 0) return null;

  const dailyTargetBtc = peakBtc * (rate / 100) / divisor;
  // Days the plan has been running: 0 on the start day, negative (clamped) while it is in the future.
  const daysElapsed = Math.max(0, Math.round((todayMs - startMs) / dayMs));
  const targetBtc = dailyTargetBtc * daysElapsed;
  const targetAt = (ms) => dailyTargetBtc * Math.max(0, Math.round((ms - startMs) / dayMs));

  // Net withdrawals since the start, any venue — a wallet sale of FLOWER for BTC repays just like a
  // farm withdrawal does, and a deposit anywhere takes it back — bucketed by day.
  const byDay = {};
  for (const t of transactions || []) {
    const sign = t.direction === "withdrawal" ? 1 : t.direction === "deposit" ? -1 : 0;
    if (!sign) continue;
    const d = String(t.tx_date || "").slice(0, 10);
    const ms = Date.parse(d + "T00:00:00Z");
    if (!isFinite(ms) || ms < startMs || ms > todayMs) continue;
    byDay[d] = (byDay[d] || 0) + sign * (parseFloat(t.btc_amount) || 0);
  }

  const series = [];
  let cum = 0;
  for (let ms = Math.min(startMs, todayMs); ms <= todayMs; ms += dayMs) {
    const d = new Date(ms).toISOString().slice(0, 10);
    cum = Math.max(0, cum + (byDay[d] || 0));
    series.push({ time: d, target: targetAt(ms), actual: cum });
  }
  const actualBtc = cum;

  const balanceBtc = actualBtc - targetBtc;

  // Ahead: the target keeps climbing, and the realized pace of the last `horizonDays` (or since
  // the start, if younger) is extended as the trend — where the withdrawals land if they go on
  // as they have.
  const horizon = (ctx && ctx.horizonDays) || 50;
  const lookback = Math.min(horizon, series.length - 1);
  const paceBtcPerDay = lookback > 0 ? (series[series.length - 1].actual - series[series.length - 1 - lookback].actual) / lookback : 0;
  const future = [];
  for (let i = 1; i <= horizon; i++) {
    const ms = todayMs + i * dayMs;
    future.push({ time: new Date(ms).toISOString().slice(0, 10), target: targetAt(ms), trend: actualBtc + paceBtcPerDay * i });
  }

  return {
    dailyTargetBtc, daysElapsed, targetBtc, actualBtc, balanceBtc, paceBtcPerDay,
    // Days from now to a fully repaid position at the plan's pace, ignoring the current lead/lag.
    etaDays: netDebtBtc > 0 ? netDebtBtc / dailyTargetBtc : 0,
    series, future,
  };
}
