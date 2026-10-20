import { test } from "node:test";
import assert from "node:assert";
import { voiceDue, voiceWindowOpen } from "../../core/engine/dash-voice.mjs";

// Mon 2026-10-19 10:00 local
const MON10 = new Date(2026, 9, 19, 10, 0).getTime();
const on = { on: true, days: [1, 2, 3, 4, 5], from: "07:00", to: "16:00", repeatMin: 15 };

test("announces what turned ready, in one sentence", () => {
  const r = voiceDue([{ category: "Tree" }, { category: "Tree" }, { category: "Iron" }], MON10, on, {});
  assert.equal(r.text, "Chop trees, Mine iron.");
  assert.deepEqual(r.spoken, { Tree: MON10, Iron: MON10 });
});

test("repeats only after repeatMin while still ready; a done category is forgotten", () => {
  const first = voiceDue([{ category: "Tree" }], MON10, on, {});
  assert.equal(voiceDue([{ category: "Tree" }], MON10 + 14 * 60000, on, first.spoken).text, "");
  assert.equal(voiceDue([{ category: "Tree" }], MON10 + 15 * 60000, on, first.spoken).text, "Chop trees.");
  // chopped: gone from ready, so the next time it is ready it is announced at once
  const cleared = voiceDue([], MON10 + 2 * 60000, on, first.spoken);
  assert.deepEqual(cleared.spoken, {});
  assert.equal(voiceDue([{ category: "Tree" }], MON10 + 3 * 60000, on, cleared.spoken).text, "Chop trees.");
});

test("silent when off, outside the hours, on an unchosen day, or muted", () => {
  assert.equal(voiceDue([{ category: "Tree" }], MON10, { ...on, on: false }, {}).text, "");
  assert.equal(voiceDue([{ category: "Tree" }], new Date(2026, 9, 19, 16, 0).getTime(), on, {}).text, "", "to is exclusive");
  assert.equal(voiceDue([{ category: "Tree" }], new Date(2026, 9, 18, 10, 0).getTime(), on, {}).text, "", "Sunday");
  assert.equal(voiceDue([{ category: "Tree" }, { category: "Gold" }], MON10, { ...on, muted: ["Tree"] }, {}).text, "Mine gold.");
});

test("a window past midnight belongs to the day it started", () => {
  const s = { days: [5], from: "22:00", to: "02:00" };   // Friday night
  assert.equal(voiceWindowOpen(new Date(2026, 9, 23, 23, 0), s), true);    // Fri 23:00
  assert.equal(voiceWindowOpen(new Date(2026, 9, 24, 1, 0), s), true);     // Sat 01:00, still Friday's
  assert.equal(voiceWindowOpen(new Date(2026, 9, 24, 23, 0), s), false);   // Sat 23:00
});

test("an unknown category is read by its name", () => {
  assert.equal(voiceDue([{ category: "Weather" }], MON10, on, {}).text, "Weather.");
});

test("deliveries, bounties and chores start muted; an explicit list overrides that", () => {
  const ready = [{ category: "Deliveries" }, { category: "Chores" }, { category: "Tree" }];
  assert.equal(voiceDue(ready, MON10, on, {}).text, "Chop trees.");
  assert.equal(voiceDue(ready, MON10, { ...on, muted: [] }, {}).text, "Deliveries are ready, Chores are ready, Chop trees.");
});
