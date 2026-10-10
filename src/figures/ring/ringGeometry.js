// Ported from BTTRURSLF-v2 src/screens/shop/hub/ringGeometry.js: the shattered ring's pieces, swept in
// code (igloo loads a modelled mesh; there is no modelling tool in this build either). Each segment is a
// rounded superellipse section swept along an arc with domed ends, dented with noise and chipped near
// its broken ends; AO is baked into vertex colour and `aRim` marks the inner wall that lights up.
// Changed: the BTTRshop "B" logo pieces (logoPieces, B_PARTS) are gone, because the B is that shop's
// brand and the portfolio's ring has particles in its middle instead; rng comes from noise.js here.
//
// Every piece is centred on its own pivot and reports `{ geometry, home, ends }`. The ring is built in
// the XY plane, facing +Z, which is how the figure shows it (the hub laid it flat; this one faces you).

import * as THREE from 'three';
import { rng } from './noise.js';

/* ---- noise ------------------------------------------------------------------- */

function hash3(x, y, z, s) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, z, s) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k, s);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
export function fbm(x, y, z, s = 0, oct = 3) {
  let a = 0.5;
  let f = 1;
  let sum = 0;
  for (let o = 0; o < oct; o++) {
    sum += a * vnoise(x * f, y * f, z * f, s + o * 17);
    f *= 2.03;
    a *= 0.5;
  }
  return sum / (1 - Math.pow(0.5, oct)); // ~0..1
}

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/* ---- one ring segment ----------------------------------------------------------- */

/**
 * @param {object} o
 *   r0, r1   inner / outer radius;  depth  thickness along the axis
 *   a0, a1   start / end angle (rad)
 *   seed     noise seed;  chip  how deep the broken ends are bitten
 *   ringR0   the ring's inner radius (aRim is 1 on that wall)
 *   glow     false: aRim stays 0 (the inner ring never lights)
 */
export function segmentPiece({ r0, r1, depth, a0, a1, seed = 1, chip = 0.05, dent = 0.016, ringR0 = r0, glow = true }) {
  const M = 44; // around the cross-section (enough to hold the tight corners)
  const K = 6; // rings in each domed end
  const rc = (r0 + r1) / 2;
  const wr = (r1 - r0) / 2;
  const hh = depth / 2;
  const n = 10; // superellipse exponent: flat faces, tight corners (igloo's stone is boxy)
  const span = a1 - a0;
  const N = Math.max(8, Math.round((span * rc) / 0.07));
  const capA = (Math.min(wr, hh) * 0.95) / rc; // how far the dome reaches, as an angle

  // Cross-section unit offsets (radial, axial).
  const cs = [];
  for (let j = 0; j < M; j++) {
    const t = (j / M) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    cs.push([Math.sign(c) * Math.pow(Math.abs(c), 2 / n), Math.sign(s) * Math.pow(Math.abs(s), 2 / n)]);
  }
  // Rings along the arc: [angle, scale] - start dome, body, end dome.
  const rings = [];
  for (let k = K; k >= 1; k--) {
    const f = k / K;
    rings.push([a0 - capA * Math.sin((f * Math.PI) / 2), Math.cos((f * Math.PI) / 2)]);
  }
  for (let i = 0; i <= N; i++) rings.push([a0 + (span * i) / N, 1]);
  for (let k = 1; k <= K; k++) {
    const f = k / K;
    rings.push([a1 + capA * Math.sin((f * Math.PI) / 2), Math.cos((f * Math.PI) / 2)]);
  }

  const R = rings.length;
  const pos = new Float32Array(R * M * 3);
  const endD = new Float32Array(R * M); // arc distance to the nearer end
  let p = 0;
  for (let i = 0; i < R; i++) {
    const [a, sc] = rings[i];
    // Pillow ends also swell a little less than the body.
    for (let j = 0; j < M; j++) {
      const rr = rc + wr * cs[j][0] * sc;
      const z = hh * cs[j][1] * Math.pow(sc, 0.6);
      pos[p * 3] = rr * Math.cos(a);
      pos[p * 3 + 1] = rr * Math.sin(a);
      pos[p * 3 + 2] = z;
      endD[p] = Math.max(0, Math.min(a - a0, a1 - a)) * rc;
      p++;
    }
  }
  const idx = [];
  for (let i = 0; i < R - 1; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * M + j;
      const b = (i + 1) * M + j;
      const c = (i + 1) * M + ((j + 1) % M);
      const d = i * M + ((j + 1) % M);
      idx.push(a, b, c, a, c, d);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();

  // Dents everywhere, bites near the broken ends (always inward).
  const nrm = g.attributes.normal.array;
  for (let v = 0; v < R * M; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    const e = smooth(0.2, 0.0, endD[v]);
    let d = fbm(x * 3.1, y * 3.1, z * 3.1, seed) * dent;
    d += e * Math.pow(fbm(x * 6.5, y * 6.5, z * 6.5, seed + 5), 1.6) * chip * 2.2;
    pos[v * 3] -= nrm[v * 3] * d;
    pos[v * 3 + 1] -= nrm[v * 3 + 1] * d;
    pos[v * 3 + 2] -= nrm[v * 3 + 2] * d;
  }
  g.computeVertexNormals();

  // Baked AO (vertex colour) + rim weight + uv for the frost normal map.
  const col = new Float32Array(R * M * 3);
  const rim = new Float32Array(R * M);
  const uv = new Float32Array(R * M * 2);
  for (let v = 0; v < R * M; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    const rr = Math.hypot(x, y);
    let ao = 1 - 0.62 * smooth(0.24, 0.0, endD[v]); // where neighbours meet
    ao *= 0.6 + 0.4 * smooth(-hh, hh * 0.6, z); // underneath
    // A chamfer along each long edge that catches the light (igloo's lit
    // edge line): the superellipse's corners, brightened (colour > 1).
    const [cx, cz] = cs[v % M];
    ao *= 1 + 0.38 * smooth(0.8, 0.95, Math.min(Math.abs(cx), Math.abs(cz)));
    ao *= 0.9 + 0.1 * fbm(x * 2, y * 2, z * 2, seed + 9);
    col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = ao;
    rim[v] = !glow ? 0 : smooth(r0 + wr * 0.6, ringR0 - 0.02, rr) * (0.6 + 0.4 * smooth(-hh, hh * 0.3, z));
    const ang = Math.atan2(y, x);
    uv[v * 2] = ang * rc * 1.3;
    uv[v * 2 + 1] = (rr - rc) * 1.3 + z * 1.3;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aRim', new THREE.BufferAttribute(rim, 1));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  // Pivot on the middle of the arc.
  const mid = (a0 + a1) / 2;
  const home = new THREE.Vector3(rc * Math.cos(mid), rc * Math.sin(mid), 0);
  g.translate(-home.x, -home.y, 0);
  g.computeBoundingSphere();
  const ends = [a0, a1].map((a) => new THREE.Vector3(rc * Math.cos(a), rc * Math.sin(a), 0));
  return { geometry: g, home, ends, radius: rc };
}

/** A ring of `count` segments with seeded lengths; returns pieces. */
export function ringPieces(opts) {
  return [...ringPiecesIter(opts)];
}

/** The same, one piece at a time (the hub built them in idle slices; ring.js here builds them once per session). */
export function* ringPiecesIter({ count, r0, r1, depth, gap, seed, chip, phase = 0, glow = true }) {
  const rand = rng(seed);
  const w = Array.from({ length: count }, () => 0.8 + rand() * 0.4);
  const sum = w.reduce((a, b) => a + b, 0);
  let a = phase;
  for (let i = 0; i < count; i++) {
    const span = (w[i] / sum) * Math.PI * 2;
    yield segmentPiece({ r0, r1, depth, a0: a + gap / 2, a1: a + span - gap / 2, seed: seed * 31 + i, chip, ringR0: r0, glow });
    a += span;
  }
}

/** Points of an icosphere's edges (the misty sphere's geodesic lines). */
export function geodesicLines(radius, detail = 3) {
  const ico = new THREE.IcosahedronGeometry(radius, detail);
  const wire = new THREE.WireframeGeometry(ico);
  ico.dispose();
  // igloo's web is scraggly, not a lattice: every vertex is nudged by a hash
  // of where it is (shared vertices move together, so lines stay joined).
  const P = wire.attributes.position.array;
  const v = new THREE.Vector3();
  const j = (radius * 0.05) / Math.max(1, detail / 8);
  for (let i = 0; i < P.length; i += 3) {
    v.set(P[i], P[i + 1], P[i + 2]);
    const qx = Math.round(v.x * 1000);
    const qy = Math.round(v.y * 1000);
    const qz = Math.round(v.z * 1000);
    v.x += (hash3(qx, qy, qz, 41) - 0.5) * 2 * j;
    v.y += (hash3(qx, qy, qz, 53) - 0.5) * 2 * j;
    v.z += (hash3(qx, qy, qz, 67) - 0.5) * 2 * j;
    v.setLength(radius);
    P[i] = v.x;
    P[i + 1] = v.y;
    P[i + 2] = v.z;
  }
  return wire;
}
