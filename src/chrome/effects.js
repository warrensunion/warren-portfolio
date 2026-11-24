// The snow effects over the page, all decoration over a page that reads without them:
// - drifts: a thin drift of snow builds on the top edges of plates, the bar and the log headings while
//   the visitor idles, and blows off when they scroll fast (one CSS variable, --drift);
// - frost: frost creeps in from the screen's corners as the climb gets colder (--frost from the
//   temperature), and melts in a warm circle round the cursor (--mx, --my);
// - breath: a puff of breath fog where the cursor rests for a moment;
// - icicles: a fringe of icicles under the bar, a drop falling from one now and then;
// - cracks: at each log boundary a crack races across the screen as the new log comes in;
// - carved text: log headings appear as if chiselled out of ice, with a glint sweeping across;
// - snow globes: the recorded plates (BTTRURSLF, Beatcut, Ghostline) swirl with snow when dragged.
// Reduced motion keeps only what does not move: the frost by altitude, and a still drift.
import { state } from '../world/boot.js';
import { tempAt } from '../world/climb.js';

const SVG = 'http://www.w3.org/2000/svg';

// One frost texture, drawn once: feathery crystals grown from the edges (a few hundred jagged strokes).
function frostTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  g.strokeStyle = 'rgba(235, 245, 255, 0.55)';
  g.lineCap = 'round';
  const branch = (x, y, a, len, w, depth) => {
    if (depth > 4 || len < 3) return;
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const t = 0.3 + r() * 0.6;
      branch(x + (x2 - x) * t, y + (y2 - y) * t, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), len * (0.35 + r() * 0.3), w * 0.65, depth + 1);
    }
  };
  for (let i = 0; i < 70; i++) {
    const edge = Math.floor(r() * 4);
    const p = r() * size;
    const [x, y, a] = edge === 0 ? [p, 0, Math.PI / 2] : edge === 1 ? [size, p, Math.PI] : edge === 2 ? [p, size, -Math.PI / 2] : [0, p, 0];
    branch(x, y, a + (r() - 0.5) * 1.2, 40 + r() * 110, 1.6, 0);
  }
  // a frosted haze, densest at the edges
  const grad = g.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.75);
  grad.addColorStop(0, 'rgba(230, 240, 255, 0)');
  grad.addColorStop(1, 'rgba(230, 240, 255, 0.35)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c.toDataURL('image/png');
}

export function initEffects(root, { reduced, subscribe }) {
  const html = document.documentElement;

  /* frost from the corners, and the warm breath round the cursor */
  const frost = document.createElement('div');
  frost.className = 'frost';
  frost.setAttribute('aria-hidden', 'true');
  // drawn the first time the climb is cold enough to need it, in an idle moment (it is a few thousand strokes)
  let frostDrawn = false;
  const drawFrost = () => {
    if (frostDrawn) return;
    frostDrawn = true;
    const go = () => (frost.style.backgroundImage = `url(${frostTexture(384)})`);
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 2000 });
    else setTimeout(go, 300);
  };
  document.body.append(frost);
  addEventListener(
    'pointermove',
    (e) => {
      html.style.setProperty('--mx', e.clientX + 'px');
      html.style.setProperty('--my', e.clientY + 'px');
    },
    { passive: true },
  );

  /* breath fog: where the cursor rests for a moment */
  const breath = document.createElement('div');
  breath.className = 'breath';
  breath.setAttribute('aria-hidden', 'true');
  document.body.append(breath);
  let still = 0;
  let px = -999;
  let py = -999;
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return;
      px = e.clientX;
      py = e.clientY;
      still = 0;
      breath.classList.remove('is-on');
    },
    { passive: true },
  );

  /* icicles under the bar, one dripping now and then */
  const bar = root.querySelector('.bar');
  if (bar) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'icicles');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('viewBox', '0 0 1200 22');
    let d = '';
    let x = 0;
    let k = 3;
    const r = () => ((k = (k * 16807) % 2147483647) - 1) / 2147483646;
    const tips = [];
    while (x < 1200) {
      const w = 6 + r() * 14;
      const h = r() < 0.25 ? 10 + r() * 12 : 2 + r() * 6;
      d += `M${x.toFixed(1)} 0 L${(x + w / 2).toFixed(1)} ${h.toFixed(1)} L${(x + w).toFixed(1)} 0 Z `;
      if (h > 12) tips.push([x + w / 2, h]);
      x += w + r() * 6;
    }
    svg.innerHTML = `<path d="${d}"/>` + (reduced ? '' : tips.slice(0, 7).map(([tx, ty], i) => `<circle class="drip" cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="1.6" style="animation-delay:${(i * 2.7 + 1).toFixed(1)}s"/>`).join(''));
    bar.append(svg);
  }

  /* cracks: an SVG overlay; one crack per log boundary crossed (a jagged path drawn across) */
  const cracks = document.createElementNS(SVG, 'svg');
  cracks.setAttribute('class', 'cracks');
  cracks.setAttribute('aria-hidden', 'true');
  document.body.append(cracks);
  function crack() {
    const w = innerWidth;
    const h = innerHeight;
    cracks.setAttribute('viewBox', `0 0 ${w} ${h}`);
    let y = h * (0.25 + Math.random() * 0.5);
    let x = -20;
    let d = `M${x} ${y}`;
    const branches = [];
    while (x < w + 20) {
      x += 30 + Math.random() * 70;
      y += (Math.random() - 0.5) * 60;
      d += ` L${x.toFixed(0)} ${y.toFixed(0)}`;
      if (Math.random() < 0.3) {
        let bx = x;
        let by = y;
        let bd = `M${bx.toFixed(0)} ${by.toFixed(0)}`;
        const dir = Math.random() < 0.5 ? -1 : 1;
        for (let i = 0; i < 3; i++) {
          bx += 15 + Math.random() * 40;
          by += dir * (15 + Math.random() * 35);
          bd += ` L${bx.toFixed(0)} ${by.toFixed(0)}`;
        }
        branches.push(bd);
      }
    }
    const g = document.createElementNS(SVG, 'g');
    g.innerHTML = `<path class="crack-main" d="${d}"/>${branches.map((b) => `<path class="crack-branch" d="${b}"/>`).join('')}`;
    cracks.append(g);
    setTimeout(() => g.remove(), 1600);
  }

  /* carved text and the crack: when a log line or heading comes into view */
  if ('IntersectionObserver' in window && !reduced) {
    let ready = false;
    setTimeout(() => (ready = true), 800); // nothing cracks on the first paint
    let lastCrack = 0;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-carved');
          if (e.target.classList.contains('log-line') && ready && performance.now() - lastCrack > 900 && state.speed < 4000) {
            lastCrack = performance.now();
            crack();
          }
        }
      },
      { rootMargin: '0px 0px -20% 0px' },
    );
    html.classList.add('fx-carve');
    for (const el of root.querySelectorAll('.log-line, h2.log-h')) io.observe(el);
  }

  /* snow globes on the recorded plates */
  if (!reduced) {
    for (const fig of root.querySelectorAll('figure.fig[data-fig="bttr"], figure.fig[data-fig="beatcut"], figure.fig[data-fig="ghostline"]')) globe(fig);
  }

  /* the drift, the frost and the breath, from the page's one loop */
  let drift = 0;
  let lastDrift = -1;
  let lastFrost = -1;
  subscribe((st, dt) => {
    // the drift builds over ~20 s of stillness, and a fling blows it away
    if (st.speed > 1500) drift = Math.max(0, drift - dt * 3);
    else if (st.speed < 40) drift = Math.min(1, drift + dt / 20);
    const dq = reduced ? 0.5 : Math.round(drift * 40) / 40;
    if (dq !== lastDrift) {
      lastDrift = dq;
      html.style.setProperty('--drift', dq.toFixed(3));
    }
    if (st.alt > 600) drawFrost();
    // frost: none at base camp, full at -40 C
    const f = Math.max(0, Math.min(1, (-tempAt(st.alt) - 6) / 34));
    const fq = Math.round(f * 50) / 50;
    if (fq !== lastFrost) {
      lastFrost = fq;
      html.style.setProperty('--frost', fq.toFixed(2));
    }
    if (!reduced && px > -999) {
      still += dt;
      if (still > 1.1 && !breath.classList.contains('is-on')) {
        breath.style.transform = `translate3d(${px}px, ${py}px, 0)`;
        breath.classList.add('is-on');
      }
    }
  });
}

// A snow globe: a 2D canvas of flakes over the plate's stage. Dragging on the plate shakes it: the flakes
// take the drag's velocity, swirl and settle. Idle, the canvas is cleared and its loop stops.
function globe(fig) {
  const stage = fig.querySelector('.fig-stage');
  if (!stage) return;
  const c = document.createElement('canvas');
  c.className = 'globe';
  c.setAttribute('aria-hidden', 'true');
  stage.append(c);
  const g = c.getContext('2d');
  const N = 160;
  const fl = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), vx: 0, vy: 0, r: 0.6 + Math.random() * 1.8 }));
  let raf = 0;
  let energy = 0;
  let last = 0;
  let down = null;
  const frame = (now) => {
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    const w = (c.width = stage.clientWidth);
    const h = (c.height = stage.clientHeight);
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const f of fl) {
      f.vy += 0.06 * dt; // a slow settle, as in water
      f.vx *= Math.exp(-dt * 1.4);
      f.vy *= Math.exp(-dt * 1.4);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.x < 0) (f.x = 0), (f.vx *= -0.5);
      if (f.x > 1) (f.x = 1), (f.vx *= -0.5);
      if (f.y > 1) (f.y = 1), (f.vy = 0);
      if (f.y < 0) (f.y = 0), (f.vy *= -0.5);
      g.globalAlpha = Math.min(1, energy * 1.5) * (f.y < 0.999 ? 1 : 0.5);
      g.beginPath();
      g.arc(f.x * w, f.y * h, f.r, 0, 6.283);
      g.fill();
    }
    energy = Math.max(0, energy - dt * 0.25);
    if (energy > 0 || down) raf = requestAnimationFrame(frame);
    else {
      g.clearRect(0, 0, w, h);
      raf = 0;
      last = 0;
    }
  };
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    down = { x: e.clientX, y: e.clientY };
  });
  addEventListener('pointerup', () => (down = null));
  stage.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = (e.clientX - down.x) / Math.max(1, stage.clientWidth);
    const dy = (e.clientY - down.y) / Math.max(1, stage.clientHeight);
    down = { x: e.clientX, y: e.clientY };
    if (Math.abs(dx) + Math.abs(dy) < 0.002) return;
    energy = 1;
    stage.classList.add('is-shaken');
    for (const f of fl) {
      f.vx += dx * (6 + Math.random() * 10) + (Math.random() - 0.5) * 0.4;
      f.vy += dy * (6 + Math.random() * 10) - Math.random() * 0.6;
    }
    if (!raf) raf = requestAnimationFrame(frame);
  });
}
