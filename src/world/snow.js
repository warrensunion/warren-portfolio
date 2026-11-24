// GPU snow: tens of thousands of instanced, camera-facing flakes in three depth layers (near: big, soft
// and few; mid; far: fine and many), each layer wrapped in its own box round the camera so the fall never
// runs out. All motion is in the vertex shader from time: the fall, a sway, the wind for this altitude,
// gust fronts that sweep across, the cursor's wind (flakes part and swirl round the pointer's ray) and the
// avalanche burst on a fast fling. Nothing per flake runs on the CPU.
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec4 aSeed;   // xyz position in the box (0..1), w: density cut
attribute vec2 aParam;  // size, layer (0 near, 1 mid, 2 far)
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uWindV;    // m/s, world
uniform float uGust;    // 0..1 now
uniform float uDensity; // 0..1 share of flakes falling
uniform vec3 uRayO;
uniform vec3 uRayD;
uniform float uCursor;  // 0..1 the pointer's wind
uniform float uAval;    // 0..1 avalanche powder
uniform float uPx;      // device px per CSS px
uniform float uMotion;
varying float vA;
varying float vSoft;
varying vec2 vUv;

float h1(float n) { return fract(sin(n * 91.345) * 47453.5453); }

void main() {
  float layer = aParam.y;
  vec3 box = layer < 0.5 ? vec3(16.0, 12.0, 16.0) : (layer < 1.5 ? vec3(70.0, 46.0, 70.0) : vec3(260.0, 150.0, 260.0));
  float t = uTime * uMotion;
  float fall = mix(0.9, 1.7, aSeed.y) * (layer < 0.5 ? 1.25 : 1.0);
  vec3 drift = uWindV * (0.75 + 0.5 * aSeed.x);
  vec3 p = aSeed.xyz * box;
  p += vec3(drift.x * t, -fall * t, drift.z * t);
  // sway: each flake wanders on its own little loop
  float ph = aSeed.x * 40.0 + aSeed.z * 17.0;
  p.x += sin(t * (0.6 + aSeed.z) + ph) * 0.35;
  p.z += cos(t * (0.5 + aSeed.x) + ph) * 0.35;
  // wrap round the camera
  p = mod(p - uCamPos, box) - box * 0.5 + uCamPos;
  // gust fronts: bands that sweep across along the wind
  vec3 wd = normalize(uWindV + vec3(1e-4));
  float front = sin(dot(p.xz, wd.xz) * 0.06 - t * 1.8 + aSeed.w * 2.0);
  p += wd * (0.5 + 0.5 * front) * uGust * 3.0;
  // the cursor's wind: push out from the ray, and swirl round it
  vec3 toP = p - uRayO;
  float along = max(dot(toP, uRayD), 0.0);
  vec3 off = toP - uRayD * along;
  float d = length(off);
  float rad = 0.6 + along * 0.09;
  float push = uCursor * exp(-(d * d) / (rad * rad)) * smoothstep(0.0, 2.0, along);
  vec3 nrm = d > 1e-4 ? off / d : vec3(0.0, 1.0, 0.0);
  p += nrm * push * rad * 1.4 + cross(uRayD, nrm) * push * rad * 1.1;
  // the avalanche: powder blown sideways and up across the view
  p += vec3(1.0, 0.25, 0.0) * uAval * (2.0 + 6.0 * aSeed.y) * (layer < 1.5 ? 1.0 : 0.3);

  // fade at the box's edges (no popping) and the flakes past this snowfall's density
  vec3 q = abs(p - uCamPos) / (box * 0.5);
  float edge = 1.0 - smoothstep(0.75, 1.0, max(max(q.x, q.y), q.z));
  float on = step(aSeed.w, uDensity + uAval);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float near = smoothstep(1.2, 3.0, -mv.z);
  vA = edge * on * near * (layer < 0.5 ? 0.55 : (layer < 1.5 ? 0.8 : 0.65));
  vSoft = layer < 0.5 ? 1.0 : (layer < 1.5 ? 0.45 : 0.25);
  float size = aParam.x * (layer < 0.5 ? 0.026 : (layer < 1.5 ? 0.034 : 0.12));
  mv.xy += position.xy * size;
  vUv = position.xy + 0.5;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uCol;
varying float vA;
varying float vSoft;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 1.0 - vSoft, r) * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uCol, a);
}
`;

export function createSnow({ tier }) {
  const count = tier === 'low' ? 6000 : 24000;
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  const seed = new Float32Array(count * 4);
  const param = new Float32Array(count * 2);
  let s = 12345;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < count; i++) {
    seed.set([r(), r(), r(), r()], i * 4);
    const u = r();
    const layer = u < 0.08 ? 0 : u < 0.62 ? 1 : 2;
    param.set([0.6 + r() * 1.0, layer], i * 2);
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.setAttribute('aParam', new THREE.InstancedBufferAttribute(param, 2));
  geo.instanceCount = count;
  const uniforms = {
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uWindV: { value: new THREE.Vector3(2, 0, 0.5) },
    uGust: { value: 0 },
    uDensity: { value: 0.6 },
    uRayO: { value: new THREE.Vector3() },
    uRayD: { value: new THREE.Vector3(0, 0, -1) },
    uCursor: { value: 0 },
    uAval: { value: 0 },
    uPx: { value: 1 },
    uMotion: { value: 1 },
    uCol: { value: new THREE.Color('#eef4ff') },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  return {
    mesh,
    uniforms,
    /** Share of the flakes drawn: the low tier and a busy page halve it. */
    setLoad(k) {
      geo.instanceCount = Math.max(1000, Math.round(count * k));
    },
    dispose() {
      quad.dispose();
      geo.dispose();
      mat.dispose();
    },
  };
}
