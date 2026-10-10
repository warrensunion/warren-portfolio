// Ported from BTTRURSLF-v2 src/screens/intro/water.js. Only change: the constructor restores the
// renderer's clear colour after levelling the targets, because on a paper page a leaked black clear
// shows as a dark flash on the first frame or after a resize.

/**
 * The water's moving height field - madebyevan.com/webgl-water's simulation,
 * ported to three.js render targets.
 *
 * Why a simulation and not only sine waves: summed sines read as a pattern
 * within a second; a wave equation fed with small random disturbances keeps
 * making new ripples that run into each other, which is what makes Evan's
 * water look like water. The scene adds a slow analytic swell on top (the
 * sim's domain is small and tiles), and reads the same field for the
 * caustics on the underwater ice, so the light on the berg ripples with the
 * surface above it.
 *
 * One RGBA half-float texture: r height, g velocity. The domain wraps (the
 * texture repeats), so the tile has no edges to reflect from.
 */

import * as THREE from 'three';

/** World units one tile of the simulation covers, and how many world units
    of height one unit of the field is. */
export const SIM_WORLD = 22;
export const SIM_HEIGHT = 1.6;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Each disturbance is a smooth bump (half a cosine), added on the torus so a
// drop near an edge wraps round to the other side.
const DROP = /* glsl */ `
  #define MAX_DROPS 8
  uniform sampler2D uTex;
  uniform vec4 uDrops[MAX_DROPS]; // xy centre (uv), z radius (uv), w strength
  uniform int uCount;
  varying vec2 vUv;
  void main() {
    vec4 info = texture2D(uTex, vUv);
    for (int i = 0; i < MAX_DROPS; i++) {
      if (i >= uCount) break;
      vec2 d = vUv - uDrops[i].xy;
      d -= floor(d + 0.5);
      float k = max(0.0, 1.0 - length(d) / uDrops[i].z);
      info.r += (0.5 - cos(k * 3.14159265) * 0.5) * uDrops[i].w;
    }
    gl_FragColor = info;
  }
`;

// Evan's update: velocity pulled toward the neighbours' average, damped.
const UPDATE = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec2 uDelta;
  uniform float uDamp;
  varying vec2 vUv;
  void main() {
    vec4 info = texture2D(uTex, vUv);
    vec2 dx = vec2(uDelta.x, 0.0);
    vec2 dy = vec2(0.0, uDelta.y);
    float avg = (texture2D(uTex, vUv - dx).r + texture2D(uTex, vUv + dx).r +
                 texture2D(uTex, vUv - dy).r + texture2D(uTex, vUv + dy).r) * 0.25;
    info.g += (avg - info.r) * 2.0;
    info.g *= uDamp;
    info.r += info.g;
    // A slow pull back to level, so the field never drifts off zero.
    info.r *= 0.9995;
    gl_FragColor = info;
  }
`;

export class WaterSim {
  constructor(renderer, size = 128) {
    this.renderer = renderer;
    this.size = size;
    const opts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.a = new THREE.WebGLRenderTarget(size, size, opts);
    this.b = new THREE.WebGLRenderTarget(size, size, opts);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.drops = Array.from({ length: 8 }, () => new THREE.Vector4());
    this.pending = [];
    this.mDrop = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: null }, uDrops: { value: this.drops }, uCount: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: DROP,
    });
    this.mUpdate = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: null }, uDelta: { value: new THREE.Vector2(1 / size, 1 / size) }, uDamp: { value: 0.995 } },
      vertexShader: VERT,
      fragmentShader: UPDATE,
    });
    // Start level.
    const clear = new THREE.Color(0, 0, 0);
    const prev = renderer.getRenderTarget();
    const prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    for (const rt of [this.a, this.b]) {
      renderer.setRenderTarget(rt);
      renderer.setClearColor(clear, 0);
      renderer.clear(true, false, false);
    }
    renderer.setClearColor(prevColor, prevAlpha);
    renderer.setRenderTarget(prev);
  }

  get texture() {
    return this.a.texture;
  }

  /** Queue a disturbance: centre in tile uv, radius in uv, strength. */
  drop(x, y, radius, strength) {
    if (this.pending.length < 8) this.pending.push([x, y, radius, strength]);
  }

  _pass(material) {
    material.uniforms.uTex.value = this.a.texture;
    this.quad.material = material;
    this.renderer.setRenderTarget(this.b);
    this.renderer.render(this.scene, this.camera);
    [this.a, this.b] = [this.b, this.a];
  }

  /** One frame: the queued drops, then `steps` updates. */
  step(steps = 1) {
    const prev = this.renderer.getRenderTarget();
    const auto = this.renderer.autoClear;
    this.renderer.autoClear = false;
    if (this.pending.length) {
      this.pending.forEach((d, i) => this.drops[i].set(...d));
      this.mDrop.uniforms.uCount.value = this.pending.length;
      this.pending.length = 0;
      this._pass(this.mDrop);
    }
    for (let i = 0; i < steps; i++) this._pass(this.mUpdate);
    this.renderer.autoClear = auto;
    this.renderer.setRenderTarget(prev);
  }

  dispose() {
    this.a.dispose();
    this.b.dispose();
    this.quad.geometry.dispose();
    this.mDrop.dispose();
    this.mUpdate.dispose();
  }
}
