// TICKETY · this week's checklist: every ticket source (daily reward, deliveries, chores, bounties,
// young-animal bounties) with done / what is left, from compute?section=tickets (store "tickets").
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
const n = (v, d = 0) => (+v || 0).toLocaleString("cs-CZ", { maximumFractionDigits: d });
const GROUP = { daily: "🎁 denní odměna", delivery: "📦 doručení", chore: "📋 úkoly", bounty: "🎯 bounty", animal: "🐔 mladá zvířata" };

// The same wording as the TICKETY page's checklist.
function what(s) {
  if (s.group === "daily") return { text: "Vyzvedni denní odměnu", sub: "" };
  if (s.group === "delivery") return { text: `<b>${esc(cap(s.label))}</b>: ${s.items ? Object.entries(s.items).map(([k, v]) => `${v}× ${esc(k)}`).join(", ") : "čeká na novou objednávku"}`, sub: "" };
  if (s.group === "chore") {
    const ready = !s.done && s.remaining === 0;
    return { text: `<b>${esc(cap(s.npc))}</b>: ${esc(s.label)}${s.kind === "plant" && !s.done && !ready ? " 🌱" : ""}`,
      sub: s.done ? "hotovo" : ready ? "splněno — vyzvedni u NPC" : s.required ? `${n(s.progress)} / ${n(s.required)} · zbývá ${n(s.remaining)}${s.perDay ? ` · dnes ~${n(s.perDay)}` : ""}` : "" };
  }
  if (s.group === "bounty") return { text: `Odevzdej <b>${esc(s.label)}</b>`, sub: "" };
  if (s.group === "animal") return { text: `Odevzdej <b>${esc(s.animal)}</b> na levelu ${s.level}+`, sub: s.feed > 0 ? `krmení ~${n(s.feed, 2)} FLOWER` : "krmení zdarma (zlaté zvíře)" };
  return { text: esc(s.label || s.id), sub: "" };
}

export const ticketChecklist = {
  type: "ticket-checklist",
  title: "🎟️ Tickety tento týden",
  page: "tickets",
  needs: (farmId) => ({ tickets: { res: "tickets", farm: farmId } }),
  // open sources first, most tickets first; done ones (blank) after
  defaults: { sort: { key: "plus", dir: "desc" } },
  rowKey: (r) => r.id,
  rowLabel: (r) => r.label || r.id,
  rowClass: (r) => (r.done ? "w-st-done" : ""),
  columns: [
    { key: "done", label: "", get: (r) => (r.done ? 1 : 0), fmt: (v) => (v ? "✅" : "⬜") },
    { key: "what", label: "co", get: (r) => r.label || r.npc || r.animal || r.id, fmt: (v, r) => { const w = what(r); return w.text + (w.sub ? `<div class="dash-detail">${w.sub}</div>` : ""); } },
    { key: "plus", label: "tickety", align: "right", get: (r) => (r.done ? null : r.tickets), fmt: (v, r) => `<b style="color:var(--green)">+${r.tickets}</b>` },
    { key: "group", label: "skupina", extra: true, filter: true, filterLabel: (v) => GROUP[v] || v, fmt: (v) => esc(GROUP[v] || v) },
    { key: "perTicket", label: "FLOWER / ticket", align: "right", extra: true, get: (r) => (r.cost > 0 && r.tickets > 0 ? r.cost / r.tickets : null), fmt: (v) => (v == null ? "" : n(v, 3)) },
  ],

  // data: { tickets: <compute?section=tickets data> }
  build({ tickets }) {
    if (!tickets || !Array.isArray(tickets.sources)) return { rows: [], footer: "", empty: "Tickety se nenačetly." };
    const rows = tickets.sources.filter((s) => s.tickets > 0);
    const open = rows.filter((r) => !r.done);
    const footer = rows.length
      ? `<div style="color:var(--text-dim)">${open.length ? `${open.length} zbývá · <b style="color:var(--green)">+${open.reduce((a, r) => a + r.tickets, 0)}</b>` : "✅ všechno hotovo"}</div>` : "";
    return { rows, footer, empty: "Tento týden žádné zdroje ticketů." };
  },
};
