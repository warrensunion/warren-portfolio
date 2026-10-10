// Ported from BTTRURSLF-v2 src/screens/intro/berg.js. Geometry and motion are unchanged on purpose:
// scripts/test-berg.mjs (port of check-iceberg-blocks.mjs) proves the no-overlap and slide-along-dir
// rules on exactly these numbers, so any edit here must keep that test green.

/**
 * The iceberg as numbers: its shape, the shell of ice blocks round its
 * hollow, and the one thing a block may ever do - slide along its own line.
 *
 * Why it is built this way (BUILD_ICEBERG.md, "Movement rules"):
 *
 *   A block's position is always rest + dir * d, with 0 <= d <= dMax. No
 *   rotation, no tilt, no sideways push, in any state. And blocks never pass
 *   through each other - by construction, not by luck:
 *
 *   - The hollow's centre C is the origin, on the waterline. The berg is
 *     star-shaped from C: every ray from C leaves its surface once (outerR).
 *   - The shell is split by direction from C into convex cones - a Voronoi
 *     of the block sites on the sphere of directions, each half clipped by
 *     the waterline plane, so no cone crosses it. A block is the part of the
 *     shell inside its cone, shrunk a little toward its own axis (the seam).
 *   - A block's dir is its site's direction, which lies inside its cone. A
 *     convex cone is closed under moving along a direction inside it, so a
 *     block sliding out along dir never leaves its cone and never enters a
 *     neighbour's. Moving in is capped at d = 0.
 *
 *   The Voronoi is taken in a space stretched 1.85x vertically, so the cells
 *   come out wider than tall like igloo's blocks (150 x 85 px). A linear map
 *   sends convex cones to convex cones, so the argument survives it.
 *
 * Every vertex of a block is r * u with u a direction inside its cone, so its
 * triangles - and the solid they close - stay inside the cone too.
 * scripts/test-berg.mjs proves it on the built blocks: no two
 * neighbours overlap for 2,000 random sets of d, and every displacement over
 * a scripted hover and idle wave is parallel to dir with d in [0, dMax].
 *
 * The hover (BUILD_ICEBERG_FIX.md) is measured from the cursor's ray through
 * the whole berg, not from where it first meets the front, so it reaches the
 * blocks on the far side of the hollow too. That changes only how far each
 * block goes, never which way: the cones, and the proof, stay as they are.
 *
 * Plain JS, no three.js: the check runs it in Node, and the scene builds its
 * merged mesh from what this returns.
 */

import { simplex } from './terrain.js';

// ── The shape ──────────────────────────────────────────────────────────────

/** The berg's outline seen from the front, world units round C (the hollow's
    centre, on the waterline), traced from layout-sketch.png: a peaked tip
    ~12 wide and 10.5 tall, and a bigger underwater part that bulges out past
    the tip on the left, steps in on the right and hangs down to a point at
    the lower right. Every point is at a larger angle than the last, which is
    what makes the shape star-shaped from C. */
const OUTLINE = [
  [6.41, 0], [6.13, 1.31], [5.08, 3.2], [4.03, 3.93], [3.71, 5.54], [2.14, 7.43],
  [1.37, 8.9], [0.44, 10.51], [-0.52, 9.63], [-1.69, 8.16], [-2.86, 6.43],
  [-3.59, 4.81], [-4.23, 3.2], [-5.08, 1.61], [-5.72, 0], [-6.05, -1.03],
  [-6.25, -2.19], [-4.6, -3.07], [-4.15, -6.58], [-2.5, -7.16], [-2.14, -9.5],
  [-0.6, -12.2], [0.64, -13.58], [1.69, -12.7], [2.66, -11.24], [2.98, -9.5],
  [2.74, -6.58], [3.1, -4.96], [4.88, -4.23], [5.28, -2.19], [6.05, -1.03],
];
/** Widened 8 % from the sketch's 16:10 reading, so the tip is ~31 % of the
    width at 1440x900 and ~29 % at 1920x1080 (igloo's igloo: 31 %). */
const WIDEN = 1.08;
const PROFILE = OUTLINE.map(([x, y]) => [Math.atan2(y, x * WIDEN), Math.hypot(x * WIDEN, y)]).sort((a, b) => a[0] - b[0]);

/** Distance from C to the outline in the front view, at angle phi. */
export function silhouette(phi) {
  const P = PROFILE;
  const n = P.length;
  for (let i = 0; i < n; i++) {
    const a = P[i];
    const b = P[(i + 1) % n];
    const a0 = a[0];
    let a1 = b[0];
    if (i === n - 1) a1 += Math.PI * 2;
    let p = phi;
    if (i === n - 1 && p < a0) p += Math.PI * 2;
    if (p >= a0 && p <= a1) {
      const t = (p - a0) / (a1 - a0);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  // phi below the first angle: between the last point and the first
  const a = P[n - 1];
  const b = P[0];
  const t = (phi + Math.PI * 2 - a[0]) / (b[0] + Math.PI * 2 - a[0]);
  return a[1] + (b[1] - a[1]) * t;
}

/** Front-to-back depth (half), smoothly deeper under water. */
const DEPTH_UP = 3.7;
const DEPTH_DOWN = 5.6;
/** Radial thickness of the shell. */
export const THICK = 1.3;

/** Distance from C to the outer surface along the unit direction u. Each
    plane through the z axis cuts the berg in an ellipse: the silhouette's
    radius across, the depth front to back. One radius per direction, so the
    berg is star-shaped from C. A low noise keeps it from looking turned. */
export function outerR(ux, uy, uz) {
  const rho = Math.hypot(ux, uy);
  const S = silhouette(Math.atan2(uy, ux));
  const k = Math.min(1, Math.max(0, -uy / 0.4));
  const D = DEPTH_UP + (DEPTH_DOWN - DEPTH_UP) * k * k * (3 - 2 * k);
  const r = 1 / Math.sqrt((rho / S) ** 2 + (uz / D) ** 2);
  return r * (1 + 0.05 * simplex(ux * 2.3 + uz * 1.7, uy * 2.3 - uz * 0.9));
}

/** Distance from C to the inner surface (the hollow) along u. */
export function innerR(ux, uy, uz) {
  const r = outerR(ux, uy, uz);
  return Math.max(r * 0.5, r - THICK);
}

export const Y_TOP = 10.6;
export const Y_BOTTOM = -13.7;

// ── The blocks ─────────────────────────────────────────────────────────────

/** igloo's block on screen is ~150 x 85 px at 1920 (8 % of the width): at
    the berg's distance that is ~3.2 x 1.7 world units. */
export const BLOCK_W = 3.2;
const STRETCH = 1.85; // width / height
/** The seam: how far each block's edge is pulled in from its cone's wall. */
const GAP = 0.055;
/** How far a block may ever slide out: 1.35 blocks. igloo's numbers are a
    block's d as % of its dMax, and its blocks read 64-81 when they are out
    by 0.9-1.1 of a block (design-reference/iceberg/NOTES.md §3, measured
    again 6 Oct 2026), so its dMax is ~1.35-1.4 blocks. */
export const D_MAX = 1.35 * BLOCK_W;

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerpDir = (a, b, t) => norm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
const toT = (v) => norm([v[0], v[1] * STRETCH, v[2]]);
const fromT = (v) => norm([v[0], v[1] / STRETCH, v[2]]);
const surf = (u) => {
  const r = outerR(u[0], u[1], u[2]);
  return [u[0] * r, u[1] * r, u[2] * r];
};

function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Block sites: a Poisson-disc scatter over the outer surface in the
    stretched metric (so neighbours sit ~BLOCK_W apart across and
    ~BLOCK_W / 1.75 apart up and down), seeded so the berg is always the
    same. None right on the waterline: the plane cuts the cells there. */
function sites() {
  const rnd = rng(4242);
  const cand = [];
  for (let i = 0; i < 24000; i++) {
    const z = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - z * z);
    const u = [Math.cos(a) * s, z, Math.sin(a) * s];
    const p = surf(u);
    if (Math.abs(p[1]) < 0.45) continue;
    cand.push(p);
  }
  // Seed the extremities first, so the peak and the keel each get a block
  // of their own instead of a sliver of a neighbour's.
  cand.sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]));
  const head = cand.splice(0, 40);
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cand[i], cand[j]] = [cand[j], cand[i]];
  }
  const out = [];
  const min2 = (BLOCK_W * 0.86) ** 2;
  for (const p of [...head, ...cand]) {
    let ok = true;
    for (const q of out) {
      const dx = p[0] - q[0];
      const dy = (p[1] - q[1]) * STRETCH;
      const dz = p[2] - q[2];
      if (dx * dx + dy * dy + dz * dz < min2) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(p);
  }
  return out;
}

/** The convex cone of site i: the rays of its Voronoi cell on the sphere of
    (stretched) directions, clipped to its side of the waterline, in order
    round the site. Returned in real space. */
function cell(i, T, near) {
  const s = T[i];
  const up = s[1] >= 0 ? 1 : -1;
  const planes = near.map((j) => [s[0] - T[j][0], s[1] - T[j][1], s[2] - T[j][2]]);
  planes.push([0, up, 0]);
  const rays = [];
  for (let a = 0; a < planes.length; a++)
    for (let b = a + 1; b < planes.length; b++) {
      const c = cross(planes[a], planes[b]);
      const l = Math.hypot(c[0], c[1], c[2]);
      if (l < 1e-10) continue;
      for (const sg of [1, -1]) {
        const r = [(c[0] / l) * sg, (c[1] / l) * sg, (c[2] / l) * sg];
        if (dot(r, s) <= 0) continue;
        if (planes.every((p) => dot(p, r) >= -1e-9) && !rays.some((q) => dot(q, r) > 1 - 1e-9)) rays.push(r);
      }
    }
  // round the site
  const e1 = norm(cross(s, Math.abs(s[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const e2 = cross(s, e1);
  rays.sort((p, q) => Math.atan2(dot(p, e2), dot(p, e1)) - Math.atan2(dot(q, e2), dot(q, e1)));
  return rays;
}

/** Builds every block. Each: id, the cone's rays (`cone`, real space), its
    `dir`, `dMax`, the rest `anchor` on its outer face (where the hover
    measures from and the polygon overlay's vertex sits), `above` (above the
    waterline), its rest geometry (`pos` xyz, `u` 0 inside .. 1 outside,
    `index`) and `rest` (its centre). */
export function buildBlocks() {
  const P = sites();
  const T = P.map((p) => toT(norm(p)));
  const blocks = [];
  for (let i = 0; i < P.length; i++) {
    const s = T[i];
    const order = T.map((q, j) => [j, dot(q, s)]).filter(([j]) => j !== i).sort((a, b) => b[1] - a[1]);
    let rays = cell(i, T, order.slice(0, 26).map(([j]) => j));
    // Exact or nothing: every corner must be nearer this site than any
    // other, or the cone is too big - then take every site as a constraint.
    const exact = rays.every((r) => T.every((q, j) => j === i || dot(r, s) >= dot(r, q) - 1e-7));
    if (!exact) rays = cell(i, T, order.map(([j]) => j));
    if (rays.length < 3) continue;
    const cone = rays.map(fromT);
    const dir = fromT(s);
    blocks.push(makeBlock(blocks.length, cone, dir, s[1] >= 0));
  }
  return blocks;
}

function makeBlock(id, cone, dir, above) {
  const rnd = rng(1000 + id * 7919);
  // The seam: pull each corner in toward the axis by a fixed world width.
  const corners = cone.map((v) => {
    const ang = Math.acos(Math.min(1, dot(v, dir)));
    const g = Math.min(0.3, Math.max(0.01, GAP / (ang * outerR(...v))));
    return lerpDir(v, dir, g);
  });
  // The rim: corners plus points along each edge (so faces follow the
  // curve of the berg), all directions inside the cone.
  const rim = [];
  for (let k = 0; k < corners.length; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % corners.length];
    const len = Math.acos(Math.min(1, dot(a, b))) * outerR(...a);
    const n = Math.max(1, Math.ceil(len / 0.85));
    for (let j = 0; j < n; j++) rim.push(lerpDir(a, b, j / n));
  }
  const m = rim.length;
  const pos = [];
  const uu = [];
  const put = (u, r, w) => {
    pos.push(u[0] * r, u[1] * r, u[2] * r);
    uu.push(w);
  };
  // Outer face: a low point in the middle and a jittered ring round it, so
  // the face breaks into planes - the faceted ice of iceberg-style.png.
  const ro = (u) => outerR(u[0], u[1], u[2]);
  const ri = (u) => innerR(u[0], u[1], u[2]);
  put(dir, ro(dir) + 0.16 + 0.08 * rnd(), 1); // 0
  for (const w of rim) {
    const u = lerpDir(w, dir, 0.5);
    put(u, ro(u) + 0.08 + (rnd() - 0.5) * 0.16, 1); // O1
  }
  for (const w of rim) {
    const u = lerpDir(w, dir, 0.13);
    put(u, ro(u) + 0.02 + (rnd() - 0.5) * 0.05, 1); // O2
  }
  for (const w of rim) put(w, ro(w) - 0.24, 0.9); // R1: the bevelled lip
  for (const w of rim) put(w, ri(w) + 0.2, 0.1); // R2: the inner lip
  for (const w of rim) {
    const u = lerpDir(w, dir, 0.13);
    put(u, ri(u), 0); // I2
  }
  put(dir, ri(dir) - 0.05, 0); // inner centre
  const O1 = 1;
  const O2 = 1 + m;
  const R1 = 1 + 2 * m;
  const R2 = 1 + 3 * m;
  const I2 = 1 + 4 * m;
  const IC = 1 + 5 * m;
  const index = [];
  for (let k = 0; k < m; k++) {
    const k1 = (k + 1) % m;
    index.push(0, O1 + k, O1 + k1);
    for (const [A, B] of [[O1, O2], [O2, R1], [R1, R2], [R2, I2]]) index.push(A + k, B + k, B + k1, A + k, B + k1, A + k1);
    index.push(IC, I2 + k1, I2 + k);
  }
  // The overlay's vertex: on the outer face, a little above and to one side
  // of the middle (igloo's +s sit off centre on their blocks).
  const flat = Math.abs(dir[1]) > 0.97; // the very peak or keel
  const upT = flat ? [0, 0, 1] : norm([-dir[0] * dir[1], 1 - dir[1] * dir[1], -dir[2] * dir[1]]);
  const side = norm(cross(upT, dir));
  const sgn = rnd() < 0.5 ? -1 : 1;
  const a0 = surf(dir);
  const anchor = [0, 1, 2].map((k) => a0[k] + upT[k] * 0.32 + side[k] * 0.38 * sgn + dir[k] * 0.12);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const nv = pos.length / 3;
  for (let k = 0; k < nv; k++) {
    cx += pos[k * 3];
    cy += pos[k * 3 + 1];
    cz += pos[k * 3 + 2];
  }
  return {
    id,
    cone,
    dir,
    dMax: D_MAX,
    above,
    anchor,
    rest: [cx / nv, cy / nv, cz / nv],
    pos: new Float32Array(pos),
    u: new Float32Array(uu),
    index,
    seed: rnd(),
  };
}

// ── Motion ─────────────────────────────────────────────────────────────────

/** Hover, design-reference/iceberg/NOTES.md §3 (measured again 6 Oct 2026):
    a cursor held on the middle of igloo's igloo opens the whole dome - every
    block but the bottom course - with the front-middle blocks out by about a
    block. So a block's lift comes from its distance to the cursor's *ray*,
    the line through the berg from where it enters to where it leaves, not to
    the point where it enters: the blocks behind the front ones, on the far
    side of the hollow, push out too (away from the camera), and you see them
    shift through the opening.

    Within HOVER_FLAT of the ray a block goes out the full HOVER_LIFT (0.8 of
    dMax, so the polygon's numbers read ~80, as igloo-hover-light.png's do);
    from there it eases off to nothing at HOVER_R (2.6 blocks: igloo's dome
    is ~2 blocks in radius and its bottom course, ~1.3 blocks below the
    cursor, still lifts a little). The front reads strongest: the far side
    gets BACK of the lift (~half a block), so it visibly shifts and still
    stays a wall - igloo's inside reads as a lit wall of blocks, not a hole
    to the sky.

    The spring opens in ~1.3 s (igloo: half open 0.42 s, full ~1.3 s) and
    closes on a softer, critically damped one: half shut 0.7 s, 90 % by 1.6 s
    (igloo: half 1.0 s, shut ~1.7 s, after a slow start). */
export const HOVER_R = 2.6 * BLOCK_W;
export const HOVER_FLAT = 0.5 * HOVER_R;
export const HOVER_LIFT = 0.8 * D_MAX;
export const BACK = 0.45;
export const SPRING = 15;
export const DAMP = 6.6;
export const SPRING_CLOSE = 5.76;
export const DAMP_CLOSE = 4.8;

/** The idle pulse, NOTES.md §2: every 6.25 s a wave runs from the peak down
    through the blocks (each out along its own line and back), then
    everything is still until the next. A block's own pulse rises in 0.5 s,
    holds 0.8 s, falls in 1.5 s; the wave front travels 16 units a second
    (~5 blocks), so the keel moves 1.5 s after the peak and the berg is
    completely still for the last ~2 s of each period. */
export const IDLE = { period: 6.25, rise: 0.5, hold: 0.8, fall: 1.5, speed: 16 };
/** How long the cursor has to be still before the idle takes over again. */
export const IDLE_DELAY = 2.0;

const sstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function idleEnvelope(s) {
  const { rise, hold, fall } = IDLE;
  if (s <= 0) return 0;
  if (s < rise) return sstep(s / rise);
  if (s < rise + hold) return 1;
  return 1 - sstep((s - rise - hold) / fall);
}

/** One number per block, d. Nothing else about a block ever changes: the
    scene draws it at rest + dir * d. */
export class BergMotion {
  constructor(blocks) {
    this.blocks = blocks;
    const n = blocks.length;
    this.d = new Float32Array(n);
    this.s = new Float32Array(n); // the hover spring's position
    this.v = new Float32Array(n); // and its velocity
    this.target = new Float32Array(n);
    this.hoverT = new Float32Array(n);
    this.idleD = new Float32Array(n);
    // Idle: how far each block goes (6 % of a block on the body, up to 45 %
    // at the extremities - igloo's crown and tunnel end) and when.
    this.amp = new Float32Array(n);
    this.delay = new Float32Array(n);
    blocks.forEach((b, i) => {
      const y = b.anchor[1];
      const ext = y >= 0 ? sstep((y / Y_TOP - 0.42) / 0.45) : sstep((y / Y_BOTTOM - 0.55) / 0.4);
      this.amp[i] = Math.min(b.dMax, BLOCK_W * (0.06 + 0.39 * ext));
      this.delay[i] = (Y_TOP - y) / IDLE.speed;
    });
  }

  /** @param ray   the cursor's ray through the berg (rayThrough), or null
      @param hoverOn 0..1, the start screen's hover gate
      @param idle  0..1, how much of the idle pulse runs

      The hover drives a spring; the idle pulse is its own smooth curve and
      needs none. A block's d is the larger of the two, so the hover takes
      over from a pulse without a jump, and when a pulse ends its blocks are
      exactly at 0 - still, not settling. */
  step(dt, time, { ray = null, hoverOn = 1, idle = 1 } = {}) {
    const B = this.blocks;
    const phase = ((time % IDLE.period) + IDLE.period) % IDLE.period;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))); // keeps the spring stable
    const h = dt / steps;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      const max = b.dMax;
      const t = ray ? hoverLift(b, ray) * hoverOn : 0;
      const w = idle > 0 ? Math.min(max, this.amp[i] * idleEnvelope(phase - this.delay[i]) * idle) : 0;
      let d = this.s[i];
      let v = this.v[i];
      if (t !== 0 || d !== 0 || v !== 0) {
        // Out on the quick spring, back on the soft one (igloo closes slower
        // than it opens).
        const [K, C] = t >= d ? [SPRING, DAMP] : [SPRING_CLOSE, DAMP_CLOSE];
        for (let k = 0; k < steps; k++) {
          v += ((t - d) * K - v * C) * h;
          d += v * h;
          if (d <= 0) {
            d = 0;
            v = Math.max(0, v);
          } else if (d >= max) {
            d = max;
            v = Math.min(0, v);
          }
        }
        // Settled: exactly shut.
        if (t === 0 && d < 1e-3 && Math.abs(v) < 1e-2) {
          d = 0;
          v = 0;
        }
        this.s[i] = d;
        this.v[i] = v;
      }
      this.hoverT[i] = t;
      this.idleD[i] = w;
      this.target[i] = Math.max(t, w);
      this.d[i] = Math.max(d, w);
    }
  }
}

/** Where a block is: rest + dir * d. The only placement there is. */
export function offset(b, d, out = [0, 0, 0]) {
  out[0] = b.dir[0] * d;
  out[1] = b.dir[1] * d;
  out[2] = b.dir[2] * d;
  return out;
}

/** The hover's target for block b: by the distance from its anchor to the
    cursor's ray - full lift on a plateau round the ray, easing to nothing at
    HOVER_R - and less toward where the ray leaves the berg. */
export function hoverLift(b, ray) {
  const { o, v, tIn, tOut } = ray;
  const a = b.anchor;
  const px = a[0] - o[0];
  const py = a[1] - o[1];
  const pz = a[2] - o[2];
  const s = px * v[0] + py * v[1] + pz * v[2]; // along the ray
  const q = px * px + py * py + pz * pz - s * s; // squared distance from it
  if (q >= HOVER_R * HOVER_R) return 0;
  const r = Math.sqrt(Math.max(0, q));
  const fall = 1 - sstep((r - HOVER_FLAT) / (HOVER_R - HOVER_FLAT));
  const through = Math.min(1, Math.max(0, (s - tIn) / (tOut - tIn || 1)));
  return Math.min(b.dMax, HOVER_LIFT * fall * (1 - (1 - BACK) * sstep(through)));
}

// ── The hover ray ──────────────────────────────────────────────────────────

/** Inside the berg's rest surface: < 0. */
const inside = (o, v, t) => {
  const p = [o[0] + v[0] * t, o[1] + v[1] * t, o[2] + v[2] * t];
  const l = Math.hypot(p[0], p[1], p[2]) || 1e-6;
  return l - outerR(p[0] / l, p[1] / l, p[2] / l);
};

/** Marches t from a toward b (either way) to the first point inside the
    surface, then bisects onto it; null if there is none. */
function march(o, v, a, b) {
  const step = 0.18 * Math.sign(b - a);
  let prev = a;
  for (let t = a; step > 0 ? t < b : t > b; t += step) {
    if (inside(o, v, t) < 0) {
      let p = prev;
      let z = t;
      for (let k = 0; k < 14; k++) {
        const mid = (p + z) / 2;
        if (inside(o, v, mid) < 0) z = mid;
        else p = mid;
      }
      return z;
    }
    prev = t;
  }
  return null;
}

/** The cursor's ray (origin o, unit direction v) through the berg's rest
    surface: where it enters (tIn, and that point as `hit`) and where it
    leaves (tOut), or null if it misses. Only the berg answers: the water,
    the glacier and the ranges never react to the cursor. */
export function rayThrough(o, v) {
  // Within the berg's bounding sphere.
  const R = 15;
  const b = dot(o, v);
  const c = dot(o, o) - R * R;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t0 = Math.max(0, -b - Math.sqrt(disc));
  const t1 = -b + Math.sqrt(disc);
  const tIn = march(o, v, t0, t1);
  if (tIn === null) return null;
  const tOut = march(o, v, t1, tIn);
  return { o, v, tIn, tOut: tOut ?? tIn, hit: [o[0] + v[0] * tIn, o[1] + v[1] * tIn, o[2] + v[2] * tIn] };
}

/** Where a ray first meets the berg's rest surface, or null. */
export function rayHit(o, v) {
  return rayThrough(o, v)?.hit ?? null;
}
