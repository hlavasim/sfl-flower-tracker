import { test } from "node:test";
import assert from "node:assert";
import { valueHoldings, eggBookValue, eggCostBasis, CHAINS } from "../../api/_holdings.js";

/*
 * The Investment Tracker values a registered address by everything it holds. These pin the split
 * (tokens -> WALLET, Genesis eggs -> YAKKAMON), the pricing (eggs at the best fillable Hidden offer
 * in WRON -> USD -> BTC) and that a failed chain is reported, never silently zero.
 */
const prices = { usd: 1, bitcoin: 80000, ethereum: 4000, ronin: 0.06, "flower-2": 0.16 };
const balances = [
  { chain: "base", symbol: "ETH", amount: 0.0005, price: "ethereum" },
  { chain: "base", symbol: "USDC", amount: 2187.61, price: "usd" },
  { chain: "base", symbol: "FLOWER", amount: 22901, price: "flower-2" },
  { chain: "base", symbol: "cbBTC", amount: 0, price: "bitcoin" },
  { chain: "ronin", symbol: "RON", amount: 20, price: "ronin" },
  { chain: "ronin", symbol: "Genesis Egg", amount: 20, price: "egg", kind: "egg" },
  { chain: "base", symbol: "WETH", amount: 0.000001, price: "ethereum" },   // dust
  { chain: "ronin", error: "ronin-rpc 525" },
];

// A deep enough book to fill all 20 eggs at one price, so the split/pricing test stays about that.
const deepBook = [{ wron: 390, qty: 50 }];

test("tokens go to WALLET, eggs to YAKKAMON, each valued in USD and BTC", () => {
  const { venues, errors } = valueHoldings(balances, prices, deepBook);
  const w = venues.wallet, y = venues.yakkamon;
  const wantUsd = 0.0005 * 4000 + 2187.61 + 22901 * 0.16 + 20 * 0.06 + 0.000001 * 4000;
  assert.ok(Math.abs(w.usd - wantUsd) < 1e-9);
  assert.ok(Math.abs(w.btc - wantUsd / 80000) < 1e-12);
  assert.deepEqual(w.items.map((i) => i.symbol), ["FLOWER", "USDC", "ETH", "RON"], "sorted by value, dust dropped from the list");
  assert.ok(Math.abs(y.usd - 20 * 390 * 0.06) < 1e-9, "20 eggs × 390 WRON × RON/USD");
  assert.equal(y.items[0].amount, 20);
  assert.ok(Math.abs(y.items[0].unitUsd - 23.4) < 1e-9);
  assert.deepEqual(errors, ["ronin: ronin-rpc 525"]);
});

test("no egg offer means eggs are listed but worth nothing, not skipped", () => {
  const { venues } = valueHoldings(balances, prices, []);
  assert.equal(venues.yakkamon.usd, 0);
  assert.equal(venues.yakkamon.items.length, 1);
  assert.equal(venues.yakkamon.items[0].unfilled, 20, "and the item says none of them can be sold");
});

/*
 * The owner's rule (2026-10-06): every egg at the best fillable offer, whatever quantity it covers —
 * the eggs are sold over days through listings, not dumped into the book. An offer made by one of
 * the owner's own wallets never prices his eggs (the egg bot's 460 bids once inflated them).
 */
test("eggs: each at the best fillable offer, the owner's own offers excluded", () => {
  const book = [{ wron: 250, qty: 50 }, { wron: 460, qty: 18, buyer: "0xbot" }, { wron: 390, qty: 1 }, { wron: 300, qty: 5 }];
  const { venues } = valueHoldings(balances, prices, book, ["0xBOT"]);
  const y = venues.yakkamon.items[0];
  assert.ok(Math.abs(venues.yakkamon.usd - 20 * 390 * 0.06) < 1e-9, `${venues.yakkamon.usd} ≠ 20 × 390 WRON × 0.06`);
  assert.equal(y.unitWron, 390, "the best offer by someone else, not the own 460");
  assert.equal(y.unfilled, 0);
  // The book walk stays available (eggBookValue) for anyone who wants the dump price.
  assert.deepEqual(eggBookValue([{ wron: 400, qty: 3 }, { wron: 0, qty: 9 }, { wron: 100, qty: 0 }], 5),
    { wron: 1200, filled: 3, unfilled: 2 });
});

/*
 * After the reveal (2026-10-14) offers target traits: a 5,500 WRON bid for a Raigo priced every
 * Brazito the owner held at 5,500. Each egg takes only the best offer whose criteria all match its
 * own traits; an offer on a numeric trait cannot be checked and never matches.
 */
test("eggs: each at the best offer whose trait criteria it meets", () => {
  const eggBal = [{ chain: "ronin", symbol: "Genesis Egg", amount: 3, price: "egg", kind: "egg", eggs: [
    { id: "803", traits: { Monster: "Brazito", Rarity: "Uncommon", Status: "Revealed" } },
    { id: "7105", traits: { Monster: "Salu", Rarity: "Legendary", Status: "Revealed" } },
    { id: "9", traits: null },   // metadata unreadable: only an offer without criteria can price it
  ] }];
  const book = [
    { wron: 5500, qty: 1, criteria: [{ traitName: "Monster", traitValue: "Raigo" }] },
    { wron: 900, qty: 1, criteria: [{ traitName: "Rarity", traitValue: "Uncommon" }], numeric: true },
    { wron: 800, qty: 1, criteria: [{ traitName: "Rarity", traitValue: "Legendary" }] },
    { wron: 300, qty: 1, criteria: [{ traitName: "Rarity", traitValue: "Uncommon" }], buyer: "0xbot" },
    { wron: 290, qty: 1, criteria: [{ traitName: "Rarity", traitValue: "Uncommon" }] },
    { wron: 31, qty: 4, criteria: [] },
  ];
  const y = valueHoldings(eggBal, prices, book, ["0xbot"]).venues.yakkamon.items[0];
  assert.equal(y.bookWron, 290 + 800 + 31, "Brazito 290, Salu 800, the unreadable one 31 — never the Raigo 5,500");
  assert.equal(y.filled, 3);
  assert.ok(Math.abs(y.usd - (290 + 800 + 31) * 0.06) < 1e-9);
});

test("every token's price id is one the price feed fetches", () => {
  const ids = new Set(["usd", "bitcoin", "ethereum", "ronin", "flower-2"]);
  for (const c of Object.values(CHAINS)) {
    assert.ok(ids.has(c.native.price));
    for (const t of Object.values(c.tokens)) assert.ok(ids.has(t.price), t.address);
  }
});

test("egg cost basis counts only the held eggs that were bought; received ones stay unpriced", () => {
  const mine = { "1": "Hidden", "2": "Hidden", "3": "Hidden" };
  const cost = { "1": 430.46, "2": 325.01, "99": 500 };   // 99 was sold, 3 was never bought
  assert.deepEqual(eggCostBasis(mine, cost), { wron: 430.46 + 325.01, bought: 2, unbought: 1 });
  assert.deepEqual(eggCostBasis(null, null), { wron: 0, bought: 0, unbought: 0 });
});
