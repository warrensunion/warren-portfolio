// The mountain, as one height function H(x, z) in metres, written twice: in JS (the camera, the igloo,
// the pines and the seracs stand on it) and in GLSL (the terrain grids are displaced by it on the GPU, so
// there is no mesh to build or download). Both use the same integer hash, so they agree to float
// precision. Base camp is at the origin, the climb runs north (-z) along one ridge to the summit.
//
// The made-up range: one long south ridge from the valley floor (0 m) to a 6,100 m summit 11 km away,
// steep flanks with ridged gullies, a glacier in the east cirque (the icefall) and a high plateau of
// crevasses west of the ridge, and a ring of lower peaks around it.

export const L = 11000; // ridge length, m
export const SUMMIT_H = 6100;
export const PROFILE = 1.25; // crest height = SUMMIT_H * s^PROFILE

// Lower peaks round the massif: x, z, height, radius (m).
export const PEAKS = [
  [-7200, -8200, 4700, 5200],
  [8200, -9800, 5200, 5600],
  [-10500, -15500, 5900, 6500],
  [4200, -18500, 5400, 6000],
  [13500, -4200, 3600, 4800],
  [-13500, -2500, 3300, 5000],
  [16000, -16000, 6300, 8000],
  [-2500, -24000, 5600, 7000],
];

// The glacier (icefall) in the east cirque and the crevasse plateau west of the ridge, as ellipses:
// centre x, centre z, half width, half length, rotation.
export const GLACIER = [1000, -5400, 440, 1250, -0.25];
export const PLATEAU = [-1150, -8300, 620, 820, 0.2];

export const crestX = (s) => 520 * Math.sin(s * 2.6) * (1 - s * s);
export const crestH = (s) => SUMMIT_H * Math.pow(Math.max(0, Math.min(1, s)), PROFILE);
/** The path parameter s (0 base camp, 1 summit) at an altitude. */
export const sOfAlt = (alt) => Math.pow(Math.max(0, Math.min(1, alt / SUMMIT_H)), 1 / PROFILE);

function hash2(ix, iy) {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}
const q5 = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export function vnoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = q5(x - ix);
  const fy = q5(y - iy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
// Ridged fbm: sharp crests and gullies (1 - |2n - 1|, squared, weighted by the octave above).
export function ridged(x, y, oct = 6) {
  let s = 0;
  let a = 0.5;
  let w = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(vnoise(x, y) * 2 - 1);
    n *= n;
    n *= w;
    w = Math.min(1, n * 1.6);
    s += n * a;
    norm += a;
    // rotate and scale between octaves so the lattice never lines up
    const nx = 1.6 * x - 1.2 * y + 17.3;
    const ny = 1.2 * x + 1.6 * y - 9.1;
    x = nx;
    y = ny;
    a *= 0.5;
  }
  return s / norm;
}
export function fbm(x, y, oct = 4) {
  let s = 0;
  let a = 0.5;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x, y) * a;
    norm += a;
    const nx = 1.6 * x - 1.2 * y + 5.7;
    const ny = 1.2 * x + 1.6 * y + 3.3;
    x = nx;
    y = ny;
    a *= 0.5;
  }
  return s / norm;
}
const smax = (a, b, k) => {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return a + (b - a) * h + k * h * (1 - h);
};
const smoothstep = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
function ellipse(x, z, [cx, cz, hw, hl, rot]) {
  const dx = x - cx;
  const dz = z - cz;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const u = (dx * c - dz * s) / hw;
  const v = (dx * s + dz * c) / hl;
  return Math.sqrt(u * u + v * v); // < 1 inside
}
/** 1 inside the glacier, 0 outside (soft edge). */
export const glacierMask = (x, z) => 1 - smoothstep(0.75, 1.0, ellipse(x, z, GLACIER));
export const plateauMask = (x, z) => 1 - smoothstep(0.7, 1.0, ellipse(x, z, PLATEAU));

/** Terrain height (m) at world x, z. `oct` lowers the detail for cheap callers. */
export function H(x, z, oct = 6) {
  const s = -z / L;
  const sc = Math.max(0, Math.min(1, s));
  const cx = crestX(sc);
  const d = Math.abs(x - cx);
  const hc = crestH(sc);
  const beyond = Math.max(0, s - 1) * L;
  const mSmooth = hc - beyond * 0.85 - d * (0.5 + 0.3 * sc) - (d * d) / 16000;
  let m = mSmooth;
  // steps along the crest: false summits and rock bands, none at base camp
  m += 60 * (vnoise(sc * 12, 3.7) - 0.5) * smoothstep(0.02, 0.12, sc) * (1 - smoothstep(0.96, 1.0, sc));
  const r = ridged(x / 2600, z / 2600, oct);
  const amp = 22 + 760 * smoothstep(15, 1300, d) * (0.4 + 0.6 * sc) + 420 * smoothstep(1300, 3200, d);
  m += (r - 0.45) * amp;
  // the glacier fills its cirque: a smooth, gently sloping surface
  const g = glacierMask(x, z);
  // the glacier and the plateau: the slope with its rough detail smoothed away (a snowfield, not a mesa)
  if (g > 0) m = m + (mSmooth - 40 - m) * g * 0.9;
  const pl = plateauMask(x, z);
  if (pl > 0) m = m + (mSmooth + 20 - m) * pl * 0.85;
  let h = m;
  for (const [px, pz, ph, pr] of PEAKS) {
    const dd = Math.hypot(x - px, z - pz) / pr;
    if (dd < 1.2) {
      const r2 = ridged(x / 1100 + 31.7, z / 1100 - 12.3, Math.max(2, oct - 1));
      const cone = ph * Math.pow(Math.max(0, 1 - dd), 1.35) + (r - 0.5) * 1400 * Math.max(0, 1 - dd) + (r2 - 0.45) * 700 * Math.max(0, 1 - dd * 0.9);
      h = smax(h, cone, 500);
    }
  }
  const floorH = (fbm(x / 900, z / 900, 3) - 0.5) * 24;
  return smax(h, floorH, 160);
}

// ---- GLSL: the same functions, byte for byte in behaviour ----------------------------------------

const peaksGLSL = PEAKS.map(([x, z, h, r]) => `vec4(${x.toFixed(1)}, ${z.toFixed(1)}, ${h.toFixed(1)}, ${r.toFixed(1)})`).join(',\n  ');
const ell = (e) => `vec4(${e[0].toFixed(1)}, ${e[1].toFixed(1)}, ${e[2].toFixed(1)}, ${e[3].toFixed(1)}), ${e[4].toFixed(4)}`;

export const LAND_GLSL = /* glsl */ `
float l_hash2(ivec2 p) {
  uint h = (uint(p.x) * 0x27d4eb2du) ^ (uint(p.y) * 0x165667b1u);
  h = (h ^ (h >> 15u)) * 0x2c1b3c6du;
  h = (h ^ (h >> 12u)) * 0x297a2d39u;
  h = h ^ (h >> 15u);
  return float(h) / 4294967296.0;
}
float l_q5(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float l_vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  ivec2 ii = ivec2(i);
  float fx = l_q5(f.x), fy = l_q5(f.y);
  float a = l_hash2(ii), b = l_hash2(ii + ivec2(1, 0)), c = l_hash2(ii + ivec2(0, 1)), d = l_hash2(ii + ivec2(1, 1));
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
float l_ridged(vec2 p, int oct) {
  float s = 0.0, a = 0.5, w = 1.0, norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    float n = 1.0 - abs(l_vnoise(p) * 2.0 - 1.0);
    n *= n;
    n *= w;
    w = min(1.0, n * 1.6);
    s += n * a;
    norm += a;
    p = vec2(1.6 * p.x - 1.2 * p.y + 17.3, 1.2 * p.x + 1.6 * p.y - 9.1);
    a *= 0.5;
  }
  return s / norm;
}
float l_fbm(vec2 p, int oct) {
  float s = 0.0, a = 0.5, norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += l_vnoise(p) * a;
    norm += a;
    p = vec2(1.6 * p.x - 1.2 * p.y + 5.7, 1.2 * p.x + 1.6 * p.y + 3.3);
    a *= 0.5;
  }
  return s / norm;
}
float l_smax(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return a + (b - a) * h + k * h * (1.0 - h);
}
float l_crestX(float s) { return 520.0 * sin(s * 2.6) * (1.0 - s * s); }
float l_crestH(float s) { return ${SUMMIT_H.toFixed(1)} * pow(clamp(s, 0.0, 1.0), ${PROFILE.toFixed(3)}); }
float l_ellipse(vec2 p, vec4 e, float rot) {
  vec2 d = p - e.xy;
  float c = cos(rot), s = sin(rot);
  float u = (d.x * c - d.y * s) / e.z;
  float v = (d.x * s + d.y * c) / e.w;
  return sqrt(u * u + v * v);
}
float l_glacier(vec2 p) { return 1.0 - smoothstep(0.75, 1.0, l_ellipse(p, ${ell(GLACIER)})); }
float l_plateau(vec2 p) { return 1.0 - smoothstep(0.7, 1.0, l_ellipse(p, ${ell(PLATEAU)})); }
const vec4 L_PEAKS[${PEAKS.length}] = vec4[${PEAKS.length}](
  ${peaksGLSL}
);
float landH(vec2 xz, int oct) {
  float x = xz.x, z = xz.y;
  float s = -z / ${L.toFixed(1)};
  float sc = clamp(s, 0.0, 1.0);
  float cx = l_crestX(sc);
  float d = abs(x - cx);
  float hc = l_crestH(sc);
  float beyond = max(0.0, s - 1.0) * ${L.toFixed(1)};
  float mSmooth = hc - beyond * 0.85 - d * (0.5 + 0.3 * sc) - d * d / 16000.0;
  float m = mSmooth;
  m += 60.0 * (l_vnoise(vec2(sc * 12.0, 3.7)) - 0.5) * smoothstep(0.02, 0.12, sc) * (1.0 - smoothstep(0.96, 1.0, sc));
  float r = l_ridged(xz / 2600.0, oct);
  float amp = 22.0 + 760.0 * smoothstep(15.0, 1300.0, d) * (0.4 + 0.6 * sc) + 420.0 * smoothstep(1300.0, 3200.0, d);
  m += (r - 0.45) * amp;
  float g = l_glacier(xz);
  if (g > 0.0) m = m + (mSmooth - 40.0 - m) * g * 0.9;
  float pl = l_plateau(xz);
  if (pl > 0.0) m = m + (mSmooth + 20.0 - m) * pl * 0.85;
  float h = m;
  for (int i = 0; i < ${PEAKS.length}; i++) {
    vec4 pk = L_PEAKS[i];
    float dd = length(xz - pk.xy) / pk.w;
    if (dd < 1.2) {
      float r2 = l_ridged(xz / 1100.0 + vec2(31.7, -12.3), max(2, oct - 1));
      float cone = pk.z * pow(max(0.0, 1.0 - dd), 1.35) + (r - 0.5) * 1400.0 * max(0.0, 1.0 - dd) + (r2 - 0.45) * 700.0 * max(0.0, 1.0 - dd * 0.9);
      h = l_smax(h, cone, 500.0);
    }
  }
  float floorH = (l_fbm(xz / 900.0, 3) - 0.5) * 24.0;
  return l_smax(h, floorH, 160.0);
}
`;
