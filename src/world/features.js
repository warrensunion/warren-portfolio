// The rest of the mountain: the seracs of the icefall (instanced ice towers on the glacier), the two cloud
// seas (the top of the treeline cloud, and the high deck the summit looks down on), and the summit's cairn
// and flag. Cloud tops are noise, lit from above by the moon, and fade where they meet the slopes (land.js
// in the fragment shader) so no hard line shows where cloud cuts rock.
import * as THREE from 'three';
import { H, glacierMask, GLACIER, crestX, crestH } from './land.js';
import { LAND_GLSL } from './land.js';
import { SHARED_PARS } from './shared.js';

const SERAC_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
varying float vR;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vR = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9, 78.2))) * 43758.5);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const SERAC_FRAG = /* glsl */ `
${SHARED_PARS}
varying vec3 vWorld;
varying vec3 vN;
varying float vR;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(uCam - vWorld);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float wrap = dot(n, normalize(uMoonDir)) * 0.5 + 0.5;
  float top = smoothstep(0.55, 0.85, n.y);
  vec3 ice = uIce * (0.45 + 0.6 * wrap) * (0.85 + 0.3 * vR);
  ice += skyBase(reflect(-v, n)) * fres * 0.5;
  ice = mix(ice, mix(uSnowShade, uSnowLit, wrap), top);
  float band = smoothstep(0.4, 0.5, s_noise(vec3(vWorld.y * 0.4, vWorld.x * 0.05, vR * 9.0)));
  ice *= 0.85 + 0.2 * band;
  gl_FragColor = vec4(applyHaze(ice, vWorld), 1.0);
  #include <colorspace_fragment>
}
`;

const CLOUD_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const CLOUD_FRAG = /* glsl */ `
${SHARED_PARS}
${LAND_GLSL}
uniform float uOpacity;
uniform float uMotion;
uniform float uFade; // 1: fade where the deck meets the slopes
varying vec3 vWorld;
void main() {
  vec3 p = vWorld;
  if (uCam.y < p.y - 60.0) discard; // a sea seen from above only
  float t = uTime * uMotion;
  vec2 q = p.xz * 0.00045 + vec2(t * 0.004, t * 0.0015);
  float n = s_fbm(vec3(q * 3.0, t * 0.01));
  float billow = s_fbm(vec3(q * 9.0 + n, 1.7));
  float dens = smoothstep(0.32, 0.62, n * 0.75 + billow * 0.35);
  // lit tops: the moon from above, shadowed troughs
  vec3 col = mix(uCloudCol * 0.55, uCloudCol * 1.15 + uMoonCol * 0.08, smoothstep(0.3, 0.8, billow));
  float a = dens * uOpacity;
  if (uFade > 0.5) {
    float g = landH(p.xz, 3);
    a *= smoothstep(-30.0, 160.0, p.y - g);
  }
  // the near part fades, so passing through it is a fog, not a wall
  float cd = abs(uCam.y - p.y);
  a *= smoothstep(10.0, 220.0, cd);
  // a sea seen from above; from below the sky stays clear
  a *= smoothstep(-60.0, 80.0, uCam.y - p.y);
  col = applyHaze(col, p);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

const FLAG_VERT = /* glsl */ `
uniform float uTime;
uniform float uMotion;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec3 p = position;
  float w = uv.x;
  p.z += sin(uv.x * 7.0 - uTime * 6.0 * uMotion) * 0.12 * w + sin(uv.x * 13.0 - uTime * 9.0 * uMotion) * 0.04 * w;
  p.y += sin(uv.x * 5.0 - uTime * 4.0 * uMotion) * 0.05 * w;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FLAG_FRAG = /* glsl */ `
${SHARED_PARS}
uniform vec3 uFlag;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float shade = 0.7 + 0.3 * sin(vUv.x * 7.0 - uTime * 6.0);
  vec3 col = uFlag * shade;
  gl_FragColor = vec4(applyHaze(col, vWorld), 1.0);
  #include <colorspace_fragment>
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

export function createFeatures(shared, { tier }) {
  const group = new THREE.Group();
  const disposables = [];
  const r = rng(33);

  // Seracs: tall chipped ice towers crowded on the glacier
  {
    const base = new THREE.BoxGeometry(1, 1, 1, 1, 2, 1);
    const bp = base.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      // taper the top and lean it, so they read as broken towers, not crates
      const y = bp.getY(i);
      if (y > 0) {
        bp.setX(i, bp.getX(i) * 0.7 + 0.12);
        bp.setZ(i, bp.getZ(i) * 0.75);
      }
    }
    base.translate(0, 0.5, 0);
    const geo = base.toNonIndexed();
    geo.computeVertexNormals();
    base.dispose();
    const want = tier === 'low' ? 120 : 320;
    const mats = [];
    const m = new THREE.Matrix4();
    const [gx, gz, hw, hl, rot] = GLACIER;
    let tries = 0;
    while (mats.length < want && tries < want * 10) {
      tries++;
      const u = (r() * 2 - 1) * hw;
      const v = (r() * 2 - 1) * hl;
      const x = gx + u * Math.cos(rot) + v * Math.sin(rot);
      const z = gz - u * Math.sin(rot) + v * Math.cos(rot);
      if (glacierMask(x, z) < 0.6) continue;
      // the icefall: the steep middle of the glacier is where it breaks up
      const along = v / hl;
      if (Math.abs(along) > 0.55 && r() < 0.7) continue;
      const h = H(x, z, 4);
      const sz = 10 + r() * 22;
      m.compose(
        new THREE.Vector3(x, h - sz * 0.15, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.3)),
        new THREE.Vector3(sz * (0.6 + r() * 0.6), sz * (0.7 + r() * 0.9), sz * (0.5 + r() * 0.5)),
      );
      mats.push(m.clone());
    }
    const mat = new THREE.ShaderMaterial({ uniforms: { ...shared }, vertexShader: SERAC_VERT, fragmentShader: SERAC_FRAG });
    const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
    mesh.computeBoundingSphere();
    group.add(mesh);
    disposables.push(geo, mat);
  }

  // Cloud seas: the treeline cloud's top, and the high deck below the summit
  const clouds = [];
  for (const [y, op, fade] of [
    [1750, 0.9, 1],
    [4150, 0.85, tier === 'low' ? 0 : 1],
  ]) {
    const geo = new THREE.PlaneGeometry(90000, 90000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uOpacity: { value: op }, uMotion: { value: 1 }, uFade: { value: fade } },
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = y;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    group.add(mesh);
    clouds.push({ mesh, mat, y });
    disposables.push(geo, mat);
  }

  // The summit: a cairn of stones and a flag on a pole
  const summit = new THREE.Group();
  {
    const sz = crestH(1);
    const sx = crestX(1);
    const top = H(sx + 6, -11000 + 10, 6);
    summit.position.set(sx + 6, Math.max(top, sz) - 0.2, -11000 + 10);
    const stoneGeo = new THREE.DodecahedronGeometry(0.45, 0);
    const stoneMat = new THREE.MeshLambertMaterial({ color: '#4a5568' });
    const sizes = [1.0, 0.9, 0.85, 0.7, 0.6, 0.5, 0.4];
    let y = 0.3;
    sizes.forEach((s, i) => {
      const st = new THREE.Mesh(stoneGeo, stoneMat);
      st.scale.set(s * 1.3, s * 0.8, s * 1.2);
      st.position.set((r() - 0.5) * 0.15, y, (r() - 0.5) * 0.15);
      st.rotation.set(r() * 3, r() * 3, r() * 3);
      y += s * 0.62;
      summit.add(st);
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.4, 6), stoneMat);
    pole.position.set(0, y + 1.1, 0);
    summit.add(pole);
    const fg = new THREE.PlaneGeometry(0.9, 0.55, 16, 4);
    fg.translate(0.45, 0, 0);
    const fm = new THREE.ShaderMaterial({
      uniforms: { ...shared, uMotion: { value: 1 }, uFlag: { value: new THREE.Color('#e0a35f') } },
      vertexShader: FLAG_VERT,
      fragmentShader: FLAG_FRAG,
      side: THREE.DoubleSide,
    });
    const flag = new THREE.Mesh(fg, fm);
    flag.position.set(0.02, y + 2.0, 0);
    summit.add(flag);
    group.add(summit);
    disposables.push(stoneGeo, stoneMat, pole.geometry, fg, fm);
    summit.userData.flagMat = fm;
  }

  // Base camp: two tents in the snow beside the igloo, one lit from inside. You leave them behind.
  {
    const tentGeo = new THREE.ConeGeometry(1.25, 1.55, 4, 1);
    tentGeo.rotateY(Math.PI / 4);
    tentGeo.scale(1.25, 1, 1.9);
    tentGeo.translate(0, 0.75, 0);
    const colors = [['#b97a3c', '#2a1608'], ['#55657f', '#000000']];
    [[66, 23], [79, 31]].forEach(([deg, dist], i) => {
      const a = (deg * Math.PI) / 180;
      const x = Math.sin(a) * dist;
      const z = -Math.cos(a) * dist;
      const m = new THREE.MeshLambertMaterial({ color: colors[i][0], emissive: colors[i][1] });
      const t = new THREE.Mesh(tentGeo, m);
      t.position.set(x, H(x, z, 6) - 0.05, z);
      t.rotation.y = a + 0.4 + i * 0.6;
      group.add(t);
      disposables.push(m);
    });
    disposables.push(tentGeo);
  }

  return {
    group,
    summit,
    update(cam, motion) {
      for (const c of clouds) {
        c.mat.uniforms.uMotion.value = motion;
        c.mesh.visible = cam.position.y > c.y - 60;
      }
      summit.userData.flagMat.uniforms.uMotion.value = motion;
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
