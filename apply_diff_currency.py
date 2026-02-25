#!/usr/bin/env python3
"""Add SFL/USD/CZK currency toggle to diff page"""

REAL = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'

with open(REAL, 'r', encoding='utf-8') as f:
    html = f.read()

# ═══════════════════════════════════════
# 1. Add currency state + fetch USD/CZK rate
# ═══════════════════════════════════════

# Add sflToUsd, usdToCzk variables alongside existing vars
html = html.replace(
    '''      let p2pPrices = {};
      let coinsPerSFL = 0;
      let gemsPerSFL = 0;
      const warnings = [];''',
    '''      let p2pPrices = {};
      let coinsPerSFL = 0;
      let gemsPerSFL = 0;
      let sflToUsd = 0;
      let usdToCzk = 0;
      const warnings = [];'''
)

# Add 3rd parallel fetch for USD/CZK
html = html.replace(
    '''      const [priceRes, exchangeRes] = await Promise.all([
        fetchRetry(proxyUrl("https://sfl.world/api/v1/prices"), "P2P prices"),
        fetchRetry(proxyUrl("https://sfl.world/api/v1.1/exchange"), "Exchange rates"),
      ]);''',
    '''      const [priceRes, exchangeRes, czkRes] = await Promise.all([
        fetchRetry(proxyUrl("https://sfl.world/api/v1/prices"), "P2P prices"),
        fetchRetry(proxyUrl("https://sfl.world/api/v1.1/exchange"), "Exchange rates"),
        fetchRetry("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", "USD/CZK"),
      ]);'''
)

# Extract sflToUsd from exchange response (add after existing exchange processing)
html = html.replace(
    '''      if (exchangeRes.ok) {
        const ed = exchangeRes.data;
        const betty = computeBettyRate(p2pPrices);
        coinsPerSFL = betty.rate || 320;
        const gemTiers = Object.values(ed?.gems || {});
        const bestGemTier = gemTiers.reduce((best, t) => (!best || (t.gem / t.sfl) > (best.gem / best.sfl)) ? t : best, null);
        gemsPerSFL = bestGemTier ? (bestGemTier.gem / (bestGemTier.sfl * 0.7)) : 0;
      } else { warnings.push(`Exchange rates: ${exchangeRes.error}`); }''',
    '''      if (exchangeRes.ok) {
        const ed = exchangeRes.data;
        sflToUsd = ed?.sfl?.usd || 0;
        const betty = computeBettyRate(p2pPrices);
        coinsPerSFL = betty.rate || 320;
        const gemTiers = Object.values(ed?.gems || {});
        const bestGemTier = gemTiers.reduce((best, t) => (!best || (t.gem / t.sfl) > (best.gem / best.sfl)) ? t : best, null);
        gemsPerSFL = bestGemTier ? (bestGemTier.gem / (bestGemTier.sfl * 0.7)) : 0;
      } else { warnings.push(`Exchange rates: ${exchangeRes.error}`); }

      if (czkRes.ok) {
        usdToCzk = czkRes.data?.usd?.czk || 0;
      }'''
)

# ═══════════════════════════════════════
# 2. Add currencyMode state variable
# ═══════════════════════════════════════
html = html.replace(
    '''      // ── State ──
      let groupMode = "all";
      let showZeroPrice = true;''',
    '''      // ── State ──
      let groupMode = "all";
      let currencyMode = "sfl";
      let showZeroPrice = true;'''
)

# ═══════════════════════════════════════
# 3. Add currency helpers + selector to renderContent
# ═══════════════════════════════════════

# Add helpers at start of renderContent, and currency selector after group selector
html = html.replace(
    '''      function renderContent() {
        let out = renderGroupSelector();''',
    r'''      function renderCurrencySelector() {
        const modes = [
          { id: "sfl", label: "SFL" },
          { id: "usd", label: "USD" },
          { id: "czk", label: "CZK" },
        ];
        let s = `<div class="diff-group-selector" style="gap:3px">`;
        for (const m of modes) {
          s += `<button class="diff-group-btn pixel-font${currencyMode === m.id ? ' active' : ''}" style="padding:4px 10px;font-size:0.5rem" onclick="window._diffSetCurrency('${m.id}')">${m.label}</button>`;
        }
        s += `</div>`;
        return s;
      }

      function getCurMult() {
        if (currencyMode === "usd") return sflToUsd;
        if (currencyMode === "czk") return sflToUsd * usdToCzk;
        return 1;
      }
      function getCurIcon(size) {
        if (currencyMode === "sfl") return sflIcon(size || "0.85em");
        const sym = currencyMode === "usd" ? "$" : "K\u010d";
        return `<span style="font-size:${size || '0.85em'}">${sym}</span>`;
      }
      function getCurLabel() {
        return currencyMode === "sfl" ? "SFL" : currencyMode === "usd" ? "USD" : "CZK";
      }
      function fmtCur(sflVal, dec) {
        const v = sflVal * getCurMult();
        const d = dec !== undefined ? dec : (currencyMode === "sfl" ? 2 : 2);
        return v.toFixed(d);
      }
      function fmtCurSigned(sflVal, dec) {
        const v = sflVal * getCurMult();
        const d = dec !== undefined ? dec : 2;
        return (v >= 0 ? "+" : "") + v.toFixed(d);
      }

      function renderContent() {
        let out = renderGroupSelector();
        out += renderCurrencySelector();'''
)

# ═══════════════════════════════════════
# 4. Replace stat cards to use currency
# ═══════════════════════════════════════
html = html.replace(
    '''        out += `<div class="diff-stat-cards">
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
          </div>''',
    '''        const _ci = getCurIcon("0.85em");

        out += `<div class="diff-stat-cards">
          <div class="pixel-panel diff-stat-card">
            <div class="diff-stat-label">NET CHANGE</div>
            <div class="diff-stat-value" style="color:${totalNet >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtCurSigned(totalNet)} ${_ci}</div>
          </div>
          <div class="pixel-panel diff-stat-card">
            <div class="diff-stat-label">GAINS</div>
            <div class="diff-stat-value" style="color:var(--green)">+${fmtCur(totalGain)} ${_ci}</div>
          </div>
          <div class="pixel-panel diff-stat-card">
            <div class="diff-stat-label">LOSSES</div>
            <div class="diff-stat-value" style="color:var(--red)">${fmtCur(totalLoss)} ${_ci}</div>
          </div>'''
)

# ═══════════════════════════════════════
# 5. Replace chart label
# ═══════════════════════════════════════
html = html.replace(
    "        const chartLabel = `SFL VALUE CHANGE PER ${singularMode}`;",
    "        const chartLabel = `${getCurLabel()} VALUE CHANGE PER ${singularMode}`;"
)

# ═══════════════════════════════════════
# 6. Replace fmtBarVal to use currency
# ═══════════════════════════════════════
html = html.replace(
    '''        function fmtBarVal(v) {
          const a = Math.abs(v);
          if (a < 0.005) return "0";
          const s = v >= 0 ? "+" : "";
          if (a >= 1000) return s + (v / 1000).toFixed(1) + "k";
          if (a >= 100) return s + Math.round(v);
          if (a >= 10) return s + v.toFixed(1);
          return s + v.toFixed(2);
        }''',
    '''        function fmtBarVal(sflV) {
          const v = sflV * getCurMult();
          const a = Math.abs(v);
          if (a < 0.005) return "0";
          const s = v >= 0 ? "+" : "";
          if (a >= 1000) return s + (v / 1000).toFixed(1) + "k";
          if (a >= 100) return s + Math.round(v);
          if (a >= 10) return s + v.toFixed(1);
          return s + v.toFixed(2);
        }'''
)

# ═══════════════════════════════════════
# 7. Replace bar tooltip
# ═══════════════════════════════════════
html = html.replace(
    '''          out += `<div class="diff-bar-wrap${sel}" style="width:${barW}px" onclick="window._diffSelect(${i})" title="${escHTML(tLabel)}: ${p.netSfl >= 0 ? '+' : ''}${p.netSfl.toFixed(2)} SFL${snapInfo}">''',
    '''          out += `<div class="diff-bar-wrap${sel}" style="width:${barW}px" onclick="window._diffSelect(${i})" title="${escHTML(tLabel)}: ${fmtCurSigned(p.netSfl)} ${getCurLabel()}${snapInfo}">'''
)

# ═══════════════════════════════════════
# 8. Replace detail panel header
# ═══════════════════════════════════════
html = html.replace(
    '''              <div class="diff-detail-net" style="color:${p.netSfl >= 0 ? 'var(--green)' : 'var(--red)'}">
                ${p.netSfl >= 0 ? '+' : ''}${p.netSfl.toFixed(4)} ${sflIcon("0.85em")}
              </div>''',
    '''              <div class="diff-detail-net" style="color:${p.netSfl >= 0 ? 'var(--green)' : 'var(--red)'}">
                ${fmtCurSigned(p.netSfl, 4)} ${getCurIcon("0.85em")}
              </div>'''
)

# ═══════════════════════════════════════
# 9. Replace detail table header + values
# ═══════════════════════════════════════
html = html.replace(
    '''              <thead><tr><th>Item</th><th>Change</th><th>Unit Price</th><th>SFL Value</th></tr></thead><tbody>`;''',
    '''              <thead><tr><th>Item</th><th>Change</th><th>Unit Price</th><th>${getCurLabel()} Value</th></tr></thead><tbody>`;'''
)

# Unit price
html = html.replace(
    '''              const unitPrice = it.category === "sfl" ? "1.0000" :
                it.delta !== 0 && it.sflValue !== 0 ? Math.abs(it.sflValue / it.delta).toFixed(4) : "\\u2014";''',
    '''              const _m = getCurMult();
              const unitPrice = it.category === "sfl" ? _m.toFixed(4) :
                it.delta !== 0 && it.sflValue !== 0 ? Math.abs(it.sflValue * _m / it.delta).toFixed(4) : "\\u2014";'''
)

# SFL value in table
html = html.replace(
    '''              const valStr = it.sflValue !== 0 ? (it.sflValue >= 0 ? "+" : "") + it.sflValue.toFixed(4) : "\\u2014";''',
    '''              const valStr = it.sflValue !== 0 ? fmtCurSigned(it.sflValue, 4) : "\\u2014";'''
)

# ═══════════════════════════════════════
# 10. Add _diffSetCurrency global handler
# ═══════════════════════════════════════
html = html.replace(
    '''      window._diffSetGroup = async function(mode) {
        if (mode === groupMode && !loading) return;
        groupMode = mode;
        await fetchData(mode);
      };''',
    '''      window._diffSetGroup = async function(mode) {
        if (mode === groupMode && !loading) return;
        groupMode = mode;
        await fetchData(mode);
      };
      window._diffSetCurrency = function(mode) {
        if (mode === currencyMode) return;
        currencyMode = mode;
        renderContent();
      };'''
)

# ═══════════════════════════════════════
# 11. Also need maxAbs to use currency multiplier for correct bar scaling
# ═══════════════════════════════════════
html = html.replace(
    '''        const maxAbs = Math.max(...processed.map(p => Math.abs(p.netSfl)), 0.01);''',
    '''        const _cm = getCurMult();
        const maxAbs = Math.max(...processed.map(p => Math.abs(p.netSfl * _cm)), 0.01);'''
)

# And pct calculation needs to use converted value
html = html.replace(
    '''          const pct = Math.min(Math.max(Math.abs(p.netSfl) / maxAbs * 90, 2), 90);''',
    '''          const pct = Math.min(Math.max(Math.abs(p.netSfl * _cm) / maxAbs * 90, 2), 90);'''
)

with open(REAL, 'w', encoding='utf-8') as f:
    f.write(html)

print("OK: Currency toggle (SFL/USD/CZK) added to diff page")
print(f"File size: {len(html)} chars")
