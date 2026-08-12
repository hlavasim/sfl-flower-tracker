import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { roadmapEffFactor, getRoadmapSettings } from "../../core/engine/roadmap.mjs";

/*
 * A manual efficiency override used to be clamped to 1.00 while the measured path returns
 * eb[cat].ratio uncapped. "Efficiency" here is harvests against a one-cycle-per-login model,
 * so a category worked several times a day measures well over 100% — a farm at a measured 141%
 * on crimstone read 141% on auto and silently fell to 100% as soon as the slider was touched,
 * taking that category's income and every boost valued against it down 29% with it.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("a manual efficiency override above 100% survives", () => {
  const s = getRoadmapSettings({ effOverrides: { crimstone: 1.41 } });
  assert.equal(roadmapEffFactor("crimstone", s), 1.41,
    "141% measured must stay 141% when pinned by hand, not collapse to 1.00");
});

test("the override is still floored at 0 and ceilinged at the slider's max", () => {
  assert.equal(roadmapEffFactor("iron", getRoadmapSettings({ effOverrides: { iron: -3 } })), 0,
    "negative efficiency is not a thing");
  assert.equal(roadmapEffFactor("iron", getRoadmapSettings({ effOverrides: { iron: 99 } })), 2,
    "a garbage value is capped at ROADMAP_EFF_MAX, not passed through");
});

test("the slider can reach whatever the engine accepts", () => {
  /*
   * The two ceilings have to agree: an engine that accepts 2.0 behind a slider that stops at
   * 1.0 is the bug this file exists for, just moved one layer out.
   */
  for (const name of ["flowers.html", "index.html"]) {
    const src = readFileSync(path.join(ROOT, name), "utf8");
    assert.match(src, /const ROADMAP_EFF_MAX = 2;/, `${name}: carries the shared ceiling`);
    assert.match(src, /min="0" max="\$\{ROADMAP_EFF_MAX \* 100\}"/,
      `${name}: the efficiency slider's max is derived from the ceiling, not hardcoded`);
    assert.match(src, /cur\[cat\] = Math\.max\(0, Math\.min\(ROADMAP_EFF_MAX,/,
      `${name}: _roadmapSetEffOverride clamps to the same ceiling`);
    assert.ok(!/Math\.min\(1, ov\)/.test(src), `${name}: the old 1.00 clamp is gone`);
  }
});
