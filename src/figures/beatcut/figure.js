// Beatcut's track figure: three of its own renders, muted, each in a phone frame beside its beat grid,
// then how it works. The grid is the render's real data (public/beatcut/<clip>.json, exported from
// Beatcut's analysis, plan and self-check files): one cell per beat, a tall tick per cut, and both light
// as the clip plays, read from video.currentTime every frame, so the grid pulses with the clip's own cuts.
// The clip of the current stage plays (autoplay, muted, looped) while the figure runs; nothing is
// scrubbed. No WebGL: weight 0. Reduced motion, save-data and ?static=1 keep the stage stills.
import './figure.css';

const CLIPS = [
  { slug: 'spotlight-stage', label: 'SPOTLIGHT STAGE' },
  { slug: 'line-explainer', label: 'LINE EXPLAINER' },
  { slug: 'glitch-popup', label: 'GLITCH POPUP' },
];
const STEPS = [
  ['01', 'Audio', 'librosa: beats, downbeats, sections, drops'],
  ['02', 'Reference', 'PySceneDetect cuts; Claude reads 12 frames into a style'],
  ['03', 'Plan', 'Claude plans the scenes in beats, through one tool call'],
  ['04', 'Check', 'code snaps them to the beat grid and validates them with Zod'],
  ['05', 'Render', 'Remotion, from hand-written templates'],
  ['06', 'Self-check', 'measures where every cut lands against the beat'],
];

const base = () => (import.meta.env?.BASE_URL || '/').replace(/\/?$/, '/');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export async function create(stage, ctx) {
  const root = document.createElement('div');
  root.className = 'bc';
  root.innerHTML =
    `<div class="bc-clip"><div class="bc-phone"><video class="bc-video" muted playsinline loop preload="none" aria-hidden="true"></video></div></div>` +
    `<div class="bc-side"><p class="bc-k"><span class="bc-name"></span><span class="bc-bpm"></span></p>` +
    `<div class="bc-grid" aria-hidden="true"></div>` +
    `<div class="bc-ruler" aria-hidden="true"><span class="bc-head"></span></div>` +
    `<p class="bc-scene"></p><p class="bc-check"></p></div>` +
    `<ol class="bc-steps">${STEPS.map(([n, t, d]) => `<li><span class="bc-n">${n}</span><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ol>`;
  stage.append(root);
  const video = root.querySelector('.bc-video');
  const grid = root.querySelector('.bc-grid');
  const head = root.querySelector('.bc-head');
  const ruler = root.querySelector('.bc-ruler');
  const nameEl = root.querySelector('.bc-name');
  const bpmEl = root.querySelector('.bc-bpm');
  const sceneEl = root.querySelector('.bc-scene');
  const checkEl = root.querySelector('.bc-check');
  const steps = [...root.querySelectorAll('.bc-steps li')];

  const data = await Promise.all(
    CLIPS.map((c) =>
      fetch(`${base()}beatcut/${c.slug}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ),
  );
  if (data.some((d) => !d)) throw new Error('beat data missing');

  let shown = -1;
  let cells = [];
  let ticks = [];
  function show(i) {
    if (i === shown) return;
    shown = i;
    root.classList.toggle('is-how', i >= CLIPS.length);
    if (i >= CLIPS.length) {
      video.pause();
      return;
    }
    const c = CLIPS[i];
    const d = data[i];
    video.poster = `${base()}beatcut/${c.slug}-poster.webp`;
    video.innerHTML = `<source src="${base()}beatcut/${c.slug}.webm" type="video/webm"><source src="${base()}beatcut/${c.slug}.mp4" type="video/mp4">`;
    video.load();
    if (running) video.play().catch(() => {});
    nameEl.textContent = c.label;
    bpmEl.textContent = `${Math.round(d.tempo)} BPM`;
    checkEl.textContent = `${d.check.visibleCuts} of ${d.check.plannedCuts} planned cuts on screen · mean ${Math.round(d.check.meanCutToBeatMs)} ms from the beat`;
    grid.innerHTML = d.beats.map((b, k) => `<i class="bc-beat${d.downbeats.some((x) => Math.abs(x - b) < 0.02) ? ' is-down' : ''}" data-k="${k}"></i>`).join('');
    cells = [...grid.children];
    ruler.querySelectorAll('.bc-cut').forEach((e) => e.remove());
    ticks = d.cuts.map((t) => {
      const e = document.createElement('span');
      e.className = 'bc-cut';
      e.style.left = `${(100 * t) / d.duration}%`;
      ruler.append(e);
      return { t, e };
    });
  }

  let raf = 0;
  let running = false;
  let lastBeat = -1;
  let lastScene = -1;
  let lastNow = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (lastNow) ctx.frame(now - lastNow);
    lastNow = now;
    show(Math.min(CLIPS.length, ctx.stage()));
    if (shown >= CLIPS.length) {
      // how it works: one step lights per beat at 120 bpm
      const k = Math.floor((now / 500) % steps.length);
      steps.forEach((s, j) => s.classList.toggle('is-on', j === k));
      return;
    }
    const d = data[shown];
    const t = video.currentTime || 0;
    head.style.left = `${(100 * t) / d.duration}%`;
    // the beat being played: the last beat at or before t
    let b = -1;
    for (let k = 0; k < d.beats.length; k++) if (d.beats[k] <= t + 0.02) b = k;
    if (b !== lastBeat) {
      if (cells[lastBeat]) cells[lastBeat].classList.remove('is-now');
      if (cells[b]) cells[b].classList.add('is-now');
      cells.forEach((c, k) => c.classList.toggle('is-past', k < b));
      lastBeat = b;
    }
    let sc = 0;
    for (const x of ticks) {
      const on = Math.abs(x.t - t) < 0.12;
      x.e.classList.toggle('is-hit', on);
      if (x.t <= t) sc++;
    }
    if (sc !== lastScene) {
      lastScene = sc;
      sceneEl.textContent = `SCENE ${String(sc + 1).padStart(2, '0')} · ${d.templates[sc] || ''}`;
    }
  };

  // first frame (its clip's poster decoded, so a still never shows an empty phone), then ready
  show(Math.min(CLIPS.length, ctx.stage()));
  if (shown < CLIPS.length) {
    const img = new Image();
    img.src = video.poster;
    await img.decode().catch(() => {});
  }
  requestAnimationFrame(() => stage.dispatchEvent(new Event('fig:ready')));

  return {
    start() {
      if (running) return;
      running = true;
      if (shown < CLIPS.length) video.play().catch(() => {});
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      lastNow = 0;
      cancelAnimationFrame(raf);
      video.pause();
    },
    resize() {},
    readout: () => (shown < CLIPS.length ? `${(video.currentTime || 0).toFixed(1)} s` : 'pipeline'),
    destroy() {
      cancelAnimationFrame(raf);
      video.pause();
      video.removeAttribute('src');
      video.innerHTML = '';
      video.load();
      root.remove();
    },
  };
}
