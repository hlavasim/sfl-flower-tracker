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
import { computeSaltYieldPerRake, computeSaltRakeCoinMult } from "../engine/cooking-cost.mjs";
import { CHORE_TASKS } from "../engine/chore-tasks.mjs";
import { SALT_RAKE_COST, FISH_BASE_XP, GAME_FISH_SPELLING, getAgingSaltCost, getAgingMaxXP } from "../data/cooking.mjs";

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
// What a ticket is worth when deciding whether a source is worth doing: last chapter's mid lots
// sold for 0.08-0.12 FLOWER per ticket they took (Navigation Table 0.118, Giant Onion 0.082).
const GUIDE_TICKET_VALUE = 0.1;
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
/*
 * This chapter's auction schedule as the game's auctioneer lists it (copied by the owner from the
 * in-game list, 2026-10-05; the list itself needs a login). Every item runs 5 rounds 5 h apart
 * from `first` (UTC). Old items return (Quarry, Autumn's Embrace, Tomato Clown); "Pet" is a pet
 * NFT. supply = the number on the item's card. Prices are set per round by the server — not here.
 */
const AUCTION_SCHEDULE = {
  chapter: "Ascension Age", readAt: "2026-10-05", rounds: 5, everyH: 5,
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
};
const CURRENT_AUCTION_ITEMS = AUCTION_SCHEDULE.items.map((i) => i.name);

/*
 * The schedule with what each item would add on this farm: the chapter model (auctionItemValues)
 * where it prices the item, else the POWER valuation of its boost (opts.boostPerDay, the same
 * marginal POWER shows). Rounds already started stay listed as done.
 */
function auctionSchedule(farm, chapterItems, opts, now) {
  const S = AUCTION_SCHEDULE, H = 3600000;
  const byName = Object.fromEntries(chapterItems.map((i) => [i.name, i]));
  const bpd = opts.boostPerDay || {};
  return { chapter: S.chapter, readAt: S.readAt, items: S.items.map((it) => {
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

  // This chapter: its auction may still be ahead, with what has been collected by then.
  const auctionAt = AUCTION_WEEK[chapter.name] || null;
  const perWeekNow = weeksDone > 0 ? collected / weeksDone : 0;
  const thisAuction = auctionAt ? {
    at: auctionAt, weeksUntil: +Math.max(0, (auctionAt - now) / (7 * DAY)).toFixed(2),
    ticketsExpected: Math.round(collected + perWeekNow * Math.max(0, (auctionAt - now) / (7 * DAY))),
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
    weekEnd, daysLeftInWeek: daysLeft };

  const chapterItems = [...auctionItemValues(farm, prices, opts), ...shopItemValues(farm, prices, opts)];
  return {
    chapter: { name: chapter.name, ticket, start: chapter.start, tasksBegin, end: chapter.end || null,
      weeksDone: +weeksDone.toFixed(2), weeksLeft: weeksLeft == null ? null : +weeksLeft.toFixed(2),
      collected, perWeek: weeksDone > 0 ? collected / weeksDone : null,
      projectedEnd: weeksLeft != null && weeksDone > 0 ? Math.round(collected + (collected / weeksDone) * weeksLeft) : null },
    bonus, track, bountyBonus,
    sources,
    plans, best, perLot, thisAuction, observedTop: OBSERVED_TOP,
    guide, timeline,
    items: chapterItems,
    schedule: auctionSchedule(farm, chapterItems, opts, now),
    activity: opts.activity || null,
    auction: { reference: { chapter: AUCTION_REFERENCE.chapter, ticket: AUCTION_REFERENCE.ticket, source: AUCTION_REFERENCE.source, readAt: AUCTION_REFERENCE.readAt },
      lots, currentItems: CURRENT_AUCTION_ITEMS },
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
  return {
    days: +days.toFixed(2), from: first.wk, to: last.wk,
    saltHarvests: d("Salt Harvested"), potionGames: Math.max(0, games(last.farm) - games(first.farm)) / days,
    aged, prime, racks,
    fullMoon: { Celestine: d("Celestine Harvested"), Lunara: d("Lunara Harvested"), Duskberry: d("Duskberry Harvested") },
  };
}

const SALT_CHARGE_MS = 7 * 3600000;          // salt.ts SALT_CHARGE_GENERATION_TIME
const POTION_GAME_FEE = 320;                  // startPotion.ts GAME_FEE (coins)
const PRIME_AGED_BASE = 0.1;                  // agingBase.ts PRIME_AGED_BASE_CHANCE

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
  const coinSfl = (c) => (coinsPerSFL > 0 ? c / coinsPerSFL : 0);
  // Salt: harvests a day measured, else every node emptied as it charges.
  const nodes = Object.keys(farm.saltFarm?.nodes || {}).length;
  const saltHarvests = act && act.saltHarvests > 0 ? act.saltHarvests : nodes * (DAY / SALT_CHARGE_MS);
  const saltYield = computeSaltYieldPerRake(farm);
  const rakeCost = coinSfl(SALT_RAKE_COST.coins * computeSaltRakeCoinMult(farm))
    + Object.entries(SALT_RAKE_COST.materials).reduce((s, [m, q]) => s + mv(m) * q, 0);
  const saltPrice = mv("Salt");
  const hasIdol = hasItem(farm, "Ascended Idol", "collectible");
  // Aging: fish aged a day by species, with their base XP.
  const spell = Object.fromEntries(Object.entries(GAME_FISH_SPELLING).map(([k, v]) => [v, k]));
  const agedRows = act ? Object.keys({ ...act.aged, ...act.prime }).map((sp) => {
    const fish = spell[sp] || sp; const base = FISH_BASE_XP[fish];
    return base ? { fish, perDay: (act.aged[sp] || 0) + (act.prime[sp] || 0), prime: act.prime[sp] || 0, base } : null;
  }).filter(Boolean) : [];
  const agedPerDay = agedRows.reduce((s, r) => s + r.perDay, 0);
  let sflPerXP = 0;
  try {
    const sc = calcSkillPointCost(farm.bumpkin, prices.marketValue || {}, farm);
    if (sc && sc.bestRecipe && sc.bestRecipe.boostedXP > 0) sflPerXP = sc.bestRecipe.cost / sc.bestRecipe.boostedXP;
  } catch { sflPerXP = 0; }
  const needAct = "potřebuje historii farmy (jen sledované farmy)";
  const items = [
    { name: "Ascended Idol", kind: "collectible", what: "sůl bez hrábí",
      perDay: saltHarvests * rakeCost,
      basis: `${saltHarvests.toFixed(1)} sklizní soli/den × hrábě ${rakeCost.toFixed(3)}` },
    { name: "Salt Worker Gnome", kind: "collectible", what: "nabíjení soli ×0,7 a +2 sůl za sklizeň",
      perDay: (() => {
        const more = saltHarvests * (1 / 0.7 - 1);
        return (more * (saltYield + 2) + saltHarvests * 2) * saltPrice - (hasIdol ? 0 : more * rakeCost);
      })(),
      basis: `${saltHarvests.toFixed(1)} → ${(saltHarvests / 0.7).toFixed(1)} sklizní/den, ${saltYield}+2 soli, sůl ${saltPrice.toFixed(4)}` },
    { name: "Surfer Hair", kind: "wearable", what: "poloviční sůl na stárnutí ryb",
      perDay: act ? agedRows.reduce((s, r) => s + r.perDay * getAgingSaltCost(r.base), 0) * 0.5 * saltPrice : null,
      basis: act ? `${agedPerDay.toFixed(1)} ryb/den` : needAct },
    { name: "Winged Vase", kind: "collectible", what: "+14 % šance na Prime Aged (+30 % XP)",
      perDay: act ? agedRows.reduce((s, r) => s + r.perDay * 0.14 * (Math.floor(getAgingMaxXP(r.base) * 1.3) - getAgingMaxXP(r.base)), 0) * sflPerXP : null,
      basis: act ? `${agedPerDay.toFixed(1)} ryb/den, XP po ${sflPerXP.toFixed(6)}` : needAct },
    { name: "Alchemist Apron", kind: "wearable", what: "poloviční poplatek v Potion House",
      perDay: act ? act.potionGames * coinSfl(POTION_GAME_FEE * 0.5) : null,
      basis: act ? `${act.potionGames.toFixed(2)} her/den` : needAct },
    // applyAnimalFeedBuff.ts: a Salt Lick (produce ×1.05) or Honey Treat (feed ×0.75) buff lasts
    // 6 harvests instead of 3 — the same buffs for half the items.
    { name: "Vibraphone", kind: "collectible", what: "buff ze Salt Lick / Honey Treat vydrží 6 sklizní místo 3",
      perDay: act && (mv("Salt Lick") > 0 || mv("Honey Treat") > 0)
        ? ((act.racks["Salt Lick"] || 0) * mv("Salt Lick") + (act.racks["Honey Treat"] || 0) * mv("Honey Treat")) * 0.5 : null,
      basis: act ? `ušetří půlku Salt Lick / Honey Treat (${((act.racks["Salt Lick"] || 0) + (act.racks["Honey Treat"] || 0)).toFixed(1)}/den)${mv("Salt Lick") > 0 ? "" : " — nemají cenu"}` : "potřebuje historii farmy" },
    { name: "Rice Shirt", kind: "wearable", what: "+1 rýže, poloviční olej na rýži", perDay: null, basis: "v ROADMAP/POWER" },
    { name: "Salt Rug", kind: "collectible", what: "dekorace", perDay: 0, basis: "" },
    { name: "Coat Rack", kind: "collectible", what: "dekorace", perDay: 0, basis: "" },
  ];
  return items.map((it) => ({ ...it, source: "auction", owned: hasItem(farm, it.name, it.kind),
    perYear: it.perDay == null ? null : it.perDay * 365 }));
}

/*
 * This chapter's megastore (megastore.ts), priced in its ticket, valued on THIS farm:
 *   hourglasses  one placed window of `hours` in which planting/chopping/mining starts at `mult`
 *                of the time (collectibleBuilt.ts, plant.ts, chop.ts, stoneMine.ts…): worth the
 *                category's net for the window × the time saved — "per use", they burn out
 *   Moon Hair    +0.5 per Celestine / Lunara / Duskberry harvest (fruitHarvested.ts), measured
 *   Astrolabe    +5 % XP eating aged fish (boosts.ts) and 15 % double spice / fermentation
 *                output (agingFormulas.ts) — the output only where it has a price
 * Monuments work only with the village's cheers (monuments.ts isMonumentActive) and give no
 * daily resource; Otty, Gourmet and Fisher's act on fishing and cooking, which the tracker does
 * not price. Those stay null with the reason.
 */
function shopItemValues(farm, prices, opts) {
  const act = opts.activity || null;
  const catNet = opts.catNet || {};
  const mv = (n) => (prices.marketValue || {})[n] || (prices.productionCost || {})[n] || 0;
  const ticket = currentChapter(opts.now || Date.now()).ticket;
  let sflPerXP = 0;
  try {
    const sc = calcSkillPointCost(farm.bumpkin, prices.marketValue || {}, farm);
    if (sc && sc.bestRecipe && sc.bestRecipe.boostedXP > 0) sflPerXP = sc.bestRecipe.cost / sc.bestRecipe.boostedXP;
  } catch { sflPerXP = 0; }
  const hourglass = (name, hours, mult, cats, what) => {
    const net = cats.reduce((s, c) => s + Math.max(0, catNet[c] || 0), 0);
    return { name, kind: "consumable", what: `${what}, ${hours} h`, tickets: name === "Ore Hourglass" ? 400 : 200,
      perUse: cats.length && Object.keys(catNet).length ? net * (hours / 24) * (1 / mult - 1) : null,
      basis: Object.keys(catNet).length ? `čisté ${cats.join("+")} ${net.toFixed(1)}/den, když celé okno sázíš/těžíš` : "bez výpočtu POWER" };
  };
  const spell = Object.fromEntries(Object.entries(GAME_FISH_SPELLING).map(([k, v]) => [v, k]));
  const agedXpPerDay = act ? Object.entries(act.aged).reduce((s, [sp, n]) => { const b = FISH_BASE_XP[spell[sp] || sp]; return b ? s + n * getAgingMaxXP(b) : s; }, 0)
    + Object.entries(act.prime).reduce((s, [sp, n]) => { const b = FISH_BASE_XP[spell[sp] || sp]; return b ? s + n * Math.floor(getAgingMaxXP(b) * 1.3) : s; }, 0) : 0;
  const rackOut = act ? Object.entries(act.racks).reduce((s, [item, n]) => s + n * mv(item), 0) : 0;
  const fm = act ? act.fullMoon || {} : {};
  const items = [
    hourglass("Harvest Hourglass", 6, 0.75, ["crops", "greenhouse"], "plodiny a skleník rostou o 25 % rychleji"),
    hourglass("Timber Hourglass", 4, 0.75, ["trees"], "stromy o 25 % rychleji"),
    hourglass("Ore Hourglass", 3, 0.5, ["stone", "iron", "gold"], "kámen, železo, zlato 2× rychleji"),
    hourglass("Orchard Hourglass", 6, 0.75, ["fruits"], "ovoce o 25 % rychleji"),
    hourglass("Blossom Hourglass", 4, 0.75, ["flowers"], "květiny o 25 % rychleji"),
    { name: "Gourmet Hourglass", kind: "consumable", what: "vaření 2× rychleji, 4 h", tickets: 100, perUse: null, basis: "vaření tracker neoceňuje" },
    { name: "Fisher's Hourglass", kind: "consumable", what: "50 % šance +1 ryba, 4 h", tickets: 200, perUse: null, basis: "rybaření tracker neoceňuje" },
    { name: "Moon Hair", kind: "wearable", what: "+0,5 úrody Celestine / Lunara / Duskberry", tickets: 9000,
      perDay: act ? Object.entries(fm).reduce((s, [f, n]) => s + n * 0.5 * mv(f), 0) : null,
      basis: act ? `${Object.values(fm).reduce((s, n) => s + n, 0).toFixed(2)} sklizní/den` : "potřebuje historii farmy" },
    { name: "Astrolabe", kind: "collectible", what: "+5 % XP ze stárnutých ryb, 15 % dvojnásobek koření a fermentace", tickets: 9000,
      perDay: act ? agedXpPerDay * 0.05 * sflPerXP + rackOut * 0.15 : null,
      basis: act ? `${Math.round(agedXpPerDay)} XP/den z ryb; výstupy regálů jen s cenou (${rackOut.toFixed(2)}/den)` : "potřebuje historii farmy" },
    { name: "Ascension Monument", kind: "collectible", what: "expanze se staví o 20 % rychleji (s 1000 fandy vesnice)", tickets: 4000, perDay: 0, basis: "žádný denní výnos" },
    { name: "Cornucopia", kind: "collectible", what: "+1 obří ovoce z vesnických projektů (s 1000 fandy)", tickets: 9000, perDay: null, basis: "závisí na projektech vesnice" },
    { name: "Teamwork Monument", kind: "collectible", what: "+1 pomoc denně (se 100 fandy)", tickets: 6000, perDay: null, basis: "pomoc tracker neoceňuje" },
    { name: "Otty the Otter", kind: "collectible", what: "+5 nahození denně, každé 15. ryba navíc", tickets: null, price: "250 Otter Pebble", perDay: null, basis: "rybaření tracker neoceňuje" },
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
