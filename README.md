# SFL Collection Tracker

A pixel-art collection tracker for [Sunflower Land](https://sunflower-land.com/) — track your flowers, dolls, and crustaceans progress.

**Live:** [sajmonium.quest](https://www.sajmonium.quest)

## Features

### Flower Tracker
- All 51 flower types with dependency chains
- Auto-detected grow time boosts (Flower Crown, Moth Shrine, Flower Fox, Blossom Hourglass, Blooming Boost, Flower Power, Flowery Abode)
- Currently Growing panel with live countdown timers
- Petal Blessed cooldown tracking (incl. Luna's Crescent half-cooldown)
- Clickable rows to expand full dependency chains
- Seed group sections (Sunpetal, Bloom, Seasonal, Lily) with estimated completion time

### Dolls Tracker
- 24 dolls with ingredient requirements
- Configurable tracking (choose which dolls to track)
- Currently Crafting display from crafting box
- Ingredient breakdown with have/need counts

### Crustaceans Tracker
- 16 crustaceans in Crab Pot (4h) and Mariner Pot (8h) groups
- Chum requirements with alternative options
- Auto-detected trap count

### General
- Single-page app with `?page=` client-side routing (hub/flowers/dolls/crustaceans)
- API key stored securely in localStorage (never in URL)
- Mobile-friendly responsive design
- Pixel-art UI theme

## Setup

1. Get your **API Key** from the game: `Settings > General > API Key`
2. Get your **Farm ID** from the game: `Settings > Farm ID`
3. Visit [sajmonium.quest](https://www.sajmonium.quest), enter your details, click LOAD
4. Bookmark the page — Farm ID and settings are saved in the URL, API key in your browser's localStorage

## Architecture

```
flowers.html      ← source file (single-file app, ~2500 lines)
index.html        ← deploy copy (identical to flowers.html)
api/proxy.js      ← Vercel serverless function (CORS proxy)
vercel.json       ← Vercel routing config
```

### Why a CORS proxy?

The SFL API (`api.sunflower-land.com`) requires an `x-api-key` header but doesn't support CORS. Free CORS proxies (corsproxy.io, allorigins.win) can't forward custom headers. The `/api/proxy` endpoint accepts `?url=` and `?key=` params and forwards the key as an `x-api-key` header server-side.

### Key technical details

- **SFL API:** `https://api.sunflower-land.com/community/farms/{id}` — requires `x-api-key` header (401 without)
- **Flower dependency graph:** circular dependency Red Cosmos ↔ Yellow Daffodil handled with a `visiting` Set
- **Boost detection:** reads `farm.bumpkin.equipped` (wearables), `farm.collectibles` + `farm.home.collectibles` (collectibles), `farm.bumpkin.skills` (skills); temp collectibles check placement time + duration
- **Seed times:** `baseSeconds × boostMultiplier` — boosts are multiplicative (e.g. Flower Crown ×0.5, Flower Fox ×0.9 → combined ×0.45)
- **Petal Blessed:** reads `farm.bumpkin.previousPowerUseAt["Petal Blessed"]`, 96h cooldown (48h with Luna's Crescent)
- **Doll tracking config:** stored in localStorage (`sfl_tracked_dolls`)

## Development

All app code lives in `flowers.html`. Edit that file, then:

```bash
# Copy source to deploy files
cp flowers.html index.html

# Deploy to Vercel
npx vercel --yes --prod

# Commit and push
git add -A && git commit -m "description" && git push
```

## Deployment

Hosted on [Vercel](https://vercel.com/) with custom domain `sajmonium.quest`.

The Vercel project expects:
- `index.html` at root (the app)
- `api/proxy.js` (serverless function for CORS proxy)
- `vercel.json` (rewrite rules)

## Bugs & Feedback

[Open an issue](https://github.com/hlavasim/sfl-flower-tracker/issues)

## Author

Created by **0xStableFarmer** — Farm #155498

If this tool helped you, consider sending a flower or some ETH:
`0x5F10Ee6FB845785F06766b18C135CDaaf1776EEF` (ETH / Polygon / Base / Arbitrum)
