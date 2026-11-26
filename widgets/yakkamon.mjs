// YAKKAMON (Thought Farm's second game) as widgets. No farm needed: the live data (signup counter,
// top-100 leaderboard, FLOWER and BTC prices), the leaderboard history and the planner/calculator
// settings the page saved all come from the page through ctx:
//   { live, liveErr, hist, histFile, settings: { amount, week, roiDays, lockDays, btc, launchWeeks,
//     ptsPerWeek, trackWeeks, farmMode, farmPerDay, farmAuto }, flower: FLOWER icon HTML, now }
// The rules (multiplier, bulk bonus, points, the trend) are core/yakkamon.mjs.
import { YK, ykWeekAt, ykMult, ykPoints, ykNeedFor, ykTrend } from "../core/yakkamon.mjs";
import { bar } from "../ui/viz.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n, d) => (+n).toLocaleString("en-US", { maximumFractionDigits: d === undefined ? 0 : d });
const nowOf = (ctx) => ctx.now || Date.now();
const fl = (ctx) => ctx.flower || "FLOWER";
const note = (html, tone = "") => `<p class="v-yakkamon-note${tone ? ` v-yakkamon-${tone}` : ""}">${html}</p>`;
// a tile: label, a big value (trusted HTML), a line under it; tone colours the value
const tile = (label, value, sub = "", tone = "") =>
  `<div class="v-kpi v-yakkamon-tile"><span>${label}</span><b${tone ? ` class="v-yakkamon-${tone}"` : ""}>${value}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
const tiles = (list) => `<div class="v-kpis">${list.join("")}</div>`;
const noFarm = () => ({});
// A copy's own number, else the page's saved one.
const own = (opts, key, page) => (opts[key] !== undefined && opts[key] !== null && opts[key] !== "" && Number.isFinite(Number(opts[key])) ? Number(opts[key]) : page);

// ── live: your trainer number + the public top 100 ──────────────────────────────────────────
export const ykLive = {
  type: "yk-live",
  title: "🔴 Live — what number you'd be",
  page: "yakkamon",
  needs: noFarm,
  view(_, ctx = {}) {
    const live = ctx.live;
    const su = live && live.signups, bd = live && live.board;
    if (!su) return { empty: ctx.liveErr ? `Could not load live data (${ctx.liveErr}). Try ↻.` : "Loading live data from api.yakkamon.com…" };
    const now = nowOf(ctx);
    const open = now >= YK.depositStart;
    const next = (su.claimed || 0) + 1;
    const tier = su.tier || "?";
    const gone = (su.tiers || []).filter((t) => (su.claimed || 0) >= t.until).map((t) => t.name);
    let h = tiles([
      tile("Already signed up", fmt(su.claimed), `of ${fmt(su.total)} total`, "acc"),
      tile("You'd be", `#${fmt(next)}`, `→ <b>${esc(tier)}</b>`, "ok"),
      tile(`${esc(tier)} eggs left`, fmt(su.remaining), `tier ends at #${fmt(su.tierUntil)}`, "acc"),
    ]);
    h += note(`<b>Yes — you can tell your number.</b> After signing up their dashboard shows <b>&ldquo;TRAINER #N&rdquo;</b>, which is exactly your position. And you can work it out in advance from here: <b>${fmt(su.claimed)}</b> trainers are registered right now, so you would land around <b>#${fmt(next)}</b>.`);
    if (gone.length) h += note(`⚠ Already gone: <b>${gone.map(esc).join(", ")}</b> — too late for those tiers.`, "warn");
    h += note(`The egg tier is the <b>only</b> thing sign-up order affects. Early access and the NFTs are decided <b>on points</b>, not on when you registered.`, "dim");
    if (bd && bd.entries && bd.entries.length) {
      const e = bd.entries, at = (r) => (e.find((x) => x.rank === r) || {}).points;
      const mult = ykMult(Math.max(1, ykWeekAt(now)));
      const flowerFor = (p) => (p ? Math.ceil(p / mult) : null);
      // The egg-tier boundaries inside the public top 100 — the only ranks where a point changes what you win.
      const bounds = [[1, "Storm + Echo"], [3, "last Storm + Echo"], [4, "Storm + Ghost"], [10, "last Storm + Ghost"], [11, "Storm"], [50, "last Storm"], [51, "Echo"], [100, "Echo"]];
      const top = at(1) || 1;
      const gap50 = (at(50) || 0) - (at(51) || 0);
      const ageH = bd.generatedAt ? (now - bd.generatedAt) / 3600000 : 0;
      h += `<h4 class="v-yakkamon-h">Live leaderboard <span class="v-dim">— ${fmt(bd.playerCount)} players with points, top ${esc(bd.size)} is public</span></h4>`;
      if (bd.generatedAt) {
        h += note(`<b>⏱ This board is ${ageH.toFixed(1)} h old</b> (built ${new Date(bd.generatedAt).toISOString().replace("T", " ").slice(0, 16)} UTC). It is rebuilt <b>every 4 hours on the UTC clock</b> — 01:00, 05:00, 09:00, 13:00, 17:00, 21:00 — so it is never more than 4 h behind, but it is not live to the minute either. Deposits from the last few hours are <b>not in these numbers</b>, and if you are timing a deposit against a multiplier deadline, everyone else doing the same will be invisible here until the next rebuild.`, ageH > 3 ? "warn" : "dim");
      }
      h += `<table class="w-table"><thead><tr><th>rank</th><th>wins</th><th></th><th style="text-align:right">points now</th><th style="text-align:right">≈ FLOWER to match</th></tr></thead><tbody>` +
        bounds.map(([r, what]) => {
          const p = at(r);
          return `<tr><td><b>#${r}</b></td><td class="v-dim">${esc(what)}</td><td>${p ? bar((p / top) * 100, "ok") : ""}</td>` +
            `<td style="text-align:right"><b class="v-yakkamon-acc">${p ? fmt(p) : "—"}</b></td>` +
            `<td style="text-align:right" class="v-yakkamon-ok">${p ? `${fmt(flowerFor(p))} ${fl(ctx)}` : "—"}</td></tr>`;
        }).join("") + `</tbody></table>`;
      if (gap50 > 0) h += note(`<b>The Storm cut-off is razor thin.</b> #50 and #51 are <b>${fmt(gap50)} points</b> apart — about <b>${fmt(Math.ceil(gap50 / mult))} ${fl(ctx)}</b> at today's multiplier. That is the whole difference between the top egg and the one below it.`, "warn");
      h += note(`FLOWER column = how much would buy that many points <b>today</b> at the current ${mult.toFixed(1)}× multiplier (bulk bonus excluded, so it is an upper estimate). <b>Careful though:</b> deposits ${open ? "are open" : "open 10 Aug"} and these numbers only go up. Treat it as a <b>floor</b>, not a target. Only the top 100 is public — the <b>#250 / #500 / #2,000 / #5,000</b> cut-offs, including the one where the eggs stop entirely, are not visible from here. The API caps at 100 however you page it.`, "dim");
    }
    return { html: h };
  },
};

// ── what a placing costs, over time ─────────────────────────────────────────────────────────
/*
 * SMALL MULTIPLES — one panel per tier, each on its OWN linear axis. One plot with #3 on a second
 * y-scale drew #3 (which had moved 39 points) climbing across the whole panel while #50 and #100
 * were crushed flat; a log scale makes every line look equally sedate. So: four panels, one series
 * each, each y-range zoomed to its own data, one shared time axis at the bottom. Identity comes
 * from the panel title; colour stays welded to the tier.
 */
export function ykTierSvg(hist) {
  const tiers = [
    { key: "p3", label: "#3", what: "Legendary A + Legendary B", color: "#B07CD8" },
    { key: "p10", label: "#10", what: "Legendary A + Legendary C", color: "#e0b34a" },
    { key: "p50", label: "#50", what: "Legendary A", color: "#6aa7e0" },
    { key: "p100", label: "#100", what: "last Legendary B", color: "#d97757" },
  ];
  const W = 1000, PH = 118, GAP = 30, L = 104, R = 150, TOP = 34, AXIS = 30;
  const H = tiers.length * (PH + GAP) + AXIS;
  const t0 = hist[0].t, t1 = hist[hist.length - 1].t, span = Math.max(1, t1 - t0);
  const X = (t) => L + ((t - t0) / span) * (W - L - R);
  const fmtN = (v) => Math.round(v).toLocaleString("en-US");
  const when = (t) => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2, "0")}. ${String(d.getUTCHours()).padStart(2, "0")}:00`; };
  let s = `<svg viewBox="0 0 ${W} ${H}" class="v-yakkamon-svg" role="img" aria-label="Tier point thresholds over time, one panel per tier">`;
  tiers.forEach((tier, i) => {
    const pts = hist.filter((r) => isFinite(r[tier.key]));
    if (pts.length < 2) return;
    const top = TOP + i * (PH + GAP), bot = top + PH - 26;
    const vs = pts.map((r) => r[tier.key]);
    let lo = Math.min(...vs), hi = Math.max(...vs);
    // A dead-flat series still needs a band, or it divides by zero and draws on the edge.
    if (hi - lo < 1e-9) { const p = Math.max(1, Math.abs(hi) * 0.002); lo -= p; hi += p; }
    else { const p = (hi - lo) * 0.18; lo -= p; hi += p; }
    const Y = (v) => bot - ((v - lo) / (hi - lo)) * (bot - top);
    const last = pts[pts.length - 1][tier.key];
    const delta = last - pts[0][tier.key];
    s += `<text x="0" y="${top - 16}" fill="var(--c-text)" font-size="15" font-weight="600">${tier.label}</text>`;
    s += `<text x="${tier.label.length * 10 + 14}" y="${top - 16}" fill="var(--c-dim)" font-size="12">${esc(tier.what)}</text>`;
    for (const v of [hi, lo]) s += `<line x1="${L}" y1="${Y(v).toFixed(1)}" x2="${W - R}" y2="${Y(v).toFixed(1)}" stroke="var(--c-line)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    s += `<text x="${L - 8}" y="${(Y(hi) + 4).toFixed(1)}" text-anchor="end" fill="var(--c-dim)" font-size="12">${fmtN(hi)}</text>`;
    s += `<text x="${L - 8}" y="${(Y(lo) + 4).toFixed(1)}" text-anchor="end" fill="var(--c-dim)" font-size="12">${fmtN(lo)}</text>`;
    s += `<polyline fill="none" stroke="${tier.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" points="${pts.map((r) => `${X(r.t).toFixed(1)},${Y(r[tier.key]).toFixed(1)}`).join(" ")}"/>`;
    for (const r of pts) {
      s += `<circle cx="${X(r.t).toFixed(1)}" cy="${Y(r[tier.key]).toFixed(1)}" r="4" fill="${tier.color}" stroke="var(--c-card)" stroke-width="2"><title>${when(r.t)} UTC — ${fmtN(r[tier.key])} pts${r.derived ? " (timestamp reconstructed)" : ""}</title></circle>`;
    }
    s += `<text x="${W - R + 12}" y="${(Y(last) + 1).toFixed(1)}" fill="${tier.color}" font-size="15" font-weight="600">${fmtN(last)}</text>`;
    s += `<text x="${W - R + 12}" y="${(Y(last) + 17).toFixed(1)}" fill="${delta > 0 ? "var(--c-yellow)" : "var(--c-dim)"}" font-size="12">${delta >= 0 ? "+" : ""}${fmtN(delta)} in ${((t1 - t0) / 3600000).toFixed(0)} h</text>`;
  });
  const ticks = [t0, t0 + span / 2, t1];
  const ay = H - AXIS + 14;
  s += `<line x1="${L}" y1="${ay - 12}" x2="${W - R}" y2="${ay - 12}" stroke="var(--c-line)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  ticks.forEach((t, k) => {
    const anchor = k === 0 ? "start" : k === ticks.length - 1 ? "end" : "middle";
    s += `<text x="${X(t).toFixed(1)}" y="${ay + 2}" text-anchor="${anchor}" fill="var(--c-dim)" font-size="12">${when(t)}</text>`;
  });
  return s + `</svg>`;
}

export const ykPlacing = {
  type: "yk-placing",
  title: "📈 What a placing costs — over time",
  page: "yakkamon",
  needs: noFarm,
  view(_, ctx = {}) {
    const hist = Array.isArray(ctx.hist) ? ctx.hist : [];
    const now = nowOf(ctx);
    const spanH = hist.length > 1 ? (hist[hist.length - 1].t - hist[0].t) / 3600000 : 0;
    const obs = hist.filter((r) => !r.derived).length;
    const file = ctx.histFile || 0;
    const mult = ykMult(Math.max(1, ykWeekAt(now)));
    let h = note(`Yakkamon publishes no history, so this is <b>our own</b>. A cron records every build 10 minutes after it lands; opening this page records the one it sees too, so a missed fire leaves no hole. <b>${hist.length}</b> snapshot${hist.length === 1 ? "" : "s"} over <b>${spanH.toFixed(0)} h</b> — ${file} from the committed record, ${Math.max(0, hist.length - file)} seen in this browser${hist.length - obs > 0 ? `, ${hist.length - obs} with a reconstructed timestamp` : ""}. Builds land every 4 h; times below are UTC.`, "dim");
    if (hist.length < 2) return { html: h + note("Not enough snapshots yet — the trend appears once a second build has been seen.", "dim") };
    h += `<div class="v-yakkamon-chart">${ykTierSvg(hist)}</div>`;
    const in7 = now + 7 * 86400000;
    const m7 = ykMult(ykWeekAt(in7));
    // Same stepped bonus the calculator uses: solve which step the deposit lands on.
    const flowerFor = (p, m) => { for (const [f, b] of [[50000, 0.8], [5000, 0.4], [500, 0.2], [50, 0.1]]) { const v = p / (m + b); if (v >= f) return v; } return p / m; };
    h += `<table class="w-table"><thead><tr><th>hold</th><th style="text-align:right">now</th><th style="text-align:right">median/day</th><th style="text-align:right">range</th><th style="text-align:right">in 7 days</th><th style="text-align:right">≈ FLOWER then</th></tr></thead><tbody>`;
    for (const [rank, lbl, what] of [[10, "#10", "Storm + Ghost"], [50, "#50", "Storm"]]) {
      const fit = ykTrend(hist, "p" + rank);
      if (!fit) continue;
      const p7 = Math.max(0, fit.at(in7));
      h += `<tr><td><b class="v-yakkamon-acc">${lbl}</b> <span class="v-dim">${what}</span></td>` +
        `<td style="text-align:right"><b>${fmt(Math.round(fit.cur))}</b></td>` +
        `<td style="text-align:right" class="${fit.slope > 0 ? "v-yakkamon-warn" : "v-yakkamon-ok"}">${fit.slope >= 0 ? "+" : ""}${fmt(Math.round(fit.slope))}</td>` +
        `<td style="text-align:right" class="v-dim">${fmt(Math.round(fit.lo))} … ${fmt(Math.round(fit.hi))}</td>` +
        `<td style="text-align:right">${fmt(Math.round(p7))}</td>` +
        `<td style="text-align:right" class="v-yakkamon-ok">${fmt(Math.round(flowerFor(p7, m7)))} ${fl(ctx)}</td></tr>`;
    }
    h += `</tbody></table>`;
    const f50 = ykTrend(hist, "p50");
    const weak = hist.length < 6;
    h += note((weak
      ? `<b>⚠ Too few snapshots to forecast with.</b> <b>${hist.length}</b> builds over ${spanH.toFixed(0)} h gives ${(f50 && f50.k) || 0} intervals to take a median across — enough to describe the last day, not to predict the next week. These thresholds <b>step</b> rather than drift: one deposit lands and the line jumps, then sits still. Read the <b>range</b> column, not the median.`
      : `Median across ${(f50 && f50.k) || 0} intervals from ${hist.length} snapshots. The median is used rather than a fitted line because a single large deposit steps the threshold, and a regression reads that step as a trend.`) +
      ` The FLOWER column prices the projected threshold at the multiplier in force <b>that week</b> (${m7.toFixed(1)}× in 7 days, against ${mult.toFixed(1)}× now) — holding a rank later costs more than the points alone say, because the same FLOWER buys fewer of them.`, weak ? "warn" : "dim");
    return { html: h };
  },
};

// ── key facts ───────────────────────────────────────────────────────────────────────────────
export const ykFacts = {
  type: "yk-facts",
  title: "Key facts",
  page: "yakkamon",
  needs: noFarm,
  view(_, ctx = {}) {
    const now = nowOf(ctx), nowWeek = ykWeekAt(now), open = now >= YK.depositStart;
    const daysToOpen = Math.ceil((YK.depositStart - now) / 86400000);
    const facts = [
      ["Network", "Ronin", "deposits come from <b>Base</b> or <b>Ronin</b>"],
      ["Token", "$FLOWER", "<b>no new token</b> — the same one as SFL"],
      ["Early access", "Q4 2026", "4 waves by leaderboard rank: 1–1,000 · 1,001–5,000 · 5,001–20,000 · 20,001–100,000"],
      ["Deposits", "10 Aug – 16 Nov 2026*", (now >= YK.depositEnd ? "closed — deposits no longer earn points" : open ? `live — <b>week ${nowWeek}</b>, multiplier <b>${ykMult(nowWeek).toFixed(1)}×</b>` : `opens in <b>${daysToOpen} days</b>`) + "<br>*end (16 Nov 01:59 UTC) is yakkamonworld.com's figure, not in the official docs"],
      ["Free mint", "14–17 Sep 2026", "10,000 NFTs on Ronin — <b>sold out</b>; reveal 14 Oct"],
      ["Sign-up", "free, email only", "no wallet, no SFL account"],
    ];
    return { html: `<div class="v-kpis v-yakkamon-facts">${facts.map(([k, v, n]) => tile(k, v, n, "acc")).join("")}</div>` };
  },
};

// ── budget planner ──────────────────────────────────────────────────────────────────────────
/*
 * Splits a fixed budget between the ONE deposit that buys leaderboard standing (week 1, best
 * multiplier + biggest bulk bonus) and the weekly top-ups that keep claiming the reward track,
 * which resets every 7 days and so cannot be bought in advance. Ranks the outcome against the LIVE
 * board. Farm-funnel mode adds the farm's weekly output to every week's deposit (combined, because
 * the bulk bonus is rated per deposit); weeks where it alone clears the target need no top-up.
 */
function plannerSettings(ctx, opts) {
  const p = ctx.settings || {};
  const farmMode = opts.farm === "on" ? true : opts.farm === "off" ? false : !!p.farmMode;
  return {
    btc: opts.budgetSats !== undefined && opts.budgetSats !== null && opts.budgetSats !== "" ? Number(opts.budgetSats) / 1e8 : (+p.btc || 0),
    launchWeeks: own(opts, "launchWeeks", p.launchWeeks || 17),
    ptsPerWeek: own(opts, "ptsPerWeek", p.ptsPerWeek ?? 5000),
    trackWeeks: own(opts, "trackWeeks", p.trackWeeks ?? 8),
    farmMode, farmPerDay: own(opts, "farmPerDay", +p.farmPerDay || 0), roiDays: +p.roiDays || 120,
  };
}

export const ykPlanner = {
  type: "yk-planner",
  title: "🎯 Budget planner",
  titleFor: (o) => (o.budgetSats != null && o.budgetSats !== "" ? `🎯 Budget planner · ${fmt(o.budgetSats / 1e8, 4)} ₿` : "🎯 Budget planner"),
  page: "yakkamon",
  needs: noFarm,
  optionsLabel: "Plan",
  options: [
    { key: "budgetSats", label: "Budget in sats (blank = the page's)", kind: "number", min: 0 },
    { key: "launchWeeks", label: "Launch in weeks (blank = the page's)", kind: "number", min: 2, max: 30 },
    { key: "ptsPerWeek", label: "Points per week (blank = the page's)", kind: "number", min: 0 },
    { key: "trackWeeks", label: "For weeks (blank = the page's)", kind: "number", min: 0, max: 29 },
    { key: "farm", label: "Funnel the farm's output", kind: "select", choices: [["", "same as the page"], ["on", "on"], ["off", "off"]] },
    { key: "farmPerDay", label: "Farm FLOWER/day (blank = the page's)", kind: "number", min: 0 },
  ],
  defaults: { opts: { farm: "" } },
  rowKey: (r) => r.w,
  rowLabel: (r) => `week ${r.w}`,
  rowClass: (r) => (r.w === 1 ? "w-st-ready" : ""),
  columns: [
    { key: "w", label: "week", fmt: (v) => `<b>w${esc(v)}</b>` },
    { key: "date", label: "date", fmt: (v) => `<span class="v-dim">${new Date(v).toLocaleDateString("en-US", { day: "numeric", month: "short" })}</span>` },
    { key: "mult", label: "mult", align: "right", fmt: (v) => `<span class="v-dim">${v.toFixed(1)}×</span>` },
    { key: "split", label: "", get: (r) => r.amt, fmt: (v, r) => `<div class="v-yakkamon-split" title="${r.farm > 0 ? "budget + farm income" : "budget"}">` +
      `<i class="${r.w === 1 ? "v-yakkamon-w1" : "v-yakkamon-wk"}" style="width:${(r.max > 0 ? (r.budgetPart / r.max) * 100 : 0).toFixed(1)}%"></i>` +
      `<i class="v-yakkamon-farm" style="width:${(r.max > 0 ? (r.farm / r.max) * 100 : 0).toFixed(1)}%"></i></div>` },
    { key: "amt", label: "FLOWER", align: "right", fmt: (v, r) => `<b class="${r.w === 1 ? "v-yakkamon-ok" : "v-yakkamon-acc"}">${fmt(v)}</b>` +
      (r.farm > 0 && r.budgetPart > 0 ? `<small class="v-yakkamon-blue" style="display:block">${fmt(r.farm)} farm</small>` : "") },
    { key: "pts", label: "points", align: "right", fmt: (v) => `<span class="v-count">${fmt(v)}</span>` },
    { key: "run", label: "Σ deposited", align: "right", fmt: (v) => `<span class="v-dim">Σ ${fmt(v)}</span>` },
  ],

  build(_, ctx = {}, opts = {}) {
    const live = ctx.live || {};
    const flUsd = live.flowerUsd || 0, btcUsd = live.btcUsd || 0;
    if (!(flUsd > 0 && btcUsd > 0)) return { rows: [], footer: "", empty: ctx.liveErr ? `No live prices (${ctx.liveErr}).` : "Waiting for the live FLOWER and BTC prices…" };
    const s = plannerSettings(ctx, opts);
    const F = fl(ctx);
    const budgetUsd = s.btc * btcUsd, budget = budgetUsd / flUsd;
    const FREE_WK = 42;                                  // daily nurture 6×7, earned without depositing
    const TRACK_TOP = Math.max(0, s.ptsPerWeek);
    const boxW = Math.min(s.trackWeeks, s.launchWeeks - 1);
    const tierHit = YK.track.filter((t) => t.pts <= TRACK_TOP).slice(-1)[0] || null;
    const tierNext = YK.track.find((t) => t.pts > TRACK_TOP) || null;
    const farmWk = s.farmMode ? Math.max(0, s.farmPerDay) * 7 : 0;
    let weekly = 0;
    const topUp = {};
    for (let w = 2; w <= boxW + 1; w++) {
      const fromFarm = ykPoints(farmWk, w).total + FREE_WK;
      if (fromFarm >= TRACK_TOP) { topUp[w] = 0; continue; }
      const extra = Math.max(0, ykNeedFor(TRACK_TOP - FREE_WK, w) - farmWk);
      topUp[w] = extra;
      weekly += extra;
    }
    const w1 = budget - weekly;
    const tranches = [];
    for (let w = 1; w <= s.launchWeeks; w++) {
      const budgetPart = w === 1 ? Math.max(0, w1) : (topUp[w] || 0);
      const amt = budgetPart + farmWk;
      if (amt <= 0) continue;
      tranches.push({ w, amt, farm: farmWk, budgetPart, pts: ykPoints(amt, w).total });
    }
    const cum = tranches.reduce((a, t) => a + t.pts, 0) + FREE_WK * s.launchWeeks;
    const farmTotal = farmWk * s.launchWeeks;
    const ent = (live.board && live.board.entries) || [];
    const beat = ent.filter((e) => e.points > cum).length;
    const rankTxt = !ent.length ? "—" : (beat === 0 ? "above #1 (today's top)" : beat >= ent.length ? "outside top " + ent.length : "≈ #" + (beat + 1));
    let summary = note(`Budget: <b class="v-yakkamon-acc">${fmt(budget)} ${F}</b> <span class="v-dim">(${fmt(budgetUsd)} USD · BTC ${fmt(btcUsd)} · FLOWER ${flUsd.toFixed(4)})</span>`) +
      note(`Weekly track tier: ${tierHit
        ? `<b class="v-yakkamon-ok">${esc(tierHit.rew)}</b> at ${fmt(tierHit.pts)} pts${tierNext ? ` · next up <b>${esc(tierNext.rew)}</b> needs ${fmt(tierNext.pts)}` : ""}`
        : `<span class="v-yakkamon-warn">below the lowest tier (${fmt(YK.track[0].pts)} pts = ${esc(YK.track[0].rew)})</span>`} — the track resets every 7 days and unclaimed tiers are lost, which is why it has to be bought again each week.`, "dim");
    if (s.farmMode && farmWk > 0) summary += note(`Farm funnel: adds <b class="v-yakkamon-ok">${fmt(farmWk)} ${F}/week</b>, <b>${fmt(farmTotal)}</b> over ${s.launchWeeks} weeks — deposited together with that week's top-up, since the bulk bonus is rated per deposit.`, "dim");
    if (w1 < 0) {
      summary += note(`⚠ Does not fit — the weekly top-ups alone (${boxW} weeks × ${fmt(TRACK_TOP)} pts) cost <b>${fmt(weekly)} ${F}</b>, more than the whole budget. Lower the target or the number of weeks.`, "bad");
      return { rows: [], summary, footer: "", empty: "No deposit schedule fits this budget." };
    }
    summary += tiles([
      tile("Week 1 deposit", `${fmt(w1)} ${F}`, `${fmt(ykPoints(w1, 1).total)} points`, "ok"),
      tile(`Weekly (${boxW}×)`, `${fmt(weekly)} ${F}`, `${boxW}× ${fmt(TRACK_TOP)} pts${tierHit ? ` (${esc(tierHit.rew)})` : ""}${s.farmMode && farmWk > 0 ? ` · ${Object.values(topUp).filter((v) => v === 0).length} covered by farm` : ""}`, "acc"),
      ...(s.farmMode && farmWk > 0 ? [tile(`From farm (${s.launchWeeks}w)`, `${fmt(farmTotal)} ${F}`, `${fmt(farmWk)}/week, not from BTC`, "blue")] : []),
      tile("Cumulative", `${fmt(cum)} pts`, `today ${rankTxt}`, "ok"),
    ]);
    summary += `<h4 class="v-yakkamon-h">Tranches — when and how much to send <span class="v-dim">(${tranches.length} deposits · Σ ${fmt(budget)} ${F})</span></h4>`;
    const max = Math.max(...tranches.map((t) => t.amt), 0);
    let run = 0;
    const rows = tranches.map((t) => ({ ...t, max, run: (run += t.amt), date: YK.depositStart + (t.w - 1) * 7 * 86400000, mult: ykMult(t.w) }));
    const footer = note(`The green tranche is the one-off deposit that buys leaderboard standing (best multiplier + biggest bulk bonus). The amber ones are weekly top-ups to your ${fmt(TRACK_TOP)}-point target — they <b>get more expensive</b> as the multiplier decays toward 1×, which is why the last tranche is the fattest. Splitting the big deposit would cost you bonus, because it is rated <b>per deposit</b>.${s.farmMode && farmWk > 0 ? ` <b class="v-yakkamon-blue">Blue</b> is farm income funnelled in — it arrives every week whether you top up or not, so weeks where the farm alone clears ${fmt(TRACK_TOP)} points cost the budget nothing.` : ""}`, "dim") +
      note(`Every week of boxes takes from week 1 and therefore from your cumulative points — the track and the leaderboard compete for the same money. The placing is against the <b>live top ${ent.length || "?"}</b>, which is a snapshot: deposits opened ${nowOf(ctx) >= YK.depositStart ? "just now" : "10 Aug"} and the bar will rise. Forgone yield on the whole budget at a ${s.roiDays}-day payback over ${s.launchWeeks * 7} days ≈ <b class="v-yakkamon-bad">${fmt(budget * (s.launchWeeks * 7) / s.roiDays)} ${F}</b>.`, "dim");
    return { rows, summary, footer, empty: "Nothing to deposit." };
  },
};

// ── deposit calculator ──────────────────────────────────────────────────────────────────────
function calcSettings(ctx, opts) {
  const p = ctx.settings || {};
  return {
    amount: own(opts, "amount", p.amount ?? 500),
    week: Math.max(1, Math.min(15, own(opts, "week", p.week || 1))),
    roiDays: own(opts, "roiDays", p.roiDays || 120) || 120,
    lockDays: own(opts, "lockDays", p.lockDays || 120) || 120,
  };
}
const stepRate = (a) => (a >= 50000 ? 0.8 : a >= 5000 ? 0.4 : a >= 500 ? 0.2 : a >= 50 ? 0.1 : 0);

export const ykCalculator = {
  type: "yk-calculator",
  title: "💰 Deposit calculator",
  titleFor: (o) => (o.amount != null && o.amount !== "" ? `💰 Deposit ${fmt(o.amount)} FLOWER${o.week ? ` · week ${o.week}` : ""}` : "💰 Deposit calculator"),
  page: "yakkamon",
  needs: noFarm,
  optionsLabel: "Deposit",
  options: [
    { key: "amount", label: "Deposit FLOWER (blank = the page's)", kind: "number", min: 0 },
    { key: "week", label: "Week (blank = the page's)", kind: "number", min: 1, max: 15 },
    { key: "roiDays", label: "Your buy payback, days (blank = the page's)", kind: "number", min: 1 },
    { key: "lockDays", label: "Locked for, days (blank = the page's)", kind: "number", min: 1 },
  ],
  defaults: {},
  rowKey: (r) => r.k,
  rowLabel: (r) => r.label,
  rowClass: (r) => (r.k === "total" ? "w-st-ready" : ""),
  columns: [
    { key: "label", label: "part", fmt: (v, r) => (r.k === "total" ? `<b>${esc(v)}</b>` : esc(v)) },
    { key: "share", label: "", get: (r) => r.share, fmt: (v, r) => bar(v, r.k === "bonus" ? "mid" : "ok") },
    { key: "pts", label: "points", align: "right", fmt: (v, r) => `<b class="${r.k === "bonus" ? "v-yakkamon-acc" : "v-yakkamon-ok"}">${r.k === "bonus" ? "+" : ""}${fmt(v)}</b>` },
  ],

  build(_, ctx = {}, opts = {}) {
    const s = calcSettings(ctx, opts);
    const F = fl(ctx);
    const mult = ykMult(s.week);
    const p = ykPoints(s.amount, s.week);
    const exactTier = YK.tiers.find((t) => t.flower === s.amount);
    const rateNow = stepRate(s.amount);
    const nextStep = [50, 500, 5000, 50000].find((x) => x > s.amount) || null;
    const cliffGain = nextStep ? ykPoints(nextStep, s.week).total - p.total : 0;
    // Opportunity cost: the same FLOWER in the farm pays back in roiDays; locked for lockDays it forgoes that much.
    const forgone = s.amount * (s.lockDays / s.roiDays);
    const costPerKpt = p.total > 0 ? (forgone / p.total) * 1000 : 0;
    const share = (v) => (p.total > 0 ? (v / p.total) * 100 : 0);
    const rows = [
      { k: "base", label: `Base (${s.amount} × ${mult.toFixed(1)})`, pts: p.base, share: share(p.base) },
      { k: "bonus", label: "Bulk bonus", pts: p.bonus, share: share(p.bonus) },
      { k: "total", label: "Total", pts: p.total, share: 100 },
    ];
    const summary = tiles([
      tile("Deposit", `${fmt(s.amount)} ${F}`, `minimum ${YK.minDeposit} $FLOWER`, "acc"),
      tile(`Week ${s.week}`, `${mult.toFixed(1)}×`, "week 1 = 10–16 Aug 2026"),
      tile("Total", `${fmt(p.total)} pts`, `${p.perFlower.toFixed(2)} pts per 1 FLOWER`, "ok"),
      tile("Forgone yield", `${fmt(forgone, 1)} ${F}`, `${fmt(costPerKpt, 2)} per 1,000 points`, "bad"),
    ]);
    let footer = note(exactTier
      ? `✓ Exactly as published (${fmt(exactTier.flower)} → +${fmt(exactTier.pts)} pts, +${fmt(exactTier.bonus)} bonus at 3×).`
      : `The bulk bonus is a <b>step, not a slope</b> — it is <b>flat between</b> the four published amounts (50 / 500 / 5,000 / 50,000). Measured against six deposits readable on the live board: 18,000 → 61,200 (×3.4 exactly), 10,000 → 34,000, 6,000 → 20,400, 5,400 → 18,360 — the stepped model hits every one, a smooth curve misses four. ${rateNow ? `You are on the <b>+${(rateNow * 100).toFixed(0)}%</b> step` : `Below 50 ${F} there is <b>no bonus at all</b>`}${nextStep ? `, and the rate does not move again until <b>${fmt(nextStep)}</b>.` : " — the top step; it does not rise again."}`, exactTier ? "ok" : "warn");
    if (nextStep) {
      const r = cliffGain / Math.max(1, nextStep - s.amount);
      footer += note(`<b>⛰ Next cliff:</b> adding <b>${fmt(nextStep - s.amount)} ${F}</b> to reach <b>${fmt(nextStep)}</b> is worth <b>+${fmt(cliffGain)} points</b> — ${r >= 100 ? fmt(Math.round(r)) : r.toFixed(1)} pts per extra FLOWER, against ${p.perFlower.toFixed(1)} on what you have entered. Stopping just short of a step is the one genuinely bad way to deposit.`, "ok");
    }
    footer += note(`⚠ <b>The bonus is rated on EACH deposit separately</b> (&ldquo;rated per deposit&rdquo; — the full amount must land in one go). Splitting the same sum into several smaller deposits therefore earns <b>far fewer</b> points: each piece falls into its own lower bonus rate. The multiplier also drops 0.2× per week <b>until it rests at 1×</b> (from week 12).`, "warn");
    footer += `<h4 class="v-yakkamon-h">What it costs you <span class="v-dim">— you get the FLOWER back, but it earns nothing meanwhile</span></h4>` +
      note(`Forgone yield: <b class="v-yakkamon-bad">${fmt(forgone, 1)} FLOWER</b> <span class="v-dim">(${fmt(s.amount)} × ${s.lockDays}d ÷ ${s.roiDays}d)</span><br>` +
        `Cost per 1,000 points: <b class="v-yakkamon-acc">${fmt(costPerKpt, 2)} FLOWER</b><br>` +
        `For this to pay off, the NFT + early access must be worth at least <b class="v-yakkamon-acc">${fmt(forgone, 1)} FLOWER</b> to you.`) +
      note(`Take &ldquo;payback&rdquo; from ROADMAP → buy path (the ROI column) — how many days the best purchase available to you right now takes to repay. That is the rate you give up. &ldquo;Locked for&rdquo; = from the deposit until you get access (Q4 2026) — withdrawals are <b>not possible during pre-registration</b>.`, "dim");
    return { rows, summary, footer, empty: "" };
  },
};

// ── the published tables ────────────────────────────────────────────────────────────────────
export const ykTiers = {
  type: "yk-tiers",
  title: "Published deposit tiers",
  page: "yakkamon",
  needs: noFarm,
  defaults: {},
  rowKey: (r) => r.flower,
  rowLabel: (r) => `${fmt(r.flower)} FLOWER`,
  columns: [
    { key: "flower", label: "deposit", fmt: (v, r) => `<b>${fmt(v)}</b> ${r.icon}` },
    { key: "pts", label: "points", align: "right", fmt: (v) => `<span class="v-yakkamon-ok">+${fmt(v)}</span>` },
    { key: "bonus", label: "bonus", align: "right", fmt: (v) => `<span class="v-yakkamon-acc">+${fmt(v)}</span>` },
    { key: "total", label: "total", align: "right", fmt: (v) => `<b class="v-yakkamon-ok">${fmt(v)}</b>` },
    { key: "per", label: "pts / FLOWER", align: "right", fmt: (v) => `<b class="v-yakkamon-acc">${v.toFixed(2)}</b>` },
    { key: "bar", label: "", get: (r) => r.per, fmt: (v, r) => bar((v / r.maxPer) * 100, "ok") },
  ],
  build(_, ctx = {}) {
    const now = nowOf(ctx), nowWeek = ykWeekAt(now), open = now >= YK.depositStart;
    const per = (t) => (t.pts + t.bonus) / t.flower;
    const maxPer = Math.max(...YK.tiers.map(per));
    const rows = YK.tiers.map((t) => ({ ...t, total: t.pts + t.bonus, per: per(t), maxPer, icon: fl(ctx) }));
    const summary = note(`Exactly as yakkamon.com states them (values are for the <b>opening week, 3×</b>). Note the last column — the more you send, the more points <b>per single</b> FLOWER.`, "dim");
    const footer = note(`<b>The multiplier decays:</b> ${[1, 2, 3, 4, 5, 6, 8, 12].map((w) => `w${w} <b class="${w === nowWeek && open ? "v-yakkamon-acc" : ""}">${ykMult(w).toFixed(1)}×</b>`).join(" · ")} — −0.2× per week (week 3 repeated 2.8× after a deposit pause), <b>from week 12 (26 Oct) it is just 1×</b> and stops falling. Waiting costs you points: the same deposit in week 6 earns only <b>${(ykMult(6) / ykMult(1) * 100).toFixed(0)}%</b>, and from week 12 only <b>${(ykMult(12) / ykMult(1) * 100).toFixed(0)}%</b> of the base points it would in week 1.`, "dim") +
      note(`<b>What that means for splitting deposits:</b> because the bonus is rated per deposit and the multiplier falls, <b>one big deposit as early as possible</b> beats the same sum spread over weeks by a wide margin. Spreading ~96,000 ${fl(ctx)} out to year end earns roughly <b>40% fewer points</b> than the same sum landing in one go in week 1.`);
    return { rows, summary, footer, empty: "" };
  },
};

export const ykSources = {
  type: "yk-sources",
  title: "All point sources",
  page: "yakkamon",
  needs: noFarm,
  defaults: {},
  rowKey: (r) => r.what,
  rowLabel: (r) => r.what,
  columns: [
    { key: "what", label: "source" },
    { key: "pts", label: "points", align: "right", fmt: (v) => `<b class="v-yakkamon-ok" style="white-space:nowrap">${esc(v)}</b>` },
    { key: "per", label: "per", fmt: (v) => `<span class="v-dim" style="white-space:nowrap">/ ${esc(v)}</span>` },
    { key: "note", label: "note", fmt: (v) => `<span class="v-dim">${esc(v)}</span>` },
  ],
  build() { return { rows: YK.actions.slice(), footer: "", empty: "" }; },
};

export const ykRanks = {
  type: "yk-ranks",
  title: "Rewards by rank (points)",
  page: "yakkamon",
  needs: noFarm,
  defaults: {},
  rowKey: (r) => r.r,
  rowLabel: (r) => r.r,
  rowClass: (r) => (r.nft ? "" : "w-st-done"),
  columns: [
    { key: "r", label: "rank", fmt: (v) => `<b style="white-space:nowrap">${esc(v)}</b>` },
    { key: "rew", label: "reward", fmt: (v, r) => (r.nft ? `<span class="v-yakkamon-ok">🏆 ${esc(v)}</span>` : esc(v)) },
    { key: "wave", label: "wave", fmt: (v) => `<span class="v-pill v-idle">${esc(v)}</span>` },
  ],
  build() {
    const summary = note(`Decided <b>purely on points rank</b>, not on when you registered. <b>Only the top 5,000</b> get an egg — <b>5,010 NFTs across 5,000 trainers, and never minted again</b>. Officially the rank is revealed at the airdrop (Q4 2026) — though the live board shows the top 100 today.`, "dim");
    const footer = note(`<b>⚠ This ladder was re-cut on 12 Aug 2026.</b> By Yakkamon's own account Storm is a new monster added <b>above</b> the old ladder, Echo is the old Legendary A, Ghost fills the old B slot and Bloom the old C slot — widened from 501–1,000 to <b>501–2,000</b>, so Legendaries now run to rank 2,000. The <b>top 10</b> get a <b>second</b> Legendary. What did <b>not</b> move is the line that decides whether you get an NFT at all: it was rank <b>5,000</b> before and it is rank <b>5,000</b> now — the old ladder also gave 5,001–20,000 early access and no NFT, the new table just says so bluntly. What the same ranks got before: ${YK.ranksWas.map((o) => `${esc(o.r)} → ${esc(o.rew)}`).join(" · ")}.`, "warn") +
      note(`<b>NFT airdrop:</b> only the top <b>5,000</b> get a Monster NFT at all: the top <b>2,000</b> a Genesis Legendary (Storm, Echo and Ghost stop at rank <b>500</b>; 501–2,000 is Bloom), ranks 2,001–5,000 a Rare Egg. Separately there was a <b>free mint</b> on Ronin, 14–17 Sep 2026: 10,000 NFTs free (gas only), <b>sold out</b>, with <b>68 legendaries</b> (3 Storm, 5 Echo, 10 Ghost, 50 Bloom) and <b>50 rares</b> seeded inside, 1 mint per whitelisted wave, blind — revealed on <b>14 Oct</b>. Each mint is worth +250 points, credited after the mint period.`, "dim");
    return { rows: YK.ranks.slice(), summary, footer, empty: "" };
  },
};

export const ykEggs = {
  type: "yk-eggs",
  title: "Sign-up egg (by registration order)",
  page: "yakkamon",
  needs: noFarm,
  view() {
    return { html: note(`This is the <b>only</b> thing signing up early gets you — a better egg type. It is <b>not an NFT</b>, it is an in-game item, and it does not grant early access.`, "dim") +
      `<div class="v-yakkamon-chips">${YK.eggs.map((e) => `<span class="v-yakkamon-chip"><b>${esc(e.egg)}</b> <span class="v-dim">${esc(e.r)}</span></span>`).join("")}</div>` };
  },
};

// ── the verdict ─────────────────────────────────────────────────────────────────────────────
export const ykVerdict = {
  type: "yk-verdict",
  title: "🧠 Is it worth it? — how to think about it",
  page: "yakkamon",
  needs: noFarm,
  view(_, ctx = {}) {
    const s = calcSettings(ctx, {});
    const F = fl(ctx);
    const forgone = s.amount * (s.lockDays / s.roiDays);
    const freeDaily = 6, freeDays = 120;
    const freeTotal = freeDaily * freeDays + 10 + 10 + 10 + 250;
    const eq = YK.tiers[1];   // 500 FLOWER
    const step = (tone, head, body) => `<li><b class="v-yakkamon-${tone}">${head}</b> ${body}</li>`;
    const html = `<ol class="v-yakkamon-steps">` +
      step("ok", "1. This is not a purchase, it is a lock-up.", `You get the FLOWER back — the docs say explicitly <b>no withdrawal tax, no lock-up, no penalty</b>. You are not buying points, you are parking your FLOWER for a while.`) +
      step("bad", "2. But you cannot withdraw during pre-registration.", `Withdrawals are <b>not available</b> until you get access (Q4 2026), and after launch there are <b>daily % limits</b> &ldquo;for economic and security reasons&rdquo;. So from 10 Aug to Q4 2026 you cannot touch that money — realistically <b>2–5 months</b>.`) +
      step("warn", "3. The real cost is forgone yield.", `That same FLOWER put into your farm earns something. The calculator prices it: at a ${s.roiDays}-day payback and ${s.lockDays} days locked, ${fmt(s.amount)} FLOWER costs you <b class="v-yakkamon-bad">${fmt(forgone, 1)} FLOWER</b> of income you did not make. On top of that sits smart-contract and counterparty risk.`) +
      step("blue", "4. The leaderboard is effectively a deposit ranking.", `You cannot catch up for free: ~${freeDays} days of free activity yields roughly <b>${fmt(freeTotal)} points</b> (daily egg ${freeDaily}×${freeDays} + Discord/X/wallet + free mint), while <b>${fmt(eq.flower)} FLOWER in week 1 = ${fmt(eq.pts + eq.bonus)} points</b>. One mid-sized deposit therefore beats <b>all</b> of your free activity for the entire period. And the live board prices the top end exactly: <b>Storm, Echo and Ghost</b> stop at rank <b>500</b> (Bloom runs to 2,000), and rank 100 alone already costs about <b>5,000 ${F}</b> — so one of those three is a four-figure FLOWER deposit, not a grind.`) +
      step("", "5. What nobody knows.", `How many points any given rank will take once the whales are done, what a Legendary Monster NFT will fetch on the market, and whether Yakkamon lands at all. You are buying an <b>option</b>, not a known return.`) +
      `</ol><div class="v-yakkamon-rule"><b class="v-yakkamon-acc">Decision rule:</b> a deposit makes sense when (a) you are just holding that FLOWER anyway and have no better use for it on the farm, (b) you can live without touching it for 2–5 months, and (c) the NFT + early access is worth at least <b class="v-yakkamon-bad">${fmt(forgone, 1)} FLOWER</b> to you (your forgone yield). If there are short-payback purchases on your farm you have not made yet, <b>those almost certainly win</b> — they have a known return, this is a lottery ticket.` +
      note(`Timing: if you do go in, <b>the first week is the best</b> (3×) — each week of waiting shaves 0.2× off the multiplier. But do not rush purely for the multiplier: w1 vs w3 is only ${((1 - ykMult(3) / ykMult(1)) * 100).toFixed(0)}%, which is small against the risk of deciding wrong.`, "dim") + `</div>`;
    return { html };
  },
};
