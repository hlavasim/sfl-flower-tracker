// FISHING as widgets. The maths stays the page's (_fishModel in flowers.html: the fishing history,
// the prices, the farm and the LEVELING plan), handed in as ctx.model(opts); these shape it:
//   ☀️ Today · 🎣 Fish Market bait · 🧂 Safe to age · 🗺️ Marine Marvel planner · 🧺 Your order ·
//   📜 What fishing has cost you · 🐟 What each fish cost you · 🎯 Guaranteed catch · 💎 Treasure.
// Every item name carries its icon (ctx.icon).
import { kpis, bar, bigBar, pill } from "../ui/viz.mjs";
import { sflIcon } from "../core/engine/power-formula.mjs";
import { compact } from "../ui/glance.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n, d) => (+n).toLocaleString("en-US", { maximumFractionDigits: d === undefined ? 0 : d });
const ic = (ctx, n) => (typeof ctx.icon === "function" ? ctx.icon(n) : "");
const named = (ctx, n) => `${ic(ctx, n)}${esc(n)}`;
const needs = (farmId) => ({ farm: { res: "farm", farm: farmId } });
const SEASONS = ["winter", "spring", "summer", "autumn"];

// The model, or why there is none: still loading, or the history failed.
function modelOf(ctx, opts) {
  const m = typeof ctx.model === "function" ? ctx.model(opts || {}) : null;
  if (!m) return { empty: "Reading your fishing history from the raw snapshot diffs…" };
  if (m.error) return { empty: `Could not load the fishing history (${m.error}).` };
  return { m };
}
const view = (fn) => (data, ctx = {}, opts = {}) => {
  const { m, empty } = modelOf(ctx, opts);
  return m ? { html: fn(m, ctx, opts) } : { empty };
};
const approx = (b, n) => (b.est ? "~" : "") + fmt(n, n < 100 ? 2 : 0);

// ☀️ TODAY: which worm to cast this season, then (the page shows 🧂 Age now next) what to make at the Fish Market.
export const fishingToday = {
  type: "fishing-today",
  title: "☀️ Today",
  page: "fishing",
  needs,
  view: view((m, ctx) => {
    const t = m.today, S = sflIcon(), lv = m.lvPlan;
    const val = (s) => s[t.wKey];
    const top = Math.max(...t.wsNow.map(val), 1e-9);
    let h = lv ? `<div class="v-note">By the LEVELING plan (restarts ${esc(t.restarts)}${t.worm ? `, worm ${named(ctx, t.worm)}` : ""}${t.buySalt ? ", buying salt" : ""}): ` +
      `aging is held back by <b>${esc(t.bottleneck)}</b>${t.wormMode === "raw" ? " — the next fish is eaten raw, the worm is picked by raw XP." : " — every next fish goes in the shed, the worm is picked by aged XP."}</div>` : "";
    h += kpis([{ v: t.bestW.worm, l: "🪱 cast this season" }, { v: fmt(val(t.bestW)), l: `XP per FLOWER (${t.wormMode === "aged" ? "aged, salt included" : "raw"})` },
      { v: m.season, l: "season" }]);
    h += `<table class="v-mini"><tr><th>worm</th><th class="r">fish raw</th><th class="r">fish aged</th><th class="r">a cast ${S}</th>` +
      `<th class="r">XP per ${S}</th><th></th></tr>` + t.wsNow.map((s) => `<tr${s === t.bestW ? ' class="hl"' : ""}><td>${named(ctx, s.worm)}</td>` +
        `<td class="r v-dim">${fmt(s.raw)}</td><td class="r v-dim">${fmt(s.aged)}</td><td class="r v-warn">${s.cast.toFixed(3)}</td>` +
        `<td class="r"><b class="${s === t.bestW ? "v-good" : ""}">${fmt(val(s))}</b></td><td style="width:90px">${bar((val(s) / top) * 100, s === t.bestW ? "ok" : "mid")}</td></tr>`).join("") + `</table>`;
    h += `<details class="v-note"><summary style="cursor:pointer">worms by season</summary><table class="v-mini"><tr><th>XP per ${S}</th>` +
      ["Earthworm", "Grub", "Red Wiggler"].map((w) => `<th class="r">${named(ctx, w)}</th>`).join("") + `</tr>` +
      t.year.map((y) => `<tr${y.sn === m.season ? ' class="hl"' : ""}><td>${y.sn}${y.sn === m.season ? " · now" : ""}</td>` + y.stats.map((s) =>
        `<td class="r"><b class="${s.worm === y.top ? "v-good" : ""}">${fmt(val(s))}</b><div class="v-dim">${fmt(t.wormMode === "aged" ? s.aged : s.raw)} XP/fish</div></td>`).join("") + `</tr>`).join("") +
      `</table>Catch shares are community data (107k casts), converted to the season. Which fish each worm and season gives matches the game (fishing.ts) for all 38 fish; ` +
      `the ratios themselves the game rolls on the server, so they are an estimate. Fish per cast ${t.fpc.toFixed(2)} is your own figure.</details>`;
    h += `<div class="v-sub">🏪 Fish Market</div><div class="v-note">` + (!lv ? (t.lvState === "loading" ? "Loading the plan from LEVELING…" : "The LEVELING plan did not load.")
      : `whole year: ${t.baitLine}` + (t.fmNow.length ? `<br>now (${esc(m.season)}): ` + t.fmNow.map((b) => `<b>${named(ctx, b.bait)}</b> → ${named(ctx, b.fish)} ~${(b.perDay * 4).toFixed(1)}/day` +
        (b.canMake != null ? ` · you can make <b>${fmt(b.canMake)}</b>` + (b.missing.length ? ` <span class="v-warn">(missing ${b.missing.map((x) => `${fmt(x.n)}× ${named(ctx, x.ing)}`).join(", ")})</span>` : "") : "")).join(" · ") : "") +
        `<br><span class="v-dim">A bait gives you one fish of your choice for ~10 fish in and one cast. Per salt every fish ages to about the same XP, so a bait helps XP only when slots or fish hold the aging back, not salt. Baits for Marvels are in the Marvel planner below.</span>`) + `</div>`;
    return h;
  }),
};

// 🎣 FISH MARKET BAIT: each bait's season recipe expanded into what its ingredients cost you, and the same bait in every season.
export const fishingBait = {
  type: "fishing-bait",
  title: "🎣 Fish Market bait — what one costs to make",
  page: "fishing",
  needs,
  view: view((m, ctx) => {
    const S = sflIcon();
    let h = `<div class="v-note">These four are <b>bait, not chum</b>: they replace the worm, and the game refuses a cast that carries chum as well. You then <b>pick the fish yourself</b> out of the list. ` +
      `The breakdown is the <b>${esc(m.season)}</b> recipe, expanded into what each ingredient really costs you; the tiles under it price the <b>same bait in every season</b> at that season's recipe and rates, ` +
      `with how many your current stock already covers. The cheapest season is green — the same bait can differ several-fold.</div>`;
    h += m.baits.map((b) => `<div class="v-card"><div class="v-card-h"><span><b>${named(ctx, b.bait)}</b> <span class="v-dim">${b.hours}h per batch</span></span>` +
      `<span><b class="v-warn">${b.complete ? approx(b, b.cost) + " " + S : "—"}</b> <span class="v-dim">+ rod = ${b.complete ? approx(b, b.cost + m.rodP) : "—"} per fish</span></span></div>` +
      `<div class="v-note">` + b.parts.map((p) => `<b>${p.q}×</b> ${named(ctx, p.ing)} <span class="${p.est ? "v-warn" : "v-dim"}">(${p.how} → ${isFinite(p.total) ? p.total.toFixed(2) : "?"})</span>`).join(" &nbsp;+&nbsp; ") + `</div>` +
      `<div class="v-grid">` + SEASONS.map((sn) => {
        const bs = b.bySeason[sn];
        if (!bs) return "";
        const now = sn === m.season;
        return `<div class="v-tile${now ? " on" : ""}"><div class="v-dim">${sn}${now ? " · now" : ""}</div>` +
          `<b class="v-big-n ${bs.cheapest ? "v-good" : bs.unpriced.length ? "v-dim" : "v-warn"}">${bs.ok ? (bs.unpriced.length ? "≥" : "") + fmt(bs.cost, bs.cost < 100 ? 2 : 0) : "—"}</b>` +
          (bs.unpriced.length ? `<div class="v-warn">no price for ${bs.unpriced.map((u) => named(ctx, u)).join(", ")}</div>` : "") +
          `<div class="${bs.canMake > 0 ? "v-good" : "v-dim"}">can make ${fmt(bs.canMake)}</div>` +
          (bs.missing.length ? `<div class="v-warn">missing ${bs.missing.map((x) => `${fmt(x.n)}× ${named(ctx, x.ing)}${x.casts > 0 ? " ≈ " + fmt(x.casts) + " casts" : ""}`).join(", ")}</div>` : "") +
          `<div class="v-dim">${bs.recipe.map(([i, q]) => `${q}× ${named(ctx, i)}`).join(" + ")}</div></div>`;
      }).join("") + `</div><div class="v-note">forces: ${b.forces.map((f) => named(ctx, f)).join(" · ")}</div></div>`).join("");
    h += `<div class="v-note v-warn">⚠ For XP a bait pays only when the shed is held back by slots or fish, not by salt — per salt every fish ages to about the same XP, and a bait burns ~10 fish plus a cast for one. ` +
      (m.lvPlan ? `Your LEVELING plan: <b>${m.today.baitLine}</b>.` : "") + ` Otherwise a bait is for reaching a fish that will not turn up on its own, or a map piece.` +
      (m.baits.some((b) => b.est) ? ` A <b>~</b> means an ingredient you have never caught, priced at the median rate of its tier — an estimate, but never a reason to drop the route.` : "") +
      (m.rows.some((r) => r.qty < 20) ? ` Rates from small samples carry their catch count, because a fish landed 10 times sets its own price to within a factor of two at best.` : "") + `</div>`;
    return h;
  }),
};

// 🧂 SAFE TO AGE: every fish the shed takes — first those no bait recipe wants in any season, then the rest.
export const fishingSafeAge = {
  type: "fishing-safe-age",
  title: "🧂 Safe to age — the fish no bait recipe wants",
  page: "fishing",
  needs,
  view: view((m, ctx) => {
    const a = m.aging;
    const wanted = (r) => {
      const parts = r.wantedBy.map((w) => `${w.qty}× ${named(ctx, w.bait)} (${w.all ? "all seasons" : w.sns.join("/")})${w.now ? ' <span class="v-good">· now</span>' : ""}`);
      if (r.dishes.length) parts.push(r.dishes.map((d) => named(ctx, d)).join(", "));
      return parts.join(", ");
    };
    const row = (r, note) => `<tr class="v-age-row"><td style="white-space:nowrap">${ic(ctx, r.iconName)}<span class="${r.qty > 0 ? "" : "v-dim"}">${esc(r.name)}</span></td>` +
      `<td class="v-dim">${esc(r.tier)}</td><td class="r"><b class="${r.qty > 0 ? "" : "v-dim"}">${fmt(r.qty)}</b></td><td class="r v-dim">${fmt(r.base)}</td>` +
      `<td class="r">${fmt(r.agedXp)}</td><td class="r v-dim">${fmt(r.saltEach)}</td><td class="r v-dim">${r.hours.toFixed(1)}h</td>` +
      `<td class="r"><b class="${r.xpWait > 0 ? "v-good" : "v-dim"}">${r.xpWait > 0 ? fmt(r.xpWait) : "—"}</b></td><td class="r v-warn">${r.saltWait > 0 ? fmt(r.saltWait) : "—"}</td>` +
      `<td class="${note ? "v-warn" : "v-dim"}" style="font-size:12px">${note || "nothing"}</td></tr>`;
    let h = `<div class="v-note">The four baits eat <b>sixteen</b> season-specific ingredient lists between them, and the <b>${a.free.length}</b> above the line are on <b>none</b> of them — ` +
      `no season, no bait, ever — so the shed costs you nothing but salt. Below the line is <b>every other fish the shed takes</b>, with the bait and the season that wants it, so all ${a.rows.length} are in one place. ` +
      `<b>Crab Stick never competes</b>: it is all crustaceans. The shed takes <b>every fish in the game</b>, the three sharks included — an <b>Aged White Shark is ${fmt(a.whiteShark)} XP</b>, the biggest single item there is. ` +
      (a.bySalt ? `Rows run by <b>XP gained over eating raw, per salt</b> — your LEVELING plan is held back by salt —` : `Rows run by <b>aged XP per fish</b> — a rack slot is the scarce thing —`) +
      ` with anything you hold <b>none</b> of pushed to the bottom of its half. Stock is your live inventory; prime-aged is folded in at <b>${(m.primeChance * 100).toFixed(0)}%</b> → ×${m.primeFactor.toFixed(3)}${m.agedBoostNote}, ` +
      `and aging times carry your Speedy Aging / Salt Sculpture boosts (×${a.timeMult.toFixed(2)}).</div>`;
    h += kpis([{ v: fmt(a.tot.fish), l: `free to age · ${a.free.length} species no recipe wants` }, { v: fmt(a.tot.xp), l: "aged XP waiting in that stock" },
      { v: fmt(a.tot.salt), l: `salt it costs · you hold ${fmt(a.saltHeld)}${m.saltP > 0 ? ` · ${fmt(a.tot.salt * m.saltP, 1)} FLOWER` : ""}` },
      { v: `${a.busy} / ${a.slots}`, l: "rack slots busy now" },
      { v: a.clearText, l: `to clear it · ${a.slots} slot${a.slots === 1 ? "" : "s"}${a.gap > 0 ? `, a visit every ${a.gap.toFixed(1)}h` : " running non-stop"}` }]) +
      `<div class="v-note">salt held against the free stock's need</div>` + bar(a.tot.salt > 0 ? (a.saltHeld / a.tot.salt) * 100 : 100);
    h += `<div style="overflow-x:auto"><table class="v-mini"><tr><th>fish</th><th>tier</th><th class="r">you hold</th><th class="r">raw XP</th><th class="r">aged XP each</th>` +
      `<th class="r">salt each</th><th class="r">ages in</th><th class="r">XP waiting</th><th class="r">salt needed</th><th>wanted by</th></tr>` +
      a.free.map((r) => row(r, r.dishes.length ? r.dishes.map((d) => named(ctx, d)).join(", ") : "")).join("") +
      `<tr><td colspan="10" class="v-sub">↓ A recipe wants these — aging one means catching it again before you can craft that bait. “· now” is the season you are in.` +
      (a.freeForAll ? ` <span class="v-good">Your LEVELING plan makes no baits and no Marvel route is ticked, so these may go in the shed too (☀️ Today lists what to keep).</span>` : "") + `</td></tr>` +
      a.taken.map((r) => row(r, wanted(r))).join("") + `</table></div>`;
    if (a.saltHeld < a.tot.salt) h += `<div class="v-note v-warn">⚠ The free stock alone needs <b>${fmt(a.tot.salt)} salt</b> and you hold <b>${fmt(a.saltHeld)}</b> — short by ${fmt(a.tot.salt - a.saltHeld)}. Salt is the binding input here, not the fish.</div>`;
    if (a.free.some((r) => r.dishes.length)) {
      h += `<div class="v-note">The honest caveat above the line: <b>no bait recipe</b> wants these, but a <b>dish</b> still can — ` +
        a.free.filter((r) => r.dishes.length).map((r) => `${named(ctx, r.name)} → ${r.dishes.map((d) => named(ctx, d)).join(", ")}`).join(" · ") + `. Age them freely if you do not cook those.</div>`;
    }
    h += `<div class="v-note">Everything the shed would take, both sides of the line together: <b>${fmt(a.all.fish)} fish</b>, <b>${fmt(a.all.xp)} aged XP</b> and <b>${fmt(a.all.salt)} salt</b> — ` +
      `but the fish below the line are bait, and a bait you have aged is a bait you have to fish for twice.</div>`;
    return h;
  }),
};

// The Marvel drop-chance boosts, per copy (⚙).
const BOOSTS = [{ key: "moon", label: "Full Moon (2× drop chance)", kind: "bool" }, { key: "helm", label: "Deep Sea Helm (2×)", kind: "bool" },
  { key: "guardian", label: "Guardian (2×)", kind: "bool" }];
const boostTitle = (base, o) => {
  const on = [o.moon && "🌕", o.helm && "⛑️", o.guardian && "🛡️"].filter(Boolean);
  return on.length ? `${base} · ${on.join("")}` : base;
};

// 🗺️ MARINE MARVEL PLANNER: every remaining Marvel, every route to each source, the cheapest marked; tick routes into the order.
export const fishingMarvels = {
  type: "fishing-marvels",
  title: "🗺️ Marine Marvel planner — what each map really costs",
  titleFor: (o) => boostTitle("🗺️ Marine Marvel planner — what each map really costs", o),
  page: "fishing",
  needs,
  optionsLabel: "Boosts",
  options: BOOSTS,
  view: view((m, ctx) => {
    const v = m.marvels, S = sflIcon();
    const pace = (totalCasts) => (totalCasts > 0 && (v.castsPerDay > 0 || v.activePerDay > 0)
      ? " ≈ " + (v.activePerDay > 0 ? fmt(Math.ceil(totalCasts / v.activePerDay)) + " days fishing daily at " + Math.round(v.activePerDay) : "")
        + (v.activePerDay > 0 && v.castsPerDay > 0 ? ", " : "")
        + (v.castsPerDay > 0 ? fmt(Math.ceil(totalCasts / v.castsPerDay)) + " at your long-run " + Math.round(v.castsPerDay) + "/day" : "")
      : "");
    const routeLine = (r) => {
      const units = r.kind === "random" ? `${fmt(r.n)} casts, fishing normally with ${named(ctx, r.worm)}`
        : r.kind === "pair" ? `${fmt(r.n)}× ${named(ctx, r.pair.bait)} + ${r.pair.qty}× ${named(ctx, r.pair.chum)}` : `${fmt(r.n)}× ${named(ctx, r.label)}`;
      const bom = r.kind !== "bait" ? "" : `<div class="v-note" style="padding-left:22px;margin:2px 0">🧾 ` + r.bait.parts.map((pt) => `<b>${fmt(pt.q * r.n)}×</b> ${named(ctx, pt.ing)} ` +
        `<span class="${pt.est ? "v-warn" : "v-dim"}">(${pt.casts > 0 ? fmt(Math.ceil(pt.casts * pt.q * r.n)) + " casts" + (pt.est ? ", est." : "")
          // a pot ingredient costs no casts but is not free: its own chum can be another crafted bait
          : pt.chum ? "pot + " + fmt(pt.chumQty * pt.q * r.n) + "× " + named(ctx, pt.chum) : "pot, no chum"})</span>`).join(" + ") +
        ` <span class="v-dim">· ${r.bait.hours}h/batch</span></div>`;
      return `<div class="v-mvl-route${r.ticked ? " on" : ""}"><div class="v-card-h"><label class="${r.isBest ? "v-good" : ""}">` +
        `<input type="checkbox"${r.ticked ? " checked" : ""} onchange="_fishPlanToggle(${esc(JSON.stringify(r.key))},this.checked)"> ${r.isBest ? "▸ " : ""}${units}</label>` +
        `<b class="${r.isBest ? "v-warn" : "v-dim"}">${r.est ? "~" : ""}${fmt(r.total, 0)} ${S}</b></div>${bom}` +
        `<div class="v-dim" style="padding-left:22px;font-size:12px">⏱ ${fmt(Math.ceil(r.totalCasts))} casts${pace(r.totalCasts)}</div></div>`;
    };
    const source = (e, isBest) => `<div class="v-mvl-src"><div class="${isBest ? "" : "v-dim"}">${isBest ? "●" : "○"} ${named(ctx, e.fish)} ` +
      `<span class="v-dim">${(e.p * 100).toFixed(e.p < 0.01 ? 2 : 1)}% per catch → ${fmt(1 / e.p)} needed per piece</span>` +
      (!e.inSeason ? ` <span class="v-warn">✖ out of season (${esc(e.seasons.join("/"))}) — bait only</span>` : "") + `</div>` +
      (e.routes.length ? e.routes.map(routeLine).join("") : `<div class="v-dim" style="padding-left:12px">no route at all — out of season, and no bait or pair lists it</div>`) + `</div>`;
    const cards = v.cards.map((c) => (c.owned
      ? `<div class="v-card" style="opacity:0.6"><b class="v-good">✔ ${esc(c.marvel)}</b> <span class="v-dim">already caught — pieces no longer drop for it</span></div>`
      : `<div class="v-card"><div class="v-card-h"><span>${ic(ctx, c.marvel)}<b>${esc(c.marvel)}</b>${c.chapter ? ` <span class="v-dim">${esc(c.chapter)}</span>` : ""}</span>` +
        `<span class="v-dim">pieces held <input type="number" min="0" max="8" value="${c.held}" style="width:3.5em" onchange="_fishSetPieces('${esc(c.marvel.replace(/'/g, "\\'"))}',this.value)"> / 9 → <b>${c.pieces} to go</b></span></div>` +
        bigBar((c.held / 9) * 100) + c.evaluated.map((e, i) => source(e, i === 0)).join("") + `</div>`)).join("");
    return `<div class="v-note">Nine pieces per Marvel, dropping only from the two named fish. Catch rates are the community dump's <b>107,310 catches</b>, inverted to P(fish|bait) and undiluted for <b>${esc(m.season)}</b> — not this farm's log, which is sound on common fish and up to <b>20× out</b> on the rare ones that actually carry map pieces. ` +
      `A fish <b class="v-warn">out of season cannot be fished for at all</b>, so its only route is a crafted bait, which ignores the season gate. The winner is marked ● and expanded into a shopping list. ` +
      `Only the permanent Marvels and the <b>${esc(v.chapter)}</b> chapter are listed; a past chapter's Marvels cannot be obtained at all.</div>` +
      `<div class="v-note">Drop chance: ${[v.moon && "Full Moon", v.helm && "Deep Sea Helm", v.guardian && "Guardian"].filter(Boolean).join(" + ") || "no boost"} ` +
      `<b>= ${v.mult}× drop chance</b> <span class="v-dim">(⚙ to change)</span></div>` + cards +
      `<div class="v-note">Every remaining Marvel by its cheapest route: <b class="v-warn">${fmt(v.planTotal, 0)} ${S}</b>${v.planKnown ? "" : ' <span class="v-dim">(excluding sources with no route at all)</span>'}</div>` +
      `<div class="v-note v-dim">Piece counts are typed in because the farm API does not publish them. Pieces are consumed at 9, so 8 is the most you can hold.</div>`;
  }),
};

// 🧺 YOUR ORDER: every ticked route folded into one shopping list (shared ingredients once, sub-recipes expanded).
export const fishingOrder = {
  type: "fishing-order",
  title: "🧺 Your order",
  titleFor: (o) => boostTitle("🧺 Your order", o),
  page: "fishing",
  needs,
  optionsLabel: "Boosts",
  options: BOOSTS,
  view: view((m, ctx) => {
    const o = m.order, a = m.marvels.activePerDay;
    if (!o.chosen.length) return `<div class="v-note">Nothing ticked yet. Tick a route on any Marvel in the planner and everything it needs is added up here — one list, with the shared ingredients merged, so two plans running through Fish Flake do not have you fish for the same Anchovy twice.</div>`;
    return `<div class="v-note">` + o.chosen.map((c) => `<div>✔ <b>${esc(c.marvel)}</b> <span class="v-dim">via ${esc(c.fish)} — ${c.r.kind === "random" ? fmt(c.n) + " casts" : c.r.kind === "pair" ? `${fmt(c.n)}× ${named(ctx, c.r.pair.bait)} + ${c.r.pair.qty}× ${named(ctx, c.r.pair.chum)}` : `${fmt(c.n)}× ${named(ctx, c.r.label)}`}</span></div>`).join("") + `</div>` +
      kpis([{ v: String(o.chosen.length), l: "marvels" }, { v: `${fmt(o.flower, 0)} FLOWER`, l: "total cost" }, { v: fmt(Math.ceil(o.casts)), l: "total casts · one rod each" },
        { v: a > 0 ? fmt(Math.ceil(o.casts / a)) + " days" : "—", l: a > 0 ? `time fishing at your ${Math.round(a)}/day` : "time fishing" },
        { v: o.craftHours > 0 ? fmt(Math.ceil(o.craftHours)) + " h" : "—", l: "crafting · serial, divide by your slots" }]) +
      (Object.keys(o.baits).length ? `<div class="v-note">🥣 <b>craft:</b> ` + Object.entries(o.baits).sort((x, y) => y[1] - x[1])
        .map(([b, n]) => `<b>${fmt(n)}×</b> ${named(ctx, b)} <span class="v-dim">(${m.baitHours[b] || 0}h each)</span>`).join(" &nbsp;·&nbsp; ") + `</div>` : "") +
      `<table class="v-mini"><tr><th>you need</th><th class="r">qty</th><th>have</th><th>where it comes from</th></tr>` + o.rows.map((r) =>
        `<tr><td>${named(ctx, r.name)}</td><td class="r"><b>${fmt(Math.ceil(r.qty))}</b></td>` +
        `<td style="width:110px">${r.have > 0 ? `<span class="v-good">${fmt(r.have)}</span>${bar((r.have / r.qty) * 100)}` : ""}</td><td class="v-dim" style="font-size:12px">${r.source}</td></tr>`).join("") +
      `</table><div style="margin-top:8px"><button class="v-btn" onclick="_fishPlanClear()">Clear the order</button></div>`;
  }),
};

// 📜 WHAT FISHING HAS COST YOU: the history as tiles.
export const fishingCost = {
  type: "fishing-cost",
  title: "📜 What fishing has actually cost you",
  page: "fishing",
  needs,
  view: view((m) => {
    const d = m.d;
    return `<div class="v-note">Rebuilt from <b>${d.diffs}</b> raw snapshot diffs that consumed a rod, over ${m.days.toFixed(0)} days. A diff is a whole session, not one cast — so only fish are counted here, because a species can only come out of a rod.</div>` +
      kpis([{ v: fmt(d.rods), l: "rods spent" }, { v: fmt(d.baitTotal), l: `bait used · ${(m.baitRatio * 100).toFixed(0)}% of rods` }, { v: fmt(d.fishTotal), l: "fish landed" },
        { v: m.fishPerCast.toFixed(2), l: "fish per cast" },
        { v: m.costPerCast > 0 ? m.costPerCast.toFixed(3) + " FLOWER" : "—", l: m.rodP > 0 ? `cost per cast · rod ${m.rodP.toFixed(3)} + bait ${m.baitAvg.toFixed(3)}` : "cost per cast · price feed down" }]) +
      `<div class="v-note v-warn">⚠ Deltas are <b>net</b>: bait or rods crafted inside the same window cancel against what was spent, which is why bait reads ${(m.baitRatio * 100).toFixed(0)}% of rods when a cast burns one of each. Casts scale to <b>bait</b>, the tighter of the two. Read cost/cast as a floor.</div>`;
  }),
};

const rowsTable = (pick) => (data, ctx = {}, opts = {}) => {
  const { m, empty } = modelOf(ctx, opts);
  if (!m) return { rows: [], footer: "", empty };
  return pick(m, ctx);
};

// 🐟 WHAT EACH FISH COST YOU: your own catch rate priced at the cost per cast, then through the aging shed.
export const fishingPerFish = {
  type: "fishing-per-fish",
  title: "🐟 What each fish cost you — and what it paid back",
  page: "fishing",
  needs,
  defaults: {},
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  columns: [
    { key: "name", label: "fish", fmt: (v, r) => `<span style="white-space:nowrap">${r.iconHtml}<b>${esc(v)}</b></span>` },
    { key: "qty", label: "caught", align: "right", fmt: (v) => fmt(v) },
    { key: "castsEach", label: "casts each", align: "right", fmt: (v) => v.toFixed(1) },
    { key: "cost", label: "cost each", align: "right", fmt: (v) => `<span class="v-warn">${v.toFixed(2)}</span>` },
    { key: "xp", label: "raw XP", align: "right", fmt: (v) => (v ? String(v) : "—") },
    { key: "agedXp", label: "aged XP", align: "right", fmt: (v) => (v > 0 ? fmt(v) : "—") },
    { key: "salt", label: "+ salt", align: "right", fmt: (v) => (v ? String(v) : "—") },
    { key: "xpPerSfl", label: "aged XP / FLOWER", align: "right", fmt: (v, r) => (v > 0 ? `<b>${v.toFixed(1)}</b>${bar(r.rel)}` : "—") },
    { key: "value", label: "engine value", align: "right", extra: true, fmt: (v) => (v > 0 ? `<span class="v-good">${v.toFixed(2)}</span>` : "—") },
  ],
  build: rowsTable((m, ctx) => {
    const top = Math.max(...m.rows.map((r) => r.xpPerSfl), 1e-9);
    const rows = m.rows.map((r) => ({ ...r, rel: (r.xpPerSfl / top) * 100, iconHtml: ic(ctx, r.name) }));
    const summary = `<div class="v-note">Your own catch rate, priced at the live cost per cast — then <b>through the Aging Shed</b>: aging returns 3×/4×/5× base XP (stepping at 200 and 330 base) for one fish plus <b>maxXP/50 salt</b>, ` +
      `so the cost adds the salt and the ranking uses the aged figure. Prime-aged at <b>${(m.primeChance * 100).toFixed(0)}%</b> → ×${m.primeFactor.toFixed(3)}${m.agedBoostNote}. ` +
      `Species with fewer than 3 caught are hidden. <b class="v-warn">A worm does not pick the fish</b> — the cost is what one would cost if you fished for it alone, a price, not a choice (which worm to cast is in ☀️ Today). Rows run by how many you caught.</div>`;
    return { rows, summary, footer: "", empty: "No species caught 3 times or more yet." };
  }),
};

// 🎯 GUARANTEED CATCH: worm + chum pairs that force a named fish, against fishing for it at random.
export const fishingGuaranteed = {
  type: "fishing-guaranteed",
  title: "🎯 Guaranteed catch — is the special bait worth it?",
  page: "fishing",
  needs,
  defaults: {},
  rowKey: (r) => `${r.bait}|${r.chum}|${r.fish}`,
  rowLabel: (r) => `${r.bait} + ${r.chum}`,
  columns: [
    { key: "bait", label: "bait + chum", fmt: (v, r) => `<span class="v-ii">${r.baitHtml} + ${r.qty}× ${r.chumHtml}</span>` },
    { key: "fish", label: "guarantees", fmt: (v, r) => `<span class="v-ii">${r.fishHtml}</span>` },
    { key: "cost", label: "cost", align: "right", fmt: (v) => `<span class="v-warn">${v.toFixed(2)}</span>` },
    { key: "xp", label: "aged XP", align: "right", fmt: (v) => (v > 0 ? fmt(v) : "—") },
    { key: "xpPerSfl", label: "aged XP / FLOWER", align: "right", fmt: (v) => (v > 0 ? `<b>${v.toFixed(1)}</b>` : "—") },
    { key: "vsRandom", label: "vs random", align: "right", fmt: (v) => (v === null || v === undefined ? `<span class="v-dim">never caught</span>`
      : pill((v >= 0 ? "+" : "") + v.toFixed(0) + "%", v <= 0 ? "ok" : "bad")) },
  ],
  build: rowsTable((m, ctx) => {
    const rows = m.gr.map((g) => ({ ...g, baitHtml: named(ctx, g.bait), chumHtml: named(ctx, g.chum), fishHtml: named(ctx, g.fish) }));
    const br = m.bestRandom, g0 = m.gr[0];
    const footer = `<div class="v-note">The last column is the whole question: <b>negative means the guaranteed route is CHEAPER</b> than fishing for it at random, because a rare fish costs many wasted casts.` +
      (br ? ` Your most caught fish is <b>${named(ctx, br.name)}</b> at ${br.xpPerSfl.toFixed(1)} XP/FLOWER` +
        (g0 && g0.xpPerSfl > br.xpPerSfl ? `, which <b class="v-good">${named(ctx, g0.bait)} + ${named(ctx, g0.chum)}</b> beats at ${g0.xpPerSfl.toFixed(1)}.` : ", which no guaranteed route beats.") : "") + `</div>`;
    const summary = `<div class="v-note">Bait + chum that guarantees a named fish: one cast, no luck. Cost is rod + bait + chum at live p2p, directly comparable with the random rates.</div>`;
    return { rows, summary, footer, empty: "No guaranteed pairs." };
  }),
};

// 💎 TREASURE: what fishing gives back, counted only where no shovel moved.
export const fishingTreasure = {
  type: "fishing-treasure",
  title: "💎 Treasure — what fishing gives back",
  page: "fishing",
  needs,
  view: view((m, ctx) => {
    const { tr, trVal } = m.treasure;
    let h = `<div class="v-note">Clam Shell, Old Bottle, Pipi and friends drop from <b>digging too</b>, and a shovel moved in most of your fishing diffs. So this is counted <b>only</b> over the ${tr.diffs} diffs where no shovel moved at all — ${fmt(tr.rods)} of ${fmt(m.d.rods)} rods.</div>`;
    if (!(tr.total > 0)) return h + `<div class="v-dim">No clean sample yet.</div>`;
    const top = Math.max(...Object.values(tr.items), 1);
    h += kpis([{ v: `${trVal.toFixed(2)} FLOWER`, l: `worth, over ${fmt(tr.rods)} rods` }, { v: (trVal / tr.rods).toFixed(4), l: "FLOWER back per cast" },
      { v: m.costPerCast > 0 ? ((trVal / tr.rods) / m.costPerCast * 100).toFixed(0) + "%" : "—", l: "of what a cast costs" }]);
    h += `<table class="v-mini"><tr><th>item</th><th class="r">found</th><th class="r">per rod</th><th></th></tr>` + Object.entries(tr.items).sort((a, b) => b[1] - a[1]).map(([k, q]) =>
      `<tr><td>${named(ctx, k)}</td><td class="r"><b>${fmt(q)}</b></td><td class="r v-dim">${(q / tr.rods).toFixed(3)}</td><td style="width:110px">${bar((q / top) * 100, "ok")}</td></tr>`).join("") + `</table>`;
    return h;
  }),
};

export const FISHING_WIDGETS = [fishingToday, fishingBait, fishingSafeAge, fishingMarvels, fishingOrder, fishingCost, fishingPerFish, fishingGuaranteed, fishingTreasure];

// ── iPhone glance models (the same model as the full widget); ui/glance-templates
// offers the looks ──
const model = (fn) => (data, ctx = {}, opts = {}) => {
  const { m, empty } = modelOf(ctx, opts);
  return m ? fn(m, ctx, opts) : { empty };
};
const FL = " 🌸";
const share = (v, top) => (top > 0 ? Math.min(100, Math.max(0, (v / top) * 100)) : 0);

// today: the worm to cast this season (its XP per FLOWER); the three worms; what the Fish Market makes now
fishingToday.look = "number";
fishingToday.glanceModel = model((m, ctx) => {
  const t = m.today, val = (s) => s[t.wKey], top = Math.max(...t.wsNow.map(val), 1e-9);
  const fm = t.fmNow[0];
  return {
    head: { value: compact(val(t.bestW)), unit: " XP/🌸", cap: `cast ${t.bestW.worm} · ${m.season}`, hero: ic(ctx, t.bestW.worm) },
    items: t.wsNow.map((s) => ({ icon: ic(ctx, s.worm), name: s.worm, sub: `${s.cast.toFixed(3)}${FL} a cast`, value: compact(val(s)),
      tone: s === t.bestW ? "ok" : "", pct: share(val(s), top) })),
    // a tile holds one short word: "Red Wiggler" → "Wiggler"
    tiles: [{ label: "cast", value: t.bestW.worm.split(" ").pop() }, { label: "XP/🌸", value: compact(val(t.bestW)) },
      { label: "season", value: m.season }, { label: "fish/cast", value: t.fpc.toFixed(2) }],
    foot: fm ? `Fish Market: ${fm.bait} → ${fm.fish} ~${(fm.perDay * 4).toFixed(1)}/day` : "",
  };
});

// bait: the cheapest Fish Market bait this season; every bait's cost and how many you can make
fishingBait.look = "number-list-2";
fishingBait.glanceModel = model((m, ctx) => {
  const list = m.baits.filter((b) => b.complete).sort((a, b) => a.cost - b.cost);
  if (!list.length) return { empty: "No bait could be priced." };
  const can = (b) => (b.bySeason[m.season] ? b.bySeason[m.season].canMake : 0);
  const b0 = list[0], top = Math.max(...list.map((b) => b.cost), 1e-9);
  return {
    head: { value: approx(b0, b0.cost), unit: FL, cap: `${b0.bait} · can make ${fmt(can(b0))}`, hero: ic(ctx, b0.bait) },
    items: list.map((b) => ({ icon: ic(ctx, b.bait), name: b.bait, sub: `can make ${fmt(can(b))} · ${b.hours}h`, value: `${approx(b, b.cost)}${FL}`,
      tone: b === b0 ? "ok" : "", pct: share(b.cost, top) })),
    tiles: [{ label: "cheapest", value: `${approx(b0, b0.cost)}${FL}` }, { label: "can make", value: fmt(can(b0)) },
      { label: "season", value: m.season }],
    foot: `+ rod = ${approx(b0, b0.cost + m.rodP)}${FL} per fish`,
  };
});

// safe to age: the free fish (ring: the salt held against their need); the held ones by the XP they wait with
fishingSafeAge.look = "number";
fishingSafeAge.glanceModel = model((m, ctx) => {
  const a = m.aging, cover = a.tot.salt > 0 ? (a.saltHeld / a.tot.salt) * 100 : 100;
  const held = a.free.filter((r) => r.qty > 0).sort((x, y) => y.xpWait - x.xpWait);
  const top = Math.max(...held.map((r) => r.xpWait), 1e-9);
  return {
    head: { value: fmt(a.tot.fish), unit: " fish", cap: `free to age · ${compact(a.tot.xp)} XP`, ring: Math.min(100, cover), ringTone: cover >= 100 ? "ok" : "warn" },
    items: held.map((r) => ({ icon: ic(ctx, r.iconName), name: r.name, sub: `${fmt(r.qty)} held · ${r.hours.toFixed(1)}h`, value: compact(r.xpWait), pct: share(r.xpWait, top) })),
    tiles: [{ label: "to age", value: fmt(a.tot.fish) }, { label: "aged XP", value: compact(a.tot.xp) },
      { label: "salt", value: fmt(a.tot.salt) }, { label: "rack", value: `${a.busy}/${a.slots}` }],
    foot: `salt ${fmt(a.saltHeld)} of ${fmt(a.tot.salt)} · clear in ${a.clearText}`,
  };
});

// Marvels: how many maps are left (ring: caught) and their cheapest total; each map by its cheapest route
fishingMarvels.look = "number-list-2";
fishingMarvels.glanceModel = model((m, ctx) => {
  const v = m.marvels, left = v.cards.filter((c) => !c.owned), owned = v.cards.filter((c) => c.owned);
  const best = (c) => { const e = c.evaluated[0]; const r = e && (e.routes.find((x) => x.isBest) || e.routes[0]); return r ? { e, r } : null; };
  const list = left.map((c) => ({ c, b: best(c) })).sort((x, y) => (x.b ? x.b.r.total : Infinity) - (y.b ? y.b.r.total : Infinity));
  const items = [...list.map(({ c, b }) => ({ icon: ic(ctx, c.marvel), name: c.marvel, sub: b ? `via ${b.e.fish}` : `${c.pieces} to go`,
    value: b ? `${b.r.est ? "~" : ""}${compact(b.r.total)}${FL}` : "no route", pct: (c.held / 9) * 100 })),
    ...owned.map((c) => ({ icon: ic(ctx, c.marvel), name: c.marvel, sub: "caught", chip: { text: "caught", tone: "ok" }, pct: 100 }))];
  const caught = v.cards.length ? (owned.length / v.cards.length) * 100 : 0;
  const head = left.length
    // planKnown false: some map has no route at all, so the total is a floor ("≥")
    ? { value: left.length, unit: `/${v.cards.length}`, cap: `maps left · ${v.planKnown ? "" : "≥ "}${compact(v.planTotal)}${FL} cheapest`, ring: caught, ringTone: "accent" }
    : { value: "✓", tone: "ok", cap: "every Marine Marvel caught", ring: 100 };
  return { head, items,
    tiles: [{ label: "maps left", value: `${left.length}/${v.cards.length}` }, { label: "cheapest", value: `${v.planKnown ? "" : "≥ "}${compact(v.planTotal)}${FL}` },
      { label: "drop rate", value: `${v.mult}×` }],
    foot: `${v.chapter} chapter + permanent Marvels${v.planKnown ? "" : " · cheapest excludes maps with no route"}` };
});

// order: what the ticked routes cost; the shopping list, how much of each you already have
fishingOrder.look = "number";
fishingOrder.glanceModel = model((m, ctx) => {
  const o = m.order, a = m.marvels.activePerDay;
  if (!o.chosen.length) return { empty: "Nothing ticked yet — tick a route in the Marvel planner." };
  return {
    head: { value: compact(o.flower), unit: FL, cap: `${o.chosen.length} marvel${o.chosen.length === 1 ? "" : "s"} · ${fmt(Math.ceil(o.casts))} casts` },
    items: o.rows.map((r) => ({ icon: ic(ctx, r.name), name: r.name, sub: r.have > 0 ? `have ${fmt(r.have)}` : "", value: fmt(Math.ceil(r.qty)),
      pct: r.qty > 0 ? Math.min(100, (r.have / r.qty) * 100) : 100 })),
    tiles: [{ label: "marvels", value: o.chosen.length }, { label: "FLOWER", value: compact(o.flower) },
      { label: "casts", value: fmt(Math.ceil(o.casts)) }, ...(a > 0 ? [{ label: "days", value: fmt(Math.ceil(o.casts / a)) }] : []),
      ...(o.craftHours > 0 ? [{ label: "crafting", value: `${fmt(Math.ceil(o.craftHours))}h` }] : [])],
    foot: o.chosen.map((c) => c.marvel).join(", "),
  };
});

// cost: what a cast costs; the rods and each worm spent (share of the rods)
fishingCost.look = "number";
fishingCost.glanceModel = model((m, ctx) => {
  const d = m.d;
  const spent = [["Rod", d.rods], ...Object.entries(d.bait || {}).sort((x, y) => y[1] - x[1])];
  return {
    head: m.costPerCast > 0 ? { value: m.costPerCast.toFixed(3), unit: FL, cap: `a cast · over ${fmt(d.rods)} rods` } : { value: "—", cap: "cost per cast · price feed down" },
    items: spent.map(([n, q]) => ({ icon: ic(ctx, n), name: n, sub: n === "Rod" ? "rods spent" : "bait used", value: compact(q), pct: share(q, d.rods) })),
    tiles: [{ label: "rods", value: compact(d.rods) }, { label: "fish", value: compact(d.fishTotal) }, { label: "per cast", value: m.fishPerCast.toFixed(2) },
      { label: "days", value: m.days.toFixed(0) }],
    foot: `${d.diffs} diffs · ${compact(d.fishTotal)} fish landed`,
  };
});

// per fish: the fish that pays the most aged XP per FLOWER; the species, best first
fishingPerFish.look = "number-list-2";
fishingPerFish.glanceModel = (data, ctx = {}, opts = {}) => {
  const out = fishingPerFish.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const list = out.rows.slice().sort((a, b) => b.xpPerSfl - a.xpPerSfl), r0 = list[0];
  const most = out.rows.slice().sort((a, b) => b.qty - a.qty)[0];
  return {
    head: { value: compact(r0.xpPerSfl), unit: " XP/🌸", cap: `${r0.name} · aged`, hero: r0.iconHtml },
    items: list.map((r) => ({ icon: r.iconHtml, name: r.name, sub: `${fmt(r.qty)} caught · ${r.cost.toFixed(2)} each`, value: r.xpPerSfl > 0 ? compact(r.xpPerSfl) : "—", pct: r.rel })),
    tiles: [{ label: "best", value: compact(r0.xpPerSfl) }, { label: "caught", value: fmt(list.reduce((s, r) => s + r.qty, 0)) },
      { label: "species", value: list.length }],
    foot: "aged XP per FLOWER, salt included",
  };
};

// guaranteed: the best worm + chum pair; the pairs, aged XP per FLOWER and their cost against fishing at random
fishingGuaranteed.look = "number-list-2";
fishingGuaranteed.glanceModel = (data, ctx = {}, opts = {}) => {
  const out = fishingGuaranteed.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const g0 = out.rows[0], top = Math.max(...out.rows.map((g) => g.xpPerSfl), 1e-9);
  const cheaper = out.rows.filter((g) => g.vsRandom != null && g.vsRandom <= 0).length;
  return {
    head: { value: compact(g0.xpPerSfl), unit: " XP/🌸", cap: `${g0.fish} · ${g0.bait} + ${g0.chum}`, hero: ic(ctx, g0.fish) },
    items: out.rows.map((g) => ({ icon: ic(ctx, g.fish), name: g.fish, sub: `${g.qty}× ${g.chum}`, pct: share(g.xpPerSfl, top),
      ...(g.vsRandom == null ? { value: compact(g.xpPerSfl) }
        : { chip: { text: `${g.vsRandom >= 0 ? "+" : "−"}${Math.abs(g.vsRandom).toFixed(0)}%`, tone: g.vsRandom <= 0 ? "ok" : "bad" } }) })),
    tiles: [{ label: "best", value: compact(g0.xpPerSfl) }, { label: "pairs", value: out.rows.length },
      { label: "vs random", value: cheaper }],
    foot: "negative % = cheaper than fishing for it at random",
  };
};

// treasure: how much of a cast's cost comes back; what was found
fishingTreasure.look = "number";
fishingTreasure.glanceModel = model((m, ctx) => {
  const { tr, trVal } = m.treasure;
  if (!(tr.total > 0)) return { empty: "No clean treasure sample yet." };
  const back = trVal / tr.rods, found = Object.entries(tr.items).sort((a, b) => b[1] - a[1]), top = found.length ? found[0][1] : 1;
  return {
    head: m.costPerCast > 0 ? { value: ((back / m.costPerCast) * 100).toFixed(0), unit: "%", cap: `of a cast's cost comes back · ${back.toFixed(4)}${FL}` }
      : { value: back.toFixed(4), unit: FL, cap: "back per cast" },
    items: found.map(([k, q]) => ({ icon: ic(ctx, k), name: k, sub: `${(q / tr.rods).toFixed(3)} per rod`, value: fmt(q), pct: share(q, top) })),
    tiles: [{ label: "worth", value: `${trVal.toFixed(2)}${FL}` }, { label: "per cast", value: back.toFixed(4) },
      ...(m.costPerCast > 0 ? [{ label: "of a cast", value: `${((back / m.costPerCast) * 100).toFixed(0)}%` }] : [])],
    foot: `counted over ${tr.diffs} diffs with no shovel`,
  };
});
