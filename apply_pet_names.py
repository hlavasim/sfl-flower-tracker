#!/usr/bin/env python3
"""NFT pets: use breed name instead of 'Pet #id' for display."""

REAL = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'

with open(REAL, 'r', encoding='utf-8') as f:
    html = f.read()

old = '        pets.push({ name: `Pet #${id}`, petType, species: petType, level, xp, energy, foods, isNft: true, nftId: id });'
new = '        pets.push({ name: petType, petType, species: petType, level, xp, energy, foods, isNft: true, nftId: id });'
assert old in html, "NFT pet name anchor not found"
html = html.replace(old, new)

with open(REAL, 'w', encoding='utf-8') as f:
    f.write(html)

print("OK: NFT pets now named by breed")
print(f"File size: {len(html)} chars")
