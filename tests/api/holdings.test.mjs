import { test } from "node:test";
import assert from "node:assert";
import { valueHoldings, CHAINS } from "../../api/_holdings.js";

/*
 * The Investment Tracker values a registered address by everything it holds. These pin the split
 * (tokens -> WALLET, Genesis eggs -> YAKKAMON), the pricing (eggs at the best fillable Hidden offer
 * in WRON -> USD -> BTC) and that a failed chain is reported, never silently zero.
 */
const prices = { usd: 1, bitcoin: 80000, ethereum: 4000, ronin: 0.06, "polygon-ecosystem-token": 0.2, "flower-2": 0.16 };
const balances = [
  { chain: "base", symbol: "ETH", amount: 0.0005, price: "ethereum" },
  { chain: "base", symbol: "USDC", amount: 2187.61, price: "usd" },
  { chain: "base", symbol: "FLOWER", amount: 22901, price: "flower-2" },
  { chain: "base", symbol: "cbBTC", amount: 0, price: "bitcoin" },
  { chain: "ronin", symbol: "RON", amount: 20, price: "ronin" },
  { chain: "ronin", symbol: "Genesis Egg", amount: 20, price: "egg", kind: "egg" },
  { chain: "polygon", symbol: "POL", amount: 0.001, price: "polygon-ecosystem-token" },   // dust
  { chain: "ethereum", error: "ethereum-rpc 525" },
];

test("tokens go to WALLET, eggs to YAKKAMON, each valued in USD and BTC", () => {
  const { venues, errors } = valueHoldings(balances, prices, 390);
  const w = venues.wallet, y = venues.yakkamon;
  const wantUsd = 0.0005 * 4000 + 2187.61 + 22901 * 0.16 + 20 * 0.06 + 0.001 * 0.2;
  assert.ok(Math.abs(w.usd - wantUsd) < 1e-9);
  assert.ok(Math.abs(w.btc - wantUsd / 80000) < 1e-12);
  assert.deepEqual(w.items.map((i) => i.symbol), ["FLOWER", "USDC", "ETH", "RON"], "sorted by value, dust dropped from the list");
  assert.ok(Math.abs(y.usd - 20 * 390 * 0.06) < 1e-9, "20 eggs × 390 WRON × RON/USD");
  assert.equal(y.items[0].amount, 20);
  assert.ok(Math.abs(y.items[0].unitUsd - 23.4) < 1e-9);
  assert.deepEqual(errors, ["ethereum: ethereum-rpc 525"]);
});

test("no egg offer means eggs are listed but worth nothing, not skipped", () => {
  const { venues } = valueHoldings(balances, prices, 0);
  assert.equal(venues.yakkamon.usd, 0);
  assert.equal(venues.yakkamon.items.length, 1);
});

test("every token's price id is one the price feed fetches", () => {
  const ids = new Set(["usd", "bitcoin", "ethereum", "ronin", "polygon-ecosystem-token", "flower-2"]);
  for (const c of Object.values(CHAINS)) {
    assert.ok(ids.has(c.native.price));
    for (const t of Object.values(c.tokens)) assert.ok(ids.has(t.price), t.address);
  }
});
