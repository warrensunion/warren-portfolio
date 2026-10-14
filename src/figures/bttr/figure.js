// The BTTRURSLF feature figure (spec 5.2): recorded clips of the game, scrubbed by the track's scroll,
// one clip per stage, grouped under tabs (the tabs themselves are static markup driven by tracks.js).
// Appearance ends on rebuilt puzzle cards the visitor can flip; Stats is DOM from the baked numbers.
// No WebGL (weight 0): it only plays video, so it is cheap to keep alive.
import { createPlayer } from '../player.js';
import { clipT } from '../track-math.js';
import { createPuzzle } from './puzzle.js';
import { renderStats } from './stats.js';
import stats from '../../data/bttr-stats.json';
import './figure.css';

const BASE = import.meta.env.BASE_URL + 'captures/bttr';
const STATS_STAGE = 14;
const PUZZLE_STAGE = 3; // Mereum: Appearance, whose pieces open into the cards

export async function create(stage, ctx) {
  const res = await fetch(`${BASE}/manifest.json`);
  if (!res.ok) throw new Error('capture manifest ' + res.status);
  const manifest = await res.json();
  const n = ctx.stages;
  const clips = Array.from({ length: n }, (_, i) => manifest.stages[i] || null);
  const fig = stage.closest('figure');
  const tabs = fig ? [...fig.querySelectorAll('.fig-tabs button[data-stage]')].map((b) => ({ label: b.textContent, first: Number(b.dataset.stage) })) : [];

  const root = document.createElement('div');
  root.className = 'bt';
  stage.append(root);
  const player = createPlayer(root, { base: BASE, stages: clips });
  const puzzle = createPuzzle(root, { base: BASE, cards: manifest.cards || [] });
  const panel = renderStats(root, stats);

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
    root.classList.toggle('is-stats', s === STATS_STAGE);
    panel.show(s === STATS_STAGE);
    puzzle.show(s === PUZZLE_STAGE && clipT(x, s, n) >= 1 && player.ready(s));
    if (!readyFired) {
      readyFired = true;
      stage.dispatchEvent(new Event('fig:ready'));
    }
  }

  return {
    start() {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
    resize() {},
    readout() {
      const s = ctx.stage();
      let k = 0;
      tabs.forEach((t, j) => {
        if (t.first <= s) k = j;
      });
      const t = tabs[k];
      if (!t) return `${s + 1} of ${n}`;
      const end = tabs[k + 1] ? tabs[k + 1].first : n;
      return `${t.label}, ${s - t.first + 1} of ${end - t.first}`;
    },
    destroy() {
      cancelAnimationFrame(raf);
      player.destroy();
      puzzle.destroy();
      panel.destroy();
      root.remove();
    },
  };
}
