// The 3D symbol frozen inside each project's block: real geometry built in code from three.js primitives,
// in the frosted white of the BTTRshop hub's hero objects (a soft clay white, lit from the top left,
// pushed over 1 so it still reads through the ice's attenuation, as the hub's art does). Each one turns
// slowly in its block and has one small motion of its own: the clapper's beat bars pulse, the gauge's
// needle hunts, Drift's fragments drift off, the ghost arrow flickers, the blinds' slats tilt, the goose
// glides. Every symbol is centred and fits a 2 x 2 x 1 box; block.js scales it into its hull.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vView;
varying vec3 vPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FRAG = /* glsl */ `
uniform vec3 uTint;
uniform float uGain;
varying vec3 vN;
varying vec3 vView;
varying vec3 vPos;
float h(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vView);
  vec3 key = normalize(vec3(-0.5, 0.8, 0.6));
  float wrap = dot(n, key) * 0.5 + 0.5;
  float sky = 0.5 + 0.5 * n.y;
  float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.5);
  // frosted: a fine speckle of frost and a soft clay body
  float frost = n3(vPos * 38.0) * 0.5 + n3(vPos * 9.0) * 0.5;
  vec3 col = uTint * (0.34 + 0.5 * wrap + 0.18 * sky) * (0.92 + 0.12 * frost);
  col += vec3(0.85, 0.9, 1.0) * rim * 0.35;
  gl_FragColor = vec4(col * uGain, 1.0);
  #include <colorspace_fragment>
}
`;

export function symbolMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTint: { value: new THREE.Color('#eef1f5') }, uGain: { value: 1.45 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
  });
}

const ghostMat = () => new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });

/* ---- helpers ---- */

const ext = (shape, depth, bevel = 0.04) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 18 });
  g.translate(0, 0, -depth / 2);
  return g;
};
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg);
const merge = (parts) => {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  for (const p of parts) p.dispose();
  g.computeVertexNormals();
  return g;
};
const place = (g, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  return g.applyMatrix4(m);
};

/* ---- the symbols: each returns { group, tick(t, beat) } ---- */

// BTTRURSLF: Warren's B with the mountain in its bowl (traced from public/shop/logo-mark.png in BTTRURSLF):
// the B's plate with its square counter, and the mountain standing proud of it in relief.
function bttr(mat) {
  const P = (x, y) => new THREE.Vector2((x - 300) / 260, (300 - y) / 260);
  const b = new THREE.Shape();
  b.moveTo(...P(42, 45).toArray());
  b.lineTo(...P(392, 45).toArray());
  b.quadraticCurveTo(...P(500, 45).toArray(), ...P(500, 142).toArray());
  b.quadraticCurveTo(...P(500, 232).toArray(), ...P(424, 248).toArray());
  b.quadraticCurveTo(...P(584, 262).toArray(), ...P(584, 398).toArray());
  b.quadraticCurveTo(...P(584, 565).toArray(), ...P(396, 565).toArray());
  b.lineTo(...P(42, 565).toArray());
  b.closePath();
  const hole = new THREE.Path();
  hole.moveTo(...P(146, 166).toArray());
  hole.lineTo(...P(146, 318).toArray());
  hole.lineTo(...P(276, 166).toArray());
  hole.closePath();
  b.holes.push(hole);
  const mtn = new THREE.Shape();
  mtn.moveTo(...P(62, 500).toArray());
  mtn.lineTo(...P(290, 222).toArray());
  mtn.lineTo(...P(540, 470).toArray());
  mtn.quadraticCurveTo(...P(520, 545).toArray(), ...P(396, 548).toArray());
  mtn.lineTo(...P(62, 548).toArray());
  mtn.closePath();
  // the snow line under the peak: a thin chevron, raised further
  const cap = new THREE.Shape();
  cap.moveTo(...P(232, 292).toArray());
  cap.lineTo(...P(290, 236).toArray());
  cap.lineTo(...P(350, 296).toArray());
  cap.lineTo(...P(322, 300).toArray());
  cap.lineTo(...P(290, 270).toArray());
  cap.lineTo(...P(262, 298).toArray());
  cap.closePath();
  const geo = merge([ext(b, 0.3, 0.05), place(ext(mtn, 0.3, 0.04), { p: [0, 0, 0.14] }), place(ext(cap, 0.08, 0.02), { p: [0, 0, 0.36] })]);
  const mesh = new THREE.Mesh(geo, mat);
  const group = new THREE.Group();
  group.add(mesh);
  return { group, tick() {} };
}

// Beatcut: a clapperboard, its sticks open, and beat bars that pulse through it.
function clapper(mat) {
  const group = new THREE.Group();
  const board = merge([
    box(1.7, 1.15, 0.14, 0, -0.25, 0),
    // the board's ruled lines, raised
    box(1.5, 0.04, 0.04, 0, 0.05, 0.08),
    box(1.5, 0.04, 0.04, 0, -0.25, 0.08),
    box(0.04, 0.6, 0.04, -0.2, -0.25, 0.08),
  ]);
  group.add(new THREE.Mesh(board, mat));
  const stripes = (n) => {
    const parts = [box(1.7, 0.24, 0.12)];
    for (let i = 0; i < n; i++) parts.push(place(box(0.12, 0.3, 0.06), { p: [-0.7 + i * 0.32, 0, 0.07], r: [0, 0, 0.55] }));
    return merge(parts);
  };
  const lower = new THREE.Mesh(stripes(5), mat);
  lower.position.set(0, 0.46, 0);
  group.add(lower);
  const hinge = new THREE.Group();
  hinge.position.set(-0.85, 0.6, 0);
  const upper = new THREE.Mesh(stripes(5), mat);
  upper.position.set(0.85, 0.12, 0);
  hinge.add(upper);
  hinge.rotation.z = 0.42;
  group.add(hinge);
  // the beat: eight bars across the board's face
  const bars = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(box(0.1, 1, 0.08), mat);
    m.position.set(-0.6 + i * 0.17, -0.5, 0.14);
    m.scale.y = 0.2;
    group.add(m);
    bars.push(m);
  }
  const heights = [0.35, 0.6, 0.25, 0.75, 0.45, 0.65, 0.3, 0.55];
  return {
    group,
    tick(t, beat) {
      // 120 bpm: a hit on every beat, the sticks clap on the bar
      bars.forEach((m, i) => {
        const phase = (beat * 2 + i * 0.125) % 1;
        m.scale.y = 0.12 + heights[i] * Math.exp(-phase * 5);
        m.position.y = -0.5 - (1 - m.scale.y) * 0.0;
      });
      const bar = beat % 2;
      hinge.rotation.z = 0.05 + 0.42 * Math.min(1, (bar < 0.12 ? bar / 0.12 : 1 - (bar - 0.12) / 1.88) * 1.0 + (bar < 0.12 ? 0 : 0));
    },
  };
}

// Drift: a crushed plastic bottle, shedding fragments that drift off and come back round.
function bottle(mat) {
  const pts = [
    [0.0, -1.0], [0.36, -1.0], [0.4, -0.92], [0.4, 0.2], [0.34, 0.42], [0.17, 0.62], [0.15, 0.8], [0.18, 0.82], [0.18, 0.98], [0.0, 0.98],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 36);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x);
    // crushed: dents round the body, a pinch in the middle, a bend
    const dent = 1 - 0.22 * Math.max(0, Math.sin(a * 3 + v.y * 4)) * (v.y < 0.3 ? 1 : 0.2) - 0.18 * Math.exp(-((v.y + 0.25) ** 2) * 18);
    v.x *= dent;
    v.z *= dent * 0.78;
    v.x += 0.12 * Math.sin(v.y * 1.6);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const group = new THREE.Group();
  const body = new THREE.Mesh(g, mat);
  body.rotation.z = -0.5;
  group.add(body);
  const frags = [];
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(new THREE.TetrahedronGeometry(0.06 + (i % 3) * 0.03), mat);
    f.userData = { a: (i / 9) * Math.PI * 2, r: 0.55 + (i % 4) * 0.12, sp: 0.15 + (i % 5) * 0.05, ph: i * 1.7 };
    group.add(f);
    frags.push(f);
  }
  return {
    group,
    tick(t) {
      for (const f of frags) {
        const u = f.userData;
        const k = (t * u.sp + u.ph) % 1; // drift out, then fade back in at the bottle
        const r = u.r + k * 0.5;
        f.position.set(Math.cos(u.a + t * 0.1) * r, -0.3 + Math.sin(u.a) * 0.4 + k * 0.25, Math.sin(u.a + t * 0.1) * r * 0.5);
        f.rotation.set(t * 0.7 + u.ph, t * 0.5, 0);
        f.scale.setScalar(1 - k * 0.6);
      }
    },
  };
}

// Stress Test: a small server rack with a load gauge whose needle hunts toward the red.
function rack(mat) {
  const group = new THREE.Group();
  const parts = [
    box(1.0, 0.07, 0.7, 0, 0.95, 0),
    box(1.0, 0.07, 0.7, 0, -0.95, 0),
    box(0.07, 1.9, 0.07, -0.47, 0, 0.32),
    box(0.07, 1.9, 0.07, 0.47, 0, 0.32),
    box(0.07, 1.9, 0.07, -0.47, 0, -0.32),
    box(0.07, 1.9, 0.07, 0.47, 0, -0.32),
  ];
  for (let i = 0; i < 5; i++) {
    const y = 0.68 - i * 0.34;
    parts.push(box(0.86, 0.24, 0.6, 0, y, 0));
    for (let k = 0; k < 3; k++) parts.push(box(0.05, 0.05, 0.04, 0.25 + k * 0.08, y, 0.31));
    parts.push(box(0.4, 0.03, 0.03, -0.15, y + 0.05, 0.31));
    parts.push(box(0.4, 0.03, 0.03, -0.15, y - 0.05, 0.31));
  }
  group.add(new THREE.Mesh(merge(parts), mat));
  // the gauge, perched on the rack's top
  const gauge = new THREE.Group();
  gauge.position.set(0.0, 1.32, 0.1);
  gauge.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 10, 40, Math.PI), mat));
  const ticks = [];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI;
    ticks.push(place(box(0.025, 0.11, 0.03), { p: [Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0], r: [0, 0, a - Math.PI / 2] }));
  }
  ticks.push(box(0.9, 0.05, 0.08, 0, -0.02, 0));
  gauge.add(new THREE.Mesh(merge(ticks), mat));
  const needle = new THREE.Mesh(box(0.035, 0.36, 0.04, 0, 0.18, 0.03), mat);
  gauge.add(needle);
  group.add(gauge);
  group.scale.setScalar(0.82);
  return {
    group,
    tick(t) {
      const load = 0.5 + 0.35 * Math.sin(t * 0.7) + 0.12 * Math.sin(t * 2.9);
      needle.rotation.z = (0.5 - Math.min(0.97, load)) * Math.PI;
    },
  };
}

// Raingarden: a raindrop over a sprouting plant in its mound of soil.
function drop(mat) {
  const group = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const y = 1 - 2 * t;
    const r = Math.sin(Math.acos(Math.max(-1, Math.min(1, -y)))) * (t > 0.45 ? 1 : Math.pow(t / 0.45, 1.6));
    prof.push(new THREE.Vector2(r * 0.34, y * 0.5));
  }
  const d = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), mat);
  d.position.set(0.15, 0.62, 0);
  group.add(d);
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.62, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.38, 0.8), mat);
  mound.position.y = -0.85;
  group.add(mound);
  const stemCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.66, 0), new THREE.Vector3(0.04, -0.4, 0), new THREE.Vector3(-0.03, -0.15, 0), new THREE.Vector3(0.02, 0.02, 0)]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 24, 0.035, 8), mat));
  const leaf = new THREE.Shape();
  leaf.moveTo(0, 0);
  leaf.quadraticCurveTo(0.22, 0.12, 0.42, 0.0);
  leaf.quadraticCurveTo(0.2, -0.1, 0, 0);
  const lg = ext(leaf, 0.02, 0.012);
  const l1 = new THREE.Mesh(lg, mat);
  l1.position.set(0.02, -0.12, 0);
  l1.rotation.set(0.2, 0, 0.55);
  const l2 = new THREE.Mesh(lg, mat);
  l2.position.set(-0.01, -0.26, 0);
  l2.rotation.set(-0.2, Math.PI, 0.4);
  group.add(l1, l2);
  return {
    group,
    tick(t) {
      d.position.y = 0.62 + Math.sin(t * 1.3) * 0.05;
      l1.rotation.z = 0.55 + Math.sin(t * 0.9) * 0.06;
      l2.rotation.z = 0.4 + Math.sin(t * 0.9 + 1) * 0.06;
    },
  };
}

// Ghostline: a bow with an arrow nocked, and a ghost of a second arrow beside it, flickering.
function bow(mat) {
  const group = new THREE.Group();
  const arc = new THREE.CatmullRomCurve3(
    [-1, -0.6, -0.2, 0.2, 0.6, 1].map((y) => new THREE.Vector3(-0.35 + 0.42 * (1 - y * y) - 0.05 * y * y * y, y * 0.95, 0)),
  );
  group.add(new THREE.Mesh(new THREE.TubeGeometry(arc, 40, 0.045, 8), mat));
  const grip = new THREE.Mesh(cyl(0.07, 0.07, 0.3, 12), mat);
  grip.position.set(0.07, 0, 0);
  group.add(grip);
  const string = new THREE.Mesh(cyl(0.008, 0.008, 1.84, 6), mat);
  string.position.set(-0.36, 0, 0);
  group.add(string);
  const arrow = (wire) => {
    const parts = [place(cyl(0.018, 0.018, 1.5, 8), { r: [0, 0, Math.PI / 2] }), place(new THREE.ConeGeometry(0.05, 0.16, 10), { p: [0.82, 0, 0], r: [0, 0, -Math.PI / 2] })];
    for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) parts.push(place(box(0.2, 0.08, 0.008), { p: [-0.66, Math.cos(a) * 0.04, Math.sin(a) * 0.04], r: [a, 0, 0] }));
    const g = merge(parts);
    if (!wire) return new THREE.Mesh(g, mat);
    const w = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), ghostMat());
    g.dispose();
    return w;
  };
  const a1 = arrow(false);
  a1.position.set(0.32, 0, 0);
  group.add(a1);
  const ghost = arrow(true);
  ghost.position.set(0.42, -0.22, 0.12);
  ghost.rotation.z = 0.04;
  group.add(ghost);
  return {
    group,
    tick(t) {
      const k = 0.5 + 0.5 * Math.sin(t * 2.3);
      ghost.material.opacity = 0.2 + 0.6 * k * (0.7 + 0.3 * Math.sin(t * 17));
      ghost.position.x = 0.42 + ((t * 0.25) % 1) * 0.25;
    },
  };
}

// Terrarium: a glass jar (its outline: rings, ribs and a lid) on moss, a little segmented creature inside.
function jar(mat) {
  const group = new THREE.Group();
  const parts = [];
  for (const [y, r] of [[-0.85, 0.62], [-0.3, 0.68], [0.25, 0.66], [0.62, 0.5], [0.78, 0.4]]) parts.push(place(new THREE.TorusGeometry(r, 0.022, 8, 48), { p: [0, y, 0], r: [Math.PI / 2, 0, 0] }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const c = new THREE.CatmullRomCurve3([[0.62, -0.85], [0.68, -0.3], [0.66, 0.25], [0.5, 0.62], [0.4, 0.78]].map(([r, y]) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)));
    parts.push(new THREE.TubeGeometry(c, 16, 0.012, 5));
  }
  parts.push(place(cyl(0.46, 0.46, 0.16, 32), { p: [0, 0.9, 0] }));
  parts.push(place(new THREE.SphereGeometry(0.6, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.3, 1), { p: [0, -0.86, 0] }));
  group.add(new THREE.Mesh(merge(parts), mat));
  const critter = new THREE.Group();
  const segs = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.09 - i * 0.012, 14, 10), mat);
    critter.add(s);
    segs.push(s);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), mat);
  segs[0].add(eye);
  eye.position.set(0.05, 0.05, 0.05);
  critter.position.set(0, -0.62, 0);
  group.add(critter);
  return {
    group,
    tick(t) {
      segs.forEach((s, i) => {
        const a = t * 0.6 - i * 0.32;
        s.position.set(Math.cos(a) * 0.28, 0.05 * Math.abs(Math.sin(t * 3 - i)), Math.sin(a) * 0.2);
      });
    },
  };
}

// HowPolluted: a globe with its graticule, standing on a pile of litter.
function globe(mat) {
  const group = new THREE.Group();
  const g = new THREE.SphereGeometry(0.62, 40, 28);
  // continents, raised a touch by a noise of the direction
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = Math.sin(v.x * 4.1 + 1.3) * Math.sin(v.y * 3.3 + 0.4) * Math.sin(v.z * 4.7 + 2.1) + 0.4 * Math.sin(v.x * 9 + v.z * 7);
    v.multiplyScalar(0.62 * (1 + (n > 0.15 ? 0.035 : 0)));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const ball = new THREE.Mesh(g, mat);
  ball.position.y = 0.32;
  group.add(ball);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.02, 8, 64), mat);
  ring.position.y = 0.32;
  ring.rotation.set(Math.PI / 2 - 0.4, 0, 0.3);
  group.add(ring);
  const pile = [];
  const r = (i, k) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  for (let i = 0; i < 22; i++) {
    const a = r(i, 1) * Math.PI * 2;
    const rad = r(i, 2) * 0.75;
    const y = -0.62 + (0.75 - rad) * 0.42 * r(i, 3);
    const kind = i % 3;
    const geo = kind === 0 ? box(0.16, 0.08, 0.12) : kind === 1 ? cyl(0.05, 0.05, 0.16, 10) : new THREE.IcosahedronGeometry(0.07, 0);
    pile.push(place(geo, { p: [Math.cos(a) * rad, y, Math.sin(a) * rad * 0.6], r: [r(i, 4) * 3, r(i, 5) * 3, r(i, 6) * 3] }));
  }
  group.add(new THREE.Mesh(merge(pile), mat));
  return {
    group,
    tick(t) {
      ball.rotation.y = t * 0.35;
    },
  };
}

// Archer Hero: a target with an arrow in its gold, still quivering.
function target(mat) {
  const group = new THREE.Group();
  const parts = [place(cyl(0.9, 0.9, 0.18, 48), { r: [Math.PI / 2, 0, 0] })];
  for (const r of [0.72, 0.52, 0.32]) parts.push(place(new THREE.TorusGeometry(r, 0.03, 8, 48), { p: [0, 0, 0.1] }));
  parts.push(place(cyl(0.13, 0.13, 0.05, 24), { p: [0, 0, 0.1], r: [Math.PI / 2, 0, 0] }));
  parts.push(place(box(0.07, 0.9, 0.07), { p: [-0.42, -0.85, -0.25], r: [0.25, 0, 0.35] }));
  parts.push(place(box(0.07, 0.9, 0.07), { p: [0.42, -0.85, -0.25], r: [0.25, 0, -0.35] }));
  const face = new THREE.Group();
  face.add(new THREE.Mesh(merge(parts), mat));
  face.rotation.y = -0.35;
  group.add(face);
  const arrow = new THREE.Group();
  const shaft = [place(cyl(0.02, 0.02, 1.1, 8), { p: [0, 0, 0.55], r: [Math.PI / 2, 0, 0] })];
  for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) shaft.push(place(box(0.008, 0.08, 0.2), { p: [Math.cos(a) * 0.04, Math.sin(a) * 0.04, 1.0], r: [0, 0, a] }));
  arrow.add(new THREE.Mesh(merge(shaft), mat));
  arrow.position.set(0.12, 0.1, 0.08);
  arrow.rotation.set(-0.25, 0.5, 0);
  face.add(arrow);
  return {
    group,
    tick(t) {
      const q = Math.exp(-((t % 4) * 2.5)) * Math.sin(t * 40) * 0.05;
      arrow.rotation.x = -0.25 + q;
    },
  };
}

// BC Window Coverings: a window, its blind half drawn, the slats tilting open and shut.
function windowBlind(mat) {
  const group = new THREE.Group();
  const frame = merge([
    box(1.6, 0.1, 0.16, 0, 0.95, 0),
    box(1.6, 0.1, 0.16, 0, -0.95, 0),
    box(0.1, 2.0, 0.16, -0.75, 0, 0),
    box(0.1, 2.0, 0.16, 0.75, 0, 0),
    box(0.05, 1.8, 0.08, 0, 0, -0.03),
    box(1.4, 0.05, 0.08, 0, 0, -0.03),
    box(1.8, 0.08, 0.3, 0, -1.02, 0.06),
    box(1.5, 0.12, 0.12, 0, 0.84, 0.12),
  ]);
  group.add(new THREE.Mesh(frame, mat));
  const slats = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(box(1.42, 0.085, 0.012), mat);
    s.position.set(0, 0.74 - i * 0.1, 0.12);
    group.add(s);
    slats.push(s);
  }
  const rail = new THREE.Mesh(box(1.44, 0.04, 0.06), mat);
  rail.position.set(0, 0.74 - 9 * 0.1, 0.12);
  group.add(rail);
  const cord = new THREE.Mesh(cyl(0.008, 0.008, 1.1, 5), mat);
  cord.position.set(0.62, 0.25, 0.16);
  group.add(cord);
  group.scale.setScalar(0.9);
  return {
    group,
    tick(t) {
      const tilt = 0.25 + 0.95 * (0.5 + 0.5 * Math.sin(t * 0.8));
      for (const s of slats) s.rotation.x = tilt;
    },
  };
}

// WATERLOODLE: a Canada goose gliding, wings out.
function goose(mat) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 18).scale(1.45, 0.72, 0.8), mat);
  group.add(body);
  const neck = new THREE.CatmullRomCurve3([new THREE.Vector3(0.48, 0.12, 0), new THREE.Vector3(0.72, 0.3, 0), new THREE.Vector3(0.86, 0.48, 0), new THREE.Vector3(0.98, 0.55, 0)]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(neck, 20, 0.085, 10), mat));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12).scale(1.3, 0.9, 0.9), mat);
  head.position.set(1.02, 0.56, 0);
  group.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 10), mat);
  beak.position.set(1.2, 0.53, 0);
  beak.rotation.z = -Math.PI / 2 - 0.15;
  group.add(beak);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 10).scale(1, 1, 0.5), mat);
  tail.position.set(-0.68, 0.06, 0);
  tail.rotation.z = Math.PI / 2 + 0.2;
  group.add(tail);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.quadraticCurveTo(0.25, 0.35, -0.05, 1.15);
  wingShape.lineTo(-0.22, 1.05);
  wingShape.lineTo(-0.3, 0.8);
  wingShape.lineTo(-0.42, 0.55);
  wingShape.quadraticCurveTo(-0.45, 0.2, -0.35, 0);
  wingShape.closePath();
  const wg = ext(wingShape, 0.03, 0.015);
  const wings = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.12, 0.16, 0.18 * side);
    const w = new THREE.Mesh(wg, mat);
    w.rotation.x = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    pivot.add(w);
    group.add(pivot);
    wings.push({ pivot, side });
  }
  group.rotation.z = 0.08;
  group.scale.setScalar(0.86);
  group.position.x = -0.15;
  return {
    group,
    tick(t) {
      const f = Math.sin(t * 1.6) * 0.22;
      for (const { pivot, side } of wings) pivot.rotation.x = side * (0.15 + f);
      group.position.y = Math.sin(t * 0.8) * 0.04;
    },
  };
}

const BUILDERS = { bttr, clapper, bottle, rack, drop, bow, jar, globe, target, window: windowBlind, goose };

/** A symbol by key, fitted to a 2 x 2 x 1 box round the origin. */
export function buildSymbol(key, mat) {
  const s = (BUILDERS[key] || bttr)(mat);
  s.tick(0, 0);
  const bb = new THREE.Box3().setFromObject(s.group);
  const size = bb.getSize(new THREE.Vector3());
  const c = bb.getCenter(new THREE.Vector3());
  const k = Math.min(2 / size.x, 2 / size.y, 1.3 / Math.max(size.z, 0.01));
  const holder = new THREE.Group();
  s.group.position.sub(c);
  const inner = new THREE.Group();
  inner.add(s.group);
  inner.scale.setScalar(k);
  holder.add(inner);
  holder.userData.size = size.multiplyScalar(k);
  return { group: holder, tick: s.tick };
}
