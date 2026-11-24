// Snow-loaded pines below the treeline: one InstancedMesh of stacked cones, scattered on the lower flanks
// and the valley floor by land.js's H (so each stands on the ground the GPU draws), kept off the ridge
// crest the camera walks. The snow lies on the cones' upward faces, broken up by noise.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { H, crestX } from './land.js';
import { SHARED_PARS } from './shared.js';

const VERT = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform vec3 uWind;
varying vec3 vWorld;
varying vec3 vN;
varying float vH;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  float sway = position.y * position.y * 0.004 * uMotion;
  float ph = wp.x * 0.05 + wp.z * 0.07;
  wp.x += sway * sin(uTime * 1.3 + ph) * uWind.z * 0.6;
  wp.z += sway * cos(uTime * 1.1 + ph) * uWind.z * 0.3;
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vH = position.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FRAG = /* glsl */ `
${SHARED_PARS}
varying vec3 vWorld;
varying vec3 vN;
varying float vH;
void main() {
  vec3 n = normalize(vN);
  float wrap = dot(n, normalize(uMoonDir)) * 0.5 + 0.5;
  vec3 needles = vec3(0.05, 0.09, 0.1) * (0.6 + 0.6 * wrap);
  float snow = smoothstep(0.05, 0.45, n.y + (s_noise(vWorld * 1.7) - 0.5) * 0.5);
  vec3 col = mix(needles, mix(uSnowShade, uSnowLit, wrap), snow * 0.92);
  col *= 0.75 + 0.25 * smoothstep(0.0, 8.0, vH);
  col = applyHaze(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

function pineGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6);
  trunk.translate(0, 1.2, 0);
  parts.push(trunk);
  const tiers = [
    [2.6, 3.6, 2.0],
    [2.1, 3.2, 3.9],
    [1.6, 2.8, 5.6],
    [1.05, 2.4, 7.1],
    [0.55, 1.8, 8.4],
  ];
  for (const [r, h, y] of tiers) {
    const c = new THREE.ConeGeometry(r, h, 7, 1, true);
    c.translate(0, y + h / 2, 0);
    parts.push(c);
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  for (const p of parts) p.dispose();
  g.computeVertexNormals();
  return g;
}

// A tiny seeded rng, so the forest is the same on every visit.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPines(shared, { tier }) {
  const want = tier === 'low' ? 700 : 1800;
  const r = rng(91);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const mats = [];
  let tries = 0;
  while (mats.length < want && tries < want * 5) {
    tries++;
    // denser near the path, thinning out to 4 km
    const along = 400 - r() * 5600; // z from +400 to -5200
    const side = (r() < 0.5 ? -1 : 1) * (36 + Math.pow(r(), 1.6) * 3800);
    const sNorm = Math.max(0, Math.min(1, -along / 11000));
    const x = crestX(sNorm) + side;
    const z = along;
    const h = H(x, z, 3);
    if (h > 1150 + r() * 250) continue; // the treeline, ragged
    // keep off steep faces: compare with a neighbour
    const hx = H(x + 12, z, 2);
    const hz = H(x, z + 12, 2);
    if (Math.hypot(hx - h, hz - h) / 12 > 0.75) continue;
    // a clearing round base camp so the footprints and the igloo read
    if (Math.abs(x) < 34 && z > -260 && z < 60) continue;
    const scale = 0.7 + r() * 1.5 - (h / 1300) * 0.4;
    p.set(x, h - 0.4, z);
    q.setFromAxisAngle(up, r() * Math.PI * 2);
    s.set(scale * (0.85 + r() * 0.3), scale, scale * (0.85 + r() * 0.3));
    mats.push(m.compose(p, q, s).clone());
  }
  const geo = pineGeometry();
  const mat = new THREE.ShaderMaterial({ uniforms: { ...shared, uMotion: { value: 1 } }, vertexShader: VERT, fragmentShader: FRAG });
  const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return {
    mesh,
    update(motion) {
      mat.uniforms.uMotion.value = motion;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
