import { test } from "node:test";
import assert from "node:assert";
import { itemIconsOf, sunnysideOf, skillIconsOf } from "../../scripts/gen-item-icons.mjs";
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
  assert.match(src, /if \(window\.__itemIcons && window\.__itemIcons\[name\]\) return window\.__itemIcons\[name\];/);
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
