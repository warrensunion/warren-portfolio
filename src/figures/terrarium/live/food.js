// Ported from terrarium src/live/food.js at 7612a40 (Warren's own project). Changes: none but this header.
/**
 * Food is what the creatures are seen to want, so it has to be found by the
 * eye instantly: lichen-yellow seeds that glow, each with a soft additive halo
 * that breathes. The pool is up to 900 pellets and arrives fresh every frame
 * (x, y, amount), so this is two instanced draws and a straight copy.
 */
import * as THREE from 'three';
import { WORLD_R, LIGHT_GLSL, lightUniforms, PALETTE } from './look.js';
import { heightAt } from './terrain.js';

const seedVert = /* glsl */ `
attribute vec4 aP; // xyz, size
attribute float aSeed;
varying vec3 vPos; varying vec3 vN; varying float vSeed;
void main() {
  float a = aSeed * 6.28;
  vec3 q = position * vec3(0.75, 0.6, 1.15) * aP.w;
  q = vec3(cos(a) * q.x - sin(a) * q.z, q.y, sin(a) * q.x + cos(a) * q.z);
  vPos = aP.xyz + q; vN = normal; vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;
const seedFrag = /* glsl */ `
${LIGHT_GLSL}
uniform vec3 uLichen;
varying vec3 vPos; varying vec3 vN; varying float vSeed;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vPos);
  vec3 c = lvGouache(uLichen, N, V, 1.0, 1.0);
  float pulse = 0.75 + 0.25 * sin(uTime * 2.2 + vSeed * 40.0);
  c += uLichen * 0.9 * pulse; // it glows from inside
  gl_FragColor = vec4(c, 1.0);
}`;
const haloVert = /* glsl */ `
attribute vec4 aP; attribute float aSeed;
uniform float uTime;
varying vec2 vUv; varying float vA;
void main() {
  vUv = position.xy;
  float pulse = 0.8 + 0.2 * sin(uTime * 2.2 + aSeed * 40.0);
  vec4 mv = viewMatrix * vec4(aP.xyz, 1.0);
  mv.xy += position.xy * aP.w * 5.5 * pulse;
  vA = pulse;
  gl_Position = projectionMatrix * mv;
}`;
const haloFrag = /* glsl */ `
uniform vec3 uLichen;
varying vec2 vUv; varying float vA;
void main() {
  float d = length(vUv);
  float g = exp(-d * d * 5.0) * smoothstep(1.0, 0.6, d);
  gl_FragColor = vec4(uLichen * g * 0.35 * vA, 1.0);
}`;

export function createFood(scene, { max = 900 } = {}) {
  const mk = (geo) => {
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = geo.index;
    ig.setAttribute('position', geo.attributes.position);
    if (geo.attributes.normal) ig.setAttribute('normal', geo.attributes.normal);
    ig.instanceCount = 0;
    return ig;
  };
  const p = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const sd = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
  const seedGeo = mk(new THREE.IcosahedronGeometry(1, 1));
  const haloGeo = mk(new THREE.PlaneGeometry(2, 2));
  for (const g of [seedGeo, haloGeo]) { g.setAttribute('aP', p); g.setAttribute('aSeed', sd); }
  const lichen = { value: PALETTE.lichen.clone() };
  const seeds = new THREE.Mesh(seedGeo, new THREE.ShaderMaterial({ uniforms: { ...lightUniforms, uLichen: lichen }, vertexShader: seedVert, fragmentShader: seedFrag }));
  const halos = new THREE.Mesh(haloGeo, new THREE.ShaderMaterial({
    uniforms: { uTime: lightUniforms.uTime, uLichen: lichen }, vertexShader: haloVert, fragmentShader: haloFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  seeds.frustumCulled = halos.frustumCulled = false;
  halos.renderOrder = 10;
  const group = new THREE.Group();
  group.name = 'lv-food';
  group.add(seeds, halos);
  scene.add(group);

  let last = null;
  return {
    group,
    /** @param {Float32Array} food x, y, amount per pellet (amount ≤ 0 = empty slot) */
    update(food) {
      if (!food || food === last) return;
      last = food;
      const a = p.array, s = sd.array;
      let n = 0;
      for (let i = 0; i + 3 <= food.length && n < max; i += 3) {
        const amt = food[i + 2];
        if (!(amt > 0)) continue;
        const x = food[i], y = food[i + 1];
        const k = n * 4;
        const size = 0.035 * (0.55 + 0.45 * Math.min(1, amt));
        a[k] = x * WORLD_R; a[k + 1] = heightAt(x, y) + size * 0.7; a[k + 2] = y * WORLD_R; a[k + 3] = size;
        s[n] = ((x * 73.13 + y * 19.7) % 1 + 1) % 1;
        n++;
      }
      seedGeo.instanceCount = haloGeo.instanceCount = n;
      p.clearUpdateRanges(); p.addUpdateRange(0, n * 4); p.needsUpdate = true;
      sd.clearUpdateRanges(); sd.addUpdateRange(0, n); sd.needsUpdate = true;
    },
    dispose() {
      scene.remove(group);
      for (const m of [seeds, halos]) { m.geometry.dispose(); m.material.dispose(); }
    },
  };
}
