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
 *   auction — Ascension Age auctioneer (collections.ts): no fixed price, never ranked by payback
 *   shop    — chapter megastore (megastore.ts), priced as ticket qty × the roadmap's ticket value
 *   reward  — milestone / chapter track reward
 *   drop    — chapter mutant drop
 * Merged-node collectibles (Ancient Tree, Prime Gold Rock, …) are left out on purpose: they are
 * the T2/T3 node tiers, already counted by the node-tier logic.
 */
export const CHAPTER_BOOST_ITEMS = [
  // Ascension Age — auction
  { name: "Rice Shirt", type: "Wearable", source: "auction", chapter: "Ascension Age", boost: "+1 Rice\n-50% Oil to plant Rice" },
  { name: "Surfer Hair", type: "Wearable", source: "auction", chapter: "Ascension Age", boost: "-50% Salt cost for aging fish" },
  { name: "Alchemist Apron", type: "Wearable", source: "auction", chapter: "Ascension Age", boost: "-50% Potion House fee" },
  { name: "Vibraphone", type: "Collectible", source: "auction", chapter: "Ascension Age", boost: "Animal feed buffs last 6 harvests" },
  { name: "Winged Vase", type: "Collectible", source: "auction", chapter: "Ascension Age", boost: "+14% Prime Aged chance" },
  { name: "Ascended Idol", type: "Collectible", source: "auction", chapter: "Ascension Age", boost: "Harvest Salt without Salt Rakes" },
  { name: "Salt Worker Gnome", type: "Collectible", source: "auction", chapter: "Ascension Age", boost: "-30% Salt Node recovery time\n+2 Salt per harvest" },
  // Ascension Age — megastore
  { name: "Moon Hair", type: "Wearable", source: "shop", chapter: "Ascension Age", ticket: { item: "Shiny Feather", qty: 9000 }, boost: "+2 Full Moon Seed stock\n+0.5 Full Moon Fruit" },
  { name: "Astrolabe", type: "Collectible", source: "shop", chapter: "Ascension Age", ticket: { item: "Shiny Feather", qty: 9000 }, boost: "15% chance to double Fermentation & Spice Rack output\n+5% XP from Aged Fish" },
  { name: "Ascension Monument", type: "Collectible", source: "shop", chapter: "Ascension Age", ticket: { item: "Shiny Feather", qty: 4000 }, boost: "-20% Expansion Time" },
  { name: "Otty the Otter", type: "Collectible", source: "shop", chapter: "Ascension Age", ticket: { item: "Otter Pebble", qty: 250 }, boost: "+5 daily fishing reels\n+1 random fish every 15th reel" },
  // Chapter mutant drops
  { name: "Ascended Chicken", type: "Collectible", source: "drop", chapter: "Ascension Age", boost: "+0.1 Egg" },
  { name: "Ascended Sheep", type: "Collectible", source: "drop", chapter: "Ascension Age", boost: "+0.05 Wool" },
  { name: "Ascended Cow", type: "Collectible", source: "drop", chapter: "Ascension Age", boost: "-2.5% Cow Sleep Time" },
  { name: "Ruins Flower", type: "Collectible", source: "drop", chapter: "Ascension Age", boost: "+0.05 Honey from full beehives" },
  // Rewards that never trade
  { name: "Salt Bottle Onesie", type: "Wearable", source: "reward", chapter: "Ascension Age", boost: "+1 Spice Rack output" },
  { name: "Trident", type: "Wearable", source: "reward", chapter: null, boost: "20% Chance +1 Fish" },
  { name: "Sunflower Rod", type: "Wearable", source: "reward", chapter: null, boost: "10% Chance +1 Fish" },
  { name: "Angler Waders", type: "Wearable", source: "reward", chapter: null, boost: "+10 daily fishing reels" },
];

/** The ticket every current-chapter shop price is quoted in; other currencies stay unpriced. */
export const CHAPTER_TICKET = "Shiny Feather";
