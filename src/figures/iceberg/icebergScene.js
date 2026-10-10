// Ported from BTTRURSLF-v2 src/screens/intro/icebergScene.js for Fig. 1 of the portfolio. What changed and
// why: the page is light paper, so sky, fog and water are re-keyed toward it and additive white decoration
// became normal-blended light or was dropped; the load-in (star, blueprint, lattice) and the Start push are
// gone because the figure only ever shows the end state; bloom and its composer are gone (renderer.render,
// with the sRGB conversion moved into each shader) to fit a figure's budget; and a scroll-driven depth
// (setDepth) takes the camera under the waterline, which needed a double-sided surface and a sky that
// knows when a ray is in the water. Constructor options { dpr, tier } choose the quality up front.
/**
 * The WebGL half of the Ascent intro: an iceberg in water in front of a
 * glacier wall, in igloo.inc's world (BUILD_ICEBERG.md, measured in
 * design-reference/iceberg/NOTES.md).
 *
 * The frame, top to bottom (layout-sketch.png): the ranges - igloo's rock
 * with snow in every hollow, under blue-grey fog; the glacier wall; the
 * water's surface, seen almost edge-on from a camera just above it; and a
 * cross-section through the water (the world is cut at z = FRONT_Z), deep
 * navy, with the berg's underwater part lit cyan to blue through it, caustics
 * running over its ice and light shafts coming down. Nothing but the berg
 * ever reacts to the cursor.
 *
 * The berg is a shell of big ice blocks round a hollow (berg.js), and the
 * hollow is a room: a hidden light at its centre (cyan below the waterline)
 * lights the ice round it - the inside of the far wall, the seam walls, the
 * rims next to an opening - never the daylit outer faces, and at rest shows
 * only as a faint line in every seam. The water's surface stops at the
 * hollow's wall, so the tip and the underwater part are one space. A block
 * only ever slides along its own line, d units out: the vertex shader adds
 * dir * d and nothing else. The hover opens the blocks all the way through
 * the berg round the cursor's ray, the far side too; an idle pulse runs from
 * the peak down every 6.25 s and then everything is still; overlay.js draws
 * igloo's polygon diagram on the lifted blocks.
 *
 * The water is madebyevan's height field (water.js) plus a slow swell: a
 * mirrored camera renders the reflection (sky, glacier, ranges, the tip),
 * a second pass renders what lies under the surface for the refraction, and
 * the same field drives the caustics. Wind comes in gusts locked to the
 * idle cycle and the water ripples harder in them (and on the high tier the
 * snow speeds up).
 *
 * The figure applies the load-in's end state once (setState) and from then
 * on only the depth, the cursor and the clock change.
 *
 * Why one merged mesh with a per-block data texture: every block is its own
 * shape, so no two share a mesh, and a frame uploads a few hundred floats
 * (each block's d and glow), never vertices.
 */

import * as THREE from 'three';
import { height, glacierTop, glacierFace, FRONT_Z, GLACIER_Z, FAR_Z, HALF_W } from './terrain.js';
import { buildBlocks, BergMotion, rayThrough, innerR, Y_BOTTOM, BLOCK_W, IDLE, IDLE_DELAY } from './berg.js';
import { WaterSim, SIM_WORLD, SIM_HEIGHT } from './water.js';

// ── Look ───────────────────────────────────────────────────────────────────
/** Re-keyed for a paper page (spec 5, Fig. 1): the sky runs from the page's
    paper at the top to a cool pale grey at the horizon, the fog melts the
    ranges into that grey, and the water is a lighter teal-navy than igloo's
    near-black so the cross-section sits on the plate instead of punching a
    hole in it. The ice keeps the source's colours: it was already pale. */
const C = (hex) => new THREE.Color(hex);
const SKY_TOP = C('#f4f3ee');
const SKY_HORIZON = C('#e9ecee');
const FOG = C('#e3e7ea');
const LOADER = C('#eef0f1');
const ROCK = C('#4a525d');
const ROCK_LIGHT = C('#8a929d');
const SNOW = C('#eef1f4');
const ICE_WHITE = C('#e9f0f7');
const ICE_PALE = C('#a9c6e2');
const ICE_SHADE = C('#7fa5d6');
const ICE_CYAN = C('#56c8ea');
const ICE_BLUE = C('#1b4fb0');
const WATER_TOP = C('#2c5466');
const WATER_DEEP = C('#13324a');
const GLACIER = C('#d3e0ec');
const GLACIER_DARK = C('#57779e');
const CORE = C('#ffffff');
const CORE_WATER = C('#bff3ff');
/** The waterline's thin line and the light shafts: they were additive white
    on igloo's dark water; here they are normal-blended pale ice, which reads
    the same over the water and cannot wash out to nothing on paper. */
const EDGE_COL = C('#e6f4fa');
const SHAFT_COL = C('#cfe6f0');
const INK = C('#17191c');
/** The hollow's light (igloo-hover-light.png): a hidden source in the middle
    of each half of the hollow, bright enough to whiten the far wall's inside
    without clipping it flat, fading over a few blocks. */
const CORE_AT = [0, 3.2, 0];
const CORE_AT_WATER = [0, -5.5, 0];
const CORE_I = 3.4;
const CORE_FALL = 1 / 81; // half strength 9 units out

/** The camera's pose (the source's last one): just above the waterline, 40
    units out, looking 3.6 degrees down. */
const CAM_TO = { target: [0, -1.37, 0], r: 40.08, phi: 1.5079, theta: 0, fov: 35 };
/** The mouse camera, from ascent-mountain/NOTES.md §1 scaled to this scene:
    yaw round the berg and a look-tilt at the screen's edge, how far the look
    target slides, the camera's rise, and the chase (1 - exp(-rate dt)). */
const MOUSE = { yaw: 0.08, tilt: 0.035, slide: 1.0, rise: 0.3, rate: 3.2 };
/** Depth 1 (the hero scrolled through): camera and look target this far
    down, so the camera sits under the waterline looking a little up at the
    surface from below. The camera stays at z ~ 40, well in front of the
    cut at FRONT_Z, so going under shows the cross-section, never the inside
    of the water. The clamp is relaxed from the source's 0.7 to allow it. */
const DEPTH = { camY: -9, targetY: -7, omega: 16 }; // omega 16: a critically damped ~0.25 s settle
const CAM_MIN_Y = -12;
const CAM_MIN_Z = FRONT_Z + 8;

/** Wind, NOTES §4: a gust every idle period, peaking 2.3 s after the pulse
    starts; 2.5 s up, 1 s at the top, 2.75 s down. */
const GUST = { lead: 0.2, rise: 2.5, hold: 1.0, fall: 2.75 };
const WIND = { calm: 1.2, gust: 6.0 }; // world units a second

const TEX = 16; // data texture side: 256 >= blocks
const NOISE_SIZE = 256;

const sstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// ── Shaders ────────────────────────────────────────────────────────────────

/** Shared by every material: the clock, the fog, the water, the load-in
    front. Unused parts compile away. */
const COMMON = /* glsl */ `
  uniform float uTime;
  uniform float uGust;
  uniform float uSpread;   // how far out the load-in front has reached, world units
  uniform float uClip;     // 1: reflection pass, drop y < 0; -1: refraction pass, drop y > 0
  uniform float uFogDensity;
  uniform vec3 uSun;
  uniform vec3 uFog;
  uniform vec3 uLoader;
  uniform vec3 uWaterTop;
  uniform vec3 uWaterDeep;
  uniform sampler2D uNoise;
  uniform sampler2D uSim;

  const float FRONT_Z = ${FRONT_Z.toFixed(1)};
  const float SIM_WORLD = ${SIM_WORLD.toFixed(1)};
  const float SIM_HEIGHT = ${SIM_HEIGHT.toFixed(3)};

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.07; a *= 0.5; }
    return s;
  }
  float grain(vec2 uv) { return texture2D(uNoise, uv).r; }

  // Soft overcast: a hemisphere from sky to ground, and a wrapped sun so
  // light bleeds round forms instead of cutting off.
  // Warmed and lifted from the source (0.22,0.25,0.32 -> 0.74,0.8,0.9): the page is warm paper.
  vec3 hemi(vec3 n) { return mix(vec3(0.3, 0.31, 0.33), vec3(0.84, 0.86, 0.88), n.y * 0.5 + 0.5); }
  float wrapDiffuse(vec3 n, vec3 L, float w) { return pow(clamp((dot(n, L) + w) / (1.0 + w), 0.0, 1.0), 1.3); }

  vec3 aboveFog(vec3 col, vec3 wp) {
    float d = max(length(cameraPosition - wp) - 30.0, 0.0);
    float f = 1.0 - exp(-pow(d * uFogDensity, 1.4));
    // Low mist over the far water and the glacier's foot, thicker in a gust.
    float low = (1.0 - smoothstep(0.0, 7.0, wp.y)) * smoothstep(50.0, 110.0, d);
    f = max(f, low * (0.16 + 0.12 * uGust));
    return mix(col, uFog, clamp(f, 0.0, 1.0));
  }

  // The water: a slow swell plus the simulated ripples.
  float swell(vec2 p) {
    float t = uTime;
    return 0.075 * sin(dot(p, vec2(0.42, 0.13)) + t * 0.9)
         + 0.045 * sin(dot(p, vec2(-0.21, 0.55)) + t * 1.15 + 1.3)
         + 0.022 * sin(dot(p, vec2(0.9, -0.6)) + t * 1.9 + 2.1);
  }
  vec2 swellGrad(vec2 p) {
    float t = uTime;
    return 0.075 * cos(dot(p, vec2(0.42, 0.13)) + t * 0.9) * vec2(0.42, 0.13)
         + 0.045 * cos(dot(p, vec2(-0.21, 0.55)) + t * 1.15 + 1.3) * vec2(-0.21, 0.55)
         + 0.022 * cos(dot(p, vec2(0.9, -0.6)) + t * 1.9 + 2.1) * vec2(0.9, -0.6);
  }
  float simH(vec2 p) { return texture2D(uSim, p / SIM_WORLD).r * SIM_HEIGHT; }
  float waterH(vec2 p) { return swell(p) + simH(p); }

  // How much water lies between the camera and a point: the water is
  // everything under y = 0 and behind the cut at z = FRONT_Z, so a ray
  // enters it through the surface or through the cross-section, whichever
  // it crosses last.
  float waterPath(vec3 wp) {
    vec3 ro = cameraPosition;
    vec3 rd = wp - ro;
    float L = length(rd);
    rd /= L;
    float tY = ro.y <= 0.0 ? 0.0 : (rd.y < -1e-4 ? ro.y / -rd.y : 1e9);
    float tZ = ro.z <= FRONT_Z ? 0.0 : (rd.z < -1e-4 ? (ro.z - FRONT_Z) / -rd.z : 1e9);
    return max(L - max(tY, tZ), 0.0);
  }
  vec3 waterCol(float y) { return mix(uWaterTop, uWaterDeep, smoothstep(0.0, -22.0, y)); }
  vec3 underwater(vec3 col, vec3 wp) {
    col *= exp(min(wp.y, 0.0) * 0.045); // the light from above dies with depth
    return mix(col, waterCol(wp.y), 1.0 - exp(-waterPath(wp) * 0.05));
  }

  // The load-in front (NOTES §1): square cells, each with its own nudge, so
  // the edge is stepped and ragged; rim is 1 right at the edge, where it
  // glows white.
  float spread(vec2 xz, out float rim) {
    float cell = 3.0 + min(9.0, abs(xz.y) * 0.03);
    vec2 c = floor(xz / cell);
    vec2 q = (c + 0.5) * cell;
    float d = length(vec2(q.x, q.y * 1.4)) + hash(c) * cell * 0.9;
    rim = 1.0 - smoothstep(0.0, cell * 0.6, uSpread - d);
    return step(d, uSpread);
  }

  // Caustics: a net of bright lines from two drifting cell patterns, bent by
  // the ripples overhead, fading with depth.
  float cellEdge(vec2 p, float t) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec2 b = vec2(float(x), float(y));
        vec2 o = 0.5 + 0.42 * sin(t + 6.2831 * hash2(i + b));
        float d = length(b + o - f);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
    return d2 - d1;
  }
  float caustic(vec3 wp) {
    float depth = max(-wp.y, 0.0);
    vec2 p = vec2(wp.x + wp.y * 0.25, wp.z + wp.y * 0.55);
    float e = SIM_WORLD / 128.0;
    vec2 g = vec2(simH(p + vec2(e, 0.0)) - simH(p - vec2(e, 0.0)), simH(p + vec2(0.0, e)) - simH(p - vec2(0.0, e))) / (2.0 * e);
    p += (g * 7.0 + swellGrad(p) * 2.0) * min(depth, 6.0);
    float a = cellEdge(p * 0.62 + vec2(uTime * 0.05, uTime * 0.03), uTime * 0.6);
    float b = cellEdge(p * 0.81 - vec2(uTime * 0.04, -uTime * 0.05) + 7.3, uTime * 0.5 + 2.0);
    float lines = (1.0 - smoothstep(0.0, 0.16, a)) * 0.6 + (1.0 - smoothstep(0.0, 0.12, b)) * 0.55;
    return lines * exp(-depth * 0.085);
  }

  // The deep water behind everything along view direction d (the source's
  // below-horizon sky): a point well behind the berg along the ray sets the
  // water's colour, so the water darkens down the frame. Shared with the
  // glacier's added deep face, which must look exactly like it.
  vec3 deepWater(vec3 d) {
    float t = d.z < -0.05 ? (cameraPosition.z + 30.0) / -d.z : 70.0;
    vec3 p = cameraPosition + d * min(t, 140.0);
    p.y = min(p.y, -0.3);
    float rim;
    float on = spread(p.xz, rim);
    vec3 water = waterCol(max(p.y, -26.0));
    water += vec3(0.04, 0.08, 0.12) * fbm(vec2(p.x * 0.05 + uTime * 0.01, p.y * 0.08)) * exp(p.y * 0.08);
    return mix(uLoader, water, on);
  }
`;

const GRAIN = /* glsl */ `
  vec3 triWeights(vec3 n) { vec3 w = abs(n); w = w * w * w * w; return w / (w.x + w.y + w.z); }
  float triGrain(vec3 p, vec3 n, float sc) {
    vec3 w = triWeights(n);
    return grain(p.xz * sc) * w.y + grain(p.xy * sc) * w.z + grain(p.zy * sc) * w.x;
  }
  vec3 triBump(vec3 p, vec3 n, float sc, float amt) {
    vec3 w = triWeights(n);
    float e = 1.0 / ${NOISE_SIZE}.0;
    vec2 uv = p.xz * sc; float h = grain(uv);
    vec2 g = vec2(grain(uv + vec2(e, 0.0)) - h, grain(uv + vec2(0.0, e)) - h);
    vec3 b = vec3(-g.x, 0.0, -g.y) * w.y;
    uv = p.xy * sc; h = grain(uv);
    g = vec2(grain(uv + vec2(e, 0.0)) - h, grain(uv + vec2(0.0, e)) - h);
    b += vec3(-g.x, -g.y, 0.0) * w.z;
    uv = p.zy * sc; h = grain(uv);
    g = vec2(grain(uv + vec2(e, 0.0)) - h, grain(uv + vec2(0.0, e)) - h);
    b += vec3(0.0, -g.y, -g.x) * w.x;
    return normalize(n + b * amt * ${NOISE_SIZE}.0 * 0.5);
  }
`;

// The blocks. position is the block's rest geometry; the only thing the
// vertex shader adds is dir * d.
const BLOCK_VERT = /* glsl */ `
  uniform sampler2D uBlock;  // xyz dir, w d
  attribute float aId;
  attribute float aU;        // 0 inner face .. 0.1 inner lip .. 0.9 outer lip .. 1 outer face
  varying vec3 vWorld;
  varying vec3 vRest;
  varying float vU;
  varying float vId;
  void main() {
    ivec2 c = ivec2(int(mod(aId, ${TEX}.0)), int(floor(aId / ${TEX}.0)));
    vec4 B = texelFetch(uBlock, c, 0);
    vec3 p = position + B.xyz * B.w;
    vRest = position;
    vWorld = p;
    vU = aU;
    vId = aId;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const BLOCK_FRAG = /* glsl */ `
  ${COMMON}
  ${GRAIN}
  uniform sampler2D uBlock;
  uniform sampler2D uGlow;   // r own opening 0..1, g neighbourhood opening, b seed, a 1 above water
  uniform vec3 uIceWhite, uIcePale, uIceShade, uIceCyan, uIceBlue, uCore, uCoreWater;
  uniform float uCoreOn;     // the hollow's light
  uniform vec3 uCoreAt, uCoreAtWater; // where it sits, above and below the waterline
  uniform float uCoreI;      // its strength
  uniform float uCoreFall;   // 1 / (1 + d^2 * fall)
  varying vec3 vWorld;
  varying vec3 vRest;
  varying float vU;
  varying float vId;

  void main() {
    if (uClip > 0.5 && vWorld.y < 0.0) discard;
    if (uClip < -0.5 && vWorld.y > 0.0) discard;

    // vId arrives interpolated (37.0 can be 36.9999): round before using it.
    float id = floor(vId + 0.5);
    ivec2 c = ivec2(int(mod(id, ${TEX}.0)), int(floor(id / ${TEX}.0)));
    vec4 G = texelFetch(uGlow, c, 0);
    float open = G.r;
    float near = G.g;
    float seed = G.b;
    bool above = G.a > 0.5;

    vec3 V = normalize(cameraPosition - vWorld);
    // The side of the face we are looking at: on the inside of the far wall
    // that is the side facing the hollow.
    vec3 n0 = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(n0, V) < 0.0) n0 = -n0;
    // Added for the descent: the tip's blocks end in flat bottoms on y = 0,
    // the same plane as the water. From under the surface the swell's troughs
    // uncover them as grey slivers along the berg's waterline; the water's
    // underside belongs there, so they are dropped and the surface shows.
    if (above && uClip < 0.5 && cameraPosition.y < 0.0 && vRest.y < 0.12 && n0.y < -0.3) discard;
    vec3 Ls = normalize(uSun);

    float inner = 1.0 - smoothstep(0.08, 0.12, vU);         // the hollow's faces
    float side = smoothstep(0.08, 0.12, vU) * (1.0 - smoothstep(0.88, 0.92, vU)); // the seams' walls
    float bevel = smoothstep(0.88, 0.92, vU) * (1.0 - smoothstep(0.985, 0.999, vU));
    float face = smoothstep(0.985, 0.999, vU);

    vec3 col;
    vec3 n;
    vec3 albedo;
    if (above) {
      // White ice with pale blue facets: each flat facet takes its own tint
      // from its normal, so the planes read; a frosted grain over it.
      float facet = fract(sin(dot(floor(n0 * 6.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      n = triBump(vWorld * 1.0 + seed * 9.0, n0, 0.55, 0.035);
      vec3 base = mix(uIceWhite, uIcePale, 0.18 + 0.5 * facet * facet);
      float frost = triGrain(vWorld + seed * 5.0, n0, 1.7);
      base *= 0.9 + 0.16 * frost;
      albedo = base;
      float sun = wrapDiffuse(n, Ls, 0.35);
      col = base * (hemi(n) * 0.56 + vec3(1.0, 0.99, 0.97) * sun * 0.36);
      col = mix(col, uIceShade * hemi(n) * 0.95, (1.0 - sun) * 0.5);
      float H = pow(max(dot(n, normalize(Ls + V)), 0.0), 50.0);
      col += vec3(0.25) * H;
      // Bright, soft edges: the bevel catches the sky and the sun.
      col += bevel * vec3(0.16, 0.18, 0.2);
    } else {
      // Underwater: translucent cyan to deep blue with long vertical facets,
      // lit from above through the water, caustics running over it.
      float facet = fract(sin(dot(floor(n0 * 5.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      float streak = grain(vec2(vWorld.x * 0.9 + vWorld.z * 0.6 + seed * 3.0, vWorld.y * 0.05));
      n = normalize(n0 + vec3(streak - 0.5, 0.0, 0.0) * 0.5);
      float depthK = smoothstep(0.5, ${(Y_BOTTOM * 0.85).toFixed(2)}, vWorld.y);
      vec3 base = mix(uIceCyan, uIceBlue, clamp(depthK * 0.85 + facet * 0.35 - 0.1, 0.0, 1.0));
      // Lit from inside, the ice shows its pale body colour, not the deep
      // blue the water lends it from outside.
      albedo = mix(uIceWhite, uIceCyan, 0.35) * (0.82 + 0.25 * streak);
      float lit = 0.38 + 0.62 * clamp(dot(n, normalize(vec3(-0.25, 1.0, 0.4))) * 0.5 + 0.5, 0.0, 1.0);
      col = base * lit * (0.75 + 0.25 * streak);
      col += vec3(0.62, 0.92, 1.0) * caustic(vWorld) * (0.45 + 0.4 * face) * (1.0 - inner);
      col += bevel * vec3(0.12, 0.2, 0.26);
    }

    // The hollow's light: no visible source, a point light at the hollow's
    // centre (a cyan one for the underwater part) lighting the ice around
    // it. A face gets it by the angle it makes to the light, falling off
    // with distance, over its own texture - so the far wall's inside reads
    // as bright blocks with their seams, and anything turned away gets none.
    // It reaches a face only where the face can see the centre: the hollow's
    // faces always; the seam walls from the inside edge out, further as the
    // block or a neighbour opens; the outer faces only as a spill on the
    // rims next to an open gap. Daylight never reaches inside.
    vec3 core = above ? uCore : uCoreWater;
    vec3 Lc = (above ? uCoreAt : uCoreAtWater) - vWorld;
    float dist = length(Lc);
    Lc /= dist;
    float fall = 1.0 / (1.0 + dist * dist * uCoreFall);
    float expo = max(open, near);
    float wallT = clamp((vU - 0.1) / 0.8, 0.0, 1.0);
    // Seam walls are planes through the centre, so the light only grazes
    // them: take a wrapped angle there.
    float lam = mix(max(dot(n, Lc), 0.0), 0.45 + 0.3 * max(dot(n, Lc) + 0.5, 0.0), side);
    float reach = inner
      + side * exp(-wallT * mix(5.0, 0.9, expo)) * (0.2 + 1.3 * expo)
      + (bevel * 0.5 + face * 0.1) * near * near;
    // A soft shoulder instead of a clip: the brightest faces come up to just
    // under white and keep their facets and seams.
    float e = uCoreI * lam * fall * reach * (above ? 1.0 : 1.35);
    vec3 coreLit = albedo * core * 1.12 * (1.0 - exp(-e));
    col = mix(col, albedo * hemi(n) * 0.07, inner);  // no daylight in the hollow
    col = mix(col, col * 0.8, side);
    // At rest the light shows only as a faint line in every seam.
    col += core * side * exp(-wallT * 4.5) * 0.35 * uCoreOn;

    // Under water the hollow's light is in the water too: it is not dimmed
    // by depth like the daylight, only scattered on its way to the eye.
    coreLit *= uCoreOn;
    // Added for the descent: from a camera under the waterline, a face above
    // y = 0 seen through the cut below it (through the hollow's opening in the
    // surface) is seen through water too, not through the daylit fog.
    bool wet = vWorld.y < 0.0;
    if (!wet && cameraPosition.y < 0.0 && cameraPosition.z > FRONT_Z) {
      vec3 rd = vWorld - cameraPosition;
      wet = cameraPosition.y + rd.y * (cameraPosition.z - FRONT_Z) / max(-rd.z, 1e-4) < 0.0;
    }
    col = wet
      ? underwater(col, vWorld) + coreLit * exp(-waterPath(vWorld) * 0.03)
      : aboveFog(col + coreLit, vWorld);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

// The ranges above the glacier: igloo's terrain - rock with snow in every
// hollow and on every flat, softening into blue-grey haze with distance.
const TERRAIN_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vWorld = position;
    vNormal = normal;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;
const TERRAIN_FRAG = /* glsl */ `
  ${COMMON}
  ${GRAIN}
  uniform vec3 uRock, uRockLight, uSnow;
  uniform float uHaze;  // 1 = far ranges fully hazed (before they arrive)
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    float rim;
    if (spread(vWorld.xz, rim) < 0.5) discard;
    vec3 n0 = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 Ls = normalize(uSun);
    float dist = length(cameraPosition - vWorld);
    float mid = 1.0 - smoothstep(110.0, 300.0, dist);
    float lump = triGrain(vWorld, n0, 0.05);
    float fine = triGrain(vWorld, n0, 0.35);
    vec3 n = triBump(vWorld, n0, 0.05, 0.12 * (0.3 + 0.7 * mid));
    n = triBump(vWorld, n, 0.4, 0.05 * mid);
    vec3 rock = mix(uRock, uRockLight, fine * 0.45 + lump * 0.5);
    rock *= 0.72 + 0.55 * lump;
    // Snow settles where it is flat and in the low spots, swept into streaks.
    float level = n0.y + 0.55 * (0.5 - lump) + 0.06 * (fine - 0.5);
    float cover = smoothstep(0.86, 0.98, level);
    float streak = grain(vec2(vWorld.x * 0.05 + vWorld.z * 0.2, vWorld.z * 0.01));
    vec3 base = mix(rock, uSnow * (0.93 + 0.1 * streak), cover);
    vec3 col = base * (hemi(n) * 0.9 + vec3(1.0, 0.98, 0.95) * wrapDiffuse(n, Ls, 0.5) * 0.7);
    col = aboveFog(col, vWorld);
    col = mix(col, uFog, uHaze * 0.85);
    col = mix(col, vec3(1.25), rim * 0.45);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

// The glacier wall: blue-white ice cliffs, darker blue in the cracks.
const GLACIER_VERT = /* glsl */ `
  attribute float aFace;   // how far the face stands proud (- in a crevasse)
  attribute float aTop;    // 1 on the lip
  varying vec3 vWorld;
  varying float vFace;
  varying float vTop;
  void main() {
    vWorld = position;
    vFace = aFace;
    vTop = aTop;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;
const GLACIER_FRAG = /* glsl */ `
  ${COMMON}
  uniform vec3 uIce, uIceDark, uSnow;
  varying vec3 vWorld;
  varying float vFace;
  varying float vTop;
  void main() {
    // Derivatives first, before any branch or discard: a quad straddling the
    // deep-water branch below otherwise gets undefined dFdx/dFdy, a NaN normal
    // and black pixels (seen on ANGLE/D3D11 at the far waterline).
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (uClip > 0.5 && vWorld.y < -0.05) discard;
    // The deep rows buildGlacier adds only have to hide what lies behind them:
    // they show the deep water the sky would. Seen from under the surface the
    // whole submerged face does the same; from above, the source's foot
    // (-0.6..0, glimpsed between the water's edge and the face) stays ice.
    // The mirrored reflection camera is also below 0, hence the uClip test.
    // (0.3, not 0: the swell's crests stand above y = 0, and the face just over
    // them must not show as a sliver under the surface's far edge.)
    if (vWorld.y < -0.7 || (vWorld.y < 0.3 && cameraPosition.y < 0.0 && uClip < 0.5)) {
      gl_FragColor = vec4(deepWater(normalize(vWorld - cameraPosition)), 1.0);
      #include <colorspace_fragment>
      return;
    }
    float rim;
    if (spread(vWorld.xz, rim) < 0.5) discard;
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(n, V) < 0.0) n = -n;
    vec3 Ls = normalize(uSun);
    float crack = 1.0 - smoothstep(-1.4, 0.6, vFace);
    float striae = grain(vec2(vWorld.x * 0.35, vWorld.y * 0.03));
    vec3 ice = mix(uIce, uIceDark, clamp(crack * 0.9 + (striae - 0.5) * 0.35, 0.0, 1.0));
    ice *= 0.85 + 0.25 * grain(vec2(vWorld.x * 1.3, vWorld.y * 0.4));
    vec3 col = ice * (hemi(n) * 0.75 + vec3(1.0, 0.98, 0.95) * wrapDiffuse(n, Ls, 0.4) * 0.45);
    col = mix(col, uSnow * (hemi(n) * 0.85 + 0.25), vTop);
    col = aboveFog(col, vWorld);
    col = mix(col, vec3(1.25), rim * 0.45);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

// The water's surface.
const WATER_VERT = /* glsl */ `
  ${COMMON}
  uniform mat4 uReflMatrix;
  varying vec3 vWorld;
  varying vec4 vRefl;
  void main() {
    vec3 p = position;
    p.y = waterH(p.xz);
    vWorld = p;
    vRefl = uReflMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;
const WATER_FRAG = /* glsl */ `
  ${COMMON}
  uniform sampler2D uRefl;
  uniform sampler2D uRefr;
  uniform vec2 uRes;
  uniform sampler2D uHole;   // the hollow's radius at the waterline, by angle round C
  varying vec3 vWorld;
  varying vec4 vRefl;
  void main() {
    float rim;
    if (spread(vWorld.xz, rim) < 0.5) discard;
    // The hollow is one room above and below the waterline: no water surface
    // inside it, so through an opening in the tip you look down into the
    // lit underwater half.
    float ang = atan(vWorld.z, vWorld.x) / 6.2831853 + 0.5;
    if (length(vWorld.xz) < texture2D(uHole, vec2(ang, 0.5)).r) discard;
    float e = SIM_WORLD / 128.0;
    vec2 p = vWorld.xz;
    vec2 g = swellGrad(p) + vec2(simH(p + vec2(e, 0.0)) - simH(p - vec2(e, 0.0)), simH(p + vec2(0.0, e)) - simH(p - vec2(0.0, e))) / (2.0 * e);
    vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 V = normalize(cameraPosition - vWorld);
    // Added for the scroll descent: seen from under the surface (through the
    // cut), the surface is lit sky inside Snell's window and the water
    // mirrored back outside it; the reflection pass is skipped down here.
    if (cameraPosition.y < vWorld.y) {
      float cu = max(dot(-N, V), 0.0);
      float window = smoothstep(0.6, 0.72, cu);
      vec3 tir = mix(uWaterTop, uWaterDeep, 0.35) * (1.15 + 0.5 * length(g));
      vec3 under = mix(tir, mix(uFog, uWaterTop, 0.35), window);
      under += vec3(0.08, 0.12, 0.13) * smoothstep(0.02, 0.12, length(g) - 0.06);
      gl_FragColor = vec4(underwater(under, vWorld - vec3(0.0, 0.05, 0.0)), 1.0);
      #include <colorspace_fragment>
      return;
    }
    float cosT = max(dot(N, V), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
    // Reflection: the mirrored camera's picture, bent by the surface.
    vec2 ruv = vRefl.xy / vRefl.w + N.xz * vec2(0.03, 0.06);
    vec3 refl = texture2D(uRefl, ruv).rgb;
    // Refraction: what lies under the surface, from the pass that drew it.
    vec2 suv = gl_FragCoord.xy / uRes + N.xz * vec2(0.02, 0.035);
    // The top metre of water scatters light back: from above it is never as
    // dark as the deep behind the cut.
    vec3 refr = mix(texture2D(uRefr, suv).rgb, uWaterTop * 1.7, 0.3);
    vec3 col = mix(refr, refl, clamp(F, 0.0, 1.0));
    float spec = pow(max(dot(reflect(-V, N), normalize(uSun)), 0.0), 260.0);
    col += vec3(1.0, 0.98, 0.94) * spec * 1.2;
    col = aboveFog(col, vWorld);
    col = mix(col, vec3(1.25), rim * 0.45);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

// The bright thin line where the surface meets the cross-section, and the
// light it lets into the top of the water.
const EDGE_VERT = /* glsl */ `
  ${COMMON}
  attribute float aDrop;   // how far under the surface this row hangs
  attribute float aGlow;
  varying float vGlow;
  varying vec3 vWorld;
  void main() {
    vec3 p = position;
    p.y = waterH(p.xz) - aDrop;
    vGlow = aGlow;
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;
const EDGE_FRAG = /* glsl */ `
  ${COMMON}
  uniform float uOn;
  uniform vec3 uCol;
  varying float vGlow;
  varying vec3 vWorld;
  void main() {
    float rim;
    float on = spread(vWorld.xz, rim);
    // Normal-blended pale ice instead of the source's additive cyan-white.
    float a = clamp(vGlow * 0.7, 0.0, 1.0) * on * uOn;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uCol, a);
    #include <colorspace_fragment>
  }
`;

// The sky and, below the horizon, the deep water behind everything.
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const SKY_FRAG = /* glsl */ `
  ${COMMON}
  uniform vec3 uTop, uHorizon;
  uniform float uSky;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    // Added for the descent: with the camera under the waterline a ray can
    // look up and still be in the water, if it went in through the cut below
    // y = 0. Such a ray sees water, not sky.
    float yg = 1.0;
    if (cameraPosition.z > FRONT_Z && d.z < -1e-4) yg = cameraPosition.y + d.y * (cameraPosition.z - FRONT_Z) / -d.z;
    bool wet = d.y < 0.0 || yg < 0.0;
    vec3 col;
    if (!wet || uClip > 0.5) {
      float h = clamp(d.y, 0.0, 1.0);
      col = mix(uHorizon, uTop, pow(h, 0.55));
      col = mix(uLoader, col, uSky);
    } else {
      col = deepWater(d);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

// Soft light shafts from the surface, in front of everything under water.
const SHAFT_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = position;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;
const SHAFT_FRAG = /* glsl */ `
  ${COMMON}
  uniform float uOn;
  uniform vec3 uCol;
  varying vec3 vWorld;
  void main() {
    float rim;
    if (spread(vec2(vWorld.x, 0.0), rim) < 0.5) discard;
    float s = fbm(vec2(vWorld.x * 0.11 + vWorld.y * 0.045 + uTime * 0.03, uTime * 0.04));
    float rays = smoothstep(0.42, 0.78, s);
    float a = rays * exp(vWorld.y * 0.085) * 0.13 * uOn * (1.0 - smoothstep(-0.6, 0.0, vWorld.y));
    // Normal-blended pale light: about the source's additive brightness over
    // this water, without the additive pass.
    a *= 1.6;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uCol, a);
    #include <colorspace_fragment>
  }
`;

// Snow in the air: short streaks, one line each, drawn back along their own
// velocity so they blur with speed. White snow vanished against the paper
// sky, so here it is ink at a low alpha (and the spindrift is gone).
const STREAK_VERT = /* glsl */ `
  ${COMMON}
  uniform float uWindX;
  uniform float uWindV;
  uniform vec3 uBox;      // half-size x, height y, depth z of the wrap box
  uniform vec3 uBoxAt;    // the box's centre (x, bottom y, z)
  attribute float aSeed;
  attribute float aEnd;
  varying float vA;
  varying vec3 vWorld;
  void main() {
    vec3 p = position;
    float sp = 0.7 + 0.6 * aSeed;
    float fall = 0.8 + 0.8 * aSeed;
    p.y = uBoxAt.y + mod(p.y - uTime * fall - uBoxAt.y, uBox.y);
    p.x = uBoxAt.x - uBox.x + mod(p.x + uWindX * sp + sin(uTime * 0.4 + aSeed * 40.0) * 1.2 - uBoxAt.x + uBox.x, 2.0 * uBox.x);
    p.z += cos(uTime * 0.3 + aSeed * 23.0) * 0.8;
    vec3 vel = vec3(uWindV * sp, -fall, 0.0);
    p -= vel * aEnd * 0.05;
    vWorld = p;
    vA = 0.34 * (1.0 - smoothstep(0.0, 0.6, -p.y + 0.6));
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;
const STREAK_FRAG = /* glsl */ `
  uniform float uAlpha;
  uniform vec3 uCol;
  varying float vA;
  varying vec3 vWorld;
  void main() {
    if (vWorld.y < 0.05) discard;
    gl_FragColor = vec4(uCol, vA * uAlpha * 0.22);
    #include <colorspace_fragment>
  }
`;

// A few particles drifting in the water.
const MOTE_VERT = /* glsl */ `
  ${COMMON}
  uniform float uSize;
  attribute float aSeed;
  varying float vA;
  varying vec3 vWorld;
  void main() {
    vec3 p = position;
    p += vec3(sin(uTime * 0.11 + aSeed * 30.0) * 1.4, sin(uTime * 0.07 + aSeed * 12.0) * 0.9, cos(uTime * 0.09 + aSeed * 21.0) * 1.1);
    vWorld = p;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (0.6 + aSeed) / -mv.z;
    vA = 0.5 * (1.0 - smoothstep(-1.2, -0.2, p.y));
    gl_Position = projectionMatrix * mv;
  }
`;
const MOTE_FRAG = /* glsl */ `
  ${COMMON}
  uniform float uAlpha;
  varying float vA;
  varying vec3 vWorld;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d) * vA * uAlpha * exp(-waterPath(vWorld) * 0.05);
    if (a < 0.01) discard;
    gl_FragColor = vec4(0.72, 0.92, 1.0, a);
    #include <colorspace_fragment>
  }
`;

// ── Geometry ───────────────────────────────────────────────────────────────

/** Every block into one indexed geometry: rest positions, block id, aU. */
function buildBlockGeometry(blocks) {
  let nv = 0;
  let ni = 0;
  for (const b of blocks) {
    nv += b.pos.length / 3;
    ni += b.index.length;
  }
  const pos = new Float32Array(nv * 3);
  const ids = new Float32Array(nv);
  const us = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  let v = 0;
  let k = 0;
  for (const b of blocks) {
    pos.set(b.pos, v * 3);
    us.set(b.u, v);
    ids.fill(b.id, v, v + b.pos.length / 3);
    for (const i of b.index) idx[k++] = v + i;
    v += b.pos.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aId', new THREE.BufferAttribute(ids, 1));
  g.setAttribute('aU', new THREE.BufferAttribute(us, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -1, 0), 18);
  return g;
}

/** A grid from two lists of coordinates. */
function grid(xs, zs, at) {
  const pos = new Float32Array(xs.length * zs.length * 3);
  let o = 0;
  for (const z of zs)
    for (const x of xs) {
      const p = at(x, z);
      pos[o++] = p[0];
      pos[o++] = p[1];
      pos[o++] = p[2];
    }
  const idx = [];
  const row = xs.length;
  for (let j = 0; j < zs.length - 1; j++)
    for (let i = 0; i < row - 1; i++) {
      const a = j * row + i;
      // Wound to face up (+y): the camera looks down on all of it.
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Coordinates from a to b, spaced by step(t) (finer where it matters). */
function stops(a, b, step) {
  const out = [a];
  let x = a;
  const dir = Math.sign(b - a);
  while ((b - x) * dir > 0) {
    x += step(x) * dir;
    out.push((b - x) * dir > 0 ? x : b);
  }
  return out;
}
const symmetric = (half, step) => {
  const right = stops(0, half, step);
  return [...right.slice(1).reverse().map((x) => -x), ...right];
};

/** coarse (the low tier): twice the spacing, a quarter of the vertices. The
    ranges sit deep in the fog, so the lost detail barely shows in a figure. */
function buildTerrain(coarse = false) {
  const k = coarse ? 2 : 1;
  const xs = symmetric(HALF_W, (x) => (x < 160 ? 1.6 : 4) * k);
  const zs = stops(GLACIER_Z - 2, FAR_Z, (z) => (1.2 + Math.min(4, (GLACIER_Z - z) * 0.02)) * k);
  const g = grid(xs, zs, (x, z) => [x, height(x, z), z]);
  g.computeVertexNormals();
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 20, -200), 420);
  return g;
}

/** The glacier's face: a sheet from just under the water up to its ragged
    top edge, pushed in and out by its ribs and crevasses, with a short lip
    back over the top so it has a top. */
function buildGlacier() {
  const xs = symmetric(HALF_W, (x) => (x < 140 ? 0.6 : 2.5));
  const rows = 22;
  // Added for the descent: the face carries on down into the deep, so a
  // camera under the waterline cannot look under the glacier's foot (y -0.6
  // in the source) and up at the backs of the ranges.
  const DEEP = [-80, -30, -10, -3];
  const pos = [];
  const face = [];
  const top = [];
  for (let k = 0; k < DEEP.length; k++)
    for (const x of xs) {
      const f = glacierFace(x, DEEP[k]);
      pos.push(x, DEEP[k], GLACIER_Z + f);
      face.push(f);
      top.push(0);
    }
  for (let r = 0; r <= rows + 2; r++)
    for (const x of xs) {
      const yt = glacierTop(x);
      if (r <= rows) {
        const y = -0.6 + ((yt + 0.6) * r) / rows;
        const f = glacierFace(x, y) * (r === rows ? 0.6 : 1);
        pos.push(x, y, GLACIER_Z + f);
        face.push(f);
        top.push(0);
      } else {
        const back = r - rows; // 1, 2
        pos.push(x, yt - 0.05 * back, GLACIER_Z + glacierFace(x, yt) * 0.6 - back * 1.6);
        face.push(0.5);
        top.push(1);
      }
    }
  const idx = [];
  const row = xs.length;
  for (let j = 0; j < DEEP.length + rows + 2; j++)
    for (let i = 0; i < row - 1; i++) {
      const a = j * row + i;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFace', new THREE.Float32BufferAttribute(face, 1));
  g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, GLACIER_Z), HALF_W + 10);
  return g;
}

/** The water's surface: from the cut back to the glacier, dense near the
    cut (where the waves show at the edge) and in the middle of the frame. */
function buildWater() {
  const xs = symmetric(HALF_W, (x) => (x < 45 ? 0.35 : x < 130 ? 2 : 8));
  // Runs on 3 units behind the glacier's plane (the source stopped 0.5 in
  // front): the face is pushed in by up to ~2 units, and from under the water
  // the gap between the surface's edge and the face showed as a line.
  const zs = stops(FRONT_Z, GLACIER_Z - 3, (z) => 0.3 + (FRONT_Z - z) * 0.05);
  const g = grid(xs, zs, (x, z) => [x, 0, z]);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -20), HALF_W + 50);
  return g;
}

/** The cut's top edge: three rows hanging from the surface - a thin bright
    line, then a soft glow fading a little way down into the water. */
function buildEdge() {
  const xs = symmetric(HALF_W, (x) => (x < 45 ? 0.25 : x < 130 ? 1.5 : 6));
  const rowsY = [-0.012, 0.035, 0.09, 0.9];
  const glow = [1.5, 1.1, 0.16, 0];
  const pos = [];
  const drop = [];
  const gl = [];
  rowsY.forEach((d, r) => {
    for (const x of xs) {
      pos.push(x, 0, FRONT_Z + 0.02);
      drop.push(d);
      gl.push(glow[r]);
    }
  });
  const idx = [];
  const row = xs.length;
  for (let j = 0; j < rowsY.length - 1; j++)
    for (let i = 0; i < row - 1; i++) {
      const a = j * row + i;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDrop', new THREE.Float32BufferAttribute(drop, 1));
  g.setAttribute('aGlow', new THREE.Float32BufferAttribute(gl, 1));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, FRONT_Z), HALF_W);
  return g;
}

/** A vertical quad. */
function plane(x0, x1, y0, y1, z) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** Streaks: two vertices per flake (head and tail), scattered in a box. */
function buildStreaks(n, box, at, seed0) {
  const pos = new Float32Array(n * 6);
  const seed = new Float32Array(n * 2);
  const end = new Float32Array(n * 2);
  let s = seed0;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const x = at[0] + (rnd() * 2 - 1) * box[0];
    const y = at[1] + rnd() * box[1];
    const z = at[2] + (rnd() * 2 - 1) * box[2];
    const sd = rnd();
    pos.set([x, y, z, x, y, z], i * 6);
    seed.set([sd, sd], i * 2);
    end.set([0, 1], i * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  return g;
}

function buildMotes(n) {
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  let s = 515;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    pos.set([(rnd() * 2 - 1) * 28, -0.8 - rnd() * 24, -14 + rnd() * 27], i * 3);
    seed[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  return g;
}

/** A tileable grain: four octaves of periodic value noise, baked once. */
function noiseTexture() {
  const N = NOISE_SIZE;
  const data = new Uint8Array(N * N);
  const lat = (period) => {
    const cells = new Float32Array(period * period);
    let s = period * 7919 + 13;
    for (let i = 0; i < cells.length; i++) cells[i] = (s = (s * 16807) % 2147483647) / 2147483647;
    return (u, v) => {
      const x = (u * period) % period;
      const y = (v * period) % period;
      const i = Math.floor(x);
      const j = Math.floor(y);
      let fx = x - i;
      let fy = y - j;
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      const c = (a, b) => cells[((a % period) + period) % period + (((b % period) + period) % period) * period];
      return (c(i, j) * (1 - fx) + c(i + 1, j) * fx) * (1 - fy) + (c(i, j + 1) * (1 - fx) + c(i + 1, j + 1) * fx) * fy;
    };
  };
  const octs = [lat(8), lat(16), lat(32), lat(64)];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      const n = octs[0](u, v) * 0.45 + octs[1](u, v) * 0.27 + octs[2](u, v) * 0.18 + octs[3](u, v) * 0.1;
      data[y * N + x] = Math.round(Math.min(1, Math.max(0, n)) * 255);
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function dataTexture(arr) {
  const t = new THREE.DataTexture(arr, TEX, TEX, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

// ── Scene ──────────────────────────────────────────────────────────────────

/** Ascent's timeline at T.end (3.9 s, Ascent.js _apply): the berg built and
    cooled, the world spread out to the ranges, the camera landed, weather
    and hover on. The figure applies this once and never plays the load-in. */
export const END_STATE = { spread: 680, far: 1, weather: 1, hover: 1, motion: 1 };

export class IcebergScene {
  /** Throws if WebGL2 is unavailable; the figure host shows the poster instead.
      tier 'low': coarse ranges, coarse reflections, no decoration. */
  constructor(canvas, { dpr = Math.min(window.devicePixelRatio || 1, 1.5), tier = 'high' } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    if (!this.renderer.capabilities.isWebGL2) throw new Error('WebGL2 unavailable');
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(SKY_TOP, 1);
    this.tier = tier;
    this.lowRefl = tier === 'low';

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAM_TO.fov, 1, 0.5, 900);
    this.reflCam = new THREE.PerspectiveCamera();
    this.reflCam.layers.set(2);
    this.refrCam = new THREE.PerspectiveCamera();
    this.refrCam.layers.set(1);

    // ── The berg ──
    this.blocks = buildBlocks();
    this.motion = new BergMotion(this.blocks);
    const n = this.blocks.length;
    if (n > TEX * TEX) throw new Error('too many blocks for the data texture');
    this.blockData = new Float32Array(TEX * TEX * 4);
    this.glowData = new Float32Array(TEX * TEX * 4);
    this.blocks.forEach((b, i) => {
      this.blockData.set([b.dir[0], b.dir[1], b.dir[2], 0], i * 4);
      this.glowData.set([0, 0, b.seed, b.above ? 1 : 0], i * 4);
    });
    // Neighbours, for the light spilling onto the blocks round an open one.
    this.neighbours = this.blocks.map((b) =>
      this.blocks.filter((q) => q !== b && Math.hypot(q.anchor[0] - b.anchor[0], q.anchor[1] - b.anchor[1], q.anchor[2] - b.anchor[2]) < BLOCK_W * 1.45).map((q) => q.id),
    );
    this.texBlock = dataTexture(this.blockData);
    this.texGlow = dataTexture(this.glowData);
    this.texNoise = noiseTexture();
    // The hollow's inner wall where it meets the waterline, one radius per
    // angle round C (atan(z, x) from -pi .. pi), for the hole in the water.
    {
      const N = 256;
      const hole = new Float32Array(N * 4);
      for (let i = 0; i < N; i++) {
        const a = ((i + 0.5) / N - 0.5) * Math.PI * 2;
        hole[i * 4] = innerR(Math.cos(a), 0, Math.sin(a)) - 0.03;
      }
      this.texHole = new THREE.DataTexture(hole, N, 1, THREE.RGBAFormat, THREE.FloatType);
      this.texHole.wrapS = THREE.RepeatWrapping;
      this.texHole.minFilter = THREE.NearestFilter;
      this.texHole.magFilter = THREE.NearestFilter;
      this.texHole.needsUpdate = true;
    }

    // ── The water's height field ──
    this.sim = new WaterSim(this.renderer, 128);
    this.simAcc = 0;

    // ── Uniforms everything shares ──
    this.u = {
      uTime: { value: 0 },
      uGust: { value: 0 },
      uSpread: { value: 0 },
      uClip: { value: 0 },
      uFogDensity: { value: 0.0062 },
      uSun: { value: new THREE.Vector3(-0.6, 0.62, 0.5) },
      uFog: { value: FOG },
      uLoader: { value: LOADER },
      uWaterTop: { value: WATER_TOP },
      uWaterDeep: { value: WATER_DEEP },
      uNoise: { value: this.texNoise },
      uSim: { value: this.sim.texture },
    };
    const U = (extra) => ({ ...this.u, ...extra });
    const mat = (uniforms, vertexShader, fragmentShader, opts = {}) =>
      new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, ...opts });
    const add = (obj, layers = [0]) => {
      obj.frustumCulled = false;
      obj.layers.disableAll();
      for (const l of layers) obj.layers.enable(l);
      this.scene.add(obj);
      return obj;
    };

    this.uBlocks = U({
      uBlock: { value: this.texBlock },
      uGlow: { value: this.texGlow },
      uIceWhite: { value: ICE_WHITE },
      uIcePale: { value: ICE_PALE },
      uIceShade: { value: ICE_SHADE },
      uIceCyan: { value: ICE_CYAN },
      uIceBlue: { value: ICE_BLUE },
      uCore: { value: CORE },
      uCoreWater: { value: CORE_WATER },
      uCoreOn: { value: 0 },
      uCoreAt: { value: new THREE.Vector3(...CORE_AT) },
      uCoreAtWater: { value: new THREE.Vector3(...CORE_AT_WATER) },
      uCoreI: { value: CORE_I },
      uCoreFall: { value: CORE_FALL },
    });
    this.berg = add(new THREE.Mesh(buildBlockGeometry(this.blocks), mat(this.uBlocks, BLOCK_VERT, BLOCK_FRAG, { side: THREE.DoubleSide })), [0, 1, 2]);

    this.uTerrain = U({ uRock: { value: ROCK }, uRockLight: { value: ROCK_LIGHT }, uSnow: { value: SNOW }, uHaze: { value: 1 } });
    this.terrain = add(new THREE.Mesh(buildTerrain(tier === 'low'), mat(this.uTerrain, TERRAIN_VERT, TERRAIN_FRAG)), [0, 2]);

    this.glacier = add(
      new THREE.Mesh(buildGlacier(), mat(U({ uIce: { value: GLACIER }, uIceDark: { value: GLACIER_DARK }, uSnow: { value: SNOW } }), GLACIER_VERT, GLACIER_FRAG)),
      [0, 2],
    );

    // Reflection and refraction are drawn at reduced resolution each frame
    // (skipped entirely while the camera is under the surface).
    const rtOpts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.reflRT = new THREE.WebGLRenderTarget(4, 4, rtOpts);
    this.refrRT = new THREE.WebGLRenderTarget(4, 4, rtOpts);
    this.reflMatrix = new THREE.Matrix4();
    this.uWater = U({
      uRefl: { value: this.reflRT.texture },
      uRefr: { value: this.refrRT.texture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uReflMatrix: { value: this.reflMatrix },
      uHole: { value: this.texHole },
    });
    // Double-sided: the descent looks at the surface from below.
    this.water = add(new THREE.Mesh(buildWater(), mat(this.uWater, WATER_VERT, WATER_FRAG, { side: THREE.DoubleSide })));
    this.uEdge = U({ uOn: { value: 0 }, uCol: { value: EDGE_COL } });
    this.edge = add(new THREE.Mesh(buildEdge(), mat(this.uEdge, EDGE_VERT, EDGE_FRAG, { transparent: true, depthWrite: false })));
    this.edge.renderOrder = 2;

    // Decoration (off on the low tier and after the second adapt step).
    this.uShaft = U({ uOn: { value: 0 }, uCol: { value: SHAFT_COL } });
    this.shafts = add(new THREE.Mesh(plane(-90, 90, -32, 0, FRONT_Z - 0.4), mat(this.uShaft, SHAFT_VERT, SHAFT_FRAG, { transparent: true, depthWrite: false })));
    this.shafts.renderOrder = 3;

    this.windX = 0;
    const snowU = U({
      uWindX: { value: 0 },
      uWindV: { value: WIND.calm },
      uAlpha: { value: 0 },
      uCol: { value: INK },
      uBox: { value: new THREE.Vector3(75, 42, 48) },
      uBoxAt: { value: new THREE.Vector3(0, 0, -28) },
    });
    this.snow = add(new THREE.LineSegments(buildStreaks(1100, [75, 42, 48], [0, 0, -28], 99), mat(snowU, STREAK_VERT, STREAK_FRAG, { transparent: true, depthWrite: false })));

    this.uMotes = U({ uSize: { value: 70 * dpr }, uAlpha: { value: 0 } });
    this.motes = add(new THREE.Points(buildMotes(260), mat(this.uMotes, MOTE_VERT, MOTE_FRAG, { transparent: true, depthWrite: false })));
    this.setDecorations(tier !== 'low');

    this.uSky = U({ uTop: { value: SKY_TOP }, uHorizon: { value: SKY_HORIZON }, uSky: { value: 0 } });
    this.sky = add(new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24), mat(this.uSky, SKY_VERT, SKY_FRAG, { side: THREE.BackSide, depthWrite: false })), [0, 1, 2]);
    this.sky.renderOrder = -1;

    // Hover, idle and mouse-camera state.
    this.pointer = null; // NDC [x, y] or null
    this.hit = null;
    this.hoverOn = 0;
    this.motion01 = 1; // 0: frozen (poster stills)
    this.parallax = [0, 0];
    this.parallaxTarget = [0, 0];
    this.lastMove = -Infinity; // when the cursor last moved over the berg (s)
    this.idleW = 0;
    this.weather = 0;
    this.time = 0;
    this.size = [1, 1];
    // Depth 0..1, eased toward its goal by a critically damped spring.
    this.depth = 0;
    this.depthV = 0;
    this.depthGoal = 0;

    this._ray = new THREE.Raycaster();
    this._v2 = new THREE.Vector2();
    this._v3 = new THREE.Vector3();
    this._bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  }

  resize(w, h) {
    this.size = [w, h];
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait frames: pull back so the whole berg still fits across.
    this.portrait = Math.max(1, (h / w) * 1.2);
    this.camera.updateProjectionMatrix();
    this._sizeTargets();
  }

  _sizeTargets() {
    const [w, h] = this.size;
    const k = this.dpr * (this.lowRefl ? 0.35 : 0.5);
    this.reflRT.setSize(Math.max(4, Math.round(w * k)), Math.max(4, Math.round(h * k)));
    this.refrRT.setSize(Math.max(4, Math.round(w * k)), Math.max(4, Math.round(h * k)));
    this.uWater.uRes.value.set(w * this.dpr, h * this.dpr);
  }

  setDpr(dpr) {
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.uMotes.uSize.value = 70 * dpr;
    const [w, h] = this.size;
    this.renderer.setSize(w, h, false);
    this._sizeTargets();
  }

  /** Coarser reflection and refraction targets (the source's second quality step, minus bloom). */
  setLowRefl(on) {
    this.lowRefl = on;
    this._sizeTargets();
  }

  /** Light shafts, motes and snow: they cost fill rate and add nothing to the berg. */
  setDecorations(on) {
    this.decorations = on;
    this.shafts.visible = on;
    this.motes.visible = on;
    this.snow.visible = on;
  }

  /** NDC pointer, or null when it leaves the figure (the view glides back to
      centre, as igloo's does). */
  setPointer(p) {
    this.pointer = p;
    this.parallaxTarget = p ? [p[0], p[1]] : [0, 0];
    this._moved = true;
  }

  /** The source's timeline, reduced to what the end state needs (END_STATE). */
  setState({ spread, far, weather, hover, motion }) {
    this.uBlocks.uCoreOn.value = 1;
    this.u.uSpread.value = spread;
    this.uTerrain.uHaze.value = 1 - far;
    this.uSky.uSky.value = far;
    this.weather = weather;
    this.hoverOn = hover;
    this.motion01 = motion ?? 1;
  }

  /** 0 = the source's waterline pose, 1 = under the surface. Eased in
      render(); instant jumps straight there (poster stills). */
  setDepth(d, instant = false) {
    this.depthGoal = Math.min(1, Math.max(0, d));
    if (instant) {
      this.depth = this.depthGoal;
      this.depthV = 0;
    }
  }

  /** Camera height over the waterline in scene units (the figure's readout). */
  cameraHeight() {
    return this.camera.position.y;
  }

  _placeCamera(time, dt) {
    // Critically damped spring, solved exactly for the step, so a long frame
    // never overshoots.
    const w = DEPTH.omega;
    const y = this.depth - this.depthGoal;
    const ex = Math.exp(-w * dt);
    const tmp = (this.depthV + w * y) * dt;
    this.depthV = (this.depthV - w * tmp) * ex;
    this.depth = this.depthGoal + (y + tmp) * ex;
    if (Math.abs(this.depth - this.depthGoal) < 1e-5 && Math.abs(this.depthV) < 1e-4) {
      this.depth = this.depthGoal;
      this.depthV = 0;
    }
    const e = sstep(this.depth);

    const r = CAM_TO.r * (this.portrait || 1);
    const phi = CAM_TO.phi;
    let theta = CAM_TO.theta;
    const tg = [...CAM_TO.target];
    // The mouse orbits and tilts the view (igloo's chase), and a slow breath
    // keeps it alive.
    const live = this.motion01;
    const k = 1 - Math.exp(-MOUSE.rate * dt);
    this.parallax[0] += (this.parallaxTarget[0] - this.parallax[0]) * k;
    this.parallax[1] += (this.parallaxTarget[1] - this.parallax[1]) * k;
    const px = this.parallax[0] * live;
    const py = this.parallax[1] * live;
    theta += live * Math.sin(time * 0.07) * 0.012 + px * MOUSE.yaw;
    const baseY = tg[1] + r * Math.cos(phi);
    const cx = tg[0] + r * Math.sin(phi) * Math.sin(theta);
    let cy = baseY + py * MOUSE.rise + live * Math.sin(time * 0.05) * 0.06;
    const cz = Math.max(CAM_MIN_Z, tg[2] + r * Math.sin(phi) * Math.cos(theta));
    // The descent: camera and look target sink together, the camera further,
    // so at the bottom it looks a little up at the surface.
    cy += (DEPTH.camY - baseY) * e;
    tg[1] += (DEPTH.targetY - tg[1]) * e;
    cy = Math.max(CAM_MIN_Y, cy);
    // Look toward the cursor: slide sideways, tilt up or down.
    const right = [Math.cos(theta), 0, -Math.sin(theta)];
    tg[0] += right[0] * px * MOUSE.slide;
    tg[2] += right[2] * px * MOUSE.slide;
    tg[1] += py * Math.tan(MOUSE.tilt) * r;
    this.camera.position.set(cx, cy, cz);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(tg[0], tg[1], tg[2]);
    this.camera.updateMatrixWorld();
    this._target = tg;
  }

  _hover(time, dt) {
    this.hit = null;
    this.ray = null;
    if (this.pointer && this.hoverOn > 0) {
      this._v2.set(this.pointer[0], this.pointer[1]);
      this._ray.setFromCamera(this._v2, this.camera);
      const o = this._ray.ray.origin;
      const d = this._ray.ray.direction;
      this.ray = rayThrough([o.x, o.y, o.z], [d.x, d.y, d.z]);
      this.hit = this.ray?.hit ?? null;
    }
    // The cursor moving over the berg holds the idle off; once it has been
    // still for igloo's delay the pulse comes back.
    if (this._moved && this.hit) this.lastMove = time;
    this._moved = false;
    const want = this.hoverOn >= 1 && this.motion01 > 0 && time - this.lastMove > IDLE_DELAY ? 1 : 0;
    this.idleW += (want - this.idleW) * Math.min(1, dt * 3);
    if (this.idleW < 0.002 && want === 0) this.idleW = 0;
    this.motion.step(dt, time, { ray: this.ray, hoverOn: this.hoverOn, idle: this.idleW });

    const B = this.blocks;
    const D = this.motion.d;
    for (let i = 0; i < B.length; i++) this.blockData[i * 4 + 3] = D[i];
    for (let i = 0; i < B.length; i++) {
      const open = D[i] / B[i].dMax;
      let near = 0;
      for (const j of this.neighbours[i]) near = Math.max(near, D[j] / B[j].dMax);
      this.glowData[i * 4] = open;
      this.glowData[i * 4 + 1] = Math.max(open, near * 0.8);
    }
    this.texBlock.needsUpdate = true;
    this.texGlow.needsUpdate = true;
  }

  /** The blocks that should carry a vertex of the polygon diagram now, most
      lifted first, projected to CSS px; and a lookup for any block. */
  diagram() {
    const B = this.blocks;
    const M = this.motion;
    const cam = this.camera.position;
    const list = [];
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (M.target[i] / b.dMax < 0.15 || M.d[i] / b.dMax < 0.1) continue;
      const a = b.anchor;
      const tx = cam.x - a[0];
      const ty = cam.y - a[1];
      const tz = cam.z - a[2];
      const l = Math.hypot(tx, ty, tz);
      if ((b.dir[0] * tx + b.dir[1] * ty + b.dir[2] * tz) / l < 0.05) continue;
      list.push(i);
    }
    list.sort((p, q) => M.d[q] - M.d[p]);
    return list.slice(0, 5).map((i) => this.project(i)).filter(Boolean);
  }

  /** Block i's vertex on screen: its anchor, moved with the block. */
  project(i) {
    const b = this.blocks[i];
    const d = this.motion.d[i];
    const v = this._v3.set(b.anchor[0] + b.dir[0] * d, b.anchor[1] + b.dir[1] * d, b.anchor[2] + b.dir[2] * d).project(this.camera);
    if (v.z > 1) return null;
    const [w, h] = this.size;
    return { id: i, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, n: (99 * d) / b.dMax };
  }

  _weather(time, dt) {
    // Gusts ride the idle cycle (NOTES §4).
    const P = IDLE.period;
    const s = (((time + GUST.lead) % P) + P) % P;
    let g;
    if (s < GUST.rise) g = sstep(s / GUST.rise);
    else if (s < GUST.rise + GUST.hold) g = 1;
    else g = 1 - sstep((s - GUST.rise - GUST.hold) / GUST.fall);
    g *= this.weather * this.motion01;
    this.u.uGust.value = g;
    const speed = (WIND.calm + WIND.gust * g) * this.motion01;
    this.windX += speed * dt;
    const su = this.snow.material.uniforms;
    su.uWindX.value = this.windX;
    su.uWindV.value = speed;
    su.uAlpha.value = this.weather * this.motion01;
    // The water: small disturbances all the time, more and harder in a gust.
    if (this.motion01 > 0) {
      const count = Math.random() < 0.6 + 1.2 * g ? 1 + (Math.random() < g ? 1 : 0) : 0;
      for (let i = 0; i < count; i++)
        this.sim.drop(Math.random(), Math.random(), 0.02 + Math.random() * 0.03, (Math.random() < 0.5 ? -1 : 1) * (0.004 + 0.006 * Math.random()) * (1 + 1.5 * g));
      this.simAcc += dt;
      let steps = 0;
      while (this.simAcc >= 1 / 60 && steps < 3) {
        this.simAcc -= 1 / 60;
        steps++;
      }
      this.sim.step(steps);
    }
    this.u.uSim.value = this.sim.texture;
  }

  render(time, dt) {
    this.time = time;
    this.u.uTime.value = time;
    this._placeCamera(time, Math.min(dt, 0.1));
    this._hover(time, Math.min(dt, 0.05));
    this._weather(time, Math.min(dt, 0.05));
    const spread = this.u.uSpread.value;
    this.uEdge.uOn.value = sstep(spread / 40);
    this.uShaft.uOn.value = sstep(spread / 60);
    this.uMotes.uAlpha.value = sstep(spread / 60) * (this.motion01 ? 1 : 0.6);

    const c = this.camera;
    const R = this.renderer;
    // Below the lowest trough the surface is only ever seen from underneath,
    // which uses neither pass (WATER_FRAG's underside branch): skip both.
    const under = c.position.y < -0.3;
    if (spread > 1 && !under) {
      // Reflection: the camera mirrored in the water's plane.
      const tg = this._target;
      this.reflCam.copy(c, false);
      this.reflCam.layers.set(2);
      this.reflCam.position.set(c.position.x, -c.position.y, c.position.z);
      this.reflCam.up.set(0, 1, 0);
      this.reflCam.lookAt(tg[0], -tg[1], tg[2]);
      this.reflCam.updateMatrixWorld();
      this.reflCam.projectionMatrix.copy(c.projectionMatrix);
      this.reflMatrix.copy(this._bias).multiply(this.reflCam.projectionMatrix).multiply(this.reflCam.matrixWorldInverse);

      this.u.uClip.value = 1;
      this.sky.position.copy(this.reflCam.position);
      R.setRenderTarget(this.reflRT);
      R.render(this.scene, this.reflCam);
      // Refraction: what is under the surface, from the real camera.
      this.refrCam.copy(c, false);
      this.refrCam.layers.set(1);
      this.u.uClip.value = -1;
      this.sky.position.copy(c.position);
      R.setRenderTarget(this.refrRT);
      R.render(this.scene, this.refrCam);
    }
    R.setRenderTarget(null);
    this.u.uClip.value = 0;
    this.sky.position.copy(c.position);
    R.render(this.scene, c);
  }

  /** Releases everything, the context last. Safe to call twice and on an
      already-lost context (WEBGL_lose_context is null then). */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.texBlock.dispose();
    this.texGlow.dispose();
    this.texNoise.dispose();
    this.texHole.dispose();
    this.reflRT.dispose();
    this.refrRT.dispose();
    this.sim.dispose();
    const gl = this.renderer.getContext();
    this.renderer.dispose();
    try {
      if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      /* already gone */
    }
  }
}

