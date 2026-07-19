// Inventory of every game data table that exists inline in flowers.html.
// GENERATED — regenerate with the snippet in docs/superpowers/plans/2026-07-16-api-surface-visibility.md
// tests/core/constants.test.mjs re-derives BOTH parts below and FAILS if this drifts.
//
// Two parts, because one scan is not enough:
//  1. the table-shaped scan (const NAME = { … } / [ … ]) — the ~160 game tables;
//  2. a per-name check of every core/data export the table scan cannot see. A scalar
//     like SALT_BASE_YIELD (flowers.html:4842, `const SALT_BASE_YIELD = 10;`) is not
//     table-shaped, so part 1 misses it — yet it IS live inline. Without part 2 it
//     reports as "core" (freed) when it is really "duplicated".
export const TABLE_INVENTORY = [
  {
    "name": "ANIMAL_CAT_MAP",
    "lines": 2
  },
  {
    "name": "ANIMAL_CYCLE_DATA",
    "lines": 5
  },
  {
    "name": "ANIMAL_LEVELS",
    "lines": 5
  },
  {
    "name": "ANIMAL_RESOURCE_DROP",
    "lines": 5
  },
  {
    "name": "BAIT_WORM_YIELD",
    "lines": 2
  },
  {
    "name": "BARN_DELIGHT_RECIPE",
    "lines": 2
  },
  {
    "name": "BARN_DELIGHT_RECIPE_ALT",
    "lines": 2
  },
  {
    "name": "BASE_NODE_COUNTS",
    "lines": 6
  },
  {
    "name": "BASE_STOCK",
    "lines": 18
  },
  {
    "name": "BETTY_RESTOCK_AMOUNT",
    "lines": 8
  },
  {
    "name": "BETTY_SELL_PRICES",
    "lines": 11
  },
  {
    "name": "BOOST_EFFECT_OVERRIDES",
    "lines": 61
  },
  {
    "name": "BOOST_PARSE_RULES",
    "lines": 347
  },
  {
    "name": "BUD_COUNT",
    "lines": 1
  },
  {
    "name": "BUD_AURA_MULTIPLIERS",
    "lines": 2
  },
  {
    "name": "BUD_AURA_NAMES",
    "lines": 2
  },
  {
    "name": "BUD_STEM_BOOSTS",
    "lines": 19
  },
  {
    "name": "BUD_STEM_NAMES",
    "lines": 2
  },
  {
    "name": "BUD_TYPE_BOOSTS",
    "lines": 14
  },
  {
    "name": "BUD_TYPE_NAMES",
    "lines": 2
  },
  {
    "name": "BUMPKIN_DEFAULT_RECIPES",
    "lines": 8
  },
  {
    "name": "BUMPKIN_FLOWER_BONUSES",
    "lines": 16
  },
  {
    "name": "BUMPKIN_GIFTS_DATA",
    "lines": 126
  },
  {
    "name": "BUMPKIN_XP_TABLE",
    "lines": 42
  },
  {
    "name": "CAT_ICON_ITEM",
    "lines": 6
  },
  {
    "name": "CAT_KEYS",
    "lines": 8
  },
  {
    "name": "CAT_LABELS",
    "lines": 7
  },
  {
    "name": "CATEGORY_PRIORITY",
    "lines": 5
  },
  {
    "name": "CHAIN",
    "lines": 7
  },
  {
    "name": "CHANCE_CAT_MAP",
    "lines": 7
  },
  {
    "name": "CHAPTERS",
    "lines": 16
  },
  {
    "name": "CM_TEMP_COOLDOWNS_MS",
    "lines": 6
  },
  {
    "name": "COLORS",
    "lines": 2
  },
  {
    "name": "COMPOST_RECIPES",
    "lines": 29
  },
  {
    "name": "COMPOSTER_NAMES",
    "lines": 2
  },
  {
    "name": "COOKING_BUILDING_EMOJI",
    "lines": 2
  },
  {
    "name": "COOKING_BUILDING_NAMES",
    "lines": 2
  },
  {
    "name": "COOKING_INGREDIENTS",
    "lines": 91
  },
  {
    "name": "COOKING_RECIPES_DATA",
    "lines": 91
  },
  {
    "name": "CRAFTED_INGREDIENT_RECIPES",
    "lines": 26
  },
  {
    "name": "CROP_GROW_DATA",
    "lines": 8
  },
  {
    "name": "CROP_HARVEST_SECONDS",
    "lines": 6
  },
  {
    "name": "CROP_MACHINE_BASIC",
    "lines": 2
  },
  {
    "name": "CROP_MACHINE_MODULE_I",
    "lines": 2
  },
  {
    "name": "CROP_MACHINE_MODULE_II",
    "lines": 2
  },
  {
    "name": "CROP_MACHINE_MODULE_III",
    "lines": 9
  },
  {
    "name": "CROP_TIERS",
    "lines": 5
  },
  {
    "name": "CRUSTACEAN_RECIPES",
    "lines": 18
  },
  {
    "name": "DASH_BUD_ORDER",
    "lines": 5
  },
  {
    "name": "DASH_POWER_COOLDOWNS",
    "lines": 5
  },
  {
    "name": "DASH_WEATHER_ITEMS",
    "lines": 7
  },
  {
    "name": "DASH_WEATHER_PREVENTS",
    "lines": 6
  },
  {
    "name": "DEFAULT_FLOWER_POINTS",
    "lines": 13
  },
  {
    "name": "DEFAULTS",
    "lines": 2
  },
  {
    "name": "DOLL_RECIPES",
    "lines": 25
  },
  {
    "name": "EFF_ORDER",
    "lines": 16
  },
  {
    "name": "EFFICIENCY_RESOURCE_MAP",
    "lines": 8
  },
  {
    "name": "FACTION_SHIELDS",
    "lines": 2
  },
  {
    "name": "FARM_RESOURCE_KEYS",
    "lines": 5
  },
  {
    "name": "FEED_QTY",
    "lines": 2
  },
  {
    "name": "FEED_RECIPES",
    "lines": 6
  },
  {
    "name": "FEED_XP_TABLE",
    "lines": 6
  },
  {
    "name": "FISH_BASE_XP",
    "lines": 12
  },
  {
    "name": "FISH_DATA",
    "lines": 40
  },
  {
    "name": "FISH_MARKET_RECIPES",
    "lines": 26
  },
  {
    "name": "FISH_TIER_MAP",
    "lines": 15
  },
  {
    "name": "FISHING_ROD_COST",
    "lines": 2
  },
  {
    "name": "FLOWER_BOOSTS",
    "lines": 9
  },
  {
    "name": "FLOWER_RECIPES",
    "lines": 61
  },
  {
    "name": "FLOWER_SEED_COIN_COSTS",
    "lines": 5
  },
  {
    "name": "FLOWER_YIELD_BOOSTS",
    "lines": 10
  },
  {
    "name": "FRUIT_GROW_DATA",
    "lines": 4
  },
  {
    "name": "FRUIT_HARVEST_COUNT",
    "lines": 4
  },
  {
    "name": "FRUIT_HARVEST_SECONDS",
    "lines": 4
  },
  {
    "name": "GEAR_BOOST",
    "lines": 2
  },
  {
    "name": "GEAR_BST",
    "lines": 2
  },
  {
    "name": "GIANT_ITEM_COIN_PRICES",
    "lines": 3
  },
  {
    "name": "GIFT_NPC_ORDER",
    "lines": 2
  },
  {
    "name": "GOLDEN_ANIMALS",
    "lines": 2
  },
  {
    "name": "GREENHOUSE_GROW_DATA",
    "lines": 3
  },
  {
    "name": "GREENHOUSE_HARVEST_SECONDS",
    "lines": 3
  },
  {
    "name": "GREENHOUSE_OIL_COSTS",
    "lines": 2
  },
  {
    "name": "ICON",
    "lines": 2
  },
  {
    "name": "ITEM_IMAGE_MAP",
    "lines": 1220
  },
  {
    "name": "ITEM_XP_VALUES",
    "lines": 17
  },
  {
    "name": "KEY_CHEST",
    "lines": 5
  },
  {
    "name": "LAVA_PIT_REQUIREMENTS",
    "lines": 28
  },
  {
    "name": "MERGE_COSTS",
    "lines": 6
  },
  {
    "name": "MINE_CHAIN",
    "lines": 2
  },
  {
    "name": "MINE_RES",
    "lines": 8
  },
  {
    "name": "MINE_TOOL",
    "lines": 7
  },
  {
    "name": "NFT_BREED_TYPES",
    "lines": 2
  },
  {
    "name": "NFT_LISTING_COLLECTIONS",
    "lines": 2
  },
  {
    "name": "NODE_FIXED_PRODUCTS",
    "lines": 3
  },
  {
    "name": "NODE_PRICES",
    "lines": 11
  },
  {
    "name": "NONWOOD",
    "lines": 2
  },
  {
    "name": "PAGES",
    "lines": 2
  },
  {
    "name": "PET_BASE",
    "lines": 2
  },
  {
    "name": "PET_FETCH_DATA",
    "lines": 18
  },
  {
    "name": "PET_FOOD_CATEGORIES",
    "lines": 21
  },
  {
    "name": "PET_FOOD_CATEGORY_FALLBACK",
    "lines": 2
  },
  {
    "name": "PET_LEVEL_PERKS",
    "lines": 23
  },
  {
    "name": "PET_NAME_SPECIES",
    "lines": 9
  },
  {
    "name": "PET_REQUEST_VALUES",
    "lines": 2
  },
  {
    "name": "PET_TYPES",
    "lines": 121
  },
  {
    "name": "PLURAL_FIXES",
    "lines": 12
  },
  {
    "name": "POWER_CATEGORIES",
    "lines": 25
  },
  {
    "name": "POWER_CHAIN",
    "lines": 2
  },
  {
    "name": "POWER_CHAIN_RES",
    "lines": 2
  },
  {
    "name": "POWER_CHAIN_TOOLMAT",
    "lines": 2
  },
  {
    "name": "PRODUCT_LISTS",
    "lines": 6
  },
  {
    "name": "PRODUCT_TO_CATEGORY",
    "lines": 2
  },
  {
    "name": "QUAL_DESC",
    "lines": 6
  },
  {
    "name": "QUAL_ORDER",
    "lines": 7
  },
  {
    "name": "RECIPE_INGREDIENTS",
    "lines": 65
  },
  {
    "name": "RES_FARMKEY",
    "lines": 2
  },
  {
    "name": "RESOURCE_IDS",
    "lines": 9
  },
  {
    "name": "RESOURCE_RECOVERY_MS",
    "lines": 4
  },
  {
    "name": "RESOURCE_RESPAWN_DATA",
    "lines": 9
  },
  {
    "name": "RESTOCK_GEM_COSTS",
    "lines": 2
  },
  {
    "name": "RESTOCK_QUEUE_DEFS",
    "lines": 13
  },
  {
    "name": "ROADMAP_MINING_CATS",
    "lines": 7
  },
  {
    "name": "ROI_QUANT_CATS",
    "lines": 3
  },
  {
    "name": "SALT_BASE_YIELD",
    "lines": 1
  },
  {
    "name": "SALT_RAKE_COST",
    "lines": 2
  },
  {
    "name": "SEASON_CROPS",
    "lines": 6
  },
  {
    "name": "SEED_COSTS",
    "lines": 13
  },
  {
    "name": "SEED_DATA",
    "lines": 9
  },
  {
    "name": "SEED_ORDER",
    "lines": 5
  },
  {
    "name": "SEEDWORD",
    "lines": 2
  },
  {
    "name": "SELL_MIN_STEPS",
    "lines": 2
  },
  {
    "name": "SHRINE_DATA",
    "lines": 17
  },
  {
    "name": "SICKNESS_EFFECTS",
    "lines": 6
  },
  {
    "name": "SICKNESS_PREVENTION",
    "lines": 4
  },
  {
    "name": "SICKNESS_RATE_BY_LEVEL",
    "lines": 18
  },
  {
    "name": "SKILL_FEED_EFFECTS",
    "lines": 7
  },
  {
    "name": "SKILL_RANK_PRICEABLE",
    "lines": 2
  },
  {
    "name": "SKILL_TREE_DATA",
    "lines": 168
  },
  {
    "name": "SKILL_UPGRADES",
    "lines": 68
  },
  {
    "name": "TICKET_REWARDS",
    "lines": 4
  },
  {
    "name": "TIER_TABLE",
    "lines": 2
  },
  {
    "name": "TIER_TBL",
    "lines": 2
  },
  {
    "name": "TOOL_COSTS",
    "lines": 13
  },
  {
    "name": "TOOL_TO_CAT",
    "lines": 4
  },
  {
    "name": "TOOLCAT",
    "lines": 2
  },
  {
    "name": "TRACKED_DOLLS_DEFAULT",
    "lines": 8
  },
  {
    "name": "TREASURE_SELL_PRICES",
    "lines": 8
  },
  {
    "name": "TREASURY_CAT_COLORS",
    "lines": 9
  },
  {
    "name": "TREE_COLOR",
    "lines": 2
  },
  {
    "name": "WEARABLE_IDS",
    "lines": 78
  },
  {
    "name": "WOOD_SH",
    "lines": 2
  },
  {
    "name": "ZOOM_STEPS",
    "lines": 5
  }
];
