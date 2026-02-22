# SFL Collection Tracker

A pixel-art collection tracker for [Sunflower Land](https://sunflower-land.com/).

**Live:** [sunflower.sajmonium.quest](https://sunflower.sajmonium.quest)

## Features

- **Flower Tracker** — 51 flowers, dependency chains, grow planner, boost detection, Petal Blessed tracking
- **Dolls Tracker** — 24 dolls, configurable tracking, ingredient breakdown
- **Crustaceans Tracker** — Crab Pot / Mariner Pot, chum requirements
- **Bumpkin XP Calculator** — recipes, cooking boosts, days to level 200
- **Treasury** — farm value in SFL/USD/BTC, 5 categories, pie chart
- **Power Analyzer** — all boost NFTs, ROI calculation, owned vs missing
- **Sales Tracker** — active listings, offers, price comparison

## Architecture

```
flowers.html          <- source file (single-file app)
index.html            <- deploy copy (= flowers.html)
api/proxy.js          <- Vercel serverless CORS proxy + Redis caching
api/track.js          <- Usage tracking (Upstash Redis)
api/stats.js          <- Stats endpoint
build_image_map.js    <- Script to regenerate ITEM_IMAGE_MAP (see below)
```

## Deploy

```bash
cp flowers.html index.html
npx vercel --yes         # preview
npx vercel --yes --prod  # production
git add -A && git commit -m "description" && git push
```

---

## Item Image Map — Refresh Procedure

All item images are sourced from the **official sunflower-land GitHub repo** (`src/assets/`), not from sfl.world (which returns placeholder question marks for many items).

The app contains `ITEM_IMAGE_MAP` (~1070 entries) mapping item names to raw GitHub URLs:
```
https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/assets/sfts/easter/easter_bunny.gif
```

### When to refresh

When the game adds new collectibles, wearables, flowers, or other items and their images appear in the [sunflower-land repo assets](https://github.com/sunflower-land/sunflower-land/tree/main/src/assets).

### Step 1: Crawl the full asset tree

```bash
curl -s "https://api.github.com/repos/sunflower-land/sunflower-land/git/trees/main?recursive=1" \
  -H "Accept: application/vnd.github.v3+json" | \
  python3 -c "
import json, sys
data = json.load(sys.stdin)
for item in data.get('tree', []):
    p = item['path']
    if p.startswith('src/assets/') and item['type'] == 'blob':
        print(p)
" > all_github_assets.txt
```

This gives ~2290 files across `sfts/`, `flowers/`, `fish/`, `food/`, `wearables/`, etc.

### Step 2: Get the authoritative name-to-file mapping

The game source `images.ts` has the official mapping:

```bash
curl -sL "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/features/game/types/images.ts" \
  > images_ts_raw.txt
```

Key patterns in this file:
- **Imports:** `import easterBunny from "assets/sfts/easter/easter_bunny.gif"`
- **Mapping:** `"Easter Bunny": { image: easterBunny, ... }`

### Step 3: Build the map

1. Parse all `import` statements from `images.ts` -> build `variableName -> filePath` map
2. Parse all `ITEM_DETAILS` entries -> build `"Item Name" -> variableName` map
3. Combine: `"Item Name" -> filePath` -> full GitHub raw URL
4. For items NOT in `images.ts`, try filename heuristics:
   - `"Red Pansy"` -> `flowers/red_pansy.webp`
   - `"Angler Doll"` -> `sfts/dolls/angler_doll.webp`
   - Wearables: use NFT ID -> `wearables/{id}.webp`
5. Verify all URLs: `curl -sI {url}` (check 200 vs 404)

### Step 4: Replace in flowers.html

Find the `const ITEM_IMAGE_MAP = {` block and replace with the new entries:

```javascript
const GITHUB_ASSETS = "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/assets";
const ITEM_IMAGE_MAP = {
  "Item Name": GITHUB_ASSETS+"/path/to/file.webp",
  ...
};
```

Items not in the map fall back to `sfl.world/img/source/{name}.png` via `getItemIcon()`.

### Step 5: Deploy

```bash
cp flowers.html index.html
npx vercel --yes         # preview first, verify
npx vercel --yes --prod  # then production
```

### Asset directory structure

```
src/assets/
  animals/chickens/    <- chicken boost NFTs (speed_chicken.webp, etc.)
  crops/{name}/        <- crop sprites (proc_sprite.png only)
  decorations/         <- lanterns, banners, tiles
  fish/                <- fish images
  flowers/             <- all flower + seed images (.webp)
  food/                <- cooked food + cakes
  fruit/{name}/        <- fruit + seed images
  icons/               <- UI icons, skill icons
  resources/           <- gold_ore, iron_ore, honey, oil, etc.
  sfts/                <- main collectibles directory
    aoe/               <- area-of-effect items
    bears/             <- bear collectibles
    dolls/             <- all doll images
    easter/            <- easter items
    flags/             <- country flags
    mom/               <- observatory, etc.
  wearables/           <- by NFT ID: {id}.webp
```

### Naming conventions

- **Collectibles:** lowercase_underscores: `flower_fox.webp`
- **Wearables:** numeric NFT ID: `27.webp`, `501.webp`
- **Flowers:** lowercase_underscores: `red_pansy.webp`
- **Preferred format:** `.webp` > `.png` > `.gif`

### Tricky mappings (name != simple filename conversion)

| Item Name | Actual Path |
|---|---|
| Woody the Beaver | `sfts/beaver.gif` |
| Foreman Beaver | `sfts/construction_beaver.gif` |
| Undead Rooster | `animals/chickens/undead_chicken.webp` |
| Easter Bunny | `sfts/easter/easter_bunny.gif` |
| Super Star | `sfts/starfish_marvel.webp` |
| Black Bearry | `sfts/black_bear.gif` |
| Gnome | `decorations/scarlet.png` |
| Goblin Crown | `sfts/goblin_crown.png` |
| Astronaut Sheep | `sfts/sheep_astronaut.webp` |
| Frozen Cow | `sfts/frozen_mutant_cow.webp` |
| Longhorn Cowfish | `fish/cow_fish.webp` |
| Poseidon | `sfts/poseidon_fish.webp` |

---

## Environment Variables (Vercel)

- `SFL_API_KEY` — API key for sfl.world proxied requests
- `KV_REST_API_URL` — Upstash Redis URL
- `KV_REST_API_TOKEN` — Upstash Redis token
- `STATS_SECRET` — Secret for stats endpoint

## Author

Created by **0xStableFarmer** — Farm #155498
