// Figs. 2-4: one project object frozen in an ice block, the BTTRshop hub's block on a paper plate. This
// adapter is the slim stand-in for the hub's scene.js (one renderer, camera, environment and four
// lights, no composer or bloom: bloom greys a light page and a figure has a frame budget) plus the
// only part that knows about the page: the drag and arrow-key orbit, the cursor lean and the label.
//
// Poster hook for the stills (Task 9): pass ctx.data.posterState = true (or { yaw, pitch } in degrees).
// The block then holds that pose (no wobble, lean or tumbling, input ignored), and the label and its
// leader are drawn complete on the first frame, so a screenshot after `fig:ready` is reproducible.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { IceBlock, sharedMaterials } from './block.js';
import { frostMaps } from './textures.js';
import { createBackground } from './background.js';
import { createLabel, lagFor } from './label.js';
import { Orbit, keyNudge, formatYaw, clamp, DEG, YAW_MAX, PITCH_MAX } from './orbit.js';
import { SHAPE_IDS } from './shapes.js';
import { nextTask, warmDraws } from '../warm.js';
import './figure.css';

const FOV = 30;
const CAM_Z = 12;
// Paper fog (spec 5): the hub's #c6c9d1 / #9fa4ae lavender-grey re-keyed to the stage's #eef0f1.
const BACKDROP = { centre: '#eef0f1', edge: '#e3e6e8' };
const SCENE_FOG = { color: '#e6e9eb', near: CAM_Z - 0.5, far: CAM_Z + 22 };
// The room the ice reflects, tinted toward the fog it floats in (the hub's #c3c8d3, lighter for paper).
const ENV_TINT = '#dfe3e7';
// Seeds as in the hub (its AREA_IDS order), so each block is the crystal it is there.
const SEED_INDEX = { face: 0, physique: 1, knowledge: 6 };
// The block sits right of and below the plate's centre (world units) so its label has room top-left.
const OFFSET = [0.85, -0.22];
// A phone-size stage (under 480 css px, labelPx's breakpoint) frames the block closer, so the frozen
// object is not a few dozen px wide (review r2). x stays near the desktop offset: at 1.1 the widest hull
// (the flag's) ran off the stage's right edge at 390 px (Task 9b shots). The label keeps the top-left.
const COMPACT_W = 480;
const COMPACT_Z = 10.5;
const COMPACT_OFFSET = [0.8, -0.3];
const LABEL_DELAY = 200; // ms after the first frame: the canvas is half faded in when the label starts

export async function create(el, ctx) {
  const data = ctx.data || {};
  if (!SHAPE_IDS.includes(data.shape)) throw new Error(`unknown ice shape "${data.shape}"`);
  if (!data.object) throw new Error('no object art');
  const poster = data.posterState ? (typeof data.posterState === 'object' ? data.posterState : {}) : null;
  const motion = !(ctx.reduced || poster);
  const tier = ctx.tier === 'low' ? 'low' : 'high';
  // A poster still is drawn at the shot's full 2x, not the live scene's 1.5x frame-budget cap.
  const dpr = poster ? Math.min(window.devicePixelRatio || 1, 2) : tier === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);

  // The art first: a missing picture fails the figure (the poster stays) before a context is spent.
  const tex = await new THREE.TextureLoader().loadAsync(data.object);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const canvas = document.createElement('canvas');
  el.append(canvas);
  const owned = { textures: [tex] };
  let renderer = null;
  let gl = null;
  const loseContext = () => {
    try {
      if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {}
  };

  let scene, camera, env, shared, block, background;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    gl = renderer.getContext();
    // No tone mapping: the fog and ink come out as their hex (the hub's reason, kept).
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    // Full-resolution transmission: at half res the object behind the ice smears past recognition.
    renderer.transmissionResolutionScale = 1;
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(BACKDROP.edge, 1);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(new THREE.Color(SCENE_FOG.color), SCENE_FOG.near, SCENE_FOG.far);
    camera = new THREE.PerspectiveCamera(FOV, 4 / 3, 0.1, 100);
    camera.position.set(0, 0, CAM_Z);
    scene.add(camera); // the fog backdrop rides on it

    await nextTask(); // the context, the environment and the frost maps each get a task of their own
    // Environment: RoomEnvironment's soft boxes, tinted to the fog, made once and the generator freed.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const tint = new THREE.Color(ENV_TINT);
    room.traverse((o) => {
      if (o.material?.color) o.material.color.multiply(tint);
      if (o.material?.emissive) o.material.emissive.multiply(tint);
      // Its area lights run to 100x: a facet square-on to one blew out. Capped, they still give
      // bright facet edges.
      if (o.material?.emissiveIntensity > 3) o.material.emissiveIntensity = 3;
    });
    // The room's lit materials link in parallel first (into a float target, as fromScene draws them),
    // and its six faces are then drawn one per task, so fromScene() finds every program ready.
    // Done in one go, this step was a 750 ms main-thread task on a desktop GPU.
    {
      const probe = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
      const probeCam = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
      renderer.setRenderTarget(probe);
      const ready = renderer.compileAsync(room, probeCam);
      renderer.setRenderTarget(null);
      await ready;
      await warmDraws(room, () => {
        renderer.setRenderTarget(probe);
        renderer.render(room, probeCam);
        renderer.setRenderTarget(null);
      });
      probe.dispose();
      await nextTask();
    }
    env = pmrem.fromScene(room, 0.04).texture;
    room.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    room.dispose?.();
    pmrem.dispose();

    // Light (the hub's): soft key top-left, cool fill, strong rim from behind.
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(-5, 6, 6);
    const rim = new THREE.DirectionalLight('#eef3ff', 3.0);
    rim.position.set(3, 4, -8);
    const rim2 = new THREE.DirectionalLight('#dfe6f5', 1.4);
    rim2.position.set(-4, -2, -7);
    const fill = new THREE.HemisphereLight('#dfe3ec', '#6f7686', 0.55);
    scene.add(key, rim, rim2, fill);

    await nextTask();
    const maps = await frostMaps(11);
    owned.textures.push(maps.roughness, maps.normal, maps.thickness);
    shared = sharedMaterials({ maps, env });

    background = createBackground({ colors: BACKDROP });
    block = new IceBlock({ id: data.shape, index: SEED_INDEX[data.shape], accent: data.accent, objectTexture: tex, shared });
    block.root.position.set(OFFSET[0], OFFSET[1], 0);
    scene.add(block.root);
  } catch (err) {
    // A throw after the renderer was made would otherwise leave its context counted by the browser.
    try {
      block?.dispose();
      shared?.shard.dispose();
      background?.dispose();
      env?.dispose();
      owned.textures.forEach((t) => t.dispose());
      renderer?.dispose();
    } catch {}
    loseContext();
    canvas.remove();
    throw err;
  }

  const orbit = new Orbit();
  if (poster) {
    orbit.yaw = clamp((Number(poster.yaw) || 0) * DEG, -YAW_MAX, YAW_MAX);
    orbit.pitch = clamp((Number(poster.pitch) || 0) * DEG, -PITCH_MAX, PITCH_MAX);
  }
  const label = data.label ? createLabel(el, String(data.label)) : null;
  // A poster is shot on its first frame: the label layer must not be mid-fade.
  if (label && poster) label.el.style.transition = 'none';
  const fig = el.closest('figure') || el;

  let w = 1;
  let h = 1;
  const sizeTo = (cw, ch) => {
    w = Math.max(1, Math.round(cw));
    h = Math.max(1, Math.round(ch));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const compact = w < COMPACT_W;
    camera.position.z = compact ? COMPACT_Z : CAM_Z;
    const off = compact ? COMPACT_OFFSET : OFFSET;
    block.root.position.set(off[0], off[1], 0);
    block.setCompact(compact);
    camera.updateProjectionMatrix();
    background.fit(camera, w, h);
  };
  sizeTo(el.clientWidth || 400, el.clientHeight || 300);

  // Link the programs off the main thread where the driver can (KHR_parallel_shader_compile), so the
  // first frame does not stall a scrolling page.
  // Then each program is drawn once, a task apiece (see warm.js), so the first frame is cheap too.
  try {
    await renderer.compileAsync(scene, camera);
    await warmDraws(scene, () => renderer.render(scene, camera));
  } catch {}

  // ── Input: drag orbit (pointer capture), arrow keys on the focused figure, cursor lean, hot ──
  let pointer = null; // NDC over the stage, for the lean
  let over = false;
  let focused = false;
  let drag = null; // { id, x, y }
  let keyHeld = false;
  const listeners = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    listeners.push([target, type, fn, opts]);
  };
  const toNdc = (e) => {
    const r = el.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1];
  };
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    try {
      if (el.hasPointerCapture?.(drag.id)) el.releasePointerCapture(drag.id);
    } catch {}
    drag = null;
    orbit.release();
  };
  if (!poster) {
    on(el, 'pointerdown', (e) => {
      if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {}
      orbit.grab();
    });
    on(el, 'pointermove', (e) => {
      if (e.pointerType !== 'touch') pointer = toNdc(e);
      if (drag && e.pointerId === drag.id) orbit.drag(e.clientX - drag.x, e.clientY - drag.y, w);
    });
    on(el, 'pointerup', endDrag);
    on(el, 'pointercancel', endDrag);
    on(el, 'lostpointercapture', endDrag);
    on(el, 'pointerenter', (e) => {
      if (e.pointerType !== 'touch') over = true;
    });
    on(el, 'pointerleave', () => {
      over = false;
      if (!drag) pointer = null;
    });
    on(fig, 'keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.target !== fig) return;
      const n = keyNudge(e.key);
      if (!n) return;
      e.preventDefault(); // the arrows turn the block instead of scrolling the page
      if (!keyHeld) {
        keyHeld = true;
        orbit.grab();
      }
      orbit.nudge(n[0], n[1]);
    });
    const keyUp = () => {
      if (!keyHeld) return;
      keyHeld = false;
      orbit.release();
    };
    on(fig, 'keyup', (e) => {
      if (keyNudge(e.key)) keyUp();
    });
    on(fig, 'focus', () => (focused = true));
    on(fig, 'blur', () => {
      focused = false;
      keyUp();
    });
    focused = document.activeElement === fig;
  }

  // ── Frame ──
  let raf = 0;
  let running = false;
  let last = 0;
  let readyFired = false;
  let destroyed = false;
  let labelStarted = false;

  const frame = (now) => {
    if (!running || destroyed) return;
    raf = requestAnimationFrame(frame);
    const rawMs = last ? now - last : 16.7; // the real frame time, for ctx.frame (fps meter, __figStats)
    const dtMs = Math.min(rawMs, 100); // the simulation step only
    last = now;
    const dt = dtMs / 1000;
    if (!poster) orbit.step(dt);
    block.update({
      time: now / 1000,
      yaw: orbit.yaw,
      pitch: orbit.pitch,
      pointer: motion ? pointer : null,
      hot: over || focused || !!drag,
      dt,
      motion: motion ? 1 : 0,
    });
    renderer.render(scene, camera);
    if (label) {
      if (!labelStarted) {
        labelStarted = true;
        if (motion) label.in(now + LABEL_DELAY);
        else label.snap();
      }
      label.place(block.screenAnchors(camera, w, h).topLeft, w, h, motion ? lagFor(dt) : 1);
      label.update(now);
    }
    ctx.frame?.(rawMs);
    if (!readyFired) {
      readyFired = true;
      el.dispatchEvent(new Event('fig:ready'));
    }
  };

  return {
    start() {
      if (running || destroyed) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
      endDrag();
    },
    resize(cw, ch) {
      if (destroyed || !cw || !ch) return;
      sizeTo(cw, ch);
    },
    readout() {
      return readyFired ? formatYaw(block.turn) : '';
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      running = false;
      cancelAnimationFrame(raf);
      endDrag();
      for (const [t, type, fn, opts] of listeners) t.removeEventListener(type, fn, opts);
      label?.destroy();
      try {
        block.dispose();
        shared.shard.dispose();
        background.dispose();
        env.dispose();
        owned.textures.forEach((t) => t.dispose());
        renderer.dispose();
      } catch {}
      loseContext();
      canvas.remove();
    },
  };
}
