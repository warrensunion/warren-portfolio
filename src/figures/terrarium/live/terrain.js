// Ported from terrarium src/live/terrain.js at 7612a40 (Warren's own project). Changes: none but this header.
/**
 * The ground inside the jar. Height is a cheap analytic function, not a
 * heightmap, because creatures, feet, food and shadows all ask heightAt()
 * thousands of times a frame and the sim itself is flat (DECISIONS: height is
 * only visual). Moss is painted procedurally in the shader so the jar never
 * depends on art being present; textures in public/art/ are layered on top
 * when they exist.
 *
 * Beyond the walkable disc the soil banks up against the glass, and the side
 * of the soil (gravel, charcoal, peat, moss) is drawn as a wall so the jar
 * reads as a cut-away specimen through the glass.
 */
import * as THREE from 'three';
import { WORLD_R, JAR_R, JAR_FLOOR, LIGHT_GLSL, lightUniforms, PALETTE } from './look.js';

const EDGE = JAR_R / WORLD_R; // sim radius where the soil meets the glass

/** the analytic ground; sampled once into a grid because it is too slow to call 10k times a frame */
function heightExact(x, y) {
  let h = 0.16 * Math.sin(x * 3.1 + 0.7) * Math.cos(y * 2.7 - 0.4)
    + 0.08 * Math.sin(x * 5.3 - y * 4.1 + 1.3)
    + 0.05 * Math.sin(x * 9.7 + y * 8.3);
  let dx = x + 0.38, dy = y - 0.22;
  h += 0.42 * Math.exp(-(dx * dx + dy * dy) * 7);      // a mossy knoll, upper left
  dx = x - 0.45; dy = y + 0.4;
  h += 0.26 * Math.exp(-(dx * dx + dy * dy) * 9);      // a smaller one, lower right
  const r = Math.sqrt(x * x + y * y);
  if (r > 0.8) { const t = Math.min(1, (r - 0.8) / (EDGE - 0.8)); h += 0.38 * t * t; } // soil banks up at the glass
  return h;
}

// bilinear grid over the jar (sim units), 0.008 per cell: ~20 ns a lookup instead of ~400
const GN = 320, GE = 1.1, GS = (2 * GE) / GN;
const grid = new Float32Array((GN + 1) * (GN + 1));
for (let j = 0; j <= GN; j++) for (let i = 0; i <= GN; i++) grid[j * (GN + 1) + i] = heightExact(-GE + i * GS, -GE + j * GS);

/** sim (x, y) → three-units height of the ground. Pure, cheap, allocation-free. */
export function heightAt(x, y) {
  let fx = (x + GE) / GS, fy = (y + GE) / GS;
  fx = fx < 0 ? 0 : fx > GN - 1e-6 ? GN - 1e-6 : fx;
  fy = fy < 0 ? 0 : fy > GN - 1e-6 ? GN - 1e-6 : fy;
  const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, o = j * (GN + 1) + i;
  const a = grid[o] + (grid[o + 1] - grid[o]) * tx;
  const b = grid[o + GN + 1] + (grid[o + GN + 2] - grid[o + GN + 1]) * tx;
  return a + (b - a) * ty;
}

const terrainVert = /* glsl */ `
varying vec3 vPos; varying vec3 vN;
void main() {
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;

const terrainFrag = /* glsl */ `
${LIGHT_GLSL}
uniform sampler2D uMoss, uSoil;
uniform float uHasMoss, uHasSoil, uJarR;
uniform vec3 uMossA, uMossB, uMossC, uPeat, uLichen;
varying vec3 vPos; varying vec3 vN;
// the window's light as it falls through the glass onto the moss
float gobo(vec3 p) {
  vec2 q = p.xz - uKeyDir.xz / uKeyDir.y * p.y;
  float panes = smoothstep(0.08, 0.0, abs(fract(q.x * 0.22 + q.y * 0.05) - 0.5) - 0.42);
  float shaft = smoothstep(4.5, 0.5, length(q - vec2(-1.2, 0.6)));
  return shaft * (1.0 - 0.55 * panes);
}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vPos);
  vec2 p = vPos.xz;
  float big = lvFbm(p * 0.45 + 7.0);
  float mid = lvFbm(p * 1.7);
  float fine = lvNoise(p * 14.0) * 0.6 + lvNoise(p * 37.0) * 0.4;
  vec3 moss = mix(uMossA, uMossB, smoothstep(0.3, 0.7, big));
  moss = mix(moss, uMossC, smoothstep(0.55, 0.8, mid) * 0.7);
  if (uHasMoss > 0.5) { vec3 t = texture2D(uMoss, p * 0.32).rgb; moss = mix(moss, mix(vec3(dot(t, vec3(0.3, 0.55, 0.15))), t, 0.8) * 0.62, 0.7); }
  // cushions: fine bumps read as moss texture
  // close up: fibrous strands of moss, so the ground has a texture under the creatures
  float fib = lvNoise(p * vec2(90.0, 30.0)) * lvNoise(p * vec2(28.0, 85.0) + 5.0);
  moss *= 0.72 + 0.5 * fine;
  moss *= 0.8 + 0.45 * fib;
  // bare soil in hollows and on the steep bank
  float soilMask = smoothstep(0.42, 0.3, big + mid * 0.25) * 0.85;
  soilMask = max(soilMask, smoothstep(0.8, 0.55, N.y));
  vec3 soil = uPeat * (0.8 + 0.4 * lvNoise(p * 22.0));
  if (uHasSoil > 0.5) soil = mix(soil, texture2D(uSoil, p * 0.5).rgb, 0.7);
  vec3 albedo = mix(moss, soil, soilMask);
  // lichen flecks
  // (pale grey-green, not yellow: yellow on the ground means food)
  albedo = mix(albedo, vec3(0.32, 0.36, 0.26), smoothstep(0.84, 0.9, lvNoise(p * 31.0 + 3.0)) * (1.0 - soilMask) * 0.45);
  // contact shadow where the soil meets the glass
  float r = length(p);
  float ao = mix(1.0, 0.45, smoothstep(uJarR - 0.7, uJarR, r)) * (0.75 + 0.25 * fine);
  vec3 c = lvGouache(albedo, N, V, ao, 0.25);
  c += albedo * uKeyCol * gobo(vPos) * 0.55 * smoothstep(0.2, 0.9, N.y);
  gl_FragColor = vec4(c, 1.0);
}`;

const wallFrag = /* glsl */ `
${LIGHT_GLSL}
uniform vec3 uPeat; uniform float uFloor;
varying vec3 vPos; varying vec3 vN;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vPos);
  float a = atan(vPos.z, vPos.x) * 5.32;
  vec2 p = vec2(a, vPos.y);
  float y = vPos.y - uFloor;
  float wob = lvFbm(vec2(a * 0.6, 1.0)) * 0.25;
  // gravel: rounded pebbles with dark gaps
  // gravel: two staggered layers of irregular pebbles with dark gaps
  vec3 gravel = vec3(0.04, 0.045, 0.045);
  for (int k = 0; k < 2; k++) {
    vec2 cell = p * 4.2 + float(k) * vec2(0.5, 0.37);
    vec2 ci = floor(cell); vec2 f = fract(cell) - 0.5;
    float id = lvHash(ci + float(k) * 7.0);
    vec2 jit = vec2(lvHash(ci + 3.3), lvHash(ci + 9.1)) - 0.5;
    vec2 d = (f - jit * 0.35) / vec2(0.3 + 0.18 * id, 0.22 + 0.12 * lvHash(ci + 5.0));
    float pebble = smoothstep(1.0, 0.75, length(d));
    vec3 pc = mix(vec3(0.13, 0.14, 0.13), vec3(0.28, 0.24, 0.18), id) * (0.85 + 0.3 * (0.5 - d.y * 0.3));
    gravel = mix(gravel, pc, pebble * step(0.2, id));
  }
  vec3 charcoal = vec3(0.025, 0.03, 0.03) * (0.7 + 0.6 * lvNoise(p * 30.0));
  vec3 soil = uPeat * (1.5 + 1.1 * lvFbm(p * 6.0));
  // pale rootlets in the soil
  soil = mix(soil, vec3(0.32, 0.26, 0.18), smoothstep(0.02, 0.0, abs(lvFbm(p * vec2(3.0, 9.0)) - 0.5)) * 0.5);
  vec3 c = gravel;
  c = mix(c, charcoal, smoothstep(0.42, 0.46, y + wob * 0.4));
  c = mix(c, soil, smoothstep(0.62, 0.68, y + wob * 0.5));
  // the side of the soil faces away from the window; light it as the room would
  // (warm bounce through the glass, a peat ambient) so it reads as peat, not a black slab
  vec3 lit = lvGouache(c, N, V, 0.9, 0.0) + c * (uKeyCol * 0.45 + vec3(0.32, 0.27, 0.22));
  lit *= 0.85 + 0.3 * smoothstep(-1.0, 1.0, vPos.y - uFloor - 1.2); // a touch lighter toward the moss
  gl_FragColor = vec4(lit, 1.0);
}`;

const tuftVert = /* glsl */ `
attribute vec4 aT; // xyz base, w scale
attribute float aPhase; attribute float aH;
varying vec3 vPos; varying vec3 vN; varying float vH;
uniform float uTime;
void main() {
  vec3 p = position * aT.w;
  float sway = sin(uTime * 1.3 + aPhase) * 0.05 * aH * aH;
  p.x += sway * aT.w; p.z += sway * 0.6 * aT.w;
  vPos = aT.xyz + p; vN = normal; vH = aH;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;
const tuftFrag = /* glsl */ `
${LIGHT_GLSL}
varying vec3 vPos; varying vec3 vN; varying float vH;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vPos);
  // stalks go from green to a rust-red capsule, like real moss sporophytes
  vec3 alb = mix(vec3(0.12, 0.2, 0.06), vec3(0.42, 0.12, 0.05), smoothstep(0.55, 0.95, vH));
  gl_FragColor = vec4(lvGouache(alb, N, V, mix(0.5, 1.0, vH), 0.6), 1.0);
}`;

const rockVert = /* glsl */ `
attribute vec4 aT; attribute vec4 aS; // pos+scale, xz squash + yaw + tint
varying vec3 vPos; varying vec3 vN; varying vec3 vObj; varying float vTint;
void main() {
  float c = cos(aS.z), s = sin(aS.z);
  vec3 q = position * vec3(aS.x, aS.y, aS.x);
  q = vec3(c * q.x - s * q.z, q.y, s * q.x + c * q.z);
  vec3 n = normal / vec3(aS.x, aS.y, aS.x);
  n = vec3(c * n.x - s * n.z, n.y, s * n.x + c * n.z);
  vObj = position; vTint = aS.w;
  vPos = aT.xyz + q * aT.w; vN = normalize(n);
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;
const rockFrag = /* glsl */ `
${LIGHT_GLSL}
uniform vec3 uMossA, uMossB;
varying vec3 vPos; varying vec3 vN; varying vec3 vObj; varying float vTint;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vPos);
  float n = lvFbm(vObj.xz * 3.0 + vObj.y * 2.0 + vTint * 10.0);
  vec3 alb;
  if (vTint < 0.5) {
    // stone, with moss creeping over the top
    alb = mix(vec3(0.2, 0.21, 0.2), vec3(0.36, 0.33, 0.27), n);
    alb = mix(alb, uMossB, smoothstep(0.25, 0.7, vObj.y + n * 0.5 - 0.2));
  } else {
    // a moss cushion: velvety, lighter where the light grazes it
    alb = mix(uMossA, uMossB, n) * (0.75 + 0.5 * lvNoise(vObj.xz * 40.0 + vObj.y * 30.0));
  }
  float ao = smoothstep(-0.6, 0.4, vObj.y);
  gl_FragColor = vec4(lvGouache(alb, N, V, ao, 0.5), 1.0);
}`;

function polarGrid(rings, segs, radius) {
  const pos = [], idx = [];
  pos.push(0, heightAt(0, 0), 0);
  for (let i = 1; i <= rings; i++) {
    const r = radius * Math.pow(i / rings, 0.85);
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos.push(x, heightAt(x / WORLD_R, z / WORLD_R), z);
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segs, b0 = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function soilWall(segs) {
  const pos = [], idx = [];
  const r = JAR_R - 0.015;
  for (let j = 0; j <= segs; j++) {
    const a = (j / segs) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    pos.push(x, JAR_FLOOR, z, x, heightAt(x / WORLD_R, z / WORLD_R), z);
  }
  for (let j = 0; j < segs; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const n = [];
  for (let j = 0; j <= segs; j++) { const a = (j / segs) * Math.PI * 2; n.push(Math.cos(a), 0, Math.sin(a), Math.cos(a), 0, Math.sin(a)); }
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setIndex(idx);
  return g;
}

// seeded so the jar looks the same on every visit
function rand(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function tufts(rng) {
  // one sporophyte: a thin stalk with a tilted capsule, merged
  const stalk = new THREE.CylinderGeometry(0.006, 0.01, 0.22, 4, 1).translate(0, 0.11, 0);
  const cap = new THREE.SphereGeometry(0.018, 5, 4).scale(0.8, 1.5, 0.8).translate(0.004, 0.235, 0);
  const geo = mergeSimple([stalk, cap]);
  const p = geo.attributes.position;
  const h = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) h[i] = p.getY(i) / 0.26; // 0 at the root, 1 at the capsule
  const N = 1400;
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = geo.index;
  ig.setAttribute('position', p);
  ig.setAttribute('normal', geo.attributes.normal);
  ig.setAttribute('aH', new THREE.BufferAttribute(h, 1));
  const t = new Float32Array(N * 4), ph = new Float32Array(N);
  let n = 0;
  const patches = [[-0.6, -0.55], [0.7, 0.35], [-0.2, 0.75], [0.15, -0.8], [-0.85, 0.2], [0.55, -0.6]];
  while (n < N) {
    const c = patches[n % patches.length];
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.16;
    const x = c[0] + Math.cos(a) * r, y = c[1] + Math.sin(a) * r;
    if (Math.hypot(x, y) > EDGE - 0.03) continue;
    t[n * 4] = x * WORLD_R; t[n * 4 + 1] = heightAt(x, y) - 0.01; t[n * 4 + 2] = y * WORLD_R;
    t[n * 4 + 3] = 0.9 + rng() * 0.8;
    ph[n] = rng() * 6.28; n++;
  }
  ig.setAttribute('aT', new THREE.InstancedBufferAttribute(t, 4));
  ig.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
  ig.instanceCount = N;
  const m = new THREE.ShaderMaterial({ uniforms: lightUniforms, vertexShader: tuftVert, fragmentShader: tuftFrag });
  const mesh = new THREE.Mesh(ig, m);
  mesh.frustumCulled = false;
  return mesh;
}

function mergeSimple(geos) {
  const pos = [], nor = [], idx = [];
  let base = 0;
  for (const g of geos) {
    const gi = g.index ? g : g.toNonIndexed();
    const p = gi.attributes.position.array, n = gi.attributes.normal.array;
    pos.push(...p); nor.push(...n);
    if (gi.index) idx.push(...Array.from(gi.index.array, (v) => v + base));
    else for (let i = 0; i < p.length / 3; i++) idx.push(base + i);
    base += p.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

function rocks(rng) {
  const base = new THREE.IcosahedronGeometry(1, 3);
  // lumpy, not spherical
  const p = base.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.12 * Math.sin(x * 4.1 + y * 2.3) + 0.08 * Math.sin(z * 5.7 - x * 3.1);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  base.computeVertexNormals();
  const list = [];
  // stones: a few at the edge, one larger one beside the knoll
  const stones = [[-0.82, -0.3, 0.42, 0.55], [0.86, -0.18, 0.3, 0.5], [0.3, 0.88, 0.36, 0.6], [-0.48, 0.78, 0.22, 0.6], [0.95, 0.12, 0.2, 0.5]];
  for (const [x, y, s, sq] of stones) list.push([x, y, s, 1, sq, rng() * 6, 0]);
  // moss cushions clustered against the glass and around the stones
  for (let i = 0; i < 90; i++) {
    const a = rng() * Math.PI * 2, r = 0.82 + rng() * 0.22;
    list.push([Math.cos(a) * r, Math.sin(a) * r, 0.1 + rng() * 0.2, 1, 0.45 + rng() * 0.2, rng() * 6, 1]);
  }
  for (const [sx, sy] of stones) for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2, r = 0.06 + rng() * 0.1;
    list.push([sx + Math.cos(a) * r, sy + Math.sin(a) * r, 0.06 + rng() * 0.12, 1, 0.5, rng() * 6, 1]);
  }
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = base.index; ig.attributes.position = base.attributes.position; ig.attributes.normal = base.attributes.normal;
  const t = new Float32Array(list.length * 4), s = new Float32Array(list.length * 4);
  list.forEach(([x, y, sc, sx, sy, yaw, tint], i) => {
    const rr = Math.hypot(x, y);
    const k = rr > EDGE - 0.02 ? (EDGE - 0.02) / rr : 1;
    t.set([x * k * WORLD_R, heightAt(x * k, y * k) - sc * 0.25, y * k * WORLD_R, sc], i * 4);
    s.set([sx, sy, yaw, tint], i * 4);
  });
  ig.setAttribute('aT', new THREE.InstancedBufferAttribute(t, 4));
  ig.setAttribute('aS', new THREE.InstancedBufferAttribute(s, 4));
  ig.instanceCount = list.length;
  const m = new THREE.ShaderMaterial({
    uniforms: { ...lightUniforms, uMossA: { value: new THREE.Color('#2C5236') }, uMossB: { value: new THREE.Color('#6C8B3E') } },
    vertexShader: rockVert, fragmentShader: rockFrag,
  });
  const mesh = new THREE.Mesh(ig, m);
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * @param {{ moss?:THREE.Texture|null, soil?:THREE.Texture|null }} [textures]
 * @returns {THREE.Group} with userData.setTextures(textures) for late-arriving art
 */
export function createTerrain(textures = {}) {
  const group = new THREE.Group();
  group.name = 'lv-terrain';
  const uniforms = {
    ...lightUniforms,
    uMoss: { value: null }, uSoil: { value: null }, uHasMoss: { value: 0 }, uHasSoil: { value: 0 },
    uJarR: { value: JAR_R },
    uMossA: { value: new THREE.Color('#1F3A33') },
    uMossB: { value: new THREE.Color('#3F5A44') },
    uMossC: { value: new THREE.Color('#717D5C') },
    uPeat: { value: PALETTE.peat.clone() },
    uLichen: { value: PALETTE.lichen.clone() },
  };
  const ground = new THREE.Mesh(polarGrid(90, 220, JAR_R), new THREE.ShaderMaterial({ uniforms, vertexShader: terrainVert, fragmentShader: terrainFrag }));
  ground.name = 'lv-ground';
  const wall = new THREE.Mesh(soilWall(200), new THREE.ShaderMaterial({
    uniforms: { ...lightUniforms, uPeat: uniforms.uPeat, uFloor: { value: JAR_FLOOR } },
    vertexShader: terrainVert, fragmentShader: wallFrag,
  }));
  wall.name = 'lv-soil-wall';
  const rng = rand(7);
  group.add(wall, ground, rocks(rng), tufts(rng));

  group.userData.setTextures = (t = {}) => {
    for (const [k, u, h] of [['moss', 'uMoss', 'uHasMoss'], ['soil', 'uSoil', 'uHasSoil']]) {
      const tex = t[k];
      if (!tex) continue;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      uniforms[u].value = tex; uniforms[h].value = 1;
    }
  };
  group.userData.setTextures(textures);
  return group;
}
