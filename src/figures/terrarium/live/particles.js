// Ported from terrarium src/live/particles.js at 7612a40 (Warren's own project). Changes: none but this header.
/**
 * Spores drifting in the jar's air: the thing that makes the glass read as a
 * volume and the light as a shaft. They are fully animated on the GPU (drift
 * and wrap are a function of time), so they cost one draw and zero CPU.
 * Most are warm dust motes that only show in the window light; a few are
 * spore-cyan glints, the palette's "only ever lit" colour.
 */
import * as THREE from 'three';
import { JAR_R, lightUniforms, PALETTE } from './look.js';

const vert = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime, uPx, uMotion;
uniform vec3 uKeyDir;
varying float vA; varying float vCyan;
void main() {
  float t = uTime * uMotion;
  float h = 7.2;
  float y = mod(aSeed.y * h + t * (0.05 + 0.08 * aSeed.w), h) - 0.2;
  float a = aSeed.x * 6.2832 + sin(t * 0.07 + aSeed.z * 9.0) * 0.4;
  float r = sqrt(aSeed.z) * ${(JAR_R - 0.35).toFixed(2)} * (y > 5.0 ? mix(1.0, 0.66, smoothstep(5.0, 6.4, y)) : 1.0);
  vec3 p = vec3(cos(a) * r, y, sin(a) * r);
  p.x += sin(t * 0.31 + aSeed.w * 20.0) * 0.12;
  p.z += cos(t * 0.27 + aSeed.x * 20.0) * 0.12;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vCyan = step(0.93, aSeed.w);
  // lit by the shaft: brighter toward the upper-left window
  float shaft = smoothstep(-6.0, 4.0, dot(p, normalize(vec3(-uKeyDir.x, 0.0, -uKeyDir.z)) * -1.0) + y * 0.3);
  float fade = smoothstep(-0.2, 0.6, y) * smoothstep(7.0, 6.0, y);
  vA = fade * mix(0.25 + 0.75 * shaft, 1.0, vCyan) * (0.6 + 0.4 * sin(t * 1.7 + aSeed.x * 50.0));
  // clamped so a spore drifting past the lens stays a mote, not a bubble
  gl_PointSize = min(uPx * 0.35, uPx * (0.6 + 1.4 * aSeed.w + vCyan * 1.2) / max(-mv.z, 0.05)); // (no divide by ~0 at the lens)
}`;
const frag = /* glsl */ `
uniform vec3 uWarm, uCyan;
varying float vA; varying float vCyan;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q) * 2.0;
  float g = exp(-d * d * 4.0) * smoothstep(1.0, 0.7, d);
  vec3 c = mix(uWarm * 0.5, uCyan * 1.4, vCyan);
  gl_FragColor = vec4(c * g * vA, 1.0);
}`;

export function createParticles(scene, { count = 700 } = {}) {
  const geo = new THREE.BufferGeometry();
  const seed = new Float32Array(count * 4);
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < seed.length; i++) seed[i] = rnd();
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const uniforms = {
    uTime: lightUniforms.uTime, uKeyDir: lightUniforms.uKeyDir,
    uPx: { value: 60 }, uMotion: { value: 1 },
    uWarm: { value: PALETTE.highlight.clone() }, uCyan: { value: PALETTE.cyan.clone() },
  };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  pts.frustumCulled = false;
  pts.renderOrder = 11;
  pts.name = 'lv-spores';
  scene.add(pts);
  return {
    points: pts,
    /** point size scales with the drawing-buffer height so spores look the same on any screen */
    setSize(h) { uniforms.uPx.value = h * 0.045; },
    /** reduced motion: spores hang almost still */
    setReducedMotion(v) { uniforms.uMotion.value = v ? 0.15 : 1; },
    dispose() { scene.remove(pts); geo.dispose(); pts.material.dispose(); },
  };
}
