// The valley the stage is played in, built procedurally from flat-shaded low-poly primitives with an
// original palette (after design/reference/archer/archer-gameplay-1.png, no assets): a pale dirt path
// down the middle (+z), bright grass, teal blocky cliffs on both sides, broadleaf trees and pines, broken
// post-and-rail fences, red-capped mushrooms, pale rocks, grass tufts, a sky dome and a few clouds.
//
// Draw calls stay few: everything that never moves is merged into one mesh per material, and every
// repeated prop (trees, tufts, tree shadows) is an InstancedMesh, so the whole valley is about a dozen
// draws. The low tier halves the instance counts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from './rng.js';

export const PALETTE = {
  skyTop: '#2b7de0',
  skyMid: '#62aef2',
  horizon: '#cfe9fb',
  grass: '#7fd35c',
  grassLight: '#95e06b',
  grassDark: '#5cb54b',
  path: '#e4d7b5',
  pathDark: '#cdbf9b',
  cliff: ['#4fa58c', '#5bb096', '#44937d', '#3c8a74'],
  cliffTop: ['#6fc46a', '#62b863'],
  leaf: ['#3f9e48', '#4fb052', '#5cbc57', '#378f43'],
  pine: ['#2f7d4c', '#3a8f55'],
  trunk: '#6e4a31',
  fencePost: '#6a4429',
  fenceRail: '#80553a',
  capRed: '#e0412f',
  capDot: '#fff4e6',
  stem: '#f2e6cf',
  rock: ['#bccadb', '#cbd7e4', '#a7b8cc'],
  tuft: '#8fe070',
  cloud: '#ffffff',
};

const PATH_W = 9;
const Z0 = -40; // the valley runs from behind the start...
const Z1 = 280; // ...well past the stage's end, into the fog

/* Geometry helpers: every piece is non-indexed with position, normal and color only, so they merge. */

const tmpColor = new THREE.Color();
function prep(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  return g;
}
// Colours each triangle by its face normal: (n) => colour. Top faces lighter is the house look.
function paint(geo, pick) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    c.sub(a);
    n.subVectors(b, a).cross(c).normalize();
    tmpColor.set(pick(n, a));
    for (let k = 0; k < 3; k++) col.set([tmpColor.r, tmpColor.g, tmpColor.b], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const solid = (color) => () => color;
const topLit = (side, top, k = 0.5) => (n) => (n.y > k ? top : side);
const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const S = new THREE.Vector3();
const P = new THREE.Vector3();
function place(geo, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  E.set(rx, ry, rz);
  Q.setFromEuler(E);
  M.compose(P.set(x, y, z), Q, S.set(sx, sy, sz));
  geo.applyMatrix4(M);
  return geo;
}
const box = (w, h, d) => prep(new THREE.BoxGeometry(w, h, d));

// Ground height: flat across the play strip, rising gently toward the cliffs.
export function groundY(x, z) {
  const ax = Math.abs(x);
  const t = Math.min(1, Math.max(0, (ax - 11) / 14));
  return t * t * (3 - 2 * t) * 2.2 + (ax > 11 ? Math.sin(z * 0.11 + x * 0.3) * 0.25 * t : 0);
}

export function buildWorld(scene, { tier = 'high', seed = 7 } = {}) {
  const rand = mulberry32(seed);
  const r = (lo, hi) => lo + (hi - lo) * rand();
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const low = tier === 'low';
  const half = (n) => (low ? Math.round(n / 2) : n);
  const owned = []; // geometries and materials to dispose
  const group = new THREE.Group();
  group.name = 'world';
  scene.add(group);

  const lambert = (opts = {}) => {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts });
    owned.push(m);
    return m;
  };
  const add = (geo, mat, name) => {
    owned.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    return mesh;
  };
  const solidMat = lambert();

  /* Sky and fog */
  const horizon = new THREE.Color(PALETTE.horizon);
  scene.background = horizon.clone();
  scene.fog = new THREE.Fog(horizon.clone(), 70, 250);
  {
    const geo = new THREE.SphereGeometry(420, 24, 16);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const top = new THREE.Color(PALETTE.skyTop);
    const mid = new THREE.Color(PALETTE.skyMid);
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i) / 420;
      const c = h < 0.04 ? horizon : h < 0.3 ? horizon.clone().lerp(mid, (h - 0.04) / 0.26) : mid.clone().lerp(top, Math.min(1, (h - 0.3) / 0.5));
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    owned.push(mat);
    const sky = add(geo, mat, 'sky');
    sky.position.set(0, 0, 100);
    sky.updateMatrix();
    sky.renderOrder = -10;
  }

  /* Ground: one grid with grass colour patches, flat under the play strip */
  {
    const W = 160;
    const L = Z1 - Z0;
    const geo = new THREE.PlaneGeometry(W, L, low ? 40 : 64, low ? 80 : 128);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, Z0 + L / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, groundY(pos.getX(i), pos.getZ(i)));
    const g = prep(geo);
    const base = new THREE.Color(PALETTE.grass);
    const light = new THREE.Color(PALETTE.grassLight);
    const dark = new THREE.Color(PALETTE.grassDark);
    paint(g, (n, p) => {
      const patch = Math.sin(p.x * 0.21 + Math.sin(p.z * 0.07) * 2) * Math.cos(p.z * 0.13 + p.x * 0.05);
      const c = base.clone();
      if (patch > 0.35) c.lerp(light, 0.7);
      else if (patch < -0.45) c.lerp(dark, 0.45);
      if (Math.abs(p.x) > 16) c.lerp(dark, Math.min(0.6, (Math.abs(p.x) - 16) / 30));
      return c;
    });
    g.computeVertexNormals();
    add(g, solidMat, 'ground');
  }

  /* The path: a ribbon with jittered edges and a slight meander, a hair above the grass */
  {
    const verts = [];
    const cols = [];
    const sand = new THREE.Color(PALETTE.path);
    const sandDark = new THREE.Color(PALETTE.pathDark);
    const STEP = 1.6;
    let prev = null;
    for (let z = Z0; z <= Z1; z += STEP) {
      const wob = Math.sin(z * 0.045) * 0.6 + Math.sin(z * 0.13) * 0.25;
      const l = -PATH_W / 2 + wob + r(-0.45, 0.45);
      const rr = PATH_W / 2 + wob + r(-0.45, 0.45);
      const row = [l, (l + rr) / 2 - 1.2, (l + rr) / 2 + 1.2, rr].map((x) => [x, 0.03, z]);
      if (prev) {
        for (let k = 0; k < 3; k++) {
          const a = prev[k];
          const b = prev[k + 1];
          const c = row[k];
          const d = row[k + 1];
          // The two wheel-worn tracks either side of the middle are a touch darker.
          const tint = sand.clone().lerp(sandDark, k === 1 ? 0.0 : 0.35 + r(-0.15, 0.15));
          verts.push(...a, ...c, ...b, ...b, ...c, ...d);
          for (let v = 0; v < 6; v++) cols.push(tint.r, tint.g, tint.b);
        }
      }
      prev = row;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const mat = lambert({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    add(geo, mat, 'path');
  }

  /* Cliffs: stacks of boxes either side, teal sides and grassy tops; a taller back row behind */
  {
    const parts = [];
    for (const side of [-1, 1]) {
      for (const row of [0, 1]) {
        const step = row ? 16 : 11;
        for (let z = Z0; z < Z1; z += step + r(-2, 3)) {
          const x = side * (row ? r(40, 54) : r(22, 30));
          const w = r(8, 14);
          const d = r(9, 15);
          const h = row ? r(14, 26) : r(4, 11);
          const sideCol = pick(PALETTE.cliff);
          const topCol = pick(PALETTE.cliffTop);
          const ry = r(-0.35, 0.35);
          const g0 = groundY(x, z);
          parts.push(place(paint(box(w, h, d), topLit(sideCol, topCol)), x, g0 + h / 2 - 1, z, ry));
          // A grassy lip overhanging the top, and sometimes a smaller block stacked on it.
          parts.push(place(paint(box(w + 1.2, 1.1, d + 1.2), topLit(PALETTE.cliffTop[0], topCol, -0.5)), x, g0 + h - 0.9, z, ry));
          if (rand() < 0.55) {
            const h2 = r(4, 10);
            const w2 = w * r(0.45, 0.7);
            const ox = side * r(-1, 2.5);
            parts.push(place(paint(box(w2, h2, d * 0.6), topLit(pick(PALETTE.cliff), topCol)), x + ox, g0 + h + h2 / 2 - 1, z + r(-2, 2), ry + r(-0.3, 0.3)));
          }
        }
      }
    }
    add(mergeGeometries(parts), solidMat, 'cliffs');
    parts.forEach((p) => p.dispose());
  }

  /* Fences: posts and two rails along x = +-7 for z 0..60, with spans missing and rails knocked loose */
  {
    const parts = [];
    for (const side of [-1, 1]) {
      const x = side * 7;
      const SPAN = 2.6;
      for (let z = -6; z < 64; z += SPAN) {
        if (rand() < 0.16) continue; // a gap
        const lean = r(-0.08, 0.08);
        parts.push(place(paint(box(0.26, 1.15, 0.26), topLit(PALETTE.fencePost, '#8a6040')), x, 0.55, z, r(-0.2, 0.2), 1, 1, 1, lean));
        if (rand() < 0.12) continue; // a post with no rails after it
        for (const y of [0.5, 0.9]) {
          const broken = rand() < 0.1;
          parts.push(place(paint(box(0.12, 0.14, SPAN), topLit(PALETTE.fenceRail, '#9a6a48')), x + (broken ? side * 0.2 : 0), broken ? 0.12 : y, z + SPAN / 2, broken ? r(-0.4, 0.4) : 0, 1, 1, 1, broken ? 0.3 : 0));
        }
      }
    }
    add(mergeGeometries(parts), solidMat, 'fences');
    parts.forEach((p) => p.dispose());
  }

  /* Mushrooms (about 20) and rocks (about 30), merged */
  {
    const parts = [];
    const nM = half(20);
    for (let i = 0; i < nM; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      const x = side * r(5.6, 13);
      const z = r(4, 130);
      const s = r(0.8, 1.5);
      const y = groundY(x, z);
      parts.push(place(paint(prep(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 6)), solid(PALETTE.stem)), x, y + 0.3 * s, z, 0, s));
      const cap = prep(new THREE.SphereGeometry(0.42, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2));
      parts.push(place(paint(cap, (n) => (n.y < -0.2 ? PALETTE.stem : PALETTE.capRed)), x, y + 0.55 * s, z, 0, s, s * 0.8, s));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + r(0, 0.8);
        const el = r(0.35, 0.95);
        const dot = prep(new THREE.IcosahedronGeometry(0.075, 0));
        const dr = 0.42 * Math.cos(el);
        parts.push(place(paint(dot, solid(PALETTE.capDot)), x + Math.cos(a) * dr * s, y + (0.55 + 0.42 * Math.sin(el) * 0.8) * s, z + Math.sin(a) * dr * s, 0, s, s * 0.5, s));
      }
    }
    const nR = half(30);
    for (let i = 0; i < nR; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      // Most sit along the path's edges (as in the reference's foreground); some out in the grass.
      const x = side * (rand() < 0.6 ? r(3.4, 6.2) : r(7.5, 16));
      const z = r(-6, 150);
      const s = r(0.35, 0.9);
      const col = pick(PALETTE.rock);
      const g = prep(new THREE.IcosahedronGeometry(1, 0));
      parts.push(place(paint(g, topLit(col, '#dfe7f0', 0.6)), x, groundY(x, z) + 0.15 * s, z, r(0, 6), s * r(1, 1.5), s * r(0.45, 0.7), s * r(0.8, 1.2), r(-0.2, 0.2), r(-0.2, 0.2)));
    }
    add(mergeGeometries(parts), solidMat, 'props');
    parts.forEach((p) => p.dispose());
  }

  /* Trees: three broadleaf shapes and a pine, each one InstancedMesh, plus soft round shadows */
  const instanced = [];
  {
    const broadleaf = (variant) => {
      const rv = mulberry32(seed * 31 + variant);
      const q = (lo, hi) => lo + (hi - lo) * rv();
      const parts = [];
      const trunkH = q(1.8, 2.6);
      parts.push(place(paint(prep(new THREE.CylinderGeometry(0.22, 0.34, trunkH, 5)), solid(PALETTE.trunk)), 0, trunkH / 2, 0, 0, 1, 1, 1, q(-0.08, 0.08)));
      const n = 3 + Math.floor(rv() * 3);
      for (let k = 0; k < n; k++) {
        const s = q(1.4, 2.3);
        const a = (k / n) * Math.PI * 2 + q(0, 1);
        const rad = k === 0 ? 0 : q(0.6, 1.1);
        const side = PALETTE.leaf[(variant + k) % PALETTE.leaf.length];
        parts.push(place(paint(box(s, s * 0.8, s), topLit(side, PALETTE.leaf[2], 0.6)), Math.cos(a) * rad, trunkH + q(0.1, 1.0) + (k === 0 ? 0.6 : 0), Math.sin(a) * rad, q(0, 1.5), 1, 1, 1, q(-0.25, 0.25), q(-0.25, 0.25)));
      }
      const geo = mergeGeometries(parts);
      parts.forEach((p) => p.dispose());
      return geo;
    };
    const pine = () => {
      const parts = [place(paint(prep(new THREE.CylinderGeometry(0.16, 0.24, 1.2, 5)), solid(PALETTE.trunk)), 0, 0.6, 0)];
      [
        [1.5, 1.9, 1.5],
        [1.15, 1.6, 2.5],
        [0.75, 1.4, 3.4],
      ].forEach(([rad, h, y], k) => {
        parts.push(place(paint(prep(new THREE.ConeGeometry(rad, h, 6)), (n) => (n.y > 0.45 ? PALETTE.pine[1] : PALETTE.pine[0])), 0, y, 0, k * 0.5));
      });
      const geo = mergeGeometries(parts);
      parts.forEach((p) => p.dispose());
      return geo;
    };
    const kinds = [broadleaf(0), broadleaf(1), broadleaf(2), pine()];
    const spots = kinds.map(() => []);
    const shadows = [];
    const total = half(64);
    // A few big trees framing the near view, the rest strewn up the valley, thicker into the distance.
    for (let i = 0; i < total; i++) {
      const side = i % 2 ? 1 : -1;
      const near = i < 8;
      const z = near ? r(-4, 34) : Math.pow(rand(), 0.7) * 210 - 4;
      const x = side * (near ? r(9.5, 15) : r(8.6, 24));
      const kind = rand() < 0.38 ? 3 : Math.floor(rand() * 3);
      const s = near ? r(1.1, 1.4) : r(0.85, 1.35) * (kind === 3 ? 1.2 : 1);
      spots[kind].push({ x, y: groundY(x, z) - 0.05, z, s, ry: r(0, Math.PI * 2) });
      shadows.push({ x, y: groundY(x, z) + 0.05, z, s: s * (kind === 3 ? 1.6 : 2.2) });
    }
    const mat = lambert();
    const color = new THREE.Color();
    kinds.forEach((geo, k) => {
      owned.push(geo);
      const list = spots[k];
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.name = 'trees-' + k;
      list.forEach((t, i) => {
        E.set(0, t.ry, 0);
        Q.setFromEuler(E);
        M.compose(P.set(t.x, t.y, t.z), Q, S.set(t.s, t.s, t.s));
        mesh.setMatrixAt(i, M);
        mesh.setColorAt(i, color.setScalar(r(0.88, 1.08)));
      });
      mesh.computeBoundingSphere();
      group.add(mesh);
      instanced.push(mesh);
    });

    const sGeo = new THREE.CircleGeometry(1, 12);
    sGeo.rotateX(-Math.PI / 2);
    const sMat = new THREE.MeshBasicMaterial({ color: '#1d4a1a', transparent: true, opacity: 0.22, depthWrite: false });
    owned.push(sGeo, sMat);
    const sh = new THREE.InstancedMesh(sGeo, sMat, shadows.length);
    sh.name = 'tree-shadows';
    shadows.forEach((t, i) => {
      M.compose(P.set(t.x + 0.5, t.y, t.z + 0.4), Q.identity(), S.set(t.s, 1, t.s * 0.85));
      sh.setMatrixAt(i, M);
    });
    sh.computeBoundingSphere();
    group.add(sh);
    instanced.push(sh);
  }

  /* Grass tufts: about 200 instances of four crossed blades */
  {
    const blades = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI + 0.3;
      const g = new THREE.BufferGeometry();
      const lean = 0.12 * (k % 2 ? 1 : -1);
      g.setAttribute('position', new THREE.Float32BufferAttribute([-0.07, 0, 0, 0.07, 0, 0, lean, 0.55 + k * 0.06, 0], 3));
      g.computeVertexNormals();
      g.setAttribute('color', new THREE.Float32BufferAttribute([...new THREE.Color('#4fa83e').toArray(), ...new THREE.Color('#4fa83e').toArray(), ...new THREE.Color(PALETTE.tuft).toArray()], 3));
      g.rotateY(a);
      blades.push(g);
    }
    const geo = mergeGeometries(blades);
    blades.forEach((b) => b.dispose());
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    owned.push(geo, mat);
    const n = half(200);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.name = 'tufts';
    for (let i = 0; i < n; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      const x = side * (rand() < 0.15 ? r(4.2, 5.2) : r(5, 22));
      const z = r(-6, 140);
      const s = r(0.55, 1.05);
      E.set(0, r(0, 3), 0);
      Q.setFromEuler(E);
      M.compose(P.set(x, groundY(x, z), z), Q, S.set(s, s, s));
      mesh.setMatrixAt(i, M);
    }
    mesh.computeBoundingSphere();
    group.add(mesh);
    instanced.push(mesh);
  }

  /* Clouds: a handful of puffy clusters, merged, unfogged, drifting */
  const clouds = new THREE.Group();
  clouds.name = 'clouds';
  {
    const parts = [];
    const nC = 6;
    for (let i = 0; i < nC; i++) {
      const cx = r(-110, 110);
      const cy = r(48, 80);
      const cz = r(170, 300);
      const puffs = 4 + Math.floor(rand() * 4);
      for (let k = 0; k < puffs; k++) {
        const s = r(6, 12);
        parts.push(place(paint(prep(new THREE.IcosahedronGeometry(1, 1)), (n) => (n.y < -0.3 ? '#dfeaf6' : PALETTE.cloud)), cx + (k - puffs / 2) * s * 0.9 + r(-2, 2), cy + r(-2, 3) + (k % 2) * s * 0.3, cz + r(-4, 4), r(0, 3), s, s * 0.62, s * 0.8));
      }
    }
    const geo = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    owned.push(geo, mat);
    clouds.add(new THREE.Mesh(geo, mat));
    scene.add(clouds);
  }

  return {
    group,
    update(t) {
      clouds.position.x = Math.sin(t * 0.01) * 20;
    },
    dispose() {
      scene.remove(group);
      scene.remove(clouds);
      for (const o of owned) o.dispose();
      for (const m of instanced) m.dispose?.();
    },
  };
}
