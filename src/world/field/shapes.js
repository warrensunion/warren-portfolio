/**
 * The ice shapes, ported from the BTTRshop hub (BTTRURSLF-v2 src/screens/shop/hub/shapes.js, Warren's own
 * code; its notched Hygiene shard is left out, since it was traced from its own art). Six hull recipes,
 * grown with a seed per project, so eleven blocks get eleven different crystals.
 *
 * The hub's notes, kept: the ice shapes, grown procedurally from art-src/shop/gen/ice-<area>.png.
 *
 * igloo's blocks are Houdini crystals shipped as Draco meshes; we have
 * pictures, not meshes, so each shape is a point cloud on an envelope that
 * reproduces the picture's silhouette (tall rectangle, squat tilted chunk,
 * leaning shard...), cut by planes (points beyond a plane are projected onto
 * it, which leaves the flat cleaved facet a chip leaves), wrapped in a
 * convex hull and then roughened inward by a position hash so the faces are
 * not mathematically flat. A second pass of many shallow cuts breaks the
 * long straight outline edges into small facets. Hygiene is the exception:
 * its saw of steps are notches, which no convex hull has, so it is an
 * extruded outline with chamfered faces. Seeded: the same block every visit.
 *
 * Each returns { geometry (flat-shaded, box-projected UVs), objectBox [w,h]
 * (the most room the hero object may take, before objectRoll lays it along
 * the shape), frostLow (how thick the frost
 * crust is at the bottom), planes + margin (the main hull, so block.js can
 * fit the object and its wire-mesh inside), cracks (crack planes to draw
 * inside, e.g. Physique's fracture) }. Heights are fitted to H.
 */

import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { rng } from './noise.js';

export const H = 4.3; // block height at the centre: ~68 % of the view (igloo ~70 %)

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** n points on a box's surface, pushed inward by up to `j` of its size. */
function boxPoints(r, w, h, d, n, j = 0.06) {
  const pts = [];
  // Corners pulled in by different amounts, so no edge of the hull is a
  // straight box edge (igloo's outlines are ragged all round).
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push(V((sx * w) / 2, (sy * h) / 2, (sz * d) / 2).multiplyScalar(0.72 + r() * 0.22));
  for (let i = 0; i < n; i++) {
    const p = V((r() - 0.5) * w, (r() - 0.5) * h, (r() - 0.5) * d);
    const ax = Math.floor(r() * 3);
    const s = r() < 0.5 ? -1 : 1;
    if (ax === 0) p.x = (s * w) / 2;
    if (ax === 1) p.y = (s * h) / 2;
    if (ax === 2) p.z = (s * d) / 2;
    p.x += (r() - 0.5) * w * j;
    p.y += (r() - 0.5) * h * j * 0.6;
    p.multiplyScalar(1 - r() * j * 1.5);
    pts.push(p);
  }
  return pts;
}

/** A prism with `sides` around y, radius rx/rz, height h, vertices jittered. */
function prismPoints(r, sides, rx, rz, h, rot = 0, j = 0.05) {
  const pts = [];
  for (let k = 0; k < sides; k++) {
    const a = rot + (k / sides) * Math.PI * 2;
    for (const y of [-h / 2, -h / 4, 0, h / 4, h / 2]) {
      const m = 1 - r() * j;
      pts.push(V(Math.cos(a) * rx * m, y + (r() - 0.5) * h * 0.03, Math.sin(a) * rz * m));
    }
  }
  return pts;
}

/** Points on an ellipsoid, slightly lumpy. */
function blobPoints(r, rx, ry, rz, n, j = 0.1) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1;
    const a = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const m = 1 - r() * j;
    pts.push(V(Math.cos(a) * s * rx * m, u * ry * m, Math.sin(a) * s * rz * m));
  }
  return pts;
}

/** Project everything beyond the plane (unit normal n, offset d) onto it. */
function cut(pts, n, d) {
  const nn = n.clone().normalize();
  for (const p of pts) {
    const k = p.dot(nn) - d;
    if (k > 0) p.addScaledVector(nn, -k);
  }
}

/** A few random corner chips: planes near the surface, aimed at corners. */
function chips(r, pts, count, depth = 0.12) {
  let far = 0;
  for (const p of pts) far = Math.max(far, p.length());
  // igloo's crystals are far more broken than a few cuts: half again as many.
  count = Math.round(count * 1.6);
  for (let i = 0; i < count; i++) {
    const n = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
    let m = -Infinity;
    for (const p of pts) m = Math.max(m, p.dot(n));
    cut(pts, n, m - far * depth * (0.4 + r() * 0.6));
  }
}

/** Many small, shallow cuts, mostly sideways: small facets along the
    outline where the chips leave long straight edges. */
function facets(r, pts, count = 22, depth = 0.035) {
  let far = 0;
  for (const p of pts) far = Math.max(far, p.length());
  for (let i = 0; i < count; i++) {
    const n = V(r() * 2 - 1, (r() * 2 - 1) * 1.2, (r() * 2 - 1) * 0.6).normalize();
    let m = -Infinity;
    for (const p of pts) m = Math.max(m, p.dot(n));
    cut(pts, n, m - far * depth * (0.3 + r() * 0.7));
  }
}

/** Points along a closed 2D outline at z = +-hz (and a bevel ring inset at
    z = +-(hz + bz)), jittered - a slab hull with chamfered faces. */
function slabPoints(r, outline, hz, bz, inset, perEdge = 8, j = 0.04) {
  const pts = [];
  const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
  const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    for (let k = 0; k < perEdge; k++) {
      const t = k / perEdge;
      const x = x0 + (x1 - x0) * t + (r() - 0.5) * j;
      const y = y0 + (y1 - y0) * t + (r() - 0.5) * j;
      for (const z of [-hz, hz]) pts.push(V(x, y, z + (r() - 0.5) * j));
      const ix = cx + (x - cx) * inset;
      const iy = cy + (y - cy) * inset;
      for (const z of [-(hz + bz), hz + bz]) pts.push(V(ix, iy, z));
    }
  }
  return pts;
}

const SHAPES = {
  // Tall rough rectangle, a little wider at the top.
  face(r) {
    const pts = boxPoints(r, 2.75, 4.0, 1.7, 160, 0.08);
    for (const p of pts) p.x *= 1 + (p.y / 4) * 0.12;
    chips(r, pts, 9, 0.1);
    facets(r, pts, 26);
    return { pts, objectBox: [2.1, 2.9], frostLow: 0.75, tilt: 0.05 };
  },
  // Squat block tilted ~17 deg, flat top, a clean diagonal break through it:
  // the break is a bright crack plane drawn inside (a split into two hulls
  // read as a separate pane of glass), plus a cleaved corner where it exits.
  physique(r) {
    const pts = boxPoints(r, 3.6, 2.6, 2.1, 120, 0.04);
    cut(pts, V(0.62, -0.78, 0.1), 1.55);
    chips(r, pts, 3, 0.07);
    facets(r, pts, 10, 0.025);
    return { pts, objectBox: [2.9, 2.1], frostLow: 0.65, tilt: 0.3, fit: 1.12, crackGain: 2.6, cracks: [[V(0.62, -0.78, 0.1), 0.15]] };
  },
  // Chunky boulder, chipped corners, a flat cleaved front.
  hair(r) {
    const pts = blobPoints(r, 1.75, 1.95, 1.45, 170, 0.08);
    cut(pts, V(0, 0, 1), 0.95); // cleaved front
    cut(pts, V(0, -1, 0.1), 1.6);
    chips(r, pts, 10, 0.12);
    facets(r, pts, 24);
    return { pts, objectBox: [2.6, 2.6], frostLow: 0.8, tilt: 0.06 };
  },
  // Thin rhombus slab standing on its bottom corner, its long axis running
  // top-left to bottom-right, the top-right corner broken off, a crack across.
  fashion(r) {
    const outline = [[-0.8, 2.15], [1.5, 0.45], [0.8, -2.15], [-1.5, -0.45]];
    const pts = slabPoints(r, outline, 0.26, 0.12, 0.92, 9, 0.05);
    cut(pts, V(0.78, 0.62, 0.05), 1.42); // the missing corner
    chips(r, pts, 3, 0.05);
    facets(r, pts, 14, 0.025);
    return { pts, objectBox: [2.4, 2.8], objectTurn: 0, objectRoll: -0.25, margin: 0.03, frostLow: 0.7, tilt: 0, crackGain: 1.6, cracks: [[V(0.5, 0.86, 0), -0.25]] };
  },
  // Long diamond (bipyramid) lying diagonally, top-left to bottom-right
  // (ice-sociability.png).
  sociability(r) {
    const pts = [];
    const ring = 6;
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2 + 0.2;
      for (const y of [-0.45, 0.45]) pts.push(V(Math.cos(a) * 1.3 * (0.9 + r() * 0.1), y, Math.sin(a) * 0.9));
    }
    pts.push(V(0, 3.0, 0.05), V(0.05, -2.9, -0.05), V(0.2, 2.2, 0.3), V(-0.2, -2.1, 0.2));
    for (let i = 0; i < 50; i++) {
      const t = r() * 2 - 1;
      const w = (1 - Math.abs(t)) * 1.25;
      const a = r() * Math.PI * 2;
      pts.push(V(Math.cos(a) * w, t * 2.9, Math.sin(a) * w * 0.75));
    }
    chips(r, pts, 4, 0.06);
    facets(r, pts, 18, 0.03);
    return { pts, objectBox: [2.4, 2.0], objectRoll: 0.15, frostLow: 0.5, tilt: 0.72, fit: 1.3 };
  },
  // Hexagonal column with a face to the camera (three faces show), a steep
  // broken top, frost crust low.
  knowledge(r) {
    const pts = prismPoints(r, 6, 1.4, 1.25, 4.1, 0, 0.04);
    cut(pts, V(-0.75, 1, 0.25), 1.35); // steep slanted top
    cut(pts, V(0.35, 1, -0.5), 1.8); // and broken again behind
    chips(r, pts, 5, 0.07);
    facets(r, pts, 16, 0.025);
    return { pts, objectBox: [2.3, 2.3], frostLow: 1.0, tilt: 0.04 };
  },
};

/** A hash of a position, so shared corners of separate triangles move together. */
const keyOf = (x, y, z) => `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`;

/** Box-projected UVs per triangle (flat shading: each triangle owns its 3). */
function boxUVs(geo, scale = 0.7) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const p = [a, b, c][k];
      let u;
      let v;
      if (ax >= ay && ax >= az) [u, v] = [p.z, p.y];
      else if (ay >= az) [u, v] = [p.x, p.z];
      else [u, v] = [p.x, p.y];
      uv[(i + k) * 2] = u * scale;
      uv[(i + k) * 2 + 1] = v * scale;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Pull each distinct vertex inward by a hashed amount (up to `amt`). */
function roughen(geo, r, amt) {
  const pos = geo.attributes.position;
  const moved = new Map();
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const k = keyOf(p.x, p.y, p.z);
    if (!moved.has(k)) moved.set(k, p.clone().multiplyScalar(1 - r() * amt));
    const q = moved.get(k);
    pos.setXYZ(i, q.x, q.y, q.z);
  }
  pos.needsUpdate = true;
}

/** Concatenate non-indexed geometries (position only). */
function concat(geos) {
  const total = geos.reduce((n, g) => n + g.attributes.position.array.length, 0);
  const pos = new Float32Array(total);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o);
    o += g.attributes.position.array.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return out;
}

/** A hull's face planes [{ n, d }] (n.p <= d inside), deduplicated. */
function planesOf(geo) {
  const pos = geo.attributes.position;
  // Orient by the centroid (inside a convex hull), not by triangle winding.
  const mid = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) mid.add(new THREE.Vector3().fromBufferAttribute(pos, i));
  mid.divideScalar(pos.count);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const out = [];
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.lengthSq() < 1e-10) continue;
    n.normalize();
    let d = n.dot(a);
    if (n.dot(mid) > d) {
      n.negate();
      d = -d;
    }
    if (!out.some((p) => p.n.dot(n) > 0.9995 && Math.abs(p.d - d) < 1e-3)) out.push({ n, d });
  }
  return out;
}

export function buildShape(area, seed) {
  const r = rng(seed);
  const spec = SHAPES[area](r);
  // Tilt in the picture plane (Physique's ~15 deg, Sociability's diagonal).
  const rot = new THREE.Matrix4().makeRotationZ(spec.tilt || 0);
  const hullPts = spec.hullPts || spec.pts;
  for (const set of new Set([spec.pts, hullPts, ...(spec.parts || [])])) for (const p of set) p.applyMatrix4(rot);
  // A shape is hull points (+ extra hulls), or its own mesh (Hygiene's notches).
  const main = spec.geometry ? (spec.geometry.applyMatrix4(rot), spec.geometry.index ? spec.geometry.toNonIndexed() : spec.geometry) : new ConvexGeometry(spec.pts);
  const geo = concat([main, ...(spec.parts || []).map((q) => new ConvexGeometry(q))]);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const size = bb.getSize(new THREE.Vector3());
  const centre = bb.getCenter(new THREE.Vector3());
  // Squat and diagonal shapes are scaled up past H: they cover less of the
  // view for the same height (ice-physique / ice-sociability fill the frame).
  const k = Math.min((H * (spec.fit || 1)) / size.y, 4.2 / size.x);
  geo.translate(-centre.x, -centre.y, -centre.z);
  geo.scale(k, k, k);
  // The main hull's planes (before roughening), to fit what goes inside.
  const hull = new ConvexGeometry(hullPts.map((p) => p.clone().sub(centre).multiplyScalar(k)));
  const planes = planesOf(hull);
  hull.dispose();
  const radius = Math.max(size.x, size.y, size.z) * k * 0.5;
  roughen(geo, r, 0.06);
  geo.computeVertexNormals(); // non-indexed: flat normals per facet
  boxUVs(geo);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const cracks = (spec.cracks || []).map(([n, d]) => {
    const nn = n.clone().normalize().applyMatrix4(rot);
    return new THREE.Vector4(nn.x, nn.y, nn.z, k * (d - nn.dot(centre)));
  });
  return {
    geometry: geo,
    objectBox: spec.objectBox.map((v) => v * k),
    frostLow: spec.frostLow,
    objectRoll: spec.objectRoll || 0, // a small tilt of the art at most (it stays upright, as in its ice-<area>.png)
    objectY: (spec.objectY ?? -0.02) * H,
    crackGain: spec.crackGain || 1, // how strongly the shape's own first crack shows
    objectX: (spec.objectX || 0) * k,
    objectTurn: spec.objectTurn ?? 0.7, // share of the ice's yaw the object counter-turns
    fitSilhouette: !!spec.fitSilhouette, // fit the art's outline, not its picture's corners (block.js)
    scale: k,
    planes,
    // Roughening pulls corners in by up to 6 % of the radius, faces less.
    margin: radius * (spec.margin ?? 0.045),
    cracks,
  };
}

/** True when every point is inside the main hull by at least its margin. */
export function inside(shape, points) {
  for (const p of points) for (const pl of shape.planes) if (pl.n.dot(p) > pl.d - shape.margin) return false;
  return true;
}

/** A small loose shard: a hull of a handful of points. */
export function shardGeometry(r, size) {
  const pts = [];
  const n = 7 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) pts.push(V((r() - 0.5) * size, (r() - 0.5) * size * 1.6, (r() - 0.5) * size * 0.8));
  const g = new ConvexGeometry(pts);
  g.computeVertexNormals();
  boxUVs(g);
  return g;
}
