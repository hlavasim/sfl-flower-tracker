import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import handler from "../../api/compute.mjs";

const fixtureText = readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url), "utf8");

function mockRes() {
  return {
    _status: 200, _json: null,
    status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; },
  };
}

test("compute?section=cooking returns the cooking payload from the fixture", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(fixtureText) });
  try {
    const req = { query: { farm: "155498", section: "cooking", petSimulate: "1" } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._json.section, "cooking");
    const fp = res._json.data.buildings["Fire Pit"];
    assert.ok(Math.abs(fp.xpPerDay - 232509.80) < 1, `FirePit ${fp.xpPerDay}`);
  } finally {
    globalThis.fetch = orig;
  }
});

test("missing farm → 400", async () => {
  const res = mockRes();
  await handler({ query: {} }, res);
  assert.equal(res._status, 400);
});

test("unknown section → 400", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(fixtureText) });
  try {
    const res = mockRes();
    await handler({ query: { farm: "155498", section: "nope" } }, res);
    assert.equal(res._status, 400);
  } finally { globalThis.fetch = orig; }
});
