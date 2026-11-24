// Log 02, the ice field: every project as a block of ice floating up through the treeline cloud, the
// BTTRshop hub's scroll (BTTRURSLF-v2 src/screens/shop/hub/, Warren's own code) ported onto this page.
// It is the world's second act: its own scene and camera on the world's renderer, drawn while the page's
// mid line is inside the #index section, swapped with the mountain at the peak of the dissolve.
//
// The page scrolls natively: boot.js turns the section's scroll into fieldP (0..1), and each block's
// passage u (-1 entering from below, 0 centred, 1 gone through the top) is a fixed slice of it. Clicking a
// block (or pressing Enter on its link) dollies into the ice, flashes its facets, fills the screen with
// the dissolve's fog, jumps the page to that project under it, and clears there.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createBackground } from './backdrop.js';
import { Dissolve } from './dissolve.js';
import { IceBlock, sharedMaterials, travelY } from './block.js';
import { frostMaps, starTexture, blurTextTexture } from './textures.js';
import { createLabels } from './labels.js';

// The cloud at the treeline: the hub's fog, cooled to this page's blue hour.
export const FOG = { centre: '#a7b0c3', edge: '#7c869c', corner: '#687187' };
const FOV = 30;
const CAM_Z = 12;
const SCENE_FOG = { color: '#98a1b5', near: CAM_Z - 0.5, far: CAM_Z + 22 };
// The hull recipes (shapes.js), one per block in page order, so neighbours never repeat.
const RECIPES = ['face', 'knowledge', 'hair', 'physique', 'sociability', 'fashion', 'knowledge', 'hair', 'face', 'physique', 'sociability', 'fashion'];

const ClampShader = null; // the world's composer clamps already

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const pad = (n) => String(n).padStart(2, '0');

export async function createField({ renderer, composer, insertBefore, dpr, tier, reduced }) {
  void ClampShader;
  const section = document.getElementById('index');
  const stageEl = section?.querySelector('.ice-stage');
  const links = section ? [...section.querySelectorAll('.ice-link')] : [];
  if (!section || !stageEl || !links.length) return null;
  const data = links.map((a, i) => ({
    id: a.getAttribute('href').slice(1),
    code: `PROJECT_${pad(i + 1)}`,
    name: a.querySelector('.ice-name')?.textContent || '',
    meta: (a.dataset.meta || '').toUpperCase(),
    date: a.dataset.date || '',
    symbol: a.dataset.symbol || 'bttr',
  }));
  const N = data.length;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(new THREE.Color(SCENE_FOG.color), SCENE_FOG.near, SCENE_FOG.far);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAM_Z);
  scene.add(camera);

  // Environment: RoomEnvironment's soft boxes, tinted to the fog (the hub's recipe).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const tint = new THREE.Color('#bcc5d6');
  room.traverse((o) => {
    if (o.material?.color) o.material.color.multiply(tint);
    if (o.material?.emissive) o.material.emissive.multiply(tint);
    if (o.material?.emissiveIntensity > 3) o.material.emissiveIntensity = 3;
  });
  const env = pmrem.fromScene(room, 0.04).texture;
  room.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  pmrem.dispose();

  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(-5, 6, 6);
  const rim = new THREE.DirectionalLight('#eef3ff', 3.0);
  rim.position.set(3, 4, -8);
  const rim2 = new THREE.DirectionalLight('#dfe6f5', 1.4);
  rim2.position.set(-4, -2, -7);
  const fill = new THREE.HemisphereLight('#dfe3ec', '#6f7686', 0.55);
  scene.add(key, rim, rim2, fill);

  const d = new Date();
  const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  const maps = frostMaps(11);
  const star = starTexture();
  const text = blurTextTexture(date);
  const textures = [maps.roughness, maps.normal, maps.thickness, star, text];
  const shared = sharedMaterials({ maps, env, star });
  const background = createBackground({ textTexture: text, colors: FOG });
  scene.add(background.mesh);
  renderer.transmissionResolutionScale = tier === 'low' ? 0.5 : 1;

  const blocks = data.map(
    (b, i) =>
      new IceBlock({ id: b.id, index: i, recipe: RECIPES[i % RECIPES.length], symbol: b.symbol, accent: '#9fd3e6', shared, dpr, scale: i === 0 ? 1.18 : 1 }),
  );
  for (const b of blocks) scene.add(b.root);

  const dissolve = new Dissolve({ reduced, dpr, colors: FOG });
  composer.insertPass(dissolve.pass, Math.max(1, composer.passes.indexOf(insertBefore)));

  // ---- passage: block i is centred at fieldP = p_i; each is on screen for 2/3 of its pitch ----
  const P = N + 0.7;
  const centreOf = (i) => (i + 0.85) / P;
  const passage = (i, p) => (p - centreOf(i)) * P * 1.5;

  // ---- the move into a block ----
  let move = null; // { i, t, phase }
  let frame = 1;
  let w = 1;
  let h = 1;
  const v = new THREE.Vector3();

  function scrollToProject(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + scrollY - 72;
    window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
    // the heading takes focus so keyboard and screen-reader users land where the eye does
    const h3 = el.querySelector('h3');
    if (h3) {
      h3.setAttribute('tabindex', '-1');
      h3.focus({ preventScroll: true });
      h3.addEventListener('blur', () => h3.removeAttribute('tabindex'), { once: true });
    }
    history.replaceState(null, '', '#' + id);
  }

  function open(i) {
    if (move || i < 0 || i >= N) return;
    const id = data[i].id;
    if (reduced) {
      dissolve.pulse({ from: 0, to: 1, ms: 150, onDone: () => {
        scrollToProject(id);
        dissolve.pulse({ from: 1, to: 0, ms: 150 });
      } });
      return;
    }
    move = { i, t: 0 };
    dissolve.pulse({ from: 0, to: 1, ms: 480, delay: 240, glitch: 1, onDone: () => {
      scrollToProject(id);
      move = null;
      for (const b of blocks) b.flash = 0;
      dissolve.pulse({ from: 1, to: 0, ms: 700, glitch: 0.5 });
    } });
  }

  const labels = createLabels(stageEl, data, { onOpen: open, reduced });

  // Keyboard: focusing a project's link glides the page to its block; Enter (a click) plays the move.
  const glide = (i) => {
    const r = section.getBoundingClientRect();
    const top = r.top + scrollY;
    const y = top + centreOf(i) * r.height - innerHeight * 0.5;
    window.scrollTo({ top: Math.max(0, y), behavior: reduced ? 'instant' : 'smooth' });
  };
  const onFocus = (e) => {
    const a = e.target.closest?.('.ice-link');
    if (a && document.documentElement.classList.contains('world-live')) glide(Number(a.dataset.block));
  };
  const onClick = (e) => {
    const a = e.target.closest?.('.ice-link');
    if (a && document.documentElement.classList.contains('world-live')) {
      e.preventDefault();
      open(Number(a.dataset.block));
    }
  };
  section.addEventListener('focusin', onFocus);
  section.addEventListener('click', onClick);

  // Mouse: a click on a block (not on any control) opens it.
  let hovered = -1;
  let active = false;
  const NOT = 'a, button, input, textarea, select, label, summary, [tabindex], figure, nav, header, footer, .palette';
  const onWindowClick = (e) => {
    if (!active || hovered < 0 || e.button !== 0) return;
    if (e.target.closest && e.target.closest(NOT)) return;
    open(hovered);
  };
  addEventListener('click', onWindowClick);

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let current = -1;

  return {
    scene,
    camera,
    open,
    resize(cw, ch) {
      w = cw;
      h = ch;
      camera.aspect = w / h;
      frame = Math.max(1, 0.95 / camera.aspect);
      camera.updateProjectionMatrix();
    },
    /** Every frame, whichever act is on: the dissolve's amount, the move's flash. */
    post({ amount, speed, dt, motion }) {
      if (move) {
        move.t += Math.min(dt, 1 / 30) * 1000;
        const b = blocks[move.i];
        const t = move.t;
        b.flash = t < 260 ? smooth(90, 260, t) : 1 - smooth(260, 640, t);
      }
      dissolve.update({ amount, speed, dt, w, h, motion });
    },
    update(st) {
      active = true;
      const p = st.fieldP;
      // the camera: straight on, igloo's fog; on a portrait screen pulled back to fit a block across
      let pos = [0, 0, CAM_Z * frame];
      let aim = [0, 0, 0];
      if (move) {
        const b = blocks[move.i];
        const k = smooth(0, 720, move.t);
        const c = b.root.position;
        aim = [c.x * k, c.y * k, c.z * k];
        pos = [c.x * k, c.y * k + 0.1 * k, pos[2] + (c.z + 4.4 - pos[2]) * k];
      }
      camera.position.set(...pos);
      camera.lookAt(...aim);
      camera.updateMatrixWorld();
      background.fit(camera, w, h);
      background.update({ time: st.time, px: p * P * 1200, motion: st.motion });
      // hover: the block under the pointer
      hovered = -1;
      if (st.pointer && !move) {
        ndc.set(st.pointer[0], st.pointer[1]);
        ray.setFromCamera(ndc, camera);
        const vis = blocks.filter((b) => b.root.visible);
        const hits = ray.intersectObjects(vis.map((b) => b.ice), false);
        if (hits.length) hovered = blocks.indexOf(vis.find((b) => b.ice === hits[0].object));
      }
      document.documentElement.classList.toggle('ice-hover', hovered >= 0);
      // only the two blocks nearest the centre render
      const us = blocks.map((b, i) => passage(i, p));
      const near = us.map((u, i) => [Math.abs(u), i]).sort((a, b) => a[0] - b[0]).slice(0, 2).map((x) => x[1]);
      blocks.forEach((b, i) => {
        const u = near.includes(i) ? us[i] : 99;
        b.update({ u, time: st.time, pointer: st.pointer, hot: hovered === i, dt: st.dt, motion: st.motion });
      });
      // the side index: the block nearest the centre is "here"
      const here = Math.abs(us[near[0]]) < 0.6 ? near[0] : -1;
      if (here !== current) {
        current = here;
        links.forEach((a, i) => a.classList.toggle('is-here', i === here));
      }
      // labels
      const anchors = {};
      for (const i of near) if (blocks[i].root.visible && Math.abs(us[i]) < 1.05) anchors[i] = blocks[i].screenAnchors(camera, w, h);
      labels.update(move ? {} : anchors, { now: performance.now(), dt: st.dt, w, h, hot: hovered });
    },
    /** The mountain act is on: labels off, no hover. */
    idle() {
      if (!active) return;
      active = false;
      hovered = -1;
      document.documentElement.classList.remove('ice-hover');
      labels.update({}, { now: performance.now(), dt: 0.016, w, h, hot: -1 });
    },
    get blocks() {
      return blocks;
    },
    travelY,
    dispose() {
      removeEventListener('click', onWindowClick);
      section.removeEventListener('focusin', onFocus);
      section.removeEventListener('click', onClick);
      labels.dispose();
      for (const b of blocks) b.dispose();
      background.dispose();
      shared.shard.dispose();
      shared.symbolMat.dispose();
      shared.ghostMat.dispose();
      for (const t of textures) t.dispose();
      env.dispose();
      dissolve.dispose();
      void v;
    },
  };
}
