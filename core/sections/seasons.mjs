/*
 * Seasonal price calendar for crops and fruits.
 *
 * The game rotates spring → summer → autumn → winter one week each, counted from Monday
 * 2024-12-16 00:00 UTC (sunflower-land src/features/game/lib/season.ts, populateSeason), and a
 * crop is only plantable in some of those weeks (SEASONAL_SEEDS). Supply therefore swings on a
 * fixed 28-day beat, and so does the p2p price of several crops. Measured on the tracker's own
 * history (Feb–Sep 2026, fee included, rules fitted on the first half and read off the second):
 * Potato, Eggplant, Rhubarb, Wheat, Pumpkin and Lemon were cheap in autumn and dear in spring,
 * +10% to +38% net per round trip; roughly half the crops show nothing stable.
 *
 * So every figure here is split in two: `expectedNet` from the whole history (what the heatmap
 * shows) and `oosNet` + `stable` from fitting on the first half and scoring on the second (the
 * honest answer to "would this rule have worked"). A signal is only raised for a stable pattern.
 */

export const SEASON_ROTATION = ["spring", "summer", "autumn", "winter"];
const FIRST_WEEK_START_AT = Date.UTC(2024, 11, 16);
const DAY = 86400000;
const WEEK = 7 * DAY;

/** The season running at `ms`, exactly as the game computes it. */
export function seasonAt(ms) {
  const days = Math.floor((ms - FIRST_WEEK_START_AT) / DAY);
  const weeks = Math.max(Math.floor(days / 7), 0);
  return { season: SEASON_ROTATION[weeks % 4], startedAt: FIRST_WEEK_START_AT + weeks * WEEK };
}

/** Start of the next week of `season` — or of the running one if `season` is running now. */
export function nextSeasonStart(season, now) {
  const cur = seasonAt(now);
  const ahead = (SEASON_ROTATION.indexOf(season) - SEASON_ROTATION.indexOf(cur.season) + 4) % 4;
  return cur.startedAt + ahead * WEEK;
}

/** Change-based [[ms, price], …] → one price per UTC day, forward-filled. */
function toDaily(points) {
  const pts = (points || []).filter((p) => p && p[1] > 0).sort((a, b) => a[0] - b[0]);
  if (!pts.length) return [];
  const start = Math.floor(pts[0][0] / DAY) * DAY, end = Math.floor(pts[pts.length - 1][0] / DAY) * DAY;
  const out = [];
  let j = 0, last = pts[0][1];
  for (let t = start; t <= end; t += DAY) {
    while (j < pts.length && pts[j][0] < t + DAY) { last = pts[j][1]; j++; }
    out.push([t, last]);
  }
  return out;
}

/** log(price) minus its centred 28-day mean: what a price is doing relative to its own trend. */
function deviations(daily) {
  const lg = daily.map((d) => Math.log(d[1]));
  const out = [];
  for (let i = 0; i < lg.length; i++) {
    const lo = Math.max(0, i - 14), hi = Math.min(lg.length, i + 14);
    if (hi - lo < 20) { out.push(null); continue; }
    let s = 0;
    for (let k = lo; k < hi; k++) s += lg[k];
    out.push(lg[i] - s / (hi - lo));
  }
  return out;
}

function seasonMeans(daily, dev, from, to) {
  const acc = {};
  for (let i = from; i < to; i++) {
    if (dev[i] == null) continue;
    const s = seasonAt(daily[i][0]).season;
    (acc[s] = acc[s] || []).push(dev[i]);
  }
  const m = {};
  for (const s of SEASON_ROTATION) m[s] = acc[s] && acc[s].length ? acc[s].reduce((a, b) => a + b, 0) / acc[s].length : null;
  return m;
}

const argBy = (m, better) => {
  let best = null;
  for (const s of SEASON_ROTATION) if (m[s] != null && (best == null || better(m[s], m[best]))) best = s;
  return best;
};

/**
 * @param dailyByItem { item: [[ms, price], …] } — change-based price points
 * @param opts.now     ms
 * @param opts.fee     marketplace fee on the sale (default 10%)
 * @param opts.liquidity { item: { qtyPerDay, flowerPerDay } } — traded volume, last ~28 days
 */
export function buildSeasonCalendar(dailyByItem, opts = {}) {
  const now = opts.now || Date.now();
  const fee = opts.fee == null ? 0.10 : opts.fee;
  const liq = opts.liquidity || {};
  const cur = seasonAt(now);
  const items = [];
  for (const [item, points] of Object.entries(dailyByItem || {})) {
    const daily = toDaily(points);
    if (daily.length < 56) continue;                 // fewer than two full cycles says nothing
    const dev = deviations(daily);
    const half = Math.floor(daily.length / 2);
    const full = seasonMeans(daily, dev, 0, daily.length);
    const h1 = seasonMeans(daily, dev, 0, half);
    const h2 = seasonMeans(daily, dev, half, daily.length);
    const buy = argBy(full, (a, b) => a < b), sell = argBy(full, (a, b) => a > b);
    if (!buy || !sell) continue;
    const b1 = argBy(h1, (a, b) => a < b), s1 = argBy(h1, (a, b) => a > b);
    const b2 = argBy(h2, (a, b) => a < b), s2 = argBy(h2, (a, b) => a > b);
    const expectedNet = Math.exp(full[sell] - full[buy]) * (1 - fee) - 1;
    const oosNet = (b1 && s1 && h2[b1] != null && h2[s1] != null) ? Math.exp(h2[s1] - h2[b1]) * (1 - fee) - 1 : null;
    const stable = b1 === b2 && s1 === s2 && b1 !== s1 && oosNet != null && oosNet > 0;
    const signal = !(stable && expectedNet > 0.05) ? "none"
      : cur.season === buy ? "buy" : cur.season === sell ? "sell" : "hold";
    // Where the price sits now against its trailing 28-day mean, for "is this week cheap".
    const tail = daily.slice(-28).map((d) => Math.log(d[1]));
    const nowDev = tail.length ? Math.log(daily[daily.length - 1][1]) - tail.reduce((a, b) => a + b, 0) / tail.length : null;
    const bySeason = {};
    for (const s of SEASON_ROTATION) bySeason[s] = full[s] == null ? null : Math.exp(full[s]) - 1;
    const l = liq[item] || {};
    items.push({
      item, buy, sell, stable, signal, expectedNet, oosNet, bySeason,
      price: daily[daily.length - 1][1], nowVsTrend: nowDev == null ? null : Math.exp(nowDev) - 1,
      nextBuy: nextSeasonStart(buy, now), nextSell: nextSeasonStart(sell, now),
      days: daily.length,
      qtyPerDay: l.qtyPerDay == null ? null : l.qtyPerDay, flowerPerDay: l.flowerPerDay == null ? null : l.flowerPerDay,
      // A tenth of what trades in a day is what one player can push through without being the market.
      maxQtyPerDay: l.qtyPerDay == null ? null : Math.round(l.qtyPerDay * 0.1),
      maxFlowerPerDay: l.flowerPerDay == null ? null : Math.round(l.flowerPerDay * 0.1 * 100) / 100,
    });
  }
  items.sort((a, b) => (b.stable - a.stable) || (b.expectedNet - a.expectedNet));
  const weeks = [];
  for (let k = 0; k < 8; k++) { const t = cur.startedAt + k * WEEK; weeks.push({ start: t, season: seasonAt(t).season }); }
  return { current: cur, weeks, fee, items };
}
