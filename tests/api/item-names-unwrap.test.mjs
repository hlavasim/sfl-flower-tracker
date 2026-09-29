import { test } from "node:test";
import assert from "node:assert";
import { _unwrapItemNames } from "../../api/compute.mjs";

// Prod (Vercel) loads api/_item-names.js as CommonJS, one wrapper deeper than local ESM. Reading
// only m.default there left every name-less sfl.world NFT row unnamed — 98 of them fell out of
// the treasury, Master Chef's Cleaver (owned) among them.
const map = { wearables: { "500": "Master Chef's Cleaver" }, collectibles: { "500": "Knight Chicken" } };

test("ESM shape: { default: map }", () => {
  assert.equal(_unwrapItemNames({ default: map }).wearables["500"], "Master Chef's Cleaver");
});

test("CommonJS-interop shape: { default: { default: map } }", () => {
  assert.equal(_unwrapItemNames({ default: { __esModule: true, default: map } }).wearables["500"], "Master Chef's Cleaver");
});

test("nothing loaded is null", () => {
  assert.equal(_unwrapItemNames(null), null);
  assert.equal(_unwrapItemNames({}), null);
});
