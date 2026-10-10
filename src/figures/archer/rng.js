// mulberry32: a tiny seeded generator, so a seed always gives the same run. The step is exposed on its
// own (next32) because the game keeps its generator state as a plain number inside its state object:
// that keeps the state cloneable and comparable (the determinism test deep-compares two runs).

/** One step from state `a`: [a float in 0..1, the next state]. */
export function next32(a) {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    const [r, n] = next32(a);
    a = n;
    return r;
  };
}
