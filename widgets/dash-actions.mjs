// DASH · "Co je hotové": every pending action on the farm (crops, trees, hives, cooking, bounties…)
// as one table — when it is ready, the category, what it is. The action list is the DASH page's own
// parser (ctx.dashActions, still inline in the page); this module only shapes it into rows.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const STATUS = { ready: "ready", upcoming: "running", empty: "idle" };
// Ready first (most overdue first), then upcoming (soonest first); idle is blank → always last.
const whenKey = (r) => (r.status === "ready" ? (r.readyAt || 0) - 1e13 : r.status === "upcoming" ? r.readyAt : null);

export const dashActions = {
  type: "dash-actions",
  title: "🚨 What's ready",
  page: "chores",
  needs: (farmId) => ({ farm: { res: "farm", farm: farmId } }),
  // deliveries alone can be 50+ rows: the first 20 by default, the rest via the cog (top N / Filtr)
  defaults: { sort: { key: "when", dir: "asc" }, rows: { mode: "top", top: 20, picked: [] },
    opts: { showNonTicket: false, showAnimals: false, showFaction: true } },
  // the "➡ Craft / ➡ Catch" suggestions stop at these limits (blank = the page's LIMIT); what to list
  optionsLabel: "Options",
  options: [
    { key: "dollLimit", label: "Dolls up to (blank = page LIMIT)", kind: "number", min: 1, max: 9999 },
    { key: "crabLimit", label: "Crustaceans up to (blank = page LIMIT)", kind: "number", min: 1, max: 9999 },
    { key: "showNonTicket", label: "Bounties and chores without tickets", kind: "bool" },
    { key: "showAnimals", label: "Animal deliveries (Chicken/Cow/Sheep)", kind: "bool" },
    { key: "showFaction", label: "Faction items (Goblin NPC, Mark rewards)", kind: "bool" },
  ],
  rowKey: (r) => `${r.category}|${r.label}`,
  rowLabel: (r) => `${r.category}: ${r.label}`,
  rowClass: (r) => `w-st-${r.status}`,
  columns: [
    { key: "when", label: "when", get: whenKey, fmt: (v, r) => r.status === "ready" ? `<span class="v-pill v-ok">READY</span>`
      : r.status === "upcoming" ? (r.readyAt > 0 && r.readyAt < Infinity ? `<span class="v-pill v-run growing-bed-time" data-ready="${r.readyAt}">${esc(r.countdown)}</span>` : "")
      : `<span class="v-pill v-idle">IDLE</span>` },
    { key: "category", label: "type", filter: true, fmt: (v, r) => `<span style="white-space:nowrap">${r.icon || ""} ${esc(v)}</span>` },
    { key: "label", label: "what", fmt: (v, r) => (r.labelHtml || esc(v)) +
      (r.detailHtml || r.detail ? `<div class="dash-detail">${r.detailHtml || esc(r.detail)}</div>` : "") },
    { key: "eff", label: "efficiency", get: (r) => (r.efficiency ? r.efficiency.value : null),
      fmt: (v, r) => (r.efficiency ? `<span class="dash-eff">${esc(r.efficiency.label)}</span>` : "") },
    { key: "status", label: "status", extra: true, filter: true, filterLabel: (v) => STATUS[v] || v, fmt: (v) => esc(STATUS[v] || v) },
  ],

  // data: { farm: <game farm> }
  // ctx:  { dashActions(farm, {dolls, crabs}) → actions (the page's parser), countdown(ms) → text, now? }
  build({ farm }, ctx = {}, opts = {}) {
    if (!farm) return { rows: [], footer: "", empty: "No farm data." };
    if (typeof ctx.dashActions !== "function") return { rows: [], footer: "", empty: "The DASH action list did not load." };
    const now = ctx.now || Date.now();
    const limits = { dolls: opts.dollLimit ?? null, crabs: opts.crabLimit ?? null,
      filters: { showNonTicket: !!opts.showNonTicket, showAnimals: !!opts.showAnimals, showFaction: opts.showFaction !== false } };
    const rows = ctx.dashActions(farm, limits).map((a) => ({
      ...a,
      countdown: a.status === "upcoming" && ctx.countdown ? ctx.countdown(a.readyAt - now) : "",
    }));
    const n = (s) => rows.filter((r) => r.status === s).length;
    const footer = rows.length ? `<div style="color:var(--text-dim)">${n("ready")} ready · ${n("upcoming")} running · ${n("empty")} idle</div>` : "";
    return { rows, footer, empty: "All done — nothing pending right now." };
  },
};

// ── iPhone glance model: how much is ready (a ring of ready vs running), then what: ready first
// (most overdue first), then running (soonest first), then idle; ui/glance-templates
// offers the looks ──
const text = (html) => String(html || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
const CHIP = { ready: () => ({ text: "READY", tone: "ok" }), upcoming: (r) => ({ text: r.countdown || "…", tone: "info" }), empty: () => ({ text: "IDLE", tone: "warn" }) };
dashActions.look = "number";
dashActions.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = dashActions.build(data, ctx, opts);
  if (!out.rows.length) {
    if (out.empty !== "All done — nothing pending right now.") return { empty: out.empty };
    return { head: { value: "✓", tone: "ok", cap: "nothing pending" }, tiles: [{ label: "ready", value: 0 }, { label: "running", value: 0 }] };
  }
  const ready = out.rows.filter((r) => r.status === "ready").sort((a, b) => (a.readyAt || 0) - (b.readyAt || 0));
  const running = out.rows.filter((r) => r.status === "upcoming").sort((a, b) => a.readyAt - b.readyAt);
  const idle = out.rows.filter((r) => r.status === "empty");
  return {
    head: { value: ready.length, tone: ready.length ? "ok" : "", ring: (ready.length / (ready.length + running.length || 1)) * 100, ringTone: "ok",
      cap: `to collect · ${running.length} running` },
    items: [...ready, ...running, ...idle].map((r) => ({ icon: r.icon || "", name: text(r.labelHtml) || r.label, sub: r.category,
      chip: (CHIP[r.status] || CHIP.empty)(r) })),
    tiles: [{ label: "ready", value: ready.length }, { label: "running", value: running.length },
      ...(running.length ? [{ label: "next", value: running[0].countdown || "…" }] : []), ...(idle.length ? [{ label: "idle", value: idle.length }] : [])],
    foot: `${ready.length} ready · ${running.length} running${idle.length ? ` · ${idle.length} idle` : ""}`,
  };
};
