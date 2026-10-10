// Ported from BTTRURSLF-v2 src/screens/shop/hub/block.js (the BTTRshop hub). What changed and why:
// a figure holds one block still in its plate, so the passage motion (u, travelY, the drift) is gone
// and the turn comes from the reader's drag (orbit.js) instead. The page is paper, so the white facet
// edges, wire-mesh, fog lines and their dots are ink with normal blending (white vanishes on paper and
// additive light cannot darken), the star glints and the hover flash are gone, and the rim stays a
// faint additive fresnel. The ice's attenuation and dark deep patches are kept: the ice reads darker
// than its fog by design. Every custom shader converts to sRGB itself (colorspace chunk) because the
// figure renders straight to the canvas, with no composer and no OutputPass.

/**
 * One ice block: the hull, what is frozen inside it, the wire-mesh round
 * the object, and the lines igloo hangs around its blocks.
 *
 * ── Why it is layered like this ────────────────────────────────────────────
 * three's transmission samples a picture of the *opaque* scene behind a
 * surface. So the hero object is opaque (alpha-tested), and the fog quad is
 * opaque: both are refracted, smeared by the frost roughness and split by
 * dispersion through the ice. The inner frost shell (milky clouds, bubbles,
 * crack streaks, dark deep patches) cannot be in that picture - it is
 * translucent - so the ice writes no depth and the shell is blended over it
 * afterwards; at 0.92 of the hull it sits in front of the object, which is
 * what makes the object look embedded rather than floating in a clear case.
 *
 * ── Value ──────────────────────────────────────────────────────────────────
 * igloo's ice is darker than its fog with only edges and highlights going
 * light. The darkness is the ice's attenuation plus the shell's deep patches;
 * the object stays readable because it is pushed well over 1 (unlit), so
 * after the attenuation it is still the brightest large thing in the block.
 *
 * ── Fitting ────────────────────────────────────────────────────────────────
 * The object and its wire-mesh are shrunk until they sit inside the main
 * hull's planes (shapes.js `inside`), for every angle the object turns to
 * relative to the ice (a turn of up to +-39 deg) - nothing may poke out.
 *
 * ── Motion ─────────────────────────────────────────────────────────────────
 * update() gets the orbit's yaw and pitch, plus an idle wobble (+-4 deg,
 * 6-9 s, per block) and a lagged lean toward the cursor (+-3 deg). The
 * object counter-turns part of the yaw so it never goes edge-on.
 */

import * as THREE from 'three';
import { buildShape, shardGeometry, inside, H } from './shapes.js';
import { rng } from './textures.js';

const DEG = Math.PI / 180;
/** The largest turn of the ice the object is fitted for (orbit.js YAW_MAX). */
export const MAX_TURN = 39 * DEG;
const INK = '#17191c';
// Ink line opacities on paper (normal blending): edges carry the shape, the wire and the fog lines
// stay behind it.
const EDGE_A = 0.26;
// Wire and dots sit over the frozen art: below the brief's .18 floor (controller ruling, review r1),
// and the wire also clears where it faces the camera, over the object's middle.
const WIRE_A = 0.16;
const DOT_A = 0.14;
// The unrefracted copy of the object over the ice (the hub's 0.4 lost thin art on paper fog), and
// how much milk / deep patch is left over the object; a phone-size stage gets more of both.
const GHOST_A = 0.85;
const GHOST_COMPACT = 0.97;
const CLEAR = [0.45, 0.3];
const CLEAR_COMPACT = [0.2, 0.1];
const LINE_A = 0.3;

const FROST_VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const NOISE = /* glsl */ `
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s / 0.97; }
`;

const FROST_FRAG = /* glsl */ `
  uniform float uSeed;
  uniform vec4 uCracks[3]; // plane normal xyz, offset w
  uniform float uCrackGain; // the first crack: a shape's own fracture, brighter and always on
  uniform float uLow;      // frost crust strength at the bottom
  uniform float uHalf;     // half the block height
  uniform float uAlpha;
  uniform vec3 uMilk;
  uniform vec3 uDeep;
  uniform vec4 uWin;  // the object's window, as the ice's (WINDOW_PARS)
  uniform vec2 uClear; // what is left of the milk and of the deep patches over the object
  varying vec3 vPos;
  varying vec3 vN;
  varying vec3 vView;
  ${NOISE}
  void main() {
    vec3 p = vPos * 1.1 + uSeed;
    float low = smoothstep(-0.2, -0.85, vPos.y / uHalf); // the lower third
    // Clearer in the middle, where the object is: the frost gathers toward
    // the skin and the bottom, so the object still reads.
    float clear = mix(0.3, 1.0, smoothstep(0.35, 0.95, length(vPos.xy) / uHalf));
    float cloud = smoothstep(0.4, 0.8, fbm(p * 1.3));
    float crumbs = smoothstep(0.5, 0.85, fbm(p * 6.0));
    float milk = cloud * (0.06 + 0.7 * low * uLow) * mix(clear, 1.0, low) + crumbs * (0.1 + 0.75 * low * uLow) * mix(clear, 1.0, low);
    // Crack planes: thin white streaks where the shell crosses a few planes,
    // broken up by noise so they read as fractures, not rulers.
    float crack = 0.0;
    for (int i = 0; i < 3; i++) {
      float d = abs(dot(vPos, uCracks[i].xyz) - uCracks[i].w + (fbm(p * 2.0 + float(i)) - 0.5) * 0.12);
      float on = smoothstep(0.5, 0.7, fbm(p * 1.4 + float(i) * 3.1));
      if (i == 0 && uCrackGain > 1.0) on = max(on, 0.85);
      crack += smoothstep(0.018, 0.0, d) * on * (i == 0 ? uCrackGain : 1.0);
    }
    milk += min(crack, 1.0) * 0.18;
    // Bubbles: small spheres - a faint fill, a darker rim, a bright dot.
    vec3 c = floor(p * 5.0);
    vec2 f = fract(p.xy * 5.0) - 0.5;
    float h = hash3(c + 3.1);
    if (h > 0.955) {
      vec2 o = (vec2(hash3(c), hash3(c + 1.7)) - 0.5) * 0.4;
      float r = 0.05 + 0.12 * hash3(c + 9.0);
      float d = length(f - o);
      float hl = smoothstep(r * 0.35, 0.0, length(f - o - vec2(-0.35, 0.35) * r));
      milk += smoothstep(r, r * 0.8, d) * 0.18 + hl * (0.6 + 0.4 * hash3(c + 4.0));
    }
    // Over the object the shell thins (review r1: on paper, thin art such as the bow was lost under
    // the milk and the dark patches); the skin and the block's outline keep all of it.
    float win = smoothstep(0.55, 1.1, length((vPos.xy - vec2(uWin.w, uWin.z)) / uWin.xy));
    milk *= mix(uClear.x, 1.0, win);
    milk = clamp(milk, 0.0, 0.92);
    // Deep patches: the thick, dark blue-grey of igloo's ice, away from the frost.
    float deep = smoothstep(0.35, 0.85, fbm(p * 0.9 + 5.0)) * (1.0 - low) * 0.55;
    float facing = clamp(dot(normalize(vN), normalize(vView)), 0.0, 1.0);
    deep *= facing * mix(uClear.y, 1.0, win);
    float a = milk + deep * (1.0 - milk);
    vec3 col = (uMilk * milk + uDeep * deep * (1.0 - milk)) / max(a, 1e-3);
    gl_FragColor = vec4(col, a * uAlpha);
    #include <colorspace_fragment>
  }
`;

// The rim also carries igloo's rainbow: a thin spectral band where a facet
// turns edge-on (fresnel ~0.7-0.97), in patches, its hue walking with the
// angle and the height, as a prism edge fringes. Kept faint on paper.
const RIM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uRim;
  uniform float uFringe;
  varying vec3 vPos;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float f = 1.0 - clamp(abs(dot(normalize(vN), normalize(vView))), 0.0, 1.0);
    float a = pow(f, 3.0) * uRim;
    float band = smoothstep(0.68, 0.84, f) * smoothstep(0.99, 0.9, f);
    band *= smoothstep(0.35, 0.8, 0.5 + 0.5 * sin(vPos.x * 6.0 + vPos.y * 4.0 + vPos.z * 5.0)); // in patches, not whole facets
    vec3 hue = 0.5 + 0.5 * cos(6.2832 * (f * 2.4 + vPos.y * 0.35 + vPos.x * 0.2 + vec3(0.0, 0.33, 0.67)));
    gl_FragColor = vec4(uColor * a + hue * band * uFringe, 1.0);
    #include <colorspace_fragment>
  }
`;

// Shards: tiny, so a cheap ice look - nearly clear body, bright edges by
// fresnel, a hard glint. Flat normal from screen derivatives.
const CHIP_VERT = /* glsl */ `
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const CHIP_FRAG = /* glsl */ `
  varying vec3 vV;
  void main() {
    vec3 n = normalize(cross(dFdx(vV), dFdy(vV)));
    vec3 v = normalize(-vV);
    float f = 1.0 - abs(dot(n, v));
    vec3 l = normalize(vec3(-0.5, 0.7, 0.5));
    float s = pow(max(dot(reflect(-l, n), v), 0.0), 30.0);
    float a = 0.22 + 0.6 * f * f + s * 0.6;
    vec3 col = mix(vec3(0.2, 0.22, 0.28), vec3(1.0), clamp(f * f * 1.3 + s, 0.0, 1.0));
    // a prism fringe along the bright edge, as igloo's loose chips have
    vec3 hue = 0.5 + 0.5 * cos(6.2832 * (f * 2.0 + vV.y * 0.6 + vec3(0.0, 0.33, 0.67)));
    col = mix(col, hue * 1.25, smoothstep(0.45, 0.75, f) * smoothstep(1.0, 0.85, f) * 0.25); // 0.55 in the hub: pink flecks on paper
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.9));
    #include <colorspace_fragment>
  }
`;

// Wire-mesh lines fade where the mesh is edge-on, so its outline does not
// read as a ring round the object (the triangles should hug it).
const WIRE_VERT = /* glsl */ `
  uniform vec3 uInvScale2;
  varying float vFace;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * (position * uInvScale2));
    vFace = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;
const WIRE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uFaceCut; // vFace above which the net is gone (lower on a small stage)
  varying float vFace;
  void main() {
    // Face-on (the middle, over the object) fades out too, so the net rings the art instead of
    // covering it.
    gl_FragColor = vec4(uColor, uOpacity * smoothstep(0.12, 0.4, vFace) * smoothstep(uFaceCut, uFaceCut - 0.32, vFace));
    #include <colorspace_fragment>
  }
`;

/**
 * The ice's "window": in the middle of the block, over the object, the
 * frost roughness, the normal-map distortion and the thickness all fall away,
 * so the object is seen through clear ice (igloo's penguin is the clearest
 * thing in its block); the frost stays at the skin and in the lower third.
 * Injected into MeshPhysicalMaterial; uWin is per block (the object's size).
 */
const WINDOW_PARS = /* glsl */ `
  uniform vec4 uWin;   // half width, half height of the window; its centre y, x
  uniform float uHalfH;
  varying vec3 vHubPos;
  float hubEdge() {
    vec2 q = (vHubPos.xy - vec2(uWin.w, uWin.z)) / uWin.xy;
    float win = smoothstep(0.7, 1.2, length(q));
    float low = smoothstep(-0.3, -0.85, vHubPos.y / uHalfH);
    return max(win, low);
  }
`;

function windowed(mat, uniforms) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHubPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHubPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${WINDOW_PARS}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.05, roughnessFactor, hubEdge());')
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * mix(0.18, 1.0, hubEdge());'))
      .replace(
        '#include <transmission_fragment>',
        THREE.ShaderChunk.transmission_fragment.replace('vec3 pos = vWorldPosition;', 'material.thickness *= mix(0.7, 1.0, hubEdge());\n\tvec3 pos = vWorldPosition;'),
      );
  };
  return mat;
}

/** The materials a block borrows: the ice factory (per block only for its window uniforms) and the
    shard material. The figure owns and disposes them. */
export function sharedMaterials({ maps, env }) {
  const makeIce = (uniforms) =>
    windowed(
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 1, // x roughnessMap: 0.04 clear .. 0.6 milky
        roughnessMap: maps.roughness,
        normalMap: maps.normal,
        normalScale: new THREE.Vector2(0.75, 0.75),
        transmission: 1,
        thickness: 2.0, // x thicknessMap 0.25..1
        thicknessMap: maps.thickness,
        ior: 1.31,
        // Full iridescence with a thicker film: rainbow bands on the reflected
        // highlights (igloo's oil-on-ice edges); 0.45 / 120-480 nm read grey.
        dispersion: 1.2,
        iridescence: 1,
        iridescenceIOR: 1.45,
        iridescenceThicknessRange: [250, 750],
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        attenuationColor: new THREE.Color('#5f6573'),
        attenuationDistance: 1.2,
        specularIntensity: 1,
        envMap: env,
        envMapIntensity: 0.7,
        flatShading: true,
        depthWrite: false,
      }),
      uniforms,
    );
  const shard = new THREE.ShaderMaterial({
    vertexShader: CHIP_VERT,
    fragmentShader: CHIP_FRAG,
    transparent: true,
    depthWrite: false,
  });
  return { makeIce, shard };
}

/**
 * The art's opaque outline as 32 points in -1..1 (x right, y up): in each
 * direction from the middle, the furthest pixel with alpha over 0.35 (the
 * object's alphaTest). Null when the picture cannot be read.
 */
function silhouette(img) {
  if (!img?.width) return null;
  const n = 64;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, n, n);
  const a = g.getImageData(0, 0, n, n).data;
  const out = [];
  for (let k = 0; k < 32; k++) {
    const t = (k / 32) * Math.PI * 2;
    let best = null;
    for (let r = 0; r <= n * 0.72; r += 0.5) {
      const x = Math.round(n / 2 - 0.5 + Math.cos(t) * r);
      const y = Math.round(n / 2 - 0.5 - Math.sin(t) * r);
      if (x < 0 || y < 0 || x >= n || y >= n) break;
      if (a[(y * n + x) * 4 + 3] > 90) best = [((x + 0.5) / n) * 2 - 1, 1 - ((y + 0.5) / n) * 2];
    }
    if (best) out.push(best);
  }
  return out.length > 8 ? out : null;
}

export class IceBlock {
  constructor({ id, index, accent, objectTexture, shared }) {
    this.id = id;
    this.index = index;
    const r = rng(1000 + index * 7919);
    this.r = r;
    const shape = buildShape(id, 4242 + index * 131);
    this.shape = shape;
    const half = H / 2;

    this.root = new THREE.Group(); // where the block sits in the plate
    this.pivot = new THREE.Group(); // rotation (orbit, wobble, cursor lean)
    this.root.add(this.pivot);

    // Idle wobble, different per block.
    this.wob = { p1: 6 + r() * 3, p2: 6 + r() * 3, ph1: r() * 6.28, ph2: r() * 6.28 };
    this.yaw0 = (id === 'knowledge' ? 0 : (r() - 0.5) * 50) * DEG;
    r(); // the hub's drift draw: kept so the rest of the sequence (lines, shards) matches the hub
    this.lean = [0, 0];
    this.turn = 0;

    // The hero object, inside: opaque, alpha-tested, unlit and pushed over 1.
    const img = objectTexture.image;
    const aspect = img ? img.width / img.height : 1;
    this.objectMat = new THREE.MeshBasicMaterial({
      map: objectTexture,
      color: new THREE.Color(2.5, 2.52, 2.56),
      alphaTest: 0.35,
      // Coverage from alpha under MSAA: the bow's string and arrow are a pixel wide on a phone
      // (low tier, dpr 1) and a hard alpha test broke them into dashes (review r1).
      alphaToCoverage: true,
      side: THREE.DoubleSide,
    });
    const oy = shape.objectY;
    const [ow, oh] = this._fitObject(shape, aspect, oy, img);
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(ow, oh), this.objectMat);
    this.object.position.set(shape.objectX, oy, 0);
    this.pivot.add(this.object);
    this.objectSize = [ow, oh];

    // The hull, with its clear window over the object.
    this.iceMat = shared.makeIce({
      uWin: { value: new THREE.Vector4(ow * 0.5, oh * 0.5, oy, shape.objectX) },
      uHalfH: { value: half },
    });
    this.ice = new THREE.Mesh(shape.geometry, this.iceMat);
    this.ice.renderOrder = 2;
    this.pivot.add(this.ice);

    // A faint unrefracted copy of the object over the ice: refraction alone
    // smears its outline; this holds it, as igloo's penguin reads through
    // its block. It shares the object's transform (a child of it).
    this.ghostMat = new THREE.MeshBasicMaterial({
      map: objectTexture,
      color: new THREE.Color(1.15, 1.16, 1.2),
      transparent: true,
      opacity: GHOST_A,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.ghost = new THREE.Mesh(this.object.geometry, this.ghostMat);
    this.ghost.renderOrder = 2.5;
    this.object.add(this.ghost);

    // Inner frost shell: the same hull at 0.92.
    const cracks = [...shape.cracks];
    while (cracks.length < 3) {
      const n = new THREE.Vector3(r() - 0.5, r() - 0.5, (r() - 0.5) * 0.5).normalize();
      cracks.push(new THREE.Vector4(n.x, n.y, n.z, (r() - 0.5) * half * 0.8));
    }
    this.frostMat = new THREE.ShaderMaterial({
      uniforms: {
        uSeed: { value: r() * 50 },
        uCracks: { value: cracks },
        uCrackGain: { value: shape.cracks.length ? shape.crackGain : 1 },
        uLow: { value: shape.frostLow },
        uHalf: { value: half },
        uAlpha: { value: 1 },
        uMilk: { value: new THREE.Color('#eef2f8') },
        uDeep: { value: new THREE.Color('#2a2e38') },
        uWin: { value: new THREE.Vector4(ow * 0.5, oh * 0.5, oy, shape.objectX) },
        uClear: { value: new THREE.Vector2(CLEAR[0], CLEAR[1]) },
      },
      vertexShader: FROST_VERT,
      fragmentShader: FROST_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.frost = new THREE.Mesh(shape.geometry, this.frostMat);
    this.frost.scale.setScalar(0.92);
    this.frost.renderOrder = 3;
    this.pivot.add(this.frost);

    // Rim: a faint additive fresnel on the hull, a touch stronger (and accented) when hot.
    this.accent = new THREE.Color(accent || '#1f5f78');
    this.rimMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uRim: { value: 0.22 }, uFringe: { value: 0.1 } },
      vertexShader: FROST_VERT,
      fragmentShader: RIM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.rim = new THREE.Mesh(shape.geometry, this.rimMat);
    this.rim.renderOrder = 4;
    this.pivot.add(this.rim);

    // Facet edges: igloo's blocks read by their thin borders; on paper, ink.
    this.ink = new THREE.Color(INK);
    this.edgeMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: EDGE_A, depthWrite: false });
    this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(shape.geometry, 24), this.edgeMat);
    this.edges.renderOrder = 4;
    this.pivot.add(this.edges);

    this._wire(r);
    this._lines(r);
    this._shards(r, shared.shard);

    this.hover = 0;
    this._v = new THREE.Vector3();
  }

  /**
   * The largest object quad (keeping the art's aspect, within objectBox) whose
   * inner 90 % stays inside the hull at every angle it turns to.
   */
  _fitObject(shape, aspect, oy, img) {
    const [bw, bh] = shape.objectBox;
    let ow = bw;
    let oh = bw / aspect;
    if (oh > bh) {
      oh = bh;
      ow = bh * aspect;
    }
    const maxTurn = MAX_TURN * shape.objectTurn;
    const cr = Math.cos(shape.objectRoll);
    const sr = Math.sin(shape.objectRoll);
    // The art's own silhouette where it can be read (the hub did this for Hygiene only): the bow and
    // the flag leave most of their picture empty, and fitting the picture's corners kept them small.
    // The picture's corners and edge midpoints are the fallback.
    const marks = silhouette(img) || [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]];
    const inset = marks.length > 8 ? 0.5 : 0.45; // silhouette points are the opaque edge itself
    const pts = (s) => {
      const out = [];
      for (const a of [-maxTurn, 0, maxTurn]) {
        for (const [x, y] of marks) {
          const qx = x * ow * s * inset;
          const qy = y * oh * s * inset;
          const px = qx * cr - qy * sr; // roll, then the turn
          const py = qx * sr + qy * cr;
          out.push(new THREE.Vector3(shape.objectX + px * Math.cos(a), oy + py, -px * Math.sin(a)));
        }
      }
      return out;
    };
    let s = 1;
    while (s > 0.3 && !inside(shape, pts(s))) s -= 0.03;
    return [ow * s, oh * s];
  }

  /** Geodesic mesh round the object (icosahedron detail 2), fitted inside the hull. */
  _wire(r) {
    const [ow, oh] = this.objectSize;
    const ico = new THREE.IcosahedronGeometry(1, 2);
    const pos = ico.attributes.position;
    const jit = new Map();
    const v = new THREE.Vector3();
    const keyOf = (p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const k = keyOf(v);
      if (!jit.has(k)) jit.set(k, 0.93 + r() * 0.14);
    }
    const oy = this.object.position.y;
    const ox = this.object.position.x;
    const cr = Math.cos(this.shape.objectRoll);
    const sr = Math.sin(this.shape.objectRoll);
    let sx = ow * 0.52;
    let sy = oh * 0.52;
    let sz = Math.min(ow, oh) * 0.32;
    const verts = (k) => {
      const out = [];
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const m = jit.get(keyOf(v));
        const x = v.x * m * sx * k;
        const y = v.y * m * sy * k;
        out.push(new THREE.Vector3(ox + x * cr - y * sr, x * sr + y * cr + oy, v.z * m * sz * k));
      }
      return out;
    };
    let k = 1;
    while (k > 0.3 && !inside(this.shape, verts(k))) k -= 0.03;
    sx *= k;
    sy *= k;
    sz *= k;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const m = jit.get(keyOf(v));
      pos.setXYZ(i, v.x * m * sx, v.y * m * sy, v.z * m * sz);
    }
    const wire = new THREE.WireframeGeometry(ico);
    this.wireMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(INK) },
        uOpacity: { value: WIRE_A },
        uFaceCut: { value: 0.92 },
        uInvScale2: { value: new THREE.Vector3(1 / (sx * sx), 1 / (sy * sy), 1 / (sz * sz)) },
      },
      vertexShader: WIRE_VERT,
      fragmentShader: WIRE_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.wire = new THREE.LineSegments(wire, this.wireMat);
    this.wire.position.set(ox, oy, 0);
    this.wire.rotation.z = this.shape.objectRoll;
    this.wire.renderOrder = 5;
    this.pivot.add(this.wire);
    // Vertex dots.
    const seen = new Set();
    const dots = [];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const key = keyOf(v);
      if (seen.has(key)) continue;
      seen.add(key);
      dots.push(v.x, v.y, v.z);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
    this.dotMat = new THREE.PointsMaterial({ color: INK, size: 2, sizeAttenuation: false, transparent: true, opacity: DOT_A, depthWrite: false });
    this.dots = new THREE.Points(dg, this.dotMat);
    this.dots.position.set(ox, oy, 0);
    this.dots.rotation.z = this.shape.objectRoll;
    this.dots.renderOrder = 5;
    this.pivot.add(this.dots);
    ico.dispose();
  }

  /**
   * igloo's wire "frame": a few thin lines from the block's sides out into
   * the fog, fanning sideways, ending in a dot.
   */
  _lines(r) {
    const pos = this.shape.geometry.attributes.position;
    const side = [];
    const a = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      a.fromBufferAttribute(pos, i);
      side.push(a.clone());
    }
    side.sort((p, q) => Math.abs(q.x) - Math.abs(p.x));
    const cands = side.slice(0, Math.max(8, Math.floor(side.length * 0.25)));
    const pts = [];
    const ends = [];
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      // Alternate sides, so the lines fan out on both sides as igloo's do.
      const pool = cands.filter((p) => (i % 2 ? p.x < 0 : p.x >= 0));
      const from = pool.length ? pool : cands;
      const s = from[Math.floor(r() * from.length)];
      const dir = new THREE.Vector3(Math.sign(s.x) || 1, (r() - 0.5) * 0.9, (r() - 0.5) * 0.3).normalize();
      const b = s.clone().addScaledVector(dir, 0.45 + r() * 0.65);
      pts.push(s.x, s.y, s.z, b.x, b.y, b.z);
      ends.push(b.x, b.y, b.z);
      if (r() < 0.55) {
        const d2 = new THREE.Vector3(dir.x * 0.6, dir.y + (r() < 0.5 ? -0.7 : 0.7), 0).normalize();
        const c = b.clone().addScaledVector(d2, 0.3 + r() * 0.35);
        pts.push(b.x, b.y, b.z, c.x, c.y, c.z);
        ends.push(c.x, c.y, c.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.lineMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: LINE_A, depthWrite: false });
    this.lines = new THREE.LineSegments(g, this.lineMat);
    this.lines.renderOrder = 5;
    this.pivot.add(this.lines);
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(ends, 3));
    this.endMat = new THREE.PointsMaterial({ color: INK, size: 3, sizeAttenuation: false, transparent: true, opacity: LINE_A, depthWrite: false });
    this.ends = new THREE.Points(eg, this.endMat);
    this.ends.renderOrder = 5;
    this.pivot.add(this.ends);
  }

  /** A few small loose chips close to the surface, tumbling slowly. */
  _shards(r, mat) {
    this.shards = [];
    const pos = this.shape.geometry.attributes.position;
    const a = new THREE.Vector3();
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      a.fromBufferAttribute(pos, Math.floor(r() * pos.count));
      const m = new THREE.Mesh(shardGeometry(r, 0.09 + r() * 0.12), mat);
      m.position.copy(a.multiplyScalar(1.08 + r() * 0.18));
      m.rotation.set(r() * 6, r() * 6, r() * 6);
      m.userData.spin = [(r() - 0.5) * 0.4, (r() - 0.5) * 0.4];
      m.renderOrder = 4;
      this.pivot.add(m);
      this.shards.push(m);
    }
  }

  /**
   * time (s), yaw / pitch (rad, from the orbit), pointer [x, y] NDC or null, hot (hovered or
   * focused), dt (s), motion (0: no wobble, no lean, no tumbling). Returns the turn applied (rad):
   * the orbit's yaw plus the wobble, held inside +-MAX_TURN, which the readout shows.
   */
  /**
   * A small stage (a phone column) shows the object a few dozen px wide, where the refracted art
   * smears into the frost (review r2): the ghost goes near opaque, the shell clears further over
   * the object and the wire and its dots leave the object's middle entirely.
   */
  setCompact(on) {
    this.ghostMat.opacity = on ? GHOST_COMPACT : GHOST_A;
    this.frostMat.uniforms.uClear.value.set(...(on ? CLEAR_COMPACT : CLEAR));
    this.wireMat.uniforms.uFaceCut.value = on ? 0.7 : 0.92;
    this.dotMat.opacity = on ? 0.06 : DOT_A;
  }

  update({ time, yaw = 0, pitch = 0, pointer, hot, dt, motion }) {
    this.hover += ((hot ? 1 : 0) - this.hover) * (1 - Math.exp(-dt * 8));
    const k = 1 - Math.exp(-dt * 3);
    const tgt = pointer && motion ? pointer : [0, 0];
    this.lean[0] += (tgt[0] - this.lean[0]) * k;
    this.lean[1] += (tgt[1] - this.lean[1]) * k;
    const w = motion ? 1 : 0;
    const wobY = w * 4 * DEG * Math.sin((time * Math.PI * 2) / this.wob.p1 + this.wob.ph1);
    const wobX = w * 2.5 * DEG * Math.sin((time * Math.PI * 2) / this.wob.p2 + this.wob.ph2);
    const turn = Math.max(-MAX_TURN, Math.min(MAX_TURN, yaw + wobY));
    this.turn = turn;
    this.pivot.rotation.set(pitch + wobX - this.lean[1] * 3 * DEG, this.yaw0 + turn + this.lean[0] * 3 * DEG, 0);
    // The object turns less than the ice so it never goes edge-on.
    this.object.rotation.set(0, -turn * this.shape.objectTurn, this.shape.objectRoll);

    const h = this.hover;
    this.rimMat.uniforms.uRim.value = 0.22 + 0.18 * h;
    this.rimMat.uniforms.uColor.value.setRGB(1, 1, 1).lerp(this.accent, 0.3 * h);
    this.edgeMat.opacity = EDGE_A + 0.06 * h;
    this.edgeMat.color.copy(this.ink).lerp(this.accent, 0.5 * h);
    for (const s of this.shards) {
      s.rotation.x += s.userData.spin[0] * dt * w;
      s.rotation.y += s.userData.spin[1] * dt * w;
    }
    return turn;
  }

  /**
   * Screen anchors (CSS px) for the label (label.js): centre, topLeft (where the
   * label's leader lands) and rect (the projected bounds).
   *
   * The leader point is taken from the hull's projected silhouette, not its
   * bounding box: a tilted block (Physique) leaves the box's corners in empty
   * fog. It is the (soft) furthest hull point in a direction, pulled part-way
   * back toward the centre - inside the convex silhouette, so on the ice.
   */
  screenAnchors(camera, w, h) {
    this.pivot.updateWorldMatrix(true, false);
    if (!this._anchorPts) {
      // up to 96 hull vertices are plenty to find the extremes
      const p = this.shape.geometry.attributes.position;
      const step = Math.max(1, Math.floor(p.count / 96));
      this._anchorPts = [];
      for (let i = 0; i < p.count; i += step) this._anchorPts.push(new THREE.Vector3().fromBufferAttribute(p, i));
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const pts = [];
    for (const v of this._anchorPts) {
      this._v.copy(v).applyMatrix4(this.pivot.matrixWorld).project(camera);
      const x = (this._v.x * 0.5 + 0.5) * w;
      const y = (-this._v.y * 0.5 + 0.5) * h;
      pts.push(x, y);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    this._v.set(0, 0, 0).applyMatrix4(this.root.matrixWorld).project(camera);
    const cx = (this._v.x * 0.5 + 0.5) * w;
    const cy = (-this._v.y * 0.5 + 0.5) * h;
    // A soft argmax (weights fall off over ~12 % of the block's size), so
    // the point glides as the block turns instead of jumping between
    // vertices - the leader's end is drawn on it every frame.
    const tau = Math.max(1, 0.12 * Math.max(x1 - x0, y1 - y0));
    const toward = (dx, dy, k) => {
      let best = -Infinity;
      for (let i = 0; i < pts.length; i += 2) best = Math.max(best, (pts[i] - cx) * dx + (pts[i + 1] - cy) * dy);
      let sw = 0;
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < pts.length; i += 2) {
        const wgt = Math.exp(((pts[i] - cx) * dx + (pts[i + 1] - cy) * dy - best) / tau);
        sw += wgt;
        sx += pts[i] * wgt;
        sy += pts[i + 1] * wgt;
      }
      const bx = sx / sw;
      const by = sy / sw;
      return { x: cx + (bx - cx) * k, y: cy + (by - cy) * k };
    };
    return {
      centre: { x: cx, y: cy },
      topLeft: toward(-0.55, -0.83, 0.62),
      rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    };
  }

  dispose() {
    this.shape.geometry.dispose();
    this.object.geometry.dispose();
    this.edges.geometry.dispose();
    this.wire.geometry.dispose();
    this.dots.geometry.dispose();
    this.lines.geometry.dispose();
    this.ends.geometry.dispose();
    for (const s of this.shards) s.geometry.dispose();
    for (const m of [this.iceMat, this.ghostMat, this.objectMat, this.frostMat, this.rimMat, this.edgeMat, this.wireMat, this.dotMat, this.lineMat, this.endMat]) m.dispose();
  }
}

