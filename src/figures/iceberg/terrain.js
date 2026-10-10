// Ported from BTTRURSLF-v2 src/screens/intro/terrain.js, unchanged: berg.js and the scene both read
// these numbers, and keeping them identical keeps the ported berg test meaningful.

/**
 * The iceberg's world as numbers - the water, the glacier wall behind it,
 * the ranges above the glacier, and the order they arrive in.
 *
 * Why plain functions and not models: the same numbers build the meshes,
 * decide where the load-in front has reached, and are read by
 * scripts/test-berg.mjs in plain Node - one source, so nothing can
 * disagree, and none of it needs three.js to have downloaded.
 *
 * The frame follows design-reference/iceberg/layout-sketch.png. The camera
 * sits just above the waterline looking at the berg (berg.js), so from the
 * top: the ranges (igloo.inc's rock and snow under blue-grey fog), the
 * glacier wall (top edge 31-36 % down), the water's surface (40-47 %), and
 * below it a cross-section through the water - the world is cut by the plane
 * z = FRONT_Z, and everything behind that plane and under y = 0 is seen
 * through the water, the way iceberg-style.png shows its berg.
 */

// ── Noise ──────────────────────────────────────────────────────────────────
// 2D simplex (Gustavson), seeded so the place is the same on every visit.

const GRAD = [
  [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1],
];
const PERM = new Uint8Array(512);
(() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 1337;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

export function simplex(x, y) {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = 1 - i1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  let n = 0;
  let c = 0.5 - x0 * x0 - y0 * y0;
  if (c > 0) {
    const g = GRAD[PERM[ii + PERM[jj]] & 7];
    c *= c;
    n += c * c * (g[0] * x0 + g[1] * y0);
  }
  c = 0.5 - x1 * x1 - y1 * y1;
  if (c > 0) {
    const g = GRAD[PERM[ii + i1 + PERM[jj + j1]] & 7];
    c *= c;
    n += c * c * (g[0] * x1 + g[1] * y1);
  }
  c = 0.5 - x2 * x2 - y2 * y2;
  if (c > 0) {
    const g = GRAD[PERM[ii + 1 + PERM[jj + 1]] & 7];
    c *= c;
    n += c * c * (g[0] * x2 + g[1] * y2);
  }
  return 70 * n; // -1..1
}

export function fbm(x, y, oct) {
  let a = 0.5;
  let f = 1;
  let sum = 0;
  for (let o = 0; o < oct; o++) {
    sum += a * simplex(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return sum;
}

/** Ridged fbm: sharp crests where plain noise has soft hills - what makes a
    lump read as a mountain with arêtes. 0..~1. */
export function ridged(x, y, oct = 6) {
  let a = 0.55;
  let f = 1;
  let sum = 0;
  let prev = 1;
  for (let o = 0; o < oct; o++) {
    let n = 1 - Math.abs(simplex(x * f + o * 7.1, y * f - o * 3.3));
    n *= n;
    sum += n * a * prev;
    prev = n;
    f *= 2.1;
    a *= 0.5;
  }
  return sum;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ── The layout ─────────────────────────────────────────────────────────────

/** The cross-section: the water is cut by this plane. The camera is in
    front of it (z = 40), the berg behind it (z within ±6). */
export const FRONT_Z = 14;
/** The glacier wall's face: where the water ends. */
export const GLACIER_Z = -60;
/** How far back the glacier's top runs before the ranges take over. */
export const GLACIER_BACK = -84;
/** The far edge of the world. */
export const FAR_Z = -330;
export const HALF_W = 360;

/** Height of the glacier's top edge along x: 4-6.5 units, which puts it 31-36 %
    down the frame from the waterline camera. Breaks where seracs have
    calved off, so the line is ragged, not ruled. */
export function glacierTop(x) {
  const broad = fbm(x * 0.011 + 3.3, 0.7, 3);
  const calve = Math.max(0, simplex(x * 0.07 + 11, 2.1)) * 0.9;
  return 5.1 + broad * 2.4 - calve;
}

/** How far the glacier's face stands proud of GLACIER_Z at (x, y): vertical
    ribs and crevasses. Mostly a function of x (the cracks run top to
    bottom), a little of y so they wander. Negative = a crevasse. */
export function glacierFace(x, y) {
  const rib = ridged(x * 0.16 + 4, y * 0.025, 4); // 0..~1, sharp crests
  const crev = Math.pow(Math.abs(simplex(x * 0.34 + 1.7, y * 0.05 - 3)), 0.6);
  return 1.7 * rib - 1.5 * (1 - crev) + 0.35 * fbm(x * 0.9, y * 0.4, 2);
}

/** The ranges behind the glacier: a low ice plateau right behind its top,
    then igloo.inc's big soft rock mountains rising into the fog, tallest
    toward the frame's sides so the berg's peak has sky round it. */
export function height(x, z) {
  const back = clamp01((GLACIER_Z - z) / (GLACIER_Z - FAR_Z)); // 0 at the glacier, 1 at the far edge
  // Starts just under the glacier's lip, so the wall's top edge is the edge.
  const plateau = glacierTop(x) - 0.25 + (0.85 + 1.6 * fbm(x * 0.03, z * 0.03, 3)) * smooth(0, 0.04, back);
  // Big soft massifs (igloo-terrain.png), a few broad ridges on them.
  const broad = fbm(x * 0.0058 + 11, z * 0.0058 - 7, 4);
  const rid = ridged(x * 0.0075 + 40, z * 0.0075 - 20, 4);
  const hills = 2.4 + 2.6 * fbm(x * 0.04 + 9, z * 0.04 - 4, 4);
  const side = 0.7 + 0.5 * smooth(30, 160, Math.abs(x));
  const rise = smooth(0.05, 0.55, back);
  const mountain = (Math.max(0, broad + 0.22) * 78 + rid * 22 + hills * 3) * side * rise;
  return Math.max(plateau + hills * smooth(0.0, 0.12, back), mountain + plateau * (1 - rise));
}
