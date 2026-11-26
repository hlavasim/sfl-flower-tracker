// YAKKAMON (Thought Farm's second game): the pre-registration deposit rules and the tier-threshold
// trend. Pure, no page state — moved out of flowers.html for the YAKKAMON widgets (widgets/yakkamon.mjs).
//
export const YK = {
  depositStart: Date.UTC(2026, 7, 10, 2),       // 10 Aug 2026, week 1 opens — windows turn Mondays 02:00 UTC
  multStart: 3.0, multStepPerWeek: 0.2,          // 3X week 1, −0.2X each week after
  multHoldWeek: 3,                               // deposits were paused in week 2, so week 3 REPEATED 2.8X — every later step is a week late
  depositEnd: Date.UTC(2026, 10, 16, 1, 59),     // deposits stop earning — yakkamonworld.com's figure, NOT in the official docs or site code
  minDeposit: 5,
  // The four tiers the site actually publishes (points shown are AT the 3X opening week).
  tiers: [
    { flower: 50, pts: 150, bonus: 5 },
    { flower: 500, pts: 1500, bonus: 100 },
    { flower: 5000, pts: 15000, bonus: 2000 },
    { flower: 50000, pts: 150000, bonus: 40000 },
  ],
  actions: [
    { what: "Daily egg nurture", pts: "+6", per: "day", note: "the only repeatable free source" },
    { what: "Join Discord", pts: "+10", per: "one-off", note: "" },
    { what: "Discord post", pts: "+5", per: "post", note: "no cap stated" },
    { what: "Link X / Twitter", pts: "+10", per: "one-off", note: "" },
    { what: "Link wallet", pts: "+10", per: "one-off", note: "" },
    { what: "Referral (friend signs up)", pts: "+75", per: "friend", note: "first 5 instant, then the friend must deposit 100 FLOWER; your link works once you have 100 points" },
    { what: "Ronin free mint", pts: "+250", per: "mint", note: "1 per wave — ran 14–17 Sep 2026, sold out; credited after the mint period" },
    { what: "$FLOWER deposit", pts: "×3.0, −0.2/week", per: "FLOWER", note: "by far the biggest source (2.8× ran two weeks)" },
  ],
  /*
   * Re-cut by Yakkamon on 12 Aug 2026; names and bands below are the docs' "NFT Airdrop"
   * table as of 17 Sep 2026. The top 2,000 get one of four Genesis Legendaries (Storm is
   * new and sits ABOVE the old ladder; Echo is the old Legendary A, Ghost fills the old B
   * slot, Bloom the old C slot — widened from 501–1,000 to 501–2,000), 2,001–5,000 a Rare
   * Egg. Note what did NOT move — the line where the NFTs stop is rank 5,000, exactly as
   * before. The top 10 get a SECOND Legendary, hence 5,010 NFTs across 5,000 trainers.
   * Waves: 1–1,000 / 1,001–5,000 / 5,001–20,000 / 20,001–100,000 — where an airdrop band
   * straddles two waves it says so.
   */
  ranks: [
    { r: "1 – 3", rew: "Storm + Echo", wave: "Wave 1", nft: true },
    { r: "4 – 10", rew: "Storm + Ghost", wave: "Wave 1", nft: true },
    { r: "11 – 50", rew: "Storm", wave: "Wave 1", nft: true },
    { r: "51 – 250", rew: "Echo", wave: "Wave 1", nft: true },
    { r: "251 – 500", rew: "Ghost", wave: "Wave 1", nft: true },
    { r: "501 – 2 000", rew: "Bloom", wave: "Wave 1–2", nft: true },
    { r: "2 001 – 5 000", rew: "Rare Egg", wave: "Wave 2", nft: true },
    { r: "5 001 +", rew: "no egg at all — early access only", wave: "Wave 3–4", nft: false },
    { r: "100 001 +", rew: "nothing — not even early access", wave: "—", nft: false },
  ],
  // What the previous ladder (read 8 Aug) gave the same ranks, so the page can show what
  // actually moved rather than just asserting "they changed it".
  ranksWas: [
    { r: "1 – 100", rew: "Legendary A" },
    { r: "101 – 500", rew: "Legendary B" },
    { r: "501 – 1 000", rew: "Legendary C" },
    { r: "1 001 – 5 000", rew: "Rare Egg" },
    { r: "5 001 – 100 000", rew: "early access only" },
  ],
  // The WEEKLY reward track — resets every 7 days, unclaimed tiers are lost ("each new
  // reward list replaces the last"). Read off the live site 10 Aug 2026.
  track: [
    { pts: 10, rew: "Bronze loot box" },
    { pts: 20, rew: "Reserved slot" },
    { pts: 30, rew: "Raffle ticket" },
    { pts: 75, rew: "Silver resource box" },
    { pts: 150, rew: "Raffle ticket" },
    { pts: 500, rew: "Gold food box" },
    { pts: 5000, rew: "Platinum resource box" },
    { pts: 50000, rew: "OG status" },
  ],
  eggs: [
    { r: "1 – 10 000", egg: "Platinum" }, { r: "10 001 – 25 000", egg: "Gold" },
    { r: "25 001 – 50 000", egg: "Silver" }, { r: "50 001 – 100 000", egg: "Bronze" },
    { r: "100 001 – 500 000", egg: "Basic" },
  ],
};
/** Week index (1-based) of the deposit programme for a given time. */
export function ykWeekAt(ms) { return Math.max(1, Math.floor((ms - YK.depositStart) / (7 * 86400000)) + 1); }
/** Multiplier for week n: 3.0, 2.8, 2.8 (held), 2.6 … "until it rests at 1X" — so week 12 (26 Oct) onward is 1×. */
export function ykMult(week) { return Math.max(1, YK.multStart - YK.multStepPerWeek * (week - 1 - (week >= YK.multHoldWeek ? 1 : 0))); }
/*
 * Bulk bonus. The site lists it at four amounts only — per FLOWER 0.1 / 0.2 / 0.4 / 0.8,
 * doubling per 10x — and we used to read the gaps as a smooth doubling curve. The live
 * board says otherwise: it is a STEP function, flat between the published amounts.
 * Checked against six deposits readable on the leaderboard (12 Aug 2026), the stepped
 * model reproduces every one to the point, the curve misses four of them:
 *
 *   deposit   observed   stepped   curve
 *    50,000    190,000   190,000   190,000
 *    18,000     61,200    61,200    64,588   ← 18,000 × 3.4 exactly
 *    10,000     34,000    34,000    34,928
 *     6,000     20,400    20,400    20,535
 *     5,400     18,360    18,360    18,411
 *     5,000     17,000    17,000    17,000
 *
 * Two consequences worth knowing before you deposit: the effective rate is FLAT between
 * thresholds (5,000 and 49,999 both earn 3.4× in week 1, so the extra 45,000 buys rank
 * and nothing else), and crossing one is a CLIFF — 49,999 earns 169,996 points while
 * 50,000 earns 190,000, so a single FLOWER is worth 20,004 points at that edge.
 * Below 50 the site publishes no bonus at all, so it is zero.
 */
export function ykBonus(flower) {
  if (!(flower > 0)) return 0;
  const rate = flower >= 50000 ? 0.8 : flower >= 5000 ? 0.4 : flower >= 500 ? 0.2 : flower >= 50 ? 0.1 : 0;
  return Math.floor(flower * rate + 1e-9);
}
// points = floor(FLOWER × multiplier) + floor(FLOWER × bonus) — each floored on its own, like the
// site's depositPoints. The 1e-9 keeps 50 × 2.2 = 109.99999999999999 from losing a point.
export function ykPoints(flower, week) {
  const base = Math.floor(flower * ykMult(week) + 1e-9);
  const bonus = ykBonus(flower);
  return { base, bonus, total: base + bonus, perFlower: flower > 0 ? (base + bonus) / flower : 0 };
}

/** Smallest deposit in week `w` that reaches `target` points (binary search on ykPoints). */
export function ykNeedFor(target, week) {
  let lo = 0, hi = 1e9;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; ykPoints(m, week).total < target ? lo = m : hi = m; }
  return hi;
}

/*
 * What a placing COSTS over time: the MEDIAN of the per-interval rates, not a least-squares line.
 * These thresholds do not drift, they STEP: one deposit lands and #10 jumps 50,000 points in a single
 * build, then sits still for a day. A regression reads that step as a trend; the median ignores a
 * lone jump the way it ignores a lone flat spell, and the min..max range is reported beside it so a
 * spiky series cannot masquerade as a smooth one.
 */
export function ykTrend(hist, key) {
  const pts = hist.filter((r) => isFinite(r[key])).sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const rates = [];
  for (let i = 1; i < pts.length; i++) {
    const days = (pts[i].t - pts[i - 1].t) / 86400000;
    if (days > 0) rates.push((pts[i][key] - pts[i - 1][key]) / days);
  }
  if (!rates.length) return null;
  const s = rates.slice().sort((a, b) => a - b);
  const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  const last = pts[pts.length - 1];
  return {
    slope: mid, lo: s[0], hi: s[s.length - 1], n: pts.length, k: rates.length, cur: last[key],
    at: (tms) => last[key] + mid * (tms - last.t) / 86400000,
  };
}
/*
 * SMALL MULTIPLES — one panel per tier, each on its OWN linear axis.
 *
 * The first version put all four on one plot with #3 pushed to a second y-scale. That is the
 * single worst thing you can do to a chart: two scales on one plot align arbitrarily, so #3
 * — which had moved 39 points — was drawn climbing across the whole panel as if it had
 * exploded, while #50 and #100 were crushed into one flat line at the bottom of the other
 * scale. The series span 17k to 380k; no single axis can hold them and no second axis is
 * allowed to fake it. A log scale was considered and rejected: it makes every line look
 * equally sedate, which is the opposite of the question being asked.
 *
 * So: four panels, one series each, each y-range zoomed to its own data, one shared time
 * axis at the bottom. Identity comes from the panel title, not from colour, so colour is
 * secondary encoding here — the hues are still a validated set (chroma, CVD-separation,
 * normal-vision and contrast all pass against this surface).
 */
