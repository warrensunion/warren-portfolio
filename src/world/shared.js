// Uniforms and GLSL shared by every material in the mountain act: the sky's colours (so the terrain's
// haze always fades into the exact sky behind it), the moon, time, the theme and the weather. One object,
// referenced by every ShaderMaterial, so a theme change or a frame's time is written once.
import * as THREE from 'three';

// Two looks: blue hour (default) and deep night. Every colour the world uses comes from here.
export const THEMES = {
  dusk: {
    top: '#071328',
    mid: '#1a3563',
    horizon: '#5a73a6',
    warm: '#b98a9a',
    snowLit: '#9cb0d0',
    snowShade: '#3a4c72',
    rock: '#222b3f',
    ice: '#5f9cc4',
    fog: '#4a5f8c',
    cloud: '#8494b8',
    moon: '#f2f4ff',
    aurora: 0.35,
    stars: 0.55,
    exposure: 1.0,
  },
  night: {
    top: '#010309',
    mid: '#071022',
    horizon: '#17284a',
    warm: '#2b3155',
    snowLit: '#62759b',
    snowShade: '#1d2944',
    rock: '#0a0e17',
    ice: '#2e5a7d',
    fog: '#142240',
    cloud: '#2d3b5c',
    moon: '#dfe6ff',
    aurora: 1.0,
    stars: 1.0,
    exposure: 1.0,
  },
};

export function createShared() {
  const c = (hex) => new THREE.Color(hex);
  const t = THEMES.dusk;
  return {
    uTime: { value: 0 },
    uTop: { value: c(t.top) },
    uMid: { value: c(t.mid) },
    uHorizon: { value: c(t.horizon) },
    uWarm: { value: c(t.warm) },
    uSnowLit: { value: c(t.snowLit) },
    uSnowShade: { value: c(t.snowShade) },
    uRock: { value: c(t.rock) },
    uIce: { value: c(t.ice) },
    uFogCol: { value: c(t.fog) },
    uCloudCol: { value: c(t.cloud) },
    uMoonCol: { value: c(t.moon) },
    uAurora: { value: t.aurora }, // theme base, x climb in the sky shader
    uStars: { value: t.stars },
    uClimb: { value: 0 }, // 0 base camp .. 1 summit
    uMoonDir: { value: new THREE.Vector3(-0.38, 0.34, -0.86).normalize() },
    uCam: { value: new THREE.Vector3() },
    uCloudY: { value: new THREE.Vector2(1000, 1750) }, // the treeline cloud slab, m
    uCloudIn: { value: 0 }, // 0..1 how deep the camera is in the slab
    uWind: { value: new THREE.Vector3(1, 0, 0.2) }, // direction xz, strength
  };
}

/** Lerp every theme colour toward `to` by k (0..1), in place. */
export function blendTheme(shared, from, to, k) {
  const a = THEMES[from];
  const b = THEMES[to];
  const set = (u, key) => shared[u].value.set(a[key]).lerp(new THREE.Color(b[key]), k);
  set('uTop', 'top');
  set('uMid', 'mid');
  set('uHorizon', 'horizon');
  set('uWarm', 'warm');
  set('uSnowLit', 'snowLit');
  set('uSnowShade', 'snowShade');
  set('uRock', 'rock');
  set('uIce', 'ice');
  set('uFogCol', 'fog');
  set('uCloudCol', 'cloud');
  set('uMoonCol', 'moon');
  shared.uAurora.value = a.aurora + (b.aurora - a.aurora) * k;
  shared.uStars.value = a.stars + (b.stars - a.stars) * k;
}

export const SHARED_PARS = /* glsl */ `
uniform float uTime;
uniform vec3 uTop, uMid, uHorizon, uWarm, uSnowLit, uSnowShade, uRock, uIce, uFogCol, uCloudCol, uMoonCol;
uniform float uAurora, uStars, uClimb, uCloudIn;
uniform vec3 uMoonDir, uCam, uWind;
uniform vec2 uCloudY;

float s_hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float s_noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(s_hash(i), s_hash(i + vec3(1,0,0)), f.x), mix(s_hash(i + vec3(0,1,0)), s_hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(s_hash(i + vec3(0,0,1)), s_hash(i + vec3(1,0,1)), f.x), mix(s_hash(i + vec3(0,1,1)), s_hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float s_fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * s_noise(p); p *= 2.07; a *= 0.5; } return s / 0.9375; }

// The sky's own colour along a view direction, without stars or aurora: what the haze fades into.
vec3 skyBase(vec3 d) {
  float y = d.y;
  float hz = 1.0 - smoothstep(-0.05, 0.42, y);
  vec3 c = mix(uMid, uTop, smoothstep(0.08, 0.75, y));
  c = mix(c, uHorizon, hz * hz);
  // a faint warm band where the sun went down (the side away from the moon)
  float w = max(0.0, dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(-uMoonDir.x, 0.0, -uMoonDir.z))));
  c = mix(c, uWarm, pow(w, 3.0) * pow(1.0 - smoothstep(-0.02, 0.22, y), 2.0) * 0.55);
  // below the horizon: the haze over the valleys
  c = mix(c, uFogCol, smoothstep(0.0, -0.25, y));
  // moon halo
  float m = max(0.0, dot(d, uMoonDir));
  c += uMoonCol * (pow(m, 60.0) * 0.18 + pow(m, 8.0) * 0.05);
  return c;
}

// Aerial perspective: exponential haze thickening with distance and toward the valleys, plus the
// treeline cloud slab (density integrated along the view ray through it), into the sky's own colour.
vec3 applyHaze(vec3 col, vec3 wp) {
  vec3 v = wp - uCam;
  float dist = length(v);
  vec3 d = v / max(dist, 1e-3);
  float hAvg = 0.5 * (wp.y + uCam.y);
  float dens = 0.000032 * exp(-max(hAvg, 0.0) / 2600.0) + 0.000004;
  float fog = 1.0 - exp(-dist * dens);
  // cloud slab: the length of the ray inside [y0, y1], times its density
  float y0 = uCloudY.x, y1 = uCloudY.y;
  float a = uCam.y, b = wp.y;
  float lo = max(min(a, b), y0), hi = min(max(a, b), y1);
  float inside = max(0.0, hi - lo) / max(abs(b - a), 1e-3) * dist;
  if (abs(b - a) < 1e-3) inside = (a > y0 && a < y1) ? dist : 0.0;
  float cloud = 1.0 - exp(-inside * 0.0022);
  vec3 sky = skyBase(d);
  col = mix(col, sky, clamp(fog, 0.0, 1.0));
  col = mix(col, uCloudCol, clamp(cloud, 0.0, 1.0));
  return col;
}
`;
