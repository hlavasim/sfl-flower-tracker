# Dashboard: bounties, chores, cost-per-ticket, readability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new dashboard sections (Mega Bounty Board, Weekly Chores) with cost-per-ticket / Net-SFL efficiency pills, surface the same efficiency pill for Deliveries, and tone down the 8-bit aesthetic so long item labels are readable.

**Architecture:** All changes are in `flowers.html` (single-file HTML app). Two new `dashParse*` parsers slot into the existing `parseDashboardActions` pipeline; one helper (`dashRewardSummary`) computes a uniform efficiency metric reused by Deliveries/Bounties/Chores. CSS changes are scoped to the dashboard block — pixel font stays on headers, monospace replaces it on body labels.

**Tech Stack:** Vanilla JS, no framework, no build step. Source `flowers.html` is hand-edited, then mirrored to `index.html` and the `/tmp/sfl-flower-tracker/` deploy clone per `MEMORY.md`.

**Spec:** [`docs/superpowers/specs/2026-05-12-dashboard-bounties-chores-readability-design.md`](../specs/2026-05-12-dashboard-bounties-chores-readability-design.md)

**Verification approach:** No automated test suite exists in this project. Every implementation task ends with a manual browser-load step against Farm #155498, plus the final task runs the full verification checklist from the spec.

---

## File Structure

Only one file is touched in the implementation:

- **`flowers.html`** — single-file HTML app, all dashboard code lives in one `<script>` block (~7000 lines of JS). Modifications:
  - CSS block at line 2272 (dashboard styles)
  - JS region near line 7373 (`dashParseDeliveryOrders` and other `dashParse*` functions) — new helpers and parsers added here
  - JS region near line 7450 (`parseDashboardActions`) — registration of new parsers
  - JS region near line 7479 (`renderDashboard`) — sort logic + category priority

Deploy copies are produced at the very end (Task 9): `index.html` in source, plus both files in `/tmp/sfl-flower-tracker/`. No `index.html` edits during development — only `flowers.html` is the source of truth.

---

## Task 1: CSS readability fixes (dashboard block)

**Files:**
- Modify: `flowers.html:2272-2296` (existing dashboard CSS block)

- [ ] **Step 1: Replace the dashboard CSS block**

Open `flowers.html`, find the block starting with `/* ── Dashboard ── */` at line 2272. Replace the block (everything from line 2272 through and including line 2296 — the `.dash-all-done .icon` rule) with this updated block:

```css
    /* ── Dashboard ── */
    .dash-summary { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:8px; font-size:0.75rem; }
    .dash-summary-badge { padding:3px 10px; border-radius:12px; font-weight:bold; }
    .dash-summary-badge.ready { background:rgba(46,160,67,0.2); color:var(--green); }
    .dash-summary-badge.upcoming { background:rgba(232,201,106,0.15); color:var(--yellow); }
    .dash-summary-badge.idle { background:rgba(100,160,255,0.15); color:var(--blue,#6aa0ff); }
    .dash-group-title { font-size:0.85rem; padding:8px 0 4px; color:var(--text-secondary); border-bottom:1px solid rgba(92,58,30,0.3); margin-bottom:6px; }
    .dash-section { margin-bottom:6px; padding:10px 12px; }
    .dash-section-title { display:flex; align-items:center; gap:6px; font-size:0.75rem; font-weight:bold; margin-bottom:6px; }
    .dash-section-title .dash-count { background:rgba(46,160,67,0.25); color:var(--green); padding:1px 7px; border-radius:10px; font-size:0.65rem; }
    .dash-section-title .dash-count.upcoming { background:rgba(232,201,106,0.2); color:var(--yellow); }
    .dash-section-title .dash-count.idle { background:rgba(100,160,255,0.2); color:var(--blue,#6aa0ff); }
    .dash-item { display:flex; align-items:center; gap:8px; padding:6px 4px; font-size:0.78rem; border-left:none; margin-left:0; font-family:'Courier New', monospace; }
    .dash-item.ready { /* status conveyed by section + badge */ }
    .dash-item.upcoming { opacity:0.85; }
    .dash-item.empty { opacity:0.7; }
    .dash-item-label { flex:1; min-width:0; font-family:'Courier New', monospace; font-size:0.78rem; }
    .dash-time { text-align:right; white-space:nowrap; font-size:0.7rem; font-family:'Courier New', monospace; }
    .dash-item .dash-detail { font-size:0.7rem; color:var(--text-dim); word-break:break-word; font-family:'Courier New', monospace; margin-top:2px; }
    .dash-ready-badge { padding:1px 6px; border-radius:8px; font-size:0.6rem; font-weight:bold; }
    .dash-ready-badge.green { background:rgba(46,160,67,0.3); color:var(--green); }
    .dash-ready-badge.red { background:rgba(220,60,60,0.3); color:#e55; }
    .dash-ready-badge.blue { background:rgba(100,160,255,0.25); color:var(--blue,#6aa0ff); }
    .dash-eff { font-family:'Courier New', monospace; font-size:0.65rem; padding:1px 8px; border-radius:8px; white-space:nowrap; margin-right:4px; }
    .dash-eff-ticket { background:rgba(232,201,106,0.15); color:var(--sunpetal); }
    .dash-eff-net-pos { background:rgba(46,160,67,0.18); color:var(--green); }
    .dash-eff-net-neg { background:rgba(220,60,60,0.18); color:#e55; }
    .dash-all-done { text-align:center; padding:40px 20px; font-size:1rem; color:var(--green); }
    .dash-all-done .icon { font-size:2rem; margin-bottom:8px; }
```

Key changes versus the old block:
- `.dash-item` gains `font-family:'Courier New', monospace`, drops `border-left:3px solid`, padding 3px → 6px, font 0.7 → 0.78rem
- `.dash-item-label` and `.dash-detail` get explicit monospace + bumped font size
- `.dash-section` padding 8px → 10px 12px
- Old `.dash-item.ready/.upcoming/.empty` left-border colors removed — they're replaced by section grouping + badges
- New `.dash-eff*` rules for the efficiency pill

- [ ] **Step 2: Open `flowers.html?page=dashboard` in a browser**

Visually verify:
- Item labels are now monospace, not pixel.
- No left-border stripes on rows.
- Section titles, group titles, and badges are still pixel-font.
- Rows have noticeably more breathing room.

If something looks broken (e.g. labels still in pixel font), check that the change correctly replaced the old `.dash-item` rule and that there is no later override.

- [ ] **Step 3: Commit**

```bash
git add flowers.html
git commit -m "$(cat <<'EOF'
dash: readability — monospace body, drop left-border, more breathing room

Keeps pixel font on H1/group titles/section titles/badges.
EOF
)"
```

---

## Task 2: Add `dashGetSeasonalTicket` helper

**Files:**
- Modify: `flowers.html` — insert just above `dashParseDeliveryOrders` (currently at line 7373)

- [ ] **Step 1: Insert the helper**

Find the line `function dashParseDeliveryOrders(farm) {` at line 7373. Immediately **above** that line (between the previous function and `dashParseDeliveryOrders`), insert:

```javascript
    // Known seasonal ticket names (used to detect "ticket-paying" rewards).
    // List grows when new seasons introduce new tickets. Falls back gracefully.
    const SEASONAL_TICKETS = [
      "Potion Ticket", "Crow Feather", "Solar Flare Ticket", "Dawn Breaker Ticket",
      "Mermaid Scale", "Tulip Bulb", "Scroll", "Amber Fossil",
      "Bumpkin Ticket", "Sunflower Supporter", "Goblin Emblem", "Sunflower Emblem"
    ];

    function dashGetSeasonalTicket(farm) {
      const orders = farm.delivery?.orders || [];
      for (const o of orders) {
        const items = o.reward?.items || {};
        for (const k of Object.keys(items)) {
          if (SEASONAL_TICKETS.includes(k)) return k;
        }
      }
      return null;
    }
```

- [ ] **Step 2: Smoke test in browser console**

Open the dashboard page (`flowers.html?page=dashboard`) in a browser with farm data loaded. Open devtools console and run:

```javascript
dashGetSeasonalTicket(window._lastFarm || {})  // may be undefined depending on cache
```

If `window._lastFarm` doesn't exist, instead trigger via:

```javascript
// Find the farm object the page already has
fetch("/api/proxy?url=https://api.sunflower-land.com/community/farms/155498")
  .then(r => r.json())
  .then(d => console.log("ticket:", dashGetSeasonalTicket(d.farm)));
```

Expected: prints either a string like `"Potion Ticket"` or `null`. Either is correct — `null` just means the current snapshot has no ticket-paying delivery available.

- [ ] **Step 3: Commit**

```bash
git add flowers.html
git commit -m "$(cat <<'EOF'
dash: add dashGetSeasonalTicket helper

Scans delivery rewards for any known seasonal ticket. Returns null when
no ticket-paying delivery is in the current snapshot.
EOF
)"
```

---

## Task 3: Add `dashRewardSummary` helper

**Files:**
- Modify: `flowers.html` — insert below `dashGetSeasonalTicket` (added in Task 2)

- [ ] **Step 1: Find the existing exchange-rate state holder**

Before writing the helper, locate how `coinsPerSFL` and `gemsPerSFL` are exposed to dashboard code. Run:

```bash
grep -n "coinsPerSFL\|gemsPerSFL" flowers.html | head -20
```

Identify the variable name dashboard JS has access to (likely `dashRates` or similar — but check). If a dashboard-scoped rates holder doesn't exist, the helper takes the rates as a parameter, and callers pass whatever they have.

- [ ] **Step 2: Insert the helper**

Immediately after `dashGetSeasonalTicket` (added in Task 2), insert:

```javascript
    // Format SFL number to 2 decimal places, with sign for "net" mode.
    function _dashFmtSfl(n, withSign) {
      if (n == null || !isFinite(n)) return "?";
      const abs = Math.abs(n).toFixed(2);
      if (!withSign) return abs;
      if (n >= 0) return "+" + abs;
      return "−" + abs;  // minus sign U+2212
    }

    // Returns { rewardText, efficiency } where efficiency is one of:
    //   { kind: "ticket", value, label }     when reward has the seasonal ticket
    //   { kind: "net",    value, label }     when reward has coins/gems convertible to SFL
    //   null                                  when nothing to show (cost unknown, no rates, no convertible reward)
    function dashRewardSummary(reward, ticketName, cost, rates) {
      reward = reward || {};
      const coins = Number(reward.coins) || 0;
      const sflDirect = Number(reward.sfl) || 0;
      const items = reward.items || {};
      const gems = Number(items.Gem) || 0;

      // Build human-readable reward text (matches existing delivery format).
      const parts = [];
      if (coins > 0) parts.push("+" + coins + " coins");
      if (sflDirect > 0) parts.push("+" + sflDirect + " SFL");
      for (const [k, v] of Object.entries(items)) {
        if (!v) continue;
        parts.push("+" + v + " " + k);
      }
      const rewardText = parts.join(", ");

      // Ticket path takes priority.
      if (ticketName && items[ticketName] > 0 && cost != null && cost >= 0) {
        const ticketQty = items[ticketName];
        const value = ticketQty > 0 ? cost / ticketQty : null;
        if (value != null && isFinite(value)) {
          return { rewardText, efficiency: { kind: "ticket", value, label: _dashFmtSfl(value) + " SFL/" + ticketName } };
        }
      }

      // Net SFL path. Needs cost and at least one convertible reward.
      const coinsPerSFL = rates && rates.coinsPerSFL;
      const gemsPerSFL = rates && rates.gemsPerSFL;
      if (cost != null) {
        let rewardSfl = sflDirect;
        if (coins > 0 && coinsPerSFL > 0) rewardSfl += coins / coinsPerSFL;
        if (gems > 0 && gemsPerSFL > 0) rewardSfl += gems / gemsPerSFL;
        if (rewardSfl > 0) {
          const net = rewardSfl - cost;
          return { rewardText, efficiency: { kind: "net", value: net, label: "Net " + _dashFmtSfl(net, true) + " SFL" } };
        }
      }

      return { rewardText, efficiency: null };
    }
```

- [ ] **Step 3: Smoke test in browser console**

After reloading the page, run:

```javascript
dashRewardSummary({ coins: 1278, items: {} }, null, 12.4, { coinsPerSFL: 200, gemsPerSFL: 50 })
// Expect: { rewardText: "+1278 coins", efficiency: { kind:"net", value:~-6.0, label:"Net −6.00 SFL" } }

dashRewardSummary({ items: { "Potion Ticket": 5 } }, "Potion Ticket", 1.2, { coinsPerSFL: 200, gemsPerSFL: 50 })
// Expect: { rewardText: "+5 Potion Ticket", efficiency: { kind:"ticket", value:0.24, label:"0.24 SFL/Potion Ticket" } }

dashRewardSummary({ coins: 250 }, "Potion Ticket", null, { coinsPerSFL: 200, gemsPerSFL: 50 })
// Expect: { rewardText: "+250 coins", efficiency: null }   (cost unknown)
```

- [ ] **Step 4: Commit**

```bash
git add flowers.html
git commit -m "$(cat <<'EOF'
dash: add dashRewardSummary — uniform efficiency metric

Returns either SFL/ticket (when ticket-paying), Net ±SFL (when coins/gems
convertible), or null. Reused by deliveries, bounties, and chores.
EOF
)"
```

---

## Task 4: Add `dashChoreParse` helper

**Files:**
- Modify: `flowers.html` — insert below `dashRewardSummary` (added in Task 3)

- [ ] **Step 1: Insert the helper**

Immediately after `dashRewardSummary`, insert:

```javascript
    // Parses a chore name into a structured form. Two patterns supported:
    //   "<Verb> <Item> <N> times"      — most chores
    //   "Eat <N> <Item>"               — outlier word order
    //
    // Returns: { verb, item, target, activityKey, inputItems, current, delta, remaining, ready, cost }
    // - activityKey: farmActivity counter name, or null if no counter exists for this verb
    // - inputItems: array of {name, qty} to pass to dashP2PCost, or null if cost is unknowable
    // - current/delta/remaining/cost: null when not computable
    function dashChoreParse(chore, farm) {
      const fa = farm.farmActivity || {};
      const name = chore.name || "";
      const initial = chore.initialProgress || 0;

      const VERB_VERBS = "Cook|Craft|Grow|Pick|Harvest|Drink|Collect|Mine|Chop|Fish|Dig|Make|Bake";
      let m = name.match(new RegExp("^(" + VERB_VERBS + ") (.+?) (\\d+) times?$"));
      let verb, item, target;
      if (m) {
        verb = m[1]; item = m[2]; target = parseInt(m[3], 10);
      } else {
        m = name.match(/^Eat (\d+) (.+)$/);
        if (m) {
          verb = "Eat"; item = m[2]; target = parseInt(m[1], 10);
        }
      }

      if (!verb) {
        return { verb:null, item:null, target:null, activityKey:null, inputItems:null,
                 current:null, delta:null, remaining:null, ready:false, cost:null };
      }

      // Singularize item (used for both activity key + ingredient lookup).
      function singularize(s) {
        if (s.endsWith("ies")) return s.slice(0, -3) + "y";
        if (s.endsWith("oes")) return s.slice(0, -2);
        if (s.endsWith("s") && !s.endsWith("ss")) return s.slice(0, -1);
        return s;
      }
      const sing = singularize(item);

      // Verb → activity key suffix
      let activityKey = null;
      let current = null;
      if (verb === "Cook" || verb === "Drink" || verb === "Bake") activityKey = sing + " Cooked";
      else if (verb === "Craft" || verb === "Make") activityKey = sing + " Crafted";
      else if (verb === "Grow" || verb === "Pick" || verb === "Harvest") activityKey = sing + " Harvested";
      else if (verb === "Collect") activityKey = sing + " Collected";
      else if (verb === "Mine") activityKey = sing + " Mined";
      else if (verb === "Chop") activityKey = sing + " Chopped";
      else if (verb === "Dig") activityKey = "Treasure Dug";
      else if (verb === "Fish") {
        // Sum all "X Caught" entries, excluding compass items.
        let total = 0;
        for (const [k, v] of Object.entries(fa)) {
          if (k.endsWith(" Caught") && !k.includes("Compass")) total += Number(v) || 0;
        }
        activityKey = "(sum of all * Caught)";
        current = total;
      }
      // verb === "Eat" → activityKey stays null (no Eaten counter in API)

      if (current == null && activityKey && activityKey !== "(sum of all * Caught)") {
        // Try the singularized key first; fall back to the original (un-singularized) item name.
        const suffix = activityKey.split(" ").slice(1).join(" ");  // "Cooked" / "Harvested" / etc.
        if (fa[activityKey] != null) {
          current = Number(fa[activityKey]);
        } else if (fa[item + " " + suffix] != null) {
          current = Number(fa[item + " " + suffix]);
        }
      }

      const delta = current != null ? Math.max(0, current - initial) : null;
      const remaining = delta != null ? Math.max(0, target - delta) : target;
      const ready = delta != null && delta >= target && !chore.completedAt;

      // Input items for cost estimation.
      let inputItems = null;
      if (verb === "Cook" || verb === "Drink" || verb === "Bake" || verb === "Eat") {
        const ing = (typeof COOKING_INGREDIENTS !== "undefined") ? COOKING_INGREDIENTS[sing] : null;
        if (ing) inputItems = Object.entries(ing).map(([n, q]) => ({ name: n, qty: q }));
      } else if (verb === "Craft" || verb === "Make") {
        const ing = (typeof RECIPE_INGREDIENTS !== "undefined") ? RECIPE_INGREDIENTS[sing] : null;
        if (ing) inputItems = Object.entries(ing).map(([n, q]) => ({ name: n, qty: q }));
      } else if (verb === "Grow" || verb === "Pick" || verb === "Harvest") {
        // Approximate: 1 seed per harvest. Seed name = "<item> Seed".
        inputItems = [{ name: sing + " Seed", qty: 1 }];
      }
      // Mine/Chop/Fish/Dig/Collect → inputItems stays null (tool cost noisy).

      // Cost = dashP2PCost for ONE unit × remaining (or target when delta unknown).
      let cost = null;
      if (inputItems && typeof dashP2PCost === "function") {
        const perUnit = dashP2PCost(inputItems);
        if (perUnit != null && isFinite(perUnit)) {
          const units = (remaining != null) ? remaining : target;
          cost = perUnit * units;
        }
      }

      return { verb, item, target, activityKey, inputItems, current, delta, remaining, ready, cost };
    }
```

- [ ] **Step 2: Smoke test in browser console**

```javascript
// Use the loaded farm
const f = (await (await fetch("/api/proxy?url=https://api.sunflower-land.com/community/farms/155498")).json()).farm;

// "Pick Tomatoes 300 times" — current data shows delta=403, target=300 → ready
const tomatoChore = Object.values(f.choreBoard.chores).find(c => c.name.includes("Tomato"));
console.log("tomato:", dashChoreParse(tomatoChore, f));
// Expect: { verb:"Pick", item:"Tomatoes", target:300, delta:>=300, ready:true, cost:non-null }

// "Cook Reindeer Carrot 25 times" — delta=0
const rcChore = Object.values(f.choreBoard.chores).find(c => c.name.includes("Reindeer Carrot"));
console.log("reindeer:", dashChoreParse(rcChore, f));
// Expect: { verb:"Cook", item:"Reindeer Carrot", target:25, delta:0, ready:false, cost:>0 }

// "Eat 20 Orange Cake" — no Eaten counter
const eatChore = Object.values(f.choreBoard.chores).find(c => c.name.startsWith("Eat "));
if (eatChore) console.log("eat:", dashChoreParse(eatChore, f));
// Expect: { verb:"Eat", activityKey:null, delta:null, ready:false, cost:>0 (recipe ingredients) }
```

- [ ] **Step 3: Commit**

```bash
git add flowers.html
git commit -m "$(cat <<'EOF'
dash: add dashChoreParse — chore name → progress/cost

Parses verb/item/count, maps to farmActivity counter (with singularization),
looks up ingredient cost from COOKING_INGREDIENTS/RECIPE_INGREDIENTS/seeds.
Graceful null fields when patterns don't match.
EOF
)"
```

---

## Task 5: Add `dashParseBounties` parser

**Files:**
- Modify: `flowers.html` — insert below `dashParseDeliveryOrders` (currently ends near line 7401)

- [ ] **Step 1: Locate the exchange rates source for parsers**

Earlier `dashParse*` parsers do not currently take a rates argument. The simplest approach is to attach rates to a module-level variable populated when the dashboard fetches P2P data. Find:

```bash
grep -n "dashP2P\b\|dashFetchP2P\|coinsPerSFL" flowers.html | head -10
```

If a `dashRates` (or similar) variable already exists, use it. If not, add one beside the existing `dashP2P` declaration:

```javascript
let dashRates = { coinsPerSFL: null, gemsPerSFL: null };
```

and populate it inside the existing P2P/exchange-rate fetch function (whichever fetches `https://sfl.world/api/v1/exchange` or equivalent). If the existing code fetches exchange rates separately, populate `dashRates` there. If exchange rates aren't fetched at all on the dashboard yet, add a minimal `dashFetchRates()` async function modeled on `dashFetchP2P`:

```javascript
async function dashFetchRates() {
  try {
    const r = await fetch("/api/proxy?url=" + encodeURIComponent("https://sfl.world/api/v1/exchange"));
    const j = await r.json();
    dashRates.coinsPerSFL = j.coinsPerSFL || j.data?.coinsPerSFL || null;
    dashRates.gemsPerSFL = j.gemsPerSFL || j.data?.gemsPerSFL || null;
  } catch (e) {}
}
```

and call it from `renderDashboard` (alongside `dashFetchP2P`):

```javascript
if (dashRates.coinsPerSFL == null) await dashFetchRates();
```

If this turns into more than ~15 lines, prefer reusing the rates that the existing `treasury` page already fetches by reading them from a globally-visible cache; check `grep -n "exchangeRates\|coinsPerSFL" flowers.html` for that cache.

- [ ] **Step 2: Insert the parser**

After the closing `}` of `dashParseDeliveryOrders` (currently at line 7401), insert:

```javascript
    function dashParseBounties(farm) {
      const actions = [];
      try {
        const requests = farm.bounties?.requests || [];
        const completedRaw = farm.bounties?.completed || [];
        const completedIds = new Set(completedRaw.map(c => typeof c === "string" ? c : c?.id).filter(Boolean));
        const ticket = dashGetSeasonalTicket(farm);
        for (const req of requests) {
          if (completedIds.has(req.id)) continue;
          const inputItems = [{ name: req.name, qty: 1 }];
          const cost = (typeof dashP2PCost === "function") ? dashP2PCost(inputItems) : null;
          const reward = { coins: req.coins, items: req.items };
          const { rewardText, efficiency } = dashRewardSummary(reward, ticket, cost, dashRates);
          const label = req.name + " → " + (rewardText || "?");
          const detail = (cost != null && isFinite(cost)) ? "Cost: " + cost.toFixed(2) + " SFL" : "Cost: ?";
          actions.push({
            category: "Bounty Board",
            icon: "\u{1F3AF}",  // 🎯
            label,
            detail,
            efficiency,
            status: "ready",
            readyAt: 0,
            priority: 21
          });
        }
      } catch (e) { /* defensive */ }
      return actions;
    }
```

- [ ] **Step 3: Wire into `parseDashboardActions`**

Find `parseDashboardActions` at line 7450. After the existing `actions.push(...dashParseDeliveryOrders(farm));` line, add:

```javascript
      actions.push(...dashParseBounties(farm));
```

- [ ] **Step 4: Verify in browser**

Reload `flowers.html?page=dashboard`. A new "Bounty Board" section should appear under "READY NOW". Many rows expected (~30-69 depending on farm state).

If no section appears:
- Console: `dashParseBounties(window.lastFarm || /* fetch farm */)` to check parser output
- Confirm `parseDashboardActions` change actually landed (`grep -n dashParseBounties flowers.html`)

- [ ] **Step 5: Commit**

```bash
git add flowers.html
git commit -m "$(cat <<'EOF'
dash: add Bounty Board section

Lists every pending farm.bounties.requests not in .completed, with input cost,
reward, and SFL/ticket or Net-SFL efficiency pill (rendering in next commit).
EOF
)"
```

---

## Task 6: Add `dashParseChores` parser

**Files:**
- Modify: `flowers.html` — insert below `dashParseBounties` (added in Task 5)

- [ ] **Step 1: Insert the parser**

After `dashParseBounties`, insert:

```javascript
    function dashParseChores(farm) {
      const actions = [];
      try {
        const chores = farm.choreBoard?.chores || {};
        const ticket = dashGetSeasonalTicket(farm);
        for (const [npc, chore] of Object.entries(chores)) {
          if (chore.completedAt) continue;
          const parsed = dashChoreParse(chore, farm);
          const reward = chore.reward || {};
          const { rewardText, efficiency } = dashRewardSummary(reward, ticket, parsed.cost, dashRates);
          const progressText = parsed.delta == null
            ? "?/" + parsed.target
            : Math.min(parsed.delta, parsed.target) + "/" + parsed.target;
          const label = chore.name + "  (" + progressText + ")";
          const detailParts = [];
          if (rewardText) detailParts.push("Reward: " + rewardText);
          if (parsed.cost != null && isFinite(parsed.cost)) detailParts.push("Cost: " + parsed.cost.toFixed(2) + " SFL");
          actions.push({
            category: "Chores",
            icon: "\u{1F4DC}",  // 📜
            label,
            detail: detailParts.join(" · "),
            efficiency,
            status: parsed.ready ? "ready" : "upcoming",
            readyAt: 0,
            priority: 22
          });
        }
      } catch (e) { /* defensive */ }
      return actions;
    }
```

- [ ] **Step 2: Wire into `parseDashboardActions`**

Right after the `actions.push(...dashParseBounties(farm));` line added in Task 5, add:

```javascript
      actions.push(...dashParseChores(farm));
```

- [ ] **Step 3: Verify in browser**

Reload. A new "Chores" section should appear. Expected for Farm #155498 (per spec verification data):
- "Pick Tomatoes 300 times" → READY (delta 403)
- "Collect Eggs 200 times" → READY (delta 210)
- "Cook Reindeer Carrot 25 times" → upcoming, 0/25
- "Eat 20 Orange Cake" → upcoming, ?/20

If progress shows `?/N` for chores that should have counters, the singularization rule probably missed an irregular plural. Add console logging in `dashChoreParse` temporarily to confirm `activityKey`, then fix.

- [ ] **Step 4: Commit**

```bash
git add flowers.html
git commit -m "$(cat <<'EOF'
dash: add Chores section with progress + cost

Skips chores with completedAt set. Shows X/N progress, reward, estimated SFL
cost for the remaining work. Rows fall back to ?/N gracefully when name
doesn't match either parse pattern.
EOF
)"
```

---

## Task 7: Render the efficiency pill and update sort order

**Files:**
- Modify: `flowers.html` — `renderItem` near line 7532 and `renderDashboard` near line 7479

- [ ] **Step 1: Update `renderItem` to render the pill**

Find `renderItem` at line 7532. Replace its body (everything between `function renderItem(item) {` and the matching closing `}`) with:

```javascript
      function renderItem(item) {
        const cls = item.status === "ready" ? "ready" : item.status === "upcoming" ? "upcoming" : "empty";
        let timeHtml = "";
        if (item.status === "ready") {
          timeHtml = `<span class="dash-ready-badge green">READY</span>`;
        } else if (item.status === "upcoming") {
          if (item.readyAt > 0 && item.readyAt < Infinity) {
            const diff = item.readyAt - Date.now();
            timeHtml = `<span class="dash-time growing-bed-time" data-ready="${item.readyAt}">${dashFormatCountdown(diff)}</span>`;
          }
        } else if (item.status === "empty") {
          timeHtml = `<span class="dash-ready-badge blue">IDLE</span>`;
        }
        let effHtml = "";
        if (item.efficiency) {
          let effCls = "dash-eff-net-pos";
          if (item.efficiency.kind === "ticket") effCls = "dash-eff-ticket";
          else if (item.efficiency.value < 0) effCls = "dash-eff-net-neg";
          effHtml = `<span class="dash-eff ${effCls}">${escHTML(item.efficiency.label)}</span>`;
        }
        const detailHtml = item.detail ? `<div class="dash-detail">${escHTML(item.detail)}</div>` : "";
        return `<div class="dash-item ${cls}">
          <span>${item.icon}</span>
          <div class="dash-item-label">${escHTML(item.label)}${detailHtml}</div>
          ${effHtml}
          ${timeHtml}
        </div>`;
      }
```

Key changes vs. original:
- Added `effHtml` block reading `item.efficiency`.
- Pill renders just before the time/badge.
- Upcoming-with-no-real-readyAt (chores) renders no time span — that's intentional (chores show progress in the label instead).

- [ ] **Step 2: Update Deliveries to use the new `dashRewardSummary`**

Find `dashParseDeliveryOrders` at line 7373. Replace its body to thread reward through `dashRewardSummary` and attach `efficiency`:

```javascript
    function dashParseDeliveryOrders(farm) {
      const actions = [];
      try {
        const orders = farm.delivery?.orders || [];
        const ticket = dashGetSeasonalTicket(farm);
        for (const order of orders) {
          if (order.completedAt) continue;
          if (order.reward?.sfl && !order.reward?.coins && !(order.reward?.items && Object.keys(order.reward.items).length > 0)) continue;
          const from = order.from || "Unknown";
          const items = order.items || {};
          const itemDesc = Object.entries(items).map(([n, q]) => q + "x " + n).join(", ");
          const inputItems = Object.entries(items).map(([n, q]) => ({ name: n, qty: q }));
          const cost = (typeof dashP2PCost === "function") ? dashP2PCost(inputItems) : null;
          const { rewardText, efficiency } = dashRewardSummary(order.reward, ticket, cost, dashRates);
          const detailParts = [];
          if (rewardText) detailParts.push("➡ " + rewardText);
          if (cost != null && isFinite(cost)) detailParts.push("Cost: " + cost.toFixed(2) + " SFL");
          actions.push({
            category: "Deliveries",
            icon: "\u{1F4CB}",  // 📋
            label: from + ": " + itemDesc,
            detail: detailParts.join(" | "),
            efficiency,
            status: "ready",
            readyAt: 0,
            priority: 20
          });
        }
      } catch (e) { /* defensive */ }
      return actions;
    }
```

- [ ] **Step 3: Add category-priority sort in `renderDashboard`**

Find `renderDashboard` near line 7479. Locate the `function groupByCategory` declaration inside it. Replace the existing `groupByCategory` plus its callers' iteration (the `for (const [cat, items] of Object.entries(cats))` lines for READY / COMING SOON / IDLE) with a version that sorts:

Locate the current section (around lines 7522-7589):

```javascript
      function groupByCategory(items) {
        const cats = {};
        for (const item of items) {
          if (!cats[item.category]) cats[item.category] = [];
          cats[item.category].push(item);
        }
        return cats;
      }
```

Replace with:

```javascript
      const CATEGORY_PRIORITY = {
        "Bounty Board": 1,
        "Chores": 2,
        "Deliveries": 3
        // Everything else falls to 99 (insertion order preserved among ties)
      };
      function groupByCategory(items) {
        const cats = {};
        for (const item of items) {
          if (!cats[item.category]) cats[item.category] = [];
          cats[item.category].push(item);
        }
        // Sort items inside each category by efficiency when present:
        //   ticket → ascending (cheapest SFL/ticket first)
        //   net    → descending (highest profit first)
        for (const cat of Object.keys(cats)) {
          cats[cat].sort((a, b) => {
            const ea = a.efficiency, eb = b.efficiency;
            if (!ea && !eb) return 0;
            if (!ea) return 1;
            if (!eb) return -1;
            if (ea.kind === "ticket" && eb.kind === "ticket") return ea.value - eb.value;
            if (ea.kind === "net" && eb.kind === "net") return eb.value - ea.value;
            return 0;  // mixed kinds — keep relative order
          });
        }
        return cats;
      }
      function categoryEntries(cats) {
        return Object.entries(cats).sort((a, b) => {
          const pa = CATEGORY_PRIORITY[a[0]] || 99;
          const pb = CATEGORY_PRIORITY[b[0]] || 99;
          return pa - pb;
        });
      }
```

Then update the three iteration sites (READY NOW, COMING SOON, IDLE) from:

```javascript
        const cats = groupByCategory(ready);
        for (const [cat, items] of Object.entries(cats)) {
          html += renderSection(cat, items, "");
        }
```

to:

```javascript
        const cats = groupByCategory(ready);
        for (const [cat, items] of categoryEntries(cats)) {
          html += renderSection(cat, items, "");
        }
```

Do the same swap for the `upcoming` and `idle` iteration blocks.

- [ ] **Step 4: Verify in browser**

Reload. Check:
- Bounty Board section appears first under READY NOW, Chores second, Deliveries third.
- Each Deliveries row now shows an efficiency pill (yellow for ticket, green for net positive, red for net negative).
- Inside Deliveries, rows are ordered cheapest-SFL-per-ticket first (or highest net profit first if no tickets in snapshot).
- Inside Bounty Board, same sort.
- Visual: pill is on the right side, small, monospace, color-coded.

- [ ] **Step 5: Commit**

```bash
git add flowers.html
git commit -m "$(cat <<'EOF'
dash: render efficiency pill + sort by efficiency + category priority

Deliveries now expose the same SFL/ticket or Net-SFL pill as new sections.
Sections appear Bounty Board → Chores → Deliveries → rest. Rows within each
section sort by efficiency (cheapest ticket / highest profit first).
EOF
)"
```

---

## Task 8: Full manual verification pass

**Files:** none — verification only.

- [ ] **Step 1: Run the spec checklist**

Open `flowers.html?page=dashboard` against Farm #155498. Tick each item:

- [ ] Bounty Board section appears under READY NOW with non-zero rows.
- [ ] Chores section appears with at least one READY chore ("Pick Tomatoes 300 times" or "Collect Eggs 200 times" per current data) and at least one upcoming chore with `0/N` progress.
- [ ] At least one row across Deliveries / Bounties shows a yellow `X.XX SFL/<Ticket>` pill OR `dashGetSeasonalTicket` returned null and rows show `Net ±SFL` pills instead.
- [ ] Net-negative pills are red. Net-positive pills are green.
- [ ] Chore "Cook Reindeer Carrot 25 times" detail line shows `Reward: +250 coins · Cost: <some-number> SFL`.
- [ ] No row has a left-border stripe.
- [ ] H1 ("DASHBOARD"), group titles ("🚨 READY NOW"), and section titles are pixel-font; item labels are monospace.
- [ ] Phone-width responsive: shrink to ~360px wide, confirm pill doesn't wrap awkwardly and text remains readable.

- [ ] **Step 2: Stress-test edge cases**

- [ ] Click "Refresh" / reload twice quickly — confirm `dashFetchRates`/`dashFetchP2P` don't double-fire wrongly (rates should already be cached on second load).
- [ ] Open devtools console; confirm no JS errors.
- [ ] In console: `dashGetSeasonalTicket(farm)` → returns either a string or `null` cleanly.
- [ ] In console: `dashParseChores({ choreBoard: null })` → returns `[]`, doesn't throw.
- [ ] In console: `dashParseBounties({ bounties: null })` → returns `[]`, doesn't throw.

- [ ] **Step 3: If a verification step fails**

Do NOT commit any "fix" without identifying the root cause first. Add the fix as a new commit (don't amend earlier task commits). If multiple things break, fix one at a time and re-run the relevant verification step.

- [ ] **Step 4: Commit the manual-verification log (optional)**

If you found anything noteworthy, document it in a brief commit message — otherwise skip.

---

## Task 9: Deploy

**Files:**
- Modify: `index.html` (source repo)
- Copy: `flowers.html` and `index.html` into `/tmp/sfl-flower-tracker/` (real Windows path)

Per `MEMORY.md`: `/tmp/sfl-flower-tracker/` on Windows resolves via bash to `C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\`, but Edit/Write/Python resolve `/tmp/` to `C:\tmp\` (different directory). All file writes to the deploy clone MUST use Python with the absolute Windows path.

- [ ] **Step 1: Mirror `flowers.html` to `index.html` in source repo**

```bash
cp flowers.html index.html
```

- [ ] **Step 2: Bump version in the footer**

Search the source for the current version string (per `MEMORY.md`, currently `v2.8`). Bump to `v2.9` and add a changelog entry summarizing this work:

```bash
grep -n "v2\\.8" flowers.html | head -5
```

Edit each match in `flowers.html` to `v2.9`, then `cp flowers.html index.html` again.

Changelog entry (find the expandable changelog block and prepend):

```
v2.9 — Dashboard: Mega Bounty Board, Weekly Chores, cost-per-ticket pill;
       readability fixes (monospace body, less 8-bit on dashboard only)
```

- [ ] **Step 3: Verify the deploy clone exists**

```bash
ls /tmp/sfl-flower-tracker/.vercel >/dev/null 2>&1 && echo "OK"
```

If missing (Windows cleans `/tmp/`), follow the recovery in `MEMORY.md`:

```bash
git clone https://hlavasim@github.com/hlavasim/sfl-flower-tracker.git /tmp/sfl-flower-tracker
cd /tmp/sfl-flower-tracker && npx vercel link --yes --project sfl-flower-tracker
```

- [ ] **Step 4: Copy files to deploy clone via Python (real Windows path)**

Write a temporary `_deploy_copy.py` in the source repo:

```python
import shutil
SRC = r'C:\Users\hlava\source\repos\Personal\sunflower-land-widgets'
DST = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker'
shutil.copy2(SRC + r'\flowers.html', DST + r'\flowers.html')
shutil.copy2(SRC + r'\index.html', DST + r'\index.html')
print('copied')
```

Then run:

```bash
python _deploy_copy.py
rm _deploy_copy.py
```

- [ ] **Step 5: Commit and push the deploy clone**

```bash
git -C /tmp/sfl-flower-tracker add -A
git -C /tmp/sfl-flower-tracker commit -m "v2.9: dashboard — bounties, chores, cost-per-ticket, readability"
git -C /tmp/sfl-flower-tracker push
```

- [ ] **Step 6: Deploy to production**

Per `MEMORY.md`, the user wants direct-to-prod deploys (not preview).

```bash
cd /tmp/sfl-flower-tracker && npx vercel --yes --prod
```

Expected: returns a production URL. Visit `https://sunflower.sajmonium.quest/?page=dashboard` and re-run the spec checklist on the live deploy.

- [ ] **Step 7: Commit the source-repo changes**

```bash
git add flowers.html index.html
git commit -m "$(cat <<'EOF'
v2.9: dashboard — bounties, chores, cost-per-ticket, readability
EOF
)"
```

---

## Self-Review Notes

Spec coverage:

- ✓ Bounty Board section → Task 5
- ✓ Chores section → Task 6
- ✓ Cost-per-ticket pill for Deliveries → Task 7 step 2 (updates `dashParseDeliveryOrders`)
- ✓ `dashGetSeasonalTicket` helper → Task 2
- ✓ `dashRewardSummary` helper → Task 3
- ✓ `dashChoreParse` helper → Task 4
- ✓ Net-SFL fallback for non-ticket rewards → Task 3 (`kind: "net"` branch)
- ✓ Readability CSS → Task 1
- ✓ Sort by efficiency + category priority → Task 7 step 3
- ✓ Edge cases (`farm.bounties` missing, etc.) → Tasks 5/6 wrap in `try { } catch { }` and use optional chaining; Task 8 step 2 verifies in console
- ✓ Deploy workflow with version bump + Python path → Task 9
