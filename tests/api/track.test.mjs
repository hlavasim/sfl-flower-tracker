import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import handler from "../../api/track.js";
import { mockRes } from "./fake-pool.mjs";

// The visit counter only knew the 13 pages of an old layout: every visit to a newer page (TICKETS,
// LEVELING, MARKS, the boards…) answered 400 and was never counted.
const PAGES = JSON.parse(readFileSync(new URL("../../flowers.html", import.meta.url), "utf8")
  .match(/const PAGES = (\[[^\]]*\]);/)[1]);

test("every page the app navigates to is counted (KV not configured here: a silent 204)", async () => {
  delete process.env.KV_REST_API_URL;
  for (const page of PAGES) {
    const res = mockRes();
    await handler({ query: { farm: "155498", page } }, res);
    assert.strictEqual(res._status, 204, `page ${page}`);
  }
});

test("an unknown page is still refused", async () => {
  const res = mockRes();
  await handler({ query: { farm: "155498", page: "nonsense" } }, res);
  assert.strictEqual(res._status, 400);
});
