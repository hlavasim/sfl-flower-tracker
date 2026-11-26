// DIFF (the owner's farm only) as read-only widgets. The investment ledger is owner-only, so the
// page loads it (_invLoadState / _insLoadState, the owner key never passes through here) and the
// widgets get the figures through ctx; a pinned copy asks the page to load them (ctx.ensure).
// The editors (add / edit a transaction, the CSV import, the owner key), the charts and the
// changelog explorer stay on the DIFF page.
//   💰 Repay — BTC back out of FLOWER: how much of the peak is repaid, the plan's lead and pace.
//   📈 Earning rate — the farm's value trend over 7 and 30 days, net of withdrawals and deposits.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const btc = (v) => (v == null || !isFinite(v) ? "—" : `${Number(v).toFixed(4)} ₿`);
const sats = (v) => (v == null || !isFinite(v) ? "—" : `${Math.round(v * 1e8).toLocaleString("en-US")} sats`);
const fl = (v) => (v == null || !isFinite(v) ? "—" : Math.round(v).toLocaleString("en-US"));
const pct = (v) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(1)} %`);
const signed = (v, f = (x) => x.toFixed(1)) => (v >= 0 ? "+" : "−") + f(Math.abs(v));
// the page's figures; null = still loading (ask once), a string = why there are none
function stateOf(ctx, key) {
  const st = typeof ctx[key] === "function" ? ctx[key]() : null;
  if (st && st.error) return { empty: st.error };
  if (!st || !st.ready) { if (typeof ctx.ensure === "function") ctx.ensure(); return { empty: st && st.loading ? st.loading : "Loading…" }; }
  return { st };
}
const metricWidget = (o) => ({
  page: "diff",
  needs: () => ({}),
  defaults: {},
  rowKey: (r) => r.key,
  rowLabel: (r) => r.label,
  columns: [
    { key: "label", label: "", fmt: (v, r) => `<b>${esc(v)}</b>${r.note ? `<small class="v-dim"> ${esc(r.note)}</small>` : ""}` },
    { key: "value", label: "", align: "right", fmt: (v, r) => `<span class="${r.tone ? `v-${r.tone}` : ""}">${esc(v)}</span>` },
  ],
  ...o,
});

// ── 💰 Repay ──
export function repayRows(f) {
  const a = f.aggSheet || {}, s = f.planStats, rows = [];
  rows.push({ key: "peak", label: "Peak BTC put in", value: btc(a.peakBtc) });
  rows.push({ key: "inside", label: "Still inside", value: btc(Math.max(0, a.netDebtBtc || 0)), note: f.flowerPerBtc > 0 ? `≈ ${fl(Math.max(0, a.netDebtBtc || 0) * f.flowerPerBtc)} FLOWER` : "" });
  rows.push({ key: "repaid", label: "Repaid", value: pct(a.repaidPct), tone: a.repaidPct >= 100 ? "done" : "" });
  if (f.btcBackOnChain > 0) rows.push({ key: "onchain", label: "BTC back on chain", value: btc(f.btcBackOnChain), note: "cbBTC / WBTC in the wallets" });
  rows.push({ key: "liquid", label: "Liquid now", value: btc((f.liquidValueBtc || 0) + (f.walletLiquidBtc || 0) + (f.eggsLiquidBtc || 0) + (f.lpBtc || 0)), note: "farm sold today + wallet + eggs + LP" });
  if (f.lockedBtc > 0) rows.push({ key: "locked", label: "Locked", value: btc(f.lockedBtc), note: "returns at unlock" });
  if (s && s.dailyTargetBtc > 0) {
    const lead = s.balanceBtc / s.dailyTargetBtc;
    rows.push({ key: "plan", label: "Plan a day", value: btc(s.dailyTargetBtc), note: f.flowerPerBtc > 0 ? `≈ ${fl(s.dailyTargetBtc * f.flowerPerBtc)} FLOWER` : "" });
    rows.push({ key: "lead", label: lead >= 0 ? "Ahead of plan" : "Behind plan", value: `${signed(Math.round(lead), (x) => String(x))} days`, tone: lead >= 0 ? "done" : "warn" });
    rows.push({ key: "pace", label: "Pace", value: `${((Math.max(0, s.paceBtcPerDay || 0)) / s.dailyTargetBtc).toFixed(2)} d/day`, note: "days of plan sent a day, lately" });
  }
  return rows;
}
export const invRepay = metricWidget({
  type: "inv-repay",
  title: "💰 Repay — BTC back out of FLOWER",
  build(data = {}, ctx = {}) {
    const { st, empty } = stateOf(ctx, "inv");
    if (!st) return { rows: [], footer: "", empty };
    return { rows: repayRows(st.figures), empty: "Nothing in the ledger yet.",
      footer: `<div class="v-dim">Read-only. Add or edit transactions on the DIFF page.</div>` };
  },
});
invRepay.look = "gauge";
invRepay.glanceModel = (data = {}, ctx = {}) => {
  const { st, empty } = stateOf(ctx, "inv");
  if (!st) return { empty };
  const f = st.figures, a = f.aggSheet || {}, s = f.planStats;
  const lead = s && s.dailyTargetBtc > 0 ? s.balanceBtc / s.dailyTargetBtc : null;
  const rows = repayRows(f);
  return {
    head: { value: a.repaidPct != null ? `${Math.round(a.repaidPct)}%` : "—", cap: lead == null ? "of the peak repaid" : `repaid · ${lead >= 0 ? "ahead" : "behind"} by ${Math.abs(Math.round(lead))} d`,
      ring: Math.max(0, Math.min(100, a.repaidPct || 0)), ringTone: lead != null && lead < 0 ? "warn" : "ok", tone: lead != null && lead < 0 ? "warn" : "ok" },
    items: rows.map((r) => ({ name: r.label, sub: r.note || "", value: r.value, tone: r.tone === "done" ? "ok" : r.tone || "" })),
    tiles: rows.filter((r) => ["inside", "repaid", "lead", "pace"].includes(r.key)).map((r) => ({ label: r.label.toLowerCase(), value: r.value })),
  };
};

// ── 📈 Earning rate ──
export function earningRows(e) {
  const out = [];
  for (const [key, r] of [["r7", e.r7], ["r30", e.r30]]) {
    const label = key === "r7" ? "7-day" : "30-day";
    if (!r) { out.push({ key, label, value: "not enough data" }); continue; }
    const perBtc = e.btcPerSfl > 0 ? r.sflPerDay * e.btcPerSfl : null;
    out.push({ key, label, value: `${signed(r.sflPerDay)} FLOWER/day`, tone: r.sflPerDay >= 0 ? "done" : "bad",
      note: `${perBtc != null ? `${signed(perBtc, (x) => sats(x))}/day · ` : ""}${r.sampleSize} snapshots` });
  }
  return out;
}
export const invEarning = metricWidget({
  type: "inv-earning",
  title: "📈 Earning rate — the farm's value trend",
  build(data = {}, ctx = {}) {
    const { st, empty } = stateOf(ctx, "ins");
    if (!st) return { rows: [], footer: "", empty };
    return { rows: earningRows(st), empty: "",
      footer: `<div class="v-dim">The slope of the farm's value over the last 7 / 30 days, with FLOWER withdrawn to BTC added back (a cash-out is not a loss).</div>` };
  },
});
invEarning.look = "chart-2";
invEarning.glanceModel = (data = {}, ctx = {}) => {
  const { st, empty } = stateOf(ctx, "ins");
  if (!st) return { empty };
  const r = st.r7 || st.r30;
  return {
    head: r ? { value: signed(r.sflPerDay), unit: " /day", tone: r.sflPerDay >= 0 ? "ok" : "bad", cap: `${st.r7 ? "7-day" : "30-day"} earning rate · FLOWER` } : { value: "—", cap: "not enough snapshots yet" },
    items: earningRows(st).map((x) => ({ name: x.label, sub: x.note || "", value: x.value.replace(" FLOWER/day", ""), tone: x.tone === "done" ? "ok" : x.tone || "" })),
    ...(st.series && st.series.length >= 2 ? { series: st.series } : {}),
  };
};

// ── 📅 Farm changes by day: what changed in FLOWER each day (the DIFF explorer's day view, through the
// store's farmChanges: farm-diff-agg + section=diff); the explorer with its ranges stays on the page ──
// the period's day in local time, as the DIFF explorer labels it (a day starts at local midnight,
// which is 23:00 UTC the evening before in winter)
const day = (p) => { const d = new Date(p); if (!isFinite(d)) return String(p || "").slice(0, 10); const q = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${q(d.getMonth() + 1)}-${q(d.getDate())}`; };
const flSigned = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 2);
export function dayRows(list) {
  return (list || []).map((p) => {
    const its = (p.items || []).filter((i) => isFinite(i.sflValue) && i.sflValue !== 0);
    const gains = its.filter((i) => i.sflValue > 0).reduce((a, i) => a + i.sflValue, 0);
    const losses = its.filter((i) => i.sflValue < 0).reduce((a, i) => a + i.sflValue, 0);
    const top = its.slice().sort((a, b) => Math.abs(b.sflValue) - Math.abs(a.sflValue)).slice(0, 3);
    return { day: day(p.period), count: p.count || 0, net: p.netSfl || 0, gains, losses, top };
  }).sort((a, b) => b.day.localeCompare(a.day));
}
export const diffDays = {
  type: "diff-days",
  title: "📅 Farm changes by day",
  page: "diff",
  needs: (farmId, opts = {}) => ({ changes: { res: "farmChanges", farm: farmId, days: Number(opts.days) || 7 } }),
  optionsLabel: "Days",
  options: [{ key: "days", label: "Days back", kind: "select", choices: [["7", "7 days"], ["14", "14 days"], ["30", "30 days"]] }],
  defaults: { opts: { days: "7" } },
  rowKey: (r) => r.day,
  rowLabel: (r) => r.day,
  columns: [
    { key: "day", label: "day", fmt: (v, r) => `<b>${esc(v)}</b><small class="v-dim"> ${r.count} snapshot${r.count === 1 ? "" : "s"}</small>` },
    { key: "net", label: "net", align: "right", fmt: (v) => `<b class="${v >= 0 ? "v-sk-pos" : "v-rm-neg"}">${flSigned(v)}</b>` },
    { key: "gains", label: "gains", align: "right", extra: true, fmt: (v) => `<span class="v-sk-pos">${flSigned(v)}</span>` },
    { key: "losses", label: "losses", align: "right", extra: true, fmt: (v) => `<span class="v-rm-neg">${flSigned(v)}</span>` },
    { key: "top", label: "biggest moves", get: (r) => r.top.length, fmt: (v, r) => r.top.map((i) => `${esc(i.itemName || i.key)} <span class="${i.sflValue >= 0 ? "v-sk-pos" : "v-rm-neg"}">${flSigned(i.sflValue)}</span>`).join(" · ") },
  ],
  build({ changes } = {}) {
    if (!Array.isArray(changes)) return { rows: [], footer: "", empty: "No farm history." };
    const rows = dayRows(changes);
    const net = rows.reduce((a, r) => a + r.net, 0);
    return { rows, empty: "No recorded changes in this period.",
      footer: `<div class="v-dim">${rows.length} days · net ${flSigned(net)} FLOWER. Valued at market prices (crafted items at their ingredients). The explorer with any range is on the DIFF page.</div>` };
  },
};
diffDays.look = "chart-2";
diffDays.glanceModel = (data = {}, ctx = {}, opts = {}) => {
  const out = diffDays.build(data, ctx, opts);
  if (!out.rows.length) return { empty: out.empty };
  const net = out.rows.reduce((a, r) => a + r.net, 0), top = Math.max(0.001, ...out.rows.map((r) => Math.abs(r.net)));
  return {
    head: { value: flSigned(net), unit: " 🌸", tone: net >= 0 ? "ok" : "bad", cap: `farm value change · ${out.rows.length} days` },
    items: out.rows.map((r) => ({ name: r.day, sub: r.top.map((i) => i.itemName || i.key).join(", "), value: flSigned(r.net), tone: r.net >= 0 ? "ok" : "bad", pct: (Math.abs(r.net) / top) * 100 })),
    series: out.rows.slice().reverse().map((r) => r.net),
    tiles: [{ label: "net", value: flSigned(net) }, { label: "best day", value: flSigned(Math.max(...out.rows.map((r) => r.net))) }, { label: "worst day", value: flSigned(Math.min(...out.rows.map((r) => r.net))) }],
  };
};
