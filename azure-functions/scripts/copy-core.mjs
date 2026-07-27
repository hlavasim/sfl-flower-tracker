// Copies core/ into azure-functions/core/ so the deployed function app can import it.
//
// `func azure functionapp publish` zips ONLY the azure-functions directory, so core/
// at the repo root is not in the deployment. The cooking-boost detection is real
// logic (conditional on skills, wearables, collectibles, sculptures, faction pet
// streak), not a data table — copying it by hand into a CJS twin would drift the
// moment core/ changes. So it gets vendored at deploy time instead, and the copy is
// gitignored: one source of truth in core/, a build artifact here.
//
// Run before every publish:
//   node azure-functions/scripts/copy-core.mjs && func azure functionapp publish sfl-data-collector --javascript
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../core");
const dest = path.resolve(here, "../core");

if (!fs.existsSync(src)) {
  console.error(`core/ not found at ${src}`);
  process.exit(1);
}
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });

let files = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(d, e.name));
    else files++;
  }
};
walk(dest);
console.log(`copied core/ -> azure-functions/core/ (${files} files)`);
