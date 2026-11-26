import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { budsTable, budsQuery } from "../../widgets/buds.mjs";
import { petsSummary, petsNftCollection, petsMarket, petCards, petFetches, petProgress, NFT_BREED_TYPES } from "../../widgets/pets.mjs";
import { WIDGETS } from "../../widgets/registry.mjs";
import { renderTable } from "../../ui/table.mjs";
import { buildBudsSection } from "../../core/sections/buds.mjs";
import { buildPetsSection } from "../../core/sections/pets.mjs";
import { PET_FETCH_DATA } from "../../core/data/pets.mjs";
import { petFetchYield } from "../../core/engine/pets.mjs";

// BUDS and PETS as widgets over the real sections for the fixture farm.
const wrap = JSON.parse(readFileSync(new URL("../fixtures/farm-155498.json", import.meta.url)));
const farm = wrap.farm || wrap;
const p2p = JSON.parse(readFileSync(new URL("../fixtures/p2p-prices.json", import.meta.url)));
const BUDS = JSON.parse(JSON.stringify(buildBudsSection(farm, p2p, {})));
const PETS = JSON.parse(JSON.stringify(buildPetsSection(farm, p2p, {})));
const SRC = readFileSync(new URL("../../flowers.html", import.meta.url), "utf8");
const CTX = { icon: (n) => `<img data-i="${n}">`, flower: "🌸", describe: (b) => [`<i>${b.type}</i>`], catIcon: (c) => `<i data-c="${c}"></i>`, budIcon: () => "<img data-bud>" };
const keys = (html) => [...html.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);

test("registered on BUDS / PETS with store-loadable needs", () => {
  assert.strictEqual(WIDGETS["buds-table"], budsTable);
  assert.strictEqual(budsTable.page, "buds");
  assert.deepStrictEqual(budsTable.needs(7), { buds: { res: "compute", farm: 7, section: "buds", q: { products: "{}" } } });
  assert.deepStrictEqual(budsQuery(7), budsTable.needs(7).buds);
  for (const w of [petsSummary, petsNftCollection, petsMarket, petCards]) { assert.strictEqual(WIDGETS[w.type], w); assert.strictEqual(w.page, "pets"); }
  assert.deepStrictEqual(petsMarket.needs(7), { pets: { res: "compute", farm: 7, section: "pets" } });
  assert.deepStrictEqual(petsNftCollection.needs(7), { farm: { res: "farm", farm: 7 } });
});

test("🌱 buds: every bud, owned first then by FLOWER/day, the page's numbers and filters per copy", () => {
  const out = budsTable.build({ buds: BUDS }, CTX, {});
  assert.strictEqual(out.rows.length, BUDS.rows.length);
  const owned = BUDS.rows.filter((r) => r.owned).length;
  assert.ok(out.rows.slice(0, owned).every((r) => r.owned));
  for (let i = owned + 1; i < out.rows.length; i++) assert.ok(out.rows[i - 1].sflPerDay >= out.rows[i].sflPerDay);
  const r = out.rows.find((x) => x.sflPerDay > 0);
  assert.strictEqual(r.sflPerYear, r.sflPerDay * 365);
  const html = renderTable(budsTable.columns, [r], {}, { rowKey: budsTable.rowKey });
  assert.match(html, new RegExp(`\\+${r.sflPerDay.toFixed(4).replace(".", "\\.")}`));
  assert.match(html, new RegExp(`\\+${r.sflPerYear.toFixed(2).replace(".", "\\.")}`));
  assert.match(html, /class="v-bar"/);
  assert.match(html, /<img data-bud>/);
  assert.match(html, new RegExp(`<i>${r.type}</i>`), "boosts come from the page's describeBudBoosts");
  assert.match(out.summary, new RegExp(`<b>${BUDS.rows.length}</b><span>buds in total</span>`));
  assert.match(out.summary, new RegExp(`<b>${owned}</b><span>owned</span>`));
  assert.match(out.summary, new RegExp(`Capacity: ${BUDS.capacity.crops} plots`));
  const beach = budsTable.build({ buds: BUDS }, CTX, { type: "Beach", aura: "Rare" });
  assert.ok(beach.rows.length > 0 && beach.rows.every((x) => x.type === "Beach" && x.aura === "Rare"));
  assert.ok(budsTable.build({ buds: BUDS }, CTX, { owned: true }).rows.every((x) => x.owned));
  assert.match(renderTable(budsTable.columns, beach.rows.slice(0, 1), {}, {}), /Rare \(100%\)/);
});

test("📱 buds glance: S = the best owned bud a day (the best overall when none is owned); M / L = the owned buds, best first", () => {
  assert.deepStrictEqual([budsTable.sizes, budsTable.size], [["s", "m", "l"], "s"]);
  const byDay = BUDS.rows.slice().sort((a, b) => b.sflPerDay - a.sflPerDay);
  const none = budsTable.glance({ buds: BUDS }, CTX, {}, "s").html;
  assert.ok(none.startsWith(`<div class="g-hero"><img data-bud></div><div class="g-big g-ok">+`));
  assert.match(none, new RegExp(`<div class="g-cap">#${byDay[0].id} · none owned</div>$`));
  // two owned buds: the face is about them, not the best on the market
  const mine = [byDay[5], byDay[9]];
  const D = { ...BUDS, rows: BUDS.rows.map((r) => ({ ...r, owned: mine.some((x) => x.id === r.id) })) };
  assert.match(budsTable.glance({ buds: D }, CTX, {}, "s").html, new RegExp(`<div class="g-cap">#${mine[0].id} · best of 2 owned</div>`));
  const m = budsTable.glance({ buds: D }, CTX, {}, "m").html;
  assert.strictEqual((m.match(/class="g-row"/g) || []).length, 2);
  assert.ok(m.indexOf(`#${mine[0].id} `) < m.indexOf(`#${mine[1].id} `));
  assert.strictEqual((budsTable.glance({ buds: BUDS }, CTX, {}, "l").html.match(/class="g-row"/g) || []).length, 7);
  assert.deepStrictEqual(budsTable.glance({}, CTX, {}, "s"), { empty: "No bud data." });
  assert.deepStrictEqual(budsTable.glance({ buds: BUDS }, CTX, { type: "Nope" }, "s"), { empty: "No bud matches the filter." });
});

test("🐾 summary: totals, the full-fetch earnings per pet (the page's sum) and the daily income", () => {
  // the fixture's pets are almost out of energy (no full fetch): give a copy 1 000 each
  const D = { ...PETS, pets: PETS.pets.map((p) => ({ ...p, energy: 1000 })) };
  const out = petsSummary.view({ pets: D }, CTX);
  const pets = D.pets;
  assert.match(out.html, new RegExp(`<b>${pets.length}</b><span>pets</span>`));
  assert.match(out.html, new RegExp(`<b>${pets.filter((p) => p.isNft).length}</b><span>NFT</span>`));
  // the page's own loop: best unlocked fetch per pet, fetches × price × yield
  let perFeed = 0, daily = 0;
  for (const p of pets) {
    const fd = (PET_FETCH_DATA[p.petType] || []).filter((f) => p.level >= f.level).map((f) => {
      const price = D.p2pPrices[f.res] || 0;
      return Math.floor(p.energy / f.energy) * price * petFetchYield(f.res, p.level, p.isNft, D.fetchBoosts);
    }).sort((a, b) => b - a);
    if (fd[0] > 0) perFeed += fd[0];
    if (p.calc.dailySfl > 0) daily += p.calc.dailySfl;
  }
  assert.ok(perFeed > 0);
  assert.match(out.html, new RegExp(`<b>${perFeed.toFixed(2)}</b><span>FLOWER per full fetch round</span>`));
  assert.match(out.html, new RegExp(`<b>${daily.toFixed(2)}/day</b><span>daily pet income</span>`));
  assert.match(out.html, /<img data-i="/, "pets and resources carry their icons");
  assert.match(petsSummary.view({ pets: { ...PETS, pets: [] } }, CTX).html, /No pets found on this farm/);
  assert.doesNotMatch(petsSummary.view({ pets: PETS }, CTX).html, /full fetch round/, "nothing to fetch now: no earnings tile");
});

test("🐉 NFT collection: seven breeds, owned or missing, each fetch with its icon and lock", () => {
  const out = petsNftCollection.view({ farm }, CTX);
  const ownedBreeds = new Set(Object.values(farm.pets.nfts || {}).map((p) => p.traits && p.traits.type).filter((t) => NFT_BREED_TYPES.includes(t)));
  assert.match(out.html, new RegExp(`<b>${ownedBreeds.size} / 7</b><span>breeds owned</span>`));
  assert.strictEqual((out.html.match(/>OWNED</g) || []).length, ownedBreeds.size);
  assert.strictEqual((out.html.match(/>MISSING</g) || []).length, 7 - ownedBreeds.size);
  assert.match(out.html, /<img data-i="Moonfur">Moonfur/);
  assert.match(out.html, /class="v-big"/);
});

test("💱 market: every fetchable resource once, best FLOWER per energy first", () => {
  const out = petsMarket.build({ pets: PETS }, CTX, {});
  const all = new Set(Object.values(PET_FETCH_DATA).flat().map((e) => e.res));
  assert.strictEqual(out.rows.length, all.size);
  for (let i = 1; i < out.rows.length; i++) assert.ok(out.rows[i - 1].ratio >= out.rows[i].ratio);
  const top = out.rows[0];
  assert.strictEqual(top.ratio, PETS.p2pPrices[top.res] / top.energy);
  const html = renderTable(petsMarket.columns, out.rows, {}, { rowKey: petsMarket.rowKey });
  assert.deepStrictEqual(keys(html), out.rows.map((r) => r.res));
  assert.match(html, new RegExp(`<img data-i="${top.res}"><b>${top.res}</b>`));
  assert.match(html, new RegExp(top.ratio.toFixed(4)));
});

test("🐶 pets one by one: the best fetch, FLOWER/day, XP bar, next perk and the full detail", () => {
  const out = petCards.build({ pets: PETS }, CTX, {});
  assert.strictEqual(out.rows.length, PETS.pets.length);
  const p = PETS.pets.find((x) => x.calc.dailySfl > 0);
  const r = out.rows.find((x) => x.name === p.name);
  assert.strictEqual(r.daily, p.calc.dailySfl);
  assert.deepStrictEqual(r.best, petFetches(p, PETS.p2pPrices, PETS.fetchBoosts).best);
  const html = renderTable(petCards.columns, [r], petCards.defaults, { rowKey: petCards.rowKey });
  assert.match(html, new RegExp(`<b>${p.calc.dailySfl.toFixed(2)}</b>`));
  assert.match(html, /class="v-bar"/);
  assert.match(r.detailHtml, /Level perks/);
  assert.match(r.detailHtml, /Lv 200/);
  const prog = petProgress(p);
  assert.match(html, new RegExp(`\\(${prog.pct}%\\)`));
  assert.ok(petCards.build({ pets: PETS }, CTX, { which: "nft" }).rows.every((x) => x.key.startsWith("nft:")));
  assert.match(petCards.titleFor({ which: "nft" }), /NFT/);
});

test("the BUDS and PETS pages render their widgets and register the context", () => {
  const buds = SRC.slice(SRC.indexOf("async function renderBuds("), SRC.indexOf("//  PETS PAGE"));
  assert.match(buds, /_wPageHead\("🌱 Bud Explorer"/);
  assert.match(buds, /__widgets\.renderPage\("buds-table"/);
  assert.match(buds, /q: \{ products: JSON\.stringify\(getSavedPowerProducts\(\)\) \}/, "the same store key as the widget's needs");
  assert.match(SRC, /_wCtxMap\["buds-table"\] = \(\) => \(\{ describe: describeBudBoosts/);
  const pets = SRC.slice(SRC.indexOf("async function renderPets("), SRC.indexOf("function refresh()"));
  assert.match(pets, /_wPageHead\("🐾 Pet Advisor"/);
  for (const t of ["pets-summary", "pets-nft-collection", "pets-market", "pet-cards"]) assert.match(pets, new RegExp(`w\\("${t}"`), t);
  assert.doesNotMatch(SRC, /function filterBudTable|const PET_LEVEL_PERKS|const NFT_BREED_TYPES/, "the replaced page code is gone");
});
