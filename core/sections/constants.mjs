import * as cooking from "../data/cooking.mjs";
import * as crafting from "../data/crafting.mjs";
import * as fishing from "../data/fishing.mjs";
import * as prices from "../data/prices.mjs";
import * as recipes from "../data/recipes.mjs";
import * as economy from "../data/economy.mjs";
import * as pets from "../data/pets.mjs";
import { TABLE_INVENTORY } from "../data/_inventory.mjs";

// Every core/data module. Adding one here is the ONLY manual step; the test in
// tests/core/constants.test.mjs scans the directory and fails if a module is forgotten.
const MODULES = {
  "core/data/cooking.mjs": cooking,
  "core/data/crafting.mjs": crafting,
  "core/data/fishing.mjs": fishing,
  "core/data/prices.mjs": prices,
  "core/data/recipes.mjs": recipes,
  "core/data/economy.mjs": economy,
  "core/data/pets.mjs": pets,
};

export function buildConstantsSection() {
  const tables = {};
  const fileOf = {};
  for (const [file, mod] of Object.entries(MODULES)) {
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === "function") continue; // helpers, not tables
      tables[name] = value;
      fileOf[name] = file;
    }
  }
  const coverage = TABLE_INVENTORY.map((t) => {
    const inCore = t.name in tables;
    const inPage = true; // the inventory IS the list of tables present in flowers.html
    return {
      name: t.name,
      lines: t.lines,
      inCore,
      inPage,
      status: inCore ? (inPage ? "duplicated" : "core") : "inline",
      file: inCore ? fileOf[t.name] : "flowers.html",
    };
  });
  // Tables that live ONLY in core/ (nothing inline left) never appear in the inventory.
  for (const name of Object.keys(tables)) {
    if (!coverage.some((c) => c.name === name)) {
      coverage.push({ name, lines: null, inCore: true, inPage: false, status: "core", file: fileOf[name] });
    }
  }
  coverage.sort((a, b) => a.name.localeCompare(b.name));
  const summary = {
    total: coverage.length,
    core: coverage.filter((c) => c.status === "core").length,
    inline: coverage.filter((c) => c.status === "inline").length,
    duplicated: coverage.filter((c) => c.status === "duplicated").length,
  };
  return { tables, coverage, summary };
}
