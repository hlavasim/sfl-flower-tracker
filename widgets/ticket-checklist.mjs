// TICKETY · this week's checklist: every ticket source (daily reward, deliveries, chores, bounties,
// young-animal bounties) with done / what is left, from compute?section=tickets (store "tickets").

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
const n = (v, d = 0) => (+v || 0).toLocaleString("en-US", { maximumFractionDigits: d });
const GROUP = { daily: "🎁 daily reward", delivery: "📦 deliveries", chore: "📋 chores", bounty: "🎯 bounties", animal: "🐔 young animals" };

// The same wording as the TICKETY page's checklist.
function what(s) {
  if (s.group === "daily") return { text: "Claim the daily reward", sub: "" };
  if (s.group === "delivery") return { text: `<b>${esc(cap(s.label))}</b>: ${s.items ? Object.entries(s.items).map(([k, v]) => `${v}× ${esc(k)}`).join(", ") : "waiting for a new order"}`, sub: "" };
  if (s.group === "chore") {
    const ready = !s.done && s.remaining === 0;
    return { text: `<b>${esc(cap(s.npc))}</b>: ${esc(s.label)}${s.kind === "plant" && !s.done && !ready ? " 🌱" : ""}`,
      sub: s.done ? "done" : ready ? "complete — claim it at the NPC" : s.required ? `${n(s.progress)} / ${n(s.required)} · ${n(s.remaining)} left${s.perDay ? ` · today ~${n(s.perDay)}` : ""}` : "" };
  }
  if (s.group === "bounty") return { text: `Deliver <b>${esc(s.label)}</b>`, sub: "" };
  if (s.group === "animal") return { text: `Deliver <b>${esc(s.animal)}</b> at level ${s.level}+`, sub: s.feed > 0 ? `feed ~${n(s.feed, 2)} FLOWER` : "free feed (golden animal)" };
  return { text: esc(s.label || s.id), sub: "" };
}

export const ticketChecklist = {
  type: "ticket-checklist",
  title: "🎟️ Tickets this week",
  page: "tickets",
  needs: (farmId) => ({ tickets: { res: "tickets", farm: farmId } }),
  // open sources first, most tickets first; done ones (blank) after
  defaults: { sort: { key: "plus", dir: "desc" }, rows: { mode: "top", top: 20, picked: [] } },
  rowKey: (r) => r.id,
  rowLabel: (r) => r.label || r.id,
  rowClass: (r) => (r.done ? "w-st-done" : ""),
  columns: [
    { key: "done", label: "", get: (r) => (r.done ? 1 : 0), fmt: (v) => (v ? "✅" : "⬜") },
    { key: "what", label: "what", get: (r) => r.label || r.npc || r.animal || r.id, fmt: (v, r) => { const w = what(r); return w.text + (w.sub ? `<div class="dash-detail">${w.sub}</div>` : ""); } },
    { key: "plus", label: "tickets", align: "right", get: (r) => (r.done ? null : r.tickets), fmt: (v, r) => `<b style="color:var(--green)">+${r.tickets}</b>` },
    { key: "group", label: "group", extra: true, filter: true, filterLabel: (v) => GROUP[v] || v, fmt: (v) => esc(GROUP[v] || v) },
    { key: "perTicket", label: "FLOWER / ticket", align: "right", extra: true, get: (r) => (r.cost > 0 && r.tickets > 0 ? r.cost / r.tickets : null), fmt: (v) => (v == null ? "" : n(v, 3)) },
  ],

  // data: { tickets: <compute?section=tickets data> }
  build({ tickets }) {
    if (!tickets || !Array.isArray(tickets.sources)) return { rows: [], footer: "", empty: "Tickets did not load." };
    const rows = tickets.sources.filter((s) => s.tickets > 0);
    const open = rows.filter((r) => !r.done);
    const footer = rows.length
      ? `<div style="color:var(--text-dim)">${open.length ? `${open.length} left · <b style="color:var(--green)">+${open.reduce((a, r) => a + r.tickets, 0)}</b>` : "✅ all done"}</div>` : "";
    return { rows, footer, empty: "No ticket sources this week." };
  },
};

// ── iPhone glance model: sources left (a ring) and the tickets they bring; the list = the open sources,
// most tickets first, then the done ones; ui/glance-templates offers the looks ──
const plain = (s) => (s.group === "daily" ? "Daily reward" : s.group === "delivery" ? cap(s.label) : s.group === "chore" ? `${cap(s.npc)}: ${s.label}`
  : s.group === "bounty" ? `Deliver ${s.label}` : s.group === "animal" ? `${s.animal} at level ${s.level}+` : String(s.label || s.id));
// a source's progress for the bars: done = full, a chore its counter, else nothing yet
const progress = (s) => (s.done ? 100 : s.group === "chore" && s.required > 0 ? Math.min(100, Math.max(0, (s.progress / s.required) * 100)) : 0);
ticketChecklist.look = "number";
ticketChecklist.glanceModel = (data = {}, ctx = {}) => {
  const out = ticketChecklist.build(data);
  if (!out.rows.length) return { empty: out.empty };
  const open = out.rows.filter((r) => !r.done).sort((a, b) => b.tickets - a.tickets), done = out.rows.filter((r) => r.done);
  const plus = open.reduce((a, r) => a + r.tickets, 0), pct = (done.length / out.rows.length) * 100;
  const ic = (r) => {
    const item = r.group === "delivery" ? Object.keys(r.items || {})[0] : r.group === "animal" ? r.animal : r.group === "bounty" ? r.label : r.item;
    return item && typeof ctx.icon === "function" ? ctx.icon(item) : r.group === "daily" ? "🎁" : "";
  };
  const item = (r) => ({ icon: ic(r), name: plain(r), sub: GROUP[r.group] || r.group, pct: progress(r) });
  return {
    head: { value: open.length || "✓", unit: open.length ? "left" : "", tone: open.length ? "" : "ok", ring: pct, ringTone: open.length ? "accent" : "ok",
      cap: open.length ? `+${n(plus)} tickets this week` : "all done this week" },
    items: [...open.map((r) => ({ ...item(r), value: `+${r.tickets}`, tone: "ok" })), ...done.map((r) => ({ ...item(r), chip: { text: "done", tone: "ok" } }))],
    tiles: [{ label: "left", value: `${open.length} / ${out.rows.length}` }, { label: "tickets", value: `+${n(plus)}` },
      { label: "done", value: String(done.length) }],
  };
};
