# Investment Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Investment Tracker section to the `?page=diff` route that lets the user log BTC deposits/withdrawals against their farm, computes repayment metrics, and surfaces historical earning-rate insights derived from existing farm snapshots.

**Architecture:**
- Persistence: new `btc_transactions` table in the Azure PostgreSQL `sfl_collector` database. CRUD goes through the **existing** `/api/farm-history` Vercel function (extended with `type=btc-tx` routing) — no new function slot (12-function Hobby limit is full).
- UI: three new collapsible blocks at the top of `renderDiff` in `flowers.html`. Investment metrics + transaction CRUD render immediately. Investment Insights (earning-rate panel, history chart, income breakdown, burn-vs-growth) lazy-load on user expand because they recompute the treasury value across ~30 farm snapshots in-browser.
- Reuse: treasury page's `computeFarmValue` for valuation, `fetchTreasuryData` for prices, existing farm-history snapshot endpoint for the historical data, `lightweight-charts` (already on the page) for the chart.

**Tech Stack:** Vanilla JS (single-file `flowers.html`), Vercel serverless functions (Node), Azure PostgreSQL (pg client via `_db.js`), `lightweight-charts` for visualization.

---

## Important context for the executor

This is a Windows + git-bash project with a tricky deploy clone path. Follow these conventions exactly or things will silently write to the wrong filesystem.

- **Source repo**: `C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\` — edits to `flowers.html` go here via Edit/Write tools.
- **Deploy clone**: bash path `/tmp/sfl-flower-tracker/` ≡ Windows path `C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\`. The bash `/tmp` maps via MSYS2; Edit/Write tools resolve `/tmp/` to `C:\tmp\` (a different folder). **Always use Python with the absolute Windows path** when copying files into the deploy clone:
  ```python
  import shutil
  shutil.copy2(r'C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\flowers.html',
               r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html')
  ```
- **Source-to-deploy workflow**:
  1. Edit `flowers.html` in source repo.
  2. Copy to source repo's `index.html` (`shutil.copy2`).
  3. Copy both into deploy clone using real Windows path.
  4. `git -C /tmp/sfl-flower-tracker add flowers.html index.html && commit && push`.
  5. `cd /tmp/sfl-flower-tracker && npx vercel --yes --prod`.
- **Azure functions**: `/tmp/sfl-flower-tracker/azure-functions/`. Deploy with `cd /tmp/sfl-flower-tracker/azure-functions && func azure functionapp publish sfl-data-collector --javascript`. **However**, for this plan only the Vercel `/api/farm-history` function changes — no Azure-function redeploy needed.
- **Validation before deploy**: extract inline `<script>` to a temp `.js` file and run `node --check` to catch syntax errors. See Task 14 for the snippet.
- **DB connection**: read-write goes through `_db.js` in `/tmp/sfl-flower-tracker/api/`. Reader user is `sfl_reader` (read-only). For inserts/deletes we use the same admin user already configured via env vars `PGHOST PGUSER PGPASSWORD PGDATABASE PGSSL`. **Verify**: the existing `/api/farm-history` GET uses `sfl_reader`. Inserts will require a write-capable user — check `_db.js` and use the admin role.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `azure-functions/schema.sql` | append | Add `CREATE TABLE btc_transactions` block + index |
| `/tmp/sfl-flower-tracker/api/farm-history.js` | modify | Add `type=btc-tx` GET/POST/DELETE branches |
| `/tmp/sfl-flower-tracker/api/_db.js` | inspect, possibly modify | Make sure a write-capable connection is exposed (currently may be reader-only) |
| `flowers.html` (source repo) | modify | Add `renderInvestmentTracker(...)` + `renderInvestmentInsights(...)` plus call sites inside `renderDiff` |
| `index.html` (source repo) | modify | Mirror copy of `flowers.html` |
| `docs/superpowers/specs/2026-05-17-investment-tracker-design.md` | unchanged | Source spec |

---

### Task 1: Add `btc_transactions` table to the schema file

**Files:**
- Modify: `C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\azure-functions\schema.sql` (append-only)

- [ ] **Step 1: Append schema block**

Open the file via Python (real Windows path) and append:

```sql

-- ============================================================
-- Investment Tracker — user-entered BTC deposit/withdrawal log
-- ============================================================
CREATE TABLE IF NOT EXISTS btc_transactions (
  id BIGSERIAL PRIMARY KEY,
  farm_id BIGINT NOT NULL,
  tx_date DATE NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('deposit','withdrawal')),
  btc_amount NUMERIC(20, 8) NOT NULL CHECK (btc_amount > 0),
  usd_amount NUMERIC(14, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_btc_tx_farm ON btc_transactions(farm_id, tx_date DESC);
```

- [ ] **Step 2: Apply the schema to the Azure DB**

Use the same psql endpoint the project already uses. From a shell with `PG*` env vars set:

```bash
psql "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c "
CREATE TABLE IF NOT EXISTS btc_transactions (
  id BIGSERIAL PRIMARY KEY,
  farm_id BIGINT NOT NULL,
  tx_date DATE NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('deposit','withdrawal')),
  btc_amount NUMERIC(20, 8) NOT NULL CHECK (btc_amount > 0),
  usd_amount NUMERIC(14, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_btc_tx_farm ON btc_transactions(farm_id, tx_date DESC);
GRANT SELECT ON btc_transactions TO sfl_reader;
"
```

The `GRANT SELECT` is needed because GET goes through the reader role.

- [ ] **Step 3: Verify table exists**

```bash
psql "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c "\d btc_transactions"
```

Expected: column listing matching the schema. Empty row count.

- [ ] **Step 4: Commit the schema.sql change**

```bash
git -C /tmp/sfl-flower-tracker add azure-functions/schema.sql
git -C /tmp/sfl-flower-tracker commit -m "schema: btc_transactions table for investment tracker"
```

---

### Task 2: Extend `/api/farm-history` with `type=btc-tx` handlers

**Files:**
- Modify: `C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\api\farm-history.js`
- Read first to understand current shape: `_db.js` (same dir) — confirm it exposes both a reader and writer pool, or just one client. Adjust if writes need a different role.

- [ ] **Step 1: Read the current `farm-history.js`**

Read with the Read tool (real Windows path: `C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\api\farm-history.js`). Note:
- How `req.query.farm` is parsed and validated
- How the existing handler returns JSON
- Whether it differentiates HTTP methods (likely only GET right now)

- [ ] **Step 2: Read `_db.js`**

Read with the Read tool (real Windows path: `C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\api\_db.js`). Identify:
- The exported `query()` / `pool` / `client` function
- Whether it's read-only (`sfl_reader`) — if so, add a write export using the admin role configured via `PGUSER` / `PGPASSWORD` env vars

- [ ] **Step 3: Add btc-tx branch at top of the handler**

Right after parsing `req.query.farm`, branch on `req.query.type === "btc-tx"`. Use the existing `_db.js` query helper. Full block:

```js
// ─── Investment Tracker: btc_transactions CRUD ─────────────────
if (req.query.type === "btc-tx") {
  const method = (req.method || "GET").toUpperCase();
  try {
    if (method === "GET") {
      const farm = parseInt(req.query.farm, 10);
      if (!Number.isFinite(farm)) return res.status(400).json({ error: "farm required" });
      const r = await query(
        `SELECT id, farm_id, tx_date, direction, btc_amount, usd_amount, notes, created_at
           FROM btc_transactions
          WHERE farm_id = $1
          ORDER BY tx_date DESC, created_at DESC`,
        [farm]
      );
      return res.status(200).json({ transactions: r.rows });
    }

    if (method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const farm = parseInt(body.farm_id, 10);
      const direction = (body.direction || "").toLowerCase();
      const btc = parseFloat(body.btc_amount);
      const usd = body.usd_amount === undefined || body.usd_amount === null || body.usd_amount === ""
        ? null : parseFloat(body.usd_amount);
      const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : null;
      const txDate = typeof body.tx_date === "string" ? body.tx_date : null;

      if (!Number.isFinite(farm) || farm <= 0) return res.status(400).json({ error: "farm_id required" });
      if (!["deposit", "withdrawal"].includes(direction)) return res.status(400).json({ error: "direction must be deposit or withdrawal" });
      if (!Number.isFinite(btc) || btc <= 0 || btc > 100) return res.status(400).json({ error: "btc_amount must be > 0 and <= 100" });
      if (usd !== null && (!Number.isFinite(usd) || usd < 0)) return res.status(400).json({ error: "usd_amount must be a non-negative number" });
      if (!txDate || !/^\d{4}-\d{2}-\d{2}$/.test(txDate)) return res.status(400).json({ error: "tx_date must be YYYY-MM-DD" });

      const r = await query(
        `INSERT INTO btc_transactions (farm_id, tx_date, direction, btc_amount, usd_amount, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, farm_id, tx_date, direction, btc_amount, usd_amount, notes, created_at`,
        [farm, txDate, direction, btc, usd, notes]
      );
      return res.status(201).json({ transaction: r.rows[0] });
    }

    if (method === "DELETE") {
      const farm = parseInt(req.query.farm, 10);
      const id = parseInt(req.query.id, 10);
      if (!Number.isFinite(farm) || !Number.isFinite(id)) return res.status(400).json({ error: "farm and id required" });
      const r = await query(
        `DELETE FROM btc_transactions WHERE id = $1 AND farm_id = $2 RETURNING id`,
        [id, farm]
      );
      if (r.rowCount === 0) return res.status(404).json({ error: "not found" });
      return res.status(200).json({ deleted: r.rows[0].id });
    }

    return res.status(405).json({ error: "method not allowed" });
  } catch (err) {
    console.error("[btc-tx]", err);
    return res.status(500).json({ error: err.message });
  }
}
// ─── End Investment Tracker branch ────────────────────────────
```

If `_db.js`'s exported `query` uses the reader role only, you must also expose a writer. Cheapest path: open `_db.js`, switch `PGUSER`/`PGPASSWORD` to the admin pair already in Vercel env (the project already stores both — `sfl_reader` and the admin used by Azure functions). If that's risky, add a second exported `queryWrite()` that constructs its own `pg.Pool` with the admin credentials and use it for POST/DELETE only.

- [ ] **Step 4: Locally syntax-check the file**

```bash
node --check /tmp/sfl-flower-tracker/api/farm-history.js
```

Expected: no output (success).

- [ ] **Step 5: Push and deploy**

```bash
git -C /tmp/sfl-flower-tracker add api/farm-history.js api/_db.js
git -C /tmp/sfl-flower-tracker commit -m "api: extend farm-history with type=btc-tx CRUD"
git -C /tmp/sfl-flower-tracker push origin main
cd /tmp/sfl-flower-tracker && npx vercel --yes --prod
```

- [ ] **Step 6: Verify the endpoint with curl**

```bash
# Insert a test deposit
curl -s -X POST "https://sunflower.sajmonium.quest/api/farm-history?type=btc-tx" \
  -H "Content-Type: application/json" \
  -d '{"farm_id":155498,"tx_date":"2026-02-01","direction":"deposit","btc_amount":0.25,"usd_amount":7250,"notes":"initial test"}'

# List
curl -s "https://sunflower.sajmonium.quest/api/farm-history?farm=155498&type=btc-tx" | python3 -m json.tool

# Delete the test row (replace ID)
curl -s -X DELETE "https://sunflower.sajmonium.quest/api/farm-history?farm=155498&type=btc-tx&id=<ID>"
```

Expected: POST returns 201 with `transaction` object, GET returns `{transactions: [...]}`, DELETE returns `{deleted: <id>}`.

---

### Task 3: Add Investment Tracker helpers to `flowers.html`

**Files:**
- Modify: `C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\flowers.html`

Add a self-contained block of helpers above `async function renderDiff(...)`. These will be called from the next tasks.

- [ ] **Step 1: Locate `renderDiff` start line**

```
Grep for `async function renderDiff` in flowers.html — note the line.
```

- [ ] **Step 2: Insert helper block immediately above `renderDiff`**

```js
    // ═══════════════════════════════════════
    //  INVESTMENT TRACKER
    // ═══════════════════════════════════════

    const INV_API_BASE = "/api/farm-history";
    const LS_INV_INSIGHTS_OPEN = "sfl_diff_insights_open";

    async function invListTransactions(farmId) {
      const r = await fetch(`${INV_API_BASE}?farm=${encodeURIComponent(farmId)}&type=btc-tx`);
      if (!r.ok) throw new Error(`list failed: ${r.status}`);
      const d = await r.json();
      return d.transactions || [];
    }

    async function invAddTransaction(payload) {
      const r = await fetch(`${INV_API_BASE}?type=btc-tx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(err.error || `add failed: ${r.status}`);
      }
      return (await r.json()).transaction;
    }

    async function invDeleteTransaction(farmId, id) {
      const r = await fetch(`${INV_API_BASE}?farm=${encodeURIComponent(farmId)}&type=btc-tx&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(err.error || `delete failed: ${r.status}`);
      }
      return true;
    }

    function invAggregate(transactions) {
      let depositBtc = 0, withdrawBtc = 0, depositUsd = 0, withdrawUsd = 0;
      let firstDepositDate = null;
      for (const t of transactions) {
        const btc = parseFloat(t.btc_amount) || 0;
        const usd = parseFloat(t.usd_amount) || 0;
        if (t.direction === "deposit") {
          depositBtc += btc;
          depositUsd += usd;
          if (!firstDepositDate || t.tx_date < firstDepositDate) firstDepositDate = t.tx_date;
        } else if (t.direction === "withdrawal") {
          withdrawBtc += btc;
          withdrawUsd += usd;
        }
      }
      const netDebtBtc = depositBtc - withdrawBtc;
      const repaidPct = depositBtc > 0 ? (withdrawBtc / depositBtc) * 100 : null;
      return { depositBtc, withdrawBtc, depositUsd, withdrawUsd, netDebtBtc, repaidPct, firstDepositDate };
    }

    function fmtBtc(v) {
      if (!isFinite(v)) return "—";
      return (Math.abs(v) >= 0.001 ? v.toFixed(6) : v.toFixed(8)) + " ₿";
    }
    function fmtUsd(v) {
      if (!isFinite(v) || v === 0) return "—";
      return "$" + (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
    }
    function fmtSfl(v) {
      if (!isFinite(v)) return "—";
      return (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) + " ⛀";
    }
```

- [ ] **Step 3: Syntax-check**

```bash
python3 -c "
import re
with open(r'C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\flowers.html','r',encoding='utf-8') as f: html = f.read()
m = re.search(r'<script>(.*?)</script>', html, re.DOTALL)
open(r'C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\_check.js','w',encoding='utf-8').write(m.group(1))
"
node --check C:/Users/hlava/source/repos/Personal/sunflower-land-widgets/_check.js
rm C:/Users/hlava/source/repos/Personal/sunflower-land-widgets/_check.js
```

Expected: no output.

- [ ] **Step 4: Commit source repo**

```bash
git -C C:/Users/hlava/source/repos/Personal/sunflower-land-widgets add flowers.html
git -C C:/Users/hlava/source/repos/Personal/sunflower-land-widgets commit -m "feat: investment tracker helpers (API + aggregation + formatters)"
```

---

### Task 4: Render Investment Tracker section in `renderDiff` (metric scaffolding + tx table)

**Files:**
- Modify: `C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\flowers.html` — inside `renderDiff`, immediately after the header HTML but before the existing diff loading block

- [ ] **Step 1: Add Investment Tracker container to `renderDiff`**

After the existing `hdr += '<div id="diff-content">...'` and `app.innerHTML = hdr;` lines, insert (still inside `renderDiff` so `data`, `p2pPrices`, `sflToUsd` are accessible later):

```js
      // Render the Investment Tracker mount BEFORE the diff body so the user sees it first.
      const invMount = document.createElement("div");
      invMount.id = "investment-tracker";
      invMount.className = "pixel-panel";
      invMount.style.cssText = "padding:12px;margin-bottom:16px;background:rgba(0,0,0,0.15)";
      invMount.innerHTML = `<div class="loading-screen pixel-font" style="padding:12px"><div class="loading-text">Loading investment tracker…</div></div>`;
      app.insertBefore(invMount, document.getElementById("diff-content"));

      // Kick off the load in the background — don't block diff render.
      renderInvestmentTracker(data, { p2pPrices, sflToUsd }).catch(err => {
        invMount.innerHTML = `<div class="error-screen pixel-panel pixel-font"><p>Investment tracker failed: ${escHTML(err.message)}</p></div>`;
      });
```

Note: `p2pPrices` and `sflToUsd` are defined further down in `renderDiff` — move the `renderInvestmentTracker` call to AFTER those are populated. Read the existing structure first; the natural insertion point is right after the existing `Promise.all([priceRes, exchangeRes, czkRes])` resolves.

- [ ] **Step 2: Implement `renderInvestmentTracker` (skeleton with header + tx table + add form)**

Place above `renderDiff` (alongside the helpers from Task 3):

```js
    let _invState = null;  // { transactions, rates: { sflToUsd, btcUsd, treasuryTotalSfl } }

    async function renderInvestmentTracker(data, opts) {
      const mount = document.getElementById("investment-tracker");
      if (!mount) return;

      // Need BTC price too — fetch from coingecko (same source as treasury)
      let btcUsd = 0;
      try {
        const r = await fetch(`/api/proxy?url=${encodeURIComponent("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd")}`);
        if (r.ok) {
          const j = await r.json();
          btcUsd = j?.bitcoin?.usd || 0;
        }
      } catch {}

      // Compute treasury value (reuse treasury logic if available — for metric ③)
      let treasuryTotalSfl = 0;
      try {
        if (typeof fetchTreasuryData === "function" && typeof computeFarmValue === "function") {
          const td = await fetchTreasuryData();
          const v = computeFarmValue(data.farm, td, "betty");
          treasuryTotalSfl = v?.grandTotal || 0;
        }
      } catch (e) {
        console.warn("[invest] treasury compute failed", e);
      }

      const transactions = await invListTransactions(FARM_ID).catch(err => {
        console.error("[invest] list failed", err);
        return [];
      });
      _invState = { transactions, rates: { sflToUsd: opts.sflToUsd, btcUsd, treasuryTotalSfl } };

      renderInvestmentTrackerContent();
    }

    function renderInvestmentTrackerContent() {
      const mount = document.getElementById("investment-tracker");
      if (!mount || !_invState) return;
      const { transactions, rates } = _invState;
      const agg = invAggregate(transactions);
      const { sflToUsd, btcUsd, treasuryTotalSfl } = rates;

      const liquidValueSfl = treasuryTotalSfl * 0.9;
      const liquidValueBtc = (sflToUsd > 0 && btcUsd > 0) ? (liquidValueSfl * sflToUsd / btcUsd) : 0;
      const ifLiqPct = agg.depositBtc > 0
        ? ((agg.withdrawBtc + liquidValueBtc) / agg.depositBtc) * 100
        : null;

      const verdictColor = (p) => p === null ? "var(--text-dim)"
                                  : p >= 100 ? "var(--green)"
                                  : p >= 50 ? "var(--sunpetal)"
                                  : "#ff8c42";

      mount.innerHTML = `
        <h2 class="pixel-font" style="margin:0 0 12px 0;font-size:0.8rem;color:var(--sunpetal)">💰 INVESTMENT TRACKER — Farm #${escHTML(FARM_ID)}</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:12px">
          <div class="pixel-panel" style="padding:10px;background:rgba(0,0,0,0.25)">
            <div class="pixel-font" style="font-size:0.55rem;color:var(--text-secondary)">① REPAID SO FAR</div>
            <div class="pixel-font" style="font-size:1rem;color:${verdictColor(agg.repaidPct)};font-weight:bold">${agg.repaidPct === null ? "n/a" : agg.repaidPct.toFixed(1) + " %"}</div>
            <div class="pixel-font" style="font-size:0.5rem;color:var(--text-dim);margin-top:4px">${fmtBtc(agg.withdrawBtc)} / ${fmtBtc(agg.depositBtc)}</div>
          </div>
          <div class="pixel-panel" style="padding:10px;background:rgba(0,0,0,0.25)">
            <div class="pixel-font" style="font-size:0.55rem;color:var(--text-secondary)">② DAYS TO FULL</div>
            <div class="pixel-font" style="font-size:1rem;color:var(--text-dim);font-weight:bold">—</div>
            <div class="pixel-font" style="font-size:0.5rem;color:var(--text-dim);margin-top:4px">expand Insights to compute</div>
          </div>
          <div class="pixel-panel" style="padding:10px;background:rgba(0,0,0,0.25)">
            <div class="pixel-font" style="font-size:0.55rem;color:var(--text-secondary)">③ LIQUIDATE NOW (10% fee)</div>
            <div class="pixel-font" style="font-size:1rem;color:${verdictColor(ifLiqPct)};font-weight:bold">${ifLiqPct === null ? "n/a" : ifLiqPct.toFixed(1) + " %"}</div>
            <div class="pixel-font" style="font-size:0.5rem;color:var(--text-dim);margin-top:4px">value: ${fmtSfl(liquidValueSfl)} ≈ ${fmtBtc(liquidValueBtc)}</div>
          </div>
        </div>
        <div id="inv-tx-table-wrap">${renderInvTxTable(transactions)}</div>
        <button class="roi-pill" onclick="_invShowAddForm()" style="margin-top:10px">+ Add transaction</button>
        <div id="inv-add-form" style="display:none"></div>
      `;
    }

    function renderInvTxTable(transactions) {
      if (transactions.length === 0) {
        return `<div class="pixel-font" style="font-size:0.55rem;color:var(--text-dim);padding:12px;text-align:center">No transactions yet. Click + Add to log your first deposit.</div>`;
      }
      let html = `<div style="overflow-x:auto"><table class="pixel-font" style="width:100%;font-size:0.55rem;border-collapse:collapse">
        <thead><tr style="background:rgba(0,0,0,0.35);color:var(--text-secondary)">
          <th style="text-align:left;padding:6px">DATE</th>
          <th style="text-align:left;padding:6px">TYPE</th>
          <th style="text-align:right;padding:6px">BTC</th>
          <th style="text-align:right;padding:6px">USD</th>
          <th style="text-align:left;padding:6px">NOTES</th>
          <th style="text-align:center;padding:6px"></th>
        </tr></thead><tbody>`;
      for (const t of transactions) {
        const isDep = t.direction === "deposit";
        const signed = (isDep ? "−" : "+") + parseFloat(t.btc_amount).toFixed(8);
        const color = isDep ? "var(--red)" : "var(--green)";
        const usd = t.usd_amount ? "$" + parseFloat(t.usd_amount).toFixed(2) : "—";
        html += `<tr style="border-top:1px solid rgba(255,255,255,0.05)">
          <td style="padding:6px">${escHTML(t.tx_date)}</td>
          <td style="padding:6px;color:${color}">${isDep ? "DEPOSIT" : "WITHDRAW"}</td>
          <td style="text-align:right;padding:6px;color:${color}">${signed} ₿</td>
          <td style="text-align:right;padding:6px;color:var(--text-dim)">${usd}</td>
          <td style="padding:6px;color:var(--text-dim)">${escHTML(t.notes || "")}</td>
          <td style="text-align:center;padding:6px"><button onclick="_invDeleteTx(${t.id})" style="background:transparent;border:none;color:var(--red);cursor:pointer;font-size:0.7rem" title="Delete">×</button></td>
        </tr>`;
      }
      html += `</tbody></table></div>`;
      return html;
    }

    window._invShowAddForm = function() {
      const wrap = document.getElementById("inv-add-form");
      if (!wrap) return;
      const today = new Date().toISOString().slice(0, 10);
      wrap.style.display = "block";
      wrap.innerHTML = `
        <div class="pixel-panel" style="margin-top:12px;padding:12px;background:rgba(0,0,0,0.3)">
          <div class="pixel-font" style="font-size:0.6rem;color:var(--sunpetal);margin-bottom:8px">ADD TRANSACTION</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;font-size:0.55rem" class="pixel-font">
            <label>DATE<br><input type="date" id="inv-f-date" value="${today}" style="width:100%;padding:4px;background:#2a1050;color:#fff;border:1px solid #444"></label>
            <label>TYPE<br>
              <select id="inv-f-dir" style="width:100%;padding:4px;background:#2a1050;color:#fff;border:1px solid #444">
                <option value="withdrawal">WITHDRAWAL (cash out)</option>
                <option value="deposit">DEPOSIT (money in)</option>
              </select>
            </label>
            <label>BTC AMOUNT<br><input type="number" id="inv-f-btc" min="0" step="0.00000001" placeholder="0.020000" style="width:100%;padding:4px;background:#2a1050;color:#fff;border:1px solid #444"></label>
            <label>USD VALUE (optional)<br><input type="number" id="inv-f-usd" min="0" step="0.01" placeholder="145.20" style="width:100%;padding:4px;background:#2a1050;color:#fff;border:1px solid #444"></label>
          </div>
          <label class="pixel-font" style="display:block;margin-top:10px;font-size:0.55rem">NOTES<br><input type="text" id="inv-f-notes" maxlength="500" placeholder="cash out 1000 FLOWER…" style="width:100%;padding:4px;background:#2a1050;color:#fff;border:1px solid #444"></label>
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="roi-pill" onclick="_invSubmitAdd()">Save</button>
            <button class="roi-pill" onclick="_invHideAddForm()">Cancel</button>
          </div>
          <div id="inv-add-error" class="pixel-font" style="display:none;margin-top:8px;font-size:0.55rem;color:var(--red)"></div>
        </div>
      `;
    };

    window._invHideAddForm = function() {
      const wrap = document.getElementById("inv-add-form");
      if (wrap) { wrap.style.display = "none"; wrap.innerHTML = ""; }
    };

    window._invSubmitAdd = async function() {
      const errEl = document.getElementById("inv-add-error");
      const showError = (msg) => { errEl.style.display = "block"; errEl.textContent = msg; };
      errEl.style.display = "none";

      const tx_date = document.getElementById("inv-f-date").value;
      const direction = document.getElementById("inv-f-dir").value;
      const btc_amount = parseFloat(document.getElementById("inv-f-btc").value);
      const usdRaw = document.getElementById("inv-f-usd").value;
      const usd_amount = usdRaw === "" ? null : parseFloat(usdRaw);
      const notes = document.getElementById("inv-f-notes").value || null;

      if (!tx_date) return showError("Date required");
      if (!isFinite(btc_amount) || btc_amount <= 0) return showError("BTC amount must be > 0");
      try {
        const tx = await invAddTransaction({ farm_id: parseInt(FARM_ID, 10), tx_date, direction, btc_amount, usd_amount, notes });
        _invState.transactions.unshift(tx);
        _invHideAddForm();
        renderInvestmentTrackerContent();
      } catch (e) {
        showError(e.message);
      }
    };

    window._invDeleteTx = async function(id) {
      if (!confirm("Delete this transaction?")) return;
      try {
        await invDeleteTransaction(FARM_ID, id);
        _invState.transactions = _invState.transactions.filter(t => t.id !== id);
        renderInvestmentTrackerContent();
      } catch (e) {
        alert("Delete failed: " + e.message);
      }
    };
```

- [ ] **Step 3: Syntax-check**

Same routine as Task 3, Step 3.

- [ ] **Step 4: Copy + deploy preview**

```bash
python3 -c "
import shutil
SRC = r'C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\flowers.html'
IDX = r'C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\index.html'
DST_F = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'
DST_I = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\index.html'
shutil.copy2(SRC, IDX); shutil.copy2(SRC, DST_F); shutil.copy2(IDX, DST_I)
"
git -C /tmp/sfl-flower-tracker add flowers.html index.html
git -C /tmp/sfl-flower-tracker commit -m "feat: investment tracker section on diff page (metrics + tx CRUD)"
git -C /tmp/sfl-flower-tracker push origin main
cd /tmp/sfl-flower-tracker && npx vercel --yes  # PREVIEW, not --prod
```

- [ ] **Step 5: Browser smoke-test the preview URL**

Open the preview URL from the previous step (`https://sfl-flower-tracker-...-sajmoniums-projects.vercel.app/?page=diff&farm=155498`). Confirm:
- Investment Tracker section appears at top
- 3 metric boxes render (① and ③ should show data; ② shows "—")
- Empty-state message under the boxes
- Click "+ Add transaction" → form appears
- Enter date / withdrawal / 0.001 BTC / save → row appears with green + sign
- Click × → confirm dialog → row disappears
- Refresh page → list persists
- Check browser DevTools console for errors

If anything fails, fix it before continuing. Do not commit broken intermediate state to prod.

- [ ] **Step 6: Promote to prod**

```bash
cd /tmp/sfl-flower-tracker && npx vercel --yes --prod
```

---

### Task 5: Investment Insights — collapsible scaffold + snapshot fetching/caching

**Files:**
- Modify: `C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\flowers.html`

- [ ] **Step 1: Add Insights mount + scaffold**

In `renderDiff`, after `invMount` is inserted and before `diff-content`, also insert:

```js
      const insMount = document.createElement("div");
      insMount.id = "investment-insights";
      insMount.className = "pixel-panel";
      insMount.style.cssText = "padding:12px;margin-bottom:16px;background:rgba(0,0,0,0.15)";
      const insOpen = localStorage.getItem("sfl_diff_insights_open") === "1";
      insMount.innerHTML = `
        <div onclick="_invToggleInsights()" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between">
          <h2 class="pixel-font" style="margin:0;font-size:0.8rem;color:var(--lily)">📊 INVESTMENT INSIGHTS</h2>
          <span class="pixel-font" id="ins-arrow" style="color:var(--text-secondary)">${insOpen ? "▼" : "▶"}</span>
        </div>
        <div id="ins-body" style="display:${insOpen ? "block" : "none"};margin-top:12px">
          <div class="loading-screen pixel-font" style="padding:12px"><div class="loading-text">Click to load…</div></div>
        </div>
      `;
      app.insertBefore(insMount, document.getElementById("diff-content"));
      if (insOpen) {
        renderInvestmentInsights(data).catch(err => {
          document.getElementById("ins-body").innerHTML = `<div class="error-screen pixel-panel pixel-font"><p>${escHTML(err.message)}</p></div>`;
        });
      }
```

- [ ] **Step 2: Add toggle handler + insights renderer skeleton**

Above `renderDiff`, alongside other invest code:

```js
    let _insState = null;
    let _insLoadedFor = null;  // FARM_ID we loaded for, so we skip re-fetch on collapse-uncollapse

    window._invToggleInsights = function() {
      const body = document.getElementById("ins-body");
      const arrow = document.getElementById("ins-arrow");
      if (!body) return;
      const willOpen = body.style.display === "none";
      body.style.display = willOpen ? "block" : "none";
      arrow.textContent = willOpen ? "▼" : "▶";
      localStorage.setItem("sfl_diff_insights_open", willOpen ? "1" : "0");
      if (willOpen && _insLoadedFor !== FARM_ID) {
        body.innerHTML = `<div class="loading-screen pixel-font" style="padding:12px"><div class="loading-text">Computing insights — may take a few seconds…</div></div>`;
        // `_invDataRef` set by renderDiff in step 3 below
        renderInvestmentInsights(_invDataRef).catch(err => {
          body.innerHTML = `<div class="error-screen pixel-panel pixel-font"><p>${escHTML(err.message)}</p></div>`;
        });
      }
    };

    async function renderInvestmentInsights(data) {
      const body = document.getElementById("ins-body");
      if (!body) return;

      // 1) Fetch farm history snapshots
      const FARM = FARM_ID;
      const weekAgo30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0,10);
      const today = new Date(Date.now() + 86400000).toISOString().slice(0,10);
      const histResp = await fetch(`/api/farm-history?farm=${FARM}&from=${weekAgo30}&to=${today}&limit=1000`);
      if (!histResp.ok) throw new Error(`snapshots fetch failed: ${histResp.status}`);
      const hist = await histResp.json();
      let snaps = hist.snapshots || [];
      if (snaps.length === 0) {
        body.innerHTML = `<div class="pixel-font" style="padding:12px;font-size:0.55rem;color:var(--text-dim)">No historical snapshots yet. Insights will populate as the data collector accumulates farm data.</div>`;
        return;
      }

      // 2) Fetch treasury reference data (prices for valuation)
      const td = await fetchTreasuryData();

      // 3) Compute farm value per snapshot (cache by snapshot id)
      const valueCache = new Map();
      const sampledSnaps = snaps.length > 20
        ? snaps.filter((_, i) => i % Math.ceil(snaps.length / 20) === 0)
        : snaps;

      const points = [];
      for (const snap of sampledSnaps) {
        if (!valueCache.has(snap.id)) {
          try {
            const farmObj = snap.game_data || snap.farm || snap;
            const v = computeFarmValue(farmObj, td, "betty");
            valueCache.set(snap.id, v?.grandTotal || 0);
          } catch (e) {
            valueCache.set(snap.id, 0);
          }
        }
        points.push({
          id: snap.id,
          time: new Date(snap.captured_at).getTime(),
          valueSfl: valueCache.get(snap.id),
        });
      }
      points.sort((a, b) => a.time - b.time);

      _insState = { points, transactions: _invState?.transactions || [], rates: _invState?.rates || {}, td };
      _insLoadedFor = FARM;

      renderInsightsContent();
    }

    function renderInsightsContent() {
      const body = document.getElementById("ins-body");
      if (!body || !_insState) return;
      body.innerHTML = `
        <div id="ins-earning-rate" style="margin-bottom:12px">${renderInsightEarningRate()}</div>
        <div id="ins-history-chart" style="margin-bottom:12px;min-height:240px"></div>
        <div id="ins-income-breakdown" style="margin-bottom:12px">${renderInsightIncomeBreakdown()}</div>
        <div id="ins-burn-vs-growth" style="margin-bottom:12px">${renderInsightBurnGrowth()}</div>
      `;
      // Chart renders into its container after innerHTML is set
      renderInsightHistoryChart();
    }
```

Add a tiny scaffold for the not-yet-implemented insight functions so the file compiles:

```js
    function renderInsightEarningRate() { return ""; }
    function renderInsightIncomeBreakdown() { return ""; }
    function renderInsightBurnGrowth() { return ""; }
    function renderInsightHistoryChart() {}
```

Also: pass `data` reference into `renderDiff` mounts:

```js
      window._invDataRef = data;  // so insights toggle can re-call
```

(Place inside `renderDiff`, near the mount inserts.)

- [ ] **Step 3: Syntax-check + browser smoke-test**

Same routine. Open preview → click "📊 INVESTMENT INSIGHTS" → should expand, show "Computing…", then show four empty containers (no errors). Console clean.

- [ ] **Step 4: Commit**

```bash
git -C C:/Users/hlava/source/repos/Personal/sunflower-land-widgets add flowers.html
git -C C:/Users/hlava/source/repos/Personal/sunflower-land-widgets commit -m "feat: investment insights scaffold (collapsible, lazy load, snapshot fetch+cache)"
```

---

### Task 6: Insight 1 — Earning rate panel + wire into metric ②

**Files:**
- Modify: `C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\flowers.html`

- [ ] **Step 1: Replace `renderInsightEarningRate` stub**

```js
    function _insSlopeForWindow(days) {
      if (!_insState) return null;
      const { points } = _insState;
      if (points.length < 2) return null;
      const cutoff = Date.now() - days * 86400000;
      const window = points.filter(p => p.time >= cutoff);
      if (window.length < 2) return null;
      const first = window[0], last = window[window.length - 1];
      const deltaSfl = last.valueSfl - first.valueSfl;
      const deltaDays = (last.time - first.time) / 86400000;
      if (deltaDays <= 0) return null;
      return { sflPerDay: deltaSfl / deltaDays, deltaSfl, deltaDays, sampleSize: window.length };
    }

    function renderInsightEarningRate() {
      const r7 = _insSlopeForWindow(7);
      const r30 = _insSlopeForWindow(30);
      const sflToUsd = _insState?.rates?.sflToUsd || 0;
      const btcUsd = _insState?.rates?.btcUsd || 0;

      function fmtRate(r) {
        if (!r) return "<span style='color:var(--text-dim)'>(insufficient data)</span>";
        const btcPerDay = (sflToUsd > 0 && btcUsd > 0) ? r.sflPerDay * sflToUsd / btcUsd : 0;
        const sign = r.sflPerDay >= 0 ? "+" : "−";
        const color = r.sflPerDay >= 0 ? "var(--green)" : "var(--red)";
        return `<span style="color:${color}">${sign}${Math.abs(r.sflPerDay).toFixed(1)} ⛀/day</span>` +
               (btcPerDay ? ` <span style="color:var(--text-dim)">(${sign}${Math.abs(btcPerDay).toFixed(8)} ₿/day)</span>` : "");
      }

      return `<div class="pixel-panel" style="padding:10px;background:rgba(0,0,0,0.25)">
        <div class="pixel-font" style="font-size:0.6rem;color:var(--sunpetal);margin-bottom:6px">EARNING RATE</div>
        <div class="pixel-font" style="font-size:0.55rem;color:var(--text-secondary);line-height:1.8">
          7-day:  ${fmtRate(r7)}<br>
          30-day: ${fmtRate(r30)}
        </div>
      </div>`;
    }
```

- [ ] **Step 2: Update metric ② to use earning rate**

In `renderInvestmentTrackerContent`, replace the placeholder "—" for metric ② with logic:

```js
      // Days to payback — uses the 30d (preferred) or 7d earning rate from insights cache
      let daysText = "—", daysSubText = "expand Insights to compute", daysColor = "var(--text-dim)";
      const remainingBtc = agg.netDebtBtc;
      if (remainingBtc <= 0) {
        daysText = "✅ paid"; daysColor = "var(--green)"; daysSubText = "you've recouped";
      } else if (_insState) {
        const r30 = _insSlopeForWindow(30) || _insSlopeForWindow(7);
        const sflToUsd2 = _insState.rates?.sflToUsd || sflToUsd;
        const btcUsd2 = _insState.rates?.btcUsd || btcUsd;
        if (r30 && sflToUsd2 > 0 && btcUsd2 > 0) {
          const btcPerDay = r30.sflPerDay * sflToUsd2 / btcUsd2;
          if (btcPerDay > 0) {
            const days = remainingBtc / btcPerDay;
            const eta = new Date(Date.now() + days * 86400000);
            daysText = days < 999 ? Math.round(days) + " days" : ">999 days";
            daysSubText = `ETA: ${eta.toISOString().slice(0,10)} @ ${btcPerDay.toFixed(8)} ₿/day`;
            daysColor = days < 90 ? "var(--green)" : days < 365 ? "var(--sunpetal)" : "#ff8c42";
          } else {
            daysText = "🚨 BURN";
            daysSubText = `farm losing value (${r30.sflPerDay.toFixed(1)} ⛀/day)`;
            daysColor = "var(--red)";
          }
        }
      }
```

Then change the metric ② box render:

```js
          <div class="pixel-panel" style="padding:10px;background:rgba(0,0,0,0.25)">
            <div class="pixel-font" style="font-size:0.55rem;color:var(--text-secondary)">② DAYS TO FULL</div>
            <div class="pixel-font" style="font-size:1rem;color:${daysColor};font-weight:bold">${daysText}</div>
            <div class="pixel-font" style="font-size:0.5rem;color:var(--text-dim);margin-top:4px">${daysSubText}</div>
          </div>
```

Also re-render the tracker when insights finish loading. At the end of `renderInvestmentInsights`, after `renderInsightsContent()`:

```js
      // Refresh metric ② now that we have earning rate
      renderInvestmentTrackerContent();
```

- [ ] **Step 3: Syntax-check + smoke test**

Open preview, expand Insights, wait, watch metric ② update from "—" to a real number.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: insight 1 — earning rate panel + wire metric ② days-to-payback"
```

---

### Task 7: Insight 2 — Farm value history chart (lightweight-charts)

**Files:**
- Modify: `C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\flowers.html`

The page already loads `lightweight-charts@4.2.1` via `<script src="…">` (confirmed in `<head>`). Use `LightweightCharts.createChart(container, options)`.

- [ ] **Step 1: Replace `renderInsightHistoryChart` stub**

```js
    function renderInsightHistoryChart() {
      const container = document.getElementById("ins-history-chart");
      if (!container || !_insState) return;
      const { points, transactions, rates } = _insState;
      const { sflToUsd, btcUsd } = rates;
      if (!sflToUsd || !btcUsd || points.length < 2) {
        container.innerHTML = `<div class="pixel-font" style="font-size:0.55rem;color:var(--text-dim);padding:12px">Not enough data for chart.</div>`;
        return;
      }

      container.innerHTML = `<div class="pixel-font" style="font-size:0.6rem;color:var(--sunpetal);margin-bottom:6px">FARM VALUE OVER TIME (BTC)</div><div id="ins-chart-canvas" style="height:240px"></div>`;
      const canvas = document.getElementById("ins-chart-canvas");
      const chart = LightweightCharts.createChart(canvas, {
        height: 240,
        layout: { background: { color: "transparent" }, textColor: "#c4a882" },
        grid: { vertLines: { color: "rgba(255,255,255,0.05)" }, horzLines: { color: "rgba(255,255,255,0.05)" } },
        timeScale: { timeVisible: true, secondsVisible: false },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
      });

      const series = chart.addLineSeries({ color: "#FFD700", lineWidth: 2 });
      const seriesData = points.map(p => ({
        time: Math.floor(p.time / 1000),
        value: p.valueSfl * sflToUsd / btcUsd,
      }));
      // Color segments red/green based on direction (simulate by splitting at sign-change — fallback to single color)
      series.setData(seriesData);

      // Total-deposited horizontal line
      const agg = invAggregate(transactions);
      if (agg.depositBtc > 0) {
        const depSeries = chart.addLineSeries({ color: "#ff6b6b", lineWidth: 1, lineStyle: 2 /* dashed */ });
        depSeries.setData([
          { time: seriesData[0].time, value: agg.depositBtc },
          { time: seriesData[seriesData.length - 1].time, value: agg.depositBtc },
        ]);
      }

      // Cumulative withdrawals step series
      if (transactions.some(t => t.direction === "withdrawal")) {
        const withSeries = chart.addLineSeries({ color: "#30D158", lineWidth: 1, lineStyle: 0 });
        let cum = 0;
        const stepPts = [];
        const ws = transactions
          .filter(t => t.direction === "withdrawal")
          .map(t => ({ time: Math.floor(new Date(t.tx_date).getTime() / 1000), btc: parseFloat(t.btc_amount) }))
          .sort((a, b) => a.time - b.time);
        for (const w of ws) {
          cum += w.btc;
          stepPts.push({ time: w.time, value: cum });
        }
        if (stepPts.length > 0) withSeries.setData(stepPts);
      }

      chart.timeScale().fitContent();
    }
```

- [ ] **Step 2: Smoke test**

Open preview, expand insights. Confirm the chart renders, has 1–3 lines (farm value, dashed deposit target, withdrawal step), no console errors.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: insight 2 — farm value history chart with deposit/withdrawal overlays"
```

---

### Task 8: Insight 3 — Income breakdown by category

**Files:**
- Modify: `C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\flowers.html`

- [ ] **Step 1: Replace `renderInsightIncomeBreakdown` stub**

```js
    function renderInsightIncomeBreakdown() {
      if (!_insState) return "";
      const { points } = _insState;
      if (points.length < 2) {
        return `<div class="pixel-font" style="font-size:0.55rem;color:var(--text-dim);padding:8px">Need ≥ 2 snapshots for breakdown.</div>`;
      }

      // Re-compute category breakdown for first vs last point in last-30d window.
      const cutoff = Date.now() - 30 * 86400000;
      const window = points.filter(p => p.time >= cutoff);
      if (window.length < 2) {
        return `<div class="pixel-font" style="font-size:0.55rem;color:var(--text-dim);padding:8px">< 30 days of snapshots — wait for more data.</div>`;
      }
      // For category breakdown we need farm objects, but `points` only has totals.
      // We rely on the fact that `_insState.td` is the treasury reference data,
      // and we re-fetch by snapshot id from `snaps` already pulled. Re-compute:

      // Get raw snapshots from the original fetch — store them in state too. (Update renderInvestmentInsights to keep `snaps`.)
      const rawSnaps = _insState.rawSnaps || [];
      const firstSnap = rawSnaps.find(s => new Date(s.captured_at).getTime() >= cutoff);
      const lastSnap = rawSnaps[rawSnaps.length - 1];
      if (!firstSnap || !lastSnap || firstSnap.id === lastSnap.id) {
        return `<div class="pixel-font" style="font-size:0.55rem;color:var(--text-dim);padding:8px">Insufficient snapshot coverage for breakdown.</div>`;
      }
      const td = _insState.td;
      const firstFarm = firstSnap.game_data || firstSnap.farm || firstSnap;
      const lastFarm = lastSnap.game_data || lastSnap.farm || lastSnap;
      const v0 = computeFarmValue(firstFarm, td, "betty");
      const v1 = computeFarmValue(lastFarm, td, "betty");

      // Treasury returns `categories` with totals; diff them.
      const cats0 = (v0?.categories || []).reduce((m, c) => { m[c.key] = c.total; return m; }, {});
      const cats1 = (v1?.categories || []).reduce((m, c) => { m[c.key] = c.total; return m; }, {});
      const allKeys = new Set([...Object.keys(cats0), ...Object.keys(cats1)]);
      const rows = [];
      let total = 0;
      for (const k of allKeys) {
        const d = (cats1[k] || 0) - (cats0[k] || 0);
        rows.push({ key: k, delta: d });
        total += d;
      }
      rows.sort((a, b) => b.delta - a.delta);

      let html = `<div class="pixel-panel" style="padding:10px;background:rgba(0,0,0,0.25)">
        <div class="pixel-font" style="font-size:0.6rem;color:var(--sunpetal);margin-bottom:6px">INCOME BREAKDOWN (last 30 days)</div>
        <table class="pixel-font" style="width:100%;font-size:0.55rem;border-collapse:collapse">
          <thead><tr style="color:var(--text-dim)">
            <th style="text-align:left;padding:4px">CATEGORY</th>
            <th style="text-align:right;padding:4px">Δ VALUE</th>
            <th style="text-align:right;padding:4px">% OF TOTAL</th>
          </tr></thead><tbody>`;
      for (const r of rows) {
        const pct = total !== 0 ? (r.delta / total) * 100 : 0;
        const color = r.delta >= 0 ? "var(--green)" : "var(--red)";
        const sign = r.delta >= 0 ? "+" : "−";
        html += `<tr style="border-top:1px solid rgba(255,255,255,0.05)">
          <td style="padding:4px;color:var(--text-secondary)">${escHTML(r.key)}</td>
          <td style="text-align:right;padding:4px;color:${color}">${sign}${Math.abs(r.delta).toFixed(1)} ⛀</td>
          <td style="text-align:right;padding:4px;color:var(--text-dim)">${pct.toFixed(0)} %</td>
        </tr>`;
      }
      const totalColor = total >= 0 ? "var(--green)" : "var(--red)";
      html += `<tr style="border-top:2px solid rgba(255,255,255,0.15);font-weight:bold">
        <td style="padding:4px">TOTAL</td>
        <td style="text-align:right;padding:4px;color:${totalColor}">${total >= 0 ? "+" : "−"}${Math.abs(total).toFixed(1)} ⛀</td>
        <td style="text-align:right;padding:4px">100 %</td>
      </tr>`;
      html += `</tbody></table></div>`;
      return html;
    }
```

- [ ] **Step 2: Persist raw snapshots in state**

In `renderInvestmentInsights`, modify the `_insState = { ... }` assignment:

```js
      _insState = { points, transactions: _invState?.transactions || [], rates: _invState?.rates || {}, td, rawSnaps: snaps };
```

- [ ] **Step 3: Smoke test + commit**

Confirm breakdown table renders. Commit:

```bash
git commit -m "feat: insight 3 — income breakdown by category"
```

---

### Task 9: Insight 4 — Burn vs growth panel

**Files:**
- Modify: `C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\flowers.html`

- [ ] **Step 1: Replace `renderInsightBurnGrowth` stub**

```js
    function renderInsightBurnGrowth() {
      const rows = [
        { label: "Last 7d",  r: _insSlopeForWindow(7) },
        { label: "Last 14d", r: _insSlopeForWindow(14) },
        { label: "Last 30d", r: _insSlopeForWindow(30) },
        { label: "Lifetime", r: _insSlopeForWindow(99999) },
      ];
      let html = `<div class="pixel-panel" style="padding:10px;background:rgba(0,0,0,0.25)">
        <div class="pixel-font" style="font-size:0.6rem;color:var(--sunpetal);margin-bottom:6px">NET RATE (signed)</div>
        <table class="pixel-font" style="font-size:0.55rem;width:100%;border-collapse:collapse">`;
      for (const row of rows) {
        if (!row.r) {
          html += `<tr><td style="padding:4px;color:var(--text-secondary)">${row.label}</td><td style="text-align:right;padding:4px;color:var(--text-dim)">(no data)</td></tr>`;
          continue;
        }
        const sign = row.r.sflPerDay >= 0 ? "+" : "−";
        const color = row.r.sflPerDay >= 0 ? "var(--green)" : "var(--red)";
        const emoji = row.r.sflPerDay >= 0 ? "📈 growth" : "📉 burn";
        html += `<tr style="border-top:1px solid rgba(255,255,255,0.05)">
          <td style="padding:4px;color:var(--text-secondary)">${row.label}</td>
          <td style="text-align:right;padding:4px;color:${color}">${sign}${Math.abs(row.r.sflPerDay).toFixed(1)} ⛀/day</td>
          <td style="text-align:right;padding:4px;color:var(--text-dim)">${emoji}</td>
        </tr>`;
      }
      html += `</table></div>`;
      return html;
    }
```

- [ ] **Step 2: Smoke test + commit**

```bash
git commit -m "feat: insight 4 — burn vs growth panel (7/14/30/lifetime net rate)"
```

---

### Task 10: Error states polish + edge cases

**Files:**
- Modify: `C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\flowers.html`

- [ ] **Step 1: Handle empty `_invState`**

Before any access in `renderInvestmentTrackerContent`, ensure `_invState` exists. The init already does this. Double-check `_invState.transactions` defaults to `[]` on list failure (already handled in the catch).

- [ ] **Step 2: Handle treasury compute failure**

In `renderInvestmentTracker`, ensure that if `computeFarmValue` returns null/undefined, metric ③ shows "n/a — couldn't compute farm value" rather than `NaN %`. Add:

```js
        if (!treasuryTotalSfl || !isFinite(treasuryTotalSfl)) {
          // Already 0; the subsequent calc handles it
        }
```

And in `renderInvestmentTrackerContent`, replace the `ifLiqPct` rendering condition:

```js
      const ifLiqText = (agg.depositBtc <= 0)
        ? "n/a — no deposits"
        : (treasuryTotalSfl <= 0)
          ? "—"
          : (ifLiqPct.toFixed(1) + " %");
```

Use `ifLiqText` in place of the previous expression.

- [ ] **Step 3: Handle no-snapshots case in metric ②**

Already handled by the `_insState` null guard — the placeholder text shows.

- [ ] **Step 4: Smoke test all edge cases**

In the browser, manually:
- Empty tx list → metric ① shows "n/a", form works
- Add a deposit only → metric ① shows "0.0 %"
- Add a withdrawal that exceeds deposit → metric ① > 100 % (allowed)
- Toggle insights when 0 snapshots are present → "No historical snapshots yet" message
- Toggle insights on, then off, then on again → no double-load (loaded flag works)

- [ ] **Step 5: Commit**

```bash
git commit -m "polish: investment tracker edge cases (empty states, compute failures)"
```

---

### Task 11: Version bump + changelog + final prod deploy

**Files:**
- Modify: `C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\flowers.html`

- [ ] **Step 1: Bump footer version to v3.25**

Find `<span class="changelog-toggle"…>` line — change `v3.24` to `v3.25`.

- [ ] **Step 2: Prepend changelog entry**

Find `const log = [` (in `renderChangelog`). Prepend:

```js
        { ver: "v3.25", items: [
          { t: "new", text: "Diff page — Investment Tracker section. Log BTC deposits and withdrawals tied to your farm, stored in Azure Postgres via /api/farm-history?type=btc-tx. Three live metrics: ① REPAID SO FAR (total withdrawn / total deposited), ② DAYS TO FULL PAYBACK (uses real earning rate from farm snapshots, 7d/30d window with lifetime fallback), ③ LIQUIDATE NOW % (treasury total × 0.9 marketplace fee → BTC). Investment Insights collapsible panel: earning rate (7d/30d), historical farm value chart in BTC with deposit-target dashed line and withdrawal step series, income breakdown by treasury category, burn-vs-growth net rate (7d/14d/30d/lifetime). New btc_transactions table. /api/farm-history extended with GET/POST/DELETE on type=btc-tx." },
        ]},
```

- [ ] **Step 3: Final syntax check + copy + deploy preview**

```bash
python3 -c "
import re
with open(r'C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\flowers.html','r',encoding='utf-8') as f: html = f.read()
m = re.search(r'<script>(.*?)</script>', html, re.DOTALL)
open(r'C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\_check.js','w',encoding='utf-8').write(m.group(1))
"
node --check C:/Users/hlava/source/repos/Personal/sunflower-land-widgets/_check.js
rm C:/Users/hlava/source/repos/Personal/sunflower-land-widgets/_check.js

python3 -c "
import shutil
SRC = r'C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\flowers.html'
IDX = r'C:\Users\hlava\source\repos\Personal\sunflower-land-widgets\index.html'
DST_F = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'
DST_I = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\index.html'
shutil.copy2(SRC, IDX); shutil.copy2(SRC, DST_F); shutil.copy2(IDX, DST_I)
"
git -C /tmp/sfl-flower-tracker add flowers.html index.html
git -C /tmp/sfl-flower-tracker commit -m "v3.25: investment tracker on diff page (BTC ROI + insights)"
git -C /tmp/sfl-flower-tracker push origin main
cd /tmp/sfl-flower-tracker && npx vercel --yes  # preview first
```

- [ ] **Step 4: Browser smoke-test preview**

Open the preview URL with `?page=diff&farm=155498`. Run through the full UX once more:
- All 3 metrics render
- Add transaction works
- Delete works
- Insights expand, all 4 sub-panels render
- Chart renders without console errors
- Page version footer shows v3.25

- [ ] **Step 5: Promote to prod**

```bash
cd /tmp/sfl-flower-tracker && npx vercel --yes --prod
curl -s -o /dev/null -w "%{http_code}\n" "https://sunflower.sajmonium.quest/?page=diff&farm=155498"
```

Expected: 200.

- [ ] **Step 6: Commit source repo final version**

```bash
git -C C:/Users/hlava/source/repos/Personal/sunflower-land-widgets add flowers.html index.html
git -C C:/Users/hlava/source/repos/Personal/sunflower-land-widgets commit -m "v3.25: investment tracker on diff page"
```

---

## Self-Review

**Spec coverage:**
- Storage (Postgres + endpoint multiplex): Tasks 1–2 ✓
- Transaction CRUD UI: Task 4 ✓
- Main metric ① REPAID SO FAR: Task 4 ✓
- Main metric ② DAYS TO PAYBACK: Tasks 4 (placeholder) + 6 (real wire) ✓
- Main metric ③ LIQUIDATE NOW: Task 4 ✓
- Investment Insights collapsible panel: Task 5 ✓
- Insight 1 earning rate: Task 6 ✓
- Insight 2 history chart: Task 7 ✓
- Insight 3 income breakdown: Task 8 ✓
- Insight 4 burn vs growth: Task 9 ✓
- Edge cases / error states: Task 10 ✓
- Performance (caching, sampling): Task 5 (sampling in `renderInvestmentInsights`) ✓
- Multi-farm `farm_id` isolation: Tasks 1, 2 ✓
- Changelog + deploy: Task 11 ✓

**Placeholder scan:**
- All code blocks contain the actual content the executor needs.
- Validation logic in Task 2 includes explicit thresholds (btc_amount > 0, ≤ 100; date regex; notes truncation).
- Edge cases enumerated in Task 10 are concrete.

**Type consistency:**
- `_invState.transactions` consistently shaped: `[{id, farm_id, tx_date, direction, btc_amount, usd_amount, notes, created_at}, ...]`.
- `_insState.points` consistently: `[{id, time, valueSfl}, ...]`. `time` is epoch ms in `points` but converted to seconds for `lightweight-charts` series (which expects seconds). Verified in Task 7.
- `invAggregate` return shape used identically in Tasks 4, 6, 7.
- `renderInsightHistoryChart()` declared as stub in Task 5, replaced in Task 7. Other render-insight stubs declared with empty-string returns to keep syntax valid until each insight task lands.

**Risks called out:**
- `_db.js` may be read-only. Task 2 includes inspection + the option to introduce a writer connection.
- Treasury `computeFarmValue` shape — uses `grandTotal` and `categories[].total/.key`. If the actual property names differ, Tasks 4 and 8 need a small adjustment (read the function before implementing).
