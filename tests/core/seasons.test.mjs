import { test } from "node:test";
import assert from "node:assert";
import { seasonAt, nextSeasonStart, buildSeasonCalendar, SEASON_ROTATION } from "../../core/sections/seasons.mjs";

const DAY = 86400000;
const at = (iso) => Date.parse(iso);

/*
 * The game rotates spring → summer → autumn → winter one week each, counted from Monday
 * 2024-12-16 00:00 UTC (src/features/game/lib/season.ts populateSeason). The farm on
 * 2026-09-17 reported { season: "winter", startedAt: 1789344000000 } — pinning that ties the
 * formula to what the game actually served, not to the formula restated.
 */
test("seasonAt reproduces what the game served for farm 155498", () => {
  const s = seasonAt(at("2026-09-17T10:00:00Z"));
  assert.equal(s.season, "winter");
  assert.equal(s.startedAt, 1789344000000);
  assert.equal(seasonAt(at("2024-12-16T00:00:00Z")).season, "spring");
  assert.equal(seasonAt(at("2024-12-23T00:00:00Z")).season, "summer");
  assert.equal(seasonAt(at("2026-09-21T00:00:00Z")).season, "spring", "the next Monday rolls over to spring");
  assert.equal(seasonAt(at("2026-09-20T23:59:59Z")).season, "winter");
});

test("nextSeasonStart gives the next Monday that season begins, or the running one", () => {
  const now = at("2026-09-17T10:00:00Z");
  assert.equal(nextSeasonStart("spring", now), at("2026-09-21T00:00:00Z"));
  assert.equal(nextSeasonStart("autumn", now), at("2026-10-05T00:00:00Z"));
  assert.equal(nextSeasonStart("winter", now), at("2026-09-14T00:00:00Z"), "already running: its own start");
});

// A synthetic crop that is 20% cheaper every autumn week and 20% dearer every spring week, over
// 26 weeks — the calendar must name autumn the buy season and spring the sell season.
function syntheticDaily(startIso, days, shape) {
  const out = [];
  const t0 = at(startIso);
  for (let i = 0; i < days; i++) {
    const t = t0 + i * DAY;
    out.push([t, 1 * (shape[seasonAt(t).season] || 1)]);
  }
  return out;
}

test("the calendar finds the buy and sell season of a clean seasonal series", () => {
  const daily = { Potato: syntheticDaily("2026-02-02T00:00:00Z", 182, { autumn: 0.8, spring: 1.2 }) };
  const cal = buildSeasonCalendar(daily, { now: at("2026-09-17T10:00:00Z") });
  const p = cal.items.find((x) => x.item === "Potato");
  assert.equal(p.buy, "autumn");
  assert.equal(p.sell, "spring");
  assert.equal(p.stable, true, "both halves of the history agree");
  // spring/autumn = 1.2/0.8 = 1.5 gross, minus the 10% fee on the sale → +35%
  assert.ok(Math.abs(p.expectedNet - (1.5 * 0.9 - 1)) < 0.02, `expected ~+35%, got ${p.expectedNet}`);
  assert.ok(p.bySeason.autumn < 0 && p.bySeason.spring > 0, "heatmap: autumn below the mean, spring above");
  assert.equal(cal.current.season, "winter");
  assert.equal(p.signal, "hold", "it is winter: neither the buy nor the sell week");
  assert.equal(p.nextBuy, at("2026-10-05T00:00:00Z"));
  assert.equal(p.nextSell, at("2026-09-21T00:00:00Z"));
});

test("the signal follows the running season", () => {
  const daily = { Potato: syntheticDaily("2026-02-02T00:00:00Z", 182, { autumn: 0.8, spring: 1.2 }) };
  assert.equal(buildSeasonCalendar(daily, { now: at("2026-10-06T12:00:00Z") }).items[0].signal, "buy");
  assert.equal(buildSeasonCalendar(daily, { now: at("2026-09-22T12:00:00Z") }).items[0].signal, "sell");
});

test("a flat series is noise: no signal, not stable", () => {
  const daily = { Flat: syntheticDaily("2026-02-02T00:00:00Z", 182, {}) };
  const f = buildSeasonCalendar(daily, { now: at("2026-10-06T12:00:00Z") }).items[0];
  assert.equal(f.stable, false);
  assert.equal(f.signal, "none");
});

test("a pattern that flips between the two halves of history is not called stable", () => {
  // First 13 weeks: cheap in autumn, dear in spring. Last 13 weeks: the reverse.
  const a = syntheticDaily("2026-02-02T00:00:00Z", 91, { autumn: 0.8, spring: 1.2 });
  const b = syntheticDaily("2026-05-04T00:00:00Z", 91, { autumn: 1.2, spring: 0.8 });
  const cal = buildSeasonCalendar({ Flip: [...a, ...b] }, { now: at("2026-09-17T10:00:00Z") });
  assert.equal(cal.items[0].stable, false);
  assert.ok(!(cal.items[0].oosNet > 0), "and the out-of-sample figure says so");
});

test("gaps in a change-based price series are forward-filled, not dropped", () => {
  const src = syntheticDaily("2026-02-02T00:00:00Z", 182, { autumn: 0.8, spring: 1.2 });
  const sparse = src.filter((_, i) => i % 7 === 0 || src[i][1] !== src[i - 1][1]);   // only changes + weekly
  const p = buildSeasonCalendar({ P: sparse }, { now: at("2026-09-17T10:00:00Z") }).items[0];
  assert.equal(p.buy, "autumn");
  assert.equal(p.sell, "spring");
});

test("liquidity turns into a per-day capacity at a tenth of the traded volume", () => {
  const daily = { Potato: syntheticDaily("2026-02-02T00:00:00Z", 182, { autumn: 0.8, spring: 1.2 }) };
  const cal = buildSeasonCalendar(daily, { now: at("2026-09-17T10:00:00Z"), liquidity: { Potato: { qtyPerDay: 900000, flowerPerDay: 180 } } });
  const p = cal.items[0];
  assert.equal(p.maxQtyPerDay, 90000);
  assert.equal(p.maxFlowerPerDay, 18);
  assert.deepEqual(SEASON_ROTATION, ["spring", "summer", "autumn", "winter"]);
});
