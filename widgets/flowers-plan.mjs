// FLOWERS · the planners. The maths stays the page's (_giftsModel, _petalBlessedModel, _growPlanModel
// over the farm and the copy's options, handed in as ctx.model(farm, opts)); these shape it:
//   🎁 Gift planner: per NPC — given today, friendship, the next reward, the flower planned (pick one).
//   🔁 Gift cycle: the daily demand of the plan and the batch cycle (with Petal Blessed) that grows it.
//   ⚡ Petal Blessed: its state, and which flowers to plant before using it.
//   📋 Grow planner: what to plant when, up to the next Petal Blessed (sleep hours marked).
import { bar, kpis, bigBar, pill, ring } from "../ui/viz.mjs";
import { countdown } from "../ui/glance-templates.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (ctx, n) => (typeof ctx.icon === "function" ? ctx.icon(n) : "");
const hrs = (ctx, h) => (typeof ctx.hours === "function" ? ctx.hours(h) : `${Math.round(h * 10) / 10}h`);
const farmNeeds = (farmId) => ({ farm: { res: "farm", farm: farmId } });
const modelOf = (farm, ctx, opts = {}) => (typeof ctx.model === "function" ? ctx.model(farm, opts) : null);
const NO_MODEL = "The flower planner did not load.";
// The target each copy plans for (⚙): collection (N of each) or gifts (gifts for N days).
const TARGET_OPTIONS = [
  { key: "mode", label: "Mode", kind: "select", choices: [["collection", "📦 Collection (N of each)"], ["gifts", "🎁 Gifts (gifts for N days)"]] },
  { key: "n", label: "N", kind: "number", min: 1, max: 99 },
];
const targetTitle = (base, o) => `${base} · ${o.mode === "gifts" ? "🎁" : "📦"} ${o.n ?? 5}`;
const fmtDur = (h) => (h >= 24 ? `${(h / 24).toFixed(1)}d` : `${h}h`);

// A reward: items and coins with their icons, wearables, a recipe.
export function rewardHtml(reward, ctx) {
  const parts = [];
  for (const [it, qty] of Object.entries(reward.items || {})) parts.push(`${qty}× ${icon(ctx, it)}${esc(it)}`);
  if (reward.coins) parts.push(`${icon(ctx, "Coin")}${reward.coins.toLocaleString("en-US")}`);
  for (const w of Object.keys(reward.wearables || {})) parts.push(`${icon(ctx, w)}${esc(w)}`);
  if (reward.recipe) parts.push(`📜 ${icon(ctx, reward.recipe)}${esc(reward.recipe)}`);
  return parts.length ? parts.join(" · ") : `<span class="v-dim">empty</span>`;
}

// have vs. the gifts a day that flower is planned for
const haveTone = (have, demand) => (demand === 0 ? "var(--c-dim)" : have <= 0 ? "var(--c-red)" : have < demand ? "var(--c-yellow)" : "var(--c-green)");
const slug = (npc) => "dd" + npc.replace(/[^a-z0-9]/gi, "").toLowerCase();
const js = (s) => esc(String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'"));

// The flower pick: a dropdown with each flower's icon, stock, points and chain time (page functions
// _giftsToggleDropdown / _giftsSelectFlower save the pick and repaint).
function pickerHtml(n, ctx) {
  const o = n.options.find((x) => x.f === n.planned);
  const trigger = !n.planned ? `<span class="v-dim">— No gift —</span>`
    : o ? `${icon(ctx, n.planned)}<span class="gift-dd-name">${esc(n.planned)}</span> <span class="gift-dd-meta" style="color:${haveTone(o.totalAvail, 1)}">have ${o.have}${o.pend > 0 ? `+${o.pend}` : ""}</span> <span class="gift-dd-meta">${o.pts}pt</span>`
    : `<span class="gift-dd-name">${esc(n.planned)}</span>`;
  const items = n.options.map((x) => `<div class="gift-dropdown-item${x.f === n.planned ? " selected" : ""}" onclick="_giftsSelectFlower('${js(n.npc)}', '${js(x.f)}', event)">` +
    `<span class="gift-dd-icon">${icon(ctx, x.f)}</span><span class="gift-dd-name">${esc(x.f)}</span>` +
    `<span class="gift-dd-have" style="color:${haveTone(x.totalAvail, x.demand)}">have ${x.have}${x.pend > 0 ? `+${x.pend}` : ""}${x.demand > 1 ? `<span class="v-dim">/${x.demand}d</span>` : ""}</span>` +
    `<span class="gift-dd-pts">${x.pts}pt</span><span class="gift-dd-time">${fmtDur(x.hours)}</span></div>`).join("");
  return `<div class="gift-select gift-dropdown"><div class="gift-dropdown-trigger" onclick="_giftsToggleDropdown('${js(n.npc)}', event)">${trigger}<span class="gift-dd-arrow">▼</span></div>` +
    `<div class="gift-dropdown-list" id="gift-list-${slug(n.npc)}" style="display:none">` +
    `<div class="gift-dropdown-item gift-dropdown-clear" onclick="_giftsSelectFlower('${js(n.npc)}', '', event)">— No gift —</div>${items}</div></div>`;
}

export const flowerGifts = {
  type: "flower-gifts",
  title: "🎁 Gift planner",
  page: "flowers",
  needs: farmNeeds,
  defaults: {},
  rowKey: (r) => r.npc,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.givenToday ? "w-st-done" : ""),
  columns: [
    { key: "status", label: "today", get: (r) => (r.givenToday ? 2 : r.planned ? 0 : 1),
      fmt: (v, r) => (r.givenToday ? pill("given", "ok") : r.planned ? pill("to give", "bad") : `<span class="v-dim">·</span>`) },
    { key: "name", label: "NPC", fmt: (v, r) => `<div class="v-name"><div><b>${esc(v)}</b><small>${r.points} friendship` +
      `${r.next ? ` · next at ${r.next.threshold}${r.next.pointsAway ? ` (${r.next.pointsAway} to go)` : " (ready)"}` : ""}</small></div></div>` },
    { key: "progress", label: "to the reward", get: (r) => r.pct, fmt: (v) => bar(v) },
    { key: "next", label: "next reward", get: (r) => (r.next ? r.next.threshold : null), fmt: (v, r) => r.nextHtml },
    { key: "gift", label: "gift", get: (r) => r.planned, fmt: (v, r) => r.pickHtml },
  ],

  // ctx: { model(farm) → _giftsModel, icon(name) → HTML }
  build({ farm } = {}, ctx = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    const m = modelOf(farm, ctx);
    if (!m) return { rows: [], footer: "", empty: NO_MODEL };
    const rows = m.npcs.map((n) => ({ ...n,
      pct: n.next && n.next.threshold ? (n.points / n.next.threshold) * 100 : 0,
      nextHtml: n.next ? `<span class="v-ii">${rewardHtml(n.next.reward, ctx)}</span>` : `<span class="v-dim">no reward data</span>`,
      pickHtml: pickerHtml(n, ctx) }));
    const given = rows.filter((r) => r.planned && r.givenToday).length;
    const summary = kpis([{ v: `${m.plannedCount} / ${rows.length}`, l: "NPCs with a gift planned" },
      { v: `${given} / ${m.plannedCount}`, l: "planned gifts given today" },
      { v: m.hasBlossomBonding ? "+2" : "—", l: "🌼 Blossom Bonding" }]) + bigBar(m.plannedCount ? (given / m.plannedCount) * 100 : 0);
    return { rows, summary, footer: "", empty: "No NPCs." };
  },
};

// The bed-hours a day the gift plan takes (every chain step: its batches a day × its grow time), when
// the page's scheduler did not settle — its cycle then lists fewer plantings than its batch count,
// because the batches were raised once more after the last schedule. Otherwise 0.
function overload(m) {
  const c = m.cycle;
  if (!c || c.events.filter((e) => e.kind === "plant").length === c.totalBatches) return 0;
  const perBatch = m.beds * m.yieldFactor;
  return c.stepRows.reduce((s, r) => s + (r.dailyCount / perBatch) * r.baseH, 0);
}

export const flowerGiftCycle = {
  type: "flower-gift-cycle",
  title: "🔁 Gift cycle",
  page: "flowers",
  needs: farmNeeds,
  // ctx: { model(farm) → _giftsModel, icon(name) → HTML }
  view({ farm } = {}, ctx = {}) {
    if (!farm) return { empty: "No farm data." };
    const m = modelOf(farm, ctx);
    if (!m) return { empty: NO_MODEL };
    const c = m.cycle;
    if (!c) return { empty: "Select flowers in the gift planner to see daily demand and production capacity." };
    const ic = (n) => icon(ctx, n);
    const demandTable = `<div class="v-sub">Daily demand</div><table class="v-mini"><tr><th>flower</th><th class="r">need/day</th><th class="r">have</th><th class="r">grow</th></tr>` +
      c.needList.map((n) => `<tr><td class="v-ii">${ic(n.flower)}<b>${esc(n.flower)}</b></td><td class="r">${n.qty}</td>` +
        `<td class="r">${n.have}${n.pend > 0 ? ` <span class="v-warn">(+${n.pend})</span>` : ""}</td><td class="r v-dim">${n.hours.toFixed(1)}h</td></tr>`).join("") + `</table>`;
    // The plan grows more than the beds can: the page's batch scheduler never settles and its last
    // cycle is a runaway number (thousands of days), so say so instead of showing it.
    const load = overload(m);
    if (load) {
      return { html: `<div class="v-note v-bad">⚠ ` + (load > 24
        ? `This gift plan needs about <b>${Math.round(load)}h</b> of growing a day in all ${m.beds} beds — more than a day has, even with Petal Blessed. ` +
          `The beds cannot keep up, so there is no repeating cycle. Plan fewer gifts, or flowers with shorter chains.`
        : `The batch schedule did not settle for this plan, so no cycle length is shown.`) + `</div>` + demandTable };
    }
    const fmtH = (h) => (h >= 24 ? `${(h / 24).toFixed(1)}d` : `${h.toFixed(1)}h`);
    const at = (h) => {
      if (h <= 0) return "T=0";
      const d = Math.floor(h / 24), rem = h - d * 24;
      if (d > 0 && rem >= 0.05) return `T+${d}d ${rem.toFixed(1)}h`;
      return d > 0 ? `T+${d}d` : `T+${h.toFixed(1)}h`;
    };
    const cycleLabel = c.cycleH >= 24 ? `${(c.cycleH / 24).toFixed(1)}d (${c.cycleH.toFixed(1)}h)` : `${c.cycleH.toFixed(1)}h`;
    let h = kpis([{ v: cycleLabel, l: "one cycle" }, { v: c.totalBatches, l: c.totalBatches === 1 ? "batch" : "batches, one after another" },
      { v: c.pbUsesInCycle, l: `Petal Blessed use${c.pbUsesInCycle === 1 ? "" : "s"}` }, { v: `×${m.yieldFactor.toFixed(2)}`, l: "yield factor" }]);

    h += demandTable;

    h += `<div class="v-sub">Active boosts</div><div class="v-note">` + (m.yieldBoosts.length
      ? m.yieldBoosts.map((b) => `<span style="margin-right:10px" class="v-ii">${ic(b.name)}<b>${esc(b.name)}</b> <span class="v-dim">(${(b.chance * 100).toFixed(0)}% +1)</span></span>`).join("") +
        `<div>Yield factor: <b class="v-good">×${m.yieldFactor.toFixed(2)}</b> per harvest</div>`
      : `<span class="v-dim">no yield boosts detected — yield factor ×1.00</span>`) +
      `<div class="v-ii">Petal Blessed: 1 instant grow per ${fmtH(c.cycleH)} cycle → applied to ${c.longestFlower ? ic(c.longestFlower) : ""}<b class="v-good">${esc(c.longestFlower || "—")}</b> (longest at ${c.longestBaseH.toFixed(1)}h grow)</div></div>`;

    h += `<div class="v-sub">Timeline — ${cycleLabel} cycle</div><div class="v-note">All ${m.beds} beds plant the SAME flower each batch (longer per batch but yields ${m.beds}× more). ` +
      `Batches run sequentially. <b>⚡ Petal Blessed</b> instantly harvests ALL growing beds → use it on the slowest batches to skip their grow time. The whole loop below repeats every <b>${cycleLabel}</b>.</div>` +
      `<table class="v-mini"><tr><th>when</th><th>step</th><th>what</th></tr>` + c.events.map((e) => {
        const what = e.kind === "plant" ? `${ic(e.flower)}<b>${esc(e.flower)}</b> (${e.baseH.toFixed(1)}h grow) in all ${m.beds} beds`
          : e.kind === "pb_harvest" ? `${ic(e.flower)}Petal Blessed instantly harvests all ${e.beds} beds → +<b>${e.flowersOut.toFixed(1)} ${esc(e.flower)}</b>`
          : `${ic(e.flower)}All ${e.beds} beds ready → +<b>${e.flowersOut.toFixed(1)} ${esc(e.flower)}</b>`;
        const step = e.kind === "plant" ? pill("🌱 plant", "idle") : e.kind === "pb_harvest" ? pill("⚡ PB → harvest", "run") : pill("🌼 harvest", "ok");
        return `<tr><td class="v-dim" style="white-space:nowrap">${at(e.time)}</td><td>${step}</td><td class="v-ii">${what}</td></tr>`;
      }).join("") + `</table>` +
      `<div class="v-note">Cycle: <b>${cycleLabel}</b> = ${c.totalBatches} batch${c.totalBatches === 1 ? "" : "es"} sequentially, ${c.pbUsesInCycle} Petal Blessed use${c.pbUsesInCycle === 1 ? "" : "s"}</div>`;

    h += `<div class="v-sub">Production vs demand</div><div class="v-note">Each row = one flower in your gift chains (Prism Petal needs Blue Lotus → Blue Pansy → Purple Cosmos, all listed). ` +
      `Grow = real time per harvest after speed boosts; Batches = how many times all beds grow it in one cycle; Supply = batches × beds × yield; Demand = what the gifts use over the cycle.</div>` +
      `<table class="v-mini"><tr><th>flower</th><th>seed</th><th class="r">grow</th><th class="r">batches</th><th class="r">supply</th><th class="r">demand</th><th class="r">surplus</th><th></th></tr>` +
      c.stepRows.map((r) => {
        const s = r.supply - r.demand;
        return `<tr><td class="v-ii">${ic(r.flower)}${esc(r.flower)}</td><td class="v-dim v-ii">${ic(r.seed)}${esc(r.seed.replace(" Seed", ""))}</td>` +
          `<td class="r">${r.baseH.toFixed(1)}h</td><td class="r">${r.batches}</td><td class="r">${r.supply.toFixed(1)}</td><td class="r">${r.demand.toFixed(1)}</td>` +
          `<td class="r"><b class="${s >= 0 ? "v-good" : "v-bad"}">${s >= 0 ? "+" : ""}${s.toFixed(1)}</b></td><td style="width:90px">${bar(r.demand ? (r.supply / r.demand) * 100 : 100)}</td></tr>`;
      }).join("") + `</table>`;

    if (c.giftProduction.length) {
      h += `<div class="v-sub">Gift flowers produced per cycle</div><div class="v-note">` + c.giftProduction.map((g) => {
        const s = g.produced - g.demanded;
        return `<div class="v-ii">${ic(g.flower)}<b>${esc(g.flower)}</b>: ${g.produced.toFixed(1)} produced / ${g.demanded.toFixed(1)} needed (${g.dailyCount}/day × ${(c.cycleH / 24).toFixed(1)}d) → ` +
          `<b class="${s >= 0 ? "v-good" : "v-bad"}">${s >= 0 ? "+" : ""}${s.toFixed(1)}</b></div>`;
      }).join("") + `</div>`;
    }
    return { html: h };
  },
};

// The countdown pill the page's timers tick (growing-bed-time); the page copy also carries #pb-timer.
const pbState = (st, ctx) => (st.status === "ready" ? pill("READY", "ok")
  : st.status === "cooldown" ? `<span class="v-pill v-run growing-bed-time"${ctx.pbTimer ? ` id="pb-timer" data-next="${st.nextAt}"` : ""} data-ready="${st.nextAt}">${esc(ctx.countdown ? ctx.countdown(st.nextAt - (ctx.now || Date.now())) : "")}</span>`
  : pill("not unlocked", "idle"));

export const petalBlessed = {
  type: "petal-blessed",
  title: "⚡ Petal Blessed",
  titleFor: (o) => targetTitle("⚡ Petal Blessed", o),
  page: "flowers",
  needs: farmNeeds,
  optionsLabel: "Target",
  options: TARGET_OPTIONS,
  defaults: { opts: { mode: "collection", n: 5 } },
  rowKey: (r) => String(r.bed),
  rowLabel: (r) => `${r.bed}. ${r.name}`,
  columns: [
    { key: "bed", label: "bed", align: "right", fmt: (v) => `<span class="v-dim">${v}</span>` },
    { key: "name", label: "plant", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b><small class="v-ii">${r.recipeHtml}</small></div></div>` },
    { key: "seedHours", label: "saved", align: "right", fmt: (v, r) => `<b>${esc(r.savedText)}</b>` },
  ],

  // ctx: { model(farm, opts) → _petalBlessedModel, icon, hours, countdown, pbTimer? }; opts: { mode, n }
  build({ farm } = {}, ctx = {}, opts = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    const m = modelOf(farm, ctx, opts);
    if (!m) return { rows: [], footer: "", empty: NO_MODEL };
    const rows = m.picks.map((p, i) => ({ ...p, bed: i + 1, iconHtml: icon(ctx, p.name), savedText: hrs(ctx, p.seedHours),
      recipeHtml: `${icon(ctx, `${p.seedLabel} Seed`)}${esc(p.seedLabel)} Seed + ${icon(ctx, p.input)}` +
        (p.inputIsFlower ? `<span class="v-warn">${esc(p.input)}</span>${p.inputReady ? "" : ` <span class="v-bad">(!)</span>`}` : esc(p.input)) }));
    const saved = rows.reduce((s, p) => s + p.seedHours, 0);
    const summary = kpis([{ v: m.status.status === "ready" ? "READY" : m.status.status === "cooldown" ? "cooling down" : "—", l: "Petal Blessed" },
      { v: rows.length, l: "flowers to plant" }, { v: hrs(ctx, saved), l: "grow time it saves" }]) +
      `<div style="margin:-4px 0 10px">${pbState(m.status, ctx)} <span class="v-dim">${rows.length ? `Plant these ${rows.length} flowers, then use instant grow` : ""}</span></div>`;
    return { rows, summary, footer: "", empty: "All flowers are complete! Nothing to grow." };
  },
};

export const growPlanner = {
  type: "grow-planner",
  title: "📋 Grow planner",
  titleFor: (o) => targetTitle("📋 Grow planner", o),
  page: "flowers",
  needs: farmNeeds,
  optionsLabel: "Plan",
  options: [...TARGET_OPTIONS,
    { key: "sleepStart", label: "💤 Sleep from (hour)", kind: "number", min: 0, max: 23 },
    { key: "sleepEnd", label: "💤 Sleep until (hour)", kind: "number", min: 0, max: 23 }],
  defaults: { opts: { mode: "collection", n: 5, sleepStart: 23, sleepEnd: 7 } },
  rowKey: (r) => r.key,
  rowLabel: (r) => r.flower,
  rowClass: (r) => (r.now ? "w-st-ready" : ""),
  columns: [
    { key: "when", label: "when", get: (r) => r.at, fmt: (v, r) => (r.pb ? pill(r.whenText, "run") : pill(r.whenText, r.now ? "ok" : "idle")) },
    { key: "flower", label: "flower", fmt: (v, r) => `<div class="v-name">${ring(r.pb ? 100 : 0, r.iconHtml || "🌱")}<div><b>${esc(v)}</b><small class="v-ii">${r.detailHtml}</small></div></div>` },
    { key: "finish", label: "ready", get: (r) => r.finishAt || null, fmt: (v, r) => (r.finishText ? `<span class="${r.sleepWaste ? "v-warn" : ""}">→ ${esc(r.finishText)}${r.sleepWaste ? " 💤" : ""}</span>` : "") },
    { key: "chain", label: "chain", extra: true, get: () => "", fmt: (v, r) => `<div class="v-ii" style="font-size:12px">${r.chainHtml}</div>` },
  ],

  // ctx: { model(farm, opts) → _growPlanModel, icon, hours, now? }; opts: { mode, n, sleepStart, sleepEnd }
  build({ farm } = {}, ctx = {}, opts = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    const m = modelOf(farm, ctx, opts);
    if (!m) return { rows: [], footer: "", empty: NO_MODEL };
    const { plan, sleep } = m;
    const now = ctx.now || Date.now();
    const two = (n) => String(n).padStart(2, "0");
    if (m.done) return { rows: [], footer: "", empty: "✓ All flowers at target — nothing to plan." };
    const detail = (name, text) => { const f = m.info(name); return `${icon(ctx, `${f.seedLabel} Seed`)}${esc(f.seedLabel)} · ${esc(text)} · + ${icon(ctx, f.input)}${esc(f.input)} (have ${f.inputHave})`; };
    const rows = [];
    // regular plantings, batched by start time (an hour apart = a new batch)
    let batchAt = null;
    for (const s of [...(plan.pbReady ? [] : plan.steps)].sort((a, b) => a.startAt - b.startAt)) {
      if (batchAt === null || s.startAt - batchAt > 3600000) batchAt = s.startAt;
      const isNow = batchAt <= now + 60000;
      rows.push({ key: `s${rows.length}`, at: batchAt, now: isNow, whenText: isNow ? "Plant now" : `Plant ${m.fmtTime(batchAt)}`, flower: s.flower,
        iconHtml: icon(ctx, s.flower), detailHtml: detail(s.flower, hrs(ctx, s.growH)), finishAt: s.finishAt, finishText: m.fmtTime(s.finishAt),
        sleepWaste: s.sleepWaste, chainHtml: m.info(s.flower).chainHtml });
    }
    // the Petal Blessed batch: now when it is ready, else at its time
    for (const f of plan.pbFlowers) {
      rows.push({ key: `p${rows.length}`, pb: true, at: plan.pbReady ? now : plan.pbTime, now: plan.pbReady,
        whenText: plan.pbReady ? "⚡ Use Petal Blessed now" : `⚡ PB ${m.fmtTime(plan.pbTime)}`, flower: f.name, iconHtml: icon(ctx, f.name),
        detailHtml: detail(f.name, `saves ${hrs(ctx, f.growH)}`), chainHtml: m.info(f.name).chainHtml });
    }
    const saved = plan.pbFlowers.reduce((s, f) => s + f.growH, 0);
    const d = plan.pbTime ? plan.pbTime - now : 0;
    const summary = kpis([{ v: plan.pbReady ? "READY" : plan.pbTime ? `${Math.floor(d / 3600000)}h ${Math.floor((d % 3600000) / 60000)}m` : "—", l: "⚡ Petal Blessed" },
      { v: rows.filter((r) => !r.pb).length, l: "plantings before it" }, { v: saved ? hrs(ctx, saved) : "—", l: "PB batch saves" },
      { v: `${two(sleep.start)}–${two(sleep.end)}`, l: "💤 sleep (⚙; a harvest landing in it is marked)" }]);
    const idle = !plan.pbReady && plan.steps.length && plan.idleH > 0.5 && plan.pbTime ? `<div class="v-note v-warn">⏳ ${Math.round(plan.idleH * 10) / 10}h idle before Petal Blessed</div>`
      : !plan.pbReady && !plan.steps.length ? `<div class="v-note">${!plan.pbTime ? "No Petal Blessed data · plant highest priority flowers" : "⏳ No flowers fit before Petal Blessed — wait for PB"}</div>` : "";
    // the idle note sits above the table, so it shows even with nothing to plant
    return { rows, summary: summary + idle, footer: "", empty: "Nothing to plant right now." };
  },
};

// ── iPhone glance models; ui/glance-templates offers the looks ──
// gift planner: planned gifts given today (ring); the planned NPCs, the ones still to give first
flowerGifts.look = "number";
flowerGifts.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = flowerGifts.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const planned = out.rows.filter((r) => r.planned);
  if (!planned.length) return { empty: "No gifts planned — pick a flower per NPC in the gift planner." };
  const given = planned.filter((r) => r.givenToday).length;
  const ready = planned.filter((r) => r.next && !r.next.pointsAway).length;
  return {
    head: { value: given, unit: `/${planned.length}`, tone: given === planned.length ? "ok" : "", cap: "planned gifts given today",
      ring: (given / planned.length) * 100, ringTone: given === planned.length ? "ok" : "accent" },
    items: planned.slice().sort((a, b) => a.givenToday - b.givenToday).map((r) => ({ icon: icon(ctx, r.planned), name: r.name,
      sub: r.next ? `${r.planned} · ${r.next.pointsAway ? `${r.next.pointsAway} to the reward` : "reward ready"}` : r.planned,
      chip: r.givenToday ? { text: "given", tone: "ok" } : { text: "to give", tone: "bad" }, pct: Math.min(100, r.pct) })),
    tiles: [{ label: "given", value: `${given}/${planned.length}` }, { label: "planned", value: `${planned.length}/${out.rows.length}` },
      { label: "rewards", value: ready }],
    foot: `${planned.length - given} still to give today`,
  };
};

// gift cycle: one cycle's length (or that the beds cannot keep up); the daily demand per flower
flowerGiftCycle.look = "number";
flowerGiftCycle.glanceModel = ({ farm } = {}, ctx = {}) => {
  if (!farm) return { empty: "No farm data." };
  const m = modelOf(farm, ctx);
  if (!m) return { empty: NO_MODEL };
  const c = m.cycle;
  if (!c) return { empty: "No gifts planned — pick flowers in the gift planner." };
  const items = c.needList.map((n) => ({ icon: icon(ctx, n.flower), name: n.flower, sub: `have ${n.have}${n.pend > 0 ? `+${n.pend}` : ""} · ${n.hours.toFixed(1)}h`,
    value: `${n.qty}/day`, tone: n.have + n.pend >= n.qty ? "ok" : "warn", pct: n.qty ? Math.min(100, ((n.have + n.pend) / n.qty) * 100) : 100 }));
  const load = overload(m);
  if (load) {
    return { head: { value: "Too much", tone: "bad", cap: load > 24 ? `the plan needs ~${Math.round(load)}h of growing a day` : "the schedule did not settle" },
      items, tiles: [{ label: "grow/day", value: `${Math.round(load)}h` }, { label: "beds", value: m.beds }], foot: "plan fewer gifts or shorter chains" };
  }
  const len = c.cycleH >= 24 ? `${(c.cycleH / 24).toFixed(1)}d` : `${c.cycleH.toFixed(1)}h`;
  return {
    head: { value: len, cap: `one cycle · ${c.totalBatches} batch${c.totalBatches === 1 ? "" : "es"}` },
    items,
    tiles: [{ label: "batches", value: c.totalBatches }, { label: "⚡ PB uses", value: c.pbUsesInCycle }, { label: "yield", value: `×${m.yieldFactor.toFixed(2)}` }],
    foot: c.longestFlower ? `Petal Blessed on ${c.longestFlower}` : "",
  };
};

// Petal Blessed: its state; the flowers to plant before using it, the hours each saves
petalBlessed.look = "number";
petalBlessed.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = petalBlessed.build(data, ctx, opts);
  if (!out.summary) return { empty: out.empty };
  const st = modelOf(data.farm, ctx, opts).status;
  const saved = out.rows.reduce((s, p) => s + p.seedHours, 0), top = Math.max(...out.rows.map((p) => p.seedHours), 1e-9);
  const state = st.status === "ready" ? "Ready" : st.status === "cooldown"
    ? (typeof ctx.countdown === "function" ? ctx.countdown(st.nextAt - (ctx.now || Date.now())) : "Cooling") : "Locked";
  return {
    head: { value: state, tone: st.status === "ready" ? "ok" : st.status === "cooldown" ? "info" : "",
      cap: out.rows.length ? `${out.rows.length} to plant · saves ${hrs(ctx, saved)}` : "nothing left to grow" },
    items: out.rows.map((r) => ({ icon: r.iconHtml, name: r.name, sub: `${r.seedLabel} Seed + ${r.input}`, value: r.savedText, pct: (r.seedHours / top) * 100 })),
    tiles: [{ label: "⚡ PB", value: state }, { label: "to plant", value: out.rows.length }, { label: "saves", value: hrs(ctx, saved) }],
    foot: out.rows.length ? "plant these, then use instant grow" : "",
  };
};

// grow planner: the next thing to do; the plantings in order, each counting down to its time
growPlanner.look = "next";
growPlanner.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = growPlanner.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const list = out.rows.slice().sort((a, b) => a.at - b.at), r0 = list[0];
  const pb = list.find((r) => r.pb), now = ctx.now || Date.now();
  // how long until it: a clock time ("Sat 15:08") is too wide for a glance number
  const soon = (r) => (r.now ? "now" : countdown(r.at, now));
  return {
    head: { value: r0.now ? "Now" : soon(r0), tone: r0.now ? "ok" : "", hero: r0.iconHtml,
      cap: `${r0.pb ? "⚡ Petal Blessed" : "plant"} ${r0.flower}${list.length > 1 ? ` · ${list.length - 1} more` : ""}` },
    items: list.map((r) => ({ icon: r.iconHtml, name: r.flower, sub: r.pb ? "⚡ Petal Blessed" : r.finishText ? `ready ${r.finishText}` : "",
      at: r.at })),
    tiles: [{ label: "next", value: soon(r0) }, { label: "plantings", value: list.filter((r) => !r.pb).length },
      { label: "⚡ PB", value: pb ? soon(pb) : "—" }],
    foot: list.some((r) => r.sleepWaste) ? "💤 a harvest lands in your sleep" : "",
  };
};
