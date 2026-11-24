/*
 * LEVELING page catalogue — everything that moves the cost or speed of levelling through the
 * kitchens and the fish route (fishing → aging → eating), each with how the what-if farm gets it.
 *
 * Only boosts the engine models are listed: cooking ones are exactly those detectCookingBoosts reads
 * (core/engine/cooking.mjs), fish yield those of computeFishYieldPerCast / the daily reel limit,
 * salt those of side-values' salt model, aging those of the Aging Shed rules. Something the engine
 * does not read would show a fake zero impact, so it stays out until the engine learns it.
 *
 *   kind  collectible → placed on the farm   wearable → worn (a synthetic farm hand)
 *         skill       → bumpkin.skills[name] = rank    bud → a placed bud of `budType`
 *   rank  for a skill: the rank this row gives (a rank-up of a skill the farm has is its own row)
 *   tradeable false → cannot be bought now (reward, chapter drop); tickable, no price.
 */
const C = "collectible", W = "wearable", S = "skill";
const item = (name, group, kind, boost, extra = {}) => ({ name, group, kind, boost, tradeable: kind !== S, ...extra });
const skill = (name, group, boost, ranks = 1) =>
  Array.from({ length: ranks }, (_, i) => item(i ? `${name} ${i + 1}` : name, group, S, boost, { skill: name, rank: i + 1 }));

export const LEVELING_ITEMS = [
  // ── RYBOLOV: more fish per cast, more casts, baits, fish XP ──
  item("Walrus", "fishing", C, "+1 fish"),
  item("Alba", "fishing", C, "50% chance +1 basic fish"),
  item("Pink Dolphin", "fishing", C, "+1 fish in spring"),
  item("Jellyfish", "fishing", C, "+1 fish in summer"),
  item("Poseidon", "fishing", C, "+1 fish in autumn"),
  item("Super Star", "fishing", C, "+1 fish in winter"),
  item("Nautilus", "fishing", C, "+5 daily reels"),
  item("Deep Sea Slug", "fishing", C, "+5 daily reels"),
  item("Reelmaster's Chair", "fishing", C, "+5 daily reels"),
  item("Otty the Otter", "fishing", C, "+5 daily reels"),
  item("Saw Fish", "fishing", W, "+5 daily reels"),
  item("Angler Waders", "fishing", W, "+10 daily reels", { tradeable: false }),
  item("Bubble Aura", "fishing", W, "20% chance +1 bait from Fish Market"),
  item("Port bud", "fishing", "bud", "+10% XP from fish (aged too)", { budType: "Port" }),
  item("Sea bud", "fishing", "bud", "10% chance +1 fish", { budType: "Sea" }),
  item("Skill Shrimpy", "fishing", C, "+20% fish XP"),
  ...skill("Fishy Chance", "fishing", "10% chance +1 basic fish"),
  ...skill("Fishy Roll", "fishing", "10% chance +1 advanced fish"),
  ...skill("Fishy Gamble", "fishing", "20% chance +1 expert fish"),
  ...skill("Fisherman's 5 Fold", "fishing", "+5/+7/+10 daily reels", 3),
  ...skill("Fisherman's 10 Fold", "fishing", "+10/+18/+25 daily reels", 3),
  ...skill("More With Less", "fishing", "+10/+25/+50 daily reels", 3),
  ...skill("Fishy Feast", "fishing", "+20% fish XP"),
  // ── SŮL ──
  item("Salt Worker Gnome", "salt", C, "-30% salt node recovery, +2 salt per harvest"),
  item("Ascended Idol", "salt", C, "harvest salt without rakes"),
  item("Deep Sea Salt Cave Background", "salt", W, "+5 salt per harvest"),
  ...skill("Salty Seas", "salt", "faster salt recovery (×0.9/0.85/0.8)", 3),
  ...skill("Wide Rakes", "salt", "+2/+3/+4 salt per rake", 3),
  ...skill("Sea Blessed", "salt", "5/6.5/8% chance of extra charges", 3),
  ...skill("Salt Surge", "salt", "refill salt nodes every 72/60/48 h", 3),
  ...skill("Cheap Rakes", "salt", "-20/30/40% rake coins", 3),
  // ── STÁRNUTÍ ──
  item("Surfer Hair", "aging", W, "-50% salt for aging fish"),
  item("Winged Vase", "aging", C, "+14% Prime Aged chance"),
  item("Astrolabe", "aging", C, "+5% XP from aged fish"),
  item("Fish Trap", "aging", W, "-20% fish aging time", { tradeable: false }),
  ...skill("Speedy Aging", "aging", "aging time ×0.9/0.85/0.8", 3),
  ...skill("Fish Smoking", "aging", "Prime Aged chance ×2/×3/×4", 3),
  ...skill("Ager", "aging", "each aging job ages ×2/×3/×4 fish", 3),
  // ── VAŘENÍ ──
  item("Golden Spatula", "cooking", W, "+10% food XP"),
  item("Pan", "cooking", W, "+25% food XP"),
  item("Observatory", "cooking", C, "+5% food XP"),
  item("Blossombeard", "cooking", C, "+10% food XP"),
  item("Grain Grinder", "cooking", C, "+20% XP from cakes"),
  item("Hungry Hare", "cooking", C, "×2 XP from Fermented Carrots"),
  item("Swiss Whiskers", "cooking", C, "+500 XP on cheese recipes"),
  item("Luna's Hat", "cooking", W, "-50% cooking time"),
  item("Desert Gnome", "cooking", C, "-10% cooking time"),
  item("Nightshade Medallion", "cooking", W, "-25% cooking time"),
  item("Master Chef's Cleaver", "cooking", W, "-15% cooking time, chance of +1 dish"),
  ...skill("Munching Mastery", "cooking", "+5% food XP"),
  ...skill("Juicy Boost", "cooking", "+10% Smoothie Shack XP"),
  ...skill("Drive-Through Deli", "cooking", "+15% Deli XP"),
  ...skill("Buzzworthy Treats", "cooking", "+10% XP from honey recipes"),
  ...skill("Fast Feasts", "cooking", "-10% Fire Pit and Kitchen time"),
  ...skill("Frosted Cakes", "cooking", "-10% cake time"),
  ...skill("Double Nom", "cooking", "+1 dish per cook (double ingredients)"),
  ...skill("Fiery Jackpot", "cooking", "20% chance +1 Fire Pit dish"),
];

export const LEVELING_ITEM_BY_NAME = Object.fromEntries(LEVELING_ITEMS.map((i) => [i.name, i]));
