// The scene change between the mountain and the ice field, and the crack into a project: igloo.inc's
// dissolve as one post pass (the glitch strips, the colour fringe and the frost front), ported from the
// BTTRshop hub (BTTRURSLF-v2 src/screens/shop/hub/dissolve.js, Warren's own code). The shader is the hub's;
// the controller is simpler: the amount comes from the page's scroll (boot.js: full fog on the field's
// edges) or from a pulse (a click into a project), and the scroll's speed drives the strips.
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const OFF = 0.002;

const DissolveShader = {
  uniforms: {
    tDiffuse: { value: null },
    uAmount: { value: 0 }, // frost / fog 0..1
    uSplit: { value: 0 }, // the fringe 0..1 (position)
    uGlitch: { value: 0 }, // strips + mosaic 0..1 (position x speed)
    uSeed: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uCentre: { value: new THREE.Color('#c6c9d1') },
    uEdge: { value: new THREE.Color('#9fa4ae') },
    uCorner: { value: new THREE.Color('#8e94a1') },
    uPlain: { value: 0 }, // reduced motion: a plain fade
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAmount, uSplit, uGlitch, uSeed, uPlain;
    uniform vec2 uRes;
    uniform vec3 uCentre, uEdge, uCorner;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    vec3 tex(vec2 uv) { return texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb; }

    // The fog the backdrop paints (background.js), so a full dissolve is the
    // scene's own fog and never a flash.
    vec3 fog(vec2 uv) {
      vec2 q = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      float r = length(q * vec2(0.85, 1.0));
      vec3 c = mix(uCentre, uEdge, smoothstep(0.05, 0.85, r));
      return mix(c, uCorner, smoothstep(0.75, 1.25, r) * 0.7);
    }

    void main() {
      vec2 uv = vUv;
      vec3 f = fog(vUv);
      if (uPlain > 0.5) {
        gl_FragColor = vec4(mix(tex(uv), f, uAmount), 1.0);
        return;
      }
      float g = uGlitch;
      float sp = uSplit;
      float aspect = uRes.x / uRes.y;
      vec2 pxl = uv * uRes;
      float fogL = luma(f);

      // ── strips: rows 15-45 px tall, each cut into runs; a share of them
      // (growing with g) shifts sideways by up to 6 % of the width. Only
      // where there is something other than fog: displacing fog onto fog
      // shows nothing but the backdrop's dots as blocky ghosts.
      float rowH = mix(15.0, 45.0, hash(vec2(floor(pxl.y / 30.0), uSeed)));
      float row = floor(pxl.y / rowH);
      float runs = 2.0 + floor(hash(vec2(row, uSeed + 3.1)) * 3.0);
      float run = floor((uv.x + hash(vec2(row, uSeed + 7.7))) * runs);
      vec2 cell = vec2(run, row);
      float on = step(hash(cell + uSeed * 1.37), g * 0.5);
      float shift = (hash(cell + uSeed * 2.11 + 5.0) - 0.5) * 2.0 * 0.06 * g * on;
      if (shift != 0.0) {
        vec2 suv = uv + vec2(shift, 0.0);
        float solid = max(abs(luma(tex(uv)) - fogL), abs(luma(tex(suv)) - fogL));
        if (solid > 0.035) uv = suv;
      }

      // ── mosaic: cells over the subject snap to square blocks, 8 -> 22 px.
      float bs = 0.0;
      if (g > 0.06 && hash(cell + uSeed * 0.73 + 9.0) < g * 0.8) {
        float s = mix(8.0, 22.0, g);
        vec2 muv = (floor(uv * uRes / s) + 0.5) * s / uRes;
        if (abs(luma(tex(muv)) - fogL) > 0.035) {
          uv = muv;
          bs = s;
        }
      }

      // ── fringe: a smear along a radial + horizontal direction (continuous
      // in x - no flip at the centre line), 2.5 % of the width at the
      // corners at sp = 1, ~1 % at a subject near the middle.
      vec2 d = uv - 0.5;
      vec2 dir = d * vec2(1.25 + 0.7, 1.25 / aspect);
      vec2 off = dir * 0.025 * pow(sp, 0.5);
      off.y *= aspect;
      if (bs > 0.0) off *= 0.3; // a mosaic block stays the scene's own grey
      float j = hash(floor(gl_FragCoord.xy)); // fixed per pixel: no shimmer when parked
      vec3 mid = tex(uv);
      vec3 acc = vec3(0.0);
      float lin = 0.0, lout = 0.0;
      for (int i = 0; i < 12; i++) {
        float t = (float(i) + j) / 12.0 * 2.0 - 1.0;
        vec3 s = tex(uv + off * t);
        acc += s;
        if (t < 0.0) lin += luma(s); else lout += luma(s);
      }
      vec3 smear = acc / 12.0;
      // The colour band is wider and softer than the smear (igloo: 15-25 px
      // of orange fading out): its sides are read 3.5x further out.
      lin = 0.0;
      lout = 0.0;
      for (int i = 0; i < 6; i++) {
        float t = (float(i) + j) / 6.0;
        float wt = 1.0 - t * 0.6;
        lin += luma(tex(uv - off * 3.5 * t)) * wt;
        lout += luma(tex(uv + off * 3.5 * t)) * wt;
      }
      lin /= 4.2;
      lout /= 4.2;
      float lmid = luma(mid);
      // The silhouette: one side of the edge is fog. Interior edges (ice on
      // ice) get the smear but no colour.
      float far = luma(tex(uv + off * 3.5));
      float sil = 1.0 - smoothstep(0.03, 0.09, min(abs(far - fogL), abs(lmid - fogL)));
      // Bright side of the edge (outside a block on fog) warm, dark side
      // cold; strength from the broad step across the band (lin vs lout), so
      // a thin bright line (the wire-mesh) averages out and stays white.
      float side = lmid - 0.5 * (lin + lout);
      float edgeStep = abs(lout - lin);
      vec3 warm = vec3(1.0, 0.55, 0.18);
      vec3 cold = vec3(0.25, 0.55, 1.0);
      vec3 tint = side > 0.0 ? warm - luma(warm) : cold - luma(cold);
      // a contrast floor: the backdrop's own soft blobs never pick up a tint
      // ... and soft: strongest at the edge, fading across the band.
      float near = clamp(abs(side) / max(edgeStep, 1e-3) * 2.0, 0.0, 1.0);
      float k = smoothstep(0.04, 0.12, edgeStep) * sil * near * near * (side > 0.0 ? 0.75 : 0.45);
      vec3 col = mix(mid, smear, clamp(sp * 1.5, 0.0, 0.85));
      col = max(vec3(0.0), col + tint * k * pow(sp, 0.5) * (bs > 0.0 ? 0.3 : 1.0));
      if (bs > 0.0) col = mix(col, vec3(luma(col)), 0.5);

      // ── frost: the image lifts toward the fog, then a front climbs from
      // the bottom and in from the sides, the top last, broken into
      // crystalline lumps. pow: it reaches the middle of the screen only
      // late (a ~0.8), as igloo's fog reaches the igloo only at the end.
      float a = uAmount;
      col = mix(col, f, a * a * 0.3);
      float sideE = min(vUv.x, 1.0 - vUv.x);
      float edge = min(min(sideE, vUv.y * 0.6), (1.0 - vUv.y) * 1.6);
      vec2 cp = floor(pxl / mix(6.0, 16.0, a));
      float crystal = noise(vUv * vec2(aspect, 1.0) * 6.0) * 0.6 + hash(cp) * 0.15 + noise(pxl / 40.0) * 0.25;
      float front = pow(a, 2.2) * 0.64 - edge - (crystal - 0.5) * 0.24;
      float m = smoothstep(-0.04, 0.06, front);
      if (a >= 0.999) m = 1.0;
      float rim = smoothstep(0.0, 0.05, front) * (1.0 - smoothstep(0.05, 0.16, front));
      vec3 wash = mix(f, vec3(1.0), 0.1 * (1.0 - a));
      col = mix(col, wash, m);
      col += rim * 0.06 * (1.0 - a);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};


export class Dissolve {
  constructor({ reduced = false, dpr = 1, colors }) {
    this.reduced = reduced;
    this.dpr = dpr;
    this.pass = new ShaderPass(DissolveShader);
    this.pass.enabled = false;
    this.u = this.pass.uniforms;
    this.u.uPlain.value = reduced ? 1 : 0;
    this.u.uCentre.value.set(colors.centre);
    this.u.uEdge.value.set(colors.edge);
    this.u.uCorner.value.set(colors.corner);
    this.pulses = [];
    this.seed = 0;
    this.value = 0;
  }

  /** A timed amount on frame time (a click into a project): from -> to over ms, after delay. */
  pulse({ from = 0, to = 1, ms = 500, delay = 0, glitch = 0, onDone = null }) {
    if (this.reduced) ms = Math.min(ms, 300);
    this.pulses.push({ from, to, ms, delay, glitch, onDone, t: 0 });
  }

  get busy() {
    return this.pulses.length > 0;
  }

  /** amount: the scroll's fog (0..1); speed: scroll px/s; dt: s; w, h: CSS px. */
  update({ amount, speed, dt, w, h, motion }) {
    let a = amount;
    let split = a < 0.5 ? a * 1.3 : a * 0.6;
    let pulseGlitch = 0;
    const step = Math.min(dt, 1 / 30) * 1000;
    for (const p of this.pulses) p.t += step;
    for (const p of this.pulses) if (p.t >= p.delay + p.ms && !p.done) {
      p.done = true;
      p.onDone?.();
    }
    for (const p of this.pulses) {
      if (p.t < p.delay) continue;
      const k = ease(clamp01((p.t - p.delay) / p.ms));
      const v = p.from + (p.to - p.from) * k;
      if (v > a) {
        a = v;
        split = v * (p.to < p.from ? 0.35 : 1);
      }
      if (p.glitch) pulseGlitch = Math.max(pulseGlitch, p.glitch * Math.sin(Math.PI * Math.min(1, v * 1.15)));
    }
    // a pulse that ended at full fog holds it until the next pulse takes over
    this.pulses = this.pulses.filter((p) => !(p.done && !(p.to >= 1 && this.pulses.at(-1) === p)));
    const moving = clamp01(speed / 450);
    const speedTerm = motion ? Math.sqrt(clamp01((speed - 250) / 2750)) * 0.35 : 0;
    let glitch = Math.max(split * (0.12 + 0.88 * moving), speedTerm * (amount > 0.01 ? 1 : 0), pulseGlitch);
    if (this.reduced || !motion) {
      glitch = 0;
      split = 0;
    }
    this.seed += dt * Math.max(moving, pulseGlitch > 0 ? 1 : 0) * 1000;
    this.value = a;
    this.u.uAmount.value = a;
    this.u.uSplit.value = split;
    this.u.uGlitch.value = glitch;
    this.u.uSeed.value = Math.floor(this.seed / 60) % 997;
    this.u.uRes.value.set(Math.max(1, w * this.dpr), Math.max(1, h * this.dpr));
    this.pass.enabled = a > OFF || glitch > OFF || split > OFF;
  }

  dispose() {
    this.pass.dispose();
  }
}
