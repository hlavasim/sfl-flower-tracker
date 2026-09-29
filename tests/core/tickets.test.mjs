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
