// The world's DOM half, and the page's one animation loop. It never imports three.js: it decides whether
// the world may run (same rules as the figures: ?static=1, no WebGL2, save-data, reduced motion), loads it
// after the page has painted and gone idle, and every frame turns the scroll into one shared state
// (altitude, log, build, the field's passage, the dissolve) that the world, the HUD, the altimeter and
// the chrome effects all read. Subscribers get tick(state, dt) from this loop; nothing else polls scroll.
import { altitudeAt, logAt, climbOf, tempAt, windAt, snowAt, visibilityAt, hudText, ease, SUMMIT } from './climb.js';

export const state = {
  y: 0,
  vh: 1,
  alt: 0,
  shownAlt: 0,
  climb: 0,
  build: 0,
  prints: 0,
  log: 0,
  logT: 0,
  act: 'mountain',
  dissolve: 0,
  fieldP: 0,
  speed: 0, // px/s, smoothed
  aval: 0,
  pointer: null, // NDC [x, y] or null
  drag: null, // [dx, dy] this frame
  dragging: false,
  motion: 1,
  placed: 0,
  total: 0,
  live: false, // the world is drawing
  theme: 'dusk',
  time: 0,
  onLand: null,
  onHover: null,
};

const subs = new Set();
export const subscribe = (fn) => (subs.add(fn), () => subs.delete(fn));

let world = null;
let worldPromise = null;
const SEED = 'ascent → 0x5e7c1a';

// The world's anchors: each [data-alt] log, reached when its top crosses 40 % of the viewport.
let anchors = [];
let field = null; // { top, bottom } in document px
let frozen = false; // poster mode holds one altitude
function measure() {
  if (frozen) return;
  state.vh = innerHeight;
  const logs = [...document.querySelectorAll('[data-alt]')];
  anchors = logs
    .map((el) => ({ y: el.getBoundingClientRect().top + scrollY - innerHeight * 0.4, alt: Number(el.dataset.alt) }))
    .sort((a, b) => a.y - b.y);
  if (anchors.length) anchors[0].y = 0; // the page top is base camp
  const f = document.getElementById('index');
  if (f) {
    const r = f.getBoundingClientRect();
    field = { top: r.top + scrollY, bottom: r.bottom + scrollY };
  }
}

const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function update(dt) {
  const y = scrollY;
  const dy = y - state.y;
  state.y = y;
  const inst = dt > 0 ? Math.abs(dy) / dt : 0;
  state.speed += (inst - state.speed) * (1 - Math.exp(-dt * 8));
  state.alt = altitudeAt(y, anchors);
  const l = logAt(y, anchors);
  state.log = l.index;
  state.logT = l.t;
  state.climb = climbOf(state.alt);
  // the build runs from the first scroll to the summit; the last block lands at the summit
  // a foundation ring is down at base camp; the last block lands at the summit
  state.build = clamp01(0.035 + 0.965 * (state.alt / SUMMIT));
  state.prints = clamp01(state.alt / 900);
  // the ice field: the act and the dissolve at its two edges (full fog on the line, clear 0.45 vh away)
  if (field) {
    const mid = y + state.vh * 0.5;
    const dIn = (mid - field.top) / state.vh;
    const dOut = (mid - field.bottom) / state.vh;
    state.act = dIn > 0 && dOut < 0 ? 'field' : 'mountain';
    const near = Math.min(Math.abs(dIn), Math.abs(dOut));
    state.dissolve = state.motion ? 1 - smooth(clamp01(near / 0.45)) : 0;
    state.fieldP = clamp01((mid - field.top) / Math.max(1, field.bottom - field.top));
  }
  // the avalanche: a fling well past reading speed kicks up powder (capped, and never under reduced motion)
  const fling = state.motion ? clamp01((state.speed - 6000) / 7000) : 0;
  state.aval = Math.max(fling, state.aval * Math.exp(-dt * 2.2));
}

/* ---- the HUD (Fig. 1 in the hero, and the bar's short readout) ---- */

function hud() {
  const els = {};
  for (const el of document.querySelectorAll('[data-hud]')) (els[el.dataset.hud] ||= []).push(el);
  const shown = { alt: 0, temp: tempAt(0), wind: windAt(0, 0), snow: snowAt(0), vis: visibilityAt(0), placed: 0 };
  let acc = 0;
  let lastText = {};
  return (dt) => {
    const k = state.motion ? dt : 99;
    shown.alt = ease(shown.alt, state.alt, k, 5);
    shown.temp = ease(shown.temp, tempAt(state.alt), k, 3);
    shown.wind = ease(shown.wind, state.motion ? windAt(state.alt, state.time) : windAt(state.alt, 0), k, 2.5);
    shown.snow = ease(shown.snow, snowAt(state.alt), k, 2);
    shown.vis = ease(shown.vis, visibilityAt(state.alt), k, 2);
    const total = state.total || 0;
    const placed = state.live ? state.placed : Math.round(state.build * total);
    shown.placed = ease(shown.placed, placed, k, 8);
    state.shownAlt = shown.alt;
    acc += dt;
    if (acc < 0.08) return;
    acc = 0;
    const t = hudText({ alt: shown.alt, temp: shown.temp, wind: shown.wind, snow: shown.snow, vis: shown.vis, placed: shown.placed, total: total || 0, seed: SEED });
    if (!total) t.blocks = '0 / 0';
    const log = String(state.log + 1).padStart(2, '0');
    t.bar = `LOG ${log} · ${t.alt} · ${t.temp}`;
    for (const key in els) {
      const v = t[key];
      if (v == null || lastText[key] === v) continue;
      lastText[key] = v;
      for (const el of els[key]) el.textContent = v;
    }
  };
}

/* ---- pointer: the cursor's wind, the igloo's hover, drag to look ---- */

const NOT_DRAG = 'a, button, input, textarea, select, label, summary, [tabindex], figure, p, h1, h2, h3, h4, li, dd, dt, pre, code, nav, header, footer, .hud, .palette, .alti';
function pointer() {
  let down = null;
  let acc = [0, 0];
  addEventListener(
    'pointermove',
    (e) => {
      state.pointer = [(e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1];
      if (down && e.pointerId === down.id) {
        acc[0] += e.clientX - down.x;
        acc[1] += e.clientY - down.y;
        down.x = e.clientX;
        down.y = e.clientY;
      }
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => (state.pointer = null));
  addEventListener('blur', () => (state.pointer = null));
  addEventListener('pointerdown', (e) => {
    if (!state.live || e.button !== 0 || e.pointerType === 'touch') return;
    if (e.target.closest && e.target.closest(NOT_DRAG)) return;
    down = { id: e.pointerId, x: e.clientX, y: e.clientY };
    state.dragging = true;
    document.documentElement.classList.add('is-dragging');
  });
  const up = (e) => {
    if (!down || (e && e.pointerId !== down.id)) return;
    down = null;
    state.dragging = false;
    document.documentElement.classList.remove('is-dragging');
  };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  return () => {
    state.drag = acc[0] || acc[1] ? acc : null;
    acc = [0, 0];
  };
}

/* ---- fallback stills: one per log, cross-faded as the page moves between logs ---- */

function stills(root) {
  const imgs = [...root.querySelectorAll('.world-still')];
  let on = -1;
  return () => {
    const i = Math.min(imgs.length - 1, state.log);
    if (i === on) return;
    on = i;
    imgs.forEach((im, k) => {
      if (k === i) {
        im.loading = 'eager';
        im.classList.add('is-on');
      } else im.classList.remove('is-on');
    });
  };
}

/** Starts the loop; returns { reserve } so the figure host leaves room for the world's context. */
export function initWorld({ env, onReady } = {}) {
  const root = document.querySelector('.world');
  state.motion = env.reduced || env.forced ? 0 : 1;
  const theme = (() => {
    try {
      return localStorage.getItem('ws.theme') || 'dusk';
    } catch {
      return 'dusk';
    }
  })();
  state.theme = theme === 'night' ? 'night' : 'dusk';
  document.documentElement.dataset.theme = state.theme;

  const posterQ = new URLSearchParams(location.search);
  const posterMode = posterQ.get('poster') === 'world';
  let reason = null;
  if (!root) reason = 'no-root';
  else if (posterMode) reason = null;
  else if (env.forced) reason = 'forced';
  else if (posterQ.get('world') === '0') reason = 'off'; // ?world=0: the page without its world, for comparisons
  else if (!env.webgl2) reason = 'no-webgl2';
  else if (env.saveData) reason = 'save-data';
  else if (env.reduced) reason = 'reduced-motion';
  if (reason && root) {
    root.dataset.fallback = reason;
    console.info('[world] fallback: ' + reason);
  }

  measure();
  addEventListener('resize', measure, { passive: true });
  document.fonts?.ready.then(measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);

  const drawHud = hud();
  const readPointer = pointer();
  const drawStills = root ? stills(root) : () => {};
  let last = 0;
  let raf = 0;
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    state.time += dt * state.motion;
    update(dt);
    readPointer();
    drawHud(dt);
    drawStills();
    for (const fn of subs) {
      try {
        fn(state, dt);
      } catch (err) {
        console.warn('[world] subscriber', err);
      }
    }
    if (world && state.aval > 0.02 && state.motion) {
      const a = state.aval * 3.5;
      canvas.style.transform = `translate3d(${((Math.random() - 0.5) * a).toFixed(2)}px, ${((Math.random() - 0.5) * a).toFixed(2)}px, 0)`;
    } else if (canvas && canvas.style.transform) canvas.style.transform = '';
  };
  raf = requestAnimationFrame(loop);

  let canvas = null;
  const start = async () => {
    if (reason || worldPromise) return;
    canvas = document.createElement('canvas');
    canvas.className = 'world-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    root.append(canvas);
    worldPromise = (async () => {
      try {
        const [{ createWorld }, { createField }] = await Promise.all([import('./world.js'), import('./field/field.js')]);
        const tier = env.tier;
        const w = await createWorld(canvas, {
          tier,
          theme: state.theme,
          reduced: !state.motion,
          read: () => state,
          field: (ctx) => createField(ctx),
          onFrame: (f) => {
            state.placed = f.placed;
            state.total = f.total;
            if (f.first) {
              state.live = true;
              root.classList.add('is-live');
              document.documentElement.classList.add('world-live');
              onReady?.(w);
              if (posterMode) requestAnimationFrame(() => requestAnimationFrame(() => (window.__posterReady = true)));
            }
          },
        });
        world = w;
        state.total = w.total;
        const size = () => w.resize(innerWidth, innerHeight);
        size();
        addEventListener('resize', size, { passive: true });
        document.addEventListener('visibilitychange', () => (document.hidden ? w.stop() : w.start()));
        canvas.addEventListener('webglcontextlost', () => {
          console.info('[world] fallback: context-lost');
          root.dataset.fallback = 'context-lost';
          root.classList.remove('is-live');
          state.live = false;
        });
        // give way while project figures hold contexts (the host's weight)
        setInterval(() => {
          w.setLoad(typeof window.__figWeight === 'function' ? window.__figWeight() : 0);
          // a track or card running in the middle half of the screen has the visitor: the world eases off
          w.setBusy(!!document.querySelector('figure.fig[data-running]') && state.act !== 'field');
        }, 500);
        if (!document.hidden) w.start();
        return w;
      } catch (err) {
        console.warn('[world] failed', err);
        console.info('[world] fallback: error');
        root.dataset.fallback = 'error';
        canvas.remove();
        return null;
      }
    })();
  };
  if (posterMode) {
    const alt = Number(posterQ.get('alt') || 0);
    document.documentElement.classList.add('poster-world');
    // hold the climb at one altitude, still
    state.motion = 0;
    anchors = [{ y: 0, alt }];
    field = null;
    frozen = true;
    start();
  } else if (!reason) {
    const go = () => ('requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 600));
    if (document.readyState === 'complete') go();
    else addEventListener('load', go, { once: true });
  }
  return {
    reserve: reason ? 0 : 1,
    setTheme(t) {
      state.theme = t;
      document.documentElement.dataset.theme = t;
      try {
        localStorage.setItem('ws.theme', t);
      } catch {}
      world?.setTheme(t);
    },
    get world() {
      return world;
    },
    stop: () => cancelAnimationFrame(raf),
  };
}
