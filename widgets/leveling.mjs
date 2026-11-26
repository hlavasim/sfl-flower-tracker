// LEVELING as widgets, on the saved LEVELING config (core/sections/leveling.mjs does the maths):
//   📊 Plan: days and FLOWER to the target, XP a day by source, what holds the shed back.
//   👣 Cheapest next steps: the single changes that cut the FLOWER to the target most.
//   🧭 Cheapest routes: the days × FLOWER frontier (computed on the page, on demand).
//   🧮 Items × ascensions: what each item you do not have saves or costs to the end of each ascension.
// On the LEVELING page ctx.state is the page's own state (and the controls work); on a board the
// state is computed here from the farm, the leveling inputs, the book and the saved config.
import { levelingInit, levelingPlan, levelingLadder, levelingInputsWithBook, itemImpacts, levelingSteps,
  tickedAt, impactAt, breakEven, pointsReachedAt, tickedSkillPoints } from "../core/sections/leveling.mjs";
import { sflIcon } from "../core/engine/power-formula.mjs";
import { kpis, bar } from "../ui/viz.mjs";
import { big, compact, meter as gMeter, rows as gRows } from "../ui/glance.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (ctx, n) => (typeof ctx.icon === "function" ? ctx.icon(n) : "");
export const lvFmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—");
export const lvDays = (d) => (d === Infinity || !Number.isFinite(d) ? "never" : d <= 0 ? "done" : `${lvFmt(d)} days`);
// Compact FLOWER: 950, 1.2k, 14k (signed).
export const lvK = (v) => {
  if (!Number.isFinite(v)) return v > 0 ? "∞" : v < 0 ? "−∞" : "—";
  const a = Math.abs(v), s = v < 0 ? "−" : v > 0 ? "+" : "";
  return s + (a < 1000 ? Math.round(a) : a < 10000 ? (a / 1000).toFixed(1) + "k" : Math.round(a / 1000) + "k");
};
export const lvAL = (p) => (p === "now" ? "now" : p ? `A${p.ascension} L${p.level}` : "—");
const perM = (c, x) => (x > 0 ? lvFmt(c / (x / 1e6)) : "—");
const date = (d) => (Number.isFinite(d) && d > 0 ? new Date(Date.now() + d * 86400000).toLocaleDateString("en-US") : "");
export const LV_BOTTLENECK = { salt: "salt", slots: "slots (restarts)", fish: "fish" };
export const LV_GROUPS = [["fishing", "🎣 Fishing"], ["salt", "🧂 Salt"], ["aging", "🐟 Aging"], ["cooking", "🍳 Cooking"]];
const targetLabel = (c) => `the end of A${c.target.ascension}${c.target.level !== 50 ? ` (L${c.target.level})` : ""}`;

const needs = (farmId) => ({ farm: { res: "farm", farm: farmId }, leveling: { res: "leveling", farm: farmId }, book: { res: "book" } });

// The board repaints often: the state is reused while the farm, the inputs, the book and the saved config are the same.
let last = null;
export function levelingState(farm, leveling, book, saved) {
  const savedKey = JSON.stringify(saved || null);
  if (last && last.farm === farm && last.leveling === leveling && last.book === book && last.savedKey === savedKey) return last.out;
  const items = (book && book.items) || {};
  const inputs = levelingInputsWithBook(leveling.inputs, items);
  const cfg = levelingInit(farm, inputs, saved || null).cfg;
  const free = inputs.freePoints || 0;
  const plan = levelingPlan(farm, inputs, cfg);
  const impacts = itemImpacts(farm, inputs, cfg);
  const out = { farm, inputs, book: items, cfg, free, plan, impacts, front: null,
    bare: levelingPlan(farm, inputs, { ...cfg, ticked: [] }), ladder: levelingLadder(farm, plan, 10, free),
    steps: levelingSteps(farm, inputs, cfg, impacts, 3) };
  last = { farm, leveling, book, savedKey, out };
  return out;
}
function stateOf({ farm, leveling, book } = {}, ctx = {}) {
  if (ctx.state) return { st: ctx.state };
  if (!farm) return { empty: "No farm data." };
  if (!leveling || !leveling.inputs) return { empty: "The LEVELING plan did not load." };
  return { st: levelingState(farm, leveling, book || null, ctx.savedLeveling) };
}

export const levelingSummary = {
  type: "leveling-summary",
  title: "📊 Leveling plan",
  page: "leveling",
  needs,
  optional: ["book"],
  // ctx: { state? (the page's), savedLeveling? }
  view(data, ctx = {}) {
    const { st, empty } = stateOf(data, ctx);
    if (!st) return { empty };
    const { plan, cfg: c, inputs } = st, x = plan.xpPerDay, S = sflIcon();
    const src = [...plan.buildings.map((b) => `${icon(ctx, b.name)}${esc(b.name)} ${perM(b.costPerDay, b.xpPerDay)}`),
      x.aging + x.raw > 0 ? `fish ${perM(plan.costSplit.fish, x.aging + x.raw)}` : null].filter(Boolean).join(" · ");
    const actual = inputs.actualXpPerDay;
    const d = date(plan.days);
    let h = kpis([{ v: lvDays(plan.days), l: `to ${targetLabel(c)}${d ? ` · ≈ ${d}` : ""}` },
      { v: `${lvFmt(plan.totalFlower)} FLOWER`, l: plan.oneOff > 0 ? `of it NFTs ${lvFmt(plan.oneOff)}${c.resell ? " (the loss on resale)" : ""}` : "no purchases" },
      { v: lvFmt(x.total), l: "XP a day" }, { v: perM(plan.costPerDay, x.total), l: "FLOWER per 1 M XP" },
      { v: plan.bottleneck ? LV_BOTTLENECK[plan.bottleneck] : "—", l: "aging held back by" }]);
    h += `<div class="v-note v-ii">XP a day: kitchens <b>${lvFmt(x.kitchens)}</b> · aging <b>${lvFmt(x.aging)}</b> · raw <b>${lvFmt(x.raw)}</b> · ${lvFmt(plan.costPerDay)} ${S} a day<br>` +
      `${S} per 1 M XP by source: ${src || "—"}` +
      (plan.bankedXp > 0 ? `<br>cooked food in stock: ${lvFmt(plan.bankedXp)} XP (already subtracted)` : "") + `</div>`;
    if (actual) {
      const pct = (actual / x.total) * 100;
      h += `<div class="v-note">actually over the last weeks: <b>${lvFmt(actual)}</b> XP a day (${actual >= x.total ? "on plan" : `${Math.round(pct)} % of the plan`})</div>${bar(pct)}`;
    }
    return { html: h };
  },
};

export const levelingStepsWidget = {
  type: "leveling-steps",
  title: "👣 Cheapest next steps",
  page: "leveling",
  needs,
  optional: ["book"],
  defaults: {},
  rowKey: (r) => String(r.i),
  rowLabel: (r) => r.label,
  columns: [
    { key: "label", label: "step (each on its own, against the current setup)", fmt: (v, r) => `<span class="v-ii">${r.i + 1}. ${r.iconHtml}${esc(v)}</span>` +
      (r.price ? ` <span class="v-dim">(${lvFmt(r.price)} FLOWER)</span>` : "") },
    { key: "dFlower", label: "FLOWER", labelHtml: `Δ ${sflIcon()}`, align: "right", fmt: (v) => `<b class="v-good">${lvK(v)}</b>` },
    { key: "dDays", label: "days", align: "right", fmt: (v) => `<span class="v-dim">${Number.isFinite(v) ? `${v > 0 ? "+" : ""}${lvFmt(v)} d` : v < 0 ? "from never" : "never"}</span>` },
    { key: "use", label: "", get: () => "", fmt: (v, r) => (r.interactive ? `<button class="v-btn" onclick="_lvlUseStep(${r.i})">use</button>` : "") },
  ],
  // ctx: { state?, savedLeveling?, interactive? (the page: the use buttons), icon? }
  build(data, ctx = {}) {
    const { st, empty } = stateOf(data, ctx);
    if (!st) return { rows: [], footer: "", empty };
    const rows = st.steps.map((s, i) => ({ ...s, i, interactive: !!ctx.interactive, iconHtml: s.name ? icon(ctx, s.name) : "" }));
    const footer = ctx.interactive && rows.length > 1 ? `<div style="margin-top:8px"><button class="v-btn" onclick="_lvlUseSteps()">use all</button></div>` : "";
    return { rows, footer, empty: "No single change makes the route cheaper any more." };
  },
};

// The days × FLOWER frontier: a scatter (fastest left), the current setup as a cross; a dot click uses it (page only).
export function frontierSvg(points, cur, interactive) {
  const W = 600, H = 190, pl = 46, pr = 10, pt = 10, pb = 26;
  const all = [...points, cur].filter((p) => Number.isFinite(p.days) && Number.isFinite(p.flower));
  if (!all.length) return "";
  const x0 = 0, x1 = Math.max(...all.map((p) => p.days)) * 1.05;
  const yMin = Math.min(...all.map((p) => p.flower)), yMax = Math.max(...all.map((p) => p.flower));
  const y0 = yMin - (yMax - yMin) * 0.1 - 1, y1 = yMax + (yMax - yMin) * 0.1 + 1;
  const X = (d) => pl + ((d - x0) / (x1 - x0)) * (W - pl - pr), Y = (f) => pt + (1 - (f - y0) / (y1 - y0)) * (H - pt - pb);
  let g = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto;display:block" font-size="10" fill="var(--c-dim)">`;
  for (let i = 0; i <= 4; i++) {
    const f = y0 + ((y1 - y0) * i) / 4, d = x0 + ((x1 - x0) * i) / 4;
    g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(f)}" y2="${Y(f)}" stroke="var(--c-line)"/>`;
    g += `<text x="${pl - 4}" y="${Y(f) + 3}" text-anchor="end">${lvK(f).replace("+", "")}</text>`;
    g += `<text x="${X(d)}" y="${H - 8}" text-anchor="middle">${lvFmt(d)} d</text>`;
  }
  g += `<polyline fill="none" stroke="var(--c-accent)" stroke-opacity="0.5" points="${points.map((p) => `${X(p.days)},${Y(p.flower)}`).join(" ")}"/>`;
  points.forEach((p, i) => {
    g += `<circle cx="${X(p.days)}" cy="${Y(p.flower)}" r="6" fill="var(--c-accent)"${interactive ? ` style="cursor:pointer" onclick="_lvlUseFront(${i})"` : ""}><title>${lvFmt(p.days)} days · ${lvFmt(p.flower)} FLOWER${interactive ? " — click to use" : ""}</title></circle>`;
  });
  if (Number.isFinite(cur.days) && Number.isFinite(cur.flower)) {
    const cx = X(cur.days), cy = Y(cur.flower);
    g += `<path d="M${cx - 6},${cy - 6}L${cx + 6},${cy + 6}M${cx - 6},${cy + 6}L${cx + 6},${cy - 6}" stroke="var(--c-red)" stroke-width="2.5"><title>your setup</title></path>`;
  }
  return g + `</svg>`;
}

export const levelingFrontierWidget = {
  type: "leveling-frontier",
  title: "🧭 Cheapest routes",
  page: "leveling",
  needs,
  optional: ["book"],
  // ctx: { state? (front = the page's computed frontier), interactive?, icon? }
  view(data, ctx = {}) {
    const { st, empty } = stateOf(data, ctx);
    if (!st) return { empty };
    const c = st.cfg, fr = st.front, I = !!ctx.interactive, S = sflIcon();
    let h = `<div id="${I ? "lvl-front" : ""}">`;
    if (fr) {
      const stale = fr.key !== JSON.stringify([c.target, c.restarts, c.costScale, c.resell]);
      h += (stale ? `<div class="v-bad">Computed for another target or setup — compute again.</div>` : "") + frontierSvg(fr.points, st.plan, I) +
        `<div class="v-note">✕ = your setup · a dot = the cheapest route at that pace${I ? " (click = use)" : ""}</div>` +
        `<table class="v-mini"><tr><th class="r">days</th><th class="r">FLOWER</th><th>kitchens and fish</th><th>buy</th><th></th></tr>` + fr.points.map((p, i) => {
          const fish = [p.fish.age ? "aging" : "", p.fish.eatRaw ? "raw" : ""].filter(Boolean).join(" + ") || "no fish";
          return `<tr${I ? ` class="click" onclick="_lvlUseFront(${i})"` : ""}><td class="r"><b>${lvFmt(p.days)}</b></td><td class="r"><b>${lvFmt(p.flower)}</b> ${S}</td>` +
            `<td class="v-ii">${p.kitchens.length ? p.kitchens.map((k) => `${icon(ctx, k)}${esc(k)}`).join(" + ") : "no kitchen"} · ${fish}${p.fish.buySalt ? " + bought salt" : ""}` +
            `${p.fish.worm ? ` · ${icon(ctx, p.fish.worm)}${esc(p.fish.worm)}` : ""}${(p.extras || []).length ? ` · + ${p.extras.map((e) => `${icon(ctx, e)}${esc(e)}`).join(", ")}` : ""}</td>` +
            `<td class="v-dim v-ii">${p.ticked.length ? p.ticked.map((t) => `${icon(ctx, t)}${esc(t)}`).join(", ") : "nothing to buy"}</td>` +
            `<td>${I ? `<button class="v-btn">use</button>` : ""}</td></tr>`;
        }).join("") + `</table>`;
    } else {
      h += `<div class="v-note">Goes through the combinations of kitchens, recipes, fish and purchases and shows the cheapest route at every pace (faster = dearer)${I ? "" : " — computed on the LEVELING page"}.</div>`;
    }
    if (I) h += `<button class="v-btn" style="margin-top:6px" onclick="_lvlFindFront()">${fr ? "compute again" : "Find the cheapest routes"}</button>`;
    return { html: h + `</div><div class="v-dim" style="margin-top:6px">to ${esc(targetLabel(c))}</div>` };
  },
};

export const levelingMatrix = {
  type: "leveling-matrix",
  title: "🧮 Items × ascensions",
  page: "leveling",
  needs,
  optional: ["book"],
  options: [{ key: "showAll", label: "Show items with no effect too", kind: "bool" }],
  // ctx: { state?, interactive? (the tick boxes), icon? }; opts: { showAll }
  view(data, ctx = {}, opts = {}) {
    const { st, empty } = stateOf(data, ctx);
    if (!st) return { empty };
    const { farm, cfg: c, plan, bare, impacts, ladder, free } = st, I = !!ctx.interactive, S = sflIcon();
    const chk = (on) => (on ? " checked" : "");
    const cols = ladder.map((r) => ({ a: r.ascension, xp: r.xpEnd }));
    const pts = tickedSkillPoints(farm, c.ticked);
    const cell = (v) => `<td class="r ${!Number.isFinite(v) || Math.abs(v) < 0.5 ? "v-dim" : v < 0 ? "v-good" : "v-bad"}">${Math.abs(v) < 0.5 ? "0" : lvK(v)}</td>`;
    let h = `<div class="v-note" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">` +
      `<span>${c.resell ? "NFTs resold after the target (the resale loss counts)" : "NFTs at full price"}${opts.showAll ? " · items with no effect shown" : ""}</span>` +
      (pts ? `<span>skills for <b>${pts}</b> points, ${free} free${pts > free ? ` <span class="v-bad">⚠ the rest from ${lvAL(pointsReachedAt(farm, pts - free))}</span>` : ""}</span>` : "") + `</div>` +
      `<details class="v-note"><summary style="cursor:pointer">? what the numbers mean</summary>
        A cell = how much ${S} the route to the end of that ascension costs with the item against without it (green = saves, red = loses):
        running costs (cooking, rods, rakes, salt) + ${c.resell ? "the loss on reselling the NFT (price − the highest bid, 15 % without a bid)" : "the NFT's full price"}.
        Each row is a change against what is ticked now. Σ on top = everything ticked together against nothing — items affect each other
        (more fish does not help without salt), so Σ is not the sum of the rows. "Pays off from" = the first level from which the item saves.
        Hover a name to see what it does and how it changes the day.</details>`;
    h += `<div style="overflow-x:auto"><table class="v-mini"><tr><th></th><th>item</th><th class="r">price</th><th>pays off from</th>` +
      cols.map((k) => `<th class="r"${k.a === c.target.ascension ? ' style="color:var(--c-accent)"' : ""}>A${k.a}</th>`).join("") + `<th class="r">points</th></tr>` +
      `<tr class="hl"><td></td><td><b>Σ ticked (${c.ticked.length})</b></td><td class="r">${plan.oneOff > 0 ? lvFmt(plan.oneOff) : ""}</td><td></td>` +
      cols.map((k) => cell(tickedAt(farm, plan, bare, k.xp))).join("") + `<td class="r">${pts || ""}</td></tr>`;
    const key = (r) => (Number.isFinite(r.dFlower) ? r.dFlower : 0);
    for (const [g, label] of LV_GROUPS) {
      const rows = impacts.filter((r) => r.group === g).map((r) => ({ r, vals: cols.map((k) => impactAt(farm, r, k.xp)) }))
        // no effect on the day (XP and running cost unchanged) = only its price: hidden unless asked
        .filter(({ r }) => opts.showAll || r.ticked || Math.abs(r.dXpPerDay) >= 1 || !(Math.abs(r.dRunning) < 0.5))
        .sort((a, b) => key(a.r) - key(b.r));
      if (!rows.length) continue;
      h += `<tr><td colspan="${5 + cols.length}" class="v-sub">${label}</td></tr>`;
      for (const { r, vals } of rows) {
        const bk = (st.book || {})[r.name] || {};
        const price = r.kind === "skill" ? `<span class="v-dim">points</span>`
          : r.priceKnown ? `<span title="highest bid ${bk.b > 0 ? lvFmt(bk.b) : "—"} · last trade ${bk.ls > 0 ? lvFmt(bk.ls) : "—"} · loss on resale ${lvFmt(r.loss)}">${lvFmt(r.price)}</span>`
          : r.tradeable ? `<span class="v-bad" title="no listing on the market now — counted as free">price ?</span>` : `<span class="v-dim" title="cannot be bought now">n/a</span>`;
        let be = r.ticked ? "" : lvAL(breakEven(farm, r, 10));
        if (r.kind === "skill" && r.pointCost > free) be += `<div class="v-dim">points from ${lvAL(pointsReachedAt(farm, r.pointCost - free))}</div>`;
        const tip = `${r.boost} · XP a day ${r.dXpPerDay > 0 ? "+" : ""}${lvFmt(r.dXpPerDay)} · to the target ${Number.isFinite(r.dDays) ? `${r.dDays > 0 ? "+" : ""}${lvFmt(r.dDays)} days` : "from never"} · running ${lvK(r.dRunning)} FLOWER`;
        h += `<tr${r.ticked ? ' class="hl"' : ""}><td><input type="checkbox"${chk(r.ticked)}${I ? ` data-n="${esc(r.name)}" onchange="_lvlTick(this.dataset.n,this.checked)"` : " disabled"}></td>` +
          `<td class="v-ii" style="white-space:nowrap" title="${esc(tip)}">${icon(ctx, r.name)}${esc(r.name)}</td><td class="r">${price}</td><td style="white-space:nowrap">${be}</td>` +
          vals.map(cell).join("") + `<td class="r">${r.pointCost || ""}</td></tr>`;
      }
    }
    return { html: h + `</table></div>` };
  },
};

// ── iPhone glance faces ──
// plan: S = days to the target and the FLOWER it costs; M = XP a day, FLOWER per 1 M XP and what holds
// aging back beside it; L = adds the XP split and the actual pace
const daysBig = (d, cap) => (Number.isFinite(d) && d > 0 ? big(lvFmt(d), { unit: " days", cap }) : big(lvDays(d), { tone: d <= 0 ? "ok" : "bad", cap }));
levelingSummary.sizes = ["s", "m", "l"];
levelingSummary.size = "s";
levelingSummary.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const { st, empty } = stateOf(data, ctx);
  if (!st) return { empty };
  const { plan, cfg: c, inputs } = st, x = plan.xpPerDay;
  const head = daysBig(plan.days, `to A${c.target.ascension}${c.target.level !== 50 ? ` L${c.target.level}` : ""} · ${compact(plan.totalFlower)} FLOWER`);
  if (size === "s") return { html: head };
  const list = [{ name: "XP a day", value: compact(x.total) }, { name: "FLOWER / 1 M XP", value: perM(plan.costPerDay, x.total) },
    { name: "aging held back by", value: plan.bottleneck ? LV_BOTTLENECK[plan.bottleneck] : "—" }];
  if (size === "m") return { html: `<div class="g-split"><div>${head}</div>${gRows(list)}</div>` };
  const more = [{ name: "kitchens", sub: "XP a day", value: compact(x.kitchens) }, { name: "aging", sub: "XP a day", value: compact(x.aging) },
    { name: "raw fish", sub: "XP a day", value: compact(x.raw) }, { name: "FLOWER a day", value: compact(plan.costPerDay) }];
  const actual = inputs.actualXpPerDay;
  return { html: head + gRows([...list, ...more]) + (actual && x.total > 0 ? gMeter((actual / x.total) * 100, actual >= x.total ? "ok" : "warn") +
    `<div class="g-cap">actually ${compact(actual)} XP a day${actual >= x.total ? " · on plan" : ` · ${Math.round((actual / x.total) * 100)} % of the plan`}</div>` : "") };
};

// steps: S = the cheapest single change and what it saves; M = the next steps
levelingStepsWidget.sizes = ["s", "m"];
levelingStepsWidget.size = "s";
levelingStepsWidget.glance = (data = {}, ctx = {}, opts = {}, size = "s") => {
  const out = levelingStepsWidget.build(data, { ...ctx, interactive: false });
  if (!out.rows.length) return { empty: out.empty };
  const r = out.rows[0];
  if (size === "s") {
    return { html: (r.iconHtml ? `<div class="g-hero">${r.iconHtml}</div>` : "") + big(lvK(r.dFlower), { unit: " FLOWER", tone: r.dFlower < 0 ? "ok" : "", cap: r.label }) };
  }
  return { html: gRows(out.rows.slice(0, 3).map((s) => ({ icon: s.iconHtml, name: s.label,
    sub: Number.isFinite(s.dDays) ? `${s.dDays > 0 ? "+" : ""}${lvFmt(s.dDays)} d` : s.dDays < 0 ? "from never" : "never", value: lvK(s.dFlower), tone: s.dFlower < 0 ? "ok" : "" }))) };
};

