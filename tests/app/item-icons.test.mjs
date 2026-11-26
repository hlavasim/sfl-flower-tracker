import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { itemIconsOf, sunnysideOf, skillIconsOf, wearableIconsOf } from "../../scripts/gen-item-icons.mjs";
import { ITEM_ICONS } from "../../app/item-icons.mjs";

// Item icons come from the game's own image map, not from sfl.world guesses (which answer "?" for
// names they do not know — Timber, Crimsteel, Kelp Fibre, Synthetic Fabric).

const SUNNY = `import { CONFIG } from "lib/config";
import shovel from "assets/tools/shovel.png";
export const SUNNYSIDE = {
  crafting: {
    timber: \`\${CONFIG.PROTECTED_IMAGE_URL}/crafting/timber.webp\`,
    kelpFibre: \`\${CONFIG.PROTECTED_IMAGE_URL}/crafting/kelp_fibre.webp\`,
  },
  tools: {
    shovel,
  },
};`;
const IMAGES = `import appleSeed from "assets/fruit/apple/apple_seed.png";
export const ITEM_DETAILS = {
  "Apple Seed": {
    image: appleSeed,
    description: "x",
  },
  Timber: {
    image: SUNNYSIDE.crafting.timber,
    description: "y",
  },
  "Kelp Fibre": {
    image: SUNNYSIDE.crafting.kelpFibre,
  },
};`;

test("the generator resolves imported assets and SUNNYSIDE paths", () => {
  assert.strictEqual(sunnysideOf(SUNNY)["crafting.timber"], "https://sunflower-land.com/game-assets/crafting/timber.webp");
  assert.deepStrictEqual(itemIconsOf(IMAGES, SUNNY), {
    "Apple Seed": "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/assets/fruit/apple/apple_seed.png",
    Timber: "https://sunflower-land.com/game-assets/crafting/timber.webp",
    "Kelp Fibre": "https://sunflower-land.com/game-assets/crafting/kelp_fibre.webp",
  });
});

test("an item whose image is not the first key still gets it (Sproutroot Surprise showed \"?\")", () => {
  const images = `import sproutrootSurprise from "assets/icons/sproutroot_surprise.webp";
export const ITEM_DETAILS = {
  "Sproutroot Surprise": {
    boostedDescriptions: [
      {
        name: "Knowledge Crab",
        image: SUNNYSIDE.crafting.timber,
      },
    ],
    image: sproutrootSurprise,
    description: "z",
  },
};`;
  assert.deepStrictEqual(itemIconsOf(images, SUNNY), {
    "Sproutroot Surprise": "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/assets/icons/sproutroot_surprise.webp",
  });
  assert.match(ITEM_ICONS["Sproutroot Surprise"] || "", /sproutroot_surprise\.webp$/, "the generated map carries it");
});

test("crops: the lifecycle art folder from plant.ts", () => {
  const plant = `export const IMAGES: Record<CropName, string> = {
  Sunflower: "sunflower",
  "Crystal Leaf": "crystal_leaf",
};`;
  const images = `export const ITEM_DETAILS = {
  Sunflower: {
    image: CROP_LIFECYCLE["Basic Biome"].Sunflower.crop,
  },
  "Crystal Leaf Seed": {
    image: CROP_LIFECYCLE["Basic Biome"]["Crystal Leaf"].seed,
  },
};`;
  assert.deepStrictEqual(itemIconsOf(images, "", plant), {
    Sunflower: "https://sunflower-land.com/game-assets/crops/sunflower/crop.png",
    "Crystal Leaf Seed": "https://sunflower-land.com/game-assets/crops/crystal_leaf/seed.png",
  });
});

test("the generated map covers the items that showed \"?\" and the common ones", () => {
  for (const n of ["Timber", "Crimsteel", "Kelp Fibre", "Synthetic Fabric", "Feather", "Doll", "Sunflower", "Pumpkin Soup", "Blue Crab", "Merino Wool"]) {
    assert.match(ITEM_ICONS[n] || "", /^https:\/\//, n);
  }
  assert.ok(Object.keys(ITEM_ICONS).length > 1000);
});

test("the page reads the game's map first", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
  assert.match(src, /const ic = window\.__itemIcons;\s+if \(ic && ic\[name\]\) return ic\[name\];/);
  assert.match(src, /import\("\/app\/item-icons\.mjs"\)/);
});

test("skills: the image of each skill from bumpkinSkills.ts (they are not in images.ts, so the buy path showed \"?\")", () => {
  const skills = `import sturdyShovel from "assets/skills/sturdy_shovel.webp";
export const BUMPKIN_REVAMP_SKILL_TREE = {
  "Sturdy Shovel": {
    name: "Sturdy Shovel",
    tree: "Cave",
    boosts: {
      buff: {
        boostedItemIcon: ITEM_DETAILS["Sand Shovel"].image,
      },
    },
    image: sturdyShovel,
  },
  "Green Thumb": {
    name: "Green Thumb",
    image: SUNNYSIDE?.crafting?.timber,
  },
  "Lucky Pick": {
    name: "Lucky Pick",
    image: ITEM_DETAILS["Apple Seed"].image,
  },
};`;
  const items = itemIconsOf(IMAGES, SUNNY);
  assert.deepStrictEqual(skillIconsOf(skills, SUNNY, items), {
    "Sturdy Shovel": "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/assets/skills/sturdy_shovel.webp",
    "Green Thumb": "https://sunflower-land.com/game-assets/crafting/timber.webp",
    "Lucky Pick": items["Apple Seed"],
  });
  assert.ok(ITEM_ICONS["Sturdy Shovel"] && ITEM_ICONS["Beetle Nest"] && ITEM_ICONS["Lean Compost"], "the generated map carries the skills");
});

test("wearables: ITEM_IDS of bumpkin.ts → the game's wearables/<id>.webp (sfl.world showed \"?\" for new ones like Duende Hat)", () => {
  const bumpkin = `export const ITEM_IDS: Record<BumpkinItem, number> = {
  "Farmer Shirt": 1,
  "Duende Hat": 590,
};
export const BUMPKIN_ITEM_PART = {`;
  assert.deepStrictEqual(wearableIconsOf(bumpkin), {
    "Farmer Shirt": "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/assets/wearables/1.webp",
    "Duende Hat": "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/assets/wearables/590.webp",
  });
  assert.ok(ITEM_ICONS["Duende Hat"] && ITEM_ICONS["Firefly Aura"], "the generated map carries the wearables");
});

test("the page's getItemIcon: no '?' for null, skill ranks ('Fishy Feast 3') or plurals ('Bananas', 'coins')", () => {
  const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const start = SRC.indexOf("    function getItemIcon(name) {");
  const body = SRC.slice(start, SRC.indexOf("\n    }\n", start) + 6);
  const window = { __itemIcons: { "Fishy Feast": "U/ff", Banana: "U/banana", Olive: "U/olive", Beetroot: "U/beet", "Heart leaf": "U/heart" } };
  const get = new Function("window", "ITEM_IMAGE_MAP", "ITEM_ICON_BASE", body + "\nreturn getItemIcon;")(window, {}, "SFLW/");
  assert.strictEqual(get("Fishy Feast 3"), "U/ff");
  assert.strictEqual(get("Bananas"), "U/banana");
  assert.strictEqual(get("Olives"), "U/olive");
  assert.strictEqual(get("Beetroots"), "U/beet");
  assert.match(get("coins"), /coins\.png$/);
  assert.strictEqual(get(null), "", "no image for no name (was /img/source/null.png)");
  assert.strictEqual(get("Heart Leaf"), "U/heart", "the game's own spelling differs in case");
  assert.strictEqual(get("Unknown Thing"), "SFLW/Unknown%20Thing.png", "an unknown name still tries sfl.world");
});

test("getItemIcon: pet species, NFT breeds, Pet, Banana Seed and the game-boost row get game art, not sfl.world's '?'", () => {
  const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const start = SRC.indexOf("    function getItemIcon(name) {");
  const body = SRC.slice(start, SRC.indexOf("\n    }\n", start) + 6);
  const ic = { Barkley: "U/barkley", Meowchi: "U/meowchi", Twizzle: "U/twizzle", Burro: "U/burro", Mudhorn: "U/mudhorn", Waddles: "U/waddles", "Banana Plant": "U/banana-plant" };
  const get = new Function("window", "ITEM_IMAGE_MAP", "ITEM_ICON_BASE", body + "\nreturn getItemIcon;")({ __itemIcons: ic }, {}, "SFLW/");
  for (const [n, u] of [["Dog", "U/barkley"], ["Cat", "U/meowchi"], ["Owl", "U/twizzle"], ["Horse", "U/burro"], ["Bull", "U/mudhorn"], ["Penguin", "U/waddles"], ["Banana Seed", "U/banana-plant"]]) {
    assert.strictEqual(get(n), u, n);
  }
  for (const n of ["Dragon", "Phoenix", "Griffin", "Ram", "Warthog", "Wolf", "Bear", "Pet"]) assert.match(get(n), /pet_nft_egg\.png$/, n);
  assert.match(get("Game boosts (API-missing)"), /icons\/lightning\.png$/);
  // the real map has every pet the aliases point at
  for (const n of ["Barkley", "Meowchi", "Twizzle", "Burro", "Mudhorn", "Waddles", "Nibbles", "Banana Plant"]) assert.ok(ITEM_ICONS[n], n);
});
