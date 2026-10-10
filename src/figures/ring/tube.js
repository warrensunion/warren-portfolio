// Ported from BTTRURSLF-v2 src/screens/shop/hub/tube.js, the particle figure only: one draw call of
// opaque round dots (alpha-to-coverage, so the renderer needs antialias) whose every path is computed
// in the vertex shader from where a point came from and where it goes. Kept: the morph (base first, one
// leaning vortex, streams that light up by their own speed), the interrupted-morph freeze in JS, the
// cloud -> figure assembly, the strays, the pointer trail and its resting force field, and the sway.
// Changed, and why:
//  - No pedestal, column, ceiling ring, wall words, drag, pick or HUD rect: those staged the hub's tube.
//  - Re-coloured for paper: the rest colour runs from the hub's slate to a capped light end
//    (.55,.58,.62) instead of near white, which vanished on #fbfbf8; moving, lifted and cloud points
//    darken toward the accent #1f5f78 instead of glowing white; the fog colour is the plate.
//  - Shapes are centred in the ring (tubeShapes.js fitInCircle), so the base-first delay reads height
//    from uBase, and the vortex, plume and trail distances scale with uK (the shapes' fit scale).
//  - The cloud is a small Gaussian puff in the ring's centre (the hub's ring cloud), and uFade grows
//    the dots in so the points appear with the ignite. Driven by time from figure.js, not scroll px.
//  - Point count is the tier's (48k high, 20k low) and the dot size is set in screen px (figure.js).
import * as THREE from 'three';
import { rng } from './noise.js';
import { SRGB } from './ring.js';

const FLIGHT = 0.32; // s, one point's flight
const SPREAD = 0.8; // s, the delays across a shape (base first): streams, not a burst
export const MORPH_S = FLIGHT + SPREAD; // ~1.1 s
const TRAIL = 8;
const SWAY = 12 * (Math.PI / 180); // the hub's 24 deg halved: letters stay readable through the turn

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (x) => x * x * (3 - 2 * x);
const smooth = (e0, e1, x) => ease(clamp01((x - e0) / (e1 - e0)));

const PART_VERT = /* glsl */ `
  attribute vec4 aFrom;   // xyz, tone
  attribute vec4 aTo;
  attribute vec3 aNFrom;
  attribute vec3 aNTo;
  attribute vec3 aCloud;
  attribute vec4 aRand;   // delay, swirl, size, drift
  uniform float uMorphT;  // s since the morph began (large = settled)
  uniform float uSwirl;   // +1 / -1: which way this morph turns
  uniform float uAssemble;
  uniform float uFade;
  uniform float uTime;
  uniform float uMotion;
  uniform float uReduced;
  uniform float uScale;
  uniform float uSize;
  uniform float uBase;    // the shapes' lowest y, for the base-first delay
  uniform float uTop;     // the shapes' height
  uniform float uK;       // the shapes' fit scale: the hub's distances times this
  uniform vec3 uLight;
  uniform vec3 uAccent;
  uniform vec3 uCloudCol;
  uniform vec3 uTrail[${TRAIL}];
  uniform vec3 uTrailV[${TRAIL}];
  uniform float uTrailAge[${TRAIL}];
  uniform vec4 uPoint;    // the pointer's hit on the figure (xyz) and how long it has rested there (w)
  varying vec3 vColor;
  varying float vFog;

  const float FLIGHT = ${FLIGHT.toFixed(3)};
  const float SPREAD = ${SPREAD.toFixed(3)};
  const float PI = 3.14159265;

  float easeIO(float x) { return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0; }
  vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

  void main() {
    // The morph: base first, and the swirl's leading side first, so the old shape is eaten from one
    // low corner while the rest of it still stands (igloo).
    float hh = clamp((aTo.y - uBase) / uTop, 0.0, 1.0);
    float side = clamp(0.5 - uSwirl * aFrom.x / uK * 0.45, 0.0, 1.0);
    float delay = SPREAD * (0.55 * hh + 0.32 * side + 0.13 * aRand.x);
    float t = clamp((uMorphT - delay) / FLIGHT, 0.0, 1.0);
    float e = t * t * (3.0 - 2.0 * t);
    float bump = sin(PI * e);
    vec3 p;
    float heat = 0.0;
    float sizeK = 1.0;
    if (uReduced > 0.5) {
      // Reduced motion: no flight, a cross-fade of the two shapes.
      float k = smoothstep(0.0, 0.12, uMorphT - aRand.x * 0.3);
      p = k < 0.5 ? aFrom.xyz : aTo.xyz;
      sizeK = abs(2.0 * k - 1.0);
      e = step(0.5, k);
    } else {
      p = mix(aFrom.xyz, aTo.xyz, e);
      // One narrow vortex per morph, leaning to one side: neighbours share a path, so they fly as streams.
      p.xz = rot(p.xz, uSwirl * (0.85 + 0.2 * aRand.y) * bump);
      vec2 out2 = p.xz / max(0.15 * uK, length(p.xz));
      p.xz += out2 * (0.3 + 0.08 * aRand.x) * bump * uK;
      p.x += uSwirl * (0.55 * (1.0 - hh) + 0.08 * aRand.z) * bump * uK; // the low plume to one side
      p.y += 0.08 * bump * uK;
      // Colour by each point's own speed: the long, fast trips take the accent, the short ones stay slate.
      float speed = (length(aTo.xyz - aFrom.xyz) / uK + 0.5 * aRand.z) * 6.0 * t * (1.0 - t) / FLIGHT * 0.12;
      heat = smoothstep(0.4, 1.0, speed);
    }

    // The cloud -> figure assembly, the base last-in.
    float ka = clamp((uAssemble * 1.45 - 0.45 * aRand.w - 0.25 * aRand.x) / 0.75, 0.0, 1.0);
    if (uReduced > 0.5) ka = step(0.5, uAssemble);
    float ea = easeIO(ka);
    float ab = sin(PI * ea);
    vec3 q = mix(aCloud, p, ea);
    if (uReduced < 0.5) {
      q.xz = rot(q.xz, ab * 0.5);
      q.y += ab * 0.4 * (aRand.z - 0.2) * uK;
    }
    float cloud = 1.0 - ea;
    float lift = 0.0;

    // A few points drift off and come back (igloo's strays): 0.5 % here, not the hub's 1.2 %, because
    // around a figure this small the hub's share read as noise over the letters.
    if (aRand.w < 0.005 && uMotion > 0.5) {
      float per = 5.0 + 9.0 * fract(aRand.w * 131.0);
      float s = fract(uTime / per + aRand.w * 77.0);
      float env = smoothstep(0.0, 0.18, s) * (1.0 - smoothstep(0.3, 0.62, s));
      vec3 dir = normalize(vec3(fract(aRand.w * 373.0) - 0.5, 0.45, fract(aRand.w * 611.0) - 0.5));
      q += dir * (0.25 + 0.45 * fract(aRand.w * 197.0)) * env * uK;
      heat = max(heat, env * 0.3);
    }

    // The pointer's trail: points near it lift off along its path and fall back.
    if (uMotion > 0.5) {
      vec3 push = vec3(0.0);
      float r2 = 0.1 * uK * uK;
      for (int k = 0; k < ${TRAIL}; k++) {
        float a = uTrailAge[k];
        if (a < 0.0) continue;
        float env = (a / 0.22) * exp(1.0 - a / 0.22);
        vec3 d = q - uTrail[k];
        float f = exp(-dot(d, d) / r2);
        vec3 dn = d / max(0.05 * uK, length(d));
        push += (dn * 0.2 + uTrailV[k] * 1.5 + vec3(0.0, 0.12, 0.08)) * f * env * (0.35 + 1.1 * aRand.y) * uK;
      }
      // A resting pointer is a soft force field: the points round it stand off.
      if (uPoint.w > 0.0) {
        vec3 d = q - uPoint.xyz;
        float f = exp(-dot(d, d) / (0.035 * uK * uK));
        vec3 dn = d / max(0.04 * uK, length(d));
        push += (dn * 0.2 + vec3(0.0, 0.04, 0.1)) * f * uPoint.w * (0.3 + 0.9 * aRand.y) * uK;
      }
      float pl = length(push) / uK;
      push *= min(1.0, 1.15 / max(pl, 1e-4));
      q += push * ea;
      lift = smoothstep(0.12, 0.4, pl) * step(0.4, aRand.y);
    }

    // Shade: the shape's own tone x a key from the upper left, in world space.
    vec3 n = normalize(mix(aNFrom, aNTo, e) + 1e-4);
    vec3 nw = normalize(mat3(modelMatrix) * n);
    float diff = max(0.0, dot(nw, uLight));
    float top = max(0.0, nw.y) * 0.18;
    // Objects carry +4 on their tone (tubeShapes.js): less floor, more key than the initials.
    float of = step(3.0, aFrom.w);
    float ot = step(3.0, aTo.w);
    float tone = mix(aFrom.w - 4.0 * of, aTo.w - 4.0 * ot, e);
    float obj = mix(of, ot, e);
    float lit = clamp(tone * (mix(0.32, 0.14, obj) + mix(0.6, 0.8, obj) * diff + top), 0.0, 1.15) * mix(0.8, 1.0, obj);
    // Paper: slate to a capped light end, so even the lightest dots stay darker than the plate.
    vec3 rest = mix(vec3(0.14, 0.155, 0.195), vec3(0.55, 0.58, 0.62), clamp(lit, 0.0, 1.0));
    vec3 glow = mix(uAccent, uCloudCol, cloud);
    float h = max(clamp(heat, 0.0, 1.0), cloud);
    vColor = mix(mix(rest, glow, h), uAccent, lift * 0.85);

    vec4 mv = modelViewMatrix * vec4(q, 1.0);
    vFog = -mv.z;
    float sz = uSize * (0.75 + 0.5 * aRand.z) * (1.0 + 0.35 * max(heat, lift)) * mix(1.0, 0.6, cloud) * sizeK * uFade;
    gl_PointSize = sz * uScale / max(0.3, -mv.z);
    gl_Position = projectionMatrix * mv;
    // GPUs draw a point of size 0 at their 1 px minimum: a dot that should not be there is moved off clip.
    if (gl_PointSize < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }`;

const PART_FRAG = /* glsl */ `
  uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
  varying vec3 vColor; varying float vFog;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = dot(q, q) * 4.0;
    if (d > 1.0) discard;
    // a soft rim through alpha-to-coverage (MSAA): round dots, no sorting
    float a = 1.0 - smoothstep(0.55, 1.0, d);
    vec3 c = vColor * (1.0 - 0.18 * d);
    c = mix(c, uFogColor, smoothstep(uFogNear, uFogFar, vFog));
    gl_FragColor = vec4(c, a);
  }`;

export class Particles {
  /**
   * @param {object} o
   *   shapes   fitted shapes [{ id, pos, nrm, tone, box, scale }] in morph order (initials first)
   *   n        points drawn (each shape has at least n)
   *   start    index shown first
   *   k        the shapes' common fit scale (uK)
   *   reduced  reduced motion (cross-fades instead of flights)
   *   settled  start fully assembled (poster state, or a ring that already played)
   */
  constructor({ shapes, n, start = 0, k = 1, reduced = false, settled = false }) {
    this.shapes = shapes;
    this.n = n;
    this.index = start;
    this.reduced = reduced;
    this.k = k;
    this.disposables = [];
    this.morphStart = -1e3;
    this._swirl = 1;
    this.trail = [];
    this.lastTrail = 0;
    this.drag = 0;

    const rand = rng(4242);
    const cur = shapes[start];
    const from = new Float32Array(n * 4);
    const to = new Float32Array(n * 4);
    const nf = new Float32Array(n * 3);
    const nt = new Float32Array(n * 3);
    const cloud = new Float32Array(n * 3);
    const r4 = new Float32Array(n * 4);
    const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-6, Math.min(1, rand())))) * Math.cos(2 * Math.PI * rand());
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        from[i * 4 + c] = to[i * 4 + c] = cur.pos[i * 3 + c];
        nf[i * 3 + c] = nt[i * 3 + c] = cur.nrm[i * 3 + c];
      }
      from[i * 4 + 3] = to[i * 4 + 3] = cur.tone[i];
      // The hub ring's own cloud: a puff in the centre (0.42 x 0.38 x 0.22 sigma there).
      cloud[i * 3] = gauss() * 0.42 * k;
      cloud[i * 3 + 1] = gauss() * 0.38 * k;
      cloud[i * 3 + 2] = gauss() * 0.22 * k;
      r4[i * 4] = rand();
      r4[i * 4 + 1] = rand();
      r4[i * 4 + 2] = rand();
      r4[i * 4 + 3] = rand();
    }
    const g = new THREE.BufferGeometry();
    this.aFrom = new THREE.BufferAttribute(from, 4);
    this.aTo = new THREE.BufferAttribute(to, 4);
    this.aNFrom = new THREE.BufferAttribute(nf, 3);
    this.aNTo = new THREE.BufferAttribute(nt, 3);
    g.setAttribute('position', new THREE.BufferAttribute(cloud, 3)); // bounds only; the shader positions
    g.setAttribute('aFrom', this.aFrom);
    g.setAttribute('aTo', this.aTo);
    g.setAttribute('aNFrom', this.aNFrom);
    g.setAttribute('aNTo', this.aNTo);
    g.setAttribute('aCloud', new THREE.BufferAttribute(cloud, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(r4, 4));
    this.rand4 = r4;
    const base = Math.min(...shapes.map((s) => s.box.min[1]));
    const top = Math.max(...shapes.map((s) => s.box.max[1])) - base;
    this.U = {
      uMorphT: { value: 99 },
      uSwirl: { value: 1 },
      uAssemble: { value: settled ? 1 : 0 },
      uFade: { value: settled ? 1 : 0 },
      uTime: { value: 0 },
      uMotion: { value: reduced ? 0 : 1 },
      uReduced: { value: reduced ? 1 : 0 },
      uScale: { value: 1 },
      uSize: { value: 0.01 },
      uBase: { value: base },
      uTop: { value: Math.max(1e-3, top) },
      uK: { value: k },
      uLight: { value: new THREE.Vector3(-0.72, 0.58, 0.42).normalize() },
      uAccent: { value: new THREE.Vector3(...SRGB.accent) },
      // The cloud: the accent a step lighter, so the puff reads as the glitter it was, not a blot.
      uCloudCol: { value: new THREE.Vector3(...SRGB.accent).lerp(new THREE.Vector3(...SRGB.plate), 0.25) },
      uTrail: { value: Array.from({ length: TRAIL }, () => new THREE.Vector3()) },
      uTrailV: { value: Array.from({ length: TRAIL }, () => new THREE.Vector3()) },
      uTrailAge: { value: new Array(TRAIL).fill(-1) },
      uPoint: { value: new THREE.Vector4(0, 0, 0, 0) },
      uFogColor: { value: new THREE.Vector3(...SRGB.plate) },
      uFogNear: { value: 1e3 },
      uFogFar: { value: 2e3 },
    };
    const m = new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: PART_VERT, fragmentShader: PART_FRAG, transparent: false, alphaToCoverage: true });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.disposables.push(g, m);

    this._ray = new THREE.Ray();
    this._m = new THREE.Matrix4();
    this._w = new THREE.Vector3();
  }

  /** Morph to shape `to` (0 = initials). Returns false if it is already there. */
  morph(to, clock) {
    if (to === this.index || !this.shapes[to]) return false;
    const t = clock - this.morphStart;
    if (t < MORPH_S + 0.05) this._freeze(t);
    else {
      this.aFrom.array.set(this.aTo.array);
      this.aNFrom.array.set(this.aNTo.array);
    }
    const s = this.shapes[to];
    const to4 = this.aTo.array;
    const n = this.n;
    for (let i = 0; i < n; i++) {
      to4[i * 4] = s.pos[i * 3];
      to4[i * 4 + 1] = s.pos[i * 3 + 1];
      to4[i * 4 + 2] = s.pos[i * 3 + 2];
      to4[i * 4 + 3] = s.tone[i];
    }
    this.aNTo.array.set(s.nrm.subarray(0, n * 3));
    for (const a of [this.aFrom, this.aTo, this.aNFrom, this.aNTo]) a.needsUpdate = true;
    this._swirl = to > this.index ? 1 : -1;
    this.U.uSwirl.value = this._swirl;
    this.index = to;
    this.morphStart = clock;
    return true;
  }

  /** A morph interrupted: where every point is now becomes where it comes from (the shader's path, in JS). */
  _freeze(t) {
    const n = this.n;
    const f = this.aFrom.array;
    const to = this.aTo.array;
    const nf = this.aNFrom.array;
    const nt = this.aNTo.array;
    const r = this.rand4;
    const base = this.U.uBase.value;
    const top = this.U.uTop.value;
    const K = this.k;
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      let e;
      let x;
      let y;
      let z;
      if (this.reduced) {
        const k = smooth(0, 0.12, t - r[j] * 0.3);
        e = k < 0.5 ? 0 : 1;
        x = e ? to[j] : f[j];
        y = e ? to[j + 1] : f[j + 1];
        z = e ? to[j + 2] : f[j + 2];
      } else {
        const hh = clamp01((to[j + 1] - base) / top);
        const side = clamp01(0.5 - (this._swirl * f[j] * 0.45) / K);
        const delay = SPREAD * (0.55 * hh + 0.32 * side + 0.13 * r[j]);
        e = ease(clamp01((t - delay) / FLIGHT));
        const bump = Math.sin(Math.PI * e);
        x = lerp(f[j], to[j], e);
        y = lerp(f[j + 1], to[j + 1], e);
        z = lerp(f[j + 2], to[j + 2], e);
        const a = this._swirl * (0.85 + 0.2 * r[j + 1]) * bump;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const rx = c * x - s * z;
        const rz = s * x + c * z;
        const l = Math.max(0.15 * K, Math.hypot(rx, rz));
        const o = (0.3 + 0.08 * r[j]) * bump * K;
        x = rx + (rx / l) * o + this._swirl * (0.55 * (1 - hh) + 0.08 * r[j + 2]) * bump * K;
        z = rz + (rz / l) * o;
        y += 0.08 * bump * K;
      }
      f[j] = x;
      f[j + 1] = y;
      f[j + 2] = z;
      f[j + 3] = e < 0.5 ? f[j + 3] : to[j + 3]; // tones carry the +4 object flag: never blend
      const k3 = i * 3;
      for (let q = 0; q < 3; q++) nf[k3 + q] = lerp(nf[k3 + q], nt[k3 + q], e);
    }
  }

  /**
   * The pointer over the stage (NDC, or null) feeds the trail and the resting force field.
   * The ray meets the figure's mid plane (local z = 0); only hits near the current shape count.
   */
  _pointer(pointer, camera, clock, dt) {
    const U = this.U;
    const ages = U.uTrailAge.value;
    const pt = U.uPoint.value;
    for (let k = 0; k < TRAIL; k++) if (ages[k] >= 0) ages[k] = ages[k] + dt > 1.4 ? -1 : ages[k] + dt;
    const towards = (to, rate) => (pt.w += (to - pt.w) * (1 - Math.exp(-dt * rate)));
    if (!pointer || this.reduced) {
      this._lastHit = null;
      towards(0, 4);
      return;
    }
    this._m.copy(this.points.matrixWorld).invert();
    this._ray.origin.copy(camera.position);
    this._ray.direction.set(pointer[0], pointer[1], 0.5).unproject(camera).sub(camera.position).normalize();
    this._ray.applyMatrix4(this._m);
    const o = this._ray.origin;
    const d = this._ray.direction;
    if (Math.abs(d.z) < 1e-4) return;
    const hit = this._w.copy(o).addScaledVector(d, -o.z / d.z);
    const b = this.shapes[this.index].box;
    const m = 0.3 * this.k;
    const inside = hit.x > b.min[0] - m && hit.x < b.max[0] + m && hit.y > b.min[1] - m && hit.y < b.max[1] + m;
    if (inside) {
      pt.x = hit.x;
      pt.y = hit.y;
      pt.z = b.max[2] * 0.5;
      towards(1, 3);
    } else towards(0, 4);
    if (clock - this.lastTrail < 0.04) return;
    const prev = this._lastHit;
    this._lastHit = inside ? hit.clone() : null;
    if (!inside || !prev) return;
    const mv = hit.clone().sub(prev);
    if (mv.lengthSq() < 0.0004 * this.k * this.k) return;
    this.lastTrail = clock;
    // Oldest slot gets the new point.
    let k = 0;
    for (let i = 0; i < TRAIL; i++) {
      if (ages[i] < 0) {
        k = i;
        break;
      }
      if (ages[i] > ages[k]) k = i;
    }
    U.uTrail.value[k].copy(hit);
    const v = mv.multiplyScalar(1 / Math.max(0.016, clock - (this._lastT || clock - 0.05)));
    v.clampLength(0, 6 * this.k).multiplyScalar(0.15 / this.k);
    U.uTrailV.value[k].copy(v);
    ages[k] = 0;
    this._lastT = clock;
  }

  /**
   * @param {object} s
   *   clock     s, this figure's own clock (runs only while the figure runs)
   *   dt        s
   *   assemble  0..1 cloud -> figure;  fade 0..1 the dots grow in
   *   motion    1, or 0 for a still (no sway, strays or trail)
   *   pointer   NDC [x, y] over the stage, or null;  camera
   *   scale     px per world unit at distance 1;  dotPx the dot's diameter in device px at `dist`
   *   dist      the camera's distance to the figure
   */
  update({ clock, dt, assemble, fade, motion, pointer, camera, scale, dotPx, dist }) {
    const U = this.U;
    U.uTime.value = clock;
    U.uMorphT.value = Math.min(99, clock - this.morphStart);
    U.uAssemble.value = assemble;
    U.uFade.value = fade;
    U.uMotion.value = this.reduced ? 0 : motion;
    U.uScale.value = scale;
    U.uSize.value = (dotPx * dist) / Math.max(1e-3, scale);
    this.points.visible = fade > 0.001;
    this.points.rotation.y = Math.sin(clock * ((2 * Math.PI) / 16)) * SWAY * motion * (this.reduced ? 0 : 1);
    this.points.updateMatrixWorld();
    this._pointer(motion && !this.reduced ? pointer : null, camera, clock, dt);
  }

  dispose() {
    this.points.removeFromParent();
    for (const d of this.disposables) d.dispose?.();
    this.disposables = [];
  }
}
