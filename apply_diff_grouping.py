#!/usr/bin/env python3
"""Add grouping mode (all/hours/days/weeks/months/years) to diff page"""

REAL = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'

with open(REAL, 'r', encoding='utf-8') as f:
    html = f.read()

# ═══════════════════════════════════════
# 1. Add CSS for group selector after existing diff CSS
# ═══════════════════════════════════════
CSS_INSERT = '''
    .diff-group-selector {
      display: flex;
      gap: 4px;
      margin-bottom: 12px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .diff-group-btn {
      padding: 5px 12px;
      font-size: 0.5625rem;
      cursor: pointer;
      background: rgba(0,0,0,0.2);
      border: 2px solid var(--panel-border);
      color: var(--text-secondary);
      border-radius: 4px;
      font-family: 'Press Start 2P', monospace;
      transition: all 0.15s;
    }
    .diff-group-btn.active {
      background: rgba(255,215,0,0.15);
      border-color: var(--sunpetal);
      color: var(--sunpetal);
    }
    .diff-group-btn:hover:not(.active) {
      background: rgba(255,255,255,0.05);
      border-color: var(--text-dim);
    }
'''

target_css = '''.diff-stat-value {
      font-size: 1rem;
      font-weight: bold;
    }'''
assert target_css in html, "CSS insert point not found"
html = html.replace(target_css, target_css + '\n' + CSS_INSERT)

# ═══════════════════════════════════════
# 2. Replace entire renderDiff function
# ═══════════════════════════════════════
idx_start = html.find('    async function renderDiff(data) {')
assert idx_start > 0, "renderDiff not found"
# Walk back to line start
line_start = html.rfind('\n', 0, idx_start) + 1
idx_start = line_start

depth = 0
found = False
idx_end = -1
for i in range(idx_start, len(html)):
    if html[i] == '{':
        depth += 1
        found = True
    elif html[i] == '}':
        depth -= 1
        if found and depth == 0:
            idx_end = i + 1
            break
assert idx_end > 0, "end of renderDiff not found"

NEW_RENDER_DIFF = r'''    async function renderDiff(data) {
      const app = document.getElementById("app");

      let hdr = `<div class="header pixel-panel pixel-font">
        <h1>FARM CHANGELOG</h1>
        <div class="farm-id">Farm #${escHTML(FARM_ID)}</div>
      </div>`;

      hdr += `<div class="under-dev-banner pixel-font" style="background:linear-gradient(180deg,#1a1a2e,#16213e);padding:8px 12px;border:3px solid #000;margin-bottom:16px;text-align:center;font-size:0.5625rem;color:#e94560">
        &#x1F50D; FARM DIFF VIEWER &#x1F50D;
        <div style="margin-top:6px;font-size:0.5rem;color:var(--text-secondary);line-height:1.5">
          SFL values from P2P prices + Betty coins + gem exchange. Crafted items valued by ingredient costs.
        </div>
      </div>`;

      hdr += `<div id="diff-content"><div class="loading-screen pixel-font" style="padding:20px"><div class="loading-text">Loading...</div></div></div>`;
      app.innerHTML = hdr;

      // Fetch with retry
      const fetchRetry = async (url, label, retries = 2) => {
        for (let i = 0; i <= retries; i++) {
          try {
            const resp = await fetch(url);
            if (resp.ok) return { ok: true, data: await resp.json(), label };
            if (resp.status >= 500 && i < retries) { await new Promise(r => setTimeout(r, 1000 * (i + 1))); continue; }
            return { ok: false, label, error: `${resp.status} ${resp.statusText}` };
          } catch (e) {
            if (i < retries) { await new Promise(r => setTimeout(r, 1000 * (i + 1))); continue; }
            return { ok: false, label, error: e.message };
          }
        }
      };

      // Fetch prices (once, needed for SFL valuation)
      let p2pPrices = {};
      let coinsPerSFL = 0;
      let gemsPerSFL = 0;
      const warnings = [];
      const proxyUrl = (u) => `/api/proxy?url=${encodeURIComponent(u)}`;

      const [priceRes, exchangeRes] = await Promise.all([
        fetchRetry(proxyUrl("https://sfl.world/api/v1/prices"), "P2P prices"),
        fetchRetry(proxyUrl("https://sfl.world/api/v1.1/exchange"), "Exchange rates"),
      ]);

      if (priceRes.ok) {
        const raw = priceRes.data?.data?.p2p || priceRes.data?.p2p || {};
        for (const [k, v] of Object.entries(raw)) p2pPrices[k] = parseFloat(v) || 0;
      } else { warnings.push(`P2P prices: ${priceRes.error}`); }

      if (exchangeRes.ok) {
        const ed = exchangeRes.data;
        const betty = computeBettyRate(p2pPrices);
        coinsPerSFL = betty.rate || 320;
        const gemTiers = Object.values(ed?.gems || {});
        const bestGemTier = gemTiers.reduce((best, t) => (!best || (t.gem / t.sfl) > (best.gem / best.sfl)) ? t : best, null);
        gemsPerSFL = bestGemTier ? (bestGemTier.gem / (bestGemTier.sfl * 0.7)) : 0;
      } else { warnings.push(`Exchange rates: ${exchangeRes.error}`); }

      const noPrices = Object.keys(p2pPrices).length === 0;

      // ── Process a diff object into items + netSfl ──
      function processDiff(diff) {
        let netSfl = 0;
        const items = [];
        for (const [key, rawDelta] of Object.entries(diff)) {
          const d = typeof rawDelta === "number" ? rawDelta : parseFloat(rawDelta);
          if (isNaN(d) || Math.abs(d) < 0.0001) continue;

          let category = "other";
          let itemName = key;
          let sflValue = 0;

          if (key === "balance") {
            category = "sfl"; itemName = "SFL Balance"; sflValue = d;
          } else if (key === "coins") {
            category = "coins"; itemName = "Coins";
            sflValue = coinsPerSFL > 0 ? d / coinsPerSFL : 0;
          } else if (key === "gems" || key === "inventory.Gem") {
            category = "gems"; itemName = key === "gems" ? "Gems" : "Gem";
            sflValue = gemsPerSFL > 0 ? d / gemsPerSFL : 0;
          } else if (key.startsWith("inventory.")) {
            itemName = key.substring(10); category = "inventory";
            const price = estimateItemSfl(itemName, p2pPrices, null, { coinsPerSFL });
            sflValue = d * price;
          } else if (key.startsWith("wardrobe.")) {
            itemName = key.substring(9); category = "wardrobe";
          } else if (key.startsWith("stock.")) {
            continue;
          }

          items.push({ key, itemName, category, delta: d, sflValue, hasPrice: sflValue !== 0 || category === "sfl" || category === "coins" || category === "gems" });
          netSfl += sflValue;
        }
        items.sort((a, b) => Math.abs(b.sflValue) - Math.abs(a.sflValue) || a.itemName.localeCompare(b.itemName));
        return { items, netSfl };
      }

      // ── State ──
      let groupMode = "all";
      let showZeroPrice = true;
      let selectedIdx = -1;
      let processed = [];
      let loading = false;

      // ── Period label formatters ──
      function periodLabel(time, mode) {
        if (mode === "all") return time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        if (mode === "hours") return time.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        if (mode === "days") return time.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
        if (mode === "weeks") {
          const end = new Date(time.getTime() + 6 * 86400000);
          return time.toLocaleDateString([], { month: "short", day: "numeric" }) + " \u2013 " + end.toLocaleDateString([], { month: "short", day: "numeric" });
        }
        if (mode === "months") return time.toLocaleDateString([], { month: "long", year: "numeric" });
        if (mode === "years") return time.getUTCFullYear().toString();
        return time.toLocaleString();
      }

      function getISOWeek(d) {
        const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
      }

      // ── Fetch data for a given mode ──
      async function fetchData(mode) {
        loading = true;
        renderContent();

        if (mode === "all") {
          const res = await fetchRetry(`/api/farm-history?farm=${FARM_ID}&latest=50`, "Farm history");
          if (!res.ok) {
            loading = false;
            document.getElementById("diff-content").innerHTML = renderGroupSelector() +
              `<div class="pixel-panel pixel-font" style="padding:20px;text-align:center;color:var(--red)">Failed to load: ${escHTML(res.error)}<br><button class="pixel-font" style="margin-top:10px;padding:8px 16px;cursor:pointer" onclick="window._diffSetGroup('all')">Retry</button></div>`;
            return;
          }
          const snapshots = (res.data.snapshots || []).reverse();
          processed = snapshots.map(snap => {
            const { items, netSfl } = processDiff(snap.diff || {});
            return { time: new Date(snap.captured_at), netSfl, items, count: 1 };
          });
        } else {
          const groupMap = { hours: "hour", days: "day", weeks: "week", months: "month", years: "year" };
          const res = await fetchRetry(`/api/farm-diff-agg?farm=${FARM_ID}&group=${groupMap[mode]}`, "Aggregated data");
          if (!res.ok) {
            loading = false;
            document.getElementById("diff-content").innerHTML = renderGroupSelector() +
              `<div class="pixel-panel pixel-font" style="padding:20px;text-align:center;color:var(--red)">Failed to load: ${escHTML(res.error)}<br><button class="pixel-font" style="margin-top:10px;padding:8px 16px;cursor:pointer" onclick="window._diffSetGroup('${escHTML(mode)}')">Retry</button></div>`;
            return;
          }
          processed = (res.data.periods || []).map(p => {
            const { items, netSfl } = processDiff(p.diff || {});
            return { time: new Date(p.period), netSfl, items, count: p.count };
          });
        }

        selectedIdx = processed.length > 0 ? processed.length - 1 : -1;
        loading = false;
        renderContent();
      }

      // ── Group selector HTML ──
      function renderGroupSelector() {
        const modes = [
          { id: "all", label: "ALL" },
          { id: "hours", label: "HOURS" },
          { id: "days", label: "DAYS" },
          { id: "weeks", label: "WEEKS" },
          { id: "months", label: "MONTHS" },
          { id: "years", label: "YEARS" },
        ];
        let s = `<div class="diff-group-selector">`;
        for (const m of modes) {
          s += `<button class="diff-group-btn pixel-font${groupMode === m.id ? ' active' : ''}" onclick="window._diffSetGroup('${m.id}')">${m.label}</button>`;
        }
        s += `</div>`;
        return s;
      }

      // ── Main render ──
      function renderContent() {
        let out = renderGroupSelector();

        if (loading) {
          out += `<div class="loading-screen pixel-font" style="padding:20px"><div class="loading-text">Loading...</div></div>`;
          document.getElementById("diff-content").innerHTML = out;
          return;
        }

        // Warnings
        if (warnings.length > 0) {
          out += `<div class="pixel-panel pixel-font" style="padding:8px 12px;margin-bottom:12px;border-color:var(--red);font-size:0.5rem;color:var(--text-secondary)">
            ${noPrices ? '<span style="color:var(--red)">Price data unavailable</span> \u2014 SFL values will be missing. ' : '<span style="color:var(--yellow)">Partial data</span> \u2014 '}
            ${warnings.map(w => escHTML(w)).join("; ")}
          </div>`;
        }

        if (processed.length === 0) {
          out += `<div class="pixel-panel pixel-font" style="padding:20px;text-align:center;color:var(--text-secondary)">No data found for this period.</div>`;
          document.getElementById("diff-content").innerHTML = out;
          return;
        }

        // Stat cards
        const totalNet = processed.reduce((s, p) => s + p.netSfl, 0);
        const totalGain = processed.reduce((s, p) => s + (p.netSfl > 0 ? p.netSfl : 0), 0);
        const totalLoss = processed.reduce((s, p) => s + (p.netSfl < 0 ? p.netSfl : 0), 0);
        const totalSnapshots = processed.reduce((s, p) => s + p.count, 0);
        const timeSpan = processed.length >= 2
          ? Math.round((processed[processed.length - 1].time - processed[0].time) / 60000)
          : 0;
        const timeStr = timeSpan >= 1440 ? `${(timeSpan / 1440).toFixed(1)}d` : timeSpan >= 60 ? `${(timeSpan / 60).toFixed(1)}h` : `${timeSpan}m`;

        const isGrouped = groupMode !== "all";
        const countLabel = isGrouped ? "PERIODS" : "SNAPSHOTS";
        const countExtra = isGrouped
          ? ` <span style="font-size:0.4375rem;color:var(--text-dim)">(${totalSnapshots} snaps, ${timeStr})</span>`
          : ` <span style="font-size:0.5rem;color:var(--text-dim)">(${timeStr})</span>`;

        out += `<div class="diff-stat-cards">
          <div class="pixel-panel diff-stat-card">
            <div class="diff-stat-label">NET CHANGE</div>
            <div class="diff-stat-value" style="color:${totalNet >= 0 ? 'var(--green)' : 'var(--red)'}">${totalNet >= 0 ? '+' : ''}${totalNet.toFixed(2)} ${sflIcon("0.85em")}</div>
          </div>
          <div class="pixel-panel diff-stat-card">
            <div class="diff-stat-label">GAINS</div>
            <div class="diff-stat-value" style="color:var(--green)">+${totalGain.toFixed(2)} ${sflIcon("0.85em")}</div>
          </div>
          <div class="pixel-panel diff-stat-card">
            <div class="diff-stat-label">LOSSES</div>
            <div class="diff-stat-value" style="color:var(--red)">${totalLoss.toFixed(2)} ${sflIcon("0.85em")}</div>
          </div>
          <div class="pixel-panel diff-stat-card">
            <div class="diff-stat-label">${countLabel}</div>
            <div class="diff-stat-value" style="color:var(--text-primary)">${processed.length}${countExtra}</div>
          </div>
        </div>`;

        // Bar chart
        const maxAbs = Math.max(...processed.map(p => Math.abs(p.netSfl)), 0.01);
        const barW = processed.length > 120 ? 6 : processed.length > 60 ? 10 : processed.length > 30 ? 14 : 18;
        const singularMode = groupMode === "all" ? "SNAPSHOT" : groupMode.slice(0, -1).toUpperCase();
        const chartLabel = `SFL VALUE CHANGE PER ${singularMode}`;

        out += `<div class="pixel-panel diff-timeline" style="padding:10px 8px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;padding:0 6px">
            <span class="pixel-font" style="font-size:0.5625rem;color:var(--text-dim)">${chartLabel}</span>
            <div class="diff-toggle-wrap">
              <label class="diff-toggle"><input type="checkbox" id="diff-zero-toggle" ${showZeroPrice ? 'checked' : ''} onchange="window._diffToggleZero(this.checked)"> Show zero-price items</label>
            </div>
          </div>
          <div class="diff-chart-wrap" style="position:relative">
            <div class="diff-chart">`;

        out += `<div class="diff-zero-line" style="top:50%"></div>`;

        for (let i = 0; i < processed.length; i++) {
          const p = processed[i];
          const pct = Math.min(Math.max(Math.abs(p.netSfl) / maxAbs * 90, 2), 90);
          const sel = i === selectedIdx ? " selected" : "";
          const tLabel = periodLabel(p.time, groupMode);
          const isPositive = p.netSfl >= 0;
          const snapInfo = p.count > 1 ? ` (${p.count} snapshots)` : "";
          out += `<div class="diff-bar-wrap${sel}" style="width:${barW}px" onclick="window._diffSelect(${i})" title="${escHTML(tLabel)}: ${p.netSfl >= 0 ? '+' : ''}${p.netSfl.toFixed(2)} SFL${snapInfo}">
            <div class="diff-bar-top">${isPositive ? `<div class="diff-bar positive" style="height:${pct}%;width:${barW - 4}px"></div>` : ''}</div>
            <div class="diff-bar-bot">${!isPositive ? `<div class="diff-bar negative" style="height:${pct}%;width:${barW - 4}px"></div>` : ''}</div>
          </div>`;
        }

        out += `</div></div></div>`;

        // Selected detail panel
        if (selectedIdx >= 0 && selectedIdx < processed.length) {
          const p = processed[selectedIdx];
          const timeFmt = groupMode === "all" ? p.time.toLocaleString() : periodLabel(p.time, groupMode);
          const visibleItems = showZeroPrice ? p.items : p.items.filter(it => it.hasPrice);

          out += `<div class="pixel-panel diff-detail">
            <div class="diff-detail-header">
              <div>
                <div class="diff-detail-time">${escHTML(timeFmt)}</div>
                <div style="font-size:0.5rem;color:var(--text-dim)">${p.items.length} changes${p.count > 1 ? ' \u00b7 ' + p.count + ' snapshots' : ''}${!showZeroPrice && p.items.length !== visibleItems.length ? ` (${p.items.length - visibleItems.length} hidden)` : ''}</div>
              </div>
              <div class="diff-detail-net" style="color:${p.netSfl >= 0 ? 'var(--green)' : 'var(--red)'}">
                ${p.netSfl >= 0 ? '+' : ''}${p.netSfl.toFixed(4)} ${sflIcon("0.85em")}
              </div>
            </div>`;

          if (visibleItems.length > 0) {
            out += `<table class="diff-item-table">
              <thead><tr><th>Item</th><th>Change</th><th>Unit Price</th><th>SFL Value</th></tr></thead><tbody>`;
            for (const it of visibleItems) {
              const rowCls = it.sflValue > 0.0001 ? "gain" : it.sflValue < -0.0001 ? "loss" : "neutral";
              const unitPrice = it.category === "sfl" ? "1.0000" :
                it.delta !== 0 && it.sflValue !== 0 ? Math.abs(it.sflValue / it.delta).toFixed(4) : "\u2014";
              const isInt = Math.abs(it.delta - Math.round(it.delta)) < 0.001;
              const deltaStr = it.category === "sfl" ? (it.delta >= 0 ? "+" : "") + it.delta.toFixed(4) :
                (it.delta >= 0 ? "+" : "") + (isInt ? Math.round(it.delta).toString() : it.delta.toFixed(2));
              const valStr = it.sflValue !== 0 ? (it.sflValue >= 0 ? "+" : "") + it.sflValue.toFixed(4) : "\u2014";
              const iconName = it.category === "sfl" ? null : it.category === "coins" ? "Coins" : it.itemName;
              const iconHtml = it.category === "sfl"
                ? `${sflIcon("14px")} `
                : iconName ? `<img src="${getItemIcon(iconName)}" style="height:14px;vertical-align:middle;margin-right:3px" onerror="this.style.display='none'">` : '';
              out += `<tr class="${rowCls}"><td>${iconHtml}${escHTML(it.itemName)}</td><td>${deltaStr}</td><td>${unitPrice}</td><td>${valStr}</td></tr>`;
            }
            out += `</tbody></table>`;
          } else {
            out += `<div style="text-align:center;color:var(--text-dim);font-size:0.6875rem;padding:12px 0">No priced items in this ${isGrouped ? "period" : "snapshot"}</div>`;
          }
          out += `</div>`;
        }

        document.getElementById("diff-content").innerHTML = out;
      }

      // Global handlers
      window._diffSelect = function(idx) {
        selectedIdx = idx;
        renderContent();
      };
      window._diffToggleZero = function(checked) {
        showZeroPrice = checked;
        renderContent();
      };
      window._diffSetGroup = async function(mode) {
        if (mode === groupMode && !loading) return;
        groupMode = mode;
        await fetchData(mode);
      };

      // Initial fetch
      await fetchData("all");
    }'''

html = html[:idx_start] + NEW_RENDER_DIFF + html[idx_end:]

# ═══════════════════════════════════════
# 3. Update description text
# ═══════════════════════════════════════
html = html.replace(
    'Last 50 snapshots (every 5 min). SFL values from P2P prices + Betty coins + gem exchange.',
    'SFL values from P2P prices + Betty coins + gem exchange. Group by hours/days/weeks/months/years.'
)

with open(REAL, 'w', encoding='utf-8') as f:
    f.write(html)

print("OK: Diff grouping added")
print(f"File size: {len(html)} chars")
