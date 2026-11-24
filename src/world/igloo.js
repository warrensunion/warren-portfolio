// The igloo, built block by block as the visitor climbs: ~200 carved snow-ice blocks in rings on a dome,
// a key block at the crown and an entrance tunnel, one InstancedMesh. build (0..1, from scroll) decides
// how many are placed; the next few are in the air, each on a curve from where it was cut, tumbling into
// its seat, landing with a small bump, a puff of powder and (with sound on) a clink. Scrolling back sends
// them back out. Hover lights a block's facets with a wire of its polygons, igloo.inc's way. At the summit
// the last block seals it and it glows warm from inside.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SHARED_PARS } from './shared.js';

const R = 2.05; // inner radius, m
const BH = 0.36; // block height
const BD = 0.44; // block depth (wall thickness)
const BL = 0.62; // block length along the ring
const FLY = 3.5; // blocks in the air at once

const BLOCK_VERT = /* glsl */ `
attribute float aRand;
attribute float aGlow;
attribute float aHot;
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vLocal;
varying float vRand;
varying float vGlow;
varying float vHot;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vLocal = position;
  vRand = aRand;
  vGlow = aGlow;
  vHot = aHot;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BLOCK_FRAG = /* glsl */ `
${SHARED_PARS}
uniform vec3 uHalf;     // the block's half size
uniform float uWarmth;  // 0..1 lit from inside (sealed at the summit)
uniform vec3 uWarmCol;
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vLocal;
varying float vRand;
varying float vGlow;
varying float vHot;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(uCam - vWorld);
  vec3 L = normalize(uMoonDir);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float wrap = dot(n, L) * 0.5 + 0.5;
  // carved snow-ice: chisel marks, packed grains, a few cracks
  vec3 p = vLocal * 6.0 + vRand * 31.0;
  float grain = s_fbm(p);
  float chisel = s_noise(vec3(vLocal.x * 14.0 + vRand * 9.0, vLocal.y * 3.0, vLocal.z * 3.0));
  float crack = smoothstep(0.03, 0.0, abs(s_noise(p * 0.7 + 3.0) - 0.5)) * 0.6;
  // edges: how close to the block's rim this point is (the seams between blocks)
  vec3 q = abs(vLocal) / uHalf;
  float e1 = max(q.x, q.y);
  float e2 = max(q.y, q.z);
  float e3 = max(q.x, q.z);
  float edge = smoothstep(0.86, 0.99, min(min(e1, e2), e3) * 0.35 + max(max(q.x, q.y), q.z) * 0.65);
  // packed snow, glazed with ice: white-grey in the light, blue-grey in the shade
  vec3 base = mix(uSnowShade * 1.12, uSnowLit * 1.1, clamp(wrap * 0.9 + grain * 0.18, 0.0, 1.0));
  base = mix(base, uIce, 0.08 + 0.1 * (1.0 - wrap));
  base *= 0.88 + 0.14 * chisel;
  base = mix(base, uSnowLit * 1.3, crack * 0.3);
  // the edges are worn round and catch more light than the faces
  base *= 1.0 + edge * 0.12;
  // fresnel: the cold rim of the sky on the glaze
  base += skyBase(reflect(-v, n)) * fres * 0.3;
  // glow while it flies and lands (igloo.inc's lit blocks), and on hover
  vec3 glow = vec3(0.9, 0.97, 1.0) * (edge * 1.3 + fres * 0.5 + 0.18) * (vGlow * 0.9 + vHot * 0.8);
  // sealed: warm light leaks through the seams
  glow += uWarmCol * edge * uWarmth * (0.9 + 0.3 * sin(uTime * 2.0 + vRand * 20.0));
  vec3 col = base + glow;
  col = applyHaze(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

const MOUND_FRAG = /* glsl */ `
${SHARED_PARS}
uniform float uWarmth;
uniform vec3 uWarmCol;
uniform vec3 uDoor;
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec3 n = normalize(vN);
  float wrap = dot(n, normalize(uMoonDir)) * 0.5 + 0.5;
  float diff = max(dot(n, normalize(uMoonDir)), 0.0);
  vec3 col = mix(uSnowShade, uSnowLit, smoothstep(0.0, 1.0, wrap * 0.85 + diff * 0.3));
  col *= 0.96 + 0.06 * s_noise(vec3(vWorld.x * 0.09 + vWorld.z * 0.02, 0.0, vWorld.z * 0.5)) + 0.04 * s_noise(vWorld * 0.35);
  vec3 v = normalize(uCam - vWorld);
  float sp = step(0.982, s_hash(floor(vWorld * 7.0))) * pow(max(dot(reflect(-normalize(uMoonDir), n), v), 0.0), 16.0);
  col += vec3(sp) * 1.4;
  float d = length(vWorld - uDoor);
  col += uWarmCol * uWarmth * exp(-d * 0.55) * 0.9;
  col = applyHaze(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
const MOUND_VERT = /* glsl */ `
attribute float aSkirt;
uniform float uSkirt;
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec3 p = position;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PUFF_VERT = /* glsl */ `
attribute vec3 aVel;
attribute float aBirth;
uniform float uNow;
uniform float uPx;
varying float vA;
void main() {
  float t = uNow - aBirth;
  float life = clamp(t / 0.9, 0.0, 1.0);
  vec3 p = position + aVel * (1.0 - exp(-t * 3.0)) + vec3(0.0, -0.15 * t * t, 0.0);
  vA = (t < 0.0 || t > 0.9) ? 0.0 : (1.0 - life) * (1.0 - life);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uPx * (14.0 + 40.0 * life) / max(-mv.z, 0.5);
  gl_Position = projectionMatrix * mv;
}
`;
const PUFF_FRAG = /* glsl */ `
uniform vec3 uCol;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, r) * vA * 0.55;
  gl_FragColor = vec4(uCol, a);
}
`;

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

/** The seats, in building order: dome rings from the bottom, the key block, then the tunnel. */
function seats() {
  const out = [];
  const r = rng(17);
  const door = Math.PI / 2; // +z: the door faces the camera's side
  const rc = R + BD / 2;
  const rings = Math.floor((Math.PI / 2 - 0.2) / (BH / rc));
  for (let k = 0; k < rings; k++) {
    const phi = (k + 0.5) * (BH / rc) * 1.02;
    const ringR = rc * Math.cos(phi);
    const y = rc * Math.sin(phi);
    const n = Math.max(4, Math.floor((Math.PI * 2 * ringR) / BL));
    const off = (k % 2) * (Math.PI / n); // stagger the joints
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      // the doorway: the lowest rings leave a gap facing the tunnel
      let da = Math.atan2(Math.sin(a - door), Math.cos(a - door));
      if (k < 3 && Math.abs(da) < 0.36) continue;
      const pos = new THREE.Vector3(Math.cos(a) * ringR, y, Math.sin(a) * ringR);
      // the block's own frame: x along the ring, y up the dome, z out
      const outN = new THREE.Vector3(Math.cos(a) * Math.cos(phi), Math.sin(phi), Math.sin(a) * Math.cos(phi));
      const along = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const upD = new THREE.Vector3().crossVectors(outN, along).negate();
      const m = new THREE.Matrix4().makeBasis(along, upD, outN);
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      const len = Math.min(BL, (Math.PI * 2 * ringR) / n) * (0.97 - r() * 0.03);
      out.push({ pos, q, scale: new THREE.Vector3(len / BL, 1 - r() * 0.05, 1 - r() * 0.06), out: outN.clone(), rand: r() });
    }
  }
  // the key block at the crown
  out.push({ pos: new THREE.Vector3(0, rc - BH * 0.15, 0), q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), scale: new THREE.Vector3(1.05, 1.1, 1.0), out: new THREE.Vector3(0, 1, 0), rand: r() });
  // the tunnel: three arches of five blocks out of the door
  for (let j = 0; j < 3; j++) {
    const z = rc - 0.05 + j * (BL * 0.95);
    for (let i = 0; i < 5; i++) {
      const t = (i / 4) * Math.PI; // a half arch, from one side over the top to the other
      const ar = 0.82;
      const pos = new THREE.Vector3(Math.cos(t) * ar, Math.sin(t) * ar * 1.05 + 0.1, z);
      const outN = new THREE.Vector3(Math.cos(t), Math.sin(t), 0);
      const along = new THREE.Vector3(0, 0, 1);
      const upD = new THREE.Vector3().crossVectors(outN, along).negate();
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, upD, outN));
      out.push({ pos, q, scale: new THREE.Vector3(0.95, 0.95, 0.85), out: outN, rand: r() });
    }
  }
  return out;
}

export function createIgloo(shared, { dpr = 1 } = {}) {
  const group = new THREE.Group();
  const list = seats();
  const N = list.length;
  const geo = new RoundedBoxGeometry(BL, BH, BD, 2, 0.045);
  const rand = new Float32Array(N);
  const glow = new Float32Array(N);
  const hot = new Float32Array(N);
  list.forEach((s, i) => (rand[i] = s.rand));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 1));
  const glowAttr = new THREE.InstancedBufferAttribute(glow, 1);
  const hotAttr = new THREE.InstancedBufferAttribute(hot, 1);
  glowAttr.setUsage(THREE.DynamicDrawUsage);
  hotAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aGlow', glowAttr);
  geo.setAttribute('aHot', hotAttr);
  const warmCol = new THREE.Color('#ffb26b');
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uHalf: { value: new THREE.Vector3(BL / 2, BH / 2, BD / 2) }, uWarmth: { value: 0 }, uWarmCol: { value: warmCol } },
    vertexShader: BLOCK_VERT,
    fragmentShader: BLOCK_FRAG,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  group.add(mesh);

  // the snow knoll it stands on (igloo.inc's hill): a low dome, then a skirt that falls away to whatever
  // slope is below (uSkirt, from the rig), so the igloo never floats and never sinks into the ridge
  const RINGS = 28;
  const SECT = 72;
  const kp = [];
  const ks = [];
  const idx = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    const r = t < 0.5 ? (t / 0.5) * 6.5 : 6.5 + ((t - 0.5) / 0.5) * 11;
    const top = t < 0.5 ? 0.55 * (1 - (r / 6.5) ** 2) : 0;
    const sk = t < 0.5 ? 0 : Math.pow((t - 0.5) / 0.5, 1.4);
    for (let j = 0; j <= SECT; j++) {
      const a = (j / SECT) * Math.PI * 2;
      const wob = 1 + 0.06 * Math.sin(a * 3 + 1.3) + 0.04 * Math.sin(a * 7);
      kp.push(Math.cos(a) * r * (t < 0.5 ? 1 : wob), top, Math.sin(a) * r * (t < 0.5 ? 1 : wob));
      ks.push(sk);
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SECT; j++) {
      const a = i * (SECT + 1) + j;
      const b = a + SECT + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.Float32BufferAttribute(kp, 3));
  mg.setAttribute('aSkirt', new THREE.Float32BufferAttribute(ks, 1));
  mg.setIndex(idx);
  mg.computeVertexNormals();
  const doorWorld = new THREE.Vector3();
  const moundMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uWarmth: mat.uniforms.uWarmth, uWarmCol: { value: warmCol }, uDoor: { value: doorWorld }, uSkirt: { value: 4 } },
    vertexShader: MOUND_VERT,
    fragmentShader: MOUND_FRAG,
  });
  // The skirt is shaped on the CPU when its depth changes by more than a few centimetres, so its normals
  // follow its real slope (a shader displacement kept the flat dome's normals and read as a grey table).
  const base = Float32Array.from(kp);
  let lastKnoll = -1;
  const shapeKnoll = (k) => {
    if (Math.abs(k - lastKnoll) < 0.05) return;
    lastKnoll = k;
    const pa = mg.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const sk = ks[i];
      const x = base[i * 3];
      const z = base[i * 3 + 2];
      const spread = 1 + sk * k * 0.09;
      const bump = sk > 0 ? Math.sin(x * 0.7 + z * 0.4) * Math.cos(z * 0.6 - x * 0.2) * 0.6 * sk * Math.min(1, k / 6) : 0;
      pa.setXYZ(i, x * spread, base[i * 3 + 1] - sk * k + bump, z * spread);
    }
    pa.needsUpdate = true;
    mg.computeVertexNormals();
    mg.computeBoundingSphere();
  };
  const mound = new THREE.Mesh(mg, moundMat);
  mound.position.y = -0.04;
  mound.frustumCulled = false;
  group.add(mound);

  // the inner shell: dark packed snow seen through the seams, filled to the highest finished ring, and
  // the warm light leaking out of them once the igloo is sealed
  const shellMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uFill: { value: -1 }, uWarmth: mat.uniforms.uWarmth, uWarmCol: { value: warmCol } },
    vertexShader: `varying vec3 vL; varying vec3 vWorld; void main() { vL = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `${SHARED_PARS}
      uniform float uFill, uWarmth; uniform vec3 uWarmCol; varying vec3 vL; varying vec3 vWorld;
      void main() {
        if (vL.y > uFill) discard;
        float door = atan(vL.z, vL.x);
        if (vL.y < 1.1 && abs(door - 1.5708) < 0.34) discard;
        vec3 col = uSnowShade * 0.32 + uWarmCol * uWarmth * (1.1 + 0.25 * sin(uTime * 2.3));
        gl_FragColor = vec4(applyHaze(col, vWorld), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R + BD * 0.5, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
  group.add(shell);
  const ringTop = list.map((s) => s.pos.y + BH * 0.5);

  // the doorway's warm light, a soft additive card inside the tunnel
  const doorMat = new THREE.MeshBasicMaterial({ color: warmCol, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), doorMat);
  door.position.set(0, 0.55, R + BD + BL * 2.6);
  door.visible = false; // the shell's warm light through the doorway is enough; the card read as a blob
  group.add(door);

  // hover polygons: the hovered block's triangles as a white wire
  const wireGeo = new THREE.WireframeGeometry(geo);
  const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const wire = new THREE.LineSegments(wireGeo, wireMat);
  wire.matrixAutoUpdate = false;
  wire.renderOrder = 5;
  group.add(wire);

  // powder puffs: a pool of points, written only when a block lands
  const PUFFS = 24;
  const PER = 10;
  const pp = new Float32Array(PUFFS * PER * 3);
  const pv = new Float32Array(PUFFS * PER * 3);
  const pb = new Float32Array(PUFFS * PER).fill(-99);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3).setUsage(THREE.DynamicDrawUsage));
  pg.setAttribute('aVel', new THREE.BufferAttribute(pv, 3).setUsage(THREE.DynamicDrawUsage));
  pg.setAttribute('aBirth', new THREE.BufferAttribute(pb, 1).setUsage(THREE.DynamicDrawUsage));
  const puffMat = new THREE.ShaderMaterial({
    uniforms: { uNow: { value: 0 }, uPx: { value: 120 * dpr }, uCol: { value: new THREE.Color('#e9f1ff') } },
    vertexShader: PUFF_VERT,
    fragmentShader: PUFF_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const puffs = new THREE.Points(pg, puffMat);
  puffs.frustumCulled = false;
  puffs.renderOrder = 6;
  group.add(puffs);
  let nextPuff = 0;
  const pr = rng(5);

  const landed = new Float32Array(N).fill(-1); // time each block landed, -1 while not placed
  const m4 = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpP = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const spin = list.map((s, i) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rand[i] * 6, rand[(i * 7) % N] * 6, rand[(i * 13) % N] * 6)));
  const from = list.map((s, i) => {
    // cut from the snow out to one side, behind the dome, a little below
    const a = rand[i] * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * 7, -0.4, Math.sin(a) * 7 - 2).add(s.out.clone().multiplyScalar(2));
  });
  let hovered = -1;
  let hoverK = 0;
  let placed = 0;

  function puff(at, now) {
    const base = nextPuff * PER;
    nextPuff = (nextPuff + 1) % PUFFS;
    for (let k = 0; k < PER; k++) {
      const i = base + k;
      pp[i * 3] = at.x;
      pp[i * 3 + 1] = at.y;
      pp[i * 3 + 2] = at.z;
      const a = pr() * Math.PI * 2;
      const sp = 0.4 + pr() * 0.9;
      pv[i * 3] = Math.cos(a) * sp;
      pv[i * 3 + 1] = 0.15 + pr() * 0.45;
      pv[i * 3 + 2] = Math.sin(a) * sp;
      pb[i] = now;
    }
    for (const n of ['position', 'aVel', 'aBirth']) pg.attributes[n].needsUpdate = true;
  }

  return {
    group,
    mesh,
    total: N,
    get placed() {
      return placed;
    },
    /**
     * build 0..1, now (s), motion (0 reduced), onLand(count) for the clinks. Returns blocks placed.
     */
    update({ build, now, motion, warmth, onLand, knoll = 4 }) {
      shapeKnoll(knoll);
      const real = performance.now() / 1000;
      const f = build * (N + FLY - 1) - (FLY - 1) * 0.5; // the last block lands at build = 1
      let lands = 0;
      let jumpLands = 0;
      // how many will land this frame: more than a handful means the page jumped
      for (let i = 0; i < N; i++) if (landed[i] < 0 && (f - i) / FLY + 0.5 >= 1) jumpLands++;
      jumpLands = jumpLands > 3 ? 99 : 0;
      let count = 0;
      for (let i = 0; i < N; i++) {
        const s = list[i];
        const p = Math.max(0, Math.min(1, (f - i) / FLY + 0.5)); // 0 hidden, 1 seated
        let g = 0;
        if (p <= 0) {
          mesh.setMatrixAt(i, zero);
          landed[i] = -1;
        } else if (p < 1) {
          // in the air: a curve from the cut to the seat, rising over it, tumbling in
          const t = p * p * (3 - 2 * p);
          const a = from[i];
          tmpP.set(
            a.x + (s.pos.x - a.x) * t,
            a.y + (s.pos.y - a.y) * t + Math.sin(t * Math.PI) * 2.4,
            a.z + (s.pos.z - a.z) * t,
          );
          tmpQ.copy(spin[i]).slerp(s.q, t);
          tmpS.copy(s.scale).multiplyScalar(0.4 + 0.6 * Math.min(1, p * 2));
          mesh.setMatrixAt(i, m4.compose(tmpP, tmpQ, tmpS));
          landed[i] = -1;
          g = 1;
        } else {
          if (landed[i] < 0) {
            // a block seated by a jump (a link, a reload deep in the page, reduced motion) lands quietly
            landed[i] = motion && jumpLands < 3 ? real : real - 30;
            jumpLands++;
            lands++;
            if (lands <= 2 && motion) puff(tmpP.copy(s.pos).applyMatrix4(group.matrixWorld), now);
          }
          const since = real - landed[i];
          // the landing bump: a quick squash that rings out
          const bump = motion ? Math.exp(-since * 9) * Math.sin(since * 30) * 0.06 : 0;
          tmpS.copy(s.scale);
          tmpS.y *= 1 - bump;
          tmpS.x *= 1 + bump * 0.5;
          mesh.setMatrixAt(i, m4.compose(s.pos, s.q, tmpS));
          g = Math.exp(-since * 2.2);
          count++;
        }
        glow[i] = g;
        const h = i === hovered ? hoverK : 0;
        hot[i] = h;
      }
      placed = count;
      // the shell fills behind every block seated so far (the dome's rings are seated in order)
      // (a ring behind the newest block, so a half-built ring never shows the shell in its gaps)
      shellMat.uniforms.uFill.value = count >= N ? 9 : count > 30 ? ringTop[count - 30] - BH * 0.5 : -1;
      mesh.instanceMatrix.needsUpdate = true;
      glowAttr.needsUpdate = true;
      hotAttr.needsUpdate = true;
      if (lands && onLand) onLand(lands);
      // hover wire
      hoverK += ((hovered >= 0 ? 1 : 0) - hoverK) * 0.18;
      if (hovered >= 0) {
        mesh.getMatrixAt(hovered, m4);
        wire.matrix.copy(m4).multiply(new THREE.Matrix4().makeScale(1.015, 1.03, 1.03));
      }
      wireMat.opacity = 0.75 * hoverK;
      wire.visible = hoverK > 0.01;
      mat.uniforms.uWarmth.value = warmth;
      doorMat.opacity = 0.55 * warmth;
      doorWorld.set(0, 0.4, R + BD + BL * 2.2).applyMatrix4(group.matrixWorld);
      puffMat.uniforms.uNow.value = now;
      return count;
    },
    /** Raycast for hover: the index of the placed block under the ray, or -1. */
    pick(ray) {
      const hits = ray.intersectObject(mesh, false);
      const h = hits.find((x) => landed[x.instanceId] >= 0);
      return h ? h.instanceId : -1;
    },
    setHover(i) {
      hovered = i;
    },
    setDpr(d) {
      puffMat.uniforms.uPx.value = 120 * d;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mg.dispose();
      shell.geometry.dispose();
      shellMat.dispose();
      moundMat.dispose();
      door.geometry.dispose();
      doorMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      pg.dispose();
      puffMat.dispose();
    },
  };
}
