import { test } from "node:test";
import assert from "node:assert";
import { buildTicketsSection, choreCost } from "../../core/sections/tickets.mjs";
import { TICKET_REWARDS, dashGetCurrentChapter } from "../../core/engine/gifts-deliveries.mjs";

// 2026-09-29 12:00 UTC, a Tuesday in Ascension Age (tasks since 2026-08-10, auction week 2026-10-05).
const NOW = Date.UTC(2026, 8, 29, 12);
const prices = {
  productionCost: { "Antipasto": 1.2, "Orange Cake": 0.95, "Mariner Pot": 0.43 },
  marketValue: { "Corn": 0.0126, "Wheat": 0.0177, "Barley": 0.0214, "Potato": 0.0002, "Orange": 0.0126,
    "Sunfish": 2, "Red Cosmos": 0.16, "Rod": 0.05, "Earthworm": 0.01 },
};
function farm(extra = {}) {
  return {
    inventory: {}, farmActivity: { "Shiny Feather Collected": "4000" },
    vip: { expiresAt: NOW + 30 * 86400000 },
    bumpkin: { equipped: { hat: "Swamp Lily Hat" } },
    farmHands: { bumpkins: { 1: { equipped: { suit: "Swamp Armor" } } } },
    collectibles: {},
    delivery: { orders: [
      { id: "a", from: "tywin", items: { Potato: 100 }, reward: {}, createdAt: NOW },
      { id: "b", from: "pharaoh", items: { Sunfish: 1 }, reward: {}, createdAt: NOW, completedAt: NOW - 3600000 },
    ] },
    choreBoard: { chores: {
      bert: { name: "Mine Stones 100 times", reward: { items: { "Shiny Feather": 2 } } },
      tango: { name: "Cook Antipasto 50 times", reward: { items: { "Shiny Feather": 3 } } },
      peggy: { name: "Pick Oranges 250 times", reward: { items: { "Shiny Feather": 1 } }, completedAt: NOW },
      coins: { name: "Collect Eggs 10 times", reward: { coins: 50 } },
    } },
    bounties: { requests: [
      { id: "r1", name: "Red Cosmos", items: { "Shiny Feather": 8 } },
      { id: "r2", name: "Sunfish", items: { "Shiny Feather": 2 } },
      { id: "c1", name: "Chicken", level: 2, items: { "Shiny Feather": 1 } },
      { id: "c2", name: "Cow", level: 11, items: { "Shiny Feather": 5 } },
      { id: "g1", name: "Sheep", level: 4, items: { Gem: 10 } },
    ], completed: [{ id: "r1" }] },
    ...extra,
  };
}

test("the chapter table knows Ascension Age and the game's current delivery tickets", () => {
  // Without it the dashboard called Salt Rock the ticket for two months.
  assert.equal(dashGetCurrentChapter(NOW).name, "Ascension Age");
  assert.equal(dashGetCurrentChapter(NOW).ticket, "Shiny Feather");
  assert.deepEqual([TICKET_REWARDS.tywin, TICKET_REWARDS.finn, TICKET_REWARDS.raven, TICKET_REWARDS.cornwell, TICKET_REWARDS.pharaoh], [10, 5, 4, 3, 6]);
});

test("bonuses: VIP +2 on deliveries and chores, worn boost items +1 everywhere, including a farm hand's", () => {
  const d = buildTicketsSection(farm(), prices, { now: NOW });
  assert.equal(d.bonus.vip, true);
  assert.deepEqual(d.bonus.items.map((i) => i.active), [true, true, false]); // hat on the bumpkin, armor on a hand
  assert.deepEqual([d.bonus.delivery, d.bonus.chore, d.bonus.bounty], [4, 4, 2]);
  const tywin = d.sources.find((s) => s.group === "delivery" && s.label === "tywin");
  assert.equal(tywin.tickets, 10 + 4);
  assert.ok(Math.abs(tywin.cost - 100 * 0.0002) < 1e-9);
  assert.equal(d.sources.find((s) => s.label === "pharaoh").done, true);
  // A chore that pays coins, not tickets, is not a ticket source.
  assert.ok(!d.sources.some((s) => s.label === "Collect Eggs 10 times"));
});

test("chore costs come from the verb: free, planting, consuming, fishing", () => {
  assert.deepEqual(choreCost("Mine Stones 100 times", prices, 0), { kind: "free", cost: 0 });
  assert.equal(choreCost("Pick Oranges 250 times", prices, 0).kind, "plant");
  const cook = choreCost("Cook Antipasto 50 times", prices, 0);
  assert.equal(cook.kind, "consume"); assert.ok(Math.abs(cook.cost - 60) < 1e-9);
  const eat = choreCost("Eat 13 Orange Cake", prices, 0);
  assert.ok(Math.abs(eat.cost - 13 * 0.95) < 1e-9);
  const craft = choreCost("Craft 40 Mariner Pots", prices, 0); // plural resolved to the item
  assert.equal(craft.item, "Mariner Pot"); assert.ok(Math.abs(craft.cost - 40 * 0.43) < 1e-9);
  assert.ok(Math.abs(choreCost("Fish 80 times", prices, 0).cost - 80 * 0.06) < 1e-9);
  assert.equal(choreCost("Do a backflip", prices, 0).cost, null);
});

test("bounties: no VIP bonus, the weekly bonus lists what is still open", () => {
  const d = buildTicketsSection(farm(), prices, { now: NOW });
  const cosmos = d.sources.find((s) => s.label === "Red Cosmos");
  assert.equal(cosmos.tickets, 8 + 2); assert.equal(cosmos.done, true);
  assert.deepEqual(d.bountyBonus.open, ["Sunfish"]);
  assert.equal(d.bountyBonus.claimed, false);
  // Animal bounties that pay Gems are not ticket sources.
  assert.ok(!d.sources.some((s) => s.label === "Sheep L4"));
});

test("animal bounties cost the feed to raise a replacement plus the slot's output — no feed with the golden animal", () => {
  const plain = buildTicketsSection(farm(), prices, { now: NOW, animalNet: { Chicken: 0.18, Sheep: 0.64 } });
  const cow = plain.sources.find((s) => s.label === "Cow L11");
  assert.ok(cow.feed > 0);
  assert.ok(Math.abs(cow.slot - 0.64 * 11 * 0.7) < 1e-9, "a cow takes a barn slot a sheep would fill");
  const golden = buildTicketsSection(farm({ collectibles: { "Golden Cow": [{ id: "x" }] } }), prices, { now: NOW, animalNet: { Sheep: 0.64 } });
  const gcow = golden.sources.find((s) => s.label === "Cow L11");
  assert.equal(gcow.feed, 0); assert.equal(gcow.golden, true);
});

test("a lot is priced at today's floor after the fee, a joke floor falls back to the last sale", () => {
  const d = buildTicketsSection(farm(), prices, { now: NOW, floors: {
    "Obsidian Turtle": { floor: 5300, lastSalePrice: 4800 }, "Crab House": { floor: 99999999999999, lastSalePrice: 1752 } } });
  const turtle = d.auction.lots.find((l) => l.name === "Obsidian Turtle");
  assert.ok(Math.abs(turtle.perTicket - 5300 * 0.9 / 13085) < 1e-9);
  const house = d.auction.lots.find((l) => l.name === "Crab House");
  assert.equal(house.floor, 0); assert.equal(house.value, 1752);
});

test("plans count the weeks to the auction, not the whole chapter, and say which lots the board cannot reach", () => {
  const d = buildTicketsSection(farm(), prices, { now: NOW, floors: { "Obsidian Turtle": { floor: 5300 }, "Fat Crab": { floor: 6 } } });
  const max = d.plans[d.plans.length - 1];
  assert.equal(max.atAuction, Math.round(max.ticketsPerWeek * 8 + d.track));
  const turtle = d.perLot.find((l) => l.name === "Obsidian Turtle");
  assert.equal(turtle.reachable, false);
  assert.ok(turtle.shortPerWeek > 0);
  assert.equal(d.perLot.find((l) => l.name === "Fat Crab").reachable, true);
  // This chapter: 4,000 collected over ~7.3 weeks, auction in ~0.8 weeks.
  assert.equal(d.thisAuction.at, Date.UTC(2026, 9, 5));
  assert.ok(d.thisAuction.ticketsExpected > 4000 && d.thisAuction.ticketsExpected < 4600);
});

test("history: every week through the same model, frozen weeks kept but out of the averages, a rising cost curve", async () => {
  const { buildTicketHistory } = await import("../../core/sections/tickets.mjs");
  const frozen = farm({ bounties: { requests: [], completed: [] }, choreBoard: { chores: {} } });
  const h = buildTicketHistory([
    { wk: "2026-08-03", ts: Date.UTC(2026, 7, 4), farm: frozen },
    { wk: "2026-09-28", ts: NOW, farm: farm() },
  ], prices, { coinsPerSFL: 1500 });
  assert.equal(h.weeks.length, 2);
  assert.deepEqual(h.weeks.map((w) => w.active), [false, true]);
  assert.equal(h.chapters.length, 1);
  assert.equal(h.chapters[0].name, "Ascension Age");
  assert.equal(h.chapters[0].weeks, 1, "the frozen week is not averaged");
  assert.equal(h.all.weeks, 1);
  for (let i = 1; i < h.curve.length; i++) assert.ok(h.curve[i].cost >= h.curve[i - 1].cost, "more tickets never cost less");
});

test("round ratios: FLOWER and Gem rounds and last sales against today's floor", async () => {
  const { roundRatios } = await import("../../core/sections/tickets.mjs");
  const r = roundRatios([
    { name: "A", floor: 1000, flower: 1400, gem: 30000, last: 700 },
    { name: "B", floor: 500, flower: 600, gem: null, last: 0 },
    { name: "C", floor: 0, flower: 90, gem: 900, last: 5 },
    { name: "Pufferfish", floor: 7, flower: 19, gem: null, last: 5 },
  ], 50);
  assert.equal(r.rows.length, 2, "no floor or a trivial one (under 100), no ratio");
  assert.ok(Math.abs(r.flower.median - (1.4 + 1.2) / 2) < 1e-9);
  assert.ok(Math.abs(r.gem.median - 0.6) < 1e-9, "30,000 gems / 50 per FLOWER = 600 against 1,000");
  assert.equal(r.lastSale.n, 1);
});

test("measured activity: per-day rates from the weekly counters, species kept apart, prime separate", async () => {
  const { measuredActivity } = await import("../../core/sections/tickets.mjs");
  const DAY = 86400000;
  const wk = (ts, a, hist) => ({ wk: new Date(ts).toISOString().slice(0, 10), ts, farm: { farmActivity: a, potionHouse: { history: hist } } });
  const act = measuredActivity([
    wk(NOW - 14 * DAY, { "Salt Harvested": 100, "Aged Tuna Collected": 10, "Prime Aged Tuna Collected": 1, "Refined Salt Spiced": 5 }, { 80: 2 }),
    wk(NOW - 7 * DAY, { "Salt Harvested": 170, "Aged Tuna Collected": 24, "Prime Aged Tuna Collected": 4, "Refined Salt Spiced": 12 }, { 80: 3 }),
    wk(NOW, { "Salt Harvested": 240, "Aged Tuna Collected": 38, "Prime Aged Tuna Collected": 8, "Refined Salt Spiced": 19 }, { 80: 5 }),
  ]);
  assert.equal(act.days, 14);
  assert.ok(Math.abs(act.saltHarvests - 10) < 1e-9);
  assert.ok(Math.abs(act.aged.Tuna - 2) < 1e-9);
  assert.ok(Math.abs(act.prime.Tuna - 0.5) < 1e-9);
  assert.ok(Math.abs(act.racks["Refined Salt"] - 1) < 1e-9);
  assert.ok(Math.abs(act.potionGames - 3 / 14) < 1e-9);
  assert.equal(measuredActivity([wk(NOW, {}, {})]), null, "one snapshot measures nothing");
});

test("auction items: Ascended Idol saves the rakes, Salt Worker Gnome adds salt, owned items are marked", async () => {
  const { auctionItemValues } = await import("../../core/sections/tickets.mjs");
  const p = { marketValue: { Salt: 0.004, Wood: 0.012 }, productionCost: {} };
  const f = farm({ saltFarm: { nodes: { 0: {}, 1: {} } }, wardrobe: { "Rice Shirt": 1 } });
  const act = { saltHarvests: 10, potionGames: 1, aged: {}, prime: {}, racks: {}, from: "a", to: "b" };
  const items = auctionItemValues(f, p, { coinsPerSFL: 1500, activity: act });
  const by = (n) => items.find((i) => i.name === n);
  const rake = 20 / 1500 + 3 * 0.012;
  assert.ok(Math.abs(by("Ascended Idol").perDay - 10 * rake) < 1e-9);
  const more = 10 * (1 / 0.7 - 1);
  assert.ok(Math.abs(by("Salt Worker Gnome").perDay - ((more * 12 + 20) * 0.004 - more * rake)) < 1e-9);
  assert.ok(Math.abs(by("Alchemist Apron").perDay - 160 / 1500) < 1e-9);
  assert.equal(by("Rice Shirt").owned, true);
  // Without history the aging items cannot be priced — null, not 0.
  const bare = auctionItemValues(f, p, { coinsPerSFL: 1500 });
  assert.equal(bare.find((i) => i.name === "Surfer Hair").perDay, null);
  assert.ok(bare.find((i) => i.name === "Ascended Idol").perDay > 0, "salt still priced from the nodes");
});

test("shop: an hourglass is worth its category's net over the window × the time saved, per use", async () => {
  const { shopItemValues } = await import("../../core/sections/tickets.mjs");
  const items = shopItemValues(farm(), prices, { now: NOW, catNet: { stone: 10, iron: 8, gold: 6, crops: 24, greenhouse: 0 } });
  const by = (n) => items.find((i) => i.name === n);
  assert.ok(Math.abs(by("Ore Hourglass").perUse - 24 * (3 / 24) * 1) < 1e-9, "3 h at ×0.5 = 3 h of stone+iron+gold output saved");
  assert.ok(Math.abs(by("Harvest Hourglass").perUse - 24 * (6 / 24) * (1 / 0.75 - 1)) < 1e-9);
  assert.equal(by("Ore Hourglass").tickets, 400);
  assert.equal(by("Ascension Monument").perDay, 0, "no daily income");
  assert.equal(by("Cornucopia").perDay, null);
  assert.equal(by("Otty the Otter").price, "250 Otter Pebble");
});

test("chores: progress from the game's own counter, what is left, and a daily share to the Monday reset", async () => {
  const f = farm({
    farmActivity: { "Shiny Feather Collected": "4000", "Stone Mined": 1060 },
    choreBoard: { chores: { bert: { name: "Mine Stones 100 times", reward: { items: { "Shiny Feather": 2 } }, initialProgress: 1000 } } },
  });
  const d = buildTicketsSection(f, prices, { now: NOW });
  const c = d.sources.find((s) => s.group === "chore");
  assert.equal(c.required, 100);
  assert.equal(c.progress, 60);
  assert.equal(c.remaining, 40);
  // NOW is Tuesday 12:00 UTC: the week resets Monday 00:00, 5.5 days → 6 days.
  assert.equal(c.daysLeft, 6);
  assert.equal(c.perDay, 7);
  assert.equal(d.timeline.weekEnd, Date.UTC(2026, 9, 5));
});

test("chapter goal: ticket value for the item, reachable from the curve, cheaper ways compared", async () => {
  const { ticketGoal } = await import("../../core/sections/tickets.mjs");
  const curve = [[500, 20], [1000, 170], [1300, 380]];
  const rounds = { gem: { median: 0.6 }, flower: { median: 1.4 } };
  // 5,600 tickets in 8 weeks from 0 with 290 from the track: 663.75 a week — on the curve.
  const mid = ticketGoal({ value: 900, tickets: 5600 }, { collected: 0, weeksLeft: 8, curve, track: 290, rounds });
  assert.ok(Math.abs(mid.needPerWeek - 663.75) < 1e-9);
  assert.equal(mid.reachable, true);
  assert.ok(Math.abs(mid.cost - 8 * (20 + 150 * (163.75 / 500))) < 1e-9);
  assert.equal(mid.verdict, "collect");
  assert.ok(Math.abs(mid.ticketValue - 900 * 0.9 / 5600) < 1e-12);
  // 13,000 needs 1,589 a week; the curve tops out at 1,300 → unreachable, with the most you could get.
  const top = ticketGoal({ value: 6900, tickets: 13000 }, { collected: 0, weeksLeft: 8, curve, track: 290, rounds });
  assert.equal(top.reachable, false);
  assert.equal(top.verdict, "unreachable");
  assert.equal(top.maxTickets, 290 + 1300 * 8);
  assert.ok(Math.abs(top.gemCost - 6900 * 0.6) < 1e-9);
  // Already holding enough: costs nothing more.
  assert.equal(ticketGoal({ value: 100, tickets: 400 }, { collected: 500, weeksLeft: 1, curve }).cost, 0);
});
