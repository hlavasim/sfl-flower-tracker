/*
 * REPAY PLAN — "take X % of what I risked back out into BTC every day / month / year".
 *
 * The plan is a pace, not a balance: from `start_date` a target accrues at a constant rate, and
 * every withdrawal logged in the ledger on or after that date counts against it. Set the start in
 * the past and the withdrawals already made since then are credited, so the plan can be laid over
 * history rather than only counting from the day it was typed in.
 *
 * The rate is a percentage of PEAK exposure — the high-water mark that ① RECOVERED divides by —
 * so "10 % yearly" of a 0.300 ₿ peak is a fixed 0.030 ₿ a year whatever has been repaid since.
 *
 * Twin copy: flowers.html carries this function verbatim (tests/core/twin-copies.test.mjs).
 */
export function repayPlanStats(plan, transactions, ctx) {
  const perDay = { day: 1, month: 365 / 12, year: 365 };
  const rate = parseFloat(plan && plan.rate);
  const divisor = perDay[(plan && plan.period) || "year"];
  const peakBtc = (ctx && ctx.peakBtc) || 0;
  const netDebtBtc = (ctx && ctx.netDebtBtc) || 0;
  const startMs = Date.parse(String((plan && plan.start_date) || "").slice(0, 10) + "T00:00:00Z");
  const todayMs = Date.parse(String((ctx && ctx.today) || new Date().toISOString()).slice(0, 10) + "T00:00:00Z");
  if (!isFinite(rate) || rate <= 0 || !divisor || !isFinite(startMs) || !isFinite(todayMs) || peakBtc <= 0) return null;

  const dailyTargetBtc = peakBtc * (rate / 100) / divisor;
  // Days the plan has been running: 0 on the start day, negative (clamped) while it is in the future.
  const daysElapsed = Math.max(0, Math.round((todayMs - startMs) / 86400000));
  const targetBtc = dailyTargetBtc * daysElapsed;

  // Withdrawals since the start, any venue — a wallet sale of FLOWER for BTC repays just like a
  // farm withdrawal does — bucketed by day so the series can step through them.
  const byDay = {};
  let actualBtc = 0;
  for (const t of transactions || []) {
    if (t.direction !== "withdrawal") continue;
    const d = String(t.tx_date || "").slice(0, 10);
    const ms = Date.parse(d + "T00:00:00Z");
    if (!isFinite(ms) || ms < startMs || ms > todayMs) continue;
    const btc = parseFloat(t.btc_amount) || 0;
    byDay[d] = (byDay[d] || 0) + btc;
    actualBtc += btc;
  }

  const series = [];
  let cum = 0;
  for (let i = 0; i <= daysElapsed; i++) {
    const d = new Date(startMs + i * 86400000).toISOString().slice(0, 10);
    cum += byDay[d] || 0;
    series.push({ time: d, target: dailyTargetBtc * i, actual: cum });
  }

  const balanceBtc = actualBtc - targetBtc;

  // Ahead: the target keeps climbing, and the realized pace of the last `horizonDays` (or since
  // the start, if younger) is extended as the trend — where the withdrawals land if they go on
  // as they have.
  const horizon = (ctx && ctx.horizonDays) || 50;
  const lookback = Math.min(horizon, daysElapsed);
  const paceBtcPerDay = lookback > 0 ? (series[series.length - 1].actual - series[series.length - 1 - lookback].actual) / lookback : 0;
  const future = [];
  for (let i = 1; i <= horizon; i++) {
    const d = new Date(todayMs + i * 86400000).toISOString().slice(0, 10);
    future.push({ time: d, target: dailyTargetBtc * (daysElapsed + i), trend: actualBtc + paceBtcPerDay * i });
  }

  return {
    dailyTargetBtc, daysElapsed, targetBtc, actualBtc, balanceBtc, paceBtcPerDay,
    // Days from now to a fully repaid position at the plan's pace, ignoring the current lead/lag.
    etaDays: netDebtBtc > 0 ? netDebtBtc / dailyTargetBtc : 0,
    series, future,
  };
}
