// Ported from terrarium src/live/jar.js at 7612a40 (Warren's own project). Changes: none but this header.
/**
 * The jar is the hero of the site, and real transmission (a second scene
 * render through a refracting surface) costs more than the whole creature
 * pass. So the glass is faked the way a painter fakes it: a celadon tint that
 * thickens at grazing angles, vertical window streaks where the cylinder
 * reflects the upper-left key light, a sharp bright edge, condensation, and
 * the room behind bent sideways near the silhouette. The far wall and near wall
 * are separate draws (back faces first) so the inside reads as a volume.
 *
 * The room (backdrop wash, tabletop, the jar's shadow and the caustic it
 * focuses) lives here too, because the glass refracts exactly that backdrop.
 */
import * as THREE from 'three';
import { JAR_R, JAR_FLOOR, TABLE_Y, LIGHT_GLSL, BACKDROP_GLSL, lightUniforms, backdropUniforms, PALETTE } from './look.js';

const WALL_TOP = 4.7, NECK_R = 3.05, NECK_Y = 6.45, LIP_Y = 6.95;
const GLASS_T = 0.07;

function glassProfile() {
  const R = JAR_R + GLASS_T;
  const pts = [];
  pts.push(new THREE.Vector2(R, TABLE_Y + 0.02));
  for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector2(R, TABLE_Y + 0.02 + (WALL_TOP - TABLE_Y) * (i / 10)));
  // rounded shoulder: a quadratic bezier from the wall into the neck
  const a = new THREE.Vector2(R, WALL_TOP), c = new THREE.Vector2(R, NECK_Y + 0.15), b = new THREE.Vector2(NECK_R, NECK_Y);
  for (let i = 1; i <= 24; i++) {
    const t = i / 24, u = 1 - t;
    pts.push(new THREE.Vector2(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y));
  }
  pts.push(new THREE.Vector2(NECK_R, LIP_Y - 0.12));
  // the rolled lip
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * Math.PI;
    pts.push(new THREE.Vector2(NECK_R + 0.1 + Math.sin(t - Math.PI / 2) * -0.1 + 0.02 * Math.sin(t), LIP_Y - 0.12 + (1 - Math.cos(t)) * 0.07));
  }
  return pts;
}

const glassVert = /* glsl */ `
varying vec3 vPos; varying vec3 vN; varying vec4 vClip; varying vec3 vNv;
void main() {
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vClip = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
  vNv = normalize(mat3(viewMatrix) * vN);
  gl_Position = vClip;
}`;

const glassFrag = /* glsl */ `
${LIGHT_GLSL}
${BACKDROP_GLSL}
uniform float uBack, uThick, uSoilY, uLipY, uWallTop, uFloorY;
uniform vec3 uTint, uHi;
varying vec3 vPos; varying vec3 vN; varying vec4 vClip; varying vec3 vNv;
// The window, painted the way an illustrator does it: tall streaks fixed to
// the left of the jar as seen (the key is upper left in every frame), split by
// a mullion, plus a faint cool one on the right from the fill.
float windowStreak(vec3 Nv, float y) {
  float x = Nv.x / max(0.25, length(Nv.xz));
  float broad = smoothstep(0.13, 0.02, abs(x + 0.5));
  float thin = smoothstep(0.03, 0.0, abs(x + 0.71));
  float v = smoothstep(uFloorY + 0.4, uFloorY + 1.6, y) * smoothstep(uWallTop + 0.9, uWallTop - 0.6, y);
  float mull = 1.0 - 0.85 * smoothstep(0.09, 0.03, abs(y - 3.1));
  return (broad * 0.3 + thin) * v * mull;
}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vPos);
  if (dot(N, V) < 0.0) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fr = pow(1.0 - ndv, 3.0);
  vec3 R = reflect(-V, N);
  vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
  vec3 Nv = normalize(vNv); if (dot(Nv, vec3(0.0, 0.0, 1.0)) < 0.0) Nv = -Nv;
  float streak = windowStreak(Nv, vPos.y);
  float coolStreak = smoothstep(0.06, 0.0, abs(Nv.x / max(0.25, length(Nv.xz)) - 0.8)) * smoothstep(uFloorY + 0.8, uFloorY + 2.0, vPos.y) * smoothstep(uWallTop + 0.5, uWallTop - 1.0, vPos.y);
  float spec = pow(max(dot(R, uKeyDir), 0.0), 220.0);
  float fillStreak = coolStreak * 0.5;
  vec3 col; float a;
  if (uBack > 0.5) {
    // far wall: the room seen through two layers of glass, bent near the edges
    vec2 off = N.xz * (0.012 + 0.07 * fr) * vec2(1.0, 0.4);
    vec3 bg = lvBackdrop(suv + off);
    a = 0.16 + 0.55 * fr;
    col = bg * mix(vec3(1.0), uTint * 1.3, 0.55) * a;
    col += uHi * streak * 0.22 + uFillCol * fillStreak * 0.5;
  } else {
    a = 0.05 + 0.5 * fr;
    col = uTint * 0.35 * a;
    // thick glass edge refracts the room sideways
    float edge = smoothstep(0.32, 0.05, ndv);
    vec3 bg = lvBackdrop(suv + N.xz * 0.06 * vec2(1.0, 0.4));
    col = mix(col, bg * uTint * 1.25, edge * 0.85); a = mix(a, 0.9, edge * 0.85);
    // a bright hairline at the very silhouette: the glass thickness catching light
    col += uHi * smoothstep(0.08, 0.0, ndv) * 0.35;
    col += uHi * (streak * 0.6 + spec * 2.0) + uFillCol * fillStreak;
    // condensation in the upper half: tiny beads lit from the upper left
    vec2 dq = vec2(atan(vPos.z, vPos.x) * 5.4, vPos.y) * 9.0;
    vec2 cell = floor(dq); vec2 f = fract(dq) - 0.5;
    float h = lvHash(cell);
    vec2 jit = vec2(lvHash(cell + 3.1), lvHash(cell + 7.7)) - 0.5;
    float rad = 0.08 + 0.18 * h * h;
    float bead = smoothstep(rad, rad * 0.6, length(f - jit * 0.5)) * step(0.55, h);
    float fog = smoothstep(2.0, 4.5, vPos.y) * (1.0 - smoothstep(uLipY - 1.0, uLipY, vPos.y));
    float glint = smoothstep(rad * 0.5, 0.0, length(f - jit * 0.5 + vec2(0.35, -0.35) * rad));
    col += (uTint * 0.5 + uHi * 0.25) * bead * fog * 0.2 + uHi * bead * fog * glint * 0.6;
    a = max(a, bead * fog * 0.18);
  }
  // seen against the soil, the near glass is dark and green
  float soil = smoothstep(uSoilY + 0.15, uSoilY - 0.15, vPos.y);
  col = mix(col, col * 0.6 + uTint * 0.03, soil * (1.0 - uBack));
  // the thick base is bottle-green
  col = mix(col, uTint * vec3(0.32, 0.55, 0.45) * 0.55 + uHi * streak * 0.4, uThick);
  a = mix(a, 0.78, uThick);
  gl_FragColor = vec4(col, a);
}`;

const corkFrag = /* glsl */ `
${LIGHT_GLSL}
uniform vec3 uPeat;
uniform float uSeat;
varying vec3 vPos; varying vec3 vN;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vPos);
  vec2 p = abs(N.y) > 0.7 ? vPos.xz : vec2(atan(vPos.z, vPos.x) * 3.4, vPos.y);
  // cork granules: dark pits and pale flecks over peat
  float g = lvNoise(p * 11.0), g2 = lvNoise(p * 23.0 + 4.0);
  vec3 alb = uPeat * (1.9 + 0.6 * lvFbm(p * 2.0));
  alb = mix(alb, uPeat * 0.9, smoothstep(0.7, 0.9, g) * 0.8);
  alb = mix(alb, vec3(0.5, 0.36, 0.22), smoothstep(0.75, 0.92, g2) * 0.5);
  // inside the neck the cork is in the glass's shade; a dark seam where it presses on the lip
  float inside = smoothstep(uSeat + 0.02, uSeat - 0.1, vPos.y);
  float seam = smoothstep(0.12, 0.0, abs(vPos.y - uSeat - 0.02)) * (1.0 - step(0.7, abs(N.y)));
  float ao = mix(0.95, 0.78, inside) * (1.0 - 0.45 * seam);
  gl_FragColor = vec4(lvGouache(alb, N, V, ao, 0.8 * (1.0 - inside)), 1.0);
}`;
const plainVert = /* glsl */ `
varying vec3 vPos; varying vec3 vN;
void main() {
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;

const tableFrag = /* glsl */ `
${LIGHT_GLSL}
${BACKDROP_GLSL}
uniform vec3 uTop, uTint;
uniform float uJarR, uJarH;
varying vec3 vPos; varying vec3 vN;
void main() {
  vec2 p = vPos.xz;
  vec3 alb = uTop * (0.8 + 0.35 * lvFbm(p * vec2(0.25, 1.6)) + 0.08 * lvNoise(p * 9.0));
  vec3 c = lvGouache(alb, vec3(0.0, 1.0, 0.0), vec3(0.0, 1.0, 0.0), 1.0, 0.0);
  // with the painted room present, the tabletop IS the painting; we only add the jar's shadow
  vec2 suv = gl_FragCoord.xy / uViewport;
  c = mix(c, lvBackdrop(suv), uHasBackdrop);
  // the jar's long shadow, away from the key light, and the caustic the glass focuses into it
  vec2 dir = -uKeyDir.xz / uKeyDir.y;
  vec2 q = p - dir * uJarH * 0.45;
  vec2 along = normalize(dir);
  float s = dot(q, along), t = dot(q, vec2(-along.y, along.x));
  float shadow = smoothstep(1.0, 0.3, length(vec2(s / (uJarH * 0.7 + uJarR), t / (uJarR * 1.0))));
  float contact = smoothstep(uJarR + 1.1, uJarR, length(p));
  c = mix(c, c * vec3(0.2, 0.3, 0.29), min(1.0, 0.9 * shadow + 0.85 * contact * contact));
  vec2 cq = p - dir * uJarH * 0.62;
  float caustic = exp(-dot(cq, cq) * 0.35) * (0.75 + 0.25 * lvNoise(cq * 3.0 + uTime * 0.1));
  c += uKeyCol * uTint * caustic * 0.16 * shadow;
  // the tabletop dissolves into the room
  float far = smoothstep(11.0, 34.0, length(p));
  c = mix(c, lvBackdrop(suv), far);
  gl_FragColor = vec4(c, 1.0);
}`;

const backdropVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.99999, 1.0); }`;
const backdropFrag = /* glsl */ `
${LIGHT_GLSL}
${BACKDROP_GLSL}
varying vec2 vUv;
void main() { gl_FragColor = vec4(lvBackdrop(vUv), 1.0); }`;

/**
 * @returns {{ group:THREE.Group, setBackdrop(tex:THREE.Texture|null), update(camera, w, h), dispose() }}
 */
export function createJar() {
  const group = new THREE.Group();
  group.name = 'lv-jar';
  const tint = PALETTE.fog.clone().lerp(new THREE.Color('#9FD1BE'), 0.6);
  const glassU = {
    ...lightUniforms, ...backdropUniforms,
    uBack: { value: 0 }, uThick: { value: 0 }, uSoilY: { value: 0.3 }, uLipY: { value: LIP_Y }, uWallTop: { value: WALL_TOP }, uFloorY: { value: JAR_FLOOR },
    uTint: { value: tint }, uHi: { value: PALETTE.highlight.clone().multiplyScalar(1.3) },
  };
  const glassMat = (back, thick = 0) => new THREE.ShaderMaterial({
    uniforms: { ...glassU, uBack: { value: back }, uThick: { value: thick } },
    vertexShader: glassVert, fragmentShader: glassFrag,
    transparent: true, depthWrite: false, side: back ? THREE.BackSide : THREE.FrontSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });

  const profile = glassProfile();
  const glassGeo = new THREE.LatheGeometry(profile, 160);
  const back = new THREE.Mesh(glassGeo, glassMat(1));
  back.renderOrder = 1; back.name = 'lv-glass-back';
  const front = new THREE.Mesh(glassGeo, glassMat(0));
  front.renderOrder = 20; front.name = 'lv-glass-front';

  // thick base: a short solid glass puck under the gravel
  const baseGeo = new THREE.CylinderGeometry(JAR_R + GLASS_T - 0.005, JAR_R + GLASS_T - 0.02, JAR_FLOOR - TABLE_Y, 160, 1, false);
  baseGeo.translate(0, (JAR_FLOOR + TABLE_Y) / 2, 0);
  const base = new THREE.Mesh(baseGeo, glassMat(0, 1));
  base.renderOrder = 19; base.name = 'lv-glass-base';

  // cork lid, bevelled, pressed into the neck
  // a tapered stopper seated in the neck: the cap overhangs the lip and sits on it,
  // the body goes down inside the glass (shaded there by corkFrag)
  const T = NECK_R + 0.24, C = NECK_R - 0.06, CT = LIP_Y + 0.4, SEAT = LIP_Y + 0.02; // cap wider than the lip roll (NECK_R + 0.2)
  const corkPts = [[0, CT], [T - 0.22, CT], [T - 0.05, CT - 0.05], [T, CT - 0.16], [T - 0.01, SEAT + 0.03], [T - 0.08, SEAT], [C, SEAT], [C - 0.03, NECK_Y - 0.5], [C - 0.25, NECK_Y - 0.56], [0, NECK_Y - 0.56]].map(([x, y]) => new THREE.Vector2(x, y));
  const corkGeo = new THREE.LatheGeometry(corkPts.reverse(), 96);
  corkGeo.computeVertexNormals();
  const cork = new THREE.Mesh(corkGeo, new THREE.ShaderMaterial({
    uniforms: { ...lightUniforms, uPeat: { value: PALETTE.peat.clone() }, uSeat: { value: LIP_Y + 0.02 } }, vertexShader: plainVert, fragmentShader: corkFrag,
  }));
  cork.name = 'lv-cork';

  const table = new THREE.Mesh(new THREE.CircleGeometry(60, 96).rotateX(-Math.PI / 2).translate(0, TABLE_Y, 0), new THREE.ShaderMaterial({
    uniforms: {
      ...lightUniforms, ...backdropUniforms,
      uTop: { value: new THREE.Color('#8E9A8F') }, uTint: { value: tint },
      uJarR: { value: JAR_R + GLASS_T }, uJarH: { value: LIP_Y - TABLE_Y },
    },
    vertexShader: plainVert, fragmentShader: tableFrag,
  }));
  table.name = 'lv-table';

  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { ...lightUniforms, ...backdropUniforms }, vertexShader: backdropVert, fragmentShader: backdropFrag, depthWrite: false,
  }));
  backdrop.frustumCulled = false; backdrop.renderOrder = -100; backdrop.name = 'lv-backdrop';

  group.add(backdrop, table, back, cork, base, front);

  const sph = new THREE.Spherical();
  return {
    group,
    setBackdrop(tex) {
      if (!tex) return;
      tex.colorSpace = THREE.SRGBColorSpace;
      backdropUniforms.uBackdrop.value = tex;
      backdropUniforms.uHasBackdrop.value = 1;
      if (tex.image?.width) backdropUniforms.uBackdropAspect.value = tex.image.width / tex.image.height;
    },
    update(camera, w, h) {
      backdropUniforms.uViewport.value.set(w, h);
      // a little parallax in the painted room as the camera orbits
      sph.setFromVector3(camera.position);
      backdropUniforms.uPan.value.set(-sph.theta * 0.05, (sph.phi - 1.0) * 0.06);
    },
    dispose() {
      group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      // module-level state: a re-created stage must not inherit this one's backdrop
      backdropUniforms.uBackdrop.value = null;
      backdropUniforms.uHasBackdrop.value = 0;
    },
  };
}
