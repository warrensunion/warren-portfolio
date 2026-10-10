// Ported from terrarium src/sim/genes.js at 7612a40 (Warren's own project). Changes: none but this header.
/**
 * Body genes are six floats in [0,1] so they mutate and cross like any
 * other gene, and the renderer never sees them raw: bodyFromGenes is the
 * single place that turns them into sizes and colours, linearly, so a small
 * mutation is always a small visible change (an offspring looks like its
 * parents). Lightness has no gene of its own; it falls as saturation rises,
 * the way a pigment darkens, which keeps every creature readable on fog.
 */
const KEYS = ['segments', 'limb', 'size', 'hue', 'sat', 'pattern'];
const clamp01 = (v) => (v > 1 ? 1 : v >= 0 ? v : 0); // NaN -> 0

export function randomBodyGenes(rng) {
  const b = {};
  for (const k of KEYS) b[k] = rng.next();
  return b;
}

/** sd 0.08 at the default rate 0.3, scaling linearly with rate. */
export function mutateBodyGenes(b, rng, rate = 0.3) {
  const sd = 0.08 * (rate / 0.3);
  const out = {};
  for (const k of KEYS) out[k] = clamp01(b[k] + rng.normal() * sd);
  return out;
}

export function crossBodyGenes(a, b, rng) {
  const out = {};
  for (const k of KEYS) out[k] = rng.next() < 0.5 ? a[k] : b[k];
  return out;
}

export function bodyFromGenes(b) {
  const g = {};
  for (const k of KEYS) g[k] = clamp01(b[k]);
  return {
    segments: 2 + Math.round(g.segments * 5),
    legLength: 0.6 + 1.2 * g.limb,
    radius: 0.012 + 0.018 * g.size,
    hue: 360 * g.hue,
    sat: 0.35 + 0.5 * g.sat,
    light: 0.7 - 0.25 * g.sat,
    pattern: Math.min(2, Math.floor(g.pattern * 3)),
  };
}
