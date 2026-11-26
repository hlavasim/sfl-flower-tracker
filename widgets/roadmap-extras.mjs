// The ROADMAP panels below the buy path as widgets. The numbers are section=roadmap's `extras`
// (core/sections/roadmap.mjs, ported from the page's roadmapGiftsHtml / roadmapDeliveriesHtml /
// roadmapAnimalFeedHtml / roadmapAnimalLifecycleHtml); these only shape them:
//   🎁 Gifts — per NPC the best flower to gift daily, the repeat reward and the FLOWER a day.
//   🚚 Deliveries — open deliveries and bounties: reward − what you give, worth doing or not.
//   🐔 Animal feeding — per pen the net a day with every food, the cheapest food first.
//   📈 Animal lifecycle — one animal's net at each level: the peak and the last level that pays.
import { fmtFlower } from "./roadmap.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (ctx, n) => (typeof ctx.icon === "function" ? ctx.icon(n) : "");
const npcIcon = (ctx, n) => (typeof ctx.npcIcon === "function" ? ctx.npcIcon(n) : "");
const fl = (ctx) => (ctx.flower || "🌸");
const needs = (farmId) => ({ roadmap: { res: "roadmap", farm: farmId } });
const extrasOf = (roadmap) => (roadmap && roadmap.extras) || null;
const NO_DATA = "No roadmap data.";
// +1.20 / −0.40 / 0, green / red / dim (the page's fmtNet)
const sgn = (n) => (n > 0.001 ? "+" : n < -0.001 ? "−" : "") + fmtFlower(Math.abs(n));
const netHtml = (n) => `<span class="${n > 0.001 ? "v-rms-pos" : n < -0.001 ? "v-rms-neg" : "v-dim"}">${sgn(n)}</span>`;
const tone = (n) => (n > 0.001 ? "ok" : n < -0.001 ? "bad" : "");
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const plural = (t, n) => (t === "Sheep" ? t : `${t}${n === 1 ? "" : "s"}`);

// ── 🎁 Gifts ──
export const roadmapGifts = {
  type: "roadmap-gifts",
  title: "🎁 Gifts — best NPC flower gifts",
  page: "roadmap",
  needs,
  defaults: {},
  rowKey: (r) => r.npc,
  rowLabel: (r) => cap(r.npc),
  rowClass: (r) => (r.bed ? "" : "v-rms-off"),
  columns: [
    { key: "npc", label: "NPC", fmt: (v, r) => `<div class="v-name">${r.npcHtml}<b>${esc(cap(v))}</b></div>` },
    { key: "flower", label: "best flower", fmt: (v, r) => `${r.flowerHtml}${esc(v)} <span class="v-dim">${r.pts}pt·${r.growDays.toFixed(0)}d</span>` },
    { key: "liked", label: "likes", extra: true, get: (r) => (r.liked ? r.liked.flower : ""),
      fmt: (v, r) => (r.liked ? `<span class="v-dim">${r.likedHtml}${esc(r.liked.flower)} ${r.liked.pts}pt·${r.liked.days.toFixed(0)}d</span>` : "—") },
    { key: "repLabel", label: "repeat reward", fmt: (v) => `<span class="v-dim">${esc(v)}</span>` },
    { key: "repVal", label: "value", align: "right", fmt: (v) => fmtFlower(v) },
    { key: "perGift", label: "/gift", align: "right", extra: true, fmt: (v) => `<span class="v-dim">+${fmtFlower(v)}</span>` },
    { key: "daysToReward", label: "days/key", align: "right", fmt: (v) => (v == null ? "—" : String(Math.ceil(v))) },
    { key: "perDay", label: "FL/day", align: "right", fmt: (v) => `<span class="${v > 0.02 ? "v-rms-pos" : "v-dim"}">${v > 0.0001 ? "+" + fmtFlower(v) : "0"}</span>` },
    { key: "bed", label: "bed", align: "center", fmt: (v) => (v ? '<span class="v-done">✓</span>' : '<span class="v-dim">—</span>') },
  ],
  build({ roadmap } = {}, ctx = {}) {
    const x = extrasOf(roadmap);
    if (!x) return { rows: [], footer: "", empty: NO_DATA };
    const { rows, beds } = x.gifts;
    const out = rows.map((r, i) => ({ ...r, bed: i < beds, npcHtml: npcIcon(ctx, r.npc), flowerHtml: icon(ctx, r.flower), likedHtml: r.liked ? icon(ctx, r.liked.flower) : "" }));
    const k = x.keys || {};
    return { rows: out, empty: "No NPC gives a repeat reward.",
      footer: `<div class="v-dim">${beds} flower bed${beds === 1 ? "" : "s"} → gift the top ${beds} (✓), one bed each. Keys at the average chest payout: ` +
        `Treasure ~${fmtFlower(k["Treasure Key"] || 0)} · Rare ~${fmtFlower(k["Rare Key"] || 0)} · Luxury ~${fmtFlower(k["Luxury Key"] || 0)} ${fl(ctx)}. ` +
        `Best flower = most friendship points per grow-day.</div>` };
  },
};
roadmapGifts.look = "number-list-t";
roadmapGifts.glanceModel = (data = {}, ctx = {}) => {
  const out = roadmapGifts.build(data, ctx);
  if (!out.rows.length) return { empty: out.empty };
  const top = out.rows.filter((r) => r.bed), day = top.reduce((a, r) => a + r.perDay, 0);
  return {
    head: { value: `+${fmtFlower(day)}`, unit: "/day", tone: day > 0.02 ? "ok" : "", cap: `gifting the top ${top.length} NPC${top.length === 1 ? "" : "s"} daily` },
    items: out.rows.map((r) => ({ icon: r.npcHtml, name: cap(r.npc), sub: `${r.flower} · ${r.repLabel}`,
      value: r.perDay > 0.0001 ? `+${fmtFlower(r.perDay)}` : "0", tone: r.bed ? (r.perDay > 0.02 ? "ok" : "") : "",
      ...(r.daysToReward != null ? { chip: { text: `${Math.ceil(r.daysToReward)}d`, tone: r.bed ? "info" : "" } } : {}) })),
    tiles: [{ label: "beds", value: out.rows.filter((r) => r.bed).length }, { label: "FL/day", value: `+${fmtFlower(day)}` },
      { label: "best", value: cap(out.rows[0].npc) }],
  };
};

// ── 🚚 Deliveries and bounties ──
export const roadmapDeliveries = {
  type: "roadmap-deliveries",
  title: "🚚 Deliveries — which are worth doing",
  page: "roadmap",
  needs,
  optionsLabel: "Rows",
  options: [{ key: "show", label: "Show", kind: "select", choices: [["all", "deliveries and bounties"], ["deliveries", "deliveries only"], ["bounties", "bounties only"], ["worth", "worth doing only"]] }],
  defaults: { opts: { show: "all" } },
  rowKey: (r) => `${r.kind}|${r.id}`,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.net > 0.001 ? "w-st-ready" : ""),
  columns: [
    { key: "name", label: "from", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b><small>${r.kind}</small></div></div>` },
    { key: "give", label: "give", fmt: (v, r) => r.giveHtml },
    { key: "rv", label: "reward", align: "right", fmt: (v) => `<span class="v-rms-gain">${fmtFlower(v)}</span>` },
    { key: "cost", label: "cost", align: "right", fmt: (v) => (v > 0.001 ? `<span class="v-rms-neg">−${fmtFlower(v)}</span>` : '<span class="v-dim">0</span>') },
    { key: "tickets", label: "tickets", align: "right", extra: true, fmt: (v, r) => (v ? `${r.ticketHtml}${v}` : "") },
    { key: "marks", label: "marks", align: "right", extra: true, fmt: (v) => (v ? String(v) : "") },
    { key: "net", label: "net", align: "right", fmt: (v) => netHtml(v) },
  ],
  build({ roadmap } = {}, ctx = {}, opts = {}) {
    const x = extrasOf(roadmap);
    if (!x) return { rows: [], footer: "", empty: NO_DATA };
    const tk = x.ticketName ? icon(ctx, x.ticketName) : "";
    const give = (needs) => needs.map((n) => (n.item === "coins" ? `${icon(ctx, "Coins")}${Number(n.qty).toLocaleString("en-US")} coins` : `${n.qty}× ${icon(ctx, n.item)}${esc(n.item)}`)).join(", ");
    const all = [
      ...x.deliveries.map((d) => ({ kind: "delivery", id: d.id, name: cap(d.from), iconHtml: npcIcon(ctx, d.from), giveHtml: give(d.needs), give: d.needs.map((n) => `${n.qty}× ${n.item}`).join(", "),
        rv: d.rv, cost: d.cost, tickets: d.tickets, marks: 0, net: d.net, ticketHtml: tk })),
      ...x.bounties.map((b) => ({ kind: "bounty", id: b.id, name: b.name, iconHtml: icon(ctx, b.name), giveHtml: `1× ${icon(ctx, b.name)}${esc(b.name)}`, give: `1× ${b.name}`,
        rv: b.rv, cost: b.cost, tickets: b.tickets, marks: b.marks, net: b.net, ticketHtml: tk })),
    ].sort((a, b) => b.net - a.net);
    const show = opts.show || "all";
    const rows = all.filter((r) => (show === "deliveries" ? r.kind === "delivery" : show === "bounties" ? r.kind === "bounty" : show === "worth" ? r.net > 0.001 : true));
    const worth = all.filter((r) => r.net > 0.001).length;
    return { rows, empty: all.length ? "Nothing to show with this filter." : "No open deliveries or bounties.",
      footer: `<div class="v-dim">${x.deliveries.length} deliveries · ${x.bounties.length} bounties · ${worth} worth doing. Net = reward (SFL + coins + marks/keys + tickets × ${x.ticketValue} ${fl(ctx)}) − what you give. ` +
        `Tickets cannot be sold, so they count at the ticket value set in ⚙ Settings.</div>` };
  },
};
roadmapDeliveries.look = "number-list-t";
roadmapDeliveries.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = roadmapDeliveries.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const worth = out.rows.filter((r) => r.net > 0.001), gain = worth.reduce((a, r) => a + r.net, 0);
  return {
    head: { value: worth.length, unit: `/${out.rows.length}`, cap: `worth doing · +${fmtFlower(gain)} ${fl(ctx)}`, tone: worth.length ? "ok" : "",
      ring: (worth.length / out.rows.length) * 100, ringTone: "ok" },
    items: out.rows.map((r) => ({ icon: r.iconHtml, name: r.name, sub: r.give, value: sgn(r.net), tone: tone(r.net) })),
    tiles: [{ label: "deliveries", value: out.rows.filter((r) => r.kind === "delivery").length }, { label: "bounties", value: out.rows.filter((r) => r.kind === "bounty").length },
      { label: "worth it", value: worth.length }, { label: "net", value: `+${fmtFlower(gain)}` }],
  };
};

// ── 🐔 Animal feeding ──
export const roadmapAnimalFeed = {
  type: "roadmap-animal-feed",
  title: "🐔 Animal feeding — what to feed, worth it?",
  page: "roadmap",
  needs,
  optionsLabel: "Rows",
  options: [{ key: "bestOnly", label: "Only the best food per pen", kind: "bool" }],
  defaults: { opts: { bestOnly: false } },
  rowKey: (r) => `${r.animalType}|${r.food}`,
  rowLabel: (r) => `${r.animalType} · ${r.food}`,
  rowClass: (r) => (r.best ? "v-rms-best" : ""),
  columns: [
    { key: "animalType", label: "pen", fmt: (v, r) => `<div class="v-name">${r.animalHtml}<div><b>${esc(plural(v, r.count))}</b><small>×${r.count}${r.golden ? " · golden, free feed" : ""}</small></div></div>` },
    { key: "food", label: "food", fmt: (v, r) => `${r.foodHtml}${esc(v)}${r.best ? ' <span class="v-done">★</span>' : ""}` },
    { key: "produce", label: "produce/d", align: "right", extra: true, fmt: (v) => `<span class="v-rms-gain">+${fmtFlower(v)}</span>` },
    { key: "sick", label: "sickness/d", align: "right", extra: true, fmt: (v) => `<span class="v-rms-neg">−${fmtFlower(v)}</span>` },
    { key: "feedDay", label: "feed/d", align: "right", fmt: (v) => (v > 0.001 ? `<span class="v-rms-neg">−${fmtFlower(v)}</span>` : '<span class="v-dim">0</span>') },
    { key: "net", label: "net/d", align: "right", fmt: (v) => netHtml(v) },
  ],
  build({ roadmap } = {}, ctx = {}, opts = {}) {
    const x = extrasOf(roadmap);
    if (!x) return { rows: [], footer: "", empty: NO_DATA };
    const rows = [];
    for (const b of x.animalFeed) b.rows.forEach((r, i) => {
      if (opts.bestOnly && i) return;
      rows.push({ ...r, animalType: b.animalType, count: b.count, golden: b.golden, produce: b.produce, sick: b.sick, best: i === 0,
        animalHtml: icon(ctx, b.animalType), foodHtml: icon(ctx, r.food) });
    });
    return { rows, empty: "No animals.",
      footer: `<div class="v-dim">Produce sold at p2p − feed − sickness, a day. Food changes only the feed cost, so the cheapest food for your animals' levels wins (★). Red even at ★ = feeding that pen loses FLOWER.</div>` };
  },
};
roadmapAnimalFeed.look = "list-1";
roadmapAnimalFeed.glanceModel = (data = {}, ctx = {}) => {
  const x = extrasOf(data.roadmap);
  if (!x) return { empty: NO_DATA };
  if (!x.animalFeed.length) return { empty: "No animals." };
  const pens = x.animalFeed.map((b) => ({ b, best: b.rows[0] })), total = pens.reduce((a, p) => a + Math.max(0, p.best.net), 0);
  const losing = pens.filter((p) => !(p.best.net > 0.001));
  return {
    head: { value: sgn(total), unit: "/day", tone: tone(total), cap: losing.length ? `${losing.length} pen${losing.length === 1 ? "" : "s"} lose FLOWER` : "every pen pays" },
    items: pens.map(({ b, best }) => ({ icon: icon(ctx, b.animalType), name: `${plural(b.animalType, b.count)} ×${b.count}`,
      sub: best.net > 0.001 ? `feed ${best.food}` : "don't feed", value: sgn(best.net), tone: tone(best.net) })),
    tiles: pens.map(({ b, best }) => ({ label: plural(b.animalType, b.count).toLowerCase(), value: sgn(best.net) })),
  };
};

// ── 📈 Animal lifecycle ──
export const roadmapAnimalLife = {
  type: "roadmap-animal-life",
  title: "📈 Animal lifecycle — net per level",
  page: "roadmap",
  needs,
  defaults: {},
  rowKey: (r) => r.animalType,
  rowLabel: (r) => r.animalType,
  columns: [
    { key: "animalType", label: "animal", fmt: (v, r) => `<div class="v-name">${r.animalHtml}<div><b>${esc(v)}</b><small>your avg level ${r.avgL}</small></div></div>` },
    { key: "lastPos", label: "pays to", align: "right", fmt: (v) => (v > 0 ? `<span class="v-rms-pos">L${v}</span>` : '<span class="v-rms-neg">never</span>') },
    { key: "peakNet", label: "peak", align: "right", fmt: (v, r) => `L${r.peak} ${netHtml(v)}` },
    { key: "levels", label: "net a day at each level", get: (r) => r.peakNet, fmt: (v, r) => `<div class="v-rms-levels">` + r.per.map((p) => {
      const cls = p.net > 0.0001 ? "v-rms-pos" : p.net < -0.0001 ? "v-rms-neg" : "v-dim";
      return `<div title="Level ${p.L}: ${p.net >= 0 ? "+" : "−"}${fmtFlower(Math.abs(p.net))}/day" class="v-rms-lvl${p.L === r.peak ? " v-rms-peak" : ""}${p.L === r.avgL ? " v-rms-cur" : ""}">` +
        `<small>${p.L === r.peak ? "★ " : ""}L${p.L}</small><b class="${cls}">${p.net >= 0 ? "+" : "−"}${fmtFlower(Math.abs(p.net))}</b></div>`;
    }).join("") + `</div>` },
  ],
  build({ roadmap } = {}, ctx = {}) {
    const x = extrasOf(roadmap);
    if (!x) return { rows: [], footer: "", empty: NO_DATA };
    const rows = x.animalLife.map((b) => ({ ...b, peakNet: (b.per.find((p) => p.L === b.peak) || { net: 0 }).net, animalHtml: icon(ctx, b.animalType) }));
    return { rows, empty: "No animals.",
      footer: `<div class="v-dim">One animal's net FLOWER a day at each level (produce − feed − sickness, your boosts); ★ = the peak, the outlined level = your average. Multiply by the pen size.</div>` };
  },
};
roadmapAnimalLife.look = "list-1";
roadmapAnimalLife.glanceModel = (data = {}, ctx = {}) => {
  const out = roadmapAnimalLife.build(data, ctx);
  if (!out.rows.length) return { empty: out.empty };
  const top = Math.max(0.001, ...out.rows.map((r) => Math.abs(r.peakNet)));
  const past = out.rows.filter((r) => r.lastPos > 0 && r.avgL > r.lastPos);
  return {
    head: { value: past.length, unit: `/${out.rows.length}`, tone: past.length ? "warn" : "ok",
      cap: past.length ? `past break-even: ${past.map((r) => r.animalType).join(", ")}` : "no pen past its break-even level" },
    items: out.rows.map((r) => ({ icon: r.animalHtml, name: r.animalType, sub: r.lastPos > 0 ? `pays to L${r.lastPos} · you L${r.avgL}` : `never pays · you L${r.avgL}`,
      value: `L${r.peak} ${sgn(r.peakNet)}`, tone: tone(r.peakNet), pct: (Math.abs(r.peakNet) / top) * 100 })),
    tiles: out.rows.map((r) => ({ label: r.animalType.toLowerCase(), value: r.lastPos > 0 ? `≤ L${r.lastPos}` : "never" })),
  };
};

// ── ⏳ Expired — renew: weather protection used up or missing, shrines that lapsed and pay back ──
// The rows are the page's roadmapExpiredRows (it shares the SHRINES page's shrine helpers), reached
// through ctx over a board copy's section=power + farm, or the ROADMAP page's own context.
const plain = (h) => String(h || "").replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
export const roadmapExpired = {
  type: "roadmap-expired",
  title: "⏳ Expired — renew",
  page: "roadmap",
  needs: (farmId) => ({ power: { res: "compute", farm: farmId, section: "power" }, farm: { res: "farm", farm: farmId } }),
  defaults: {},
  rowKey: (r) => r.what,
  rowLabel: (r) => plain(r.what),
  rowClass: (r) => (r.warn ? "w-st-warn" : ""),
  columns: [
    // what / note are the page's own HTML (names escaped there, item icons inline)
    { key: "what", label: "to do", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${r.warn ? '<span class="v-rmf-warn">⚠</span> ' : r.now ? '<span class="v-dim">▸</span> ' : ""}${v}</b><small>${r.note}</small></div></div>` },
    { key: "gain", label: "FLOWER/day", align: "right", title: "FLOWER a day it earns back, where it has a value",
      fmt: (v) => (v != null ? `<b class="${v > 0 ? "v-sk-pos" : "v-rm-neg"}">${v > 0 ? "+" : ""}${fmtFlower(v)}/d</b>` : '<span class="v-dim">—</span>') },
  ],
  build({ power, farm } = {}, ctx = {}) {
    const list = typeof ctx.expiredRows === "function" ? ctx.expiredRows(power, farm) : null;
    if (!list) return { rows: [], footer: "", empty: "Loading the power data…" };
    const rows = list.map((r) => ({ ...r, gain: r.gain != null && isFinite(r.gain) ? r.gain : null, iconHtml: r.icon ? icon(ctx, r.icon) : "" }));
    return { rows, empty: "Nothing has lapsed — weather protection and shrines are all up.",
      footer: `<div class="v-dim">Only what runs out by itself and stops working: shrines (7 days, listed when they pay back) and protection against weather events.</div>` };
  },
};
roadmapExpired.look = "number-list-2";
roadmapExpired.glanceModel = (data = {}, ctx = {}) => {
  const out = roadmapExpired.build(data, ctx);
  if (!out.rows.length) return { empty: out.empty };
  const urgent = out.rows.filter((r) => r.warn).length, gain = out.rows.reduce((a, r) => a + (r.gain > 0 ? r.gain : 0), 0);
  return {
    head: { value: out.rows.length, cap: `to renew${urgent ? ` · ${urgent} uncovered` : ""}${gain > 0 ? ` · +${fmtFlower(gain)}/d` : ""}`, tone: urgent ? "warn" : "" },
    items: out.rows.map((r) => ({ icon: r.iconHtml, name: plain(r.what), sub: plain(r.note),
      ...(r.gain != null ? { value: `${r.gain > 0 ? "+" : ""}${fmtFlower(r.gain)}`, tone: r.gain > 0 ? "ok" : "bad" } : { chip: { text: r.warn ? "now" : "renew", tone: r.warn ? "warn" : "" } }) })),
  };
};

// ── ⭐ Skills: every skill's FLOWER a day on this farm (section=roadmap's extras.skills, the same
// roadmapSkillBreakdown + roadmapSkillExtraFlow the buy path uses); what to take, what to reset ──
const EPS = 0.01;
const skillVerdict = (r) => (r.has ? (r.net < -EPS ? "reset" : "owned") : r.net > EPS ? "take" : "skip");
const SKILL_PILL = { take: ["take", "v-run"], reset: ["reset?", "v-bad"], owned: ["✓ owned", "v-ok"], skip: ["", ""] };
// the value where it is not a plain FLOWER a day: "if mined", coins, XP, faster, limit+
function skillValue(r) {
  if (r.net > EPS) return `<b class="v-sk-pos">+${fmtFlower(r.net)}/d</b>`;
  if (r.net < -EPS) return `<b class="v-rm-neg">−${fmtFlower(-r.net)}/d</b>`;
  const sit = r.cond.filter((c) => c.mining && c.sit > EPS);
  if (sit.length) return `<span class="v-rmf-warn">+${fmtFlower(sit.reduce((a, c) => a + c.sit, 0))}/d <small>if mined</small></span>`;
  const coin = r.tags.find((t) => t.group === "coins");
  if (coin) return `<span class="v-rmf-coin">coins${coin.ref ? " ≈+" + fmtFlower(coin.ref) + "/1k" : ""}</span>`;
  if (r.tags.length) { const g = r.tags[0].group; return `<span class="v-dim">${g === "xp" ? "XP" : g === "speed" ? "faster" : g === "limit" ? "limit+" : "minor"}</span>`; }
  return '<span class="v-dim">—</span>';
}
const skillIconName = (n) => String(n).replace(/\s*→\s*Level\s*\d+$/, "");
export const roadmapSkills = {
  type: "roadmap-skills",
  title: "⭐ Skills — what each adds on your farm",
  titleFor: (o) => (o.show === "take" ? "⭐ Skills to take" : o.show === "reset" ? "⭐ Skills to reset" : "⭐ Skills — what each adds on your farm"),
  page: "roadmap",
  needs,
  optionsLabel: "Skills",
  options: [{ key: "show", label: "Show", kind: "select", choices: [["all", "every skill"], ["take", "worth taking"], ["reset", "owned, worth resetting"], ["owned", "owned"]] }],
  defaults: { opts: { show: "all" }, sort: { key: "net", dir: "desc" } },
  rowKey: (r) => r.name,
  rowLabel: (r) => r.name,
  rowClass: (r) => (r.has ? "w-st-ready" : ""),
  columns: [
    { key: "name", label: "skill", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b><small>${esc(r.boost)}</small></div></div>` },
    { key: "tree", label: "tree", get: (r) => `${r.tree} ${r.tier}`, fmt: (v, r) => `${esc(r.tree)} <span class="v-dim">T${r.tier}</span>` },
    { key: "points", label: "pts", align: "right" },
    { key: "net", label: "FLOWER/day", align: "right", fmt: (v, r) => skillValue(r) },
    { key: "verdict", label: "", fmt: (v) => (SKILL_PILL[v][0] ? `<span class="v-pill ${SKILL_PILL[v][1]}">${SKILL_PILL[v][0]}</span>` : "") },
    { key: "parts", label: "where it comes from", extra: true, get: (r) => r.parts.length,
      fmt: (v, r) => r.parts.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).map((p) => `<span class="${p.delta >= 0 ? "v-sk-pos" : "v-rm-neg"}">${esc(p.label)} ${p.delta >= 0 ? "+" : "−"}${fmtFlower(Math.abs(p.delta))}</span>`).join(" · ") },
  ],
  build({ roadmap } = {}, ctx = {}, opts = {}) {
    const x = extrasOf(roadmap);
    if (!x || !x.skills) return { rows: [], footer: "", empty: NO_DATA };
    const k = x.skills;
    if (k.error) return { rows: [], footer: "", empty: `Skills could not be valued: ${k.error}` };
    const all = k.rows.map((r) => ({ ...r, verdict: skillVerdict(r), iconHtml: icon(ctx, skillIconName(r.name)) }));
    const show = opts.show || "all";
    const rows = all.filter((r) => (show === "take" ? r.verdict === "take" : show === "reset" ? r.verdict === "reset" : show === "owned" ? r.has : true));
    const take = all.filter((r) => r.verdict === "take").length, reset = all.filter((r) => r.verdict === "reset").length;
    return { rows, empty: all.length ? "No skill matches this filter." : "No skill data.",
      footer: `<div class="v-dim">Level ${k.level} · ≈${k.freePts} free point${k.freePts === 1 ? "" : "s"}${k.sflPerPt > 0 ? ` · ${fmtFlower(k.sflPerPt)} SFL of XP a point` : ""} · ${take} worth taking · ${reset} owned but losing FLOWER. ` +
        `FLOWER a day on your farm at ${k.effMode === "real" ? "your last-7-days activity" : "100 % (theoretical)"} efficiency.</div>` };
  },
};
roadmapSkills.look = "number-list-t";
roadmapSkills.glanceModel = (data = {}, ctx = {}) => {
  const out = roadmapSkills.build(data, ctx, { show: "all" });
  if (!out.rows.length) return { empty: out.empty };
  const k = data.roadmap.extras.skills;
  const take = out.rows.filter((r) => r.verdict === "take").sort((a, b) => b.net - a.net);
  const reset = out.rows.filter((r) => r.verdict === "reset").sort((a, b) => a.net - b.net);
  const best = take[0];
  return {
    head: best ? { value: `+${fmtFlower(best.net)}`, unit: "/day", tone: "ok", cap: `best to take: ${best.name} (${best.points} pt)` }
      : { value: "✓", tone: "ok", cap: "no unowned skill adds FLOWER" },
    items: [...take.slice(0, 8).map((r) => ({ icon: r.iconHtml, name: r.name, sub: `${r.tree} T${r.tier} · ${r.points} pt`, value: `+${fmtFlower(r.net)}`, tone: "ok" })),
      ...reset.map((r) => ({ icon: r.iconHtml, name: r.name, sub: "owned, loses FLOWER", value: `−${fmtFlower(-r.net)}`, tone: "bad", chip: { text: "reset?", tone: "bad" } }))],
    tiles: [{ label: "level", value: k.level }, { label: "free pts", value: k.freePts }, { label: "to take", value: take.length }, { label: "to reset", value: reset.length }],
  };
};

// ── 🌾 What to farm / mine now: every activity's FLOWER a day — gives − costs = net, from
// section=roadmap's profitability (the page's former table). "sell" = what you hold of it now at p2p
// less the market fee (Obsidian: only what can still be sold this week). The checkboxes of what you
// farm, the cost basis and the verdict stay page controls above it. ──
const PROFIT_GROUPS = [["mine", "⛏️ Mining & trees"], ["animals", "🐮 Animals"], ["crops", "🌾 Crops"], ["greenhouse", "🏠 Greenhouse"],
  ["fruits", "🍎 Fruits"], ["cropMachine", "⚙️ Crop machine"], ["other", "✨ Other"]];
const GROUP_LABEL = Object.fromEntries(PROFIT_GROUPS);
const groupName = (id) => (GROUP_LABEL[id] || id).replace(/^\S+\s/, "");
const VERDICT_PILL = { sell: ["SELL", "v-ok"], step: ["STEP", "v-idle"], skip: ["SKIP", "v-bad"], input: ["INPUT", "v-run"] };
const SELL_ITEMS = { Egg: ["Egg", "Feather"], Milk: ["Milk", "Leather"], Wool: ["Wool", "Merino Wool"] };
const LIMITED = { Obsidian: true };
// the week key of limited sales (weeks start Monday 00:00 UTC from 2024-06-24, the game's getWeekKey)
export function limitedWeekKey(now = Date.now()) {
  const s = Date.UTC(2024, 5, 24), d = new Date(now); d.setUTCHours(0, 0, 0, 0);
  return new Date(s + Math.floor((d - s) / 864e5 / 7) * 7 * 864e5).toISOString().slice(0, 10);
}
// what the row's product(s) in your inventory fetch now: parts [{ it, have, q, p }] and the value after the fee
export function sellOf(name, farm, p2p, fee = 10, now = Date.now()) {
  const inv = (farm && farm.inventory) || {}, trades = (farm && farm.trades) || {}, keep = 1 - fee / 100, wk = limitedWeekKey(now);
  const left = (it) => Math.max(0, 1 - (((trades.weeklySales || {})[wk] || {})[it] || 0) - Object.values(trades.listings || {}).filter((l) => l && l.items && l.items[it]).length);
  const parts = (SELL_ITEMS[name] || [name]).map((it) => { const have = parseFloat(inv[it]) || 0; return { it, have, q: LIMITED[it] ? Math.min(have, left(it)) : have, p: (p2p || {})[it] || 0 }; })
    .filter((x) => x.have >= 1 && x.p > 0);
  return { parts, value: parts.reduce((t, x) => t + x.q * x.p * keep, 0), keep };
}
const sellHtml = (r) => {
  if (!r.sellParts.length) return "";
  const lim = r.sellParts.some((x) => LIMITED[x.it]) ? `<small class="v-rmf-sub">${r.sellParts.some((x) => LIMITED[x.it] && x.q < 1) ? "sold this week" : "limit 1/week"}</small>` : "";
  const q = r.sellParts.length > 1 ? `<small class="v-rmf-sub">${r.sellQty}</small>` : `<span class="v-dim">${r.sellQty}</span> `;
  return `${q}~<b class="v-rmf-sell">${fmtFlower(r.sell)}</b>${lim}`;
};
export const roadmapProfit = {
  type: "roadmap-profit",
  title: "🌾 What to farm / mine now",
  titleFor: (o) => (o.group && GROUP_LABEL[o.group] ? `🌾 What to farm — ${groupName(o.group)}` : "🌾 What to farm / mine now"),
  page: "roadmap",
  needs: (farmId) => ({ roadmap: { res: "roadmap", farm: farmId }, farm: { res: "farm", farm: farmId }, power: { res: "compute", farm: farmId, section: "power" } }),
  optional: ["power"],
  optionsLabel: "Rows",
  options: [
    { key: "group", label: "Group", kind: "select", choices: [["", "every group"], ...PROFIT_GROUPS] },
    { key: "paying", label: "Only what pays (net > 0)", kind: "bool" },
  ],
  defaults: { opts: { group: "", paying: false } },
  rowKey: (r) => `${r.group}|${r.label}`,
  rowLabel: (r) => r.label,
  rowClass: (r) => (r.fade ? "v-rmf-fade" : ""),
  columns: [
    { key: "label", label: "activity", fmt: (v, r) => `<div class="v-name">${r.iconHtml}<div><b>${esc(v)}</b>${r.badgeHtml}${r.sub ? ` <span class="v-dim">${esc(r.sub)}</span>` : ""}` +
      (r.detail ? `<small class="v-dim">${esc(r.detail)}</small>` : "") +
      (r.detailHtml ? `<details class="v-roi-row"><summary class="v-dim">why</summary><div class="v-power-detail">${r.detailHtml}</div></details>` : "") + `</div></div>` },
    { key: "group", label: "group", extra: true, fmt: (v) => esc(groupName(v)) },
    { key: "gross", label: "gives/d", align: "right", fmt: (v) => `<span class="v-rmf-gain">${fmtFlower(v)}</span>` },
    { key: "cost", label: "costs/d", align: "right", fmt: (v) => (v > 0.001 ? `<span class="v-rmf-cost">−${fmtFlower(v)}</span>` : "0") },
    { key: "net", label: "net/d", align: "right", fmt: (v, r) => (r.unvalued ? '<span class="v-dim">not priced</span>' : netHtml(v)) +
      (r.soloNet != null && Math.abs(r.soloNet - v) > 0.005 ? `<small class="v-rmf-sub">solo ${sgn(r.soloNet)}</small>` : "") },
    { key: "sell", label: "sell now", align: "right", title: "What you hold now, at p2p less the market fee (a big sale would move the price).", fmt: (v, r) => sellHtml(r) },
  ],
  build({ roadmap, farm, power } = {}, ctx = {}, opts = {}) {
    const pf = roadmap && roadmap.profitability;
    if (!pf) return { rows: [], footer: "", empty: NO_DATA };
    const p2p = (typeof ctx.p2p === "function" && ctx.p2p()) || (power && power.p2pPrices) || {};
    const fee = typeof ctx.marketFee === "number" ? ctx.marketFee : 10, now = ctx.now || Date.now();
    const sold = new Set(); let sellTotal = 0;
    const rows = [];
    // "STEP → Gold": a mining row names the tier it feeds by its category; show that tier's label
    const catLabel = {}; for (const g of pf.groups || []) for (const r of g.rows || []) if (r.cat) catLabel[r.cat] = r.label;
    for (const g of pf.groups || []) {
      const list = (g.rows || []).slice();
      if (!g.keepOrder) list.sort((a, b) => ((a.fade ? 1 : 0) - (b.fade ? 1 : 0)) || (b.net - a.net));
      for (const r of list) {
        const VB = VERDICT_PILL[r.verdict];
        const s = sellOf(r.icon, farm, p2p, fee, now);
        for (const x of s.parts) if (!sold.has(x.it)) { sold.add(x.it); sellTotal += x.q * x.p * s.keep; }   // a crop in CROPS and CROP MACHINE counts once
        rows.push({ ...r, group: g.id, iconHtml: icon(ctx, r.icon),
          badgeHtml: (VB ? ` <span class="v-pill ${VB[1]}">${VB[0]}${r.verdict === "step" && r.feeds ? "→" + esc(catLabel[r.feeds] || r.feeds) : ""}</span>` : "") + (r.isPeak ? ' <span class="v-pill v-ok">★ best stop</span>' : ""),
          detailHtml: r.cat && r.chain && typeof ctx.miningDetail === "function" ? ctx.miningDetail(r.cat, r.chain, r.eff) : "",
          sell: s.value, sellParts: s.parts, sellQty: s.parts.map((x) => Math.floor(x.q).toLocaleString("en-US")).join(" + ") });
      }
    }
    const shown = rows.filter((r) => (!opts.group || r.group === opts.group) && (!opts.paying || r.net > 0.001));
    const paying = rows.filter((r) => r.net > 0.001).length, losing = rows.filter((r) => r.net < -0.001).length;
    const cm = (pf.groups || []).find((g) => g.id === "cropMachine");
    const notes = [cm && cm.note ? esc(cm.note) : "", (pf.groups || []).some((g) => g.id === "mine" && g.rows.length)
      ? "Mining runs in chain order, Wood to Crimstone (Oil last): each net is what you make stopping and selling at that resource." : ""].filter(Boolean);
    return { rows: shown, sellTotal, empty: rows.length ? "Nothing matches this filter." : "Nothing to farm on this farm yet.",
      footer: `<div class="v-dim">${paying} pay · ${losing} lose FLOWER${sellTotal > 0 ? ` · for sale now in total ~${fmtFlower(sellTotal)} ${fl(ctx)} (each resource once)` : ""}. ` +
        (notes.length ? notes.join(" ") + " " : "") + `gives = a day's production at its sale value; costs = tools, seeds, feed and sickness; net at your harvest efficiency${pf.coinsFree ? ` · coins count as free (you hold ${Number(pf.coins || 0).toLocaleString("en-US")})` : ""}.</div>` };
  },
};
roadmapProfit.look = "number-list-t";
roadmapProfit.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = roadmapProfit.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const list = out.rows.filter((r) => !r.unvalued).slice().sort((a, b) => b.net - a.net), best = list[0];
  const paying = list.filter((r) => r.net > 0.001).length;
  return {
    head: best ? { value: sgn(best.net), unit: "/day", tone: tone(best.net), hero: best.iconHtml, cap: `best: ${best.label}${best.verdict ? ` (${best.verdict})` : ""}` } : { value: "—", cap: "nothing priced" },
    items: list.map((r) => ({ icon: r.iconHtml, name: r.label, sub: groupName(r.group) + (r.verdict ? ` · ${r.verdict}` : ""), value: sgn(r.net), tone: tone(r.net) })),
    tiles: [{ label: "pay", value: paying }, { label: "lose", value: list.filter((r) => r.net < -0.001).length },
      ...(out.sellTotal > 0 ? [{ label: "for sale", value: fmtFlower(out.sellTotal) }] : [])],
  };
};
