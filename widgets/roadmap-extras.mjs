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
