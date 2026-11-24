// The range itself: three flat grids (near, mid, far) that follow the camera, snapped to their own
// spacing so nothing swims, displaced on the GPU by land.js's landH. A coarser grid sinks its vertices
// inside the finer grid's footprint, and draws with a polygon offset, so the finer one wins where they
// overlap. Shading: snow on gentle slopes, dark rock on steep faces (from the normal), the glacier's
// blue ice with crevasses, wind-scoured sastrugi and sparkle on the snow, moonlight, and haze into the
// sky's own colour (shared.js applyHaze). The base-camp footprints are drawn in this shader too.
import * as THREE from 'three';
import { LAND_GLSL } from './land.js';
import { SHARED_PARS } from './shared.js';

const VERT = /* glsl */ `
${LAND_GLSL}
uniform vec2 uOrigin;      // grid centre (snapped), world xz
uniform float uSpacing;    // m between vertices
uniform vec4 uHole;        // finer grid: centre xz, half size, margin
uniform int uOct;
varying vec3 vWorld;
varying vec3 vNormal2;
varying float vEdge;
void main() {
  vec2 xz = position.xz * uSpacing + uOrigin;
  float h = landH(xz, uOct);
  float e = uSpacing;
  float hx = landH(xz + vec2(e, 0.0), uOct);
  float hz = landH(xz + vec2(0.0, e), uOct);
  vec3 n = normalize(vec3(h - hx, e, h - hz));
  // inside the finer grid's footprint: sink out of the way
  vec2 dh = abs(xz - uHole.xy);
  float inHole = step(max(dh.x, dh.y), uHole.z - uHole.w);
  h -= inHole * 400.0;
  vEdge = inHole;
  vec3 wp = vec3(xz.x, h, xz.y);
  vWorld = wp;
  vNormal2 = n;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
${SHARED_PARS}
${LAND_GLSL}
uniform float uPrints;     // 0..1 how much of the footprint trail is laid
uniform float uMotion;
varying vec3 vWorld;
varying vec3 vNormal2;
varying float vEdge;

// the footprints: alternating boot prints along a gentle S from the camera's start to the ridge foot
vec2 trail(float t) { return vec2(-6.0 + 9.0 * sin(t * 2.2) * (1.0 - t), 18.0 - t * 230.0); }
float prints(vec2 xz) {
  float best = 0.0;
  for (int i = 0; i < 48; i++) {
    float t = (float(i) + 0.5) / 48.0;
    if (t > uPrints) break;
    vec2 c = trail(t);
    vec2 dir = normalize(trail(t + 0.01) - c);
    vec2 side = vec2(-dir.y, dir.x) * (mod(float(i), 2.0) < 1.0 ? 0.28 : -0.28);
    vec2 q = xz - (c + side);
    vec2 r = vec2(dot(q, side * 3.57), dot(q, dir));
    float boot = smoothstep(1.0, 0.7, length(r / vec2(0.13, 0.32)));
    float age = smoothstep(uPrints, uPrints - 0.25, t); // the newest prints are sharpest
    best = max(best, boot * (0.55 + 0.45 * age));
  }
  return best;
}

void main() {
  vec3 n = normalize(vNormal2);
  vec3 wp = vWorld;
  vec3 v = normalize(uCam - wp);
  float dist = length(uCam - wp);
  // fine detail: bumps in the normal from 3D noise, fading with distance
  float df = 1.0 - smoothstep(60.0, 900.0, dist);
  vec3 bump = vec3(s_noise(wp * 0.35) - 0.5, 0.0, s_noise(wp * 0.35 + 7.0) - 0.5);
  n = normalize(n + bump * 0.35 * df);
  float slope = 1.0 - n.y;
  float brk = s_fbm(wp * 0.004) * 0.25 + s_noise(wp * 0.05) * 0.08;
  float rock = smoothstep(0.24, 0.36, slope + brk * 1.4 - 0.16);
  // snow holds on to the gullies higher up: a little more snow with altitude
  rock *= 1.0 - smoothstep(4500.0, 6200.0, wp.y) * 0.35;

  vec3 L = normalize(uMoonDir);
  float diff = max(dot(n, L), 0.0);
  float wrap = max(dot(n, L) * 0.5 + 0.5, 0.0);
  float sky = 0.5 + 0.5 * n.y;

  // snow: lit by the moon, filled by the sky, blue in its own shadow
  vec3 snow = mix(uSnowShade, uSnowLit, smoothstep(0.0, 1.0, wrap * 0.85 + diff * 0.3));
  // sastrugi: wind ripples on the gentle snow
  float sas = s_noise(vec3(wp.x * 0.09 + wp.z * 0.02, 0.0, wp.z * 0.5)) * df;
  snow *= 0.96 + 0.06 * sas;
  // sparkle: a few facets that catch the moon
  float sp = step(0.985, s_hash(floor(wp * 3.0))) * pow(max(dot(reflect(-L, n), v), 0.0), 20.0) * df;
  snow += vec3(sp) * 1.2;

  vec3 rk = uRock * (0.55 + 0.6 * diff + 0.25 * sky);
  float strata = s_noise(vec3(wp.y * 0.03, wp.x * 0.002, wp.z * 0.002));
  rk *= 0.75 + 0.5 * strata;
  // snow chutes down the faces and powder on the ledges
  float chute = smoothstep(0.55, 0.78, s_noise(vec3(wp.x * 0.012, wp.y * 0.05, wp.z * 0.012)));
  float ledge = smoothstep(0.62, 0.7, s_noise(wp * 0.04)) * smoothstep(0.55, 0.35, slope);
  rk = mix(rk, mix(uSnowShade, uSnowLit, wrap) * 0.85, max(chute * 0.55, ledge * 0.7));
  vec3 col = mix(snow, rk, rock);

  // glacier: blue ice, crevasse lines across the flow, seracs' shadows
  float g = l_glacier(wp.xz) + l_plateau(wp.xz) * 0.8;
  if (g > 0.01) {
    float flow = wp.z * 0.03 + s_noise(wp * 0.01) * 4.0;
    float crev = smoothstep(0.88, 0.97, sin(flow * 3.14159) * 0.5 + 0.5) * smoothstep(0.35, 0.6, s_noise(wp * 0.006));
    vec3 ice = mix(uIce * (0.6 + 0.5 * wrap), uSnowLit * 0.9, 0.35 + 0.3 * s_noise(wp * 0.02));
    ice = mix(ice, uIce * 0.18, crev);
    col = mix(col, ice, smoothstep(0.0, 0.6, g) * (1.0 - rock) * smoothstep(0.45, 0.2, slope));
  }

  // base camp: the footprint trail pressed into the snow
  if (uPrints > 0.0 && wp.z > -240.0 && wp.z < 30.0 && abs(wp.x) < 30.0) {
    float pr = prints(wp.xz);
    col = mix(col, uSnowShade * 0.8, pr * 0.65);
  }

  col = applyHaze(col, wp);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

function gridGeometry(n) {
  // n x n vertices in [-n/2, n/2] grid units, y = 0
  const g = new THREE.PlaneGeometry(n - 1, n - 1, n - 1, n - 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

export function createTerrain(shared, { tier }) {
  const spec =
    tier === 'low'
      ? [
          { n: 96, spacing: 9, oct: 5 },
          { n: 120, spacing: 70, oct: 5 },
          { n: 150, spacing: 420, oct: 4 },
        ]
      : [
          { n: 160, spacing: 6, oct: 6 },
          { n: 200, spacing: 45, oct: 6 },
          { n: 256, spacing: 280, oct: 5 },
        ];
  const group = new THREE.Group();
  const grids = spec.map((s, i) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uOrigin: { value: new THREE.Vector2() },
        uSpacing: { value: s.spacing },
        uHole: { value: new THREE.Vector4(0, 0, -1, 0) },
        uOct: { value: s.oct },
        uPrints: { value: 0 },
        uMotion: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      polygonOffset: i > 0,
      polygonOffsetFactor: i * 2,
      polygonOffsetUnits: i * 4,
    });
    const mesh = new THREE.Mesh(gridGeometry(s.n), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10 + i;
    group.add(mesh);
    return { ...s, mesh, mat, half: ((s.n - 1) * s.spacing) / 2 };
  });

  return {
    group,
    update(cam, { prints = 0, motion = 1 } = {}) {
      const p = cam.position;
      for (let i = 0; i < grids.length; i++) {
        const g = grids[i];
        // snap to two cells so the triangulation never flips under the camera
        const step = g.spacing * 2;
        const ox = Math.round(p.x / step) * step;
        const oz = Math.round(p.z / step) * step;
        g.mat.uniforms.uOrigin.value.set(ox, oz);
        g.mat.uniforms.uPrints.value = i === 0 ? prints : 0;
        g.mat.uniforms.uMotion.value = motion;
        const finer = grids[i - 1];
        if (finer) {
          const fo = finer.mat.uniforms.uOrigin.value;
          finer && g.mat.uniforms.uHole.value.set(fo.x, fo.y, finer.half, finer.spacing * 6 + g.spacing * 1.5);
        }
      }
    },
    dispose() {
      for (const g of grids) {
        g.mesh.geometry.dispose();
        g.mat.dispose();
      }
    },
  };
}
