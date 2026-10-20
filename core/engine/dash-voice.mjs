/*
 * DASH voice — what to say out loud, and when.
 *
 * The dashboard's READY NOW list, read as short English commands ("Chop trees", "Mine iron").
 * A category is announced when it turns ready and again every `repeatMin` minutes while it stays
 * ready; nothing is said outside the chosen days and hours. Everything due at one moment goes
 * into one sentence. Pure: the page calls it every tick with the ready actions, the clock, the
 * settings and what it said last, and keeps the returned `spoken` map.
 */

// Dashboard category -> the command spoken for it. A category not listed is read as its name.
export const VOICE_PHRASES = {
  Crops: "Harvest crops", Fruits: "Pick fruit", Greenhouse: "Harvest the greenhouse",
  Tree: "Chop trees", Stone: "Mine stone", Iron: "Mine iron", Gold: "Mine gold",
  Crimstone: "Mine crimstone", Sunstone: "Mine sunstone", Oil: "Drill oil",
  Flowers: "Harvest flowers", Animals: "Feed the animals", Cooking: "Collect your cooking",
  Composters: "Empty the composters", Beehives: "Collect honey", "Crafting Box": "Collect from the crafting box",
  "Crab Traps": "Check the crab traps", Pets: "Look after your pets", Faction: "Faction tasks",
  Powers: "Use your powers", Dailies: "Daily rewards are ready", Trades: "A trade completed",
  "Lava Pits": "Collect obsidian", "Crop Machine": "Check the crop machine", Mushrooms: "Pick mushrooms",
  Deliveries: "Deliveries are ready", "Bounty Board": "Bounties are ready", Chores: "Chores are ready",
};

// Deliveries, bounties and chores sit in READY NOW nearly all day, so they start muted.
export const VOICE_DEFAULTS = { on: false, days: [1, 2, 3, 4, 5], from: "07:00", to: "16:00", repeatMin: 15,
  muted: ["Deliveries", "Bounty Board", "Chores"] };

const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  return m ? Math.min(24 * 60, +m[1] * 60 + +m[2]) : null;
};

/** Is `date` (local time) inside the chosen days and hours? `to` before `from` wraps past midnight. */
export function voiceWindowOpen(date, settings) {
  const s = { ...VOICE_DEFAULTS, ...(settings || {}) };
  const from = minutesOf(s.from), to = minutesOf(s.to);
  if (from == null || to == null) return false;
  const mins = date.getHours() * 60 + date.getMinutes();
  // A window that wraps (22:00–06:00) belongs to the day it started on.
  const wraps = to <= from;
  const inHours = wraps ? (mins >= from || mins < to) : (mins >= from && mins < to);
  if (!inHours) return false;
  const day = wraps && mins < to ? (date.getDay() + 6) % 7 : date.getDay();
  return (s.days || []).includes(day);
}

/**
 * What to say now.
 *   ready    the dashboard's ready actions ([{ category }])
 *   now      ms
 *   spoken   { category: ms it was last announced } from the previous call
 * Returns { text, spoken }: text is "" when nothing is due. A category that stopped being ready
 * is forgotten, so it is announced afresh the next time it turns ready.
 */
export function voiceDue(ready, now, settings, spoken) {
  const s = { ...VOICE_DEFAULTS, ...(settings || {}) };
  const muted = new Set(s.muted || []);
  const cats = [...new Set((ready || []).map((a) => a && a.category).filter((c) => c && !muted.has(c)))];
  const next = {};
  for (const c of cats) if (spoken && spoken[c] != null) next[c] = spoken[c];
  if (!s.on || !voiceWindowOpen(new Date(now), s)) return { text: "", spoken: next };
  const repeatMs = Math.max(1, Number(s.repeatMin) || VOICE_DEFAULTS.repeatMin) * 60000;
  const due = cats.filter((c) => next[c] == null || now - next[c] >= repeatMs);
  for (const c of due) next[c] = now;
  const text = due.map((c) => VOICE_PHRASES[c] || c).join(", ");
  return { text: text ? text + "." : "", spoken: next };
}

/** Saved settings over the defaults (the page's reader). */
export function voiceSettings(saved) {
  return { ...VOICE_DEFAULTS, ...(saved || {}) };
}

/** Every category the voice knows, in the order the settings list them. */
export function voiceCategories() {
  return Object.keys(VOICE_PHRASES);
}
