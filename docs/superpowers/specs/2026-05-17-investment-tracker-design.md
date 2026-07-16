# Investment Tracker — Diff page extension

**Status:** Draft
**Date:** 2026-05-17
**Author:** Šimon (with Claude)

## Motivation

User deposited ~0.25 BTC into Sunflower Land and wants to track repayment progress. The plan is to periodically sell FLOWER token earnings back to BTC and recoup the initial investment. They need:

1. A place to manually log BTC deposits and withdrawals tied to their farm.
2. Persistent storage (across browser sessions / devices) — Azure PostgreSQL.
3. Live metrics: how much is repaid, days until full repayment at current rate, what happens if everything is liquidated now (with 10% marketplace fee).
4. Insights from existing farm-snapshot history: real earning rate, historical farm-value chart in BTC, income breakdown by category, burn-vs-growth indicator.

The feature lives on the existing `?page=diff` route (Farm Changelog) — diff already pulls SFL/USD/BTC rates and is the natural "what's happening to my farm financially" page.

## Out of scope

- Multi-farm UX (one user = one farm; `farm_id` is stored for data hygiene but no farm switcher).
- Predicting future BTC/SFL/USD prices.
- Tracking gas / on-chain transaction fees on deposits and withdrawals (user enters net amounts).
- Authentication — endpoints stay open like the rest of the project (farm_id-in-URL is the only filter).
- Liquidity assumptions — the "liquidate now" calculation uses NFT floor + P2P prices flat, not orderbook depth.

## Page structure

The diff page (`renderDiff` at flowers.html line 19623) gains three new sections above the existing Farm Diff content:

```
1. INVESTMENT TRACKER
   - 3-metric header (repaid %, days-to-payback, liquidate-now %)
   - Transaction list + "Add transaction" form

2. INVESTMENT INSIGHTS (collapsible, default closed)
   - Earning rate panel (7d / 30d / lifetime)
   - Farm-value history chart in BTC
   - Income breakdown by category
   - Burn-vs-growth panel

3. FARM DIFF (existing)
```

Persistence of the collapsed state: `localStorage["sfl_diff_insights_open"]`.

## Storage: Azure PostgreSQL

New table in the same `sfl_collector` database used by existing endpoints:

```sql
CREATE TABLE btc_transactions (
  id BIGSERIAL PRIMARY KEY,
  farm_id BIGINT NOT NULL,
  tx_date DATE NOT NULL,                                    -- real-world transaction date
  direction TEXT NOT NULL CHECK (direction IN ('deposit','withdrawal')),
  btc_amount NUMERIC(20, 8) NOT NULL CHECK (btc_amount > 0),
  usd_amount NUMERIC(14, 2),                                -- optional reference value
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_btc_tx_farm ON btc_transactions(farm_id, tx_date DESC);
```

Migration applied via the existing `azure-functions/schema.sql` (append section + run by hand or via psql).

## Endpoint multiplex

To respect the 12-function Vercel Hobby limit, we extend the existing `/api/farm-history` Vercel function with a `type` query parameter:

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/farm-history?farm=X` | snapshots (existing) |
| GET | `/api/farm-history?farm=X&type=btc-tx` | list transactions for farm, ordered by `tx_date DESC` |
| POST | `/api/farm-history?type=btc-tx` body `{farm_id, tx_date, direction, btc_amount, usd_amount?, notes?}` | insert |
| DELETE | `/api/farm-history?farm=X&type=btc-tx&id=Y` | delete by id, filtered by farm |

Server-side validation:
- `direction` must be `deposit` or `withdrawal`
- `btc_amount` must parse as a positive number ≤ 100 (sanity cap)
- `tx_date` must be a valid ISO date
- `notes` truncated to 500 chars
- DELETE always includes `farm_id` in the SQL `WHERE` clause (defense in depth — `?id=Y` from one farm can't delete another farm's tx)

Auth: none (consistent with existing endpoints — farm_id is the only filter).

## Transaction entry UI

Inline panel inside the Investment Tracker section (not a modal):

```
┌─ 💰 INVESTMENT TRACKER — Farm #155498 ───────────────────┐
│  Deposited: 0.25000000 ₿     Withdrawn: 0.03200000 ₿     │
│  Net debt:  0.21800000 ₿     Repaid:    12.8 %           │
│  [+ Add transaction]                                      │
├───────────────────────────────────────────────────────────┤
│  Date        Type    BTC          USD     Notes      Del  │
│  2026-05-15  WITHDR  +0.020000  $145.20  cash out 1  [×] │
│  2026-04-10  WITHDR  +0.012000  $89.50   …           [×] │
│  2026-02-01  DEPOSIT -0.250000  $7250    initial     [×] │
└───────────────────────────────────────────────────────────┘
```

Form fields (when "+ Add" is clicked):
- **Date** — date input, default = today
- **Type** — radio: Withdrawal | Deposit
- **BTC amount** — number input, ≥ 0, up to 8 decimals (positive value; sign comes from direction)
- **USD value** — number input, optional (purely informational snapshot)
- **Notes** — text input, max 500 chars

Display conventions in the table:
- Deposit rows show `−BTC` in red
- Withdrawal rows show `+BTC` in green
- Sorted by `tx_date DESC`, then `created_at DESC`
- Delete column: ×-button with confirm dialog

After successful Save / Delete:
- Refresh tx list
- Recompute the 3 main metrics
- Insights section NOT auto-refreshed (snapshots haven't changed; manual "Refresh insights" toggle re-runs it)

Empty states:
- Zero transactions → "No transactions yet. Click + Add to log your first deposit."
- No deposits, only withdrawals → "Add a deposit first." for metric ①

## Main metrics

Three boxes in the header:

### ① REPAID SO FAR
```
repaidPct = totalWithdrawnBTC / totalDepositedBTC × 100
```
Display: percentage + raw BTC ratio (`0.032 ₿ / 0.250 ₿`) + USD ratio computed via current `sfl.usd` × `btc.usd` snapshot.

### ② DAYS TO FULL PAYBACK
Use the real earning rate from farm-snapshots:

```js
// 1. Fetch farm_snapshots for last 30 days (already done by diff page)
// 2. For each snapshot, compute farmValueSfl via treasury's computeFarmValue logic
// 3. Linear regression slope (or simple end-vs-start delta) → sflPerDay
// 4. btcPerDay = sflPerDay × sflUsd / btcUsd
// 5. remainingBtc = totalDeposited - totalWithdrawn
// 6. daysToFull = remainingBtc / btcPerDay
```

Fallback ladder:
1. **30-day window** preferred (low noise)
2. **7-day window** if 30d not available
3. **Lifetime avg** (`totalWithdrawn / daysSinceFirstDeposit`) if < 7d of snapshots — flag UI as "low confidence"
4. If `btcPerDay ≤ 0` (farm value declining) — display **BURN: −X ₿/day, current rate can't repay** in red

Display: numeric days + ETA date (`today + days`) + indicator emoji (🚀 < 90d, ⏳ 90–365d, 🐢 > 365d, 🚨 negative).

### ③ LIQUIDATE NOW
```js
liquidValueSfl = treasuryTotalSfl × 0.9         // 10 % marketplace fee
liquidValueBtc = liquidValueSfl × sflUsd / btcUsd
ifLiquidatedPaidPct = (totalWithdrawnBtc + liquidValueBtc) / totalDepositedBtc × 100
```

`treasuryTotalSfl` reuses the treasury page's `computeFarmValue` aggregate (resources + treasures + collectibles floor + wearables lastSalePrice + liquid SFL + coins via Betty + gems via best tier).

Display:
- The percentage
- "vs current debt: 0.218 ₿"
- Badge:
  - ≥ 100 % → green "🎯 PROFIT-POSITIVE: exit now and you're +X.X %"
  - 50–100 % → yellow "Almost there"
  - < 50 % → red

## Investment Insights (collapsible)

Default collapsed. Click → fetch + compute. Result cached in-memory for the page session.

### Insight 1 — Earning rate

Panel showing 7-day and 30-day net SFL/day + BTC/day equivalents. Source = farm-snapshots; computation = `(value_end − value_start) / days`. Uses the same `computeFarmValue` from treasury for each snapshot.

```
EARNING RATE
Farm value Δ (30d): +1842 ⛀ (+0.000847 ₿)
Daily rate:  +61.4 ⛀/day (+0.0000282 ₿/day)
7-day rate:  +73 ⛀/day
30-day rate: +61 ⛀/day
Lifetime:    +44 ⛀/day
```

### Insight 2 — Farm value history chart

Line chart using `lightweight-charts` (already in HTML head). Y-axis: farm value in BTC. X-axis: time.

Overlays:
- Dashed horizontal line at `totalDepositedBtc` ("kde musíš být")
- Step-function line for cumulative `totalWithdrawnBtc` at each tx_date
- Hover tooltip shows SFL / USD / BTC value at that snapshot

Range buttons: 7d / 30d / 90d / all.

If snapshots predate the first deposit, the chart still shows them (farm grew before user invested too — informative).

### Insight 3 — Income breakdown by category

```
INCOME BREAKDOWN (last 30 days)
Category          Δ value         % of total
─────────────────────────────────────────────
Resources         +820 ⛀          44 %
Collectibles      +540 ⛀          29 %
Wearables         +280 ⛀          15 %
Treasures         +130 ⛀           7 %
Coins             +50 ⛀            3 %
Gems              +22 ⛀            1 %
─────────────────────────────────────────────
TOTAL             +1842 ⛀         100 %
```

Compute by running treasury's category breakdown on two snapshots (N days ago vs today), then subtracting per-category SFL values. Negative deltas show as red.

### Insight 4 — Burn vs Growth

```
NET RATE (signed)
Last 7d:   +73 ⛀/day  📈 growth
Last 14d:  +52 ⛀/day  📈 growth
Last 30d:  −18 ⛀/day  📉 burn
Lifetime:  +44 ⛀/day
```

Also reflected in the history chart: segments between consecutive snapshots colored green (growing) or red (shrinking).

### Performance

Computing `computeFarmValue` on ~30 snapshots in-browser will take a few seconds. Mitigations:

- Cache results in a `Map<snapshotId, valueSfl>` for the page session
- Sample every 3rd snapshot if more than ~20 snapshots in the window
- Show a spinner while computing; don't block the main diff page render

If snapshots cover < 7 days: show "Need more historical data — collected snapshots only span X days. Earning-rate metrics will improve as data accumulates."

## Error states & graceful degradation

| Failure | Behavior |
|---|---|
| `/api/farm-history?type=btc-tx` 5xx | Tx list shows "Failed to load transactions" + retry button. Metrics blank. |
| `/api/farm-history?type=btc-tx` POST 4xx | Inline error in the Add form (e.g. "btc_amount must be positive"). |
| sfl.world prices/exchange API fail | USD/BTC metrics show "—" but tx list still loads. Already handled by existing diff page warnings. |
| Snapshots API empty | Insights section shows "No historical data yet." Metrics ②③ fall back to lifetime avg / current values. |
| `totalDeposited = 0` | ① shows "n/a", ② shows "—", ③ shows net portfolio in BTC only. |
| `btcPerDay ≤ 0` | ② shows "BURN: payback impossible at this rate", red. |

## Implementation order

1. **DB migration** — append `btc_transactions` table to `azure-functions/schema.sql`, run by hand against the Azure DB.
2. **Extend `/api/farm-history`** — add `type=btc-tx` GET/POST/DELETE handlers, reusing existing `_db.js` connection.
3. **Investment Tracker UI** — header section + add-tx form + transaction table + 3 main metrics. Metrics ① and ③ work immediately (no snapshots needed for ①, treasury logic exists for ③).
4. **Investment Insights** — collapsible panel, lazy-loaded. Implements all 4 insights including the lightweight-charts chart.
5. **Metric ②** integration — once Insights compute the earning rate, plug it into Days-to-payback. Until then, fallback to lifetime avg.

## Changelog entry (post-deploy)

- **v3.25**: Diff page — Investment Tracker section. Log BTC deposits/withdrawals tied to your farm (stored in Azure Postgres via extended `/api/farm-history?type=btc-tx`). Metrics: repaid %, days-to-full-payback (using real earning rate from farm snapshots), liquidate-now % (treasury total × 0.9 for 10% marketplace fee). Investment Insights panel (collapsible): 7d/30d earning rate, historical farm-value chart in BTC, income breakdown by category, burn-vs-growth indicator.

## Open questions / future work

- Edit (PATCH) transactions: not in v1. Workaround: delete + re-add.
- Editing the 10 % fee assumption (if marketplace changes pricing): hardcoded for now, easy to expose later.
- Per-currency support beyond BTC (e.g. user invested USD directly): currently BTC-only. Could add `currency` column later.
- Adding charts for cumulative repayment progress (line going from 0 % to 100 %): nice-to-have, not in v1.
- Adding a "what would I have if I never sold FLOWER" comparison (DCA into BTC vs holding): probably too speculative, skip.
