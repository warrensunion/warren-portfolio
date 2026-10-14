// The figure behind the newer project tracks (Drift, Stress Test, Raingarden, Ghostline): recorded clips
// of each site, scrubbed by the track's scroll like the BTTRURSLF and BC Window Coverings figures, and
// optionally a small live demo on one stage (the last), drawn in 2D with no WebGL (weight 0). The demo
// module is only fetched when its stage first comes up, and runs only while that stage shows.
// demo modules export create(layer, ctx) -> { start, stop, resize(w, h), destroy, readout? }.
import { createPlayer } from './player.js';
import { clipT } from './track-math.js';
import './clips.css';

export async function createClips(stage, ctx, { base, demoStage = -1, demo = null }) {
  const res = await fetch(`${base}/manifest.json`);
  if (!res.ok) throw new Error('capture manifest ' + res.status);
  const manifest = await res.json();
  const n = ctx.stages;
  const clips = Array.from({ length: n }, (_, i) => (i === demoStage ? null : manifest.stages[i] || null));

  const root = document.createElement('div');
  root.className = 'cl';
  stage.append(root);
  const player = createPlayer(root, { base, stages: clips });

  // The demo's layer sits over the clips and the stage's still; it fades in once the demo has drawn.
  let layer = null;
  let inst = null;
  let loading = null;
  let running = false;
  let destroyed = false;
  let size = null;
  function loadDemo() {
    if (loading || !demo) return;
    layer = document.createElement('div');
    layer.className = 'cl-demo';
    root.append(layer);
    loading = demo()
      .then((mod) => mod.create(layer, ctx))
      .then((d) => {
        if (destroyed) return d.destroy();
        inst = d;
        if (size) inst.resize(size.w, size.h);
        sync();
      })
      .catch((err) => {
        // The stage's still stays: a demo that cannot run is never worth an error on the page.
        ctx.log('demo unavailable: ' + (err && err.message ? err.message : err));
        layer?.remove();
        layer = null;
      });
  }

  let showing = false;
  function sync() {
    const want = running && showing;
    if (layer) layer.classList.toggle('is-on', showing && !!inst);
    if (!inst) return;
    if (want) inst.start();
    else inst.stop();
  }

  let raf = 0;
  let last = 0;
  let readyFired = false;
  let shown = -1;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (last) ctx.frame(now - last);
    last = now;
    const s = ctx.stage();
    const x = ctx.progress() * (n - 1);
    if (clips[s]) player.show(s, clipT(x, s, n));
    else if (s !== shown) player.show(s, 0);
    shown = s;
    const demoOn = s === demoStage;
    if (demoOn) loadDemo();
    if (demoOn !== showing) {
      showing = demoOn;
      sync();
    }
    if (!readyFired) {
      readyFired = true;
      stage.dispatchEvent(new Event('fig:ready'));
    }
  }

  return {
    start() {
      running = true;
      sync();
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    },
    stop() {
      running = false;
      sync();
      cancelAnimationFrame(raf);
      raf = 0;
    },
    resize(w, h) {
      size = { w, h };
      inst?.resize(w, h);
    },
    readout() {
      const s = ctx.stage();
      if (s === demoStage && inst && typeof inst.readout === 'function') return inst.readout();
      return `${s + 1} of ${n}`;
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      inst?.destroy();
      player.destroy();
      root.remove();
    },
  };
}
