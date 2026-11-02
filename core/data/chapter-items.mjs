/*
 * Boost items the marketplace feed (sfl.world /api/v1/nfts) does not carry.
 *
 * POWER and ROADMAP build their boost list from that feed, and the feed only lists what trades.
 * An item of the running chapter is not tradeable until the chapter ends (withdrawables.ts
 * tradeAt = CHAPTERS[chapter].endDate), and reward / drop items never trade at all — so an owned
 * Rice Shirt boosted nothing here. Boost text follows the game's own labels
 * (bumpkinItemBuffs.ts / collectibleItemBuffs.ts); where the text parser would misread a line,
 * core/engine/power-boosts.mjs BOOST_EFFECT_OVERRIDES carries the exact effects.
 *
 * source:
 *   auction — current chapter's auctioneer (collections.ts): no fixed price, never ranked by payback
 *   shop    — current chapter megastore (megastore.ts), priced as ticket qty × the roadmap's ticket value
 *   reward  — milestone / chapter track reward
 *   drop    — chapter mutant / chest drop
 *   market  — trades, but the feed lists it without a name (only its marketplace `id`), so it is
 *             priced from that id's row
 * Merged-node collectibles (Ancient Tree, Prime Gold Rock, …) are left out on purpose: they are
 * the T2/T3 node tiers, already counted by the node-tier logic.
 */
export const CHAPTER_BOOST_ITEMS = [
  // Cave Dwellers (2026-11-02 → 2027-02-01) — auction (collections.ts). Trade from 2027-02-01.
  { name: "Giant Truffle", type: "Collectible", source: "auction", chapter: "Cave Dwellers", boost: "+30% Bumpkin XP from food (not fish)" },
  { name: "Firefly Aura", type: "Wearable", source: "auction", chapter: "Cave Dwellers", boost: "-20% Lava Pit time\n5% chance a Lava Pit completes instantly" },
  { name: "Antique Dress", type: "Wearable", source: "auction", chapter: "Cave Dwellers", boost: "-30% Grape growth time\n10% chance +10 Grapes" },
  { name: "Harpoon", type: "Wearable", source: "auction", chapter: "Cave Dwellers", boost: "20% chance a reel does not use a daily attempt" },
  { name: "Stick House", type: "Collectible", source: "auction", chapter: "Cave Dwellers", boost: "-25% Oil for expansions\n-10% expansion time" },
  { name: "Brick House", type: "Collectible", source: "auction", chapter: "Cave Dwellers", boost: "-25% Crimstone for expansions\n-5% expansion coins" },
  { name: "Hercules Beetle Hat", type: "Wearable", source: "auction", chapter: "Cave Dwellers", boost: "-25% Obsidian for expansions" },
  // Cave Dwellers — megastore (megastore.ts)
  { name: "Duende Hat", type: "Wearable", source: "shop", chapter: "Cave Dwellers", ticket: { item: "Duende Cap", qty: 9000 }, boost: "-10% Crop plot growth time\n-10% Fruit patch growth time" },
  { name: "Straw House", type: "Collectible", source: "shop", chapter: "Cave Dwellers", ticket: { item: "Duende Cap", qty: 9000 }, boost: "-10% Composter time\nx3 base Compost and worms" },
  { name: "Duende Monument", type: "Collectible", source: "shop", chapter: "Cave Dwellers", ticket: { item: "Duende Cap", qty: 4000 }, boost: "-10% expansion resources (not with Grinx's Hammer)\n-10% expansion time" },
  { name: "Pot of Luck", type: "Collectible", source: "shop", chapter: "Cave Dwellers", ticket: { item: "Clover Coin", qty: 250 }, boost: "1/3 chance of +1 Desert Treasure" },
  // Cave Dwellers — chapter track
  { name: "Pig Onesie", type: "Wearable", source: "reward", chapter: "Cave Dwellers", boost: "+5% Animal Feed XP" },
  { name: "Ascension Staff", type: "Wearable", source: "reward", chapter: "Cave Dwellers", powerCooldownMult: 0.9, boost: "-10% power skill cooldowns" },
  { name: "Spooky Bed", type: "Collectible", source: "reward", chapter: "Cave Dwellers", boost: "+1 farmhand" },
  // Cave Dwellers — mutants and the Luxury chest
  { name: "Mushroom Chicken", type: "Collectible", source: "drop", chapter: "Cave Dwellers", boost: "+0.5 Crimstone on the 5th mine streak" },
  { name: "Ladybug Cow", type: "Collectible", source: "drop", chapter: "Cave Dwellers", boost: "+1 Oil per drill" },
  { name: "Beetle Sheep", type: "Collectible", source: "drop", chapter: "Cave Dwellers", boost: "-7.5% Sheep sleep time" },
  { name: "Cyclops Bloom", type: "Collectible", source: "drop", chapter: "Cave Dwellers", boost: "-20% Fish Market processing time" },
  { name: "Fish Trap", type: "Wearable", source: "drop", chapter: "Cave Dwellers", boost: "-20% fish aging time" },
  // Ascension Age — tradeable since the chapter ended (2026-11-02); the feed lists them by id only.
  { name: "Rice Shirt", type: "Wearable", source: "market", id: 413, chapter: "Ascension Age", boost: "+1 Rice\n-50% Oil to plant Rice" },
  { name: "Surfer Hair", type: "Wearable", source: "market", id: 586, chapter: "Ascension Age", boost: "-50% Salt cost for aging fish" },
  { name: "Alchemist Apron", type: "Wearable", source: "market", id: 480, chapter: "Ascension Age", boost: "-50% Potion House fee" },
  { name: "Vibraphone", type: "Collectible", source: "market", id: 3053, chapter: "Ascension Age", boost: "Animal feed buffs last 6 harvests" },
  { name: "Winged Vase", type: "Collectible", source: "market", id: 3054, chapter: "Ascension Age", boost: "+14% Prime Aged chance" },
  { name: "Ascended Idol", type: "Collectible", source: "market", id: 3044, chapter: "Ascension Age", boost: "Harvest Salt without Salt Rakes" },
  { name: "Salt Worker Gnome", type: "Collectible", source: "market", id: 3051, chapter: "Ascension Age", boost: "-30% Salt Node recovery time\n+2 Salt per harvest" },
  { name: "Moon Hair", type: "Wearable", source: "market", id: 582, chapter: "Ascension Age", boost: "+2 Full Moon Seed stock\n+0.5 Full Moon Fruit" },
  { name: "Astrolabe", type: "Collectible", source: "market", id: 3046, chapter: "Ascension Age", boost: "15% chance to double Fermentation & Spice Rack output\n+5% XP from Aged Fish" },
  { name: "Otty the Otter", type: "Collectible", source: "market", id: 3050, chapter: "Ascension Age", boost: "+5 daily fishing reels\n+1 random fish every 15th reel" },
  { name: "Ascended Chicken", type: "Collectible", source: "market", id: 3033, chapter: "Ascension Age", boost: "+0.1 Egg" },
  { name: "Ascended Sheep", type: "Collectible", source: "market", id: 3035, chapter: "Ascension Age", boost: "+0.05 Wool" },
  { name: "Ascended Cow", type: "Collectible", source: "market", id: 3034, chapter: "Ascension Age", boost: "-2.5% Cow Sleep Time" },
  { name: "Ruins Flower", type: "Collectible", source: "market", id: 3036, chapter: "Ascension Age", boost: "+0.05 Honey from full beehives" },
  { name: "Salt Bottle Onesie", type: "Wearable", source: "market", id: 578, chapter: "Ascension Age", boost: "+1 Spice Rack output" },
  // Ascension Age items with no release entry (withdrawables.ts) — they never trade.
  { name: "Ascension Monument", type: "Collectible", source: "reward", chapter: "Ascension Age", boost: "-20% Expansion Time" },
  // Tradeable, but the feed row has no name. Halves every power-skill cooldown (skillUsed.ts
  // getSkillCooldown), valued as the extra uses of the power skills the farm has.
  { name: "Luna's Crescent", type: "Wearable", source: "market", id: 499, chapter: null, powerCooldownMult: 0.5, boost: "-50% power skill cooldowns" },
  // Rewards that never trade
  { name: "Trident", type: "Wearable", source: "reward", chapter: null, boost: "20% Chance +1 Fish" },
  { name: "Sunflower Rod", type: "Wearable", source: "reward", chapter: null, boost: "10% Chance +1 Fish" },
  { name: "Angler Waders", type: "Wearable", source: "reward", chapter: null, boost: "+10 daily fishing reels" },
];

/*
 * Chapter 16 resources that trade in the game's marketplace but are not in the sfl.world p2p feed
 * yet (still the 65 old resources on 2026-11-02). The marketplace itself sits behind the anti-bot
 * request token, so these are the owner's reading of it (lowest listing per unit, launch day —
 * thin markets, expect them to fall). Used ONLY while the feed lacks the item: once sfl.world
 * lists it, the feed wins.
 */
export const CHAPTER_RESOURCE_PRICES = {
  readAt: "2026-11-02", source: "in-game marketplace, read by the owner",
  prices: { "Green Beetle": 1.379, "Blue Beetle": 1.4, "Pink Beetle": 4.4, "Amber Beetle": 7.8, "Pig Bristles": 6.4, "Truffle": 0.6996 },
};

/** The ticket every current-chapter shop price is quoted in; other currencies stay unpriced. */
export const CHAPTER_TICKET = "Duende Cap";
