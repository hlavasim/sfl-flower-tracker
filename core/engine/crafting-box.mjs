// The crafting box: what it is making. The game keeps a queue now ({ status, queue: [{ name, readyAt,
// startedAt, type }] }); older farms carry one { item: { collectible | wearable }, readyAt }.
import { toMs } from "./power-costs.mjs";

/** The jobs in the box, soonest first: [{ name, readyAt (ms), startedAt (ms, 0 = unknown) }]. */
export function craftingJobs(cb) {
  if (!cb || typeof cb !== "object") return [];
  if (Array.isArray(cb.queue)) {
    return cb.queue.filter((j) => j && j.name)
      .map((j) => ({ name: j.name, readyAt: toMs(j.readyAt || 0), startedAt: toMs(j.startedAt || 0) }))
      .sort((a, b) => a.readyAt - b.readyAt);
  }
  const name = cb.item && (cb.item.collectible || cb.item.wearable);
  return cb.status === "crafting" && name ? [{ name, readyAt: toMs(cb.readyAt || 0), startedAt: 0 }] : [];
}
