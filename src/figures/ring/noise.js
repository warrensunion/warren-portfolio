// Ported from BTTRURSLF-v2 src/screens/shop/hub/noise.js (the BTTRshop hub). Unchanged code: the seeded
// rng, periodic value noise and the ring stone's maps as plain bytes. It has no DOM and no three.js on
// purpose, so the same code runs on the page, in the ring's worker (hubWorker.js) and in Node tests.
// A copy, not an import of the ice-block figure's noise.js: each figure folder stands alone.

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

/**
 * Task 7: the ring's stone - not ice. A periodic height field of grain
 * (fbm), shallow pits (soft round dents, some with a raised lip), and fine
 * scratches (short straight grooves in a few directions), as igloo's
 * shattered_ring normal reads up close (ref-ring-portal.png). Normal map from
 * it; roughness 0.72..0.95 (pits and scratches catch a little more light, so
 * a little smoother). Tiles: everything wraps.
 */
export function stoneData(seed = 5, size = 512) {
  const r = rng(seed);
  const grain = makeNoise(seed + 3, 16);
  const broad = makeNoise(seed + 9, 4);
  const h = new Float32Array(size * size);
  const wear = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      h[y * size + x] = grain(u, v, 4) * 0.35 + broad(u, v, 3) * 0.5;
    }
  }
  const W = (x) => ((x % size) + size) % size;
  // Pits: soft dents, a few with a lip.
  for (let i = 0; i < 420; i++) {
    const cx = r() * size;
    const cy = r() * size;
    const rad = 1.5 + Math.pow(r(), 3) * 7;
    const depth = 0.2 + r() * 0.35;
    const R = Math.ceil(rad * 1.6);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy) / rad;
        if (d > 1.6) continue;
        const k = W(Math.round(cy + dy)) * size + W(Math.round(cx + dx));
        const dent = d < 1 ? (1 - d * d) * (1 - d * d) : 0;
        const lip = d > 0.85 && d < 1.5 ? Math.sin(((d - 0.85) / 0.65) * Math.PI) * 0.18 : 0;
        h[k] += -dent * depth + lip * depth;
        wear[k] = Math.max(wear[k], dent);
      }
    }
  }
  // Scratches: thin straight grooves.
  for (let i = 0; i < 90; i++) {
    let x = r() * size;
    let y = r() * size;
    const a = (r() < 0.6 ? 0.35 : -0.9) + (r() - 0.5) * 0.5;
    const len = 20 + r() * 110;
    const depth = 0.12 + r() * 0.25;
    for (let s = 0; s < len; s++) {
      x += Math.cos(a);
      y += Math.sin(a);
      const fade = Math.sin((s / len) * Math.PI);
      for (const o of [-1, 0, 1]) {
        const k = W(Math.round(y + o * Math.cos(a))) * size + W(Math.round(x - o * Math.sin(a)));
        h[k] -= depth * fade * (o === 0 ? 1 : 0.35);
        wear[k] = Math.max(wear[k], 0.6 * fade);
      }
    }
  }
  const nimg = { data: new Uint8ClampedArray(size * size * 4) };
  const rimg = { data: new Uint8ClampedArray(size * size * 4) };
  const H = (x, y) => h[W(y) * size + W(x)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = (H(x + 1, y) - H(x - 1, y)) * 3.2;
      const dy = (H(x, y + 1) - H(x, y - 1)) * 3.2;
      const l = Math.hypot(dx, dy, 1);
      nimg.data[i * 4] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      nimg.data[i * 4 + 1] = Math.round((dy / l * 0.5 + 0.5) * 255);
      nimg.data[i * 4 + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      nimg.data[i * 4 + 3] = 255;
      const rough = 0.95 - 0.2 * wear[i] - 0.06 * grain(x / size, y / size, 2);
      rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = Math.round(Math.max(0.6, rough) * 255);
      rimg.data[i * 4 + 3] = 255;
    }
  }
  return { size, normal: nimg.data, rough: rimg.data };
}
