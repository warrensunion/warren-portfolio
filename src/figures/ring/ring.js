// Ported from BTTRURSLF-v2 src/screens/shop/hub/ring.js: the shattered stone ring that assembles and
// ignites (igloo.inc's portal). Kept: the swept OUTER and INNER segments, their stone material with the
// inner-wall glow, the far-side-first fly-in on curved paths with a hair of overshoot, the dust puff as
// each piece locks, the glow's "thin line, then the swell" curve, the rim band, the geodesic lines and
// the sparkles.
// Changed, and why:
//  - Driven by time, not scroll px: `asm` 0..1 and `ign` 0..1 come from figure.js (1.6 s, then 1.2 s),
//    because this figure sits at the end of a page, not inside a scroll timeline.
//  - No B logo, no dive, deeper rings, pedestal, particle cloud, core sprite or streaks: those are the
//    BTTRshop brand and the hub's hand-off to its tube. The particles here are tube.js's figure.
//  - Re-lit for a light paper page. The hub's ignite was HDR light pushed through a raised clamp and
//    bloom with additive blending, which adds nothing visible to #fbfbf8. Here the inner wall's emissive
//    is the accent #1f5f78 (and the stone under it leans toward it), and the band, the lines, the
//    sparkles and the dust are normal-blended ink and accent with alpha. No bloom, no clamp, no mist.
//  - The ring faces the camera (XY plane) instead of lying flat under a falling camera.
import * as THREE from 'three';
import { ringPiecesIter, geodesicLines } from './ringGeometry.js';
import { rng } from './noise.js';
import { stoneMaps } from './textures.js';

const OUTER = { count: 10, r0: 2.3, r1: 3.0, depth: 0.62, gap: 0.02, seed: 7, chip: 0.028, phase: 0.31 };
const INNER = { count: 6, r0: 1.42, r1: 1.72, depth: 0.3, gap: 0.12, seed: 13, chip: 0.02, phase: 0.2, glow: false };
export const RING_R = 3.0; // the outer ring's outside radius (framing)
export const INNER_R = INNER.r0; // the particles stand inside this
const RIM_R = 2.29; // where the band burns: just inside the outer ring's inner wall
const SPHERE_R = 2.24;
const DUST_PER = 40;

// Paper palette (spec 3) as display (sRGB) values for the ShaderMaterials, which write their colour
// straight to the screen; the stone's MeshStandardMaterial takes THREE.Colors and converts itself.
export const SRGB = {
  ink: [0x17 / 255, 0x19 / 255, 0x1c / 255],
  accent: [0x1f / 255, 0x5f / 255, 0x78 / 255],
  plate: [0xfb / 255, 0xfb / 255, 0xf8 / 255],
};
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => x * x * (3 - 2 * x);
const easeOut3 = (x) => 1 - Math.pow(1 - x, 3);
const easeOut4 = (x) => 1 - Math.pow(1 - x, 4);
const easeOutBack = (x, c = 0.9) => 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
export const smooth = (e0, e1, x) => ease(clamp01((x - e0) / (e1 - e0)));

/** The hub's glow curve: a thin line first, then the swell (igloo 18.2 -> 18.9 s). */
export const glowOf = (ign) => 0.18 * smooth(0.0, 0.3, ign) + 0.82 * smooth(0.25, 0.85, ign);

/* ---- shaders --------------------------------------------------------------------- */

const NOISE = /* glsl */ `
  float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
  float vn(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p) { return 0.5 * vn(p) + 0.3 * vn(p * 2.03) + 0.2 * vn(p * 4.1); }
`;

const BAND_VERT = /* glsl */ `
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// The hub's band profile (a hard core on the rim, a soft fall inward and a short one outward, wobbling
// round the ring), as ink-and-accent coverage on paper instead of added light.
const BAND_FRAG = /* glsl */ `
  uniform float uGlow; uniform float uTime; uniform float uRim; uniform vec3 uAccent; uniform vec3 uInk;
  varying vec2 vP;
  ${NOISE}
  void main() {
    float r = length(vP);
    float a = atan(vP.y, vP.x);
    float d = r - uRim;
    float core = exp(-pow(d / 0.024, 2.0));
    float inner = exp(-max(0.0, -d) / 0.11) * step(d, 0.0);
    float outer = exp(-max(0.0, d) / 0.045) * step(0.0, d);
    float wob = 0.72 + 0.28 * vn(vec3(cos(a) * 2.5, sin(a) * 2.5, uTime * 0.25));
    float hot = 0.85 + 0.6 * pow(vn(vec3(cos(a) * 1.3 + 4.0, sin(a) * 1.3, 1.0)), 3.0);
    float k = uGlow * wob * hot;
    float alpha = clamp(k * (core * 0.95 + (inner + outer) * 0.3), 0.0, 0.92);
    gl_FragColor = vec4(mix(uAccent, uInk, core * 0.45), alpha);
  }`;

const LINES_VERT = /* glsl */ `
  varying float vFace; varying vec3 vP;
  void main() {
    vP = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normalize(position));
    vFace = dot(n, normalize(-mv.xyz));
    gl_Position = projectionMatrix * mv;
  }`;
// Strongest at the sphere's silhouette, nearly gone where it faces the camera (over the particles).
const LINES_FRAG = /* glsl */ `
  uniform float uMist; uniform vec3 uInk;
  varying float vFace; varying vec3 vP;
  ${NOISE}
  void main() {
    if (vFace < 0.0) discard;
    float mask = smoothstep(0.5, 0.68, fbm3(vP * 1.7 + 3.0));
    float edge = pow(1.0 - vFace, 1.1);
    float a = uMist * mask * (0.02 + 0.98 * edge * edge) * 0.32;
    gl_FragColor = vec4(uInk, a);
  }`;

const POINTS_VERT = /* glsl */ `
  attribute float aSize; attribute float aPhase;
  uniform float uScale; uniform float uTime; uniform float uMotion;
  varying float vTw;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vTw = 0.65 + 0.35 * sin(uTime * (1.5 + aPhase) + aPhase * 6.28) * uMotion;
    gl_PointSize = aSize * uScale / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const POINTS_FRAG = /* glsl */ `
  uniform float uAmount; uniform vec3 uColor;
  varying float vTw;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = dot(q, q) * 4.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(uColor, uAmount * vTw * (1.0 - d * d));
  }`;

const DUST_VERT = /* glsl */ `
  attribute vec3 aDir; attribute float aPiece; attribute float aRand;
  uniform float uAge[16]; uniform float uScale;
  varying float vA;
  void main() {
    float age = uAge[int(aPiece + 0.5)];
    vec3 p = position + aDir * (0.04 + 0.55 * sqrt(max(age, 0.0))) + vec3(0.0, 0.0, -0.25 * age * age);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float on = step(0.0001, age) * step(age, 0.9999);
    vA = on * pow(1.0 - age, 2.0);
    gl_PointSize = on * (0.5 + aRand * 1.0) * uScale / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const DUST_FRAG = /* glsl */ `
  uniform vec3 uInk;
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = dot(q, q) * 4.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(uInk, vA * (1.0 - d) * 0.3);
  }`;

/* ---- the geometry, once per session ------------------------------------------------ */

// The swept pieces and the lines are ~150 ms of main thread (hub measurement). They are made once and
// every Ring takes clones (its own GPU buffers, disposed with it), so a ring made again after the page
// scrolled away and back builds nothing.
let GEO = null;
function ringGeo() {
  if (!GEO) GEO = { outer: [...ringPiecesIter(OUTER)], inner: [...ringPiecesIter(INNER)], lines: geodesicLines(SPHERE_R * 1.004, 15) };
  return GEO;
}
/**
 * Builds the shared pieces ahead of new Ring(), a few pieces per task (yield() resolves on a fresh
 * task), so the ~150 ms lands in slices while the visitor reads instead of in the constructor's one
 * task. A no-op once built; stops early (leaving GEO unbuilt) when isLive() turns false.
 */
export async function prepareRingGeo(yieldTask, isLive = () => true, per = 4) {
  if (GEO) return;
  const take = async (opts) => {
    const out = [];
    for (const p of ringPiecesIter(opts)) {
      out.push(p);
      if (out.length % per === 0) {
        await yieldTask();
        if (!isLive()) return null;
      }
    }
    return out;
  };
  const outer = await take(OUTER);
  if (!outer) return;
  const inner = await take(INNER);
  if (!inner) return;
  await yieldTask();
  if (!isLive() || GEO) return;
  GEO = { outer, inner, lines: geodesicLines(SPHERE_R * 1.004, 15) };
}
const clones = (list) => list.map((p) => ({ ...p, geometry: p.geometry.clone() }));

/* ---- the ring ---------------------------------------------------------------------- */

export class Ring {
  /**
   * @param {object} o
   *   stone   noise.js stoneData bytes ({ size, normal, rough })
   *   env     the environment texture (PMREM), or null
   */
  constructor({ stone, env }) {
    this.disposables = [];
    this.root = new THREE.Group();
    this.root.name = 'ring';

    // Light: the hub's low key from the upper left and a cool fill, plus a sky light the hub's dark
    // fog did not need: on paper the stone's shadow side would otherwise go near black.
    const key = new THREE.DirectionalLight('#fffaf3', 2.3);
    key.position.set(-6, 5.5, 4.2);
    const fill = new THREE.DirectionalLight('#dbe3ee', 0.6);
    fill.position.set(6, -3.5, 3);
    const sky = new THREE.HemisphereLight('#ffffff', '#a9aeb4', 1.0);
    this.root.add(key, fill, sky);

    const maps = stoneMaps(stone);
    this.disposables.push(maps.roughness, maps.normal);
    this.uGlow = { value: 0 };
    const uAccentLin = { value: new THREE.Color('#1f5f78') };
    const ringMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#a3a8b0'), // the hub's #8893a4 slate, lifted for paper
      roughness: 1,
      roughnessMap: maps.roughness,
      metalness: 0,
      normalMap: maps.normal,
      normalScale: new THREE.Vector2(0.75, 0.75),
      envMap: env || null,
      envMapIntensity: 0.3,
      vertexColors: true,
    });
    ringMat.onBeforeCompile = (sh) => {
      sh.uniforms.uGlow = this.uGlow;
      sh.uniforms.uGlowCol = uAccentLin;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aRim;\nvarying float vRim;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRim = aRim;');
      // The lit inner wall: the stone leans to the accent and the accent glows on it (the hub's
      // white emissive, uGlowCol * uGlow * vRim^3 * 1.1, would be invisible on a light page).
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGlow;\nuniform vec3 uGlowCol;\nvarying float vRim;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uGlowCol, clamp(uGlow * vRim * vRim * 0.85, 0.0, 1.0));')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlowCol * uGlow * (vRim * vRim * vRim * 1.6);');
    };
    ringMat.customProgramCacheKey = () => 'portfolio-ring-stone';
    this.disposables.push(ringMat);

    const rand = rng(77);
    this.pieces = [];
    const addPieces = (list, kind) => {
      // Far side (+Y, the top of the stage) arrives first.
      const order = list.map((p, i) => [i, p.home.y]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
      list.forEach((p, i) => {
        const mesh = new THREE.Mesh(p.geometry, ringMat);
        mesh.position.copy(p.home);
        mesh.visible = false;
        this.root.add(mesh);
        this.disposables.push(p.geometry);
        const rank = order.indexOf(i) / Math.max(1, list.length - 1);
        // The hub's timings stretched to fill asm 0..1 now that the B (which closed it) is gone.
        const s = kind === 'outer' ? rank * 0.34 : 0.3 + rank * 0.4;
        const d = kind === 'outer' ? 0.38 : 0.3;
        const radial = new THREE.Vector3(p.home.x, p.home.y, 0).normalize();
        const far = kind === 'outer' ? 1.4 : 2.2;
        const start = p.home
          .clone()
          .addScaledVector(radial, far + rand() * (kind === 'outer' ? 1.2 : 2.5))
          .add(new THREE.Vector3((rand() - 0.5) * 1.2, (rand() - 0.5) * 1.0, -(kind === 'outer' ? 2 + rand() * 2.5 : 4 + rand() * 4.5)));
        const ctrl = start.clone().lerp(p.home, 0.55).addScaledVector(radial, 1.4 + rand()).add(new THREE.Vector3(0, 0, 1.2));
        const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
        const q0 = new THREE.Quaternion().setFromAxisAngle(axis, (1.3 + rand() * 1.4) * (rand() < 0.5 ? -1 : 1));
        this.pieces.push({ mesh, kind, home: p.home.clone(), start, ctrl, q0, s, d, ends: p.ends, index: this.pieces.length });
      });
    };
    const geo = ringGeo();
    addPieces(clones(geo.outer), 'outer');
    addPieces(clones(geo.inner), 'inner');

    /* the band on the rim */
    this.bandU = {
      uGlow: { value: 0 },
      uTime: { value: 0 },
      uRim: { value: RIM_R },
      uAccent: { value: v3(SRGB.accent) },
      uInk: { value: v3(SRGB.ink) },
    };
    const bandMat = new THREE.ShaderMaterial({ uniforms: this.bandU, vertexShader: BAND_VERT, fragmentShader: BAND_FRAG, transparent: true, depthWrite: false });
    const bandGeo = new THREE.RingGeometry(1.55, 2.62, 160, 1);
    this.disposables.push(bandMat, bandGeo);
    this.band = new THREE.Mesh(bandGeo, bandMat);
    this.band.position.z = 0.06;
    this.band.renderOrder = 2;
    this.root.add(this.band);

    /* the geodesic lines (the hub's misty sphere is gone: a grey wash would muddy the particles) */
    this.linesU = { uMist: { value: 0 }, uInk: { value: v3(SRGB.ink) } };
    const lineGeo = geo.lines.clone();
    const lineMat = new THREE.ShaderMaterial({ uniforms: this.linesU, vertexShader: LINES_VERT, fragmentShader: LINES_FRAG, transparent: true, depthWrite: false });
    this.lines = new THREE.LineSegments(lineGeo, lineMat);
    this.lines.renderOrder = 4;
    this.root.add(this.lines);
    this.disposables.push(lineGeo, lineMat);

    /* sparkles on the sphere's near half, outside the particles' circle */
    {
      const ico = new THREE.IcosahedronGeometry(SPHERE_R * 1.01, 2);
      const src = ico.attributes.position.array;
      const pts = [];
      const seen = new Set();
      for (let i = 0; i < src.length; i += 3) {
        const k = `${src[i].toFixed(3)},${src[i + 1].toFixed(3)},${src[i + 2].toFixed(3)}`;
        if (seen.has(k) || src[i + 2] < 0.2 || Math.hypot(src[i], src[i + 1]) < 1.55 || rand() > 0.42) continue;
        seen.add(k);
        pts.push(src[i], src[i + 1], src[i + 2]);
      }
      ico.dispose();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const n = pts.length / 3;
      g.setAttribute('aSize', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => 3 + rand() * 4), 1));
      g.setAttribute('aPhase', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => rand()), 1));
      this.sparkU = { uScale: { value: 1 }, uTime: this.bandU.uTime, uMotion: { value: 1 }, uAmount: { value: 0 }, uColor: { value: v3(SRGB.accent) } };
      const m = new THREE.ShaderMaterial({ uniforms: this.sparkU, vertexShader: POINTS_VERT, fragmentShader: POINTS_FRAG, transparent: true, depthWrite: false });
      this.sparks = new THREE.Points(g, m);
      this.sparks.renderOrder = 5;
      this.root.add(this.sparks);
      this.disposables.push(g, m);
    }

    /* dust where each piece locks */
    {
      const n = this.pieces.length * DUST_PER;
      const pos = new Float32Array(n * 3);
      const dir = new Float32Array(n * 3);
      const piece = new Float32Array(n);
      const r = new Float32Array(n);
      let k = 0;
      for (const p of this.pieces) {
        for (let j = 0; j < DUST_PER; j++) {
          const e = p.ends[j % p.ends.length];
          pos[k * 3] = e.x + (rand() - 0.5) * 0.25;
          pos[k * 3 + 1] = e.y + (rand() - 0.5) * 0.25;
          pos[k * 3 + 2] = (rand() - 0.5) * 0.3;
          const v = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() * 0.8).normalize();
          dir[k * 3] = v.x;
          dir[k * 3 + 1] = v.y;
          dir[k * 3 + 2] = v.z;
          piece[k] = p.index;
          r[k] = rand();
          k++;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
      g.setAttribute('aPiece', new THREE.BufferAttribute(piece, 1));
      g.setAttribute('aRand', new THREE.BufferAttribute(r, 1));
      this.dustU = { uAge: { value: new Array(16).fill(0) }, uScale: { value: 1 }, uInk: { value: v3(SRGB.ink) } };
      const m = new THREE.ShaderMaterial({ uniforms: this.dustU, vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, transparent: true, depthWrite: false });
      this.dust = new THREE.Points(g, m);
      this.dust.frustumCulled = false;
      this.dust.renderOrder = 7;
      this.root.add(this.dust);
      this.disposables.push(g, m);
    }

    this._qi = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  /**
   * @param {object} s
   *   asm, ign  0..1 each (figure.js drives them by time)
   *   asmU      asm before clamping (keeps running past 1, so the last pieces finish their dust)
   *   time      s (the band's wobble and the breathing)
   *   motion    1, or 0 for a still (poster state): no breathing, no wobble, no dust
   *   scale     px per world unit at distance 1 (dpr * h / (2 tan(fov / 2)))
   *   lines     the geodesic lines' strength (lighter on a phone-size stage, where they crowd)
   */
  update({ asm, asmU = asm, ign, time, motion, scale, lines = 1 }) {
    const breath = 1 + 0.06 * Math.sin(time * 1.7) * motion * smooth(0.9, 1, ign);
    const glow = glowOf(ign) * breath;
    this.uGlow.value = glow;
    this.bandU.uGlow.value = glow;
    this.bandU.uTime.value = time * motion;
    this.band.visible = glow > 0.002;
    this.linesU.uMist.value = smooth(0.3, 0.9, ign) * lines;
    this.lines.visible = this.linesU.uMist.value > 0.002;
    this.sparkU.uAmount.value = smooth(0.5, 1, ign) * 0.75;
    this.sparkU.uMotion.value = motion;
    this.sparks.visible = this.sparkU.uAmount.value > 0.002;
    this.sparkU.uScale.value = scale * 0.006;
    this.dustU.uScale.value = scale * 0.02;

    const ages = this.dustU.uAge.value;
    for (const p of this.pieces) {
      const t = clamp01((asm - p.s) / p.d);
      const m = p.mesh;
      if (t <= 0) {
        m.visible = false;
        ages[p.index] = 0;
        continue;
      }
      m.visible = true;
      // Curved path (quadratic Bezier), easing into its lock with a hair of overshoot.
      const k = easeOutBack(easeOut3(t), 0.6);
      const u = Math.min(1, k);
      const a = this._a.copy(p.start).lerp(p.ctrl, u);
      const b = this._b.copy(p.ctrl).lerp(p.home, u);
      m.position.copy(a.lerp(b, u));
      if (k > 1) m.position.copy(p.home).addScaledVector(this._v.copy(p.home).sub(p.ctrl).normalize(), (k - 1) * 0.6);
      m.quaternion.slerpQuaternions(p.q0, this._qi, easeOut4(t));
      // Dust: an age 0..1 just after the lock.
      ages[p.index] = motion ? clamp01((asmU - (p.s + p.d * 0.9)) / 0.16) : 0;
      if (ages[p.index] >= 1) ages[p.index] = 0;
    }
    this.dust.visible = motion > 0 && asmU < 1.3;
  }

  dispose() {
    this.root.removeFromParent();
    for (const d of this.disposables) d.dispose?.();
    this.disposables = [];
  }
}
