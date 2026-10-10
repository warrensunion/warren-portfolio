// The Terrarium track figure (spec 5.3): Terrarium's own jar, live from a fixed seed, walked through five
// stages by scroll. This adapter is the only part that knows about the page; the sim, the worker, the jar
// renderer, the river and the brain view are ports (see docs/port-notes/terrarium.md).
//
// Stages, with x = ctx.progress() * 4:
//   0 The jar        1x; the camera settles on the jar (the intro orbit runs over x 0..1).
//   1 Generations    16x while the live max generation is below targetGen(x) = round(G * clamp(x - 0.5)),
//                    G being history.json's max generation at 3,600 steps; 1x once it has caught up.
//   2 Species split  the river (precomputed from the same seed, so it scrubs both ways) slides up over the
//                    lower 32% and draws in with its playhead at clamp(x - 1.5).
//   3 Brains         the brain view opens for the featured lineage: the oldest living member of history's
//                    featured species, beside its line's gen-0 founder (kept in history.json).
//   4 Your turn      drag to turn the jar, click a creature for its brain; 1, 2, 3 set the speed and F
//                    follows a creature, only while the figure has focus. Esc closes and lets go.
// The live jar only runs forward: scrolling back into stage 0 from a later stage restarts it from the seed.
//
// Scroll safety (spec 3.7): no wheel listener at all, the canvas is touch-action: pan-y, keys are heard on
// the figure, not the window. The overlays sit over the stage (not in it, so the stage holds exactly its
// one WebGL canvas) and swallow their own pointer events, so nothing is picked through them.
//
// Poster hook: ctx.data.posterState = { stage } runs the sim headless to that stage's tick (0, 1800, 3600,
// 3600, 3600) before drawing, holds the world still and fires fig:ready once the eased parts have settled.
// ?debug=1 exposes window.__terra = { gen(), pop(), species(), azimuth(), pickFirst(), camera() } for the checks.
import * as THREE from 'three';
import { createStage } from './live/stage.js';
import { STRIDE } from './sim/world.js';
import { createRiver } from './river.js';
import { createBrainViz } from './brain.js';
import { clamp, damp, lerp, p2inOut } from './ease.js';
import './figure.css';

const SEED = 20261010;
const PARAMS = { foodRate: 1.3, mutationRate: 0.3, temperature: 0.5 };
const COUNT = { high: 300, low: 160 };
const HISTORY_URL = '/terrarium/history.json';
const FIRST_FRAME_MS = 10000; // a worker that sends nothing in this long has failed to start
const POSTER_TICKS = [0, 1800, 3600, 3600, 3600];
const POSTER_SETTLE_FRAMES = 90; // brain fade-ins and the river's scale ease out within 1.5 s
const KEY_SPEED = { 1: 1, 2: 4, 3: 16 };
const STEP_ERRORS = 3;
// The intro orbit: from a low three-quarter view to the source's home angle (tilt 0.9, azimuth -0.32).
const ORBIT_FROM = { phi: 1.2, theta: -1.15, zoom: 1.1 };
const ORBIT_TO = { phi: 0.9, theta: -0.32, zoom: 1 };
const CLICK_PX = 6; // the source's drag threshold: a press that moved less is a click
const LIFT = { zoom: 0.26, y: 0.16 }; // the jar's framing above an open river (32% of the plate)

export const targetGen = (x, G) => Math.round(G * clamp(x - 0.5, 0, 1));

/** Steps per frame for a stage: the stage-1 fast-forward chases targetGen, the visitor sets stage 4. */
export function speedFor(stage, x, gen, G, user) {
  if (stage >= 4) return user;
  if (stage <= 0) return 1;
  return gen < targetGen(x, G) ? 16 : 1;
}

export const readoutFor = (s) => (s ? `gen ${s.generation}, ${s.population} alive, ${s.species.length} species` : '');

export async function create(stageEl, ctx) {
  const tier = ctx.tier === 'low' ? 'low' : 'high';
  const poster = ctx.data && ctx.data.posterState && typeof ctx.data.posterState === 'object' ? ctx.data.posterState : null;
  const posterStage = poster ? clamp(poster.stage | 0, 0, 4) : 0;
  const fig = stageEl.closest('figure') || stageEl;
  const debug = new URLSearchParams(location.search).get('debug') === '1';

  const history = await fetch(HISTORY_URL).then((r) => {
    if (!r.ok) throw new Error('history.json: HTTP ' + r.status);
    return r.json();
  });
  const G = history.maxGen;

  /* The worker first: if it cannot start there is no context to give back. */
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  let destroyed = false;
  let failed = false;
  let stepErrors = 0;
  let inFlight = false;
  let prev = null;
  let next = null;
  let nextAt = 0;
  let interval = 1000 / 60;
  let sentSteps = 0;
  let stats = null;
  let inspectId = null;
  let inspectFor = null; // 'featured' (stage 3) or 'user' (a click or F at stage 4)
  let stage3 = null;
  const waiters = [];
  // the render loop's state (start/stop below)
  let raf = 0;
  let running = false;
  let last = 0;
  let readyFired = false;
  let frames = 0;

  const first = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no frame from the sim worker within ${FIRST_FRAME_MS / 1000} s`)), poster ? 120000 : FIRST_FRAME_MS);
    worker.onerror = (e) => {
      clearTimeout(timer);
      reject(new Error('the sim worker failed to start: ' + (e.message || 'error')));
    };
    worker.onmessage = ({ data: m }) => {
      clearTimeout(timer);
      if (m.type === 'frame') resolve(m);
      else reject(new Error('the sim worker could not start: ' + m.message));
    };
  });
  worker.postMessage({ type: 'init', seed: SEED, count: COUNT[tier], params: PARAMS });
  worker.postMessage({ type: 'step', n: poster ? POSTER_TICKS[posterStage] : 0 });
  let m0;
  try {
    m0 = await first;
  } catch (err) {
    worker.terminate();
    throw err;
  }

  /* The jar. */
  try {
    stage3 = createStage(stageEl, { bodyFromGenes: (b) => b, reducedMotion: !!ctx.reduced, tier });
  } catch (err) {
    worker.terminate();
    throw err;
  }
  const { canvas, rig, camera, creatures } = stage3;
  const alive = new Set();
  const take = (m) => {
    for (const b of m.births) {
      creatures.add(b);
      alive.add(b.id);
    }
    for (const id of m.deaths) {
      creatures.remove(id);
      alive.delete(id);
    }
  };
  take(m0);
  prev = next = m0;
  stats = m0.stats;
  stage3.setFrames(m0, m0);

  /* Overlays over the stage: the river and the brain view (two brains, then and now). */
  const layer = document.createElement('div');
  layer.className = 'tr-layer';
  layer.innerHTML =
    `<div class="tr-river" aria-hidden="true"><p class="tr-label">Species, ${history.steps.toLocaleString('en')} steps from the seed</p>` +
    `<div class="tr-box"><canvas></canvas></div></div>` +
    `<div class="tr-brain" role="group" aria-label="Brain view">` +
    `<div class="tr-col tr-col--then"><p class="tr-label" data-k="then"></p><div class="tr-box"><canvas role="img"></canvas></div></div>` +
    `<div class="tr-col tr-col--now"><p class="tr-label" data-k="now"></p><div class="tr-box"><canvas role="img"></canvas></div></div>` +
    `<button type="button" class="tr-brain-close" aria-label="Close the brain view" title="Close (Esc)">` +
    `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg></button></div>`;
  fig.append(layer);
  const riverEl = layer.querySelector('.tr-river');
  const brainEl = layer.querySelector('.tr-brain');
  const [riverCanvas, thenCanvas, nowCanvas] = layer.querySelectorAll('canvas');
  const thenLabel = layer.querySelector('[data-k=then]');
  const nowLabel = layer.querySelector('[data-k=now]');
  const closeBtn = layer.querySelector('.tr-brain-close');

  const syncLayer = () => {
    const fr = fig.getBoundingClientRect();
    const sr = stageEl.getBoundingClientRect();
    const w = Math.round(sr.width);
    const h = Math.round(sr.height);
    layer.style.left = Math.round(sr.left - fr.left - fig.clientLeft) + 'px';
    layer.style.top = Math.round(sr.top - fr.top - fig.clientTop) + 'px';
    layer.style.width = w + 'px';
    layer.style.height = h + 'px';
    brainEl.classList.toggle('is-stacked', w < h * 1.15);
  };
  syncLayer();

  const river = createRiver(riverCanvas, { reducedMotion: !!ctx.reduced });
  river.setHistory(history.samples);
  river.setPlayhead(0);
  const thenViz = createBrainViz(thenCanvas, { reducedMotion: !!ctx.reduced });
  const nowViz = createBrainViz(nowCanvas, { reducedMotion: !!ctx.reduced });
  thenViz.setGenome(history.featured.gen0Genome, true);
  const g0 = history.featured.gen0Genome;
  thenLabel.textContent = `Gen 0, the founder: ${g0.nodes.length} neurons`;
  thenCanvas.setAttribute('aria-label', `The founder's network: ${g0.nodes.length} neurons and ${g0.conns.filter((c) => c.on).length} connections.`);

  // Overlay input is the overlay's own: never a pick, a drag of the jar or a click through.
  const swallow = (e) => e.stopPropagation();
  for (const el of [riverEl, brainEl]) for (const t of ['pointerdown', 'pointerup', 'click']) el.addEventListener(t, swallow);

  let riverOpen = false;
  let brainOpen = false;
  let brainMode = 'two';
  let nowShownId = null;
  let nowSig = '';
  const setRiver = (v) => {
    if (v === riverOpen) return;
    riverOpen = v;
    riverEl.classList.toggle('is-open', v);
    riverEl.setAttribute('aria-hidden', String(!v));
  };
  function openBrain(mode) {
    brainMode = mode;
    brainEl.dataset.mode = mode;
    if (!brainOpen) {
      brainOpen = true;
      brainEl.classList.add('is-open');
      if (running) {
        nowViz.start();
        if (mode === 'two') thenViz.start();
      }
    } else if (mode === 'two' && running) thenViz.start();
  }
  function closeBrain() {
    if (!brainOpen) return;
    brainOpen = false;
    brainEl.classList.remove('is-open');
    nowViz.stopSoon();
    thenViz.stopSoon();
  }
  function inspect(id, why) {
    inspectId = id;
    inspectFor = id == null ? null : why;
    worker.postMessage({ type: 'inspect', id });
    creatures.setSelected(why === 'user' ? id : null);
  }
  function letGo() {
    if (inspectId != null) inspect(null, null);
    rig.release();
    closeBrain();
  }
  closeBtn.addEventListener('click', () => {
    letGo();
    fig.focus({ preventScroll: true });
  });

  function showInspect(ins) {
    const g = ins.genome;
    const sig = `${g.nodes.length}:${g.conns.length}:${g.conns.filter((c) => c.on).length}`;
    if (ins.id !== nowShownId) {
      nowShownId = ins.id;
      nowSig = sig;
      nowViz.setGenome(g, true);
      nowViz.revive();
    } else if (sig !== nowSig) {
      nowSig = sig;
      nowViz.setGenome(g, false);
    }
    nowViz.setValues(ins.values);
    const text = `${inspectFor === 'featured' ? 'Now' : 'No. ' + ins.id}, gen ${ins.generation}, species ${ins.species}: ${g.nodes.length} neurons`;
    if (nowLabel.textContent !== text) nowLabel.textContent = text;
  }

  // The featured lineage's member furthest down its line (highest generation, then oldest), as history.json
  // picked it; from any species if that one is gone (the low tier's smaller world need not have it).
  function pickFeatured() {
    if (!next) return null;
    const c = next.creatures;
    const rank = (i) => c[i + 9] * 1000 + c[i + 7]; // generation first, age (< 1000 s) breaks ties
    let best = null;
    let bestR = -1;
    let any = null;
    let anyR = -1;
    for (let i = 0; i < c.length; i += STRIDE) {
      const r = rank(i);
      if (c[i + 6] === history.featured.speciesId && r > bestR) {
        bestR = r;
        best = c[i];
      }
      if (r > anyR) {
        anyR = r;
        any = c[i];
      }
    }
    return best ?? any;
  }
  // F: a well-fed adult near the middle, as in the source (skips the one already followed).
  function pickWellFed() {
    if (!next) return null;
    const c = next.creatures;
    let best = null;
    let bs = -Infinity;
    for (let i = 0; i < c.length; i += STRIDE) {
      if (c[i] === inspectId) continue;
      const s = c[i + 5] - Math.hypot(c[i + 1], c[i + 2]) - (c[i + 7] > 60 ? 1 : 0);
      if (s > bs) {
        bs = s;
        best = c[i];
      }
    }
    return best;
  }

  /* Worker messages once running. */
  function onMessage({ data: m }) {
    if (destroyed) return;
    if (m.type === 'error') {
      if (m.request === 'step') {
        inFlight = false;
        if (++stepErrors >= STEP_ERRORS && !failed) {
          failed = true;
          ctx.log('the sim stopped: ' + m.message);
        }
      }
      return;
    }
    if (m.type !== 'frame' || failed) return;
    inFlight = false;
    stepErrors = 0;
    const now = performance.now();
    if (next && sentSteps > 0) interval = Math.min(100, Math.max(8, now - nextAt)) * 0.3 + interval * 0.7;
    take(m);
    prev = next || m;
    next = m;
    nextAt = now;
    stage3.setFrames(prev, next);
    stats = m.stats;
    if (m.dead != null && m.dead === inspectId) {
      inspectId = null;
      if (inspectFor === 'user') {
        nowViz.die();
        nowLabel.textContent = `Specimen no. ${m.dead} died`;
        rig.release();
        creatures.setSelected(null);
      }
      // a featured creature that died is replaced on the next frame (stage 3)
    } else if (m.inspect && m.inspect.id === inspectId) {
      showInspect(m.inspect);
    }
    for (const w of waiters.splice(0)) w(m);
  }
  worker.onmessage = onMessage;
  worker.onerror = (e) => {
    if (destroyed || failed) return;
    failed = true;
    ctx.log('the sim worker stopped: ' + (e.message || 'error'));
  };
  const nextFrame = () => new Promise((r) => waiters.push(r));

  /* Pointer and keys. */
  const onPointerUp = (e) => {
    if (curStage < 4 || rig.dragDistance > CLICK_PX) return;
    const id = stage3.pick(e.clientX, e.clientY);
    if (id == null || !alive.has(id)) return;
    inspect(id, 'user');
    nowShownId = null;
    openBrain('one');
  };
  canvas.addEventListener('pointerup', onPointerUp);
  const isTyping = (t) => t instanceof Element && !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  const onKey = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
    if (e.key === 'Escape') {
      letGo();
      if (fig.contains(document.activeElement)) document.activeElement.blur();
      return;
    }
    if (curStage < 4 || e.repeat) return;
    if (KEY_SPEED[e.key]) {
      userSpeed = KEY_SPEED[e.key];
    } else if (e.key === 'f' || e.key === 'F') {
      const id = pickWellFed();
      if (id == null || !alive.has(id)) return;
      e.preventDefault();
      inspect(id, 'user');
      nowShownId = null;
      openBrain('one');
      rig.follow(() => creatures.positionOf(id));
    }
  };
  fig.addEventListener('keydown', onKey);
  const addedTab = !fig.hasAttribute('tabindex');
  if (addedTab && !poster) fig.setAttribute('tabindex', '0');

  /* Stages. */
  let curStage = poster ? posterStage : ctx.stage();
  let userSpeed = 1;
  let orbitDriven = false;
  function enterStage(from, to) {
    if (to === 0 && from >= 1) {
      // The live jar only runs forward; going back to the start starts it again.
      worker.postMessage({ type: 'reset' });
      letGo();
      userSpeed = 1;
    }
    if (from === 3 && to !== 3 && inspectFor === 'featured') {
      inspect(null, null);
      closeBrain();
    }
    if (from === 4 && to !== 4 && inspectFor === 'user') letGo();
    if (to === 3) {
      if (inspectFor === 'user') letGo();
      nowShownId = null;
      openBrain('two');
    }
  }
  if (curStage === 3) openBrain('two');

  const orbit = (x, snap) => {
    if (rig.following) return;
    if (x < 1 || poster) {
      const u = p2inOut(clamp(x, 0, 1));
      rig.setOrbit(lerp(ORBIT_FROM.phi, ORBIT_TO.phi, u), lerp(ORBIT_FROM.theta, ORBIT_TO.theta, u), lerp(ORBIT_FROM.zoom, ORBIT_TO.zoom, u), snap);
      orbitDriven = true;
    } else if (orbitDriven) {
      rig.setOrbit(ORBIT_TO.phi, ORBIT_TO.theta, ORBIT_TO.zoom);
      orbitDriven = false;
    }
  };

  // While the river covers the lower third, the jar is framed into the two thirds above it: a smaller
  // view (camera zoom) shifted up (view offset), eased in and out with the river. Picking goes through the
  // same projection, so a click still lands on what is drawn.
  let lift = 0;
  let liftShown = 0;
  const liftFor = (goal, dt) => {
    lift = dt >= 1 ? goal : damp(lift, goal, 5, dt);
    if (Math.abs(lift - goal) < 1e-3) lift = goal;
    if (lift === liftShown) return;
    liftShown = lift;
    camera.zoom = 1 - LIFT.zoom * lift;
    // setViewOffset sets the aspect from its full size, so the full size carries the current aspect
    const a = camera.aspect;
    if (lift > 0) camera.setViewOffset(a, 1, 0, LIFT.y * lift, a, 1);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };

  /* Poster: the world is already at its tick; the featured brain needs one inspect round trip. */
  if (poster && posterStage === 3) {
    inspect(pickFeatured(), 'featured');
    const got = nextFrame();
    worker.postMessage({ type: 'step', n: 0 });
    await got;
  }

  try {
    await stage3.ready;
  } catch {}

  /* The loop. */
  const frame = (t) => {
    if (!running || destroyed) return;
    raf = requestAnimationFrame(frame);
    const rawMs = last ? t - last : 16.7;
    last = t;
    const x = poster ? posterStage : clamp(ctx.progress() * 4, 0, 4);
    const st = poster ? posterStage : ctx.stage();
    if (st !== curStage) {
      const from = curStage;
      curStage = st;
      enterStage(from, st);
    }
    if (!poster && !inFlight && !failed && document.visibilityState !== 'hidden') {
      const n = speedFor(st, x, stats ? stats.generation : 0, G, userSpeed);
      worker.postMessage({ type: 'step', n });
      inFlight = true;
      sentSteps = n;
    }
    if (st === 3 && inspectFor !== 'featured' && !poster) {
      const id = pickFeatured();
      if (id != null) inspect(id, 'featured');
    }
    if ((frames & 15) === 0) syncLayer();
    orbit(x, poster && frames === 0);
    setRiver(st >= 2 && !brainOpen);
    liftFor(riverOpen ? 1 : 0, poster ? 1 : Math.min(0.1, rawMs / 1000));
    const alpha = poster ? 1 : Math.min(1, (performance.now() - nextAt) / interval);
    stage3.render(poster ? 1 / 60 : rawMs / 1000, alpha);
    river.setPlayhead(clamp(x - 1.5, 0, 1));
    if (riverOpen) river.draw();
    frames++;
    ctx.frame?.(rawMs);
    if (!readyFired && (!poster || frames >= POSTER_SETTLE_FRAMES)) {
      readyFired = true;
      stageEl.dispatchEvent(new Event('fig:ready'));
    }
  };

  if (debug) {
    const v = new THREE.Vector3();
    window.__terra = {
      gen: () => (stats ? stats.generation : -1),
      pop: () => (stats ? stats.population : 0),
      species: () => (stats ? stats.species.length : 0),
      azimuth: () => rig.azimuth,
      camera: () => ({ aspect: camera.aspect, fov: camera.fov, zoom: camera.zoom, position: camera.position.toArray(), canvas: [canvas.width, canvas.height, canvas.clientWidth, canvas.clientHeight] }),
      // A creature on screen, clear of the overlays, that a click at its projected centre picks.
      pickFirst() {
        if (!next) return null;
        const r = canvas.getBoundingClientRect();
        const bottom = riverOpen ? Math.min(r.bottom, riverEl.getBoundingClientRect().top) : r.bottom;
        const c = next.creatures;
        for (let i = 0; i < c.length; i += STRIDE) {
          const p = creatures.positionOf(c[i]);
          if (!p) continue;
          v.copy(p).project(camera);
          if (v.z > 1) continue;
          const px = r.left + ((v.x + 1) / 2) * r.width;
          const py = r.top + ((1 - v.y) / 2) * r.height;
          if (px < r.left + 24 || px > r.right - 24 || py < r.top + 24 || py > bottom - 24) continue;
          if (stage3.pick(px, py) === c[i]) return { id: c[i], x: px, y: py };
        }
        return null;
      },
    };
  }

  return {
    start() {
      if (running || destroyed) return;
      running = true;
      last = 0;
      if (brainOpen) {
        nowViz.start();
        if (brainMode === 'two') thenViz.start();
      }
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
      nowViz.stopSoon();
      thenViz.stopSoon();
    },
    resize(w, h) {
      if (destroyed || !w || !h) return;
      stage3.resize(w, h);
      syncLayer();
    },
    readout: () => readoutFor(stats),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      running = false;
      cancelAnimationFrame(raf);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      canvas.removeEventListener('pointerup', onPointerUp);
      fig.removeEventListener('keydown', onKey);
      if (addedTab && !poster) fig.removeAttribute('tabindex');
      river.destroy();
      thenViz.destroy();
      nowViz.destroy();
      layer.remove();
      stage3.dispose(); // forceContextLoss, and removes the canvas
      if (debug) delete window.__terra;
    },
  };
}
