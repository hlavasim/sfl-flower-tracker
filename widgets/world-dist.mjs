// WORLD distributions as table widgets: how many farms sit in each bucket (island type, skill
// points), the share, a bar, and the viewer's own bucket highlighted with how many farms are above
// it. Data: the cached world aggregates (store "worldAgg") and the viewer's row ("worldMe").
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n0 = (v) => Math.round(+v || 0).toLocaleString("en-US");

function distWidget({ type, title, group, limit, meKey, label, defaults, above, logBar = false }) {
  return {
    type, title, page: "world",
    needs: (farmId) => ({ agg: { res: "worldAgg", group, ...(limit ? { limit } : {}) }, me: { res: "worldMe", farm: farmId } }),
    optional: ["me"],
    defaults,
    rowKey: (r) => r.key,
    rowLabel: (r) => label(r.key),
    rowClass: (r) => (r.mine ? "w-row-hl" : ""),
    keepRow: (r) => r.mine,   // your own bucket stays visible below the top N
    columns: [
      { key: "key", label: "group", fmt: (v, r) => `${esc(label(v))}${r.mine ? " ← you" : ""}` },
      { key: "n", label: "farms", align: "right", fmt: n0 },
      { key: "share", label: "share", align: "right", fmt: (v) => `${(v * 100).toFixed(1)} %` },
      { key: "bar", label: logBar ? "log" : "", title: logBar ? "bar length on a log scale (otherwise the high levels would not show)" : undefined, get: (r) => r.n, fmt: (v, r) => `<div class="w-hbar"><span style="width:${(r.rel * 100).toFixed(1)}%"></span></div>` },
    ],
    // data: { agg: [{ key, n }], me: { found, ...farm_world row } | null }
    build({ agg, me }) {
      if (!Array.isArray(agg)) return { rows: [], footer: "", empty: "The WORLD data did not load." };
      const total = agg.reduce((a, r) => a + (+r.n || 0), 0);
      const max = Math.max(1, ...agg.map((r) => +r.n || 0));
      const mine = me && me.found ? me[meKey] : undefined;
      const scale = (v) => (logBar ? Math.log1p(v) / Math.log1p(max) : v / max);
      const rows = agg.map((r) => ({ key: r.key, n: +r.n || 0, share: total ? (+r.n || 0) / total : 0, rel: scale(+r.n || 0), mine: mine != null && r.key === mine }));
      let footer = `<div style="color:var(--text-dim)">${n0(total)} farms`;
      if (mine != null && above) {
        const over = agg.filter((r) => above(r.key, mine)).reduce((a, r) => a + (+r.n || 0), 0);
        footer += ` · you: ${esc(label(mine))} · ${n0(over)} farms above you (top ${total ? ((over / total) * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : "—"} %)`;
      }
      return { rows, footer: footer + "</div>", empty: "No farms." };
    },
  };
}

export const worldIslands = distWidget({
  type: "world-islands", title: "🌍 Players by island", group: "island_type", meKey: "island_type",
  label: (k) => String(k), defaults: { sort: { key: "n", dir: "desc" } },
});

export const worldSkillPoints = distWidget({
  type: "world-skill-points", title: "🌍 Players by skill points", group: "total_level", limit: 1000, meKey: "total_level",
  label: (k) => `${k} sp`, above: (k, mine) => +k > +mine, logBar: true,
  defaults: { sort: { key: "key", dir: "desc" }, rows: { mode: "top", top: 30, picked: [] } },
});
