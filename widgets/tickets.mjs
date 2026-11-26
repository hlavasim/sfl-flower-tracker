// TICKETS as widgets: every panel of the page over compute?section=tickets (store "tickets"), so the
// page and its pinned copies are the same thing. The model is core/sections/tickets.mjs; these shape it.
//   summary (four numbers) · goal verdict · today's checklist · what earns you most · auction schedule ·
//   tickets-or-wait calculator · this chapter's auction · next chapter per lot · board history ·
//   sources cheapest first · last auction's ticket lots.
// The page's goal and calculator inputs stay page HTML; the widgets read the saved settings through
// ctx.goal() (sfl_tk_goal) and ctx.decide() (sfl_tk_decide).
import { ticketGoal } from "../core/sections/tickets.mjs";
import { bar, bigBar, pill } from "../ui/viz.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// The page's _tkFmt, in English: fixed decimals, "—" for nothing.
export const fmt = (n, dec = 0) => (n == null || !isFinite(n) ? "—"
  : Number(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
const date = (ms) => (ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");
const when = (ms) => new Date(ms).toLocaleString("en-US", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const cap = (x) => String(x || "").replace(/(^|[\s'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const icon = (ctx, n) => (n && typeof ctx.icon === "function" ? ctx.icon(n) : "");
const flw = (ctx) => ctx.flower || "FLOWER";
const named = (ctx, n) => `${icon(ctx, n)}${esc(n)}`;
const itemList = (ctx, items) => Object.entries(items || {}).map(([k, v]) => `${v}× ${named(ctx, k)}`).join(", ");
const note = (t) => `<div class="v-tickets-note">${t}</div>`;
const NO_DATA = "Tickets did not load.";
const ok = (t) => !!(t && t.chapter && Array.isArray(t.sources));

export const GROUP = { daily: "🎁 Daily reward", delivery: "📦 Delivery", chore: "📋 Chore", bounty: "🎯 Bounty", animal: "🐾 Animal bounty" };
const KIND = { free: "you do it anyway", plant: "you have to grow this", consume: "uses up ingredients", fish: "casts + the daily limit", unknown: "cost unknown" };

// One source's "what", with every item's icon.
function what(ctx, s) {
  if (s.group === "daily") return "Claim the daily reward";
  if (s.group === "delivery") return `<b>${esc(cap(s.label))}</b>: ${s.items ? itemList(ctx, s.items) : "waiting for a new order"}`;
  if (s.group === "chore") return `${s.npc ? `<b>${esc(cap(s.npc))}</b>: ` : ""}${icon(ctx, s.item)}${esc(s.label)}`;
  if (s.group === "bounty") return `Deliver ${named(ctx, s.label)}`;
  if (s.group === "animal") return `Deliver ${icon(ctx, s.animal)}<b>${esc(s.animal)}</b> at level ${s.level}+`;
  return esc(s.label || "");
}

// The saved goal (page's _tkGoal) and calculator (_tkSaved) settings, with the page's defaults.
export function goalSettings(raw) {
  const g = raw && typeof raw === "object" ? raw : {};
  // "jiný" = "another item", saved by the page before it was translated
  return { item: g.item === "jiný" ? "other" : g.item || "", est: +g.est || 0, unit: g.unit === "flower" ? "flower" : "usd", tickets: +g.tickets || 13000 };
}
export function decideSettings(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  return { est: s.est != null ? s.est : 1500, unit: s.unit || "usd", tier: s.tier || "top", custom: s.custom || 13000 };
}
const callOr = (fn, d) => (typeof fn === "function" ? fn() : d);

// The chapter goal and the ticket value it implies (the page's _ticketsHtml head): while this
// chapter's ticket auction is ahead it plans for it, after it for the next one.
export function ticketPlan(d, rawGoal) {
  const g = goalSettings(rawGoal);
  const c = d.chapter, ta = d.thisAuction;
  let limit = d.guide.ticketValue;
  const auctionOpen = !!(ta && ta.weeksUntil > 0);
  const usd = d.rates.sflUsd || 0;
  const goalValue = g.unit === "flower" ? g.est : (usd > 0 ? g.est / usd : 0);
  const forNext = !auctionOpen;
  const weeksLeft = forNext ? d.assumptions.weeksToAuction : ta.weeksUntil;
  const curve = d.history && d.history.curve && d.history.curve.length
    ? d.history.curve.filter((x) => x.share >= 0.5).map((x) => [x.ticketsPerWeek, x.cost])
    : d.plans.map((x) => [x.ticketsPerWeek, x.costPerWeek]);
  const goal = g.est > 0 && g.tickets > 0 ? ticketGoal({ value: goalValue, tickets: g.tickets }, {
    collected: forNext ? 0 : c.collected, weeksLeft,
    track: d.track * Math.min(1, weeksLeft / d.assumptions.weeksToAuction), curve, rounds: d.rounds }) : null;
  const goalDrives = !!(goal && goal.verdict === "collect" && goal.ticketValue > limit);
  if (goalDrives) limit = goal.ticketValue;
  return { g, goal, limit, goalDrives, auctionOpen, forNext, weeksLeft, goalValue, usd };
}

// ── 1. four numbers ──
const tile = (label, value, sub, cls = "") => `<div class="v-kpi"><b class="${cls}">${value}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
export const ticketsSummary = {
  type: "tickets-summary",
  title: "🎟️ Tickets at a glance",
  page: "tickets",
  needs: (farmId) => ({ tickets: { res: "tickets", farm: farmId } }),
  view({ tickets: d } = {}, ctx = {}) {
    if (!ok(d)) return { empty: NO_DATA };
    const c = d.chapter, ta = d.thisAuction, tl = d.timeline;
    const auctionOpen = !!(ta && ta.weeksUntil > 0);
    const days = auctionOpen ? Math.max(0, Math.round(ta.weeksUntil * 7)) : 0;
    const best = d.items.filter((i) => i.source === "auction" && !i.owned && i.perDay > 0).sort((a, b) => b.perDay - a.perDay)[0] || null;
    const html = `<div class="v-kpis v-tickets-kpis">` +
      tile("by the auction you'll have", auctionOpen ? `${fmt(ta.ticketsExpected)} ${icon(ctx, c.ticket)}` : "—", `now ${fmt(c.collected)}`) +
      tile("ticket auction", auctionOpen ? (days <= 0 ? "running now" : `in ${days} days`) : "over", tl.ticketAuction ? `from ${date(tl.ticketAuction)}` : "") +
      tile("your pace", `${fmt(c.perWeek)} / week`, `${c.perWeekFrom === "history" ? "from past chapters · " : ""}top players ${fmt(d.observedTop.perWeek)}`) +
      tile("auction target", best ? named(ctx, best.name) : "—", best ? `+${fmt(best.perDay, 2)} FLOWER / day` : "", "v-done") +
      `</div>`;
    return { html };
  },
};

// ── 2. the chapter goal's verdict ──
export const ticketsGoal = {
  type: "tickets-goal",
  title: "🎯 Chapter goal",
  page: "tickets",
  needs: (farmId) => ({ tickets: { res: "tickets", farm: farmId } }),
  view({ tickets: d } = {}, ctx = {}) {
    if (!ok(d)) return { empty: NO_DATA };
    const P = ticketPlan(d, callOr(ctx.goal, {}));
    const { g, goal, forNext, weeksLeft, usd } = P;
    const tk = `${icon(ctx, d.chapter.ticket)}${esc(d.chapter.ticket)}`;
    const money = (f) => `${fmt(f)} ${flw(ctx)}${usd > 0 ? ` <span class="v-dim">($${fmt(f * usd)})</span>` : ""}`;
    let h = `<div class="v-tickets-sub">${forNext ? `Next chapter · ${fmt(weeksLeft)} weeks of tasks before the auction` : `This chapter · auction in ${fmt(weeksLeft * 7)} days`}` +
      (g.item || g.est ? ` · ${g.item && g.item !== "other" ? named(ctx, g.item) : "an item"}${g.est ? ` worth ~${fmt(g.est)} ${g.unit === "usd" ? "$" : "FLOWER"}` : ""} · lot for ${fmt(g.tickets)} ${tk}` : "") + `</div>`;
    if (!goal) return { html: h + note("Pick an item, enter what you think it will be worth after the chapter and how many tickets its lot will take — this says whether collecting pays off.") };
    const alt = `gem round ~${money(goal.gemCost || 0)} · wait and buy ~${money(goal.waitCost)}`;
    const box = (tone, head, body) => `<div class="v-tickets-verdict v-${tone}"><b>${head}</b><div>${body}</div></div>`;
    h += goal.verdict === "collect"
      ? box("ok", "✅ Collect — it pays off", `You need ~${fmt(goal.needPerWeek)} ${tk} a week (${fmt(weeksLeft, 1)} weeks), it costs ~${money(goal.cost)} → net <b class="v-done">+${fmt(goal.net)}</b> ${flw(ctx)}. A ticket is worth ~${fmt(goal.ticketValue, 2)} ${flw(ctx)} to you now; the checklist follows that.<br><span class="v-dim">For comparison: ${alt}.</span>`)
      : goal.verdict === "not-worth"
      ? box("bad", "❌ Don't collect — enough tickets, but they cost more than the item brings", `Collecting ~${money(goal.cost)} for an item worth ~${money(goal.value * 0.9)}. Cheaper: ${alt}.`)
      : box("mid", "⚠️ You won't make it", `You need ~${fmt(goal.needPerWeek)} ${tk} a week; the boards give at most ~${fmt(goal.maxPerWeek)} → at most ~${fmt(goal.maxTickets)} of ${fmt(goal.tickets)} by the auction. Instead: ${alt}.`);
    const reach = goal.tickets > 0 ? Math.min(100, (goal.maxTickets / goal.tickets) * 100) : 100;
    return { html: h + `<div class="v-tickets-row"><span class="v-dim">reachable by the auction</span>${bar(reach)}<span class="v-count">${fmt(goal.maxTickets)} / ${fmt(goal.tickets)}</span></div>` };
  },
};

// ── 3. today's checklist: groups that open into steps ──
const step = (done, text, sub, plus) => `<div class="v-tickets-step${done ? " w-st-done" : ""}"><span>${done ? "✅" : "⬜"}</span>` +
  `<div>${text}${sub ? `<small>${sub}</small>` : ""}</div><b class="v-done">+${plus}</b></div>`;
export const ticketsToday = {
  type: "tickets-today",
  title: "✅ Today's ticket checklist",
  page: "tickets",
  needs: (farmId) => ({ tickets: { res: "tickets", farm: farmId } }),
  view({ tickets: d } = {}, ctx = {}) {
    if (!ok(d)) return { empty: NO_DATA };
    const { limit, goalDrives } = ticketPlan(d, callOr(ctx.goal, {}));
    const worth = (s) => s.perTicket != null && s.perTicket <= limit;
    const tl = d.timeline, tk = `${icon(ctx, d.chapter.ticket)}${esc(d.chapter.ticket)}`;
    const groups = [];
    const deliveries = d.sources.filter((s) => s.group === "delivery" && worth(s));
    if (deliveries.length) groups.push({ icon: "📦", name: "Deliveries", note: "every day", rows: deliveries.map((s) => ({ done: s.done, tickets: s.tickets, html: step(s.done, what(ctx, s), "", s.tickets) })) });
    const chores = d.sources.filter((s) => s.group === "chore" && worth(s));
    if (chores.length) groups.push({ icon: "📋", name: "Chores", note: `by Monday (${tl.daysLeftInWeek} days)`, rows: chores
      .sort((a, b) => (a.done - b.done) || ((b.perDay || 0) - (a.perDay || 0)))
      .map((s) => {
        const ready = !s.done && s.remaining === 0;
        const sub = s.done ? "done" : ready ? "complete — claim it at the NPC"
          : s.required ? `${fmt(s.progress)} / ${fmt(s.required)} · ${fmt(s.remaining)} left · <b class="v-tickets-today">today ~${fmt(s.perDay)}</b>` : "";
        const tag = s.kind === "plant" && !s.done && !ready ? ` <span title="you have to have it planted / growing">🌱</span>` : "";
        return { done: s.done, tickets: s.tickets, html: step(s.done, what(ctx, s) + tag, sub, s.tickets) };
      }) });
    const bounties = d.sources.filter((s) => s.group === "bounty" && worth(s));
    if (bounties.length) groups.push({ icon: "🎯", name: "Bounties", note: "this week", rows: bounties.map((s) => ({ done: s.done, tickets: s.tickets, html: step(s.done, what(ctx, s), "", s.tickets) })) });
    const animals = d.sources.filter((s) => s.group === "animal" && worth(s));
    if (animals.length) groups.push({ icon: "🐔", name: "Young-animal bounties", note: "this week", rows: animals.map((s) => ({ done: s.done, tickets: s.tickets,
      html: step(s.done, what(ctx, s), s.feed > 0 ? `feed ~${fmt(s.feed, 2)} FLOWER` : "free feed (golden animal)", s.tickets) })) });
    const daily = d.sources.find((s) => s.group === "daily");
    if (daily) groups.unshift({ icon: "🎁", name: "Daily reward", note: "every day", rows: [{ done: daily.done, tickets: 1, html: step(daily.done, "Claim the daily reward", "", 1) }] });
    const all = groups.flatMap((g) => g.rows), openN = all.filter((r) => !r.done).length;
    let h = note(`Only what costs less than ~${fmt(limit, 2)} FLOWER a ticket${goalDrives ? " (from your goal)" : ""}. Chores are spread over the days left so you finish them before the Monday reset.`);
    if (all.length) h += bigBar(((all.length - openN) / all.length) * 100);
    h += groups.map((g) => {
      const open = g.rows.filter((r) => !r.done), plus = open.reduce((s, r) => s + r.tickets, 0);
      return `<details class="v-tickets-group"${open.length ? " open" : ""}><summary><span>${g.icon} <b>${g.name}</b> <span class="v-dim">${g.note}</span></span>` +
        `<span>${open.length ? `${open.length} left · <b class="v-done">+${plus}</b>` : "✅ done"}</span></summary>${g.rows.map((r) => r.html).join("")}</details>`;
    }).join("");
    // Not worth it: one folded list.
    const skip = d.sources.filter((s) => !s.done && s.tickets > 0 && !worth(s));
    const w = (s) => (s.per === "day" ? 7 : 1);
    const skipT = skip.reduce((a, s) => a + s.tickets * w(s), 0), skipC = skip.reduce((a, s) => a + (s.cost || 0) * w(s), 0);
    if (skip.length) {
      h += `<details class="v-tickets-group v-tickets-skip"><summary><span>❌ Not worth it: ${skip.length} ${skip.length === 1 ? "thing" : "things"} (+${fmt(skipT)} ${tk} a week would cost ~${fmt(skipC)} FLOWER)</span></summary>` +
        `<table class="w-table"><tr><th>what</th><th style="text-align:right">${esc(d.chapter.ticket)}</th><th style="text-align:right">FLOWER / ticket</th></tr>` +
        skip.slice().sort((a, b) => (a.perTicket ?? 9) - (b.perTicket ?? 9)).map((s) => `<tr><td>${GROUP[s.group] || s.group}: ${what(ctx, s)}</td>` +
          `<td style="text-align:right">+${s.tickets}${s.per === "day" ? "/day" : ""}</td><td style="text-align:right">${s.perTicket == null ? "?" : fmt(s.perTicket, 2)}</td></tr>`).join("") +
        `</table></details>`;
    }
    return { html: h };
  },
};

// ── 4. what earns you most: the chapter's auction and shop items by FLOWER a day ──
const itemVal = (i) => (i.perDay != null ? i.perDay : i.perUse != null ? i.perUse / 7 : null);
export const ticketsItems = {
  type: "tickets-items",
  title: "🏆 What earns you most",
  page: "tickets",
  needs: (farmId) => ({ tickets: { res: "tickets", farm: farmId } }),
  defaults: { sort: { key: "value", dir: "desc" } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.owned ? "w-st-done" : ""),
  columns: [
    { key: "name", label: "item", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b>${r.owned ? " ✅" : ""}${r.have > 0 ? ` <span class="v-dim">×${fmt(r.have)}</span>` : ""}` +
      `<small>${esc(r.what)}${r.basis ? ` — ${esc(r.basis)}` : ""}</small></div></div>` },
    { key: "bar", label: "", get: (r) => r.rel, fmt: (v) => bar(v, "ok") },
    { key: "source", label: "from", filter: true, filterLabel: (v) => (v === "auction" ? "🔨 auction" : "🛒 shop"), fmt: (v) => (v === "auction" ? "🔨 auction" : "🛒 shop") },
    { key: "price", label: "price", align: "right", get: (r) => (r.source === "auction" ? null : r.tickets || null),
      fmt: (v, r) => (r.source === "auction" ? `<span class="v-dim">auction</span>` : r.tickets ? `${fmt(r.tickets)} ${r.ticketIcon}` : esc(r.price)) },
    { key: "value", label: "FLOWER", align: "right", get: (r) => r.val,
      fmt: (v, r) => (r.perDay != null ? `<b>${fmt(r.perDay, 2)}</b><span class="v-dim"> /day</span>` : `<b>${fmt(r.perUse, 2)}</b><span class="v-dim"> /use</span>`) },
  ],
  // FLOWER a day on this farm (from what it actually does); an hourglass is priced per use.
  build({ tickets: d } = {}, ctx = {}) {
    if (!ok(d)) return { rows: [], footer: "", empty: NO_DATA };
    const priced = d.items.filter((i) => i.perDay != null || i.perUse != null);
    const unpriced = d.items.filter((i) => i.perDay == null && i.perUse == null);
    const max = Math.max(0.01, ...priced.map(itemVal));
    const rows = priced.map((i) => ({ ...i, val: itemVal(i), rel: Math.max(2, Math.round((itemVal(i) / max) * 100)),
      iconHtml: icon(ctx, i.name), ticketIcon: icon(ctx, d.chapter.ticket) }));
    const footer = (unpriced.length ? `<div class="v-tickets-note">Can't price: ${unpriced.map((i) => named(ctx, i.name)).join(", ")}</div>` : "") +
      note("This chapter's auction and shop, FLOWER a day on your farm (from what you actually do). Hourglasses are single-use.");
    return { rows, footer, empty: "No auction or shop items this chapter." };
  },
};

// ── 5. the auction schedule ──
export const ticketsSchedule = {
  type: "tickets-schedule",
  title: "🔨 Auction schedule",
  page: "tickets",
  needs: (farmId) => ({ tickets: { res: "tickets", farm: farmId } }),
  defaults: {},
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.ended ? "w-st-done" : r.soon ? "w-st-ready" : ""),
  columns: [
    { key: "name", label: "item", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b>${r.owned ? " ✅" : ""}` +
      `<small>${r.kind === "wearable" ? "wearable" : r.kind === "nft" ? "NFT" : "collectible"} · ${esc(r.supply)} pcs</small></div></div>` },
    { key: "next", label: "next round", align: "right", get: (r) => r.next,
      fmt: (v, r) => (r.ended ? `<span class="v-dim">ended</span>` : `${r.soon ? pill(r.whenText, "run") : esc(r.whenText)}<div class="dash-detail">${r.left} of ${r.rounds.length} rounds left</div>`) },
    { key: "perDay", label: "FLOWER/day", align: "right", get: (r) => (r.kind === "nft" ? null : r.perDay),
      fmt: (v, r) => (r.kind === "nft" ? `<span class="v-dim">—</span>` : r.perDay == null ? `<span class="v-dim">?</span>`
        : r.perDay > 0 ? `<b class="v-done">+${fmt(r.perDay, 2)}</b>` : `<span class="v-dim">0</span>`) },
    { key: "resale", label: "resale", align: "right", fmt: (v) => (v != null ? fmt(v, v < 100 ? 1 : 0) : `<span class="v-dim">—</span>`) },
    { key: "rounds", label: "all rounds", extra: true, get: (r) => r.rounds.length, fmt: (v, r) => esc(r.rounds.map(when).join(", ")) },
    { key: "why", label: "why", extra: true, get: (r) => [r.what, r.basis].filter(Boolean).join(" — "), fmt: (v) => `<span class="v-dim">${esc(v)}</span>` },
  ],
  build({ tickets: d } = {}, ctx = {}) {
    if (!ok(d)) return { rows: [], footer: "", empty: NO_DATA };
    const sch = d.schedule;
    if (!sch || !sch.items || !sch.items.length) return { rows: [], footer: "", empty: "No auction schedule for this chapter." };
    const soon = sch.items.filter((i) => i.next).map((i) => i.next).sort((a, b) => a - b)[0] || null;
    const rows = sch.items.map((i) => ({ ...i, ended: !i.next, soon: !!(i.next && i.next === soon), whenText: i.next ? when(i.next) : "",
      iconHtml: icon(ctx, i.name) }));
    const footer = note(`Every item has ${rows[0].rounds.length} rounds 5 hours apart; start times are your local time. The game shows the round prices only at the auction. <b>FLOWER/day</b> = what it would add on your farm (✅ = you already have it, a second one adds nothing). <b>Resale</b> = today's floor after the 10 % fee: worth bidding that much even for a piece you only sell (this chapter's new items have no floor yet — they sell after the chapter ends). Copied from the game ${esc(sch.readAt || "")}.`);
    return { rows, footer, empty: "" };
  },
};

// ── 6. collect tickets, bid gems, bid FLOWER, or wait and buy? ──
export function decidePaths(d, s) {
  const usd = d.rates.sflUsd || 0;
  const est = +s.est || 0, custom = +s.custom || 0;
  const V = s.unit === "usd" ? (usd > 0 ? est / usd : 0) : est;
  const lots = d.auction.lots;
  const need = s.tier === "custom" ? custom
    : s.tier === "top" ? Math.round(Math.max(...lots.map((l) => l.tickets)))
    : Math.round(lots.filter((l) => l.tickets > 2000 && l.tickets < 7000).reduce((a, l, _, arr) => a + l.tickets / arr.length, 0));
  const weeks = d.assumptions.weeksToAuction;
  const perWeek = Math.max(0, (need - d.track) / weeks);
  // Ticket cost: the history's curve when there is one, else this week's plans.
  const pts = d.history && d.history.curve && d.history.curve.length
    ? d.history.curve.filter((c) => c.share >= 0.5).map((c) => [c.ticketsPerWeek, c.cost])
    : d.plans.map((p) => [p.ticketsPerWeek, p.costPerWeek]);
  let tkCost = null;
  for (let i = 0; i < pts.length; i++) {
    if (perWeek <= pts[i][0]) {
      const [t0, c0] = i ? pts[i - 1] : [0, 0], [t1, c1] = pts[i];
      tkCost = (c0 + (c1 - c0) * (t1 > t0 ? (perWeek - t0) / (t1 - t0) : 0)) * weeks; break;
    }
  }
  const maxPerWeek = pts.length ? pts[pts.length - 1][0] : 0;
  return { V, usd, need, weeks, perWeek, tkCost, maxPerWeek, maxTickets: Math.round(maxPerWeek * weeks + d.track) };
}
export const ticketsDecide = {
  type: "tickets-decide",
  title: "🧮 Collect tickets, or wait and buy?",
  page: "tickets",
  needs: (farmId) => ({ tickets: { res: "tickets", farm: farmId } }),
  view({ tickets: d } = {}, ctx = {}) {
    if (!ok(d)) return { empty: NO_DATA };
    const s = decideSettings(callOr(ctx.decide, {}));
    const { V, usd, need, weeks, perWeek, tkCost, maxPerWeek, maxTickets } = decidePaths(d, s);
    const r = d.rounds, gems = d.rates.gemsPerSFL;
    const fmtF = (x) => `${fmt(x)} ${flw(ctx)}${usd > 0 ? ` <span class="v-dim">($${fmt(x * usd)})</span>` : ""}`;
    const range = (q) => (q ? `${fmt(V * q.min)}–${fmt(V * q.max)}` : "—");
    const paths = [];
    paths.push({ label: "🎟️ Collect tickets", cost: tkCost,
      how: tkCost == null
        ? `<span class="v-miss">out of reach</span> — you need ${fmt(need)} tickets in ${weeks} weeks (${fmt(perWeek)}/week); historically at most ~${fmt(maxTickets)} were doable (${fmt(maxPerWeek)}/week in at least half the weeks). Top players get there thanks to events.`
        : `${fmt(need)} tickets = ${fmt(perWeek)}/week for ${weeks} weeks (+${d.track} from the track). Winning is not certain: on a tie, ascension and level decide.` });
    if (r.gem) paths.push({ label: "💎 Gem round", cost: V * r.gem.median,
      how: `last time ${Math.round(r.gem.median * 100)} % of the later price (${Math.round(r.gem.min * 100)}–${Math.round(r.gem.max * 100)} %, range ${range(r.gem)}) · ≈ ${fmt(V * r.gem.median * gems)} gems, you have ${fmt(d.rates.gems)}` });
    if (r.flower) paths.push({ label: "🌸 FLOWER round", cost: V * r.flower.median,
      how: `last time ${Math.round(r.flower.median * 100)} % of the later price (${Math.round(r.flower.min * 100)}–${Math.round(r.flower.max * 100)} %) — the auction overbids` });
    paths.push({ label: "⏳ Wait and buy on the market", cost: V,
      how: `after the chapter ends${d.chapter.end ? ` (${date(d.chapter.end)})` : ""} · the last sales are often lower still, ~${r.lastSale ? Math.round(r.lastSale.median * 100) : "?"} % of the floor` });
    const best = paths.filter((p) => p.cost != null).reduce((b, p) => (!b || p.cost < b.cost ? p : b), null);
    const html = (V > 0 ? `<div class="v-tickets-sub">Estimate ${fmtF(V)}${s.unit === "usd" ? ` (rate ${fmt(usd, 3)} $/FLOWER)` : ""} · lot for ${fmt(need)} ${icon(ctx, d.chapter.ticket)}tickets</div>` : "") +
      `<table class="w-table"><tr><th>path</th><th style="text-align:right">costs about</th><th>how</th></tr>` +
      paths.map((p) => `<tr${p === best ? ' class="w-st-ready"' : ""}><td style="white-space:nowrap">${p.label}${p === best ? " ✅" : ""}</td>` +
        `<td style="text-align:right;white-space:nowrap">${p.cost == null ? "—" : fmtF(p.cost)}</td><td class="dash-detail">${p.how}</td></tr>`).join("") + `</table>` +
      note(`Tickets are worth nothing after the auction (shop only); gems and FLOWER come back if you lose. Round ratios from ${r.gem ? r.gem.n : 0} items of the last auction, collecting cost from ${d.history && d.history.all ? d.history.all.weeks + " weeks of history" : "this board"} (today's prices).`);
    return { html };
  },
};

// ── 7. this chapter's auction: what you'll have and the next lot ──
export const ticketsThisAuction = {
  type: "tickets-this-auction",
  title: "🔨 This chapter's auction",
  page: "tickets",
  needs: (farmId) => ({ tickets: { res: "tickets", farm: farmId } }),
  view({ tickets: d } = {}, ctx = {}) {
    if (!ok(d)) return { empty: NO_DATA };
    const ta = d.thisAuction;
    if (!(ta && ta.weeksUntil > 0)) return { empty: "This chapter's ticket auction is behind you." };
    const tk = icon(ctx, d.chapter.ticket), fl = flw(ctx);
    const lots = d.auction.lots.filter((l) => l.value > 0).sort((a, b) => a.tickets - b.tickets);
    // The lots just out of reach (within ~2,000 tickets), and of those the most valuable one.
    const near = lots.filter((l) => l.tickets > ta.ticketsExpected && l.tickets - ta.ticketsExpected <= 2000);
    const nextLot = near.slice().sort((a, b) => b.value - a.value)[0] || null;
    const gap = nextLot ? nextLot.tickets - ta.ticketsExpected : 0;
    const days = Math.max(0, Math.floor(ta.weeksUntil * 7));
    // Cheapest open sources that fit before the auction (daily ones × days left).
    const open = d.sources.filter((s) => !s.done && s.perTicket != null && s.tickets > 0)
      .map((s) => ({ ...s, reps: s.per === "day" ? days : 1 })).filter((s) => s.reps > 0)
      .sort((a, b) => a.perTicket - b.perTicket);
    let got = 0, spent = 0; const pick = [];
    for (const s of open) { if (got >= gap) break; got += s.tickets * s.reps; spent += (s.cost || 0) * s.reps; pick.push(s); }
    let h = note(`The auction starts the week of <b>${date(ta.at)}</b> (in ${fmt(ta.weeksUntil * 7)} days). Tickets you get after it do not count. This chapter's lot prices are set by the server at the auction — the comparison is with last chapter's lots.`);
    h += `<div class="v-tickets-sub">By the auction you'll have about <b>${fmt(ta.ticketsExpected)}</b> ${tk}. ` +
      (ta.lastChapterEquivalent ? `Last time that would have won ${named(ctx, ta.lastChapterEquivalent)}. ` : "") +
      (nextLot ? `${named(ctx, nextLot.name)} (value ${fmt(nextLot.value)} ${fl}) is <b class="v-miss">${fmt(gap)}</b> away.` : "") + `</div>`;
    if (nextLot) h += `<div class="v-tickets-row">${bar((ta.ticketsExpected / nextLot.tickets) * 100)}<span class="v-count">${fmt(ta.ticketsExpected)} / ${fmt(nextLot.tickets)}</span></div>`;
    if (near.length > 1) h += note(`Just above you: ${near.map((l) => `${named(ctx, l.name)} +${fmt(l.tickets - ta.ticketsExpected)} (${fmt(l.value)} ${fl})`).join(" · ")}`);
    if (nextLot && pick.length) {
      h += `<div class="v-tickets-sub">Cheapest way to close the gap (${got >= gap ? "enough" : "not enough"} — +${fmt(got)} for ${fmt(spent, 1)} ${fl}):</div>` +
        `<ul class="v-tickets-list">${pick.map((s) => `<li>${GROUP[s.group] || s.group}: ${what(ctx, s)} — +${s.tickets}${s.reps > 1 ? ` × ${s.reps} days` : ""}, ${fmt(s.perTicket, 3)} ${fl}/ticket</li>`).join("")}</ul>`;
    }
    return { html: h };
  },
};

// ── 8. next chapter: what each lot costs to reach ──
export const ticketsNextChapter = {
  type: "tickets-next-chapter",
  title: "📈 Next chapter — what each lot costs",
  page: "tickets",
  needs: (farmId) => ({ tickets: { res: "tickets", farm: farmId } }),
  defaults: { sort: { key: "tickets", dir: "asc" } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.net != null && r.net > 0 ? "w-st-ready" : !r.reachable ? "w-st-done" : ""),
  columns: [
    { key: "name", label: "lot (last chapter)", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b></div></div>` },
    { key: "tickets", label: "tickets to win", align: "right", fmt: (v) => fmt(v) },
    { key: "needPerWeek", label: "need / week", align: "right", fmt: (v) => fmt(v) },
    { key: "lotValue", label: "value", align: "right", fmt: (v) => fmt(v) },
    { key: "cost", label: "cheapest cost", align: "right", fmt: (v) => (v == null ? "—" : fmt(v)) },
    { key: "net", label: "net", align: "right", fmt: (v) => (v == null ? "—" : `<b class="${v > 0 ? "v-done" : "v-miss"}">${v > 0 ? "+" : ""}${fmt(v)}</b>`) },
    { key: "verdict", label: "verdict", get: (r) => (!r.reachable ? 0 : r.net > 0 ? 2 : 1),
      fmt: (v, r) => (!r.reachable ? pill(`out of reach — ${fmt(r.shortPerWeek)}/week short`, "bad") : r.net > 0 ? pill("worth it", "ok") : pill("not worth it", "idle")) },
  ],
  build({ tickets: d } = {}, ctx = {}) {
    if (!ok(d)) return { rows: [], footer: "", empty: NO_DATA };
    const tk = `${icon(ctx, d.chapter.ticket)}${esc(d.chapter.ticket)}`, fl = flw(ctx), b = d.best;
    let summary = note(`Assumes ${d.assumptions.weeksToAuction} weeks of tasks before the auction (as in both last chapters), the same board as this week, deliveries every day, plus ${d.track} ${tk} from the chapter track. ` +
      `Lot value = today's price of the same item from last chapter after the ${Math.round(d.assumptions.marketFee * 100)} % fee. "Cheapest" = you do every source up to that price per ticket, cheapest first.`);
    if (b && b.net > 0) summary += `<div class="v-tickets-verdict v-ok"><b>✅ Earns the most</b><div>do everything up to <b>${fmt(b.maxPerTicket, 3)} ${fl}/ticket</b> → ${fmt(b.ticketsPerWeek)} ${tk}/week, ${fmt(b.atAuction)} by the auction, costs ${fmt(b.cost)} ${fl} → ${named(ctx, b.lot)} (${fmt(b.lotValue)}) = net <b class="v-done">+${fmt(b.net)}</b> ${fl}</div></div>`;
    const rows = d.perLot.map((l) => ({ ...l, iconHtml: icon(ctx, l.name) }));
    const o = d.observedTop;
    const footer = note(`Top lots go to players who do absolutely everything — the best farms' median was ${fmt(o.perWeek)} ${tk}/week (cap ${fmt(o.capTotal)} over ${o.weeks} weeks), more than one board shows (×2 delivery events, more animal bounties). On a tie, ascension decides, then level.`);
    return { rows, summary, footer, empty: "No lot of last chapter has a price today." };
  },
};

// ── 9. the board history: what "everything" cost each recorded week ──
export const ticketsHistory = {
  type: "tickets-history",
  title: "📚 Board history — what “everything” cost",
  page: "tickets",
  needs: (farmId) => ({ tickets: { res: "tickets", farm: farmId } }),
  view({ tickets: d } = {}, ctx = {}) {
    if (!ok(d)) return { empty: NO_DATA };
    const h = d.history;
    if (!h || !h.weeks || !h.weeks.length) return { empty: "No recorded weeks for this farm (only tracked farms have a history)." };
    const fl = flw(ctx), R = ' style="text-align:right"';
    let html = note("Every recorded week (its last snapshot) at today's prices: how many tickets every delivery, chore and bounty would have paid, and what that would cost. Weeks without a board (a chapter's first week, the auction week) are left out of the averages.");
    html += `<div class="v-tickets-scroll"><table class="w-table"><tr><th>chapter</th><th${R}>weeks</th><th${R}>max / week</th><th${R}>cost / week</th><th${R}>${fl} / ticket</th>` +
      `<th${R}>deliveries</th><th${R}>chores</th><th${R}>bounties</th><th${R}>animals</th></tr>` +
      h.chapters.map((c) => `<tr><td>${esc(c.name)} <span class="v-dim">(${named(ctx, c.ticket)})</span></td><td${R}>${c.weeks}</td>` +
        `<td${R}>${fmt(c.maxTickets)}</td><td${R}>${fmt(c.maxCost)}</td><td${R}><b>${fmt(c.maxCost / c.maxTickets, 3)}</b></td>` +
        ["delivery", "chore", "bounty", "animal"].map((k) => `<td${R}>${fmt(c.parts[k].tickets)} / ${fmt(c.parts[k].cost)}</td>`).join("") + `</tr>`).join("") +
      (h.all ? `<tr><td><b>All</b></td><td${R}><b>${h.all.weeks}</b></td><td${R}><b>${fmt(h.all.maxTickets)}</b></td><td${R}><b>${fmt(h.all.maxCost)}</b></td><td${R}><b>${fmt(h.all.maxCost / h.all.maxTickets, 3)}</b></td><td colspan="4"></td></tr>` : "") +
      `</table></div>`;
    html += `<div class="v-tickets-sub">What X tickets a week cost (median over the weeks; in brackets the share of weeks it was possible at all):</div>` +
      `<div class="v-tickets-chips">${h.curve.filter((c, i) => i % 2 === 1).map((c) => `<span class="v-tickets-chip">${fmt(c.ticketsPerWeek)}/w → ${fmt(c.cost)} (${Math.round(c.share * 100)} %)</span>`).join("")}</div>`;
    html += `<details class="v-tickets-group"><summary><span>Week by week (${h.weeks.length})</span></summary><div class="v-tickets-scroll"><table class="w-table">` +
      `<tr><th>week</th><th>chapter</th><th${R}>max tickets</th><th${R}>cost</th><th${R}>bounties done</th><th>expensive on the board</th></tr>` +
      h.weeks.slice().reverse().map((w) => `<tr${w.active ? "" : ' class="w-st-done"'}><td style="white-space:nowrap">${esc(String(w.wk).slice(0, 10))}</td><td>${esc(w.chapter)}</td>` +
        `<td${R}>${w.active ? fmt(w.maxTickets) : "no board"}</td><td${R}>${w.active ? fmt(w.maxCost) : "—"}</td>` +
        `<td${R}>${w.active ? `${w.parts.bounty.done}/${w.parts.bounty.n}` : "—"}</td>` +
        `<td class="dash-detail">${w.hard.map((x) => `${x.done ? "✅" : "⬜"} ${named(ctx, x.name)} ${fmt(x.cost, 1)}`).join(" · ")}</td></tr>`).join("") +
      `</table></div></details>`;
    return { html };
  },
};

// ── 10. every source, cheapest ticket first ──
export const ticketsSources = {
  type: "tickets-sources",
  title: "🧾 Ticket sources — cheapest first",
  page: "tickets",
  needs: (farmId) => ({ tickets: { res: "tickets", farm: farmId } }),
  defaults: { sort: { key: "perTicket", dir: "asc" } },
  rowKey: (r) => `${r.group}|${r.npc || ""}|${r.label}`,
  rowLabel: (r) => r.label,
  rowClass: (r) => (r.done ? "w-st-done" : ""),
  columns: [
    { key: "group", label: "source", filter: true, filterLabel: (v) => GROUP[v] || v, fmt: (v) => esc(GROUP[v] || v) },
    { key: "what", label: "what", get: (r) => r.label, fmt: (v, r) => r.whatHtml },
    { key: "tickets", label: "tickets", align: "right", fmt: (v, r) => `+${v} <span class="v-dim">${r.per === "day" ? "/day" : "/week"}</span>` },
    { key: "cost", label: "cost", align: "right", fmt: (v) => (v == null ? "?" : fmt(v, 2)) },
    { key: "perTicket", label: "FLOWER / ticket", align: "right", fmt: (v) => `<b>${v == null ? "?" : fmt(v, 3)}</b>` },
    { key: "done", label: "status", get: (r) => (r.done ? 1 : 0), fmt: (v) => (v ? pill("done", "ok") : pill("open", "idle")) },
    { key: "note", label: "note", get: (r) => r.noteText, fmt: (v, r) => `<span class="dash-detail">${r.noteHtml}</span>` },
  ],
  build({ tickets: d } = {}, ctx = {}) {
    if (!ok(d)) return { rows: [], footer: "", empty: NO_DATA };
    const tk = `${icon(ctx, d.chapter.ticket)}${esc(d.chapter.ticket)}`, bb = d.bountyBonus;
    const rows = d.sources.map((s) => {
      let noteHtml = "";
      if (s.group === "delivery") noteHtml = s.items ? `${itemList(ctx, s.items)} · delivered ${fmt(s.delivered)}, skipped ${fmt(s.skipped)}` : "no order";
      else if (s.group === "chore") noteHtml = esc(KIND[s.kind] || "") + (s.item ? ` (${named(ctx, s.item)})` : "");
      else if (s.group === "animal") noteHtml = `feed ${fmt(s.feed, 2)}${s.golden ? " (golden animal)" : ""} + slot ${fmt(s.slot, 2)} · ~${s.days} days`;
      return { ...s, whatHtml: what(ctx, s), noteHtml, noteText: noteHtml.replace(/<[^>]*>/g, "") };
    });
    const summary = note(`What each source pays in ${tk} (with your bonuses) and what it costs you in ${flw(ctx)} — the items handed in at market/production price; for animal bounties the feed (free with a golden animal) + ${Math.round(d.assumptions.raiseSlotLoss * 100)} % of the barn/coop slot's production while it grows (1 level a day; the animal is gone once handed in). ` +
      `Weekly bonus for all non-animal bounties: +${bb.tickets} ${bb.claimed ? "✅ claimed" : `— missing: ${bb.open.map((n) => named(ctx, n)).join(", ") || "nothing"}`}.`);
    return { rows, summary, footer: "", empty: "No ticket sources this week." };
  },
};

// ── 11. the reference: last chapter's ticket lots at today's prices ──
export const ticketsReference = {
  type: "tickets-reference",
  title: "🏷️ Last ticket auction — today's prices",
  page: "tickets",
  needs: (farmId) => ({ tickets: { res: "tickets", farm: farmId } }),
  defaults: {},
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  columns: [
    { key: "name", label: "lot", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b></div></div>` },
    { key: "supply", label: "pcs", align: "right" },
    { key: "tickets", label: "tickets", align: "right", fmt: (v) => fmt(v) },
    { key: "flower", label: "FLOWER round", align: "right", fmt: (v) => (v == null ? "—" : fmt(v)) },
    { key: "floor", label: "floor today", align: "right", fmt: (v) => fmt(v) },
    { key: "last", label: "last sale", align: "right", fmt: (v) => fmt(v) },
    { key: "perTicket", label: "FLOWER / ticket", align: "right", fmt: (v) => `<b>${v == null ? "—" : fmt(v, 3)}</b>` },
  ],
  build({ tickets: d } = {}, ctx = {}) {
    if (!ok(d)) return { rows: [], footer: "", empty: NO_DATA };
    const ref = d.auction.reference;
    const summary = note(`Lots paid in tickets at the ${esc(ref.chapter)} auction (${named(ctx, ref.ticket)}): the average minimum winning bid over five rounds, from <a href="${esc(ref.source)}" target="_blank" rel="noopener">sfl.world</a> (${esc(ref.readAt)}). ` +
      `Value = today's floor; ${flw(ctx)}/ticket after the fee. This chapter's auction: ${d.auction.currentItems.map((n) => named(ctx, n)).join(", ")}.`);
    return { rows: d.auction.lots.map((l) => ({ ...l, iconHtml: icon(ctx, l.name) })), summary, footer: "", empty: "No reference lots." };
  },
};

export const TICKETS_WIDGETS = [ticketsSummary, ticketsGoal, ticketsToday, ticketsItems, ticketsSchedule, ticketsDecide,
  ticketsThisAuction, ticketsNextChapter, ticketsHistory, ticketsSources, ticketsReference];
