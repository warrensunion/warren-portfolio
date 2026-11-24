// The sky: one inverted sphere that rides on the camera. Blue-hour gradient (shared.js skyBase), hashed
// stars that twinkle, a cold moon with its halo, and the aurora: curtains of folded fbm bands that grow
// with altitude and with the night theme. Everything is a function of the view direction and time.
import * as THREE from 'three';
import { SHARED_PARS } from './shared.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // on the far plane
}
`;

const FRAG = /* glsl */ `
${SHARED_PARS}
uniform float uMotion;
varying vec3 vDir;

vec3 stars(vec3 d) {
  // a cube-ish grid on the direction, one candidate star per cell
  vec3 p = d * 220.0;
  vec3 i = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = s_hash(i);
  if (h < 0.965) return vec3(0.0);
  vec3 o = vec3(s_hash(i + 1.3), s_hash(i + 2.7), s_hash(i + 4.1)) - 0.5;
  float r = length(f - o * 0.7);
  float size = 0.06 + 0.12 * s_hash(i + 9.1);
  float tw = 0.65 + 0.35 * sin(uTime * uMotion * (1.0 + 3.0 * s_hash(i + 5.5)) + h * 60.0);
  float b = smoothstep(size, 0.0, r) * tw;
  vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.92, 0.82), s_hash(i + 7.7));
  return tint * b * (0.6 + 1.6 * (h - 0.965) / 0.035);
}

vec3 aurora(vec3 d) {
  if (d.y < 0.02) return vec3(0.0);
  // project onto a high curved sheet; march a few layers for depth
  vec3 acc = vec3(0.0);
  float t = uTime * 0.05 * uMotion;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float h = 0.9 + fi * 0.09;
    vec2 uv = d.xz / (d.y + 0.25) * h;
    // curtains: folded bands along one axis, rippling
    float fold = s_fbm(vec3(uv.x * 0.55 + t, uv.y * 0.18 - t * 0.4, fi * 0.3));
    float band = smoothstep(0.42, 0.5, fold) * smoothstep(0.62, 0.5, fold);
    float ripple = 0.55 + 0.45 * s_noise(vec3(uv * 4.0 + vec2(t * 3.0, 0.0), fi));
    vec3 col = mix(vec3(0.15, 1.0, 0.65), vec3(0.45, 0.35, 1.0), fi / 5.0);
    acc += col * band * ripple * (1.0 - fi / 7.0);
  }
  float fade = smoothstep(0.02, 0.25, d.y) * (1.0 - smoothstep(0.75, 1.0, d.y));
  return acc * fade * 0.16;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 c = skyBase(d);
  float night = smoothstep(0.0, 0.3, d.y);
  c += stars(d) * uStars * night * (0.5 + 0.5 * uClimb);
  // the moon disc: a soft limb, faint maria
  float m = dot(d, uMoonDir);
  float disc = smoothstep(0.99955, 0.99975, m);
  float maria = 0.85 + 0.15 * s_noise(d * 900.0);
  c = mix(c, uMoonCol * maria * 1.35, disc);
  // the aurora strengthens as you climb, and with the night theme
  float aur = uAurora * (0.25 + 0.75 * smoothstep(0.25, 1.0, uClimb));
  c += aurora(d) * aur;
  // inside the cloud the sky is the cloud
  c = mix(c, uCloudCol, uCloudIn);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

export function createSky(shared) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uMotion: { value: 1 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return {
    mesh,
    update(cam, motion) {
      mesh.position.copy(cam.position);
      mat.uniforms.uMotion.value = motion;
    },
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}
