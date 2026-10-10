// Ported from BTTRURSLF-v2 src/screens/shop/hub/noise.js (the BTTRshop hub). What changed and why:
// only the seeded rng and the periodic value noise came across, unchanged, because the frost maps
// (textures.js) are all the ice figures need; the ring stone's maps (stoneData) belong to the hub's
// ring and its worker, which the portfolio does not have.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Periodic value noise on a `period`-cell lattice, fbm of `oct` octaves. */
export function makeNoise(seed, period) {
  const r = rng(seed);
  const N = 256;
  const tab = new Float32Array(N * N).map(() => r());
  const at = (x, y, p) => tab[((((y % p) + p) % p) % N) * N + ((((x % p) + p) % p) % N)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const v = (x, y, p) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const a = at(xi, yi, p) + (at(xi + 1, yi, p) - at(xi, yi, p)) * fx;
    const b = at(xi, yi + 1, p) + (at(xi + 1, yi + 1, p) - at(xi, yi + 1, p)) * fx;
    return a + (b - a) * fy;
  };
  return (u, w, oct = 5) => {
    let s = 0;
    let amp = 0.5;
    let p = period;
    for (let i = 0; i < oct; i++) {
      s += amp * v(u * p, w * p, p);
      amp *= 0.5;
      p *= 2;
    }
    return s / (1 - Math.pow(0.5, oct));
  };
}
