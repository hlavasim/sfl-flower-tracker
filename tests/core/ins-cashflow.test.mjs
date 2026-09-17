import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/*
 * The Insights regression runs over a farm-value series with external cashflow netted out, so a
 * cash-out does not read as "burn". Two ways that netting went wrong, both seen on the live page:
 *
 *  - It walked EVERY ledger row. The ledger also holds the YAKKAMON and WALLET venues, whose
 *    money never touches the farm; the 2026-09-02 WALLET buy was subtracted from the farm and the
 *    30-day slope read −1,131 FLOWER/day instead of about +10, so tile ② called it BURN.
 *  - It turned a row's BTC into FLOWER at TODAY's rate. July's 0.107 BTC bought ~99.6k FLOWER at
 *    ~107 sats; at September's ~215 sats it was booked as ~50k.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function extract(name) {
  const src = readFileSync(path.join(ROOT, "flowers.html"), "utf8");
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} present in flowers.html`);
  let depth = 0, i = src.indexOf("{", start);
  const open = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  assert.ok(i > open, `${name} body is brace-balanced`);
  return new Function(`${src.slice(start, i + 1)}; return ${name};`)();
}

const DAY = 86400000;
const at = (iso) => new Date(iso).getTime();
// Today: 0.16 USD / FLOWER and 76,000 USD / BTC → ~210.5 sats per FLOWER.
const RATES = { sflToUsd: 0.16, btcUsd: 76000 };
// Daily sats/FLOWER, the shape _satsCache["1d"] holds: { time: unix seconds, value: sats }.
const SATS = [
  { time: at("2026-07-10") / 1000, value: 105 },
  { time: at("2026-07-11") / 1000, value: 107 },
  { time: at("2026-07-12") / 1000, value: 110 },
  { time: at("2026-09-02") / 1000, value: 215 },
];
const flatFarm = () => [
  { time: at("2026-08-20"), valueSfl: 68000 },
  { time: at("2026-09-10"), valueSfl: 68000 },
];

test("money sent to another venue does not move the farm's adjusted value", () => {
  const apply = extract("_insApplyCashflow");
  const points = flatFarm();
  apply(points, [
    { tx_date: "2026-09-02T00:00:00.000Z", direction: "deposit", btc_amount: "0.05", venue: "wallet" },
    { tx_date: "2026-09-03T00:00:00.000Z", direction: "deposit", btc_amount: "0.08", venue: "yakkamon" },
  ], RATES, SATS);
  assert.equal(points[0].adjustedValueSfl, 68000);
  assert.equal(points[1].adjustedValueSfl, 68000,
    "a WALLET or YAKKAMON deposit is not FLOWER entering the farm — subtracting it fakes a burn");
});

test("a withdrawal from another venue is not BTC extracted from the farm", () => {
  const apply = extract("_insApplyCashflow");
  const points = flatFarm();
  apply(points, [
    { tx_date: "2026-09-02T00:00:00.000Z", direction: "withdrawal", btc_amount: "0.03", venue: "wallet" },
  ], RATES, SATS);
  const farmBtc = 68000 * RATES.sflToUsd / RATES.btcUsd;
  assert.ok(Math.abs(points[1].wealthBtc - farmBtc) < 1e-12, `wealth is the farm alone, got ${points[1].wealthBtc}`);
});

test("a farm deposit is netted out, and a row with no venue is a farm row", () => {
  const apply = extract("_insApplyCashflow");
  const points = flatFarm();
  apply(points, [
    { tx_date: "2026-09-02T00:00:00.000Z", direction: "deposit", btc_amount: "0.01", flower_amount: "5000", venue: "sfl" },
    { tx_date: "2026-09-03T00:00:00.000Z", direction: "withdrawal", btc_amount: "0.002", flower_amount: "1000" },
  ], RATES, SATS);
  assert.equal(points[0].adjustedValueSfl, 68000, "neither row has happened yet at the first point");
  assert.equal(points[1].adjustedValueSfl, 68000 - 5000 + 1000);
});

test("a row's BTC becomes FLOWER at the rate of its own date, not today's", () => {
  const apply = extract("_insApplyCashflow");
  const points = flatFarm();
  apply(points, [
    { tx_date: "2026-07-11T00:00:00.000Z", direction: "deposit", btc_amount: "0.107", venue: "sfl" },
  ], RATES, SATS);
  const booked = 68000 - points[1].adjustedValueSfl;
  // 0.107 BTC at 107 sats = 100,000 FLOWER. Today's ~210 sats would book ~50,800.
  assert.ok(Math.abs(booked - 100000) < 1, `expected ~100,000 FLOWER, got ${booked}`);
});

test("the row's own flower_amount wins over any rate", () => {
  const apply = extract("_insApplyCashflow");
  const points = flatFarm();
  apply(points, [
    { tx_date: "2026-07-11T00:00:00.000Z", direction: "deposit", btc_amount: "0.107", flower_amount: "99600", venue: "sfl" },
  ], RATES, SATS);
  assert.equal(68000 - points[1].adjustedValueSfl, 99600);
});

test("a date the series does not reach falls back to today's rate", () => {
  const apply = extract("_insApplyCashflow");
  const todays = 0.1 * RATES.btcUsd / RATES.sflToUsd;
  for (const series of [SATS, [], null]) {
    const points = flatFarm();
    apply(points, [
      { tx_date: "2023-03-17T00:00:00.000Z", direction: "deposit", btc_amount: "0.1", venue: "sfl" },
    ], RATES, series);
    assert.ok(Math.abs((68000 - points[1].adjustedValueSfl) - todays) < 1e-6,
      "an old row still has to be netted out, at the only rate there is");
  }
});
