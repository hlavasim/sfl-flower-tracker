#!/usr/bin/env python3
"""Save diff aggregation + currency settings to localStorage"""

REAL = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'

with open(REAL, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Init state from localStorage
html = html.replace(
    '''      // ── State ──
      let groupMode = "all";
      let currencyMode = "sfl";
      let showZeroPrice = true;''',
    '''      // ── State ──
      let groupMode = localStorage.getItem("sfl_diff_group") || "all";
      let currencyMode = localStorage.getItem("sfl_diff_currency") || "sfl";
      let showZeroPrice = true;'''
)

# 2. Save groupMode on change
html = html.replace(
    '''      window._diffSetGroup = async function(mode) {
        if (mode === groupMode && !loading) return;
        groupMode = mode;
        await fetchData(mode);
      };''',
    '''      window._diffSetGroup = async function(mode) {
        if (mode === groupMode && !loading) return;
        groupMode = mode;
        localStorage.setItem("sfl_diff_group", mode);
        await fetchData(mode);
      };'''
)

# 3. Save currencyMode on change
html = html.replace(
    '''      window._diffSetCurrency = function(mode) {
        if (mode === currencyMode) return;
        currencyMode = mode;
        renderContent();
      };''',
    '''      window._diffSetCurrency = function(mode) {
        if (mode === currencyMode) return;
        currencyMode = mode;
        localStorage.setItem("sfl_diff_currency", mode);
        renderContent();
      };'''
)

# 4. Initial fetch uses saved groupMode instead of hardcoded "all"
html = html.replace(
    '      // Initial fetch\n      await fetchData("all");',
    '      // Initial fetch\n      await fetchData(groupMode);'
)

with open(REAL, 'w', encoding='utf-8') as f:
    f.write(html)

print("OK: localStorage persistence for diff groupMode + currencyMode")
print(f"File size: {len(html)} chars")
