import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { computeBettyRate } from "../../core/engine/prices.mjs";

// Same snapshot used by cooking-cost.test.mjs / cooking-section.test.mjs.
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));

test("computeBettyRate reproduces the live-page Celestine/Betty rate exactly", () => {
  const betty = computeBettyRate(p2p);
  assert.equal(betty.item, "Celestine");
  assert.ok(Math.abs(betty.rate - 1061.0079575596817) < 1e-6, `rate was ${betty.rate}`);
});

test("computeBettyRate ignores items with no P2P price or non-positive price", () => {
  const betty = computeBettyRate({ "Sunflower": 0 });
  assert.equal(betty.rate, 0);
  assert.equal(betty.item, "");
});
