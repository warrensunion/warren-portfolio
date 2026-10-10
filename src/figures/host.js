// The page is complete with posters alone; this host decides when a figure may upgrade to a live scene
// and takes the scene away again before it can cost the visitor a crashed tab or a hot phone. It owns
// lifetime (create/start/stop/destroy), the WebGL context budget and every fallback, so figure modules
// only have to draw. Figures own their own rAF and report each frame via ctx.frame(); the host rAF only
// writes readouts and repaints the ?fps=1 meter.
//
// ?poster=<kind>&i=<n> (plus depth= / shape= / yaw= pitch=, see readPoster in env.js) is the stills
// hook for scripts/posters.mjs, and does nothing without the param: the host then makes only that one
// figure, at once, with ctx.data.posterState injected and every fallback rule (reduced motion, ?static,
// save-data) ignored, transitions off, and sets window.__posterReady = true one frame after fig:ready
// (window.__posterError = message if it cannot). No observers, budget or other figures in that mode.
import { createBudget } from './budget.js';
import { fallbackReason, isWebGLKind, pastLine, readEnv, readPoster } from './env.js';
import { bindMorphLinks } from './ring/morphLinks.js';

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

// Pure helpers, exported for the Node tests.

export function recordFrame(st, dtMs) {
  if (!(dtMs > 0) || !Number.isFinite(dtMs)) return;
  st.frames += 1;
  st.dtSum += dtMs;
  if (dtMs > st.dtMax) st.dtMax = dtMs;
}

// Which on-screen figures, sitting on their poster after an eviction, should take the free slots.
export function slotRetries(candidates, free, now) {
  if (free <= 0) return [];
  return candidates
    .filter((c) => isWebGLKind(c.kind) && c.visible && !c.instance && !c.build && !c.failed && !(now < c.blockedUntil))
    .slice(0, free)
    .map((c) => c.id);
}

// A build that installs keeps its slot, so it never frees one for a figure mustWait() turned away.
// Those waiters (and only they: an evicted figure retrying here would evict back) try again after
// each install, when acquire() can evict a farther installed figure instead of an in-flight build.
export function waiterRetries(candidates, now) {
  return candidates
    .filter((c) => isWebGLKind(c.kind) && c.waiting && c.visible && !c.instance && !c.build && !c.failed && !(now < c.blockedUntil))
    .map((c) => c.id);
}

// Evicting a figure whose create() is still running would not free its context any sooner, so
// when every other slot is held by such a build the newcomer waits for the next freed slot instead.
export function mustWait(liveIds, id, max, isBuilding) {
  if (liveIds.includes(id)) return false;
  const others = liveIds.filter((x) => x !== id);
  return others.length >= max && others.every(isBuilding);
}

// Gap in px between the figure and the viewport; 0 while any part of it is on screen.
function distance(el) {
  const r = el.getBoundingClientRect();
  if (r.bottom < 0) return -r.bottom;
  if (r.top > innerHeight) return r.top - innerHeight;
  return 0;
}

export function initFigures(root, { loaders, env } = {}) {
  if (!loaders) return null;
  const shot = readPoster(location.search);
  if (shot) return shootPoster(root, loaders, shot);
  if (!('IntersectionObserver' in window)) return null;
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
    if (reason !== 'context-lost') {
      setupUnderPoster(s);
      setupMorphPosters(s);
    }
  }

  // Only canvases added since this build's create() began are the figure's. Anything already in the
  // stage (a cancelled build's leftovers) is never tagged, or its later loss would kill this instance.
  function tagCanvases(s) {
    for (const c of s.stage.querySelectorAll('canvas')) {
      if (s.canvases.has(c) || s.preexisting.has(c)) continue;
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

  /* Lifecycle. At most one create() per figure is ever in flight (s.build); a build cancelled
     mid-flight keeps its budget slot until it settles, because its context exists until then. */

  function ctxFor(s, build) {
    let data = {};
    try {
      data = JSON.parse(s.fig.dataset.figData || '{}');
    } catch {}
    return {
      tier: env.tier,
      reduced: env.reduced,
      log: (msg) => console.info('[fig:' + s.kind + '] ' + msg),
      data,
      // Figures call this once per rendered frame. Only the installed instance counts, so a
      // cancelled build or a destroyed instance's last frame never pollutes the stats.
      frame(dtMs) {
        if (s.live !== build) return;
        recordFrame(stats[s.id], dtMs);
        let w = meterWin.get(s.id);
        if (!w) meterWin.set(s.id, (w = { frames: 0, dtSum: 0, dtMax: 0 }));
        recordFrame(w, dtMs);
      },
    };
  }

  const freeSlots = () => MAX_LIVE - budget.live().length;

  function release(s) {
    if (!isWebGLKind(s.kind)) return;
    budget.release(s.id);
    refill();
  }

  // An evicted figure that is still on screen gets its scene back as soon as a slot frees up,
  // instead of waiting on its poster for its next IntersectionObserver transition.
  function refill() {
    for (const id of slotRetries(states, freeSlots(), performance.now())) ensure(byId.get(id));
  }

  function ensure(s) {
    if (s.instance || s.build || s.failed || !(s.near || s.visible)) return;
    if (performance.now() < s.blockedUntil) return; // the cooldown timer retries
    if (isWebGLKind(s.kind) && mustWait(budget.live(), s.id, MAX_LIVE, (id) => !!byId.get(id).build)) {
      s.waiting = true;
      return;
    }
    s.waiting = false;
    const build = { cancelled: false, preexisting: new Set() };
    s.build = build;
    if (isWebGLKind(s.kind)) {
      // Builds rank below every installed figure, so mustWait() above guarantees the evictee is installed.
      const evict = budget.acquire(s.id, () => (s.build ? -1 : distance(s.fig)));
      for (const id of evict) destroy(byId.get(id));
    }
    run(s, build);
  }

  async function run(s, build) {
    let inst = null;
    let err = null;
    try {
      const mod = await loaders[s.kind]();
      if (!build.cancelled) {
        build.preexisting = s.preexisting = new Set(s.stage.querySelectorAll('canvas'));
        inst = await mod.create(s.stage, ctxFor(s, build));
        if (!inst) throw new Error('create() returned nothing');
      }
    } catch (e) {
      err = e;
    }
    s.build = null;
    const ownCanvases = () =>
      [...s.stage.querySelectorAll('canvas')].filter((c) => !build.preexisting.has(c));

    if (build.cancelled) {
      // Destroyed (scrolled far, evicted) while it was being built: drop it unseen, then free its slot.
      if (inst) safe(s.kind, () => inst.destroy());
      for (const c of ownCanvases()) c.remove();
      s.preexisting = new Set();
      if (isWebGLKind(s.kind)) budget.release(s.id);
      if ((s.near || s.visible) && (!isWebGLKind(s.kind) || freeSlots() > 0)) ensure(s);
      refill();
      return;
    }
    if (err) {
      s.failed = true;
      for (const c of ownCanvases()) c.remove(); // whatever create() left behind before throwing
      unreveal(s);
      fallback(s, 'error');
      console.warn('[fig:' + s.kind + '] ' + (err && err.message ? err.message : String(err)));
      release(s);
      return;
    }
    s.instance = inst;
    s.live = build;
    delete s.fig.dataset.fallback; // recovered from an earlier context loss
    tagCanvases(s);
    if (s.size) safe(s.kind, () => inst.resize(s.size.w, s.size.h));
    if (s.ready) reveal(s);
    if (s.visible) start(s);
    if (isWebGLKind(s.kind)) {
      for (const id of waiterRetries(states, performance.now())) ensure(byId.get(id));
    }
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
    if (s.build) s.build.cancelled = true; // run() frees the slot once create() settles
    if (s.instance) {
      const inst = s.instance;
      stop(s);
      s.instance = null;
      s.live = null;
      safe(s.kind, () => inst.destroy());
      unreveal(s);
      release(s);
      return;
    }
    unreveal(s);
  }

  function onContextLost(s, e) {
    if (!s.instance || !s.canvases.has(e.target)) return; // stale canvas or our own loseContext()
    // Block first: destroy() frees a slot, and the refill must not hand it straight back to us.
    s.blockedUntil = performance.now() + LOST_COOLDOWN_MS;
    destroy(s);
    fallback(s, 'context-lost');
    setTimeout(() => {
      s.blockedUntil = 0;
      ensure(s);
    }, LOST_COOLDOWN_MS);
  }

  /* Readouts and the ?fps=1 meter: one cheap loop while anything runs. Frame stats come from the
     figures themselves through ctx.frame(), so they measure the figure's own render loop. */

  let rafId = 0;
  let lastReadout = 0;
  let lastMeter = 0;
  const meter = env.fps ? makeMeter() : null;
  const meterWin = new Map(); // id -> frame stats since the last meter repaint

  function ensureLoop() {
    if (rafId) return;
    rafId = requestAnimationFrame(tick);
  }

  function tick(t) {
    const any = states.some((s) => s.running);
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
        if (s.running && w && w.dtSum > 0) lines.push(s.id + ' ' + Math.round((1000 * w.frames) / w.dtSum) + ' fps');
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

  /* The ring's still version: a lasting fallback shows the initials poster, and hovering or focusing a
     contact link [data-morph=i] cross-fades (400 ms, opacity only) to that project's still and back.
     The links' own debounce and hover-over-focus precedence are reused, so it behaves like the scene. */

  function setupMorphPosters(s) {
    const list = (s.fig.dataset.posterMorph || '').split(/\s+/).filter(Boolean);
    if (s.morphs || !list.length || !s.poster) return;
    s.morphs = list.map((src) => {
      const img = s.poster.cloneNode(false);
      img.className = 'fig-poster fig-poster--morph';
      img.removeAttribute('fetchpriority');
      img.loading = 'lazy';
      img.src = src;
      return img;
    });
    s.poster.after(...s.morphs);
    let shown = null;
    const show = (i) => {
      shown = i;
      s.morphs.forEach((img, k) => img.classList.toggle('is-on', k === i));
    };
    bindMorphLinks(s.fig.closest('section') || root, show, 120, () => shown);
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
      build: null, // the one create() in flight, if any
      waiting: false, // turned away by mustWait(); retried after the next install
      live: null, // the build whose instance is installed (gates ctx.frame)
      preexisting: new Set(), // stage canvases that predate the current build
      ready: false,
      running: false,
      near: false,
      visible: false,
      failed: false,
      blockedUntil: 0,
      size: null,
      lastReadout: '',
      under: null,
      morphs: null, // the ring's per-project stills, in a lasting fallback
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
      // Late frame from a destroyed instance or a cancelled build: ignore.
      if (!s.instance && !(s.build && !s.build.cancelled)) return;
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

// The stills hook (see the header): one figure, made at once in a fixed state, for a screenshot.
function shootPoster(root, loaders, shot) {
  const fail = (msg) => {
    window.__posterError = String(msg);
    console.warn('[fig:' + shot.kind + '] poster: ' + msg);
    return null;
  };
  const fig = root.querySelectorAll('figure.fig[data-fig="' + shot.kind + '"]')[shot.index];
  const stage = fig && fig.querySelector('.fig-stage');
  if (!stage || !loaders[shot.kind]) return fail('no figure ' + shot.kind + ' #' + shot.index);
  fig.dataset.posterShot = '';
  const style = document.createElement('style');
  style.textContent = '[data-poster-shot],[data-poster-shot] *{transition:none!important;animation:none!important}';
  document.head.append(style);
  let data = {};
  try {
    data = JSON.parse(fig.dataset.figData || '{}');
  } catch {}
  const ctx = {
    tier: 'high',
    reduced: false,
    log: (msg) => console.info('[fig:' + shot.kind + '] ' + msg),
    data: { ...data, posterState: shot.state },
    frame() {},
  };
  // Untagged, a canvas sits in flow at its backing size and widens the stage, so tag before measuring.
  const tag = () => {
    for (const c of stage.querySelectorAll('canvas')) {
      c.classList.add('fig-canvas');
      c.setAttribute('aria-hidden', 'true');
    }
  };
  stage.addEventListener(
    'fig:ready',
    () => {
      tag();
      fig.classList.add('is-live');
      // The frame that drew is-live has to be painted before the screenshot.
      requestAnimationFrame(() => requestAnimationFrame(() => (window.__posterReady = true)));
    },
    { once: true },
  );
  (async () => {
    try {
      await document.fonts?.ready;
      const mod = await loaders[shot.kind]();
      const inst = await mod.create(stage, ctx);
      if (!inst) throw new Error('create() returned nothing');
      tag();
      const r = stage.getBoundingClientRect();
      inst.resize(r.width, r.height);
      inst.start();
    } catch (err) {
      fail(err && err.message ? err.message : err);
    }
  })();
  return { live: () => [] };
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
