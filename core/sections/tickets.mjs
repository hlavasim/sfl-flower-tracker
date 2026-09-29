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
import { findCollectible, ANIMAL_LEVELS, GOLDEN_ANIMALS } from "../engine/power-helpers.mjs";
import { FEED_RECIPES, FEED_QTY, FEED_XP_TABLE } from "../engine/power-costs.mjs";

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
const AUCTION_WEEK = { "Ascension Age": Date.UTC(2026, 9, 5) };
// What the best farms actually made (community dumps 2026-09-21 → 09-28): the median of the 82
// farms at the chapter cap made 1,568 a week; the cap itself was 11,844 after 7.2 weeks. Deliveries
// ×2 calendar events and more animal bounties get them above what one board shows.
const OBSERVED_TOP = { perWeek: 1568, capTotal: 11844, weeks: 7.2, readAt: "2026-09-28" };
// A young animal raised for a bounty still yields something on its way up; the slot's full
// output is lost only in part. 0.7 = the share assumed lost (an estimate, shown on the page).
const RAISE_SLOT_LOSS = 0.7;

/*
 * Ticket-priced lots of the last finished chapter's auction (Salt Awakening), from
 * https://sfl.world/info/auctions, read 2026-09-29. Each lot ran in five rounds per currency;
 * the numbers are the mean minimum WINNING bid across the rounds. flower/gem = the same item's
 * FLOWER and Gem rounds (null when it had none). The lot's value is its NFT price today
 * (opts.floors), so a ticket is worth what the item it wins sells for.
 */
const AUCTION_REFERENCE = {
  chapter: "Salt Awakening", ticket: "Salt Rock", source: "https://sfl.world/info/auctions", readAt: "2026-09-29",
  lots: [
    { name: "Crab House",       supply: 75,  tickets: 13091, flower: 5015, gem: 81439 },
    { name: "Obsidian Turtle",  supply: 90,  tickets: 13085, flower: null, gem: null },
    { name: "Royal Crab Pot",   supply: 60,  tickets: 12988, flower: 4832, gem: 94175 },
    { name: "Summer Guardian",  supply: 150, tickets: 7437,  flower: null, gem: null },
    { name: "Giant Onion",      supply: 80,  tickets: 6712,  flower: null, gem: null },
    { name: "Pistol Shrimp",    supply: 150, tickets: 5815,  flower: 386,  gem: 9164 },
    { name: "Navigation Table", supply: 150, tickets: 5639,  flower: 869,  gem: 14396 },
    { name: "Speed Trap",       supply: 120, tickets: 5541,  flower: 336,  gem: 8264 },
    { name: "Pufferfish",       supply: 180, tickets: 342,   flower: 19,   gem: null },
    { name: "Fat Crab",         supply: 180, tickets: 341,   flower: 18,   gem: null },
  ],
};
// This chapter's auction items (collections.ts); their ticket prices are set by the server.
const CURRENT_AUCTION_ITEMS = ["Salt Rug", "Coat Rack", "Vibraphone", "Winged Vase", "Ascended Idol",
  "Salt Worker Gnome", "Surfer Hair", "Rice Shirt", "Alchemist Apron"];
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

  // Chores — this week's board.
  for (const [npc, c] of Object.entries(farm.choreBoard?.chores || {})) {
    const t = +(c.reward?.items?.[ticket] || 0);
    if (!t) continue;
    const cc = choreCost(c.name || "", prices, coinsPerSFL);
    add({ group: "chore", label: c.name, npc, tickets: t + bonus.chore, per: "week", cost: cc.cost, kind: cc.kind,
      item: cc.item || null, done: !!c.completedAt });
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

  // This chapter: its auction may still be ahead, with what has been collected by then.
  const auctionAt = AUCTION_WEEK[chapter.name] || null;
  const perWeekNow = weeksDone > 0 ? collected / weeksDone : 0;
  const thisAuction = auctionAt ? {
    at: auctionAt, weeksUntil: +Math.max(0, (auctionAt - now) / (7 * DAY)).toFixed(2),
    ticketsExpected: Math.round(collected + perWeekNow * Math.max(0, (auctionAt - now) / (7 * DAY))),
  } : null;
  if (thisAuction) { const l = lotFor(thisAuction.ticketsExpected); thisAuction.lastChapterEquivalent = l ? l.name : null; }

  return {
    chapter: { name: chapter.name, ticket, start: chapter.start, tasksBegin, end: chapter.end || null,
      weeksDone: +weeksDone.toFixed(2), weeksLeft: weeksLeft == null ? null : +weeksLeft.toFixed(2),
      collected, perWeek: weeksDone > 0 ? collected / weeksDone : null,
      projectedEnd: weeksLeft != null && weeksDone > 0 ? Math.round(collected + (collected / weeksDone) * weeksLeft) : null },
    bonus, track, bountyBonus,
    sources,
    plans, best, perLot, thisAuction, observedTop: OBSERVED_TOP,
    auction: { reference: { chapter: AUCTION_REFERENCE.chapter, ticket: AUCTION_REFERENCE.ticket, source: AUCTION_REFERENCE.source, readAt: AUCTION_REFERENCE.readAt },
      lots, currentItems: CURRENT_AUCTION_ITEMS },
    assumptions: { weeksToAuction: WEEKS_TO_AUCTION, raiseSlotLoss: RAISE_SLOT_LOSS, marketFee: MARKET_FEE,
      weeklyBountyBonus: WEEKLY_BOUNTY_BONUS },
  };
}

export { AUCTION_REFERENCE, choreCost, raiseCost, ticketBonuses };
