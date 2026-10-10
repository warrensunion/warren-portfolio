// The Archer Hero track figure: a short stage of the game rebuilt in three.js with original models. The
// track's scroll progress picks what it shows (x = progress * 3):
//   stage 0, Valley:   the camera flies in over the valley to the archer (x 0..1) as the HUD fades in;
//   stage 1, Auto-aim: the attract mode plays the stage in real time from a fresh seed-7 game;
//   stage 2, Boss:     the attract mode from the boss (the waves cleared), arrow rain and all;
//   stage 3, Your turn: "Click to play", then the visitor plays a fresh stage, ending on a panel with
//                      "Play again" and the link to the full game on Roblox.
// One WebGL context; the simulation (sim.js) is pure and shared with the Node tests and the attract
// player (attract.js). Keys are read only from the focused figure (input.js); the page always scrolls.
//
// Poster hook: ctx.data.posterState = { stage } renders that stage's still with no motion: 0 the fly-in's
// end pose, 1 the attract mode at 6 s, 2 the boss fight at 4 s, 3 the prompt. ?debug=1 exposes
// window.__archer = { state, kill() } for scripts/check-figures.mjs.
import * as THREE from 'three';
import './figure.css';
import { buildWorld } from './world.js';
import { createActors } from './actors.js';
import { createHud } from './hud.js';
import { createGame, step, spawnBoss } from './sim.js';
import { attractInput } from './attract.js';
import { createInput } from './input.js';
import { nextTask, warmDraws } from '../warm.js';

const SEED = 7;
const STEP = 1 / 60; // s per simulation step
const FOV = 62;
// Third person: 7 u behind and 4.5 u above the archer, looking 6 u ahead along the camera's yaw.
const CAM = { back: 7, up: 4.5, ahead: 6, lookY: 0.6 };
// The fly-in starts high behind the start, looking down the valley.
const FLY = { pos: new THREE.Vector3(0, 30, -30), look: new THREE.Vector3(0, 0, 40) };
const RESTART_AFTER = 1.6; // s an attract run rests on its end before starting over
const POSTER_T = { 1: 6, 2: 4 }; // s of attract play before a stage's still
const HINT = 'Click to play. WASD or arrows move, mouse turns, Q dodges, E rains arrows. Esc lets go.';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export async function create(el, ctx) {
  const fig = el.closest('figure') || el;
  const data = ctx.data || {};
  const posterRaw = data.posterState;
  const poster = posterRaw ? (typeof posterRaw === 'object' ? posterRaw : {}) : null;
  const tier = ctx.tier === 'low' ? 'low' : 'high';
  const dpr = poster ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, tier === 'high' ? 1.5 : 1);
  const roblox = typeof data.roblox === 'string' ? data.roblox : null;
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const stageOf = () => (poster ? Math.max(0, Math.min(3, poster.stage | 0)) : ctx.stage());
  const progressOf = () => (poster ? stageOf() / 3 : ctx.progress());

  const canvas = document.createElement('canvas');
  el.append(canvas);
  let renderer = null;
  let world = null;
  let actors = null;
  let destroyed = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 10, 0.1, 900);
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'high' || !!poster, powerPreference: 'high-performance' });
    renderer.setPixelRatio(dpr);
    scene.add(new THREE.HemisphereLight('#e8f6ff', '#86a860', 2.2));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.0);
    sun.position.set(-30, 50, -10);
    scene.add(sun);
    world = buildWorld(scene, { tier, seed: SEED });
    await nextTask();
    actors = createActors(scene);
  } catch (err) {
    try {
      actors?.destroy();
      world?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
    } catch {}
    canvas.remove();
    throw err;
  }

  // ── Game state and modes ──
  // mode: 'fly' | 'attract' | 'prompt' | 'play' | 'end'
  let mode = 'fly';
  let game = createGame({ seed: SEED });
  let stage = -1;
  let paused = false; // playing, but the figure lost focus: the game waits
  let restLeft = 0;
  let acc = 0;
  let clock = 0;
  let plays = 0;

  const hud = createHud(el, { onPlay: () => play(), onSkill: (a) => input.press(a) });
  const input = createInput(fig, { onEsc: () => fig.blur(), surface: el, stick: hud.stick });

  // The caption's hint: the host makes the figure a tab stop once live because of it, and hides it again
  // under any lasting fallback.
  const caption = fig.querySelector('figcaption');
  if (caption && !poster && !caption.querySelector('.fig-hint')) {
    const hint = document.createElement('span');
    hint.className = 'fig-hint';
    hint.textContent = HINT;
    caption.append(hint);
  }

  const attractStart = (i) => (i === 2 ? spawnBoss(createGame({ seed: SEED })) : createGame({ seed: SEED }));

  function releasePointer() {
    try {
      if (document.pointerLockElement === fig) document.exitPointerLock();
    } catch {}
  }

  function enterStage(i) {
    if (i === stage) return;
    const wasPlaying = mode === 'play' || mode === 'end';
    stage = i;
    if (wasPlaying && i !== 3) {
      input.playing(false);
      releasePointer();
      hud.setPlaying(false);
    }
    paused = false;
    acc = 0;
    restLeft = 0;
    if (i === 0) {
      mode = 'fly';
      game = createGame({ seed: SEED });
      hud.hidePrompt();
    } else if (i === 1 || i === 2) {
      mode = 'attract';
      game = attractStart(i);
      hud.hidePrompt();
    } else if (!wasPlaying) {
      mode = 'prompt';
      game = createGame({ seed: SEED });
      hud.showPrompt('Click to play');
    }
  }

  // "Click to play" and "Play again": a fresh stage, focus on the figure, and the pointer locked if the
  // browser allows it (if not, a drag turns the camera instead). A click on "Click to resume" only resumes.
  function play() {
    if (destroyed) return;
    if (mode === 'play' && paused) {
      paused = false;
    } else {
      plays += 1;
      game = createGame({ seed: SEED + plays });
      mode = 'play';
      paused = false;
      acc = 0;
      input.setYaw(0);
    }
    input.playing(true);
    hud.hidePrompt();
    hud.setPlaying(true);
    fig.focus({ preventScroll: true });
    try {
      const p = fig.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {}
  }

  function finish() {
    mode = 'end';
    paused = false;
    input.playing(false);
    releasePointer();
    hud.setPlaying(false);
    hud.showEnd(game.status, roblox, () => play());
  }

  const listeners = [];
  const on = (target, type, fn) => {
    target.addEventListener(type, fn);
    listeners.push([target, type, fn]);
  };
  // Focus leaving mid-game (Esc, a click elsewhere, Tab) pauses it; coming back resumes.
  on(fig, 'blur', () => {
    if (mode !== 'play' || paused) return;
    paused = true;
    hud.showPrompt('Click to resume');
  });
  on(fig, 'focus', () => {
    if (mode !== 'play' || !paused) return;
    paused = false;
    hud.hidePrompt();
  });

  // ── Size and camera ──
  let size = { w: 1, h: 1 };
  const sizeTo = (w, h) => {
    size = { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  };
  sizeTo(el.clientWidth || 1280, el.clientHeight || 800);

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const followPose = (a, outPos, outLook) => {
    const sy = Math.sin(a.yaw);
    const cy = Math.cos(a.yaw);
    outPos.set(a.x - sy * CAM.back, CAM.up, a.z - cy * CAM.back);
    outLook.set(a.x + sy * CAM.ahead, CAM.lookY, a.z + cy * CAM.ahead);
  };
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  let camReady = false;
  function placeCamera(dt, x) {
    followPose(game.archer, wantPos, wantLook);
    if (mode === 'fly') {
      const k = smooth(0, 1, x);
      camPos.lerpVectors(FLY.pos, wantPos, k);
      camLook.lerpVectors(FLY.look, wantLook, k);
    } else if (!camReady || dt === 0) {
      camPos.copy(wantPos);
      camLook.copy(wantLook);
    } else {
      // A light follow, so a dodge's dash reads as a dash and not as a cut.
      const k = 1 - Math.exp(-dt * 14);
      camPos.lerp(wantPos, k);
      camLook.lerp(wantLook, k);
    }
    camReady = true;
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.updateMatrixWorld();
  }

  // A still: the stage's state played forward, the camera on it, nothing moving after.
  if (poster) {
    enterStage(stageOf());
    const t = POSTER_T[stage] || 0;
    for (let i = 0; i < Math.round(t / STEP); i++) step(game, attractInput(game), STEP);
    clock = t;
  } else {
    enterStage(stageOf());
  }

  // Link the programs before the first frame (the beasts' materials exist once synced).
  try {
    placeCamera(0, Math.min(1, progressOf() * 3));
    actors.sync(game, 1, camera, clock);
    await renderer.compileAsync(scene, camera);
    await warmDraws(scene, () => renderer.render(scene, camera), () => !destroyed);
  } catch {}

  if (debug && !poster) {
    window.__archer = {
      get state() {
        return game;
      },
      kill() {
        game.archer.hp = 0;
        game.status = 'lost';
        if (stage === 3 && mode !== 'end') finish();
      },
    };
  }

  // ── Frame ──
  let raf = 0;
  let running = false;
  let last = 0;
  let readyFired = false;

  function simulate(dt) {
    if (mode === 'attract') {
      if (game.status !== 'playing') {
        restLeft -= dt;
        if (restLeft <= 0) game = attractStart(stage);
        return;
      }
      acc += dt;
      while (acc >= STEP) {
        acc -= STEP;
        step(game, attractInput(game), STEP);
        if (game.status !== 'playing') {
          restLeft = RESTART_AFTER;
          break;
        }
      }
    } else if (mode === 'play') {
      if (game.status !== 'playing') return finish();
      if (paused) return;
      // One read per frame (a Q or E press counts once), spread over equal substeps of at most STEP.
      const inp = input.read();
      const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
      for (let i = 0; i < n && game.status === 'playing'; i++) {
        step(game, i === 0 ? inp : { ...inp, dodge: false, rain: false }, dt / n);
      }
      if (game.status !== 'playing') finish();
    }
  }

  const frame = (now) => {
    if (!running || destroyed) return;
    raf = requestAnimationFrame(frame);
    const rawMs = last ? now - last : 16.7;
    const dt = Math.min(rawMs, 100) / 1000;
    last = now;

    if (!poster) {
      enterStage(stageOf());
      clock += dt;
      simulate(dt);
    }
    const x = Math.min(1, Math.max(0, progressOf() * 3));
    placeCamera(poster ? 0 : dt, mode === 'fly' ? (poster ? 1 : x) : 1);
    actors.sync(game, 1, camera, clock);
    world.update(clock);
    renderer.render(scene, camera);
    hud.setFade(mode === 'fly' && !poster ? smooth(0.45, 0.95, x) : 1);
    hud.sync(game, camera, size);
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
    // Scrolled away: the sim waits (no frames, no steps) and nothing stays held.
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
      input.clear();
    },
    resize(w, h) {
      if (destroyed || !w || !h) return;
      sizeTo(w, h);
    },
    readout() {
      return readyFired ? `Stage 1, ${game.left} left, Lv ${game.level}` : '';
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      running = false;
      cancelAnimationFrame(raf);
      releasePointer();
      for (const [t, type, fn] of listeners) t.removeEventListener(type, fn);
      input.destroy();
      hud.destroy();
      if (debug && window.__archer) delete window.__archer;
      try {
        actors.destroy();
        world.dispose();
        renderer.dispose();
      } catch {}
      try {
        renderer.forceContextLoss();
      } catch {}
      canvas.remove();
    },
  };
}
