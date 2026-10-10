// Ported from terrarium src/live/look.js at 7612a40 (Warren's own project). Changes: none but this header.
/**
 * One light rig and one palette for every material in the jar. All live
 * materials are small custom shaders (not MeshStandardMaterial) because the
 * art direction is gouache, not PBR: a soft painted terminator, cool shadows,
 * a warm rim from the upper-left window. Sharing the uniforms here keeps the
 * terrain, creatures and glass lit by the same imaginary afternoon.
 *
 * Colours are THREE.Color, so they are converted to linear once; every shader
 * outputs linear light and grade.js does tone, sRGB and the film look.
 */
import * as THREE from 'three';

export const WORLD_R = 5;          // three units per sim unit (shared contract)
export const JAR_R = 5.32;         // inner glass radius: the terrain meets it here
export const JAR_FLOOR = -1.8;     // top of the glass base, bottom of the gravel
export const TABLE_Y = -2.15;      // where the jar stands

export const PALETTE = {
  fog: new THREE.Color('#C9D8D2'),
  moss: new THREE.Color('#1F3A33'),
  lichen: new THREE.Color('#D6C35A'),
  violet: new THREE.Color('#6B4FA0'),
  cyan: new THREE.Color('#5FE3D8'),
  peat: new THREE.Color('#3B2E26'),
  salmon: new THREE.Color('#F07A8C'),
  inkLift: new THREE.Color('#14241F'),
  highlight: new THREE.Color('#FFF4D6'),
};

// key light: late afternoon, upper left and a little behind (rim on the top-left edges)
const keyDir = new THREE.Vector3(-0.62, 0.72, -0.3).normalize();
const fillDir = new THREE.Vector3(0.85, 0.15, 0.45).normalize();

export const lightUniforms = {
  uKeyDir: { value: keyDir },
  uKeyCol: { value: new THREE.Color('#FFE2B0').multiplyScalar(1.3) },
  uFillDir: { value: fillDir },
  uFillCol: { value: new THREE.Color('#7FC4BC').multiplyScalar(0.55) },
  uSkyCol: { value: new THREE.Color('#C9D8D2').multiplyScalar(0.62) },
  uGroundCol: { value: new THREE.Color('#3B2E26').multiplyScalar(0.55) },
  uTime: { value: 0 },
};

/** the gouache light model, shared by every opaque live material */
export const LIGHT_GLSL = /* glsl */ `
uniform vec3 uKeyDir, uKeyCol, uFillDir, uFillCol, uSkyCol, uGroundCol;
uniform float uTime;
float lvHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lvHash3(vec3 p) { return lvHash(p.xy + p.z * 17.17); }
float lvNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lvHash(i), lvHash(i + vec2(1, 0)), f.x), mix(lvHash(i + vec2(0, 1)), lvHash(i + vec2(1, 1)), f.x), f.y);
}
float lvFbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * lvNoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
// soft painted terminator, cool shadows, warm upper-left rim
vec3 lvGouache(vec3 albedo, vec3 N, vec3 V, float ao, float rimAmt) {
  float ndl = dot(N, uKeyDir);
  float key = smoothstep(-0.2, 0.8, ndl);
  float fill = max(dot(N, uFillDir), 0.0);
  vec3 amb = mix(uGroundCol, uSkyCol, N.y * 0.5 + 0.5);
  vec3 c = albedo * (amb * ao + uKeyCol * key * mix(0.45, 1.0, ao) + uFillCol * fill * ao);
  c = mix(c * vec3(0.78, 0.93, 1.06), c, key);
  float fr = 1.0 - max(dot(N, V), 0.0);
  float rim = fr * fr * fr * smoothstep(-0.1, 0.6, ndl);
  c += (albedo * 0.6 + 0.12) * uKeyCol * rim * rimAmt;
  return c;
}
`;

/**
 * The room behind the jar: a celadon wash with a warm window glow upper left.
 * Shared by the backdrop and the glass (which samples it with a refraction
 * offset), so what the glass bends is exactly what is behind it.
 */
export const backdropUniforms = {
  uBackdrop: { value: null },
  uHasBackdrop: { value: 0 },
  uBackdropAspect: { value: 1.5 },
  uViewport: { value: new THREE.Vector2(1440, 900) },
  uPan: { value: new THREE.Vector2(0, 0) },
};

export const BACKDROP_GLSL = /* glsl */ `
uniform sampler2D uBackdrop;
uniform float uHasBackdrop, uBackdropAspect;
uniform vec2 uViewport, uPan;
vec3 lvBackdrop(vec2 uv) {
  float va = uViewport.x / uViewport.y;
  vec2 p = uv + uPan;
  // cover-fit, slightly oversized so the orbit pan never shows an edge
  vec2 s = va > uBackdropAspect ? vec2(1.0, uBackdropAspect / va) : vec2(va / uBackdropAspect, 1.0);
  vec3 tex = texture2D(uBackdrop, (p - 0.5) * s * 0.9 + 0.5).rgb;
  vec2 q = vec2((p.x - 0.5) * va, p.y - 0.5);
  vec3 fogC = vec3(0.56, 0.68, 0.64);
  vec3 deep = vec3(0.09, 0.16, 0.14);
  float wash = lvFbm(q * 2.3 + 3.1) * 0.5 + lvFbm(q * 7.0) * 0.18;
  vec3 c = mix(deep, fogC, smoothstep(-0.5, 0.45, q.y + wash * 0.35 - 0.05));
  // the window: a warm glow upper left with soft mullion shadows
  vec2 w = q - vec2(-0.55 * va, 0.42);
  float glow = exp(-dot(w, w) * 2.6);
  float mull = 1.0 - 0.18 * smoothstep(0.02, 0.0, abs(fract((q.x + q.y * 0.18) * 2.2 + 0.3) - 0.5) - 0.03) * glow;
  c = mix(c, vec3(1.0, 0.86, 0.6), glow * 0.55) * mull;
  c *= 0.92 + 0.12 * lvNoise(q * 40.0);
  return mix(c, tex, uHasBackdrop);
}
`;

/** read the CSS-free hsl → linear rgb once, for instance colours */
const tmp = new THREE.Color();
export function hslLinear(h, s, l, out) {
  tmp.setHSL(((h % 360) + 360) % 360 / 360, s, l, THREE.SRGBColorSpace);
  out[0] = tmp.r; out[1] = tmp.g; out[2] = tmp.b;
  return out;
}
