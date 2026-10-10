// Browsers start dropping the oldest WebGL contexts (and some phones crash the tab) once a page holds
// more than a handful, so the host keeps at most `max` live scenes and sacrifices the ones farthest from
// the viewport. Pure bookkeeping with no DOM so the eviction rule is unit-tested in Node.

export function createBudget(max) {
  const live = new Map(); // id -> () => distance from the viewport in px (0 = on screen)

  return {
    // Reserves a slot for `id` and returns the ids the caller must destroy to stay within `max`.
    // Evictees are dropped from the live set here, so live() never exceeds max even before the
    // caller gets round to releasing them; release() stays idempotent for that reason.
    acquire(id, distance) {
      live.set(id, distance);
      const over = live.size - max;
      if (over <= 0) return [];
      const others = [...live.keys()]
        .filter((k) => k !== id)
        .map((k) => ({ k, d: Number(live.get(k)()) || 0 }))
        .sort((x, y) => y.d - x.d)
        .slice(0, over)
        .map((x) => x.k);
      for (const k of others) live.delete(k);
      return others;
    },
    release(id) {
      live.delete(id);
    },
    live() {
      return [...live.keys()];
    },
  };
}
