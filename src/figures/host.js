// The page is complete with posters alone; this host decides when a figure may upgrade to a live scene
// and takes the scene away again before it can cost the visitor a crashed tab or a hot phone. It owns
// lifetime (create/start/stop/destroy), the WebGL context budget and every fallback, so figure modules
// only have to draw. Figures own their own rAF; the host's rAF only counts frames and writes readouts.
import { createBudget } from './budget.js';
import { fallbackReason, isWebGLKind, pastLine, readEnv } from './env.js';

const MAX_LIVE = 3;
const LOST_COOLDOWN_MS = 5000;
const READOUT_MS = 250; // at most 4 writes a second
const METER_MS = 500;
const DESKTOP = '(min-width: 860px)';

const safe = (kind, fn) => {
  try {
    return fn();
  } catch (err) {
    console.warn('[fig:' + kind + ']', err && err.message ? err.message : err);
  }
};

// Gap in px between the figure and the viewport; 0 while any part of it is on screen.
function distance(el) {
  const r = el.getBoundingClientRect();
  if (r.bottom < 0) return -r.bottom;
  if (r.top > innerHeight) return r.top - innerHeight;
  return 0;
}

export function initFigures(root, { loaders, env } = {}) {
  if (!('IntersectionObserver' in window) || !loaders) return null;
  env = env || readEnv();

  const budget = createBudget(MAX_LIVE);
  const stats = (window.__figStats = window.__figStats || {});
  const states = [];
  const byId = new Map();
  const perKind = {};

  /* Fallback and poster state */

  function fallback(s, reason) {
    s.fig.dataset.fallback = reason;
    if (!s.logged.has(reason)) {
      s.logged.add(reason);
      console.info('[fig:' + s.kind + '] fallback: ' + reason);
    }
    // A permanent fallback on the hero still owes the reader the "below the waterline" half of the story.
    if (reason !== 'context-lost') setupUnderPoster(s);
  }

  function tagCanvases(s) {
    for (const c of s.stage.querySelectorAll('canvas')) {
      if (s.canvases.has(c)) continue;
      c.classList.add('fig-canvas');
      c.setAttribute('aria-hidden', 'true');
      s.canvases.add(c);
    }
  }

  function reveal(s) {
    tagCanvases(s);
    s.fig.classList.add('is-live');
    s.poster?.setAttribute('aria-hidden', 'true');
  }

  function unreveal(s) {
    s.fig.classList.remove('is-live');
    s.poster?.removeAttribute('aria-hidden');
    for (const c of s.canvases) c.remove(); // a figure that forgot its canvas must not leave it on top
    s.canvases = new Set();
    s.ready = false;
    if (s.readoutEl) s.readoutEl.textContent = '';
    s.lastReadout = '';
  }

  /* Lifecycle */

  function ctxFor(s) {
    let data = {};
    try {
      data = JSON.parse(s.fig.dataset.figData || '{}');
    } catch {}
    return {
      tier: env.tier,
      reduced: env.reduced,
      log: (msg) => console.info('[fig:' + s.kind + '] ' + msg),
      data,
    };
  }

  async function ensure(s) {
    if (s.instance || s.pending || s.failed || !(s.near || s.visible)) return;
    if (performance.now() < s.blockedUntil) return; // the cooldown timer retries
    const token = {};
    s.pending = token;
    if (isWebGLKind(s.kind)) {
      for (const id of budget.acquire(s.id, () => distance(s.fig))) destroy(byId.get(id));
    }
    let inst;
    try {
      const mod = await loaders[s.kind]();
      if (s.pending !== token) return;
      inst = await mod.create(s.stage, ctxFor(s));
      if (!inst) throw new Error('create() returned nothing');
    } catch (err) {
      if (s.pending !== token) return; // cancelled meanwhile; the next attempt reports for itself
      s.pending = null;
      s.failed = true;
      budget.release(s.id);
      tagCanvases(s); // whatever create() left behind before throwing goes too
      unreveal(s);
      fallback(s, 'error');
      console.warn('[fig:' + s.kind + '] ' + (err && err.message ? err.message : String(err)));
      return;
    }
    if (s.pending !== token) {
      // Destroyed (scrolled far, evicted, context lost) while it was being built: drop it unseen.
      safe(s.kind, () => inst.destroy());
      return;
    }
    s.pending = null;
    s.instance = inst;
    delete s.fig.dataset.fallback; // recovered from an earlier context loss
    tagCanvases(s);
    if (s.size) safe(s.kind, () => inst.resize(s.size.w, s.size.h));
    if (s.ready) reveal(s);
    if (s.visible) start(s);
  }

  function start(s) {
    if (!s.instance || s.running) return;
    s.running = true;
    safe(s.kind, () => s.instance.start());
    ensureLoop();
  }

  function stop(s) {
    if (!s.instance || !s.running) return;
    s.running = false;
    safe(s.kind, () => s.instance.stop());
  }

  function destroy(s) {
    if (!s) return;
    if (s.pending) {
      s.pending = null;
      budget.release(s.id);
    }
    if (s.instance) {
      const inst = s.instance;
      stop(s);
      s.instance = null;
      budget.release(s.id);
      safe(s.kind, () => inst.destroy());
    }
    unreveal(s);
  }

  function onContextLost(s, e) {
    if (!s.instance || !s.canvases.has(e.target)) return; // stale canvas or our own loseContext()
    destroy(s);
    fallback(s, 'context-lost');
    s.blockedUntil = performance.now() + LOST_COOLDOWN_MS;
    setTimeout(() => {
      s.blockedUntil = 0;
      ensure(s);
    }, LOST_COOLDOWN_MS);
  }

  /* Frame stats, readouts, ?fps=1 meter: one cheap loop while anything runs */

  let rafId = 0;
  let last = 0;
  let lastReadout = 0;
  let lastMeter = 0;
  const meter = env.fps ? makeMeter() : null;
  const meterWin = new Map(); // id -> { frames, dt } since the last meter update

  function ensureLoop() {
    if (rafId) return;
    last = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function tick(t) {
    const dt = t - last;
    last = t;
    let any = false;
    for (const s of states) {
      if (!s.running) continue;
      any = true;
      if (dt > 0) {
        const st = stats[s.id];
        st.frames += 1;
        st.dtSum += dt;
        if (dt > st.dtMax) st.dtMax = dt;
        const w = meterWin.get(s.id) || { frames: 0, dt: 0 };
        w.frames += 1;
        w.dt += dt;
        meterWin.set(s.id, w);
      }
    }
    if (t - lastReadout >= READOUT_MS) {
      lastReadout = t;
      for (const s of states) {
        if (!s.running || !s.readoutEl || typeof s.instance.readout !== 'function') continue;
        const text = safe(s.kind, () => String(s.instance.readout()));
        if (text != null && text !== s.lastReadout) {
          s.lastReadout = text;
          s.readoutEl.textContent = text;
        }
      }
    }
    if (meter && t - lastMeter >= METER_MS) {
      lastMeter = t;
      const lines = [];
      for (const s of states) {
        const w = meterWin.get(s.id);
        if (s.running && w && w.dt > 0) lines.push(s.id + ' ' + Math.round((1000 * w.frames) / w.dt) + ' fps');
      }
      meterWin.clear();
      meter.textContent = lines.join('\n') || 'no running figures';
    }
    if (any) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = 0;
      if (meter) meter.textContent = 'no running figures';
    }
  }

  /* Reduced-motion and other permanent fallbacks for the hero: above-water poster, then a 400 ms
     cross-fade to the underwater one at half the hero track (desktop) or once the figure's midpoint
     passes the middle of the viewport (phone, where the hero is not a tall track). */

  function setupUnderPoster(s) {
    const src = s.fig.dataset.posterUnder;
    if (s.under || !src || !s.poster) return;
    const img = s.poster.cloneNode(false);
    img.className = 'fig-poster fig-poster--under';
    img.removeAttribute('fetchpriority');
    img.loading = 'lazy';
    img.src = src;
    s.poster.after(img);
    s.under = img;

    const hero = s.fig.closest('.hero');
    const mq = matchMedia(DESKTOP);
    let io = null;
    let sentinel = null;
    const build = () => {
      io?.disconnect();
      sentinel?.remove();
      sentinel = document.createElement('div');
      sentinel.setAttribute('aria-hidden', 'true');
      sentinel.className = 'fig-sentinel';
      sentinel.style.cssText = 'position:absolute;left:0;width:1px;height:1px;pointer-events:none;visibility:hidden';
      let rootMargin = '0px';
      let line;
      if (mq.matches && hero) {
        if (getComputedStyle(hero).position === 'static') hero.style.position = 'relative';
        // Progress through the track is -top / (height - innerHeight), so 0.5 sits at half of
        // (height - innerHeight) below the hero's top, and is reached when that point hits the viewport top.
        sentinel.style.top = 'max(0px, 50% - 50svh)';
        hero.append(sentinel);
        line = (e) => (e.rootBounds ? e.rootBounds.top : 0);
      } else {
        sentinel.style.top = '50%';
        s.stage.append(sentinel);
        rootMargin = '0px 0px -50% 0px'; // root ends at the viewport middle, so crossings fire there
        line = (e) => (e.rootBounds ? e.rootBounds.bottom : innerHeight / 2);
      }
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) s.fig.classList.toggle('is-under', pastLine(e, line(e)));
        },
        { rootMargin },
      );
      io.observe(sentinel);
    };
    build();
    mq.addEventListener?.('change', build);
  }

  /* Wiring */

  const nearIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const s = stateOf(e.target);
        s.near = e.isIntersecting;
        if (s.near) ensure(s);
      }
    },
    { rootMargin: '100% 0px' },
  );
  const visIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const s = stateOf(e.target);
        s.visible = e.isIntersecting;
        if (s.visible) {
          ensure(s);
          start(s);
        } else {
          stop(s);
        }
      }
    },
    { threshold: 0 },
  );
  const farIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (!e.isIntersecting) destroy(stateOf(e.target));
    },
    { rootMargin: '250% 0px' },
  );
  const ro =
    'ResizeObserver' in window
      ? new ResizeObserver((entries) => {
          for (const e of entries) {
            const s = stateOf(e.target.closest('figure'));
            const { width: w, height: h } = e.contentRect;
            s.size = { w, h };
            if (s.instance) safe(s.kind, () => s.instance.resize(w, h));
          }
        })
      : null;

  const byEl = new WeakMap();
  const stateOf = (el) => byEl.get(el);

  for (const fig of root.querySelectorAll('figure.fig[data-fig]')) {
    const kind = fig.dataset.fig;
    const stage = fig.querySelector('.fig-stage');
    if (!stage || !loaders[kind]) continue;
    perKind[kind] = (perKind[kind] || 0) + 1;
    const s = {
      fig,
      kind,
      stage,
      id: kind + '-' + (perKind[kind] - 1),
      poster: stage.querySelector('.fig-poster'),
      readoutEl: fig.querySelector('.fig-readout'),
      logged: new Set(),
      canvases: new Set(),
      instance: null,
      pending: null,
      ready: false,
      running: false,
      near: false,
      visible: false,
      failed: false,
      blockedUntil: 0,
      size: null,
      lastReadout: '',
      under: null,
    };
    fig.dataset.figId = s.id;
    byEl.set(fig, s);
    byId.set(s.id, s);

    const reason = fallbackReason({ ...env, kind });
    if (reason) {
      fallback(s, reason);
      continue;
    }

    states.push(s);
    stats[s.id] = { frames: 0, dtSum: 0, dtMax: 0 };
    stage.addEventListener('fig:ready', () => {
      if (!s.instance && !s.pending) return; // late frame from a destroyed instance
      s.ready = true;
      if (s.instance) reveal(s);
    });
    // Capture phase: the event fires on the canvas and does not bubble.
    stage.addEventListener('webglcontextlost', (e) => onContextLost(s, e), true);
    nearIO.observe(fig);
    visIO.observe(fig);
    farIO.observe(fig);
    ro?.observe(stage);
  }

  return { live: () => budget.live() };
}

function makeMeter() {
  const el = document.createElement('div');
  el.className = 'fig-fps';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position:fixed;right:8px;bottom:8px;z-index:100;padding:6px 8px;white-space:pre;' +
    'font:11px/1.4 var(--mono, monospace);color:#17191c;background:rgba(244,243,238,.92);' +
    'border:1px solid rgba(23,25,28,.2);pointer-events:none';
  el.textContent = 'no running figures';
  document.body.append(el);
  return el;
}
