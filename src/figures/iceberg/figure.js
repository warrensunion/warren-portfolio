// Fig. 1: the Ascent iceberg in the hero plate. This adapter is the only part that knows about the page:
// it turns the hero's scroll position into the scene's depth (read from rects inside its own rAF, never
// a scroll listener), the cursor over the plate into hover, and frame times into quality steps. The
// scene itself (icebergScene.js) stays a port that knows nothing of the DOM around it.
//
// Poster hook for the stills (Task 9): pass ctx.data.posterState = { depth: 0 | 1 }. The scene then
// sits still at that depth (no scroll, no pointer, no pulse or wind, a fixed clock), so a screenshot of
// the first frame after `fig:ready` is a reproducible poster.
import { IcebergScene, END_STATE } from './icebergScene.js';
import { BergDiagram } from './overlay.js';
import { warmDraws } from '../warm.js';

const DESKTOP = '(min-width: 860px)';
// Ascent's adapt step judged frames over 24 ms; a figure on a page shares the frame, so 22 ms.
const ADAPT = { frames: 60, slowMs: 22, warmup: 30 };
const POSTER_TIME = 2.0; // s: the clock a poster still is drawn at

const clamp01 = (v) => (v <= 0 ? 0 : v > 1 ? 1 : v);

/** Camera height over the waterline as the plate's readout: "+2.4 m" / "-6.1 m", ASCII sign. */
export function formatHeight(y) {
  const v = Math.round(y * 10) / 10;
  const sign = v < 0 ? '-' : '+';
  return sign + Math.abs(v).toFixed(1) + ' m';
}

/** Hero progress 0..1. Desktop: through the 160svh sticky track. Phone: from the figure's top at
    70 % of the viewport to the top edge. On a tall phone the hero figure already sits above the 70 %
    line before any scrolling (390x844: its top is at ~340 px), which would open the page half sunk,
    so the start line is lowered to where the figure sits at scroll 0 (figDocTop) when that is higher. */
export function heroProgress({ desktop, heroTop, heroHeight, figTop, figDocTop = Infinity, innerHeight }) {
  if (desktop) {
    const span = heroHeight - innerHeight;
    return span > 0 ? clamp01(-heroTop / span) : 0;
  }
  const line = Math.max(1, Math.min(0.7 * innerHeight, figDocTop));
  return clamp01((line - figTop) / line);
}

export async function create(el, ctx) {
  const tier = ctx.tier === 'low' ? 'low' : 'high';
  const poster = ctx.data && ctx.data.posterState ? ctx.data.posterState : null;
  const devicePx = window.devicePixelRatio || 1;
  // A poster still is drawn at the shot's full 2x, not the live scene's 1.5x frame-budget cap.
  const dpr = poster ? Math.min(devicePx, 2) : tier === 'low' ? 1 : Math.min(devicePx, 1.5);

  const gl = document.createElement('canvas');
  const over = document.createElement('canvas');
  over.style.pointerEvents = 'none';
  el.append(gl, over);

  let scene;
  try {
    scene = new IcebergScene(gl, { dpr, tier });
    await scene.init();
  } catch (err) {
    // A throw after the renderer was made would otherwise leave its context counted by the browser.
    try {
      gl.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {}
    gl.remove();
    over.remove();
    throw err;
  }
  scene.setState({ ...END_STATE, motion: poster ? 0 : 1 });
  if (poster) scene.setDepth(poster.depth ? 1 : 0, true);
  const diagram = new BergDiagram(over, { reduced: Boolean(ctx.reduced) });
  // The page declares Plex Mono 500 already; a canvas only draws with it once it has loaded.
  document.fonts?.load('500 10.5px "IBM Plex Mono"').catch(() => {});

  const hero = el.closest('.hero');
  const fig = el.closest('figure') || el;
  const mq = matchMedia(DESKTOP);

  let w = Math.max(1, el.clientWidth);
  let h = Math.max(1, el.clientHeight);
  const sizeTo = (cw, ch) => {
    w = Math.max(1, Math.round(cw));
    h = Math.max(1, Math.round(ch));
    scene.resize(w, h);
    diagram.resize(w, h, Math.min(devicePx, 2));
  };
  sizeTo(w, h);

  // The poster stays up while the programs link in parallel off the main thread and are then drawn
  // once each, a task apiece (see warm.js); in one first render() they blocked the page for 1.4 s.
  try {
    await scene.precompile();
    await warmDraws(scene.scene, scene.warmPasses());
  } catch (err) {
    scene.dispose();
    gl.remove();
    over.remove();
    throw err;
  }

  // Pointer -> NDC from the canvas rect. A touch tap opens the blocks under it for a moment.
  let touchTimer = 0;
  const toNdc = (e) => {
    const r = gl.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1];
  };
  const onMove = (e) => {
    if (poster || e.pointerType === 'touch') return;
    scene.setPointer(toNdc(e));
  };
  const onDown = (e) => {
    if (poster || e.pointerType !== 'touch') return;
    scene.setPointer(toNdc(e));
    clearTimeout(touchTimer);
    touchTimer = setTimeout(() => scene && scene.setPointer(null), 1600);
  };
  const onLeave = (e) => {
    if (e.pointerType === 'touch') return;
    scene.setPointer(null);
  };
  el.addEventListener('pointermove', onMove, { passive: true });
  el.addEventListener('pointerdown', onDown, { passive: true });
  el.addEventListener('pointerleave', onLeave);

  let raf = 0;
  let running = false;
  let last = 0;
  let readyFired = false;
  let destroyed = false;
  const perf = { n: 0, sum: 0, stage: 0, seen: 0 };

  const progress = () => {
    const hr = mq.matches && hero ? hero.getBoundingClientRect() : null;
    const fr = hr ? null : fig.getBoundingClientRect();
    return heroProgress({
      desktop: !!hr,
      heroTop: hr ? hr.top : 0,
      heroHeight: hr ? hr.height : 0,
      figTop: fr ? fr.top : 0,
      figDocTop: fr ? fr.top + window.scrollY : Infinity,
      innerHeight: window.innerHeight,
    });
  };

  // Two steps, as in Ascent: first resolution, then the coarse reflections and the decoration.
  const adapt = (dtMs) => {
    if (poster || perf.stage > 1) return;
    if (++perf.seen <= ADAPT.warmup) return;
    perf.n += 1;
    perf.sum += dtMs;
    if (perf.n < ADAPT.frames) return;
    const avg = perf.sum / perf.n;
    perf.n = 0;
    perf.sum = 0;
    if (avg <= ADAPT.slowMs) return;
    perf.stage += 1;
    if (perf.stage === 1 && scene.dpr > 1) {
      scene.setDpr(1);
    } else {
      perf.stage = 2;
      scene.setLowRefl(true);
      scene.setDecorations(false);
    }
    ctx.log(`lowered quality (step ${perf.stage}) at ${avg.toFixed(1)} ms/frame`);
  };

  const frame = (now) => {
    if (!running || destroyed) return;
    raf = requestAnimationFrame(frame);
    const rawMs = last ? now - last : 16.7; // the real frame time, for ctx.frame (fps meter, __figStats)
    const dtMs = Math.min(rawMs, 100); // the simulation step only
    last = now;
    if (!poster) scene.setDepth(progress());
    const t = poster ? POSTER_TIME : now / 1000;
    scene.render(t, poster ? 0 : dtMs / 1000);
    if (!poster) diagram.draw(scene.diagram(), (id) => scene.project(id), now);
    ctx.frame?.(rawMs);
    adapt(dtMs);
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
      // Land on the right depth at once when the figure is (re)started mid-track, rather than
      // sinking through the water in front of the reader.
      if (!poster) scene.setDepth(progress(), !readyFired);
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    },
    resize(cw, ch) {
      if (destroyed || !cw || !ch) return;
      sizeTo(cw, ch);
    },
    readout() {
      return scene && readyFired ? formatHeight(scene.cameraHeight()) : '';
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      running = false;
      cancelAnimationFrame(raf);
      clearTimeout(touchTimer);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerleave', onLeave);
      try {
        diagram.clear();
      } catch {}
      scene.dispose();
      scene = null;
      gl.remove();
      over.remove();
    },
  };
}
