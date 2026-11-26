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

test("📱 glance: pets earnings S = daily income; M = top pets beside it; no pets → empty", () => {
  const total = PETS.pets.reduce((s, p) => s + (p.calc.dailySfl > 0 ? p.calc.dailySfl : 0), 0);
  const s = petsSummary.glance({ pets: PETS }, CTX, {}, "s").html;
  assert.match(s, new RegExp(`<div class="g-big">${total.toFixed(2)}<small> 🌸/day</small></div><div class="g-cap">${PETS.pets.length} pets · `));
  const top = PETS.pets.slice().sort((a, b) => (b.calc.dailySfl || 0) - (a.calc.dailySfl || 0))[0];
  const m = petsSummary.glance({ pets: PETS }, CTX, {}, "m").html;
  assert.match(m, /^<div class="g-split">/);
  assert.match(m, new RegExp(`<div class="g-rows"><div class="g-row"><span class="g-ic"><img data-i="[^"]+"></span><div class="g-n">${top.name}<div>Lv ${top.level} · `));
  assert.strictEqual((petsSummary.glance({ pets: PETS }, CTX, {}, "l").html.match(/class="g-row"/g) || []).length, Math.min(6, PETS.pets.length));
  assert.match(petsSummary.glance({ pets: { ...PETS, pets: [] } }, CTX, {}, "s").empty, /No pets found/);
  assert.match(petsSummary.glance({}, CTX, {}, "s").empty, /No pet data/);
});

test("📱 glance: NFT collection S = breeds owned with a ring; M = the missing ones; L = all seven", () => {
  const owned = new Set(Object.values(farm.pets.nfts || {}).map((p) => p.traits && p.traits.type).filter((t) => NFT_BREED_TYPES.includes(t)));
  const s = petsNftCollection.glance({ farm }, CTX, {}, "s").html;
  assert.match(s, /^<div class="g-corner"><svg class="g-ring/);
  assert.match(s, new RegExp(`<div class="g-big">${owned.size}<small>/7</small></div>`));
  const m = petsNftCollection.glance({ farm }, CTX, {}, "m").html;
  const missing = NFT_BREED_TYPES.filter((b) => !owned.has(b));
  assert.match(m, new RegExp(`<div class="g-n">${missing[0]}</div><span class="g-chip g-bad">MISSING</span>`));
  const l = petsNftCollection.glance({ farm }, CTX, {}, "l").html;
  assert.strictEqual((l.match(/g-chip g-ok">OWNED/g) || []).length, owned.size);
  assert.strictEqual((l.match(/class="g-row"/g) || []).length, 7);
  assert.match(petsNftCollection.glance({}, CTX, {}, "s").empty, /No farm data/);
});

test("📱 glance: resource market S = best FLOWER per energy; M = top three; pet cards S = requests fed, M = what is left to feed", () => {
  const top = petsMarket.build({ pets: PETS }, CTX, {}).rows[0];
  assert.match(petsMarket.glance({ pets: PETS }, CTX, {}, "s").html, new RegExp(`<div class="g-hero"><img data-i="${top.res}"></div><div class="g-big">${top.ratio.toFixed(4)}</div><div class="g-cap">${top.res} · 🌸 per ⚡</div>`));
  assert.strictEqual((petsMarket.glance({ pets: PETS }, CTX, {}, "m").html.match(/class="g-row"/g) || []).length, 3);
  assert.match(petsMarket.glance({ pets: { ...PETS, p2pPrices: {} } }, CTX, {}, "s").empty, /No fetchable resource has a price/);
  assert.match(petsMarket.glance({}, CTX, {}, "s").empty, /No price data/);
  const req = (fed) => ({ fed, difficulty: "easy", food: "Pumpkin Soup", energy: 100, xp: 10, price: 1, energyPerSfl: 100 });
  const D = { ...PETS, pets: PETS.pets.map((p, k) => ({ ...p, feeding: [req(k === 0), req(false)] })) };
  const n = D.pets.length;
  assert.ok(n > 1);
  assert.match(petCards.glance({ pets: D }, CTX, {}, "s").html, new RegExp(`<div class="g-big">1<small>/${2 * n}</small></div><div class="g-cap">requests fed today</div>`));
  const chips = [...petCards.glance({ pets: D }, CTX, {}, "l").html.matchAll(/g-chip g-warn">(\d) to feed/g)].map((x) => x[1]);
  assert.strictEqual(chips.length, Math.min(7, n));
  assert.strictEqual(chips[0], "2", "the pets with the most left to feed come first");
  if (n <= 7) assert.strictEqual(chips[chips.length - 1], "1");
  assert.strictEqual((petCards.glance({ pets: D }, CTX, {}, "m").html.match(/class="g-row"/g) || []).length, Math.min(3, n));
  assert.match(petCards.glance({ pets: { ...PETS, pets: PETS.pets.map((p) => ({ ...p, feeding: [] })) } }, CTX, {}, "s").html, /no food requests today/);
  assert.match(petCards.glance({ pets: { ...PETS, pets: [] } }, CTX, {}, "s").empty, /No pets found/);
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
