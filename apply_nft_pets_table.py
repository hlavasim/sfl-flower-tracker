#!/usr/bin/env python3
"""Add NFT Pets Collection table to Pets page.
Shows all 7 NFT breeds, owned/missing status, level, energy, unique resources.
"""

REAL = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'

with open(REAL, 'r', encoding='utf-8') as f:
    html = f.read()

# ═══════════════════════════════════════
# 1. Add CSS for NFT pets table (before </style>)
# ═══════════════════════════════════════
old_css = '    .dash-all-done .icon { font-size:2rem; margin-bottom:8px; }\n  </style>'
new_css = '''    .dash-all-done .icon { font-size:2rem; margin-bottom:8px; }
    .nft-breed-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:10px; }
    .nft-breed-card { padding:10px 12px; border:2px solid #333; background:rgba(0,0,0,0.3); display:flex; flex-direction:column; gap:6px; }
    .nft-breed-card.owned { border-color:var(--green); background:rgba(46,160,67,0.08); }
    .nft-breed-card.missing { border-color:#555; opacity:0.75; }
    .nft-breed-header { display:flex; justify-content:space-between; align-items:center; }
    .nft-breed-name { font-size:0.75rem; font-weight:bold; }
    .nft-breed-badge { padding:1px 8px; border-radius:8px; font-size:0.5625rem; font-weight:bold; }
    .nft-breed-badge.owned { background:rgba(46,160,67,0.3); color:var(--green); }
    .nft-breed-badge.missing { background:rgba(220,60,60,0.25); color:#e55; }
    .nft-breed-stats { font-size:0.625rem; color:var(--text-secondary); display:flex; gap:10px; flex-wrap:wrap; }
    .nft-breed-resources { font-size:0.5625rem; color:var(--text-dim); line-height:1.5; }
    .nft-breed-resources .unique { color:var(--lily); font-weight:bold; }
    .nft-breed-resources .moonfur { color:var(--sunpetal); }
  </style>'''
assert old_css in html, "CSS anchor not found"
html = html.replace(old_css, new_css)

# ═══════════════════════════════════════
# 2. Add NFT_BREED_TYPES constant (after PET_FETCH_DATA)
# ═══════════════════════════════════════
old_after_fetch = '''    // Cumulative XP thresholds: index 0 = Lv 1, index 29 = Lv 30'''
new_after_fetch = '''    const NFT_BREED_TYPES = ["Dragon", "Phoenix", "Griffin", "Ram", "Warthog", "Wolf", "Bear"];

    // Cumulative XP thresholds: index 0 = Lv 1, index 29 = Lv 30'''
assert old_after_fetch in html, "PET_XP_TABLE anchor not found"
html = html.replace(old_after_fetch, new_after_fetch)

# ═══════════════════════════════════════
# 3. Add NFT collection table in renderPets, after summary bar
# ═══════════════════════════════════════
# Insert the NFT breed grid after the summary bar and before the resource market
old_resource_market = '''      // Collect all unique fetchable resources with prices
      const resMap = new Map();'''
new_resource_market = r'''      // ── NFT Pets Collection ──
      const ownedNftBreeds = {};
      for (const [id, pet] of Object.entries(nftPets)) {
        const breed = pet.traits?.type || "Unknown";
        if (NFT_BREED_TYPES.includes(breed)) {
          const xp = pet.experience || 0;
          ownedNftBreeds[breed] = { id, level: petLevel(xp), xp, energy: pet.energy || 0 };
        }
      }
      const ownedBreedCount = Object.keys(ownedNftBreeds).length;

      content += `<div class="pixel-panel" style="padding:12px 14px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px">
          <span class="pixel-font" style="font-size:0.6875rem;color:var(--lily);font-weight:bold">NFT PETS COLLECTION</span>
          <span class="pixel-font" style="font-size:0.625rem;color:var(--text-secondary)">${ownedBreedCount} / ${NFT_BREED_TYPES.length}</span>
        </div>
        <div class="nft-breed-grid">`;

      for (const breed of NFT_BREED_TYPES) {
        const owned = ownedNftBreeds[breed];
        const cls = owned ? "nft-breed-card owned" : "nft-breed-card missing";
        const badgeCls = owned ? "nft-breed-badge owned" : "nft-breed-badge missing";
        const badgeText = owned ? "OWNED" : "MISSING";
        const fetchData = PET_FETCH_DATA[breed] || [];

        // Find unique Lv25 resource and Moonfur
        const lv25 = fetchData.find(f => f.level === 25);
        const moonfur = fetchData.find(f => f.res === "Moonfur");

        // Build resource list showing what this breed can fetch
        const resLines = fetchData.map(f => {
          const lock = owned && owned.level >= f.level ? "\u2705" : "\uD83D\uDD12";
          let cls = "";
          if (f.level === 25) cls = " unique";
          else if (f.res === "Moonfur") cls = " moonfur";
          return `${lock} <span class="${cls}">${escHTML(f.res)}</span> (Lv${f.level}, ${f.energy}\u26A1)`;
        }).join(" &middot; ");

        content += `<div class="${cls}">
          <div class="nft-breed-header">
            <span class="nft-breed-name">${escHTML(breed)}</span>
            <span class="${badgeCls}">${badgeText}</span>
          </div>`;

        if (owned) {
          content += `<div class="nft-breed-stats">
            <span>Pet #${escHTML(owned.id)}</span>
            <span>Lv ${owned.level}</span>
            <span>${owned.energy.toLocaleString()} \u26A1</span>
          </div>`;
        } else {
          content += `<div class="nft-breed-stats"><span style="color:#e55">Not owned \u2014 buy from marketplace</span></div>`;
        }

        content += `<div class="nft-breed-resources">${resLines}</div>`;

        if (lv25) {
          const uniqueLabel = owned && owned.level >= 25 ? "\u2705 Unlocked" : `\uD83D\uDD12 Lv25 required`;
          content += `<div style="font-size:0.5625rem;color:var(--lily)">Unique: <b>${escHTML(lv25.res)}</b> \u2014 ${uniqueLabel}</div>`;
        }

        content += `</div>`;
      }

      content += `</div></div>`;

      // Collect all unique fetchable resources with prices
      const resMap = new Map();'''
assert old_resource_market in html, "resource market anchor not found"
html = html.replace(old_resource_market, new_resource_market)

with open(REAL, 'w', encoding='utf-8') as f:
    f.write(html)

print("OK: Added NFT Pets Collection table (7 breeds, owned/missing, resources)")
print(f"File size: {len(html)} chars")
