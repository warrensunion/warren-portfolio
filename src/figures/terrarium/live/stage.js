// Ported from terrarium src/live/stage.js at 7612a40 (Warren's own project). Changes: takes { tier } (low: DPR 1, no MSAA target); asset URLs under /terrarium/; canvas touch-action pan-y; resize(w, h) takes the host's size.
/**
 * Everything the live screen draws, assembled once: renderer, scene, jar,
 * terrain, creatures, food, spores, camera rig and the grade. The live screen
 * only wires the worker and the UI to this; live-dev.html uses the same
 * module, so what the dev page measures is exactly what ships.
 */
import * as THREE from 'three';
import { createJar } from './jar.js';
import { createTerrain } from './terrain.js';
import { createCreatures } from './creatures.js';
import { createFood } from './food.js';
import { createParticles } from './particles.js';
import { createCameraRig } from './camera.js';
import { createGrade } from './grade.js';
import { lightUniforms } from './look.js';

// no soil texture ships (the terrain's procedural peat is the soil), so none is
// requested: a missing file is a 404 and a console error on every static host
const ART = { moss: '/terrarium/moss-floor.webp', backdrop: '/terrarium/room-backdrop.webp' };

/** resolves to a texture, or null if the file is missing or not an image */
function loadOptional(url) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(url, resolve, undefined, () => resolve(null));
  });
}

/**
 * @param {HTMLElement} container the stage fills it (a canvas.lv-canvas is appended)
 * @param {{ bodyFromGenes:Function, reducedMotion?:boolean, max?:number, pixelRatio?:number, tier?:'high'|'low' }} opts
 *   tier 'low': device pixel ratio 1 and no MSAA (the grade pass stays: every live shader outputs linear
 *   light and the grade is what tone-maps it to sRGB).
 */
export function createStage(container, { bodyFromGenes, reducedMotion = false, max = 2000, pixelRatio, tier = 'high' } = {}) {
  const low = tier === 'low';
  if (low) pixelRatio = 1;
  const canvas = document.createElement('canvas');
  canvas.className = 'lv-canvas';
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y';
  container.append(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  const dpr = () => pixelRatio || Math.min(2, globalThis.devicePixelRatio || 1);
  renderer.setPixelRatio(dpr());
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.03, 200);

  const jar = createJar();
  const terrain = createTerrain();
  scene.add(jar.group, terrain);
  const creatures = createCreatures(scene, { max, bodyFromGenes, reducedMotion });
  const food = createFood(scene);
  const particles = createParticles(scene);
  particles.setReducedMotion(reducedMotion);
  const rig = createCameraRig(camera, canvas, { reducedMotion });
  const grade = createGrade(renderer, { samples: low ? 0 : 4 });
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(), buf = new THREE.Vector2();
  let prev = null, next = null, time = 0, disposed = false;

  const textures = [];

  /**
   * Warm-up, so the first visible seconds are not spent compiling shaders and
   * uploading textures (that was 33–166 ms frames for ~3 s): load the optional
   * art, upload it, compile every program (scene into the MSAA target, and the
   * grade pass), then (once the first frame arrives, waiting up to 1.5 s) draw a few
   * full frames offscreen. Resolves even if art is missing
   * or compilation fails, so the screen is never stuck behind it.
   */
  const ready = (async () => {
    // art is optional: the jar is fully procedural without it
    const [moss, backdrop] = await Promise.all([loadOptional(ART.moss), loadOptional(ART.backdrop)]);
    for (const t of [moss, backdrop]) if (t) textures.push(t);
    if (disposed) { for (const t of textures) t.dispose(); return; }
    terrain.userData.setTextures({ moss, soil: null });
    jar.setBackdrop(backdrop);
    try {
      for (const t of textures) renderer.initTexture(t);
      jar.update(camera, buf.x, buf.y);
      renderer.setRenderTarget(grade.target);
      await renderer.compileAsync(scene, camera);
      renderer.setRenderTarget(null);
      await grade.compileAsync();
      if (disposed) return;
      // a few full frames with real creatures, offscreen: uploads the instance buffers and lets
      // the JIT tier up creatures.update (otherwise the first ~6 visible frames take 35–50 ms)
      const t0 = performance.now();
      while (!next && !disposed && performance.now() - t0 < 1500) await new Promise((r) => setTimeout(r, 30));
      for (let i = 0; i < 4 && !disposed; i++) {
        if (next) { creatures.update(prev, next, 1, 1 / 60); food.update(next.food); }
        rig.update(0);
        grade.render(scene, camera, 0);
      }
    } catch (e) {
      renderer.setRenderTarget(null);
      console.info('[terrarium] live warm-up skipped:', e && e.message);
    }
  })();

  const stage = {
    renderer, scene, camera, rig, creatures, food, particles, canvas,
    /** resolves once art is uploaded and every shader is compiled: reveal the canvas after this */
    ready,
    /** match the container's size (or the given css size, from the figure host) */
    resize(cw, ch) {
      const w = Math.max(1, Math.round(cw || container.clientWidth)), h = Math.max(1, Math.round(ch || container.clientHeight));
      renderer.setPixelRatio(dpr()); // the window may have moved to a screen with another density
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const s = renderer.getDrawingBufferSize(buf);
      grade.setSize(s.x, s.y);
      particles.setSize(s.y);
    },
    /** the two latest sim frames (worker format); render() interpolates between them */
    setFrames(p, n) {
      prev = p; next = n;
      if (n) food.update(n.food);
    },
    /** draw one frame; alpha 0..1 = how far between prev and next, dt = seconds since last render */
    render(dt, alpha = 1) {
      dt = dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt; // a hidden tab must not come back as one huge step
      time += dt;
      lightUniforms.uTime.value = time;
      // leg LOD needs the view; last frame's camera is close enough
      creatures.setView(camera.position, canvas.clientHeight / (2 * Math.tan((camera.fov * Math.PI) / 360)));
      if (next) creatures.update(prev, next, alpha, dt);
      rig.update(dt);
      const s = renderer.getDrawingBufferSize(buf);
      jar.update(camera, s.x, s.y);
      grade.render(scene, camera, time);
    },
    /** creature id under a client-space point, or null */
    pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return creatures.pick(raycaster);
    },
    setReducedMotion(v) { creatures.setReducedMotion(v); particles.setReducedMotion(v); rig.setReducedMotion(v); },
    dispose() {
      if (disposed) return;
      disposed = true;
      rig.dispose(); creatures.dispose(); food.dispose(); particles.dispose(); jar.dispose(); grade.dispose();
      terrain.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      for (const t of textures) t.dispose();
      textures.length = 0;
      renderer.dispose();
      renderer.forceContextLoss(); // WEBGL_lose_context
      canvas.remove();
    },
  };
  stage.resize();
  return stage;
}
