// WORLD as view widgets: the headline counts with the data's age, where the daily dump came from,
// and AUCTION PRIORITY (a tied bid goes to the higher Ascension, then level, then XP — your rank by
// that among every farm and the XP to pass the ones just ahead). The distribution charts are table
// widgets in world-dist.mjs.
import { kpis } from "../ui/viz.mjs";
import { compact } from "../ui/glance.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (v) => (v == null ? "—" : Math.round(v).toLocaleString("en-US"));
const date = (v) => (v ? new Date(v).toLocaleString("en-US") : "—");
export function fmtDur(ms) {
  if (ms == null || !isFinite(ms) || ms <= 0) return "—";
  const h = ms / 3600000;
  if (h < 1) return `${Math.round(ms / 60000)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}
const note = (html) => `<div class="v-world-note">${html}</div>`;

// When the data is from: the dump is generated once a day, so every number is that old at most.
export function dataAge(dump = {}, now = Date.now()) {
  const gen = dump.generated_at ? new Date(dump.generated_at) : null;
  if (!gen || isNaN(gen)) return "";
  const ageH = (now - gen) / 3600000;
  const tip = `Source: ${dump.path || "daily dump"}` + (dump.finished_at ? ` · imported ${date(dump.finished_at)}` : "") + (dump.complete ? "" : " · the import has not finished");
  return `<span title="${esc(tip)}">data from <b>${esc(gen.toLocaleString("en-US"))}</b> (${ageH < 48 ? Math.round(ageH) + " h" : (ageH / 24).toFixed(1) + " d"} old)${dump.complete ? "" : " ⚠️"}</span>`;
}

export const worldSummary = {
  type: "world-summary",
  title: "🌍 World at a glance",
  page: "world",
  needs: () => ({ stats: { res: "worldStats" } }),
  // data: { stats: farm-history?type=world&mode=stats }; ctx: { now? }
  view({ stats } = {}, ctx = {}) {
    if (!stats || !stats.stored) return { empty: "The WORLD data has not loaded yet." };
    const s = stats.stored, a = stats.active || {};
    const age = dataAge(stats.dump || {}, ctx.now || Date.now());
    return { html: kpis([{ v: num(s.farms), l: "farms" }, { v: num(a.d1), l: "played 24 h" }, { v: num(a.d7), l: "played 7 days" },
      { v: num(a.d30), l: "played 30 days" }, { v: num(a.d90), l: "played 90 days" }, { v: num(s.banned), l: "banned" }]) +
      (age ? `<div class="v-dim">${age}</div>` : "") };
  },
};

export const worldDataset = {
  type: "world-dataset",
  title: "🗂️ Dataset",
  page: "world",
  needs: () => ({ stats: { res: "worldStats" } }),
  view({ stats } = {}) {
    if (!stats || !stats.stored) return { empty: "The WORLD data has not loaded yet." };
    const d = stats.dump || {}, s = stats.stored;
    const row = (k, v, cls = "") => `<tr><td>${k}</td><td style="text-align:right"${cls ? ` class="${cls}"` : ""}>${v}</td></tr>`;
    return { html: note(`Source: <b>${esc(stats.source || "community CDN daily dump")}</b> — the whole public dataset, published once a day as gzipped JSONL. ` +
        `It also carries <b>lastActivity</b> and <b>isBlacklisted</b>, which no public API endpoint returns.`) +
      `<table class="w-table v-world-kv">` +
      row("Dump", d.path ? esc(d.path) : "—") +
      row("Generated", esc(date(d.generated_at))) +
      row("Age", fmtDur(d.age_ms), d.age_ms != null && d.age_ms > 36 * 3600000 ? "v-world-warn" : "v-dim") +
      row("Records loaded", num(d.records_done)) +
      row("Farms changed", num(d.changed)) +
      row("Skipped (had not played)", num(d.unchanged)) +
      row("Unparseable lines", num(d.unparseable), d.unparseable ? "v-world-warn" : "v-dim") +
      row("Load time", fmtDur(d.duration_ms)) +
      row("Status", d.complete ? "complete ✓" : "in progress / partial", d.complete ? "v-done" : "v-world-warn") +
      row("Newest activity in data", esc(date(s.newest_activity))) +
      row("With activity data", `${num(s.with_activity)} / ${num(s.farms)}`) +
      row("Permanently banned (farm.ban.status)", `${num(s.banned)} / ${num(s.farms)}`) +
      row("Flagged isBlacklisted", `${num(s.blacklisted)} / ${num(s.with_blacklist)} known`) +
      `</table>` + (d.last_error ? `<div class="v-world-warn">last error: ${esc(d.last_error)}</div>` : "") };
  },
};

// The XP in short (1.2 k, 3.45 M).
export const fmtXp = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e8 ? 1 : 2) + " M" : n >= 1e3 ? (n / 1e3).toFixed(1) + " k" : String(Math.round(n)));
const key = (x) => [x.ascension, x.level, x.xp];
const gt = (a, b) => { const A = key(a), B = key(b); for (let i = 0; i < 3; i++) { if (A[i] !== B[i]) return A[i] > B[i]; } return false; };
const farmsWord = (i) => (i === 0 ? "farm" : "farms");
// You and the farms just ahead, with the live refresh applied: the ones live data shows you already
// passed come off your rank; the rest sorted nearest first.
function prioState(P, ctx) {
  const live = (typeof ctx.prioLive === "function" && ctx.prioLive()) || {};
  const liveOf = (x) => Object.assign({}, x, live[x.farm_id] ? { ...live[x.farm_id], live: true } : {});
  const me = liveOf(P.me);
  const rows = (P.next || []).map(liveOf);
  const passed = rows.filter((r) => !gt(r, me)).length;      // live data: the ones you are already past
  const ahead = rows.filter((r) => gt(r, me)).sort((a, b) => (gt(a, b) ? 1 : gt(b, a) ? -1 : 0));
  return { me, ahead, passed, rank: Math.max(1, P.rank - passed) };
}

export const worldPriority = {
  type: "world-priority",
  title: "🎯 Auction priority",
  page: "world",
  needs: (farmId) => (farmId ? { prio: { res: "worldPrio", farm: farmId } } : {}),
  // data: { prio: farm-history?type=world&mode=priority }; ctx: { farmId, prioLive() → {farm_id: {ascension, xp, level}},
  // prioRun() → {done, total, err} while a live refresh runs }
  view({ prio } = {}, ctx = {}) {
    const intro = note("On an equal auction bid the higher <b>Ascension</b> wins, then the higher <b>level</b>, then more <b>XP</b> (the game's rule). " +
      "This is your place by that among every farm, and what separates you from the ones ahead.");
    if (!ctx.farmId) return { html: intro + `<div class="v-dim">No farm (?farm=…) — nobody to rank.</div>` };
    if (!prio) return { html: intro + `<div class="v-dim">Computing the ranking…</div>` };
    if (!prio.found) return { html: intro + `<div class="v-dim">Farm ${esc(String(ctx.farmId))} is not in the daily dump yet.</div>` };
    const P = prio;
    const { me, ahead, passed, rank } = prioState(P, ctx);
    const run = typeof ctx.prioRun === "function" ? ctx.prioRun() : null;
    const running = run && !run.err && run.done < run.total;
    const tile = (v, l, sub) => `<div class="v-kpi"><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(sub)}</small></div>`;
    let h = intro + `<div class="v-kpis v-world-kpis">` +
      tile(`#${num(rank)}`, "your rank", P.total ? `of ${num(P.total)} farms` : "") +
      tile(num(P.ahead - passed), "ahead of you", `${num(P.aheadSameAscension)} at the same Ascension`) +
      tile(`A${me.ascension} · L${me.level}`, "you", `${fmtXp(me.xp)} XP${me.live ? " · live" : ""}`) +
      tile(num(P.higherAscension), "higher Ascension", P.higherAscension ? "only ascensions pass you" : "nobody — it is only about XP") + `</div>`;
    const pct = run ? Math.round((run.done / Math.max(1, run.total)) * 100) : 0;
    h += `<div class="v-world-run"><button type="button" class="dash-toggle-btn" onclick="_worldPrioRefresh()"${running ? " disabled" : ""}>` +
      `${running ? "Loading…" : `🔄 Load the ${(P.next || []).length} ahead of you live`}</button>` +
      (run ? `<div class="v-big v-world-prog${run.err ? " err" : ""}"><i style="width:${pct}%"></i></div>` +
        `<span class="${run.err ? "v-world-warn" : "v-dim"}">${run.err ? "error: " + esc(run.err) : `${run.done} / ${run.total}`}</span>`
        : `<span class="v-dim">data from the daily dump — load live for the current state (with your API key, owner only)</span>`) + `</div>`;
    if (!ahead.length) {
      return { html: h + `<div class="v-done">${passed ? `You passed all ${passed} loaded — you are #${num(rank)}.` : "Nobody is ahead of you."}</div>` };
    }
    h += `<table class="w-table"><tr><th>#</th><th>farm</th><th>asc</th><th>level</th><th style="text-align:right">XP</th>` +
      `<th style="text-align:right">XP you need</th><th style="text-align:right">you pass</th></tr>` +
      ahead.map((r, i) => {
        const need = r.ascension > me.ascension ? null : Math.max(0, r.xp - me.xp) + 1;
        return `<tr${r.live ? "" : ' class="v-world-dimrow"'}><td>${num(rank - 1 - i)}</td>` +
          `<td>${esc(r.username || "—")} <span class="v-dim">#${esc(String(r.farm_id))}${r.live ? " · live" : ""}</span></td>` +
          `<td>A${r.ascension}</td><td>${r.level}</td><td style="text-align:right">${fmtXp(r.xp)}</td>` +
          `<td style="text-align:right"${need == null ? ' class="v-dim"' : ""}>${need == null ? "higher Ascension" : "+" + fmtXp(need)}</td>` +
          `<td style="text-align:right">${need == null ? "—" : `${i + 1} ${farmsWord(i)}`}</td></tr>`;
      }).join("") + `</table>` +
      `<div class="v-dim" style="margin-top:6px">Level comes from XP and Ascension, so at the same Ascension only XP decides. “XP you need” = how much you must gain to pass that farm (and with it every one above it in the table).</div>`;
    return { html: h };
  },
};

// ── iPhone glance models: ui/glance-templates offers the looks ──
const NOT_LOADED = "The WORLD data has not loaded yet.";
const shareOf = (v, of) => (of > 0 ? Math.min(100, ((+v || 0) / of) * 100) : 0);
const pctText = (v, of) => { const p = shareOf(v, of); return `${p < 1 ? p.toFixed(2) : p.toFixed(1)}%`; };

// farms that played in the last 24 h (a ring = their share of every farm); the activity windows
worldSummary.look = "number";
worldSummary.glanceModel = ({ stats } = {}) => {
  if (!stats || !stats.stored) return { empty: NOT_LOADED };
  const s = stats.stored, a = stats.active || {}, all = +s.farms || 0;
  const win = (icon, name, v, tone = "") => ({ icon, name, sub: `${pctText(v, all)} of every farm`, value: compact(v), tone, pct: shareOf(v, all) });
  return {
    head: { value: compact(a.d1), ring: shareOf(a.d1, all), ringTone: "info", cap: `played in 24 h · of ${compact(all)} farms` },
    items: [win("⚡", "24 h", a.d1, "ok"), win("📅", "7 days", a.d7), win("🗓️", "30 days", a.d30), win("🌙", "90 days", a.d90), win("🚫", "banned", s.banned, "bad")],
    tiles: [{ label: "farms", value: compact(all) }, { label: "24 h", value: compact(a.d1) }, { label: "7 days", value: compact(a.d7) }, { label: "30 days", value: compact(a.d30) }],
    foot: `${compact(all)} farms · ${compact(s.banned)} banned`,
  };
};

// how old the daily dump is (orange past 36 h or unfinished); what the last import did
worldDataset.look = "number";
worldDataset.glanceModel = ({ stats } = {}) => {
  if (!stats || !stats.stored) return { empty: NOT_LOADED };
  const d = stats.dump || {}, s = stats.stored;
  const stale = (d.age_ms != null && d.age_ms > 36 * 3600000) || !d.complete;
  const rec = +d.records_done || 0;
  return {
    head: { value: fmtDur(d.age_ms), tone: stale ? "warn" : "ok", cap: `dump age · ${d.complete ? "complete" : "in progress / partial"}` },
    items: [
      { icon: "📦", name: "records", value: compact(d.records_done) },
      { icon: "✏️", name: "changed", sub: rec ? `${pctText(d.changed, rec)} of the records` : "", value: compact(d.changed), ...(rec ? { pct: shareOf(d.changed, rec) } : {}) },
      { icon: "💤", name: "skipped", sub: "had not played", value: compact(d.unchanged), ...(rec ? { pct: shareOf(d.unchanged, rec) } : {}) },
      { icon: "⚠️", name: "unparseable", value: compact(d.unparseable), tone: d.unparseable ? "warn" : "" },
      { icon: "⏱️", name: "load time", value: fmtDur(d.duration_ms) },
      { icon: "📊", name: "with activity", sub: `of ${compact(s.farms)} farms`, value: compact(s.with_activity), ...(s.farms ? { pct: shareOf(s.with_activity, s.farms) } : {}) },
    ],
    tiles: [{ label: "age", value: fmtDur(d.age_ms) }, { label: "records", value: compact(d.records_done) }, { label: "changed", value: compact(d.changed) },
      { label: "status", value: d.complete ? "complete" : "partial" }],
  };
};

// your auction rank; the farms just ahead and the XP to pass each
worldPriority.look = "number";
worldPriority.glanceModel = ({ prio } = {}, ctx = {}) => {
  if (!ctx.farmId) return { empty: "No farm — nobody to rank." };
  if (!prio) return { empty: "Computing the ranking…" };
  if (!prio.found) return { empty: `Farm ${ctx.farmId} is not in the daily dump yet.` };
  const { me, ahead, passed, rank } = prioState(prio, ctx);
  const item = (r) => {
    const need = r.ascension > me.ascension ? null : Math.max(0, r.xp - me.xp) + 1;
    return { name: r.username || `#${r.farm_id}`, sub: `A${r.ascension} · L${r.level}${r.live ? " · live" : ""}`,
      ...(need == null ? { chip: { text: "HIGHER ASC" } } : { value: `+${fmtXp(need)}`, tone: "warn" }) };
  };
  return {
    head: { value: `#${num(rank)}`, tone: rank === 1 ? "ok" : "", cap: `auction priority${prio.total ? ` of ${compact(prio.total)}` : ""} · A${me.ascension} L${me.level}` },
    items: ahead.map(item),
    tiles: [{ label: "rank", value: `#${num(rank)}` }, { label: "ahead", value: num(prio.ahead - passed) },
      { label: "you", value: `A${me.ascension} L${me.level}` }, { label: "higher Asc", value: num(prio.higherAscension) }],
    foot: !ahead.length ? "nobody ahead of you" : ahead[0].ascension > me.ascension ? "only an Ascension passes the next farm"
      : `+${fmtXp(Math.max(0, ahead[0].xp - me.xp) + 1)} XP passes the next farm`,
  };
};
