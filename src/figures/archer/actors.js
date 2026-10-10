// Everything in the valley that moves, drawn from the simulation's state: the archer (a low-poly figure
// in an original red outfit, the bow arm aimed at the target, a walk cycle), the beasts and the boss,
// arrows in flight, the arrow rain, the attack disc on the ground and the white reticle on the current
// target. Models are built here from flat-shaded primitives; nothing is loaded. sync() only reads state.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARCHER, BOSS, ENEMY, RAIN } from './sim.js';

const COL = {
  tunic: '#d63c35',
  tunicDark: '#a92b2e',
  pants: '#8f2430',
  boots: '#3b2420',
  belt: '#5a2a1c',
  skin: '#f2c29b',
  hood: '#c4312f',
  bow: '#8b5a2b',
  wrap: '#f3ead7',
  string: '#ffffff',
  beast: '#c75a32',
  beastTop: '#d9703f',
  beastBelly: '#eba06e',
  beastDark: '#8f3a22',
  boss: '#7c2f24',
  bossTop: '#93392a',
  bossBelly: '#b4583c',
  spike: '#f0d7a1',
  eye: '#231512',
  disc: '#ff5a2a',
  rain: '#ff7a3a',
  shaft: '#d9b27c',
  tip: '#9aa8b8',
  fletch: '#ffffff',
};
const MAX_ARROWS = 48;
const RAIN_ARROWS = 10; // falling at once per rain
const MAX_RAINS = 3;
const BACK = 0.7; // model units the beast's body sits behind its sim point

/* Geometry helpers (as in world.js): non-indexed, position + normal + colour, so pieces merge. */
function piece(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = [1, 1, 1] } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(...s));
  g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const top = typeof color === 'object' && color.top ? new THREE.Color(color.top) : null;
  const side = top ? new THREE.Color(color.side) : c;
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = top && nrm.getY(i) > 0.5 ? top : side;
    col.set([k.r, k.g, k.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const merge = (parts) => {
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
};
const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/* The beast: a squat four-legged body with ears; the boss is the same shape, darker, with spikes. */
function beastGeometry(boss) {
  const body = boss ? COL.boss : COL.beast;
  const top = boss ? COL.bossTop : COL.beastTop;
  const belly = boss ? COL.bossBelly : COL.beastBelly;
  const parts = [
    piece(boxG(1.0, 0.62, 1.25), { side: body, top }, { y: 0.72 }),
    piece(boxG(0.8, 0.2, 1.0), belly, { y: 0.42 }),
    piece(boxG(0.72, 0.6, 0.62), { side: body, top }, { y: 1.02, z: 0.68 }),
    piece(boxG(0.46, 0.3, 0.3), belly, { y: 0.88, z: 1.08 }),
    piece(boxG(0.12, 0.1, 0.06), COL.eye, { x: 0.2, y: 1.12, z: 0.995 }),
    piece(boxG(0.12, 0.1, 0.06), COL.eye, { x: -0.2, y: 1.12, z: 0.995 }),
    piece(new THREE.ConeGeometry(0.14, 0.38, 4), body, { x: 0.24, y: 1.46, z: 0.6, rz: -0.3 }),
    piece(new THREE.ConeGeometry(0.14, 0.38, 4), body, { x: -0.24, y: 1.46, z: 0.6, rz: 0.3 }),
    piece(boxG(0.16, 0.16, 0.5), body, { y: 0.9, z: -0.78, rx: -0.6 }),
  ];
  // A ridge of spines down the back: short tufts on a beast, tall pale spikes on the boss.
  const n = boss ? 6 : 4;
  for (let i = 0; i < n; i++) {
    const z = 0.5 - (i / (n - 1)) * 1.0;
    const h = boss ? 0.45 - i * 0.03 : 0.22;
    parts.push(piece(new THREE.ConeGeometry(boss ? 0.13 : 0.08, h, 4), boss ? COL.spike : COL.beastDark, { y: 1.03 + h / 2, z, rx: -0.35 }));
  }
  if (boss) {
    parts.push(piece(new THREE.ConeGeometry(0.08, 0.32, 4), COL.spike, { x: 0.3, y: 1.3, z: 1.0, rx: 1.0 }));
    parts.push(piece(new THREE.ConeGeometry(0.08, 0.32, 4), COL.spike, { x: -0.3, y: 1.3, z: 1.0, rx: 1.0 }));
  }
  return merge(parts);
}

function arrowGeometry() {
  return merge([
    piece(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 4), COL.shaft, { rx: Math.PI / 2 }),
    piece(new THREE.ConeGeometry(0.08, 0.24, 4), COL.tip, { z: 0.66, rx: Math.PI / 2 }),
    piece(boxG(0.02, 0.16, 0.26), COL.fletch, { z: -0.46 }),
    piece(boxG(0.16, 0.02, 0.26), COL.fletch, { z: -0.46 }),
  ]);
}

export function createActors(scene) {
  const owned = [];
  const own = (x) => (owned.push(x), x);
  const root = new THREE.Group();
  root.name = 'actors';
  scene.add(root);
  const flat = (opts = {}) => own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts }));
  const shared = flat();

  /* Blob shadows under everyone */
  const blobGeo = own(new THREE.CircleGeometry(1, 16));
  blobGeo.rotateX(-Math.PI / 2);
  const blobMat = own(new THREE.MeshBasicMaterial({ color: '#173d14', transparent: true, opacity: 0.28, depthWrite: false }));
  const blob = (s) => {
    const m = new THREE.Mesh(blobGeo, blobMat);
    m.scale.set(s, 1, s);
    m.position.y = 0.05;
    m.renderOrder = 1;
    return m;
  };

  /* The archer */
  const archer = new THREE.Group();
  archer.name = 'archer';
  const body = new THREE.Group(); // turns to face the target; the archer group carries position
  archer.add(body, blob(0.62));
  const tunicMat = flat({ emissive: new THREE.Color('#ff0000'), emissiveIntensity: 0 });
  const add = (parent, geo, mat = shared) => {
    const m = new THREE.Mesh(own(geo), mat);
    parent.add(m);
    return m;
  };
  add(body, merge([
    piece(boxG(0.66, 0.78, 0.4), { side: COL.tunic, top: COL.tunicDark }, { y: 1.3 }),
    piece(boxG(0.7, 0.12, 0.44), COL.belt, { y: 0.96 }),
    piece(boxG(0.3, 0.06, 0.05), COL.wrap, { y: 1.36, z: 0.205, rz: 0.6 }), // the quiver strap
    piece(boxG(0.22, 0.62, 0.22), COL.bow, { x: -0.18, y: 1.45, z: -0.28, rz: 0.35 }), // quiver
  ]), tunicMat);
  const head = add(body, merge([
    piece(new THREE.IcosahedronGeometry(0.31, 1), COL.skin, { y: 2.0 }),
    piece(new THREE.SphereGeometry(0.34, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), COL.hood, { y: 2.04, z: -0.03, rx: -0.25 }),
    piece(new THREE.ConeGeometry(0.12, 0.34, 5), COL.hood, { y: 2.12, z: -0.36, rx: -2.2 }),
    piece(boxG(0.07, 0.07, 0.04), COL.eye, { x: 0.11, y: 2.02, z: 0.29 }),
    piece(boxG(0.07, 0.07, 0.04), COL.eye, { x: -0.11, y: 2.02, z: 0.29 }),
  ]));
  head.name = 'head';
  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.17, 0.92, 0);
    add(pivot, merge([piece(boxG(0.25, 0.78, 0.28), COL.pants, { y: -0.4 }), piece(boxG(0.27, 0.16, 0.36), COL.boots, { y: -0.84, z: 0.04 })]));
    body.add(pivot);
    return pivot;
  });
  const arm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.44, 1.62, 0);
    add(pivot, merge([piece(boxG(0.2, 0.66, 0.22), COL.tunic, { y: -0.3 }), piece(boxG(0.18, 0.14, 0.18), COL.skin, { y: -0.68 })]));
    body.add(pivot);
    return pivot;
  };
  const bowArm = arm(-1); // the archer's right (-x when facing +z, screen right from behind) holds the bow
  const drawArm = arm(1);
  bowArm.rotation.set(-Math.PI / 2, 0, -0.12);
  const bow = new THREE.Group();
  bow.position.set(-0.34, 1.62, 0.74);
  body.add(bow);
  {
    const ARC = 1.9;
    const R = 0.72;
    const limb = new THREE.TorusGeometry(R, 0.045, 4, 12, ARC);
    limb.rotateZ(-ARC / 2);
    limb.rotateY(-Math.PI / 2);
    limb.translate(0, 0, -R);
    add(bow, merge([piece(limb, COL.bow), piece(boxG(0.1, 0.22, 0.1), COL.wrap)]));
    const tipZ = R * Math.cos(ARC / 2) - R;
    const tipY = R * Math.sin(ARC / 2);
    const sg = own(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.Float32BufferAttribute([0, tipY, tipZ, 0, 0, tipZ, 0, -tipY, tipZ], 3));
    const string = new THREE.Line(sg, own(new THREE.LineBasicMaterial({ color: COL.string })));
    bow.add(string);
    bow.userData = { sg, tipZ };
  }
  root.add(archer);

  /* The attack disc: a translucent red-orange disc of the attack radius, layered toward the middle */
  const disc = new THREE.Group();
  {
    const mk = (geo, opacity) => {
      const m = new THREE.Mesh(own(geo), own(new THREE.MeshBasicMaterial({ color: COL.disc, transparent: true, opacity, depthWrite: false })));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
      disc.add(m);
      return m;
    };
    mk(new THREE.RingGeometry(0, ARCHER.radius, 64), 0.28);
    mk(new THREE.RingGeometry(0, ARCHER.radius * 0.58, 48), 0.16);
    mk(new THREE.RingGeometry(ARCHER.radius - 0.16, ARCHER.radius, 64), 0.3);
    disc.position.y = 0.07;
  }
  root.add(disc);

  /* The reticle on the current target: a white ring with four ticks, facing the camera, turning */
  const reticle = new THREE.Group();
  const spin = new THREE.Group();
  reticle.add(spin);
  {
    const mat = own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
    const ring = new THREE.Mesh(own(new THREE.RingGeometry(0.86, 0.98, 40)), mat);
    spin.add(ring);
    const tick = own(new THREE.PlaneGeometry(0.07, 0.26));
    for (let k = 0; k < 4; k++) {
      const t = new THREE.Mesh(tick, mat);
      const a = (k / 4) * Math.PI * 2;
      t.position.set(Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0);
      t.rotation.z = a + Math.PI / 2;
      spin.add(t);
    }
    const gem = new THREE.Mesh(own(new THREE.PlaneGeometry(0.16, 0.16)), own(new THREE.MeshBasicMaterial({ color: '#3fd1c0', transparent: true, depthTest: false, depthWrite: false })));
    gem.rotation.z = Math.PI / 4;
    reticle.add(gem);
    reticle.traverse((o) => (o.renderOrder = 20));
  }
  reticle.visible = false;
  root.add(reticle);

  /* Arrows in flight and falling rain, instanced */
  const arrowGeo = own(arrowGeometry());
  const arrows = new THREE.InstancedMesh(arrowGeo, shared, MAX_ARROWS);
  arrows.count = 0;
  arrows.frustumCulled = false;
  root.add(arrows);
  const rainArrows = new THREE.InstancedMesh(arrowGeo, shared, RAIN_ARROWS * MAX_RAINS);
  rainArrows.count = 0;
  rainArrows.frustumCulled = false;
  root.add(rainArrows);
  const rainMarks = [];
  for (let i = 0; i < MAX_RAINS; i++) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(own(new THREE.RingGeometry(RAIN.radius - 0.22, RAIN.radius, 48)), own(new THREE.MeshBasicMaterial({ color: COL.rain, transparent: true, opacity: 0.85, depthWrite: false })));
    const fill = new THREE.Mesh(own(new THREE.RingGeometry(0, RAIN.radius, 48)), own(new THREE.MeshBasicMaterial({ color: COL.rain, transparent: true, opacity: 0.2, depthWrite: false })));
    for (const m of [ring, fill]) {
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 3;
      g.add(m);
    }
    g.position.y = 0.09;
    g.visible = false;
    root.add(g);
    rainMarks.push(g);
  }

  /* Beasts: one view per enemy id, built on demand from shared geometry; each has its own material so
     it can flash white when hit. A view that loses its enemy shrinks away for 0.3 s. */
  const beastGeo = { false: own(beastGeometry(false)), true: own(beastGeometry(true)) };
  const legGeo = { false: own(piece(boxG(0.22, 0.5, 0.24), COL.beastDark, { y: -0.25 })), true: own(piece(boxG(0.22, 0.5, 0.24), COL.boss, { y: -0.25 })) };
  const views = new Map();
  const dying = [];
  function makeBeast(e) {
    const g = new THREE.Group();
    // The body sits behind the enemy's point, so its snout (not its middle) is what reaches the archer.
    const inner = new THREE.Group();
    inner.position.z = -BACK;
    g.add(inner);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
    const torso = new THREE.Group();
    torso.add(new THREE.Mesh(beastGeo[e.boss], mat));
    inner.add(torso);
    const legsB = [
      [0.34, 0.45],
      [-0.34, 0.45],
      [0.34, -0.42],
      [-0.34, -0.42],
    ].map(([x, z]) => {
      const p = new THREE.Group();
      p.position.set(x, 0.5, z);
      p.add(new THREE.Mesh(legGeo[e.boss], mat));
      inner.add(p);
      return p;
    });
    inner.add(blob(0.85));
    const s = e.boss ? 2.4 : 1;
    g.scale.setScalar(s);
    root.add(g);
    return { g, torso, legs: legsB, mat, phase: 0, x: e.x, z: e.z, scale: s, boss: e.boss };
  }

  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler();
  const P = new THREE.Vector3();
  const S1 = new THREE.Vector3(1, 1, 1);
  let walk = 0;
  let lastT = null;

  return {
    root,
    /** Draw `state` (alpha is unused: the figure steps the sim in substeps every frame). */
    sync(state, alpha = 1, camera = null, now = 0) {
      const dt = lastT == null ? 0 : Math.min(0.1, Math.max(0, now - lastT));
      lastT = now;
      const a = state.archer;

      // Archer: walk cycle, aim, bow draw, hurt flash, a lean while dashing.
      archer.position.set(a.x, 0, a.z);
      body.rotation.y = a.face;
      walk += dt * 11 * a.moving;
      const swing = Math.sin(walk) * 0.75 * a.moving;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      body.position.y = Math.abs(Math.sin(walk)) * 0.06 * a.moving;
      body.rotation.x = a.dashT > 0 ? 0.35 : 0;
      const since = state.t - a.shotT;
      const draw = a.target != null ? Math.min(1, Math.max(0, since / 0.4)) : 0; // pulled back again after each shot
      // The draw hand comes across to the string, then pulls back toward the chest after each shot.
      if (a.target != null) drawArm.rotation.set(-Math.PI / 2 + 0.1, -(0.9 - draw * 0.35), 0);
      else drawArm.rotation.set(-swing * 0.8, 0, 0);
      bowArm.rotation.x = a.target != null ? -Math.PI / 2 : -0.9;
      bow.position.set(-0.34, a.target != null ? 1.62 : 1.25, a.target != null ? 0.74 : 0.5);
      {
        const p = bow.userData.sg.attributes.position;
        p.setZ(1, bow.userData.tipZ - draw * 0.32);
        p.needsUpdate = true;
      }
      tunicMat.emissiveIntensity = state.t - a.hurtT < 0.18 && a.hurtT >= 0 ? 0.45 : 0;
      disc.position.x = a.x;
      disc.position.z = a.z;

      // Beasts.
      const seen = new Set();
      for (const e of state.enemies) {
        seen.add(e.id);
        let v = views.get(e.id);
        if (!v) views.set(e.id, (v = makeBeast(e)));
        const moved = Math.hypot(e.x - v.x, e.z - v.z);
        v.x = e.x;
        v.z = e.z;
        const pace = dt > 0 ? Math.min(1, moved / dt / (e.boss ? BOSS.speed : ENEMY.speed)) : 0;
        v.phase += dt * 12 * pace / (e.boss ? 1.6 : 1);
        const sw = Math.sin(v.phase) * 0.6 * pace;
        v.legs[0].rotation.x = v.legs[3].rotation.x = sw;
        v.legs[1].rotation.x = v.legs[2].rotation.x = -sw;
        const st = e.boss ? BOSS : ENEMY;
        const lunge = Math.max(0, e.atkCd - (st.period - 0.2)) / 0.2; // a snap forward as the blow lands
        v.torso.position.set(0, Math.abs(Math.sin(v.phase)) * 0.06 * pace, lunge * 0.3);
        v.g.position.set(e.x, 0, e.z);
        v.g.rotation.y = e.face;
        v.mat.emissiveIntensity = e.hitT >= 0 ? Math.max(0, 1 - (state.t - e.hitT) / 0.14) * 0.7 : 0;
      }
      for (const [id, v] of views) {
        if (seen.has(id)) continue;
        views.delete(id);
        dying.push({ v, t: 0 });
      }
      for (let i = dying.length - 1; i >= 0; i--) {
        const d = dying[i];
        d.t += dt;
        const k = 1 - d.t / 0.3;
        if (k <= 0 || dt === 0) {
          root.remove(d.v.g);
          d.v.mat.dispose();
          dying.splice(i, 1);
        } else {
          d.v.g.scale.setScalar(d.v.scale * k);
          d.v.mat.emissiveIntensity = 0.8;
        }
      }

      // The reticle on the target, facing the camera.
      const tv = a.target != null ? views.get(a.target) : null;
      reticle.visible = !!tv && state.status === 'playing';
      if (tv) {
        const f = tv.g.rotation.y;
        reticle.position.set(tv.x - Math.sin(f) * BACK * tv.scale, (tv.boss ? 1.0 : 0.85) * tv.scale, tv.z - Math.cos(f) * BACK * tv.scale);
        reticle.scale.setScalar(tv.boss ? 2.2 : 1);
        if (camera) reticle.quaternion.copy(camera.quaternion);
        spin.rotation.z = now * 1.4;
      }

      // Arrows in flight, pointing along their velocity.
      const n = Math.min(MAX_ARROWS, state.arrows.length);
      for (let i = 0; i < n; i++) {
        const r = state.arrows[i];
        E.set(0, Math.atan2(r.vx, r.vz), 0);
        Q.setFromEuler(E);
        M.compose(P.set(r.x, 1.5, r.z), Q, S1);
        arrows.setMatrixAt(i, M);
      }
      arrows.count = n;
      arrows.instanceMatrix.needsUpdate = true;

      // Arrow rain: a marked circle, and arrows falling into it on a loop until the last volley.
      let k = 0;
      rainMarks.forEach((g, i) => {
        const rain = state.rains[i];
        g.visible = !!rain;
        if (!rain) return;
        g.position.x = rain.x;
        g.position.z = rain.z;
        for (let j = 0; j < RAIN_ARROWS; j++) {
          const ph = (rain.age * 2.2 + j / RAIN_ARROWS) % 1;
          const ang = j * 2.399 + i;
          const rad = RAIN.radius * Math.sqrt(((j * 7) % RAIN_ARROWS) / RAIN_ARROWS) * 0.9;
          E.set(Math.PI / 2, 0, 0);
          Q.setFromEuler(E);
          M.compose(P.set(rain.x + Math.cos(ang) * rad, 9 * (1 - ph) + 0.3, rain.z + Math.sin(ang) * rad), Q, S1);
          rainArrows.setMatrixAt(k++, M);
        }
      });
      rainArrows.count = k;
      rainArrows.instanceMatrix.needsUpdate = true;
    },
    destroy() {
      scene.remove(root);
      for (const v of views.values()) v.mat.dispose();
      for (const d of dying) d.v.mat.dispose();
      arrows.dispose();
      rainArrows.dispose();
      for (const o of owned) o.dispose();
    },
  };
}
