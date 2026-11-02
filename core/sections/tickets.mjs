/*
 * TICKETS — what a chapter's tickets cost you, source by source, against what they win in the
 * chapter auction. The shop is left out on purpose: its items resell for 0.02-0.07 FLOWER per
 * ticket, the auction's top lots for ~0.25-0.37.
 *
 * Game rules this follows (sunflower-land, checked 2026-09-29 at cb713bc):
 *   deliveries  TICKET_REWARDS[npc] + 2 VIP + 1 per worn/placed chapter boost item (deliver.ts)
 *   chores      board amount + 2 VIP + 1 per boost item; the board is weekly (completeNPCChore.ts)
 *   bounties    board amount + 1 per boost item, NO VIP (sellBounty.ts); finishing every
 *               non-animal bounty of the week pays WEEKLY_BOUNTY_BONUS once (claimBountyBonus.ts)
 *   animal bounties delete the animal (sellAnimal.ts) — the cost is raising a replacement
 *   daily reward +1 ticket per day (dailyRewards.ts)
 * Ticket amounts on boards come from the game server; they are read from the farm as they are.
 */
import {
  CHAPTERS, TICKET_REWARDS, dashHasVipAccess, _dashHasWearable,
} from "../engine/gifts-deliveries.mjs";
import { findCollectible, ANIMAL_LEVELS, GOLDEN_ANIMALS, isWearableEquipped, calcSkillPointCost } from "../engine/power-helpers.mjs";
import { FEED_RECIPES, FEED_QTY, FEED_XP_TABLE } from "../engine/power-costs.mjs";
import { CHORE_TASKS } from "../engine/chore-tasks.mjs";
import { SIDE_MODELS, sideValue } from "../engine/side-values.mjs";

const DAY = 86400000;
const WEEKLY_BOUNTY_BONUS = 100;
// Chapter track (tracks.ts): 13 × 10 tickets on the free track, 16 × 10 more with VIP.
const TRACK_TICKETS = { free: 130, vip: 160 };
/*
 * The ticket auction is NOT at the chapter's end: Salt Awakening's ticket rounds ran 5-10 July
 * (tasks from 11 May), Ascension Age's auction week is 2026-10-05 (NO_BONUS_BOUNTIES_WEEK,
 * tasks from 10 Aug) — both ~8 weeks of tasks. Tickets earned after it only buy shop items, so
 * the horizon for a bid is those 8 weeks.
 */
const WEEKS_TO_AUCTION = 8;
const AUCTION_WEEK = { "Ascension Age": Date.UTC(2026, 9, 5), "Cave Dwellers": Date.UTC(2027, 0, 4) };
// What the best farms actually made (community dumps 2026-09-21 → 09-28): the median of the 82
// farms at the chapter cap made 1,568 a week; the cap itself was 11,844 after 7.2 weeks. Deliveries
// ×2 calendar events and more animal bounties get them above what one board shows.
const OBSERVED_TOP = { perWeek: 1568, capTotal: 11844, weeks: 7.2, readAt: "2026-09-28" };
// What a ticket is worth when deciding whether a source is worth doing: last chapter's mid lots
// sold for 0.08-0.12 FLOWER per ticket they took (Navigation Table 0.118, Giant Onion 0.082).
const GUIDE_TICKET_VALUE = 0.1;
// A young animal raised for a bounty still yields something on its way up; the slot's full
// output is lost only in part. 0.7 = the share assumed lost (an estimate, shown on the page).
const RAISE_SLOT_LOSS = 0.7;

/*
 * Ticket-priced lots of the last finished chapter's auction (Ascension Age), from
 * https://sfl.world/info/auctions, read 2026-11-02. Each lot ran in five rounds per currency;
 * the numbers are the mean minimum WINNING bid across the rounds. flower/gem = the same item's
 * FLOWER and Gem rounds (null when it had none). supply = the whole lot over every currency.
 * The lot's value is its NFT price today (opts.floors), so a ticket is worth what the item it
 * wins sells for.
 */
const AUCTION_REFERENCE = {
  chapter: "Ascension Age", ticket: "Shiny Feather", source: "https://sfl.world/info/auctions", readAt: "2026-11-02",
  lots: [
    { name: "Salt Worker Gnome", supply: 75,  tickets: 13412, flower: 1125, gem: 35893 },
    { name: "Ascended Idol",     supply: 90,  tickets: 13366, flower: 2555, gem: 65736 },
    { name: "Quarry",            supply: 30,  tickets: 13246, flower: null, gem: null },
    { name: "Autumn's Embrace",  supply: 50,  tickets: 13246, flower: null, gem: null },
    { name: "Surfer Hair",       supply: 120, tickets: 13152, flower: 2449, gem: 37352 },
    { name: "Rice Shirt",        supply: 120, tickets: 11623, flower: 1034, gem: 24894 },
    { name: "Alchemist Apron",   supply: 120, tickets: 10368, flower: 894,  gem: 17723 },
    { name: "Winged Vase",       supply: 120, tickets: 9534,  flower: 795,  gem: 12810 },
    { name: "Tomato Clown",      supply: 40,  tickets: 8362,  flower: null, gem: null },
    { name: "Pet",               supply: 250, tickets: 6881,  flower: null, gem: null },
    { name: "Vibraphone",        supply: 300, tickets: 4458,  flower: 338,  gem: 4286 },
    { name: "Coat Rack",         supply: 180, tickets: 97,    flower: 9,   gem: null },
    { name: "Salt Rug",          supply: 180, tickets: 83,    flower: 10,  gem: null },
  ],
};
/*
 * Each chapter's auction schedule as the game's auctioneer lists it (the list needs a login, so the
 * owner copies it from the game). Every item runs 5 rounds 5 h apart from `first` (UTC). Old items
 * can return (Quarry, Autumn's Embrace, Tomato Clown); "Pet" is a pet NFT. supply = the number on
 * the item's card. Prices are set per round by the server — not here. Cave Dwellers' list is not
 * out yet (auction week 2027-01-04): empty until then, so the page shows no schedule rather than
 * the last chapter's.
 */
const AUCTION_SCHEDULES = {
  "Ascension Age": { chapter: "Ascension Age", readAt: "2026-10-05", rounds: 5, everyH: 5,
    items: [
      { name: "Salt Rug",          kind: "collectible", supply: 18, first: Date.UTC(2026, 9, 5, 21) },
      { name: "Coat Rack",         kind: "collectible", supply: 18, first: Date.UTC(2026, 9, 5, 22) },
      { name: "Vibraphone",        kind: "collectible", supply: 20, first: Date.UTC(2026, 9, 5, 23) },
      { name: "Quarry",            kind: "collectible", supply: 6,  first: Date.UTC(2026, 9, 6, 22) },
      { name: "Autumn's Embrace",  kind: "wearable",    supply: 10, first: Date.UTC(2026, 9, 6, 23) },
      { name: "Rice Shirt",        kind: "wearable",    supply: 8,  first: Date.UTC(2026, 9, 7, 21) },
      { name: "Ascended Idol",     kind: "collectible", supply: 6,  first: Date.UTC(2026, 9, 7, 22) },
      { name: "Pet",               kind: "nft",         supply: 50, first: Date.UTC(2026, 9, 7, 23) },
      { name: "Salt Worker Gnome", kind: "collectible", supply: 5,  first: Date.UTC(2026, 9, 8, 22) },
      { name: "Tomato Clown",      kind: "collectible", supply: 8,  first: Date.UTC(2026, 9, 8, 23) },
      { name: "Alchemist Apron",   kind: "wearable",    supply: 8,  first: Date.UTC(2026, 9, 9, 21) },
      { name: "Surfer Hair",       kind: "wearable",    supply: 8,  first: Date.UTC(2026, 9, 9, 22) },
      { name: "Winged Vase",       kind: "collectible", supply: 8,  first: Date.UTC(2026, 9, 9, 23) },
    ],
  },
  "Cave Dwellers": { chapter: "Cave Dwellers", readAt: null, rounds: 5, everyH: 5, items: [] },
};

/*
 * The schedule with what each item would add on this farm: the chapter model (auctionItemValues)
 * where it prices the item, else the POWER valuation of its boost (opts.boostPerDay, the same
 * marginal POWER shows). Rounds already started stay listed as done.
 */
function auctionSchedule(farm, chapterItems, opts, now) {
  const S = AUCTION_SCHEDULES[currentChapter(now).name] || { items: [] }, H = 3600000;
  const byName = Object.fromEntries(chapterItems.map((i) => [i.name, i]));
  const bpd = opts.boostPerDay || {};
  return { chapter: S.chapter || null, readAt: S.readAt || null, items: S.items.map((it) => {
    const rounds = Array.from({ length: S.rounds }, (_, k) => it.first + k * S.everyH * H);
    const ci = byName[it.name];
    let perDay = ci && ci.perDay != null ? ci.perDay : (bpd[it.name] != null ? bpd[it.name] : null);
    let basis = ci && ci.perDay != null ? ci.basis : (bpd[it.name] != null ? "hodnota boostu jako v POWER" : (ci ? ci.basis : ""));
    if (it.kind === "nft") { perDay = null; basis = "náhodný pet — nelze ocenit"; }
    // Won to resell: today's floor after the market fee — the most a round is worth bidding even
    // when the farm already has one (or gains nothing from it).
    const f = (opts.floors || {})[it.name] || {};
    const floor = +f.floor > 0 && +f.floor < 1e6 ? +f.floor : (+f.lastSalePrice || 0);
    return { name: it.name, kind: it.kind, supply: it.supply, rounds,
      next: rounds.find((t) => t > now) || null, left: rounds.filter((t) => t > now).length,
      perDay, basis: basis || "", what: ci ? ci.what : "",
      floor: floor > 0 ? floor : null, resale: floor > 0 ? +(floor * (1 - MARKET_FEE)).toFixed(2) : null,
      owned: it.kind === "nft" ? false : hasItem(farm, it.name, it.kind) };
  }) };
}
const MARKET_FEE = 0.1;

function currentChapter(now) {
  let c = CHAPTERS[0];
  for (const x of CHAPTERS) if (x.start <= now) c = x;
  return c;
}

/** Ticket bonuses this farm gets per source. */
function ticketBonuses(farm, chapter, now) {
  const vip = dashHasVipAccess(farm, now);
  const items = (chapter.boosts || []).map((name) => {
    const active = findCollectible(farm, name).length > 0 || _dashHasWearable(farm, name);
    return { name, active };
  });
  const itemBonus = items.filter((i) => i.active).length;
  return { vip, items, delivery: (vip ? 2 : 0) + itemBonus, chore: (vip ? 2 : 0) + itemBonus, bounty: itemBonus };
}

/** FLOWER value of `qty` of an item: production cost first, then market value (roadmapItemCost's order). */
function itemValue(name, qty, prices, coinsPerSFL) {
  if (name === "coins") return coinsPerSFL > 0 ? qty / coinsPerSFL : 0;
  const pc = prices.productionCost || {}, mv = prices.marketValue || {};
  const u = pc[name] > 0 ? pc[name] : (mv[name] > 0 ? mv[name] : null);
  return u == null ? null : u * qty;
}

// "Harvest Potatoes" → "Potato", "Mariner Pots" → "Mariner Pot": try the name, then singulars.
function resolveItem(raw, prices) {
  const has = (n) => (prices.productionCost || {})[n] > 0 || (prices.marketValue || {})[n] > 0;
  const cands = [raw, raw.replace(/ies$/, "y"), raw.replace(/oes$/, "o"), raw.replace(/es$/, ""), raw.replace(/s$/, "")];
  return cands.find(has) || null;
}

/*
 * A chore's cost from its text. The board only gives the text ("Cook Antipasto 50 times"), so the
 * kind is parsed from the verb:
 *   free     collecting / mining / chopping — output you make anyway
 *   plant    harvesting, picking, growing — you keep the crop; the cost is choosing that crop
 *   consume  cooking, preparing, eating, crafting — the ingredients (a cooked dish keeps its XP)
 *   fish     casts — rod + bait, and the daily reel limit
 */
function choreCost(text, prices, coinsPerSFL) {
  let m;
  if (/^(Collect|Mine|Chop|Drill|Dig)\b/i.test(text)) return { kind: "free", cost: 0 };
  if ((m = text.match(/^(Harvest|Pick|Grow)\s+(.+?)\s+(\d+)\s+times?$/i))) return { kind: "plant", cost: 0, item: m[2] };
  if ((m = text.match(/^(Cook|Prepare)\s+(.+?)\s+(\d+)\s+times?$/i)) || (m = text.match(/^(Craft)\s+(\d+)\s+(.+)$/i))) {
    const [name, n] = m[1].toLowerCase() === "craft" ? [m[3], +m[2]] : [m[2], +m[3]];
    const item = resolveItem(name, prices);
    const v = item ? itemValue(item, n, prices, coinsPerSFL) : null;
    return { kind: "consume", cost: v, item: item || name, qty: n };
  }
  if ((m = text.match(/^Eat\s+(\d+)\s+(.+)$/i))) {
    const item = resolveItem(m[2], prices);
    const v = item ? itemValue(item, +m[1], prices, coinsPerSFL) : null;
    return { kind: "consume", cost: v, item: item || m[2], qty: +m[1] };
  }
  if ((m = text.match(/^Fish\s+(\d+)\s+times?$/i))) {
    const cast = (itemValue("Rod", 1, prices, coinsPerSFL) || 0) + (itemValue("Earthworm", 1, prices, coinsPerSFL) || 0);
    return { kind: "fish", cost: cast * +m[1], qty: +m[1] };
  }
  return { kind: "unknown", cost: null };
}

/*
 * FLOWER to raise one animal from nothing to `level`: feed (free with the type's golden
 * collectible) + the output its barn/coop slot does not make meanwhile. One level a day at best
 * (a level-up puts the animal to sleep for 24 h), so the slot is tied up ~`level` days.
 */
function raiseCost(type, level, farm, prices, slotNetPerDay) {
  const golden = Object.entries(GOLDEN_ANIMALS).some(([item, t]) => t === type && findCollectible(farm, item).length > 0);
  let feed = 0;
  if (!golden) {
    const xpTable = ANIMAL_LEVELS[type];
    for (let lv = 0; lv < level; lv++) {
      const xpNeeded = xpTable[lv + 1] - xpTable[lv];
      const band = FEED_XP_TABLE.find((b) => lv >= b.min && lv <= b.max);
      let best = Infinity;
      for (const [food, xp] of Object.entries(band.xp)) {
        const unit = Object.entries(FEED_RECIPES[food]).reduce((s, [ing, q]) => s + (itemValue(ing, q, prices, 0) || 0), 0);
        if (xp > 0 && unit > 0) best = Math.min(best, (unit * FEED_QTY[type]) / xp);
      }
      if (isFinite(best)) feed += xpNeeded * best;
    }
  }
  const slot = Math.max(0, slotNetPerDay || 0) * level * RAISE_SLOT_LOSS;
  return { feed, slot, golden, total: feed + slot, days: level };
}

/**
 * @param farm    game farm object
 * @param prices  section=prices maps { marketValue, productionCost }
 * @param opts    { now, coinsPerSFL, animalNet: { Chicken, Sheep, Cow } net FLOWER/day of ONE
 *                max-level animal (section=power), floors: { name: { floor, lastSalePrice } } }
 */
export function buildTicketsSection(farm, prices, opts = {}) {
  const now = opts.now || Date.now();
  const coinsPerSFL = opts.coinsPerSFL || 0;
  const chapter = currentChapter(now);
  const ticket = chapter.ticket;
  const bonus = ticketBonuses(farm, chapter, now);
  const act = farm.farmActivity || {};
  const collected = +act[`${ticket} Collected`] || 0;
  const tasksBegin = chapter.tasksBegin || chapter.start;
  const weeksDone = Math.max(0, (now - tasksBegin) / (7 * DAY));
  const weeksLeft = chapter.end ? Math.max(0, (chapter.end - now) / (7 * DAY)) : null;
  const sources = [];
  const add = (row) => {
    row.perTicket = row.tickets > 0 && row.cost != null ? row.cost / row.tickets : null;
    sources.push(row);
  };

  // Daily reward — a ticket a day.
  const lastChest = farm.dailyRewards?.chest?.collectedAt || 0;
  add({ group: "daily", label: "Daily reward", tickets: 1, per: "day", cost: 0,
    done: new Date(lastChest).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10) });

  // Deliveries — the order each ticket NPC is asking for right now, repeated daily.
  const orders = farm.delivery?.orders || [];
  for (const [npc, base] of Object.entries(TICKET_REWARDS)) {
    const o = orders.find((x) => x.from === npc);
    const stats = farm.npcs?.[npc] || {};
    let cost = null; const missing = [];
    if (o) {
      cost = 0;
      for (const [it, q] of Object.entries(o.items || {})) {
        const v = itemValue(it, q, prices, coinsPerSFL);
        if (v == null) missing.push(it); else cost += v;
      }
    }
    const doneToday = !!(o && o.completedAt) ||
      (stats.deliveryCompletedAt && new Date(stats.deliveryCompletedAt).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10));
    add({ group: "delivery", label: npc, tickets: base + bonus.delivery, per: "day", cost,
      items: o ? o.items : null, unpriced: missing, done: doneToday,
      delivered: stats.deliveryCount || 0, skipped: stats.skippedCount || 0 });
  }

  // Chores — this week's board, with how far along each is and what a day it takes to finish
  // before the Monday 00:00 UTC reset (the game counts farmActivity[counter] - initialProgress).
  const weekEnd = (() => { const d0 = new Date(now); const dow = (d0.getUTCDay() + 6) % 7; return Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate() - dow + 7); })();
  const daysLeft = Math.max(1, Math.ceil((weekEnd - now) / DAY));
  for (const [npc, c] of Object.entries(farm.choreBoard?.chores || {})) {
    const t = +(c.reward?.items?.[ticket] || 0);
    if (!t) continue;
    const cc = choreCost(c.name || "", prices, coinsPerSFL);
    const task = CHORE_TASKS[c.name];
    let progress = null, required = null, remaining = null, perDay = null;
    if (task) {
      required = task[1];
      progress = Math.max(0, (+act[task[0]] || 0) - (+c.initialProgress || 0));
      remaining = c.completedAt ? 0 : Math.max(0, required - progress);
      perDay = Math.ceil(remaining / daysLeft);
    }
    add({ group: "chore", label: c.name, npc, tickets: t + bonus.chore, per: "week", cost: cc.cost, kind: cc.kind,
      item: cc.item || null, done: !!c.completedAt, required, progress, remaining, perDay, daysLeft });
  }

  // Bounties — this week's board; animal ones cost raising a replacement.
  const completed = new Set((farm.bounties?.completed || []).map((c) => c.id));
  const itemBounties = [];
  const coopNet = opts.animalNet?.Chicken || 0;
  const barnNet = Math.max(opts.animalNet?.Sheep || 0, opts.animalNet?.Cow || 0);
  for (const r of farm.bounties?.requests || []) {
    const t = +(r.items?.[ticket] || 0);
    if (!t) continue;
    if (r.level != null) {
      const slotNet = r.name === "Chicken" ? coopNet : barnNet;
      const rc = raiseCost(r.name, +r.level, farm, prices, slotNet);
      add({ group: "animal", label: `${r.name} L${r.level}`, animal: r.name, level: +r.level, tickets: t + bonus.bounty, per: "week",
        cost: rc.total, feed: rc.feed, slot: rc.slot, golden: rc.golden, days: rc.days, done: completed.has(r.id) });
    } else {
      const v = itemValue(r.name, 1, prices, coinsPerSFL);
      const row = { group: "bounty", label: r.name, tickets: t + bonus.bounty, per: "week", cost: v, done: completed.has(r.id) };
      add(row);
      itemBounties.push(row);
    }
  }
  const bonusClaimedAt = farm.bounties?.bonusClaimedAt || 0;
  const weekStart = (() => { const d = new Date(now); const dow = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow); })();
  const bountyBonus = { tickets: WEEKLY_BOUNTY_BONUS, claimed: bonusClaimedAt >= weekStart,
    open: itemBounties.filter((b) => !b.done).map((b) => b.label) };

  // Weekly totals: what the whole board is worth per week, and what the farm is on now.
  const weekly = (r) => (r.per === "day" ? 7 : 1);
  const candidates = sources.filter((r) => r.cost != null && r.tickets > 0);

  /*
   * The supply curve: at a price per ticket p, do every source costing ≤ p, plus "finish the
   * bounty board" when the rest of it together with the bonus costs ≤ p a ticket.
   */
  function atPrice(p) {
    let tickets = 0, cost = 0; const used = [];
    for (const r of candidates) if (r.perTicket <= p) { tickets += r.tickets * weekly(r); cost += r.cost * weekly(r); used.push(r); }
    const rest = itemBounties.filter((b) => !used.includes(b));
    const restCost = rest.reduce((s, b) => s + (b.cost ?? Infinity), 0);
    const restTickets = rest.reduce((s, b) => s + b.tickets, 0) + WEEKLY_BOUNTY_BONUS;
    let withBonus = false;
    if (restCost / restTickets <= p) { tickets += restTickets; cost += restCost; withBonus = true; }
    return { tickets, cost, withBonus };
  }
  const track = TRACK_TICKETS.free + (bonus.vip ? TRACK_TICKETS.vip : 0);

  // Auction: a ticket is worth what the lot it wins sells for today.
  const floors = opts.floors || {};
  const lots = AUCTION_REFERENCE.lots.map((l) => {
    const f = floors[l.name] || {};
    const floor = +f.floor > 0 && +f.floor < 1e6 ? +f.floor : 0; // a 99,999,999,999,999 "floor" is a joke listing
    const last = +f.lastSalePrice || 0;
    const value = floor || last;
    return { ...l, floor, last, value, perTicket: value > 0 ? (value * (1 - MARKET_FEE)) / l.tickets : null };
  });
  const lotFor = (tickets) => lots.filter((l) => l.tickets <= tickets && l.value > 0).sort((a, b) => b.value - a.value)[0] || null;

  // Price levels to try: every distinct cost per ticket on the board, plus free. Each plan is
  // "do everything up to this price for the weeks before the next chapter's auction".
  const levels = [...new Set([0, ...candidates.map((r) => +r.perTicket.toFixed(4))])].sort((a, b) => a - b);
  const plans = [];
  for (const p of levels) {
    const w = atPrice(p);
    const last = plans[plans.length - 1];
    if (last && last.ticketsPerWeek === w.tickets) continue;
    const atAuction = Math.round(w.tickets * WEEKS_TO_AUCTION + track);
    const cost = w.cost * WEEKS_TO_AUCTION;
    const lot = lotFor(atAuction);
    const lotValue = lot ? lot.value * (1 - MARKET_FEE) : 0;
    plans.push({ maxPerTicket: p, ticketsPerWeek: w.tickets, costPerWeek: w.cost, withBonus: w.withBonus,
      atAuction, cost, lot: lot ? lot.name : null, lotValue, net: lotValue - cost });
  }
  const best = plans.reduce((b, x) => (!b || x.net > b.net ? x : b), null);
  const maxPlan = plans[plans.length - 1] || null;
  // For every lot: the cheapest plan that gets there, or how far short the whole board falls.
  const perLot = lots.filter((l) => l.value > 0).map((l) => {
    const plan = plans.find((x) => x.atAuction >= l.tickets) || null;
    const needPerWeek = Math.max(0, (l.tickets - track) / WEEKS_TO_AUCTION);
    const lotValue = l.value * (1 - MARKET_FEE);
    return { name: l.name, tickets: l.tickets, lotValue, needPerWeek: Math.round(needPerWeek),
      reachable: !!plan, cost: plan ? plan.cost : null, net: plan ? lotValue - plan.cost : null,
      maxPerTicket: plan ? plan.maxPerTicket : null,
      shortPerWeek: plan ? 0 : Math.round(needPerWeek - (maxPlan ? maxPlan.ticketsPerWeek : 0)) };
  }).sort((a, b) => a.tickets - b.tickets);

  /*
   * This chapter: its auction may still be ahead, with what has been collected by then.
   *
   * Only TICKET weeks count. The chapter's first week (before tasksBegin) and the auction week pay
   * tickets for the daily reward and deliveries only — no chores, bounties or animals — so a
   * projection over calendar weeks overstated them, and a pace measured in the first week (1 ticket
   * on day one) said "you'll have 1 at the auction". Until a full ticket week has passed, the pace
   * is the farm's own from its past chapters (opts.pastPace, buildTicketHistory), when it has one.
   */
  const auctionAt = AUCTION_WEEK[chapter.name] || null;
  const ticketWeeksUntil = (t) => Math.max(0, (t - Math.max(now, tasksBegin)) / (7 * DAY));
  const pace = weeksDone >= 1 ? collected / weeksDone : (opts.pastPace > 0 ? opts.pastPace : (weeksDone > 0 ? collected / weeksDone : 0));
  const paceFrom = weeksDone >= 1 ? "chapter" : (opts.pastPace > 0 ? "history" : "chapter");
  const thisAuction = auctionAt ? {
    at: auctionAt, weeksUntil: +ticketWeeksUntil(auctionAt).toFixed(2), paceFrom,
    ticketsExpected: Math.round(collected + pace * ticketWeeksUntil(auctionAt)),
  } : null;
  if (thisAuction) { const l = lotFor(thisAuction.ticketsExpected); thisAuction.lastChapterEquivalent = l ? l.name : null; }

  /*
   * The guide for this week: every open source cheaper than a ticket is worth, and the rest.
   * A ticket is worth ~GUIDE_TICKET_VALUE: last chapter's mid lots (the ones a farm like this
   * reaches) sold for 0.08-0.12 FLOWER per ticket they cost. Grouped the way the game shows them.
   */
  const open = sources.filter((s) => !s.done && s.tickets > 0);
  const group = (rows) => {
    const g = {};
    for (const s of rows) {
      const k = s.group; const w = s.per === "day" ? 7 : 1;
      (g[k] = g[k] || { group: k, ticketsPerWeek: 0, costPerWeek: 0, items: [] });
      g[k].ticketsPerWeek += s.tickets * w; g[k].costPerWeek += (s.cost || 0) * w;
      g[k].items.push({ label: s.label, tickets: s.tickets, per: s.per, perTicket: s.perTicket, kind: s.kind || null, item: s.item || null });
    }
    return Object.values(g).map((x) => ({ ...x, items: x.items.sort((a, b) => (a.perTicket ?? 9) - (b.perTicket ?? 9)) }));
  };
  const guide = {
    ticketValue: GUIDE_TICKET_VALUE,
    doIt: group(open.filter((s) => s.perTicket != null && s.perTicket <= GUIDE_TICKET_VALUE)),
    skip: group(open.filter((s) => s.perTicket == null || s.perTicket > GUIDE_TICKET_VALUE)),
    doneThisWeek: sources.filter((s) => s.done && s.per === "week").reduce((a, s) => a + s.tickets, 0),
  };
  const weekNo = Math.floor(Math.max(0, now - chapter.start) / (7 * DAY)) + 1;
  const timeline = { start: chapter.start, tasksBegin, ticketAuction: auctionAt, end: chapter.end || null,
    week: weekNo, weeks: chapter.end ? Math.round((chapter.end - chapter.start) / (7 * DAY)) : null,
    weekEnd, daysLeftInWeek: daysLeft,
    // Ticket weeks left for the megastore (open to the chapter's end), the auction week taken out.
    ticketWeeksToEnd: chapter.end ? +Math.max(0, ticketWeeksUntil(chapter.end) - (auctionAt && auctionAt > now ? 1 : 0)).toFixed(2) : null,
    boardFrozen: now < tasksBegin || !!(auctionAt && now >= auctionAt && now < auctionAt + 7 * DAY) };

  const chapterItems = [...auctionItemValues(farm, prices, opts), ...shopItemValues(farm, prices, opts)];
  const schedule = auctionSchedule(farm, chapterItems, opts, now);
  // This chapter's lots: the copied schedule, else the auctioneer's items from the game source.
  const currentItems = schedule.items.length ? schedule.items.map((i) => i.name) : chapterItems.filter((i) => i.source === "auction").map((i) => i.name);
  return {
    chapter: { name: chapter.name, ticket, start: chapter.start, tasksBegin, end: chapter.end || null,
      weeksDone: +weeksDone.toFixed(2), weeksLeft: weeksLeft == null ? null : +weeksLeft.toFixed(2),
      collected, perWeek: pace > 0 ? pace : null, perWeekFrom: paceFrom,
      projectedEnd: weeksLeft != null && weeksDone > 0 ? Math.round(collected + (collected / weeksDone) * weeksLeft) : null },
    bonus, track, bountyBonus,
    sources,
    plans, best, perLot, thisAuction, observedTop: OBSERVED_TOP,
    guide, timeline,
    items: chapterItems,
    schedule,
    activity: opts.activity || null,
    auction: { reference: { chapter: AUCTION_REFERENCE.chapter, ticket: AUCTION_REFERENCE.ticket, source: AUCTION_REFERENCE.source, readAt: AUCTION_REFERENCE.readAt },
      lots, currentItems },
    // For the "tickets, gems, FLOWER or wait" decision on the page.
    rounds: roundRatios(lots, opts.gemsPerSFL || 0),
    rates: { gemsPerSFL: opts.gemsPerSFL || 0, sflUsd: opts.sflUsd || 0, gems: +(farm.inventory?.Gem || 0) },
    assumptions: { weeksToAuction: WEEKS_TO_AUCTION, raiseSlotLoss: RAISE_SLOT_LOSS, marketFee: MARKET_FEE,
      weeklyBountyBonus: WEEKLY_BOUNTY_BONUS },
  };
}

const median = (xs) => {
  const a = xs.filter((x) => x != null && isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/*
 * The same auction item could be had four ways; last chapter says what each cost against the
 * item's price on the market today (its floor): the FLOWER round, the Gem round (gems at the
 * exchange rate), and waiting to buy (the floor itself — and the last sales, often below it).
 * Tickets are priced by the history of what collecting them cost (buildTicketHistory).
 */
// Lots under this floor are left out: a 19-FLOWER bid on a 7-FLOWER Pufferfish reads as "300 %"
// and says nothing about how an item worth having is priced.
const RATIO_MIN_FLOOR = 100;
function roundRatios(lots, gemsPerSFL) {
  const rows = lots.filter((l) => l.floor >= RATIO_MIN_FLOOR).map((l) => ({
    name: l.name, floor: l.floor,
    flower: l.flower != null ? l.flower / l.floor : null,
    gem: l.gem != null && gemsPerSFL > 0 ? (l.gem / gemsPerSFL) / l.floor : null,
    lastSale: l.last > 0 ? l.last / l.floor : null,
  }));
  const col = (k) => rows.map((r) => r[k]).filter((x) => x != null);
  const sum = (k) => { const v = col(k); return v.length ? { median: median(v), min: Math.min(...v), max: Math.max(...v), n: v.length } : null; };
  return { rows, flower: sum("flower"), gem: sum("gem"), lastSale: sum("lastSale") };
}

/**
 * Every recorded week run through the same model: what "everything" cost that week at today's
 * prices, and the curve "X tickets a week cost Y". Weeks with no bounty board (a chapter's frozen
 * first week, the auction week) are kept in the list but left out of the averages.
 * @param weeks [{ wk, ts, farm }] — /api/farm-history?type=ticket-weeks
 */
export function buildTicketHistory(weeks, prices, opts = {}) {
  const list = [];
  for (const w of weeks || []) {
    if (!w || !w.farm) continue;
    const d = buildTicketsSection(w.farm, prices, { ...opts, now: +w.ts || Date.parse(w.wk) });
    const part = (g) => d.sources.filter((s) => s.group === g).reduce((a, s) => {
      const k = s.per === "day" ? 7 : 1;
      a.tickets += s.tickets * k; if (s.cost != null) a.cost += s.cost * k;
      if (s.done) a.doneTickets += s.tickets; a.n += 1; if (s.done) a.done += 1;
      return a;
    }, { tickets: 0, cost: 0, doneTickets: 0, n: 0, done: 0 });
    const parts = { delivery: part("delivery"), chore: part("chore"), bounty: part("bounty"), animal: part("animal") };
    const active = parts.bounty.n > 0;
    const max = d.plans[d.plans.length - 1] || null;
    // The priciest items of the week's bounty board — what makes a "max board" expensive.
    const hard = d.sources.filter((s) => s.group === "bounty" && s.perTicket != null && s.perTicket > 0.3)
      .map((s) => ({ name: s.label, cost: s.cost, done: s.done }));
    list.push({ wk: w.wk, chapter: d.chapter.name, ticket: d.chapter.ticket, active,
      maxTickets: max ? max.ticketsPerWeek : 0, maxCost: max ? max.costPerWeek : 0,
      curve: d.plans.map((p) => [p.ticketsPerWeek, p.costPerWeek]), parts, hard,
      bonusOpen: d.bountyBonus.open.length, collected: d.chapter.collected });
  }
  const act = list.filter((x) => x.active);
  // What a week at X tickets costs, median over the recorded weeks (linear between a week's plans).
  const costAt = (curve, x) => {
    if (!curve.length || x > curve[curve.length - 1][0]) return null;
    if (x <= curve[0][0]) return curve[0][1] * (curve[0][0] > 0 ? x / curve[0][0] : 0);
    for (let i = 1; i < curve.length; i++) {
      const [t0, c0] = curve[i - 1], [t1, c1] = curve[i];
      if (x <= t1) return c0 + (c1 - c0) * (t1 > t0 ? (x - t0) / (t1 - t0) : 0);
    }
    return null;
  };
  const top = Math.max(0, ...act.map((x) => x.maxTickets));
  const curve = [];
  for (let x = 50; x <= top + 50; x += 50) {
    const costs = act.map((w) => costAt(w.curve, x));
    const ok = costs.filter((c) => c != null);
    if (!ok.length) break;
    // Near the top only a few weeks reach x, and their median can dip below the level before;
    // more tickets never cost less, so the curve only rises.
    const prev = curve.length ? curve[curve.length - 1].cost : 0;
    curve.push({ ticketsPerWeek: x, cost: Math.max(prev, median(ok)), share: ok.length / act.length });
  }
  const byChapter = {};
  for (const x of act) (byChapter[x.chapter] = byChapter[x.chapter] || []).push(x);
  const chapters = Object.entries(byChapter).map(([name, a]) => ({
    name, ticket: a[0].ticket, weeks: a.length,
    // What the farm actually collected a ticket week (its last record over its ticket weeks).
    collectedPerWeek: Math.max(...a.map((x) => x.collected || 0)) / a.length,
    maxTickets: median(a.map((x) => x.maxTickets)), maxCost: median(a.map((x) => x.maxCost)),
    parts: Object.fromEntries(["delivery", "chore", "bounty", "animal"].map((k) => [k, {
      tickets: median(a.map((x) => x.parts[k].tickets)), cost: median(a.map((x) => x.parts[k].cost)) }])),
    doneBountyTickets: median(a.map((x) => x.parts.bounty.doneTickets)),
  }));
  return {
    weeks: list.map(({ curve: _c, ...rest }) => rest),
    chapters,
    all: act.length ? { weeks: act.length, maxTickets: median(act.map((x) => x.maxTickets)), maxCost: median(act.map((x) => x.maxCost)) } : null,
    curve,
  };
}

/*
 * What the farm actually does, per day, from the counters of the recorded weekly snapshots
 * (the last four weeks): salt harvests, aged fish by species (plain and Prime), spice and
 * fermentation output, potion games. Null when there is no history to measure from.
 */
/** Median tickets a ticket week over the farm's past chapters (not the running one), or 0. */
export function pastChapterPace(history, farm, now = Date.now()) {
  if (!history || !history.chapters) return 0;
  const cur = currentChapter(now).name;
  const xs = history.chapters.filter((c) => c.name !== cur && c.weeks >= 3 && c.collectedPerWeek > 0).map((c) => c.collectedPerWeek);
  return xs.length ? median(xs) : 0;
}

export function measuredActivity(weeks, spanWeeks = 4) {
  const list = (weeks || []).filter((w) => w && w.farm && w.farm.farmActivity).sort((a, b) => a.ts - b.ts);
  if (list.length < 2) return null;
  const last = list[list.length - 1];
  const first = list[Math.max(0, list.length - 1 - spanWeeks)];
  const days = (last.ts - first.ts) / DAY;
  if (!(days > 0.5)) return null;
  const a0 = first.farm.farmActivity || {}, a1 = last.farm.farmActivity || {};
  const d = (k) => Math.max(0, (+a1[k] || 0) - (+a0[k] || 0)) / days;
  const games = (f) => Object.values((f.potionHouse && f.potionHouse.history) || {}).reduce((s, n) => s + (+n || 0), 0);
  const aged = {}, prime = {}, racks = {};
  for (const k of Object.keys(a1)) {
    let m;
    if ((m = k.match(/^Prime Aged (.+) Collected$/))) prime[m[1]] = d(k);
    else if ((m = k.match(/^Aged (.+) Collected$/))) aged[m[1]] = d(k);
    else if ((m = k.match(/^(.+) (Spiced|Fermented)$/))) racks[m[1]] = d(k);
  }
  // Bumpkin XP gained a day (every source, every boost the farm has) — what the XP boosts scale.
  const xp0 = +((first.farm.bumpkin || {}).experience || 0), xp1 = +((last.farm.bumpkin || {}).experience || 0);
  return {
    days: +days.toFixed(2), from: first.wk, to: last.wk,
    xpPerDay: xp0 > 0 && xp1 > 0 ? Math.max(0, xp1 - xp0) / days : null,
    saltHarvests: d("Salt Harvested"), potionGames: Math.max(0, games(last.farm) - games(first.farm)) / days,
    aged, prime, racks,
    fullMoon: { Celestine: d("Celestine Harvested"), Lunara: d("Lunara Harvested"), Duskberry: d("Duskberry Harvested") },
  };
}

function hasItem(farm, name, kind) {
  if (kind === "wearable") return isWearableEquipped(farm, name) || (farm.wardrobe?.[name] || 0) > 0;
  return findCollectible(farm, name).length > 0 || (+(farm.inventory?.[name] || 0) > 0);
}

/*
 * The FLOWER a day each item of this chapter's auction would add on THIS farm, from what the
 * farm measurably does (opts.activity) or, for salt, from its nodes when there is no history.
 * Each model is one line of the game's own mechanic (file refs on the entries); an item whose
 * effect the farm does not use is 0, one the model cannot price is null with the reason.
 */
function auctionItemValues(farm, prices, opts) {
  const act = opts.activity || null;
  const coinsPerSFL = opts.coinsPerSFL || 0;
  const mv = (n) => (prices.marketValue || {})[n] || (prices.productionCost || {})[n] || 0;
  let sflPerXP = 0;
  try {
    const sc = calcSkillPointCost(farm.bumpkin, prices.marketValue || {}, farm);
    if (sc && sc.bestRecipe && sc.bestRecipe.boostedXP > 0) sflPerXP = sc.bestRecipe.cost / sc.bestRecipe.boostedXP;
  } catch { sflPerXP = 0; }
  const needAct = "potřebuje historii farmy (jen sledované farmy)";
  // Cave Dwellers' auctioneer (collections.ts). Production boosts are valued in POWER (their
  // marginal arrives as opts.boostPerDay in the schedule); Giant Truffle by the XP side model below.
  const inPower = "v ROADMAP/POWER";
  const items = [
    { name: "Giant Truffle", kind: "collectible", what: "+30 % XP z jídla (mimo ryby), +60 % ze Smoothie Shack a Deli", perDay: null, basis: needAct },
    { name: "Firefly Aura", kind: "wearable", what: "Lava Pit o 20 % rychleji, 5 % hned hotová", perDay: null, basis: inPower },
    { name: "Antique Dress", kind: "wearable", what: "hrozny o 30 % rychleji, 10 % šance +10 hroznů", perDay: null, basis: inPower },
    { name: "Harpoon", kind: "wearable", what: "20 % šance, že nahození nespotřebuje denní pokus", perDay: null, basis: inPower },
    { name: "Stick House", kind: "collectible", what: "expanze −25 % Oil a o 10 % rychleji (ne s Grinx's Hammer)", perDay: 0, basis: "jednorázově u expanzí" },
    { name: "Brick House", kind: "collectible", what: "expanze −25 % Crimstone a −5 % coinů (ne s Grinx's Hammer)", perDay: 0, basis: "jednorázově u expanzí" },
    { name: "Hercules Beetle Hat", kind: "wearable", what: "expanze −25 % Obsidian (ne s Grinx's Hammer)", perDay: 0, basis: "jednorázově u expanzí" },
    { name: "Piggy Bank", kind: "collectible", what: "dekorace", perDay: 0, basis: "" },
    { name: "Big Bad Wolf", kind: "collectible", what: "dekorace", perDay: 0, basis: "" },
  ];
  /*
   * ONE valuation: an item a side model prices (salt, aging, animals — core/engine/side-values.mjs)
   * takes that number, the one POWER and ROADMAP show, instead of the formula above. Same prices
   * (market value, else production cost) and the same measured activity.
   */
  const sideCtx = {
    farm, prices: new Proxy({}, { get: (_, n) => (typeof n === "string" ? mv(n) : undefined) }),
    coinsPerSFL, coinsFree: false, activity: act, sflPerXP,
    isActive: (n) => findCollectible(farm, n).length > 0 || (() => { try { return isWearableEquipped(farm, n); } catch { return false; } })(),
  };
  for (const it of items) {
    if (!SIDE_MODELS[it.name]) continue;
    const needsAct = SIDE_MODELS[it.name].cat !== "salt";
    if (needsAct && !act) continue;                         // keeps its "potřebuje historii" note
    let r = null;
    try { r = sideValue(it.name, sideCtx, null); } catch { r = null; }
    if (r && isFinite(r.perDay)) { it.perDay = r.perDay; it.basis = (it.basis ? it.basis + " · " : "") + "stejný výpočet jako POWER / ROADMAP"; }
  }
  // A production boost takes POWER's marginal for it (opts.boostPerDay), the number POWER shows.
  const bpd = opts.boostPerDay || {};
  for (const it of items) {
    if (it.perDay == null && it.basis === inPower && bpd[it.name] != null) { it.perDay = bpd[it.name]; it.basis = "hodnota boostu jako v POWER"; }
  }
  return items.map((it) => ({ ...it, source: "auction", owned: hasItem(farm, it.name, it.kind),
    perYear: it.perDay == null ? null : it.perDay * 365 }));
}

/*
 * This chapter's megastore (megastore.ts), priced in its ticket, valued on THIS farm:
 *   hourglasses  one placed window of `hours` in which planting/chopping/mining starts at `mult`
 *                of the time (collectibleBuilt.ts, plant.ts, chop.ts, stoneMine.ts…): worth the
 *                category's net for the window × the time saved — "per use", they burn out
 *   Duende Hat   ×0.9 plot crop and fruit patch time (plant.ts, fruitPlanted.ts): the crops +
 *                fruits net × (1/0.9 − 1)
 * Duende Monument works only with the village's cheers (monuments.ts) and gives no daily resource;
 * Straw House (compost), Pot of Luck (desert digging) and the Gourmet / Fisher's hourglasses act on
 * what the tracker does not price. Those stay null with the reason. The Duende Shoes / Pants / Shirt
 * are the chapter's +1 ticket items (ticketBonuses).
 */
function shopItemValues(farm, prices, opts) {
  const catNet = opts.catNet || {};
  const ticket = currentChapter(opts.now || Date.now()).ticket;
  const hourglass = (name, hours, mult, cats, what) => {
    const net = cats.reduce((s, c) => s + Math.max(0, catNet[c] || 0), 0);
    return { name, kind: "consumable", what: `${what}, ${hours} h`, tickets: name === "Ore Hourglass" ? 400 : 200,
      perUse: cats.length && Object.keys(catNet).length ? net * (hours / 24) * (1 / mult - 1) : null,
      basis: Object.keys(catNet).length ? `čisté ${cats.join("+")} ${net.toFixed(1)}/den, když celé okno sázíš/těžíš` : "bez výpočtu POWER" };
  };
  const items = [
    hourglass("Harvest Hourglass", 6, 0.75, ["crops", "greenhouse"], "plodiny a skleník rostou o 25 % rychleji"),
    hourglass("Timber Hourglass", 4, 0.75, ["trees"], "stromy o 25 % rychleji"),
    hourglass("Ore Hourglass", 3, 0.5, ["stone", "iron", "gold"], "kámen, železo, zlato 2× rychleji"),
    hourglass("Orchard Hourglass", 6, 0.75, ["fruits"], "ovoce o 25 % rychleji"),
    hourglass("Blossom Hourglass", 4, 0.75, ["flowers"], "květiny o 25 % rychleji"),
    { name: "Gourmet Hourglass", kind: "consumable", what: "vaření 2× rychleji, 4 h", tickets: 100, perUse: null, basis: "vaření tracker neoceňuje" },
    { name: "Fisher's Hourglass", kind: "consumable", what: "50 % šance +1 ryba, 4 h", tickets: 200, perUse: null, basis: "rybaření tracker neoceňuje" },
    // Cave Dwellers megastore (megastore.ts)
    { name: "Duende Hat", kind: "wearable", what: "plodiny na polích a ovoce rostou o 10 % rychleji", tickets: 9000,
      perDay: Object.keys(catNet).length ? (Math.max(0, catNet.crops || 0) + Math.max(0, catNet.fruits || 0)) * (1 / 0.9 - 1) : null,
      basis: Object.keys(catNet).length ? `čisté crops+fruits ${(Math.max(0, catNet.crops || 0) + Math.max(0, catNet.fruits || 0)).toFixed(1)}/den × 11 %` : "bez výpočtu POWER" },
    { name: "Straw House", kind: "collectible", what: "kompostér o 10 % rychleji, 3× základní kompost a červi", tickets: 9000, perDay: null, basis: "compost tracker oceňuje jen u skillů" },
    { name: "Duende Monument", kind: "collectible", what: "expanze −10 % surovin (ne s Grinx's Hammer) a o 10 % rychleji (s 1000 fandy vesnice)", tickets: 4000, perDay: 0, basis: "žádný denní výnos" },
    { name: "Pot of Luck", kind: "collectible", what: "1/3 šance na poklad navíc v poušti", tickets: null, price: "250 Clover Coin", perDay: null, basis: "kopání tracker neoceňuje" },
    { name: "Duende Shoes", kind: "wearable", what: "+1 Duende Cap za chore, dodávku i bounty", tickets: null, price: "5,000 coins", perDay: null, basis: "viz bonusy ticketů" },
    { name: "Duende Pants", kind: "wearable", what: "+1 Duende Cap za chore, dodávku i bounty", tickets: null, price: "10 FLOWER", perDay: null, basis: "viz bonusy ticketů" },
    { name: "Duende Shirt", kind: "wearable", what: "+1 Duende Cap za chore, dodávku i bounty", tickets: null, price: "50 FLOWER", perDay: null, basis: "viz bonusy ticketů" },
  ];
  // An hourglass burns out, so having some is no reason not to buy more: count them instead.
  return items.map((it) => ({ ...it, source: "shop",
    owned: it.kind === "consumable" ? false : hasItem(farm, it.name, it.kind === "wearable" ? "wearable" : "collectible"),
    have: it.kind === "consumable" ? +(farm.inventory?.[it.name] || 0) : null,
    price: it.price || (it.tickets ? `${it.tickets.toLocaleString("en-US")} ${ticket}` : "—"),
    perDay: it.perDay === undefined ? null : it.perDay, perUse: it.perUse === undefined ? null : it.perUse,
    perYear: it.perDay == null ? null : it.perDay * 365 }));
}

/**
 * The chapter goal: an item you want from the ticket auction, what you think it is worth, and
 * how many tickets its lot will take. Answers what a ticket is worth to you for it, whether the
 * weeks left can get you there, what that costs, and what the gem round or waiting would cost.
 * @param goal  { value (FLOWER), tickets }
 * @param ctx   { collected, weeksLeft, curve: [[ticketsPerWeek, costPerWeek]] ascending,
 *                track (tickets from the chapter track still to come), rounds (roundRatios) }
 */
export function ticketGoal(goal, ctx) {
  const value = Math.max(0, +goal.value || 0), tickets = Math.max(0, +goal.tickets || 0);
  const weeks = Math.max(0, +ctx.weeksLeft || 0);
  const have = Math.max(0, +ctx.collected || 0) + Math.max(0, +ctx.track || 0);
  const curve = (ctx.curve || []).filter((p) => p && p[0] > 0).sort((a, b) => a[0] - b[0]);
  const maxPerWeek = curve.length ? curve[curve.length - 1][0] : 0;
  const needPerWeek = weeks > 0 ? Math.max(0, (tickets - have) / weeks) : (tickets > have ? Infinity : 0);
  let costPerWeek = null;
  if (needPerWeek === 0) costPerWeek = 0;
  else for (let i = 0; i < curve.length; i++) {
    if (needPerWeek <= curve[i][0]) {
      const [t0, c0] = i ? curve[i - 1] : [0, 0], [t1, c1] = curve[i];
      costPerWeek = c0 + (c1 - c0) * (t1 > t0 ? (needPerWeek - t0) / (t1 - t0) : 0);
      break;
    }
  }
  const reachable = costPerWeek != null;
  const cost = reachable ? costPerWeek * weeks : null;
  const worth = value * (1 - MARKET_FEE);
  const r = ctx.rounds || {};
  return {
    value, tickets, ticketValue: tickets > 0 ? worth / tickets : 0,
    needPerWeek, maxPerWeek, maxTickets: Math.round(have + maxPerWeek * weeks),
    reachable, cost, net: reachable ? worth - cost : null,
    verdict: !reachable ? "unreachable" : worth > cost ? "collect" : "not-worth",
    gemCost: r.gem ? value * r.gem.median : null, flowerCost: r.flower ? value * r.flower.median : null, waitCost: value,
  };
}

export { AUCTION_REFERENCE, choreCost, raiseCost, ticketBonuses, roundRatios, auctionItemValues, shopItemValues };
