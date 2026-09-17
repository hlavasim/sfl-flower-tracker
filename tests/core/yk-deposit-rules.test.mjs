import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/*
 * The Yakkamon deposit calculator mirrors rules Yakkamon publishes in its own page script
 * (DEPOSIT_MULT_ANCHOR_AT = Date.UTC(2026,7,10,2), START 3.0, STEP 0.2, FLOOR 1.0,
 * DEPOSIT_MULT_HOLD_WEEK = 2) and docs. Read 2026-09-17 the page had drifted from them:
 *
 *  - no hold week: deposits were paused for security in week 2, so the week of 24 Aug REPEATED
 *    2.8× and every later step lands a week later. The calculator said 2.0× on 17 Sep (it was
 *    2.2×) and reached the 1× floor on 19 Oct instead of 26 Oct;
 *  - windows turn on Mondays at 02:00 UTC, not midnight;
 *  - points are floor(FLOWER × multiplier) + floor(FLOWER × bonus), each floored on its own;
 *  - referral was +30 (now +75), the free mint was "1 Oct" (it ran 14–17 Sep), and the ladder
 *    still used the pre-12-Aug names and the old wave bands.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = readFileSync(path.join(ROOT, "flowers.html"), "utf8");

function slice(marker) {
  const start = src.indexOf(marker);
  assert.ok(start > 0, `${marker} present in flowers.html`);
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}
const yk = new Function(
  ["const YK = {", "function ykWeekAt(", "function ykMult(", "function ykBonus(", "function ykPoints("].map(slice).join(";\n") +
  ";\nreturn { YK, ykWeekAt, ykMult, ykBonus, ykPoints };")();
const multAt = (iso) => yk.ykMult(yk.ykWeekAt(Date.parse(iso)));
const near = (a, b) => Math.abs(a - b) < 1e-9;

test("the multiplier follows the official schedule, hold week included", () => {
  const official = [
    ["2026-08-10", 3.0], ["2026-08-17", 2.8], ["2026-08-24", 2.8], ["2026-08-31", 2.6],
    ["2026-09-07", 2.4], ["2026-09-14", 2.2], ["2026-09-21", 2.0], ["2026-09-28", 1.8],
    ["2026-10-05", 1.6], ["2026-10-12", 1.4], ["2026-10-19", 1.2], ["2026-10-26", 1.0], ["2026-11-02", 1.0],
  ];
  for (const [monday, mult] of official) {
    const got = multAt(`${monday}T12:00:00Z`);
    assert.ok(near(got, mult), `week of ${monday}: expected ${mult}×, got ${got}×`);
  }
});

test("a window turns on Monday at 02:00 UTC, not at midnight", () => {
  assert.ok(near(multAt("2026-08-17T01:59:00Z"), 3.0), "01:59 on the Monday is still the old window");
  assert.ok(near(multAt("2026-08-17T02:00:00Z"), 2.8), "02:00 opens the new one");
});

test("base and bonus are each floored, as the server does", () => {
  // 55 FLOWER at 2.2× (week of 14 Sep): floor(121) + floor(5.5) = 126, not 126.5.
  const w = yk.ykWeekAt(Date.parse("2026-09-15T12:00:00Z"));
  const p = yk.ykPoints(55, w);
  assert.equal(p.base, 121);
  assert.equal(p.bonus, 5);
  assert.equal(p.total, 126);
  // A product that lands a hair under a whole number in floating point must not lose a point.
  for (let wk = 1; wk <= 13; wk++) {
    const want = Math.round(50 * yk.ykMult(wk));
    assert.equal(yk.ykPoints(50, wk).base, want, `50 FLOWER in week ${wk}`);
  }
});

test("the bulk bonus is a step function at 50 / 500 / 5,000 / 50,000", () => {
  const rate = (f) => yk.ykBonus(f) / f;
  // Amounts whose bonus is a whole number, so the floor does not blur the rate being pinned.
  for (const [f, r] of [[49, 0], [50, 0.1], [490, 0.1], [500, 0.2], [4990, 0.2], [5000, 0.4], [49990, 0.4], [50000, 0.8]]) {
    assert.ok(near(rate(f), r), `${f} FLOWER earns a ${r * 100}% bonus, got ${rate(f) * 100}%`);
  }
  assert.equal(yk.YK.minDeposit, 5);
});

test("50,000 FLOWER: 190,000 points in week 1, 180,000 in either 2.8× week", () => {
  const pts = (iso) => yk.ykPoints(50000, yk.ykWeekAt(Date.parse(iso))).total;
  assert.equal(pts("2026-08-13T12:00:00Z"), 190000, "13 Aug is week 1: 3.0 + 0.8");
  assert.equal(pts("2026-08-19T12:00:00Z"), 180000, "2.8 + 0.8");
  assert.equal(pts("2026-08-26T12:00:00Z"), 180000, "the repeated week pays the same 2.8 + 0.8");
});

test("the campaign constants are the current ones", () => {
  const act = (re) => yk.YK.actions.find((a) => re.test(a.what));
  assert.equal(act(/referral/i).pts, "+75");
  assert.match(act(/referral/i).note, /100/, "after the first five the friend has to deposit 100 FLOWER");
  assert.doesNotMatch(act(/free mint/i).note, /1 Oct/, "the mint ran 14–17 Sep 2026, not 1 Oct");
  const rank = (r) => yk.YK.ranks.find((x) => x.r === r);
  assert.match(rank("501 – 2 000").rew, /Bloom/, "the top 2,000 get a Genesis Legendary — 501–2,000 is Bloom");
  assert.match(rank("2 001 – 5 000").rew, /Rare Egg/);
  assert.equal(rank("5 001 +").wave, "Wave 3–4", "waves are 1–1,000 / 1,001–5,000 / 5,001–20,000 / 20,001–100,000");
});
