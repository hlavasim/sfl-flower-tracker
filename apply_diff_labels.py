#!/usr/bin/env python3
"""Add bar labels (time/date below) and SFL values (on bar) to diff chart"""

REAL = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'

with open(REAL, 'r', encoding='utf-8') as f:
    html = f.read()

# ═══════════════════════════════════════
# 1. CSS: Add bottom padding to chart-wrap for labels
# ═══════════════════════════════════════
html = html.replace(
    '''.diff-chart-wrap {
      position: relative;
      overflow-x: auto;
      padding: 12px 0;
    }''',
    '''.diff-chart-wrap {
      position: relative;
      overflow-x: auto;
      padding: 12px 0 40px 0;
    }'''
)

# ═══════════════════════════════════════
# 2. CSS: Make bars overflow-visible for value labels
# ═══════════════════════════════════════
html = html.replace(
    '''.diff-bar {
      width: 14px;
      transition: opacity 0.15s;
      min-height: 2px;
    }''',
    '''.diff-bar {
      width: 14px;
      transition: opacity 0.15s;
      min-height: 2px;
      position: relative;
      overflow: visible;
    }'''
)

# ═══════════════════════════════════════
# 3. CSS: Update .diff-bar-label + add .diff-bar-val
# ═══════════════════════════════════════
html = html.replace(
    '''.diff-bar-label {
      font-size: 0.375rem;
      color: var(--text-dim);
      position: absolute;
      bottom: -14px;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      max-height: 40px;
      overflow: hidden;
    }''',
    '''.diff-bar-label {
      position: absolute;
      top: calc(100% + 2px);
      left: 50%;
      font-size: 5px;
      color: var(--text-dim);
      white-space: nowrap;
      writing-mode: vertical-rl;
      max-height: 36px;
      overflow: hidden;
      transform: translateX(-50%);
      line-height: 1;
    }
    .diff-bar-val {
      position: absolute;
      font-size: 5px;
      writing-mode: vertical-rl;
      white-space: nowrap;
      pointer-events: none;
      left: 50%;
      transform: translateX(-50%);
      line-height: 1;
      max-height: 70px;
      overflow: hidden;
    }
    .diff-bar.positive .diff-bar-val {
      bottom: calc(100% + 1px);
      color: rgba(74, 222, 128, 0.85);
    }
    .diff-bar.negative .diff-bar-val {
      top: calc(100% + 1px);
      color: rgba(248, 113, 113, 0.85);
    }'''
)

# ═══════════════════════════════════════
# 4. JS: Add helper functions + modify bar rendering
# ═══════════════════════════════════════

# 4a. Add shortBarLabel and fmtBarVal before the bar loop
OLD_CHART = '''        // Bar chart
        const maxAbs = Math.max(...processed.map(p => Math.abs(p.netSfl)), 0.01);
        const barW = processed.length > 120 ? 6 : processed.length > 60 ? 10 : processed.length > 30 ? 14 : 18;'''

NEW_CHART = r'''        // Bar chart helpers
        function shortBarLabel(t, mode) {
          if (mode === "all") return t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          if (mode === "hours") { const h = t.getUTCHours(); return (h < 10 ? "0" : "") + h + ":00"; }
          if (mode === "days") return t.getUTCDate() + "/" + (t.getUTCMonth() + 1);
          if (mode === "weeks") return "W" + getISOWeek(t);
          if (mode === "months") return t.toLocaleDateString([], { month: "short" });
          if (mode === "years") return t.getUTCFullYear().toString();
          return "";
        }
        function fmtBarVal(v) {
          const a = Math.abs(v);
          if (a < 0.01) return "";
          const s = v >= 0 ? "+" : "";
          if (a >= 1000) return s + (v / 1000).toFixed(1) + "k";
          if (a >= 100) return s + Math.round(v);
          if (a >= 10) return s + v.toFixed(1);
          return s + v.toFixed(2);
        }

        // Bar chart
        const maxAbs = Math.max(...processed.map(p => Math.abs(p.netSfl)), 0.01);
        const barW = processed.length > 120 ? 6 : processed.length > 60 ? 10 : processed.length > 30 ? 14 : 18;'''

assert OLD_CHART in html, "Chart section not found"
html = html.replace(OLD_CHART, NEW_CHART)

# 4b. Replace the bar loop to include val + label
OLD_LOOP = r'''        for (let i = 0; i < processed.length; i++) {
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
        }'''

NEW_LOOP = r'''        const labelEvery = processed.length > 100 ? 6 : processed.length > 60 ? 4 : processed.length > 30 ? 2 : 1;
        const valEvery = barW >= 14 ? 1 : barW >= 10 ? 2 : barW >= 6 ? 3 : 5;

        for (let i = 0; i < processed.length; i++) {
          const p = processed[i];
          const pct = Math.min(Math.max(Math.abs(p.netSfl) / maxAbs * 90, 2), 90);
          const sel = i === selectedIdx ? " selected" : "";
          const tLabel = periodLabel(p.time, groupMode);
          const isPositive = p.netSfl >= 0;
          const snapInfo = p.count > 1 ? ` (${p.count} snapshots)` : "";
          const valTxt = (i % valEvery === 0) ? fmtBarVal(p.netSfl) : "";
          const barValHtml = valTxt ? `<span class="diff-bar-val">${valTxt}</span>` : "";
          const showLbl = (i % labelEvery === 0);
          const lblHtml = showLbl ? `<div class="diff-bar-label">${shortBarLabel(p.time, groupMode)}</div>` : "";
          const posBar = isPositive ? `<div class="diff-bar positive" style="height:${pct}%;width:${barW - 4}px">${barValHtml}</div>` : "";
          const negBar = !isPositive ? `<div class="diff-bar negative" style="height:${pct}%;width:${barW - 4}px">${barValHtml}</div>` : "";
          out += `<div class="diff-bar-wrap${sel}" style="width:${barW}px" onclick="window._diffSelect(${i})" title="${escHTML(tLabel)}: ${p.netSfl >= 0 ? '+' : ''}${p.netSfl.toFixed(2)} SFL${snapInfo}">
            <div class="diff-bar-top">${posBar}</div>
            <div class="diff-bar-bot">${negBar}</div>
            ${lblHtml}
          </div>`;
        }'''

assert OLD_LOOP in html, "Bar loop not found"
html = html.replace(OLD_LOOP, NEW_LOOP)

with open(REAL, 'w', encoding='utf-8') as f:
    f.write(html)

print("OK: Bar labels + SFL values added to diff chart")
print(f"File size: {len(html)} chars")
