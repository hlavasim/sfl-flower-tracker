import { test } from "node:test";
import assert from "node:assert";
import { craftingJobs } from "../../core/engine/crafting-box.mjs";

// The crafting box holds a QUEUE now ({ status, queue: [{ name, readyAt, startedAt }] }); older
// farms carry one { item: { collectible }, readyAt }. Both read as the same list of jobs.
const T = 1795700000000;

test("the queue: every job with its name and times, soonest first", () => {
  const cb = { status: "crafting", queue: [
    { id: "b", name: "Wooly Doll", readyAt: T + 2000, startedAt: T + 1500, type: "collectible" },
    { id: "a", name: "Doll", readyAt: T + 1000, startedAt: T + 500, type: "collectible" },
  ] };
  assert.deepStrictEqual(craftingJobs(cb), [
    { name: "Doll", readyAt: T + 1000, startedAt: T + 500 }, { name: "Wooly Doll", readyAt: T + 2000, startedAt: T + 1500 }]);
});

test("the old single item; idle or missing → no jobs", () => {
  assert.deepStrictEqual(craftingJobs({ status: "crafting", readyAt: T, item: { collectible: "Doll" } }), [{ name: "Doll", readyAt: T, startedAt: 0 }]);
  assert.deepStrictEqual(craftingJobs({ status: "crafting", readyAt: T, item: { wearable: "Hat" } }), [{ name: "Hat", readyAt: T, startedAt: 0 }]);
  assert.deepStrictEqual(craftingJobs({ status: "idle" }), []);
  assert.deepStrictEqual(craftingJobs(null), []);
  assert.deepStrictEqual(craftingJobs({ status: "crafting", queue: [{ readyAt: T }] }), [], "a job without a name is skipped");
});
