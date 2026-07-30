import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { diggingVerdict, digToolCost } from "../../core/engine/digging.mjs";
import { buildPowerSection } from "../../core/sections/power.mjs";
import { TREASURE_SELL_PRICES } from "../../core/data/crafting.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const raw = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const p2p = {}; for (const [k, v] of Object.entries(raw)) p2p[k] = parseFloat(v) || 0;
const pd = buildPowerSection(farm, raw, { collectibles: [], wearables: [] }, null, {});

test("digging is answered from the farm's OWN dug grid, not a treasure-probability model", () => {
  /*
   * This was open as "TREASURE_SELL_PRICES exists but the dig-rate model does not". No probability
   * model is needed: desert.digging.grid records every hole with the exact items it yielded and the
   * tool used, which is a real sample of this farm's luck — the same measured principle the harvest
   * efficiency runs on. A modelled treasure table would be one more thing to keep in sync.
   */
  const v = diggingVerdict(farm, pd.p2pPrices, pd.exchangeRates, {});
  assert.equal(v.measured, true, "the fixture farm has dug holes");
  const grid = farm.desert.digging.grid;
  assert.equal(v.digs, grid.filter((c) => c.dugAt).length, "digs = holes actually dug");
  assert.equal(v.holes, grid.length);

  // Items are the SUM of what the grid yielded — nothing invented, nothing dropped.
  const expect = {};
  for (const c of grid) if (c.dugAt) for (const [i, q] of Object.entries(c.items || {})) expect[i] = (expect[i] || 0) + q;
  assert.equal(v.items.length, Object.keys(expect).length, "every distinct item is reported");
  for (const row of v.items) assert.equal(row.qty, expect[row.item], `${row.item}: quantity is the grid's own`);

  // The tool mix is read from the grid too, so the cost is what was really spent.
  const tools = {};
  for (const c of grid) if (c.dugAt) tools[c.tool] = (tools[c.tool] || 0) + 1;
  assert.deepEqual(v.byTool, tools);
});

test("coin income and market income are kept apart, because coins are the app's free resource", () => {
  /*
   * Treasures sell for COINS, and this app treats coins as free once you hold more than 10k. So
   * converting a haul to FLOWER at coinsPerSFL is an ASSUMPTION, and under the app's own rule the
   * FLOWER value of treasure is near zero. Mixing the two into one number would hide that entirely,
   * which is why there are two nets and the assumption travels with them.
   */
  const v = diggingVerdict(farm, pd.p2pPrices, pd.exchangeRates, {});
  const cps = pd.exchangeRates.coinsPerSFL;
  assert.ok(cps > 0);
  assert.ok(Math.abs(v.coinsAsSfl - v.coins / cps) < 1e-9, "the coin haul converts at the served rate");
  assert.ok(/p\u0159edpoklad/.test(v.coinAssumption), "and says it is an assumption");

  assert.ok(v.perDig, "a per-hole figure, since that is the unit you spend a shovel in");
  assert.ok(Math.abs(v.perDig.netMarketOnly - (v.flowerSfl - v.costSfl) / v.digs) < 1e-9);
  assert.ok(Math.abs(v.perDig.netWithCoins - (v.coinsAsSfl + v.flowerSfl - v.costSfl) / v.digs) < 1e-9);
  // The gap between them IS the assumption's weight, so it must be non-trivial or the split is
  // pointless — on any real haul the coins dominate.
  assert.ok(v.perDig.netWithCoins > v.perDig.netMarketOnly, "counting coins can only help");

  // Sanity on the direction: shovels cost real materials, so a haul has to beat them.
  assert.ok(v.costSfl > 0, "digging costs something");
  const coinTotal = Object.entries(v.items).reduce((s, [, r]) => s + (r.sellCoins || 0), 0);
  assert.ok(Math.abs(v.coins - coinTotal) < 1e-9, "coins are the sum of the sellable rows");
});

test("an item with neither a sell price nor a market quote is unpriced, never zero", () => {
  // Salt Dino Egg is the live case: it comes out of the sand, has no NPC price and no p2p quote.
  // Calling it 0 would read as "worthless" for something that plainly is not.
  const v = diggingVerdict(farm, pd.p2pPrices, pd.exchangeRates, {});
  for (const item of v.unpriced) {
    assert.equal(TREASURE_SELL_PRICES[item], undefined, `${item} really has no sell price`);
    assert.ok(!(pd.p2pPrices[item] > 0), `${item} really has no market price`);
  }
  for (const row of v.items) {
    const known = row.sellCoins != null || row.p2pSfl != null;
    assert.equal(known, !v.unpriced.includes(row.item), `${row.item}: priced xor unpriced`);
  }
});

test("a shovel's coin price follows the coins-are-free rule, its materials never do", () => {
  const paid = digToolCost("Sand Shovel", pd.p2pPrices, pd.exchangeRates, { coinsFree: false });
  const free = digToolCost("Sand Shovel", pd.p2pPrices, pd.exchangeRates, { coinsFree: true });
  assert.equal(paid.coins, 20, "economy.mjs: 20 coins");
  assert.deepEqual(paid.materials, { Wood: 2, Stone: 1 });
  assert.ok(paid.coinSfl > 0 && free.coinSfl === 0, "only the coin half is waived");
  assert.equal(paid.matSfl, free.matSfl, "the wood and stone are real either way");
  assert.ok(paid.sfl > free.sfl);
  assert.equal(digToolCost("Not A Tool", pd.p2pPrices, pd.exchangeRates, {}), null);
});

test("no sample means no answer, not a zero", () => {
  // A farm that has never dug must not be told digging is worthless.
  const v = diggingVerdict({ desert: { digging: { grid: [] } } }, pd.p2pPrices, pd.exchangeRates, {});
  assert.equal(v.measured, false);
  assert.equal(v.perDig, null, "no per-hole figure without holes");
  assert.equal(v.digs, 0);
  // And a farm with no desert at all does not throw.
  const none = diggingVerdict({}, pd.p2pPrices, pd.exchangeRates, {});
  assert.equal(none.measured, false);
});
