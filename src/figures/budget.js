// Browsers start dropping the oldest WebGL contexts (and some phones crash the tab) once a page holds
// more than a handful, so the host keeps the page's live contexts within `max` and sacrifices the
// figures farthest from the viewport. A figure acquires a weight: the number of WebGL contexts it holds
// (1 for a three.js scene, 2 for the bcwc iframe's page, 0 for a frame player). Pure bookkeeping with no
// DOM so the eviction rule is unit-tested in Node.

export function createBudget(max) {
  const live = new Map(); // id -> { distance: () => px from the viewport (0 = on screen), weight }
  const used = () => [...live.values()].reduce((n, e) => n + e.weight, 0);

  return {
    // Reserves `weight` for `id` and returns the ids the caller must destroy to stay within `max`.
    // Evictees are dropped from the live set here, so used() never exceeds max even before the caller
    // gets round to releasing them; release() stays idempotent for that reason.
    acquire(id, distance, weight = 1) {
      live.set(id, { distance, weight });
      if (used() <= max) return [];
      const others = [...live.keys()]
        .filter((k) => k !== id && live.get(k).weight > 0)
        .map((k) => ({ k, d: Number(live.get(k).distance()) || 0 }))
        .sort((x, y) => y.d - x.d);
      const out = [];
      for (const { k } of others) {
        if (used() <= max) break;
        live.delete(k);
        out.push(k);
      }
      return out;
    },
    release(id) {
      live.delete(id);
    },
    live() {
      return [...live.keys()];
    },
    entries() {
      return [...live].map(([id, e]) => ({ id, weight: e.weight }));
    },
    used,
  };
}
