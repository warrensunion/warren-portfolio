// The "Get in touch" figure: the BTTRshop hub's stone ring and particle figure on a paper plate. This
// adapter is the slim stand-in for the hub's scene.js and index.js (one renderer, camera, environment;
// no composer or bloom, which only grey a light page) plus the only parts that know about the page: the
// time line that replaces the hub's scroll marks, and the contact section's project links that morph
// the particles (morphLinks.js). Heavy work (the shapes, the stone) runs in workers (work.js).
//
// Poster hook for the stills (Task 9): ctx.data.posterState = { shape: null | 0 | 1 | 2 } renders the
// ring fully assembled and ignited with that shape settled (null = the initials, i = ctx.data.objects[i])
// and no motion at all (no breathing, wobble, sway, strays, trail or links), so a screenshot taken after
// `fig:ready` is reproducible. `posterState: true` is the same as { shape: null }.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Ring, RING_R, INNER_R, smooth } from './ring.js';
import { Particles } from './tube.js';
import { loadShapes, fitInCircle } from './tubeShapes.js';
import { prepareStone } from './textures.js';
import { createWork } from './work.js';
import { bindMorphLinks } from './morphLinks.js';
import { warmDraws } from '../warm.js';

const FOV = 35;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);
const PLATE = '#fbfbf8';
const ENV_TINT = '#e4e6e9'; // the room the stone reflects, a light grey toward the plate
const POINTS = { high: 48000, low: 20000 };
// Dot diameter in css px: the hub's dots were ~0.75% of its figure's height; at this stage's size that
// is under a pixel, so the dots are set in px instead (a little larger when there are fewer of them).
const DOT_PX = { high: 1.45, low: 1.75 };
const FRAME_R = RING_R + 0.08; // the ring's outside, with its chips, framed into...
const FRAME_FILL = 0.93; // ...this share of the stage's shorter side
const FIT_R = INNER_R - 0.08; // the particle shapes fit inside the inner ring
const DEG = Math.PI / 180;
const COMPACT_W = 480; // a phone-size stage (css px): the geodesic lines at 60 %

// Time line (s from the first start). The hub drove these by scroll px; here the ring plays once.
const T = { asm: 1.6, ign: 1.2, fadeFrom: 1.9, fadeTo: 2.4, assembleFrom: 2.0, assemble: 1.4 };
const T_END = T.assembleFrom + T.assemble;
// The camera swings from a low three-quarter view to almost straight on as the ring assembles and
// lights (the hub's 28 -> 90 deg swing, shortened): slightly below the axis at rest, so the lit inner
// wall of the top segments shows.
const CAM = { el0: -30 * DEG, az0: 0.22, el1: -5 * DEG, dist0: 1.14 };

// A ring that has already played this session (the page scrolled far away and back, so the host made
// it again) comes back assembled and lit instead of building itself a second time.
let played = false;

/** "WS" (or any text) as a white bold serif on transparent, for tubeShapes' kind 'logo'. */
export function initialsDataUrl(text, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  let px = Math.round(size * 0.62);
  const font = (p) => `700 ${p}px "Source Serif 4", "Iowan Old Style", "Palatino Linotype", Georgia, serif`;
  g.font = font(px);
  const wide = g.measureText(text).width;
  if (wide > size * 0.92) px = Math.floor((px * size * 0.92) / wide);
  g.font = font(px);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, size / 2, size / 2);
  return c.toDataURL('image/png');
}

export async function create(el, ctx) {
  const data = ctx.data || {};
  const objects = Array.isArray(data.objects) ? data.objects : [];
  if (!objects.length) throw new Error('no objects to morph to');
  const initials = String(data.initials || 'WS');
  const posterRaw = data.posterState;
  const poster = posterRaw ? (typeof posterRaw === 'object' ? posterRaw : {}) : null;
  const reduced = !!ctx.reduced;
  const motion = !(reduced || poster) ? 1 : 0;
  const tier = ctx.tier === 'low' ? 'low' : 'high';
  const n = POINTS[tier];
  // A poster still is drawn at the shot's full 2x, not the live scene's 1.5x frame-budget cap.
  const dpr = poster ? Math.min(window.devicePixelRatio || 1, 2) : tier === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
  const log = typeof ctx.log === 'function' ? ctx.log : () => {};

  // The serif first, so the initials are drawn in the page's face (a fallback serif if it will not load).
  try {
    await document.fonts?.load(`700 200px "Source Serif 4"`, initials);
  } catch {}

  // Shapes and stone first, in workers: a missing picture or a failed job fails the figure (the poster
  // stays) before a WebGL context is spent.
  const work = createWork();
  let shapes;
  let stone;
  const list = [
    { id: initials, src: initialsDataUrl(initials), kind: 'logo', key: `text:${initials}` },
    ...objects.map((o) => ({ id: o.slug, src: o.sample, kind: 'object' })),
  ];
  try {
    [stone, shapes] = await Promise.all([
      prepareStone(5, 512, { work, onFallback: log }),
      loadShapes(list, n, { work, onFallback: log }),
    ]);
  } catch (err) {
    work.abort();
    throw err;
  }
  const fitted = shapes.map((s) => fitInCircle(s, FIT_R));
  const k = fitted.reduce((a, s) => a + s.scale, 0) / fitted.length;

  let start = 0;
  if (poster && Number.isInteger(poster.shape) && poster.shape >= 0 && poster.shape < objects.length) start = poster.shape + 1;
  const settled = !!poster || reduced || played;

  const canvas = document.createElement('canvas');
  el.append(canvas);
  let renderer = null;
  let gl = null;
  const loseContext = () => {
    try {
      if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {}
  };

  let scene, camera, env, ring, parts;
  try {
    // antialias: the dots' soft rims are alpha-to-coverage, which needs MSAA.
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    gl = renderer.getContext();
    renderer.toneMapping = THREE.NoToneMapping; // the plate and ink come out as their hex (the hub's reason)
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(PLATE, 1);

    scene = new THREE.Scene();
    // Pieces fly in from behind out of the paper, as the hub's came out of its fog.
    scene.fog = new THREE.Fog(new THREE.Color(PLATE), 12, 24);
    camera = new THREE.PerspectiveCamera(FOV, 1000 / 520, 0.1, 100);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const tint = new THREE.Color(ENV_TINT);
    room.traverse((o) => {
      if (o.material?.color) o.material.color.multiply(tint);
      if (o.material?.emissive) o.material.emissive.multiply(tint);
      if (o.material?.emissiveIntensity > 3) o.material.emissiveIntensity = 3;
    });
    env = pmrem.fromScene(room, 0.04).texture;
    room.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    room.dispose?.();
    pmrem.dispose();

    ring = new Ring({ stone, env });
    scene.add(ring.root);
    parts = new Particles({ shapes: fitted, n, start, k, reduced, settled });
    scene.add(parts.points);
  } catch (err) {
    try {
      ring?.dispose();
      parts?.dispose();
      env?.dispose();
      renderer?.dispose();
    } catch {}
    loseContext();
    canvas.remove();
    throw err;
  }

  // ── Size and camera ──
  let w = 1;
  let h = 1;
  let dist = 10;
  let scale = 1;
  const sizeTo = (cw, ch) => {
    w = Math.max(1, Math.round(cw));
    h = Math.max(1, Math.round(ch));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // The ring's outside fills FRAME_FILL of the shorter side (height on the wide desktop stage).
    dist = Math.max(FRAME_R / (TAN * FRAME_FILL), FRAME_R / (TAN * camera.aspect * FRAME_FILL));
    scale = (renderer.getPixelRatio() * h) / (2 * TAN);
  };
  sizeTo(el.clientWidth || 1000, el.clientHeight || 520);

  const pose = (p) => {
    const e = smooth(0, 1, p);
    const el1 = CAM.el0 + (CAM.el1 - CAM.el0) * e;
    const az = CAM.az0 * (1 - e);
    const d = dist * (CAM.dist0 + (1 - CAM.dist0) * e);
    camera.position.set(Math.sin(az) * Math.cos(el1) * d, Math.sin(el1) * d, Math.cos(az) * Math.cos(el1) * d);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
  };

  // ── State ──
  let clock = settled ? T_END + 1 : 0;
  let pointer = null;
  const names = [initials, ...objects.map((o) => o.slug)];
  const show = (i) => {
    const to = i == null ? 0 : Number(i) + 1;
    if (!Number.isInteger(to) || to < 0 || to >= fitted.length) return;
    parts.morph(to, clock);
  };

  // Link the programs off the main thread where the driver can, so the first frame does not stall.
  try {
    pose(settled ? 1 : 0);
    ring.update({ asm: 1, ign: 1, time: 0, motion: 0, scale }); // every piece visible for the compile
    await renderer.compileAsync(scene, camera);
    await warmDraws(scene, () => renderer.render(scene, camera)); // then one draw per program, a task each
  } catch {}

  // ── Input: the contact section's project links, and the pointer over the stage (the trail) ──
  const section = el.closest('section');
  const shown = () => (parts.index === 0 ? null : parts.index - 1); // what is on screen, in link terms
  const links = poster ? null : bindMorphLinks(section, show, 120, shown);
  if (!poster && links && !links.count) log('no [data-morph] links in this section');
  const listeners = [];
  const on = (target, type, fn) => {
    target.addEventListener(type, fn);
    listeners.push([target, type, fn]);
  };
  if (motion) {
    on(el, 'pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect();
      pointer = [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1];
    });
    on(el, 'pointerleave', () => (pointer = null));
  }

  // ── Frame ──
  let raf = 0;
  let running = false;
  let last = 0;
  let readyFired = false;
  let destroyed = false;

  const frame = (now) => {
    if (!running || destroyed) return;
    raf = requestAnimationFrame(frame);
    const rawMs = last ? now - last : 16.7; // the real frame time, for ctx.frame (fps meter, __figStats)
    const dtMs = Math.min(rawMs, 100); // the simulation step only
    last = now;
    const dt = dtMs / 1000;
    if (!poster) clock += dt;
    const asmU = clock / T.asm;
    const asm = Math.min(1, asmU);
    const ign = Math.max(0, Math.min(1, (clock - T.asm) / T.ign));
    if (clock >= T_END && !poster) played = true;
    pose(Math.min(1, clock / (T.asm + T.ign)));
    ring.update({ asm, asmU, ign, time: motion ? clock : 0, motion, scale, lines: w < COMPACT_W ? 0.6 : 1 });
    parts.update({
      // The real clock even when still: morphs are timed on it (stillness is motion 0; a poster's clock stands).
      clock,
      dt,
      assemble: Math.max(0, Math.min(1, (clock - T.assembleFrom) / T.assemble)),
      fade: smooth(T.fadeFrom, T.fadeTo, clock),
      motion,
      pointer,
      camera,
      scale,
      dotPx: DOT_PX[tier] * renderer.getPixelRatio(),
      dist,
    });
    renderer.render(scene, camera);
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
      pointer = null;
    },
    resize(cw, ch) {
      if (destroyed || !cw || !ch) return;
      sizeTo(cw, ch);
    },
    show,
    readout() {
      return readyFired ? `${names[parts.index]}, ${Math.round(n / 1000)}k points` : '';
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      running = false;
      cancelAnimationFrame(raf);
      links?.unbind();
      for (const [t, type, fn] of listeners) t.removeEventListener(type, fn);
      work.abort();
      try {
        ring.dispose();
        parts.dispose();
        env.dispose();
        renderer.dispose();
      } catch {}
      loseContext();
      canvas.remove();
    },
  };
}
