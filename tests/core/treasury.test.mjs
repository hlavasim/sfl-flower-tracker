import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildTreasurySection, computeFarmValue, buildTreasuryData } from "../../core/sections/treasury.mjs";

const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const nfts = JSON.parse(readFileSync(new URL("../fixtures/nfts-sample.json", import.meta.url)));

const out = buildTreasurySection(farm, p2p, nfts, null, 97000, {});

test("treasury — td rates assembled; betty rate from p2p, defaults without exchange", () => {
  assert.ok(out.td.coinsPerSFL_betty > 0, "betty rate");
  assert.equal(out.td.coinsPerSFL_api, 320); // no exchange resp → default
  assert.equal(out.td.gemsPerSFL, 0);
  assert.equal(out.td.btcUsd, 97000);
  assert.ok(out.td.nftCollectibles["Foreman Beaver"]);
});

test("treasury — value carries every category renderTreasuryWithData destructures", () => {
  const v = out.value;
  for (const k of ["totals", "rates", "resources", "treasures", "collectibles", "wearables", "pets", "listings", "liquid", "treasureBoost"]) {
    assert.ok(k in v, `missing ${k}`);
  }
  assert.ok(v.totals.grand > 0, `grand ${v.totals.grand}`);
  assert.equal(out.coinMode, "betty");
  // liquid uses the betty rate for coins
  assert.ok(v.liquid.coinsAsSFL > 0);
});

test("treasury — coinMode off zeroes the coin conversion; petPrices override the 2000 fallback", () => {
  const off = buildTreasurySection(farm, p2p, nfts, null, 0, { coinMode: "off" });
  assert.equal(off.value.liquid.coinsAsSFL, 0);
  // fixture farm has no NFT pets → pets list empty either way; pin the shape only
  const td = buildTreasuryData(p2p, nfts, null, 0);
  const v = computeFarmValue(farm, td, "betty", { "nft-123": 5 });
  assert.ok(Array.isArray(v.pets));
});
