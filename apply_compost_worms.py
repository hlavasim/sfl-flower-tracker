#!/usr/bin/env python3
"""Fix base worm amounts in COMPOST_RECIPES.
Game source sets worm=1 as frontend placeholder, actual amounts set by backend.
Back-computed from user's farm API data + known skills:
  User skills: Wormy Treat (+1), Composting Revamp (-3) = net -2
  User output: Earthworm 4, Grub 2, Red Wiggler 1
  Base = user + 2: Earthworm 6, Grub 4, Red Wiggler 3
"""

REAL = r'C:\Users\hlava\AppData\Local\Temp\sfl-flower-tracker\flowers.html'

with open(REAL, 'r', encoding='utf-8') as f:
    html = f.read()

# Fix Compost Bin base worm
html = html.replace(
    'outputs: { "Sprout Mix": 10, "Earthworm": 1 },',
    'outputs: { "Sprout Mix": 10, "Earthworm": 6 },'
)

# Fix Turbo Composter base worm
html = html.replace(
    'outputs: { "Fruitful Blend": 3, "Grub": 1 },',
    'outputs: { "Fruitful Blend": 3, "Grub": 4 },'
)

# Fix Premium Composter base worm
html = html.replace(
    'outputs: { "Rapid Root": 10, "Red Wiggler": 1 },',
    'outputs: { "Rapid Root": 10, "Red Wiggler": 3 },'
)

with open(REAL, 'w', encoding='utf-8') as f:
    f.write(html)

print("OK: Fixed base worm amounts (Earthworm 6, Grub 4, Red Wiggler 3)")
print(f"File size: {len(html)} chars")
