// The figure host's promises (live scenes that really draw, at most three WebGL contexts, scenes that
// stop off screen, posters and a logged reason whenever a scene is not allowed, recovery from a lost
// context, a still page under reduced motion) and the email copy and phone layout only hold in a real
// browser, so this drives the built page in Chromium and prints PASS/FAIL per promise. Exit code 1 on
// any FAIL. Usage: npm run check [-- --no-build] [-- --swiftshader]
import { chromium } from 'playwright';
import { build, GPU_ARGS, startPreview } from './lib/preview.mjs';
import { labelGeometry } from '../src/figures/iceblock/label.js';
import { content } from '../src/content.js';

const argv = new Set(process.argv.slice(2));
const ARGS = argv.has('--swiftshader') ? [] : GPU_ARGS;
const WEBGL_IDS = ['iceberg-0', 'iceblock-0', 'iceblock-1', 'iceblock-2', 'ring-0'];
const KIND_COUNT = { iceberg: 1, iceblock: 3, ring: 1 };
const CANVASES = { iceberg: 2, iceblock: 1, ring: 1 }; // the iceberg's WebGL scene plus its 2D overlay
const DESK = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

let fails = 0;
let passes = 0;
function report(name, ok, detail = '') {
  if (ok) passes++;
  else fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? '  (' + detail + ')' : ''}`);
}
// A check that throws (a timeout, a missing element) is a FAIL with the reason, never a crash.
async function step(name, fn) {
  try {
    await fn();
  } catch (err) {
    report(name, false, String(err && err.message ? err.message : err).split('\n')[0]);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const allPageErrors = [];

async function open(browser, url, opts = {}, { init } = {}) {
  const context = await browser.newContext({ viewport: DESK, deviceScaleFactor: 1, ...opts });
  // The page scrolls smoothly; the checks need to be where they asked to be at once.
  await context.addInitScript(() => {
    window.__jump = (y) => window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    // Every WebGL context the page ever makes, so the budget is counted in contexts the browser still
    // holds (not lost), not in canvases: a destroy that drops its canvas but skips loseContext() leaks.
    const made = new Set();
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const ctx = get.call(this, type, ...rest);
      if (ctx && /^(webgl2?|experimental-webgl)$/.test(type)) made.add(ctx);
      return ctx;
    };
    window.__glAlive = () => [...made].filter((c) => !c.isContextLost()).length;
    // A context only ever adds to the count when it is made, so sampling at each creation catches a
    // spike that sits between two scroll-step samples.
    window.__glPeak = 0;
    const note = () => (window.__glPeak = Math.max(window.__glPeak, window.__glAlive()));
    HTMLCanvasElement.prototype.getContext = ((wrapped) =>
      function (...args) {
        const before = made.size;
        const ctx = wrapped.apply(this, args);
        if (made.size !== before) note();
        return ctx;
      })(HTMLCanvasElement.prototype.getContext);
  });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const logs = [];
  const errors = [];
  page.on('console', (m) => logs.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => {
    errors.push(e.message);
    allPageErrors.push(url + ': ' + e.message);
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  return { context, page, logs, errors, close: () => context.close() };
}

const figSel = (id) => `figure.fig[data-fig-id="${id}"]`;
const kindOf = (id) => id.replace(/-\d+$/, '');

// Scroll so the figure is centred (the hero: page top, where its scene starts).
async function scrollToFig(page, id) {
  await page.evaluate(
    ([sel, top]) => {
      if (top) return window.__jump(0);
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      window.__jump(Math.max(0, window.scrollY + r.top + r.height / 2 - innerHeight / 2));
    },
    [figSel(id), id === 'iceberg-0'],
  );
}

const waitLive = (page, id, timeout = 30000) =>
  page.waitForFunction((sel) => document.querySelector(sel)?.classList.contains('is-live'), figSel(id), { timeout });

const frames = (page, id) => page.evaluate((id) => (window.__figStats?.[id]?.frames ?? -1), id);

// Copies the figure's first (WebGL) canvas into a 2D canvas inside a rAF that runs after the figure's
// own render in the same frame, so the drawing buffer is still there, and measures how varied it is.
function pixelSpread(page, id) {
  return page.evaluate(
    (sel) =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          const c = document.querySelector(sel + ' canvas.fig-canvas');
          if (!c) return resolve({ distinct: 0, range: 0 });
          const t = document.createElement('canvas');
          t.width = t.height = 48;
          const g = t.getContext('2d', { willReadFrequently: true });
          g.drawImage(c, 0, 0, 48, 48);
          const px = g.getImageData(0, 0, 48, 48).data;
          const seen = new Set();
          let lo = 255;
          let hi = 0;
          for (let i = 0; i < px.length; i += 4) {
            seen.add((px[i] >> 3) * 1024 + (px[i + 1] >> 3) * 32 + (px[i + 2] >> 3));
            const l = (px[i] + px[i + 1] + px[i + 2]) / 3;
            lo = Math.min(lo, l);
            hi = Math.max(hi, l);
          }
          resolve({ distinct: seen.size, range: Math.round(hi - lo) });
        });
      }),
    figSel(id),
  );
}

// Per WebGL figure: how many canvases it holds right now.
const canvasCounts = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('figure.fig[data-fig-id]')]
        .filter((f) => ['iceberg', 'iceblock', 'ring'].includes(f.dataset.fig))
        .map((f) => [f.dataset.figId, f.querySelectorAll('canvas').length]),
    ),
  );
const liveCount = (counts) => Object.values(counts).filter((n) => n > 0).length;
// WebGL contexts the page holds right now (made and not lost), and the most it ever held at once.
const gl = (page) => page.evaluate(() => ({ alive: window.__glAlive(), peak: window.__glPeak }));
// Console output that means trouble: any error, or a warning about WebGL or a context. The host's own
// "fallback: context-lost" line is info, so the context-loss check's expected log never counts.
const consoleProblems = (logs) =>
  logs.filter((l) => l.type === 'error' || (l.type === 'warning' && /WebGL|context/i.test(l.text))).map((l) => `${l.type}: ${l.text}`);
function reportConsole(name, logs) {
  const bad = consoleProblems(logs);
  report(name, bad.length === 0, bad.slice(0, 4).join(' | '));
}

const fallbackLogs = (logs, reason) => {
  const per = {};
  for (const l of logs) {
    const m = l.text.match(/^\[fig:(\w+)\] fallback: (.+)$/);
    if (m && m[2] === reason) per[m[1]] = (per[m[1]] || 0) + 1;
  }
  return per;
};
const sameCounts = (a, b) => Object.keys({ ...a, ...b }).every((k) => a[k] === b[k]);

async function scrollThrough(page, stepPx, waitMs, each) {
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  for (let y = 0; ; y = Math.min(max, y + stepPx)) {
    await page.evaluate((y) => window.__jump(y), y);
    await sleep(waitMs);
    if (each) await each(y);
    if (y >= max) break;
  }
}

/* ── checks ── */

async function checkLive(browser, url) {
  const t = await open(browser, url);
  const { page } = t;
  for (const id of WEBGL_IDS) {
    await step(`live: ${id} draws a non-uniform canvas and counts > 30 frames`, async () => {
      await scrollToFig(page, id);
      await waitLive(page, id);
      await page.waitForFunction((id) => (window.__figStats?.[id]?.frames ?? 0) > 30, id, { timeout: 20000 });
      const px = await pixelSpread(page, id);
      const f = await frames(page, id);
      report(`live: ${id} draws a non-uniform canvas and counts > 30 frames`, px.distinct > 8 && px.range > 12 && f > 30, `${px.distinct} colours, luminance range ${px.range}, ${f} frames`);
    });
  }
  await step('live: contests-0 draws its SVG chart', async () => {
    await scrollToFig(page, 'contests-0');
    await page.waitForFunction((sel) => document.querySelector(sel + ' svg'), figSel('contests-0'), { timeout: 10000 });
    report('live: contests-0 draws its SVG chart', true);
  });

  await step('off-screen: a figure just below the viewport stops counting frames for 1 s', async () => {
    const id = 'iceblock-1';
    await scrollToFig(page, id);
    await waitLive(page, id);
    await page.evaluate((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      window.__jump(window.scrollY + r.top - innerHeight - 120); // its top 120 px under the fold
    }, figSel(id));
    await sleep(400);
    const before = await frames(page, id);
    await sleep(1000);
    const after = await frames(page, id);
    const kept = (await canvasCounts(page))[id] > 0; // stopped, not destroyed: it is still near
    await scrollToFig(page, id);
    await sleep(600);
    const resumed = await frames(page, id);
    report('off-screen: a figure just below the viewport stops counting frames for 1 s', before === after && kept && resumed > after, `frames ${before} -> ${after} off screen, ${resumed} after scrolling back, canvas kept: ${kept}`);
  });
  report('live: no page errors', t.errors.length === 0, t.errors.join(' | '));
  await t.close();
}

async function checkBudget(browser, url) {
  const t = await open(browser, url);
  const { page } = t;
  await step('budget: at most 3 live WebGL figures and 3 WebGL contexts at every 200 px step, top to bottom and back', async () => {
    let worst = 0;
    let where = 0;
    let worstGl = 0;
    let whereGl = 0;
    const each = async (y) => {
      const n = liveCount(await canvasCounts(page));
      if (n > worst) [worst, where] = [n, y];
      const g = await gl(page);
      if (g.alive > worstGl) [worstGl, whereGl] = [g.alive, y];
    };
    await scrollThrough(page, 200, 150, each);
    await sleep(1500);
    await each('bottom+1.5s');
    // And back up, which evicts in the other direction.
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (let y = max; y >= 0; y -= 200) {
      await page.evaluate((y) => window.__jump(y), y);
      await sleep(150);
      await each(y);
    }
    const { peak } = await gl(page);
    report('budget: at most 3 live WebGL figures and 3 WebGL contexts at every 200 px step, top to bottom and back', worst <= 3 && worstGl <= 3 && peak <= 3, `figures max ${worst} at ${where}; contexts max ${worstGl} at ${whereGl}, peak at any creation ${peak}`);
  });
  report('budget: no page errors while scrolling', t.errors.length === 0, t.errors.join(' | '));
  const bad = t.logs.filter((l) => /fallback: error/.test(l.text));
  report('budget: no figure failed while scrolling', bad.length === 0, bad.map((l) => l.text).join(' | '));
  reportConsole('budget: no console errors or WebGL/context warnings', t.logs);
  await t.close();
}

async function checkRaces(browser, url) {
  const t = await open(browser, url);
  const { page } = t;
  const settle = async (label, id) => {
    await scrollToFig(page, id);
    await sleep(4000);
    const counts = await canvasCounts(page);
    const state = await page.evaluate(() =>
      [...document.querySelectorAll('figure.fig[data-fig-id]')].map((f) => {
        const r = f.getBoundingClientRect();
        return { id: f.dataset.figId, kind: f.dataset.fig, live: f.classList.contains('is-live'), visible: r.bottom > 0 && r.top < innerHeight, far: r.bottom < -2.5 * innerHeight || r.top > 3.5 * innerHeight };
      }),
    );
    const problems = [];
    for (const s of state) {
      if (!(s.kind in CANVASES)) continue;
      const n = counts[s.id];
      if (n && n !== CANVASES[s.kind]) problems.push(`${s.id} holds ${n} canvases`);
      if (s.visible && !s.live) problems.push(`${s.id} on screen but not live`);
      if (s.far && n) problems.push(`${s.id} far away but holds a canvas`);
      if (s.live && !n) problems.push(`${s.id} live without a canvas`);
    }
    if (liveCount(counts) > 3) problems.push(`${liveCount(counts)} live figures`);
    // Each live figure holds exactly one WebGL context; any more alive is a leak (a canvas dropped
    // without loseContext(), or a cancelled build that kept its context).
    const g = await gl(page);
    if (g.alive !== liveCount(counts)) problems.push(`${g.alive} WebGL contexts alive for ${liveCount(counts)} live figures`);
    if (g.peak > 3) problems.push(`context peak ${g.peak}`);
    const f0 = await frames(page, id);
    await sleep(500);
    const f1 = await frames(page, id);
    if (!(f1 > f0)) problems.push(`${id} frames stuck at ${f1}`);
    report(`races: after fast back-and-forth scrolling, ${label} settles cleanly`, problems.length === 0, problems.join('; ') || `live: ${Object.keys(counts).filter((k) => counts[k]).join(', ')}`);
  };
  await step('races: fast back-and-forth scrolling', async () => {
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const spots = [0, max, max * 0.4, 0, max * 0.7, max * 0.2, max, max * 0.5, 0, max * 0.8];
    for (let round = 0; round < 3; round++) {
      for (const y of spots) {
        await page.evaluate((y) => window.__jump(y), Math.round(y));
        await sleep(40 + ((round * 37) % 60));
      }
    }
    await settle('the contact ring', 'ring-0');
    for (const y of spots) {
      await page.evaluate((y) => window.__jump(y), Math.round(y));
      await sleep(25);
    }
    await settle('the middle ice block', 'iceblock-1');
    await settle('the hero', 'iceberg-0');
  });
  report('races: no page errors and no failed figures', t.errors.length === 0 && !t.logs.some((l) => /fallback: error/.test(l.text)), t.errors.join(' | '));
  reportConsole('races: no console errors or WebGL/context warnings', t.logs);
  await t.close();
}

async function checkStatic(browser, url) {
  const t = await open(browser, url + '?static=1');
  const { page } = t;
  await step('fallback ?static=1: no canvases, every poster loaded and shown, one "fallback: forced" per WebGL figure', async () => {
    let canv = 0;
    await scrollThrough(page, 500, 120, async () => {
      canv = Math.max(canv, await page.evaluate(() => document.querySelectorAll('figure.fig canvas').length));
    });
    await page.waitForFunction(() => [...document.querySelectorAll('img.fig-poster:not(.fig-poster--morph):not(.fig-poster--under)')].every((i) => i.complete), null, { timeout: 15000 });
    const posters = await page.evaluate(() =>
      [...document.querySelectorAll('img.fig-poster:not(.fig-poster--morph):not(.fig-poster--under)')].map((i) => ({ src: i.getAttribute('src'), ok: i.naturalWidth > 0 && getComputedStyle(i).opacity === '1' && i.getBoundingClientRect().height > 0 })),
    );
    const per = fallbackLogs(t.logs, 'forced');
    const bad = posters.filter((p) => !p.ok).map((p) => p.src);
    report('fallback ?static=1: no canvases, every poster loaded and shown, one "fallback: forced" per WebGL figure', canv === 0 && bad.length === 0 && posters.length === 6 && sameCounts(per, KIND_COUNT), `canvases ${canv}, posters ${posters.length} (bad: ${bad.join(', ') || 'none'}), logs ${JSON.stringify(per)}`);
  });
  report('fallback ?static=1: no page errors', t.errors.length === 0, t.errors.join(' | '));
  await t.close();
}

async function checkNoWebGL2(url) {
  const browser = await chromium.launch({ headless: true, args: [...ARGS, '--disable-webgl2'] });
  try {
    const t = await open(browser, url);
    const { page } = t;
    await step('fallback --disable-webgl2: no canvases and one "fallback: no-webgl2" per WebGL figure', async () => {
      let canv = 0;
      await scrollThrough(page, 600, 100, async () => {
        canv = Math.max(canv, await page.evaluate(() => document.querySelectorAll('figure.fig canvas').length));
      });
      const per = fallbackLogs(t.logs, 'no-webgl2');
      report('fallback --disable-webgl2: no canvases and one "fallback: no-webgl2" per WebGL figure', canv === 0 && sameCounts(per, KIND_COUNT), `canvases ${canv}, logs ${JSON.stringify(per)}`);
    });
    await t.close();
  } finally {
    await browser.close();
  }
}

async function checkContextLoss(browser, url) {
  const t = await open(browser, url);
  const { page } = t;
  const sel = figSel('iceberg-0');
  await step('context loss: the hero goes back to its poster and logs context-lost', async () => {
    await waitLive(page, 'iceberg-0');
    await page.evaluate((sel) => {
      const c = document.querySelector(sel + ' canvas.fig-canvas');
      (c.getContext('webgl2') || c.getContext('webgl')).getExtension('WEBGL_lose_context').loseContext();
    }, sel);
    await page.waitForFunction((sel) => !document.querySelector(sel).classList.contains('is-live'), sel, { timeout: 5000 });
    await sleep(300);
    const s = await page.evaluate((sel) => {
      const f = document.querySelector(sel);
      const p = f.querySelector('img.fig-poster');
      return { canvases: f.querySelectorAll('canvas').length, hidden: p.getAttribute('aria-hidden'), opacity: getComputedStyle(p).opacity, fb: f.dataset.fallback || '' };
    }, sel);
    const logged = t.logs.filter((l) => l.text === '[fig:iceberg] fallback: context-lost').length;
    const alive = (await gl(page)).alive;
    const holders = liveCount(await canvasCounts(page));
    report('context loss: the hero goes back to its poster and logs context-lost', s.canvases === 0 && s.hidden == null && s.opacity === '1' && s.fb === 'context-lost' && logged === 1 && alive === holders, JSON.stringify({ ...s, logged, contextsAlive: alive, figuresHolding: holders }));
  });
  await step('context loss: the hero comes back live after the 5 s cooldown', async () => {
    await page.waitForFunction((sel) => document.querySelector(sel).classList.contains('is-live'), sel, { timeout: 15000 });
    const f0 = await frames(page, 'iceberg-0');
    await sleep(600);
    const f1 = await frames(page, 'iceberg-0');
    const s = await page.evaluate((sel) => ({ fb: document.querySelector(sel).dataset.fallback || '', canvases: document.querySelectorAll(sel + ' canvas').length }), sel);
    const px = await pixelSpread(page, 'iceberg-0');
    const alive = (await gl(page)).alive;
    const holders = liveCount(await canvasCounts(page));
    report('context loss: the hero comes back live after the 5 s cooldown', f1 > f0 && s.fb === '' && s.canvases === CANVASES.iceberg && px.distinct > 8 && alive === holders, `frames ${f0} -> ${f1}, ${s.canvases} canvases, fallback "${s.fb}", ${px.distinct} colours, ${alive} contexts for ${holders} figures`);
  });
  report('context loss: no page errors', t.errors.length === 0, t.errors.join(' | '));
  reportConsole('context loss: no console errors or WebGL/context warnings', t.logs);
  await t.close();
}

async function checkReduced(browser, url) {
  const t = await open(browser, url, { reducedMotion: 'reduce' });
  const { page } = t;
  await step('reduced motion: no canvases or scrambled labels anywhere, one "fallback: reduced-motion" per WebGL figure', async () => {
    let canv = 0;
    let labels = 0;
    await scrollThrough(page, 300, 120, async () => {
      const r = await page.evaluate(() => ({ c: document.querySelectorAll('figure.fig canvas').length, l: document.querySelectorAll('.ib-label, .ib-label i').length }));
      canv = Math.max(canv, r.c);
      labels = Math.max(labels, r.l);
    });
    const per = fallbackLogs(t.logs, 'reduced-motion');
    report('reduced motion: no canvases or scrambled labels anywhere, one "fallback: reduced-motion" per WebGL figure', canv === 0 && labels === 0 && sameCounts(per, KIND_COUNT), `canvases ${canv}, label cells ${labels}, logs ${JSON.stringify(per)}`);
  });
  await step('reduced motion: the hero poster cross-fades to the under-water one past half the hero, and back', async () => {
    const sel = figSel('iceberg-0');
    const read = () =>
      page.evaluate((sel) => {
        const f = document.querySelector(sel);
        const u = f.querySelector('.fig-poster--under');
        const cs = u && getComputedStyle(u);
        return { under: f.classList.contains('is-under'), opacity: cs?.opacity, dur: cs?.transitionDuration, prop: cs?.transitionProperty, loaded: !!u && u.complete && u.naturalWidth > 0 };
      }, sel);
    await page.evaluate(() => window.__jump(0));
    await sleep(700);
    const top = await read();
    await page.evaluate(() => {
      const h = document.querySelector('.hero');
      const r = h.getBoundingClientRect();
      window.__jump(window.scrollY + r.top + (r.height - innerHeight) * 0.5 + 40);
    });
    await page.waitForTimeout(100);
    const mid = await read(); // 100 ms into a 400 ms fade: on its way, not swapped
    await sleep(700);
    const half = await read();
    await page.evaluate(() => window.__jump(0));
    await sleep(700);
    const back = await read();
    const fading = Number(mid.opacity) > 0 && Number(mid.opacity) < 1;
    report(
      'reduced motion: the hero poster cross-fades to the under-water one past half the hero, and back',
      !top.under && top.opacity === '0' && half.under && half.opacity === '1' && half.loaded && /opacity|all/.test(half.prop) && half.dur === '0.4s' && fading && !back.under && back.opacity === '0',
      `top ${top.opacity}, 100 ms in ${mid.opacity}, half ${half.opacity} (${half.dur}), back ${back.opacity}`,
    );
  });
  await step('reduced motion: the ring cross-fades to each project still on link hover/focus, and back', async () => {
    const sel = figSel('ring-0');
    await scrollToFig(page, 'ring-0');
    await page.waitForFunction((sel) => [...document.querySelectorAll(sel + ' .fig-poster--morph')].every((i) => i.complete && i.naturalWidth > 0) && document.querySelectorAll(sel + ' .fig-poster--morph').length === 3, sel, { timeout: 10000 });
    const op = () => page.evaluate((sel) => [...document.querySelectorAll(sel + ' .fig-poster--morph')].map((i) => getComputedStyle(i).opacity).join(','), sel);
    const dur = await page.evaluate((sel) => getComputedStyle(document.querySelector(sel + ' .fig-poster--morph')).transitionDuration, sel);
    const out = [];
    const rest = await op();
    for (const i of [0, 1, 2]) {
      await page.hover(`[data-morph="${i}"]`);
      await sleep(700);
      out.push(`hover ${i}: ${await op()}`);
    }
    await page.mouse.move(5, 5);
    await sleep(700);
    const left = await op();
    await page.focus('[data-morph="1"]');
    await sleep(700);
    const focus1 = await op();
    await page.hover('[data-morph="2"]'); // hover wins over focus
    await sleep(700);
    const both = await op();
    await page.mouse.move(5, 5); // leaving shows the focused link's still again
    await sleep(700);
    const backToFocus = await op();
    await page.evaluate(() => document.activeElement.blur());
    await sleep(700);
    const blurred = await op();
    const ok =
      rest === '0,0,0' &&
      out.join('|') === 'hover 0: 1,0,0|hover 1: 0,1,0|hover 2: 0,0,1' &&
      left === '0,0,0' &&
      focus1 === '0,1,0' &&
      both === '0,0,1' &&
      backToFocus === '0,1,0' &&
      blurred === '0,0,0' &&
      dur === '0.4s';
    report('reduced motion: the ring cross-fades to each project still on link hover/focus, and back', ok, `rest ${rest}; ${out.join('; ')}; left ${left}; focus 1 ${focus1}; hover 2 + focus 1 ${both}; leave ${backToFocus}; blur ${blurred}; ${dur}`);
  });
  report('reduced motion: no page errors', t.errors.length === 0, t.errors.join(' | '));
  await t.close();
}

async function checkEmail(browser, url) {
  const email = content.email;
  const statuses = (page) => page.evaluate(() => [...document.querySelectorAll('[data-copy-status]')].map((s) => s.textContent).join('|'));
  const quiet = (page) =>
    page.evaluate(() => {
      document.querySelectorAll('[data-copy-status]').forEach((s) => (s.textContent = ''));
      window.getSelection().removeAllRanges();
    });
  {
    const t = await open(browser, url, { permissions: ['clipboard-read', 'clipboard-write'] });
    const { page } = t;
    await step('email: clicking the address copies it and says "Copied"', async () => {
      await page.click('.bar [data-copy-email]');
      await sleep(150);
      const status = await page.textContent('.bar [data-copy-status]');
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      report('email: clicking the address copies it and says "Copied"', status === 'Copied' && clip === email, `status "${status}", clipboard "${clip}"`);
    });
    await step('email: pressing e anywhere copies it', async () => {
      await page.evaluate(() => navigator.clipboard.writeText('x'));
      await sleep(1800); // the first status clears
      await page.click('h1');
      await page.keyboard.press('e');
      await sleep(150);
      const status = await page.evaluate(() => [...document.querySelectorAll('[data-copy-status]')].map((s) => s.textContent).join('|'));
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      report('email: pressing e anywhere copies it', /Copied/.test(status) && clip === email, `status "${status}", clipboard "${clip}"`);
    });
    const negName = 'email: e with Ctrl, Meta or Alt, a held (repeat) e, and e typed in an input or a contenteditable do not copy';
    await step(negName, async () => {
      await sleep(1800);
      await page.evaluate(() => {
        const i = document.createElement('input');
        i.id = '__chk-input';
        const d = document.createElement('div');
        d.id = '__chk-edit';
        d.contentEditable = 'true';
        d.textContent = 'note';
        document.body.append(i, d);
      });
      const cases = [
        ['Control+e', () => page.keyboard.press('Control+e')],
        ['Meta+e', () => page.keyboard.press('Meta+e')],
        ['Alt+e', () => page.keyboard.press('Alt+e')],
        ['repeat', () => page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', repeat: true, bubbles: true })))],
        ['input', async () => (await page.focus('#__chk-input'), page.keyboard.press('e'))],
        ['contenteditable', async () => (await page.focus('#__chk-edit'), page.keyboard.press('e'))],
      ];
      const out = [];
      for (const [name, act] of cases) {
        await page.click('h1');
        await page.evaluate(() => navigator.clipboard.writeText('x'));
        await quiet(page);
        await act();
        await sleep(200);
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        const status = await statuses(page);
        out.push({ name, ok: clip === 'x' && status.replace(/\|/g, '') === '', clip, status });
      }
      const bad = out.filter((o) => !o.ok);
      report(negName, bad.length === 0, bad.length ? bad.map((o) => `${o.name}: clipboard "${o.clip}", status "${o.status}"`).join('; ') : out.map((o) => o.name).join(', ') + ': clipboard kept, no status');
    });
    await t.close();
  }
  {
    // A denied write: Chromium cannot be told to deny clipboard-write, so the API rejects as it does then.
    const deny = () => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError')) }, configurable: true });
    };
    const t = await open(browser, url, {}, { init: deny });
    const { page } = t;
    const keyName = 'email: a denied clipboard, from the e key, says "Press Ctrl+C to copy" and selects the address';
    await step(keyName, async () => {
      await page.click('h1');
      await quiet(page);
      await page.keyboard.press('e');
      await sleep(150);
      const status = await statuses(page);
      const sel = await page.evaluate(() => String(window.getSelection()));
      report(keyName, status.split('|').includes('Press Ctrl+C to copy') && sel === email, `status "${status}", selection "${sel}"`);
    });
    const btnName = 'email: a denied clipboard, from the button, says "Press Ctrl+C to copy" and selects the address';
    await step(btnName, async () => {
      await quiet(page);
      await page.click('.bar [data-copy-email]');
      await sleep(150);
      const status = await page.textContent('.bar [data-copy-status]');
      const sel = await page.evaluate(() => String(window.getSelection()));
      report(btnName, status === 'Press Ctrl+C to copy' && sel === email, `status "${status}", selection "${sel}"`);
    });
    await t.close();
  }
}

async function checkPhone(browser, url) {
  const t = await open(browser, url, { viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { page } = t;
  await step('390x844: no horizontal scroll at top, middle and bottom', async () => {
    const out = [];
    for (const where of ['top', 'middle', 'bottom']) {
      await page.evaluate((w) => {
        const max = document.documentElement.scrollHeight - innerHeight;
        window.__jump(w === 'top' ? 0 : w === 'middle' ? max / 2 : max);
      }, where);
      await sleep(1500);
      out.push([where, await page.evaluate(() => document.documentElement.scrollWidth)]);
    }
    report('390x844: no horizontal scroll at top, middle and bottom', out.every(([, w]) => w <= 390), out.map(([a, b]) => `${a} ${b}`).join(', '));
  });
  report('390x844: no page errors', t.errors.length === 0, t.errors.join(' | '));
  await t.close();
}

// The label is laid out from the block's live anchor (the leader's last point). Recomputing the layout
// from that anchor and the stage's current width must land on the label's actual position.
async function labelState(page, id) {
  return page.evaluate((sel) => {
    const st = document.querySelector(sel + ' .fig-stage');
    const ln = st.querySelector('.ib-ln');
    const lab = st.querySelector('.ib-label');
    if (!ln || !lab) return null;
    const pts = ln.getAttribute('points').split(' ').map((p) => p.split(',').map(Number));
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(lab.style.transform);
    return { w: st.clientWidth, h: st.clientHeight, anchor: pts[2], text: m ? [Number(m[1]), Number(m[2])] : null, px: parseFloat(lab.style.fontSize) };
  }, figSel(id));
}
function misalignment(s, chars) {
  if (!s || !s.text) return Infinity;
  const g = labelGeometry({ anchor: { x: s.anchor[0], y: s.anchor[1] }, w: s.w, chars });
  const inside = s.anchor[0] >= 0 && s.anchor[0] <= s.w && s.anchor[1] >= 0 && s.anchor[1] <= s.h;
  if (!inside || g.px !== s.px) return Infinity;
  return Math.hypot(g.x - s.text[0], g.y - s.text[1]);
}

// Every live figure's canvases must cover its stage exactly, with a backing store at a pixel ratio the
// figures use (1, 1.5 or 2, never above the device's), so a resize that skipped a figure shows up here.
function canvasFit(page) {
  return page.evaluate(() => {
    const out = [];
    for (const f of document.querySelectorAll('figure.fig.is-live')) {
      const st = f.querySelector('.fig-stage');
      const sr = st.getBoundingClientRect();
      for (const c of st.querySelectorAll('canvas.fig-canvas')) {
        const r = c.getBoundingClientRect();
        const off = Math.max(Math.abs(r.left - sr.left), Math.abs(r.top - sr.top), Math.abs(r.width - sr.width), Math.abs(r.height - sr.height));
        const ratios = [1, 1.5, 2].filter((k) => k <= devicePixelRatio + 1e-6);
        const backingOk = ratios.some((k) => Math.abs(c.width - c.clientWidth * k) <= 2 && Math.abs(c.height - c.clientHeight * k) <= 2);
        out.push({ id: f.dataset.figId, off, backingOk, backing: `${c.width}x${c.height} for ${c.clientWidth}x${c.clientHeight}` });
      }
    }
    return out;
  });
}

async function checkResize(browser, url) {
  const blocks = content.sections.slice(0, 3).map((sec, i) => ({ id: 'iceblock-' + i, chars: sec.entries[0].fig.data.label.length }));
  const t = await open(browser, url, { viewport: PHONE, deviceScaleFactor: 2, hasTouch: true });
  const { page } = t;
  const labels = [];
  const fits = [];
  const widths = [];
  await step('resize 390 <-> 844 wide', async () => {
    for (const vp of [PHONE, { width: 844, height: 390 }, PHONE]) {
      await page.setViewportSize(vp);
      await sleep(300);
      for (const { id, chars } of blocks) {
        await scrollToFig(page, id);
        await waitLive(page, id);
        await sleep(1500); // the label's lag settles
        const s = await labelState(page, id);
        labels.push({ at: `${vp.width} ${id}`, stage: s && s.w, off: misalignment(s, chars) });
        for (const c of await canvasFit(page)) fits.push({ at: vp.width, ...c });
      }
      for (const where of [0, 0.5, 1]) {
        await page.evaluate((k) => window.__jump((document.documentElement.scrollHeight - innerHeight) * k), where);
        await sleep(400);
        widths.push({ at: vp.width, where, ...(await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }))) });
      }
    }
  });
  report('resize 390 <-> 844 wide: every ice block label stays within 8 px of its block anchor', labels.length === 9 && labels.every((o) => o.off <= 8), labels.map((o) => `${o.at} (stage ${o.stage}): ${o.off === Infinity ? 'misplaced' : o.off.toFixed(1) + ' px'}`).join(', '));
  const badFit = fits.filter((f) => !(f.off <= 1) || !f.backingOk);
  report('resize 390 <-> 844 wide: every live canvas covers its stage within 1 px with a matching backing store', fits.length > 0 && badFit.length === 0, badFit.length ? badFit.slice(0, 4).map((f) => `${f.at} ${f.id}: off ${f.off.toFixed(1)} px, ${f.backing}`).join('; ') : `${fits.length} canvas samples across ${new Set(fits.map((f) => f.id)).size} figures`);
  report('resize 390 <-> 844 wide: no horizontal scroll at 844 and after returning to 390', widths.length === 9 && widths.every((w) => w.sw <= w.iw), widths.map((w) => `${w.at}@${w.where}: ${w.sw}/${w.iw}`).join(', '));
  report('resize: no page errors', t.errors.length === 0, t.errors.join(' | '));
  await t.close();
}

/* ── run ── */

if (!argv.has('--no-build')) build();
const server = await startPreview(4319);
const browser = await chromium.launch({ headless: true, args: ARGS });
const started = Date.now();
try {
  const url = server.url;
  const gpu = await (async () => {
    const p = await browser.newPage();
    const r = await p.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const e = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return gl ? (e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'webgl2') : 'no webgl2';
    });
    await p.close();
    return r;
  })();
  console.log(`renderer: ${gpu}\n`);
  await checkLive(browser, url);
  await checkBudget(browser, url);
  await checkRaces(browser, url);
  await checkStatic(browser, url);
  await checkNoWebGL2(url);
  await checkContextLoss(browser, url);
  await checkReduced(browser, url);
  await checkEmail(browser, url);
  await checkPhone(browser, url);
  await checkResize(browser, url);
} finally {
  await browser.close();
  server.stop();
}
console.log(`\n${passes} passed, ${fails} failed in ${((Date.now() - started) / 1000).toFixed(0)} s`);
if (allPageErrors.length) console.log('page errors:\n  ' + allPageErrors.join('\n  '));
process.exit(fails ? 1 : 0);
