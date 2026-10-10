// Scroll tracks (spec section 3.4): turns where each track's rail sits into a progress value from 0 to 1
// and a stage index, without scroll listeners and without taking scrolling away from the visitor. One
// IntersectionObserver says which tracks are on screen; while any is, one rAF loop reads their rects once
// per frame (the hero's technique). The figure reads progress through ctx.progress(); nothing is pushed
// into it. Stage buttons scroll natively to their stage, so the visitor can always scroll past.
import { deskProgress, phoneProgress, stageFor, stageOffset } from './track-math.js';

const DESK = '(min-width: 860px)';
const TOP = 96; // the sticky top of the text and the figure (layout.css)

export function initTracks(root, { reduced = false } = {}) {
  const mq = matchMedia(DESK);
  const tracks = [...root.querySelectorAll('[data-track]')].map((el) => {
    const rail = el.querySelector('.track-rail');
    const fig = rail && rail.querySelector('figure');
    const buttons = fig ? [...fig.querySelectorAll('.fig-stages button[data-stage]')] : [];
    return { el, rail, fig, buttons, n: Math.max(1, buttons.length), p: 0, stage: 0, visible: false, override: null, subs: new Set(), lastP: -1 };
  });
  const byFig = new Map(tracks.filter((t) => t.fig).map((t) => [t.fig, t]));

  // The pinned stretch is the rail's spacer (layout.css), so it is the rail's height less the figure's.
  const pad = (t) => Math.max(0, t.rail.getBoundingClientRect().height - t.fig.getBoundingClientRect().height);

  function apply(t) {
    t.el.dataset.stage = String(t.stage);
    t.buttons.forEach((b, i) => (i === t.stage ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
    for (const fn of t.subs) {
      try {
        fn(t.stage);
      } catch (err) {
        console.warn('[tracks]', err);
      }
    }
  }

  function measure(t) {
    if (!t.fig) return;
    let p;
    if (mq.matches) {
      t.override = null;
      p = deskProgress({ railTop: t.rail.getBoundingClientRect().top, pad: pad(t), top: TOP });
    } else {
      const f = t.fig.getBoundingClientRect();
      p = phoneProgress({ figTop: f.top, figH: f.height, vh: innerHeight });
      // A tapped stage holds until the visitor has scrolled the figure a tenth of its range away.
      if (t.override) {
        if (Math.abs(p - t.override.from) > 0.1) t.override = null;
        else p = t.override.p;
      }
    }
    t.p = p;
    if (Math.abs(p - t.lastP) > 0.0005) {
      t.lastP = p;
      t.el.style.setProperty('--p', p.toFixed(4));
    }
    const s = stageFor(p, t.n, t.stage);
    if (s !== t.stage) {
      t.stage = s;
      apply(t);
    }
  }

  let raf = 0;
  const loop = () => {
    raf = 0;
    let any = false;
    for (const t of tracks) {
      if (!t.visible) continue;
      any = true;
      measure(t);
    }
    if (any) raf = requestAnimationFrame(loop);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(loop);
  };

  function go(t, i) {
    if (mq.matches) {
      const railDocTop = t.rail.getBoundingClientRect().top + scrollY;
      scrollTo({ top: railDocTop - TOP + stageOffset(i, t.n, pad(t)), behavior: reduced ? 'instant' : 'smooth' });
    } else {
      const f = t.fig.getBoundingClientRect();
      t.override = { p: t.n > 1 ? i / (t.n - 1) : 0, from: phoneProgress({ figTop: f.top, figH: f.height, vh: innerHeight }) };
      measure(t);
    }
    kick();
  }

  // Pinned text keeps its bottom on screen: 96 px down, or higher when the text is taller than the room.
  const fitText = () => {
    for (const t of tracks) {
      const text = t.el.querySelector('.track-text');
      if (!text) continue;
      const top = Math.min(TOP, innerHeight - text.offsetHeight - 24);
      t.el.style.setProperty('--text-top', Math.round(top) + 'px');
    }
  };
  fitText();
  addEventListener('resize', fitText, { passive: true });
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(fitText);
    for (const t of tracks) {
      const text = t.el.querySelector('.track-text');
      if (text) ro.observe(text);
    }
  }

  for (const t of tracks) {
    if (!t.fig) continue;
    t.el.addEventListener('click', (e) => {
      const b = e.target.closest('.fig-stages button[data-stage]');
      if (b && t.el.contains(b)) go(t, Number(b.dataset.stage));
    });
    // Correct on the first frame, including a load deep inside a track.
    measure(t);
    apply(t);
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const t = tracks.find((x) => x.el === e.target);
        if (t) t.visible = e.isIntersecting;
      }
      kick();
    });
    for (const t of tracks) io.observe(t.el);
  }
  // Where the page must sit for track t to be at progress p, under the layout in force now.
  function offsetFor(t, p) {
    if (mq.matches) return t.rail.getBoundingClientRect().top + scrollY - TOP + p * pad(t);
    const f = t.fig.getBoundingClientRect();
    const start = 0.85 * innerHeight;
    const end = 0.45 * innerHeight - f.height / 2;
    return f.top + scrollY - (start - p * (start - end));
  }

  // Crossing 860 px swaps the layout under the visitor: the rails' pinned stretches appear or vanish, so
  // the page changes height by thousands of px and the old scrollY (often clamped) lands somewhere else
  // entirely. The change fires before this frame's rAF measures, so t.p is still the old progress: put
  // the visitor back at that progress through the track they were inside, once, with an instant jump.
  mq.addEventListener?.('change', () => {
    const cur = tracks.find((t) => t.fig && t.visible && t.p > 0 && t.p < 1);
    if (cur) scrollTo({ top: Math.max(0, offsetFor(cur, cur.p)), left: scrollX, behavior: 'instant' });
    for (const t of tracks) measure(t);
  });

  return {
    progressOf: (fig) => byFig.get(fig)?.p ?? 0,
    stageOf: (fig) => byFig.get(fig)?.stage ?? 0,
    stagesOf: (fig) => byFig.get(fig)?.n ?? 1,
    onStage(fig, fn) {
      const t = byFig.get(fig);
      if (!t) return () => {};
      t.subs.add(fn);
      return () => t.subs.delete(fn);
    },
    go: (fig, i) => byFig.has(fig) && go(byFig.get(fig), i),
  };
}
