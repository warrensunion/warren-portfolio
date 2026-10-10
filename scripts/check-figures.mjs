// The figure host's promises (live scenes that really draw, at most three WebGL contexts, scenes that
// stop off screen, posters and a logged reason whenever a scene is not allowed, recovery from a lost
// context, a still page under reduced motion) and the email copy and phone layout only hold in a real
// browser, so this drives the built page in Chromium and prints PASS/FAIL per promise. Exit code 1 on
// any FAIL. Usage: npm run check [-- --no-build] [-- --swiftshader] [-- --only=tracks,static]
import { chromium } from 'playwright';
import { build, GPU_ARGS, startPreview, root } from './lib/preview.mjs';
import { content } from '../src/content.js';
import { deskProgress, stageFor } from '../src/figures/track-math.js';
import { gradeFor } from '../src/figures/howpolluted/grades.js';

const argv = new Set(process.argv.slice(2));
const ARGS = argv.has('--swiftshader') ? [] : GPU_ARGS;
// --only=tracks,budget runs just those checks (names in `checks` at the bottom).
const only = ([...argv].find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
// The live WebGL figures on the page today. Each later plan appends its track figure's id here (and its
// kind to KIND_COUNT and CANVASES) as its demo lands.
const WEBGL_IDS = ['iceberg-0', 'ring-0', 'howpolluted-0', 'archer-0', 'terrarium-0'];
const KIND_COUNT = { iceberg: 1, ring: 1, howpolluted: 1, archer: 1, terrarium: 1 }; // WebGL figures per kind: one fallback log each
// The capture figures (clips, no WebGL of their own) fall back too: both under ?static=1 and reduced
// motion, and bcwc also without WebGL2, since its live stage frames a WebGL site (env.js).
const STILLED = { ...KIND_COUNT, bcwc: 1, bttr: 1 };
const NO_GL2 = { ...KIND_COUNT, bcwc: 1 };
const CANVASES = { iceberg: 2, ring: 1, howpolluted: 2, archer: 1, terrarium: 4 }; // the iceberg's scene plus its 2D overlay; the globe plus the 2D litter scene; the jar plus its river and two brains
// Kinds that hold a WebGL context once live (env.js WEIGHTS > 0), whether their demo has landed or not.
const WEBGL_KINDS = ['iceberg', 'ring', 'terrarium', 'howpolluted', 'archer'];
const DESK = { width: 1440, height: 900 };
const WIDE = { width: 1920, height: 1080 };
const PHONE = { width: 390, height: 844 };
const PHONE_OPTS = { viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const STICKY_TOP = 96; // layout.css: the track text and figure stick here

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
  page.evaluate(
    (kinds) =>
      Object.fromEntries(
        [...document.querySelectorAll('figure.fig[data-fig-id]')]
          .filter((f) => kinds.includes(f.dataset.fig))
          .map((f) => [f.dataset.figId, f.querySelectorAll('canvas').length]),
      ),
    WEBGL_KINDS,
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
    const id = 'ring-0'; // the hero sits at the page top, so it can never be below the viewport
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
  const name = 'budget: at most 3 live WebGL figures, 3 WebGL contexts and a host weight of 3 at every 200 px step, top to bottom and back';
  await step(name, async () => {
    let worst = 0;
    let where = 0;
    let worstGl = 0;
    let whereGl = 0;
    let worstW = 0;
    let whereW = 0;
    let badW = null;
    const each = async (y) => {
      const n = liveCount(await canvasCounts(page));
      if (n > worst) [worst, where] = [n, y];
      const g = await gl(page);
      if (g.alive > worstGl) [worstGl, whereGl] = [g.alive, y];
      const w = await page.evaluate(() => (typeof window.__figWeight === 'function' ? window.__figWeight() : NaN));
      if (!Number.isFinite(w)) badW = badW ?? `__figWeight() gave ${w} at ${y}`;
      else if (w > worstW) [worstW, whereW] = [w, y];
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
    report(name, worst <= 3 && worstGl <= 3 && peak <= 3 && worstW <= 3 && !badW, `figures max ${worst} at ${where}; contexts max ${worstGl} at ${whereGl}, peak at any creation ${peak}; weight max ${worstW} at ${whereW}${badW ? '; ' + badW : ''}`);
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
    await settle('the hero', 'iceberg-0');
  });
  report('races: no page errors and no failed figures', t.errors.length === 0 && !t.logs.some((l) => /fallback: error/.test(l.text)), t.errors.join(' | '));
  reportConsole('races: no console errors or WebGL/context warnings', t.logs);
  await t.close();
}

// Without JavaScript the page is the static markup and reads like a document: every track lays all its
// stage stills out in flow, one under the other, with nothing to walk them (no stage buttons), and every
// other figure keeps its poster.
async function checkNoJS(browser, url) {
  const context = await browser.newContext({ viewport: DESK, deviceScaleFactor: 1, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    const name = 'no JavaScript: every track shows all its stage stills in flow with the stage buttons hidden, every figure keeps its poster';
    await step(name, async () => {
      // Locators, not $$eval: they run in Playwright's own world, so they work with page JS off.
      const out = [];
      const tracks = await page.locator('article.track[data-track]').all();
      for (const t of tracks) {
        const id = await t.getAttribute('id');
        const n = Number(/--stages:\s*(\d+)/.exec((await t.getAttribute('style')) || '')?.[1]);
        const stills = await t.locator('.fig-still[data-stage]').all();
        const boxes = [];
        for (const s of stills) {
          // Boxes are viewport-relative even off screen, so the page stays put and they compare.
          boxes.push({ box: await s.boundingBox(), opacity: await s.evaluate((e) => getComputedStyle(e).opacity) });
        }
        // In flow: each still has a size, is opaque, and starts below the one before it.
        const flowed = boxes.every((b, i) => b.box && b.box.height > 20 && b.opacity === '1' && (i === 0 || b.box.y >= boxes[i - 1].box.y + boxes[i - 1].box.height - 1));
        const buttons = await t.locator('.fig-stages').isVisible();
        out.push({ id, ok: stills.length === n && n > 0 && flowed && !buttons, why: `${stills.length}/${n} stills${flowed ? '' : ', not in flow'}${buttons ? ', stage buttons shown' : ''}` });
      }
      const posters = await page.locator('img.fig-poster:not(.fig-still)').count();
      const bad = out.filter((o) => !o.ok);
      report(name, tracks.length === 5 && bad.length === 0 && posters >= 3, `${tracks.length} tracks${bad.length ? ', bad: ' + bad.map((o) => `${o.id} ${o.why}`).join('; ') : ', every still in flow'}; ${posters} other posters`);
    });
  } finally {
    await context.close();
  }
}

async function checkStatic(browser, url) {
  const t = await open(browser, url + '?static=1');
  const { page } = t;
  // The shown poster of every figure: its single poster, or a track's current stage still (the others
  // sit under it at opacity 0 until their stage comes up; checkTracks walks them).
  const SHOWN = 'img.fig-poster:not(.fig-poster--morph):not(.fig-poster--under):not(.fig-still), img.fig-still.is-on';
  const name = 'fallback ?static=1: no canvases, every poster and current stage still loaded and shown, one "fallback: forced" per WebGL and capture figure';
  await step(name, async () => {
    let canv = 0;
    await scrollThrough(page, 500, 120, async () => {
      canv = Math.max(canv, await page.evaluate(() => document.querySelectorAll('figure.fig canvas').length));
    });
    await page.waitForFunction((sel) => [...document.querySelectorAll(sel)].every((i) => i.complete), SHOWN, { timeout: 15000 });
    await sleep(600); // a stage still that just came on is past its 400 ms fade
    const posters = await page.evaluate(
      (sel) => [...document.querySelectorAll(sel)].map((i) => ({ src: i.getAttribute('src'), ok: i.naturalWidth > 0 && getComputedStyle(i).opacity === '1' && i.getBoundingClientRect().height > 0 })),
      SHOWN,
    );
    const per = fallbackLogs(t.logs, 'forced');
    const bad = posters.filter((p) => !p.ok).map((p) => p.src);
    report(name, canv === 0 && bad.length === 0 && posters.length === 8 && sameCounts(per, STILLED), `canvases ${canv}, posters ${posters.length} (bad: ${bad.join(', ') || 'none'}), logs ${JSON.stringify(per)}`);
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
      report('fallback --disable-webgl2: no canvases and one "fallback: no-webgl2" per WebGL figure', canv === 0 && sameCounts(per, NO_GL2), `canvases ${canv}, logs ${JSON.stringify(per)}`);
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
  await step('reduced motion: no canvases or iframes anywhere, one "fallback: reduced-motion" per WebGL and capture figure', async () => {
    let canv = 0;
    let frames = 0;
    await scrollThrough(page, 300, 120, async () => {
      const r = await page.evaluate(() => ({ c: document.querySelectorAll('figure.fig canvas').length, f: document.querySelectorAll('figure.fig iframe').length }));
      canv = Math.max(canv, r.c);
      frames = Math.max(frames, r.f);
    });
    const per = fallbackLogs(t.logs, 'reduced-motion');
    report('reduced motion: no canvases or iframes anywhere, one "fallback: reduced-motion" per WebGL figure', canv === 0 && frames === 0 && sameCounts(per, STILLED), `canvases ${canv}, iframes ${frames}, logs ${JSON.stringify(per)}`);
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
    // One still per project link in the contact copy.
    const n = await page.evaluate(() => document.querySelectorAll('[data-morph]').length);
    const vec = (on) => Array.from({ length: n }, (_, k) => (k === on ? 1 : 0)).join(',');
    await page.waitForFunction(([sel, n]) => [...document.querySelectorAll(sel + ' .fig-poster--morph')].every((i) => i.complete && i.naturalWidth > 0) && document.querySelectorAll(sel + ' .fig-poster--morph').length === n, [sel, n], { timeout: 10000 });
    const op = () => page.evaluate((sel) => [...document.querySelectorAll(sel + ' .fig-poster--morph')].map((i) => getComputedStyle(i).opacity).join(','), sel);
    const dur = await page.evaluate((sel) => getComputedStyle(document.querySelector(sel + ' .fig-poster--morph')).transitionDuration, sel);
    const out = [];
    const rest = await op();
    for (let i = 0; i < n; i++) {
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
    await page.hover(`[data-morph="${n - 1}"]`); // hover wins over focus
    await sleep(700);
    const both = await op();
    await page.mouse.move(5, 5); // leaving shows the focused link's still again
    await sleep(700);
    const backToFocus = await op();
    await page.evaluate(() => document.activeElement.blur());
    await sleep(700);
    const blurred = await op();
    const ok =
      n >= 3 &&
      rest === vec(-1) &&
      out.join('|') === Array.from({ length: n }, (_, i) => `hover ${i}: ${vec(i)}`).join('|') &&
      left === vec(-1) &&
      focus1 === vec(1) &&
      both === vec(n - 1) &&
      backToFocus === vec(1) &&
      blurred === vec(-1) &&
      dur === '0.4s';
    report('reduced motion: the ring cross-fades to each project still on link hover/focus, and back', ok, `rest ${rest}; ${out.join('; ')}; left ${left}; focus 1 ${focus1}; hover ${n - 1} + focus 1 ${both}; leave ${backToFocus}; blur ${blurred}; ${dur}`);
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

// At 390 the bar's button is hidden, so a denied copy prompts beside the contact section's button.
async function checkPhoneDenied(browser, url) {
  const deny = () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError')) }, configurable: true });
  };
  const t = await open(browser, url, { viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, { init: deny });
  const { page } = t;
  const name = '390x844: a denied copy from the contact button prompts inside the viewport, selects the address, no horizontal scroll';
  await step(name, async () => {
    const btn = page.locator('.touch-email [data-copy-email]');
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await sleep(200);
    const r = await page.evaluate(() => {
      const s = document.querySelector('.touch-email [data-copy-status]');
      const b = document.querySelector('.touch-email [data-copy-email]');
      const sr = s.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return { text: s.textContent, left: sr.left, right: sr.right, top: sr.top, btnBottom: br.bottom, sel: String(window.getSelection()), sw: document.documentElement.scrollWidth };
    });
    if (process.env.CHECK_SHOT) await page.screenshot({ path: process.env.CHECK_SHOT });
    const ok = r.text === 'Press Ctrl+C to copy' && r.left >= 0 && r.right <= 390 && r.sw <= 390 && r.sel === content.email;
    report(name, ok, `status "${r.text}" at x ${r.left.toFixed(0)}..${r.right.toFixed(0)} (${r.top >= r.btnBottom - 1 ? 'own line' : 'beside the button'}), selection "${r.sel}", scrollWidth ${r.sw}`);
  });
  report('390x844 denied copy: no page errors', t.errors.length === 0, t.errors.join(' | '));
  await t.close();
}

async function checkPhone(browser, url) {
  const t = await open(browser, url, PHONE_OPTS);
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
  const t = await open(browser, url, { viewport: PHONE, deviceScaleFactor: 2, hasTouch: true });
  const { page } = t;
  const fits = [];
  const widths = [];
  await step('resize 390 <-> 844 wide', async () => {
    for (const vp of [PHONE, { width: 844, height: 390 }, PHONE]) {
      await page.setViewportSize(vp);
      await sleep(300);
      for (const id of WEBGL_IDS) {
        await scrollToFig(page, id);
        await waitLive(page, id);
        await sleep(600);
        for (const c of await canvasFit(page)) fits.push({ at: vp.width, ...c });
      }
      for (const where of [0, 0.5, 1]) {
        await page.evaluate((k) => window.__jump((document.documentElement.scrollHeight - innerHeight) * k), where);
        await sleep(400);
        widths.push({ at: vp.width, where, ...(await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }))) });
      }
    }
  });
  const badFit = fits.filter((f) => !(f.off <= 1) || !f.backingOk);
  report('resize 390 <-> 844 wide: every live canvas covers its stage within 1 px with a matching backing store', fits.length > 0 && badFit.length === 0, badFit.length ? badFit.slice(0, 4).map((f) => `${f.at} ${f.id}: off ${f.off.toFixed(1)} px, ${f.backing}`).join('; ') : `${fits.length} canvas samples across ${new Set(fits.map((f) => f.id)).size} figures`);
  report('resize 390 <-> 844 wide: no horizontal scroll at 844 and after returning to 390', widths.length === 9 && widths.every((w) => w.sw <= w.iw), widths.map((w) => `${w.at}@${w.where}: ${w.sw}/${w.iw}`).join(', '));
  report('resize: no page errors', t.errors.length === 0, t.errors.join(' | '));
  await t.close();
}

/* ── tracks (spec 3 and 9) ── */

// In-page helpers, installed per page. Every track's geometry is read fresh from rects, and the stage
// offset is the same formula tracks.js scrolls a stage button to (railDocTop - 96 + pad * i / (n - 1)).
function trackHelpers(top) {
  const q = (id) => {
    const el = document.getElementById(id);
    const rail = el.querySelector('.track-rail');
    const fig = rail.querySelector('figure');
    const n = el.querySelectorAll('.fig-stages button[data-stage]').length;
    const rr = rail.getBoundingClientRect();
    const pad = Math.max(0, rr.height - fig.getBoundingClientRect().height);
    return { el, rail, fig, n, pad, railTop: rr.top, railDocTop: rr.top + scrollY };
  };
  window.__track = q;
  window.__trackIds = () => [...document.querySelectorAll('article.track[data-track]')].map((t) => t.id);
  window.__stageY = (id, i) => {
    const t = q(id);
    return t.railDocTop - top + (t.n > 1 ? (t.pad * i) / (t.n - 1) : 0);
  };
  window.__stillState = (id) => {
    const el = document.getElementById(id);
    const on = [...el.querySelectorAll('.fig-still.is-on')].map((s) => Number(s.dataset.stage));
    return { stage: el.dataset.stage, on };
  };
}

const twoFrames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// Desktop: walk one track in 40 px steps from a viewport above its rail to a viewport below it, all in
// one evaluate (an instant scrollTo then a rect read is a fresh layout, sticky offsets included). Three
// phases by where the track's content box is: before the text reaches 96 it sits at the content top;
// while pinned it is at 96; once its bottom meets the content bottom it rides that bottom out. And it
// never overlaps the next track's text.
function walkTrack(page, id) {
  return page.evaluate(
    ([id, top96]) => {
      const { el, rail, fig } = window.__track(id);
      const text = el.querySelector('.track-text');
      // Text taller than the room under 96 px sticks higher, so its bottom stays on screen (layout.css).
      const top = parseFloat(getComputedStyle(text).top);
      if (!(top <= top96 + 0.5)) return { n: { samples: 0 }, bad: ['sticky top ' + top + ' above ' + top96] };
      const all = [...document.querySelectorAll('article.track[data-track]')];
      const next = all[all.indexOf(el) + 1]?.querySelector('.track-text') || null;
      const cs = getComputedStyle(el);
      const pt = parseFloat(cs.paddingTop);
      const pb = parseFloat(cs.paddingBottom);
      const r0 = rail.getBoundingClientRect();
      const from = Math.max(0, scrollY + r0.top - innerHeight);
      const to = scrollY + r0.bottom + innerHeight;
      const n = { before: 0, pinned: 0, after: 0, samples: 0 };
      const bad = [];
      let lastY = -1;
      for (let y = from; y <= to; y += 40) {
        window.__jump(y);
        if (scrollY === lastY) continue; // clamped at the page end
        lastY = scrollY;
        n.samples++;
        const t = el.getBoundingClientRect();
        const tx = text.getBoundingClientRect();
        const f = fig.getBoundingClientRect();
        const cTop = t.top + pt;
        const cBottom = t.bottom - pb;
        const figOn = f.bottom > 0 && f.top < innerHeight;
        if (cTop > top + 1) {
          n.before++;
          if (Math.abs(tx.top - cTop) > 1) bad.push(`y ${y}: before pin, text top ${tx.top.toFixed(1)} vs content top ${cTop.toFixed(1)}`);
        } else if (tx.bottom < cBottom - 1) {
          if (figOn) {
            n.pinned++;
            if (Math.abs(tx.top - top) > 1) bad.push(`y ${y}: pinned, text top ${tx.top.toFixed(1)} vs sticky top ${top.toFixed(1)}`);
            if (tx.bottom > innerHeight + 0.5) bad.push(`y ${y}: pinned text runs off screen, bottom ${tx.bottom.toFixed(1)} > ${innerHeight}`);
          }
        } else {
          n.after++;
          if (Math.abs(tx.bottom - cBottom) > 1) bad.push(`y ${y}: released, text bottom ${tx.bottom.toFixed(1)} vs content bottom ${cBottom.toFixed(1)}`);
        }
        if (next && next.getBoundingClientRect().top < tx.bottom - 0.5) bad.push(`y ${y}: overlaps the next track's text by ${(tx.bottom - next.getBoundingClientRect().top).toFixed(1)} px`);
      }
      return { n, bad };
    },
    [id, STICKY_TOP],
  );
}

const noSideways = (page) =>
  page.evaluate(async () => {
    const out = [];
    for (const k of [0, 0.5, 1]) {
      window.__jump((document.documentElement.scrollHeight - innerHeight) * k);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      out.push({ k, sw: document.documentElement.scrollWidth, iw: innerWidth });
    }
    return out;
  });

// Jump to each stage's offset in each track and read the stills back: exactly one on, the stage's own.
async function walkStages(page, ids) {
  const bad = [];
  let count = 0;
  for (const id of ids) {
    const n = await page.evaluate((id) => window.__track(id).n, id);
    for (let i = 0; i < n; i++) {
      await page.evaluate(([id, i]) => window.__jump(window.__stageY(id, i)), [id, i]);
      // Its rAF loop runs while the track is on screen; the observer may need a frame to say so.
      await page.waitForFunction(([id, i]) => document.getElementById(id).dataset.stage === String(i), [id, i], { timeout: 1500 }).catch(() => {});
      const s = await page.evaluate((id) => window.__stillState(id), id);
      count++;
      if (!(s.stage === String(i) && s.on.length === 1 && s.on[0] === i)) bad.push(`${id} stage ${i}: data-stage ${s.stage}, on [${s.on}]`);
    }
  }
  return { bad, count };
}

async function checkTracks(browser, url) {
  for (const [label, opts] of [
    ['1440x900', { viewport: DESK }],
    ['1920x1080', { viewport: WIDE }],
    ['1366x768', { viewport: { width: 1366, height: 768 } }],
    ['1280x640', { viewport: { width: 1280, height: 640 } }],
    ['390x844', PHONE_OPTS],
  ]) {
    const desk = opts.viewport.width >= 860;
    const t = await open(browser, url, opts);
    const { page } = t;
    await page.evaluate(trackHelpers, STICKY_TOP);
    const ids = await page.evaluate(() => window.__trackIds());
    if (desk) {
      for (const id of ids) {
        const name = `tracks ${label}: ${id} text sticks at 96 while its figure is pinned, releases with the content bottom, never overlaps the next`;
        await step(name, async () => {
          const r = await walkTrack(page, id);
          report(name, r.bad.length === 0 && r.n.pinned > 0 && r.n.after > 0, r.bad.length ? r.bad.slice(0, 3).join('; ') + (r.bad.length > 3 ? ` (+${r.bad.length - 3} more)` : '') : `${r.n.samples} samples: ${r.n.before} before, ${r.n.pinned} pinned, ${r.n.after} released`);
        });
      }
      const plate = `tracks ${label}: every pinned track figure (plate) fits on screen at its first, middle and last stage`;
      await step(plate, async () => {
        const out = [];
        for (const id of ids) {
          const n = await page.evaluate((id) => window.__track(id).n, id);
          for (const i of [...new Set([0, Math.floor((n - 1) / 2), n - 1])]) {
            await page.evaluate(([id, i]) => window.__jump(window.__stageY(id, i)), [id, i]);
            const r = await page.evaluate((id) => {
              const f = window.__track(id).fig.getBoundingClientRect();
              return { top: f.top, bottom: f.bottom, vh: innerHeight };
            }, id);
            out.push({ at: `${id}@${i}`, ...r, ok: Math.abs(r.top - STICKY_TOP) <= 1 && r.bottom <= r.vh });
          }
        }
        const bad = out.filter((o) => !o.ok);
        report(plate, bad.length === 0, bad.length ? bad.map((o) => `${o.at}: ${o.top.toFixed(0)}..${o.bottom.toFixed(0)} of ${o.vh}`).join('; ') : out.map((o) => `${o.at} bottom ${o.bottom.toFixed(0)}`).join(', '));
      });
    } else {
      const name = `tracks ${label}: every track text is static with its figure below it`;
      await step(name, async () => {
        const r = await page.evaluate((ids) =>
          ids.map((id) => {
            const { el, fig } = window.__track(id);
            const tx = el.querySelector('.track-text');
            return { id, pos: getComputedStyle(tx).position, below: fig.getBoundingClientRect().top >= tx.getBoundingClientRect().bottom };
          }),
        ids);
        const bad = r.filter((o) => o.pos !== 'static' || !o.below);
        report(name, r.length === 5 && bad.length === 0, bad.length ? bad.map((o) => `${o.id}: ${o.pos}, figure ${o.below ? 'below' : 'not below'}`).join('; ') : `${r.length} tracks`);
      });
    }
    const side = `tracks ${label}: no horizontal scroll at top, middle and bottom`;
    await step(side, async () => {
      const w = await noSideways(page);
      report(side, w.every((o) => o.sw <= o.iw), w.map((o) => `${o.k}: ${o.sw}/${o.iw}`).join(', '));
    });
    report(`tracks ${label}: no page errors`, t.errors.length === 0, t.errors.join(' | '));
    await t.close();

    if (!desk) continue;
    // ?static=1: no live scene anywhere, the stills alone walk the stages.
    {
      const s = await open(browser, url + '?static=1', opts);
      await s.page.evaluate(trackHelpers, STICKY_TOP);
      const name = `tracks ${label} ?static=1: at each stage's scroll offset exactly one still is on, that stage's`;
      await step(name, async () => {
        const r = await walkStages(s.page, ids);
        report(name, r.bad.length === 0 && r.count > 0, r.bad.slice(0, 4).join('; ') || `${r.count} stages across ${ids.length} tracks`);
      });
      report(`tracks ${label} ?static=1: no page errors`, s.errors.length === 0, s.errors.join(' | '));
      await s.close();
    }
  }

  // Reduced motion: the stills follow scroll just the same, and a stage button jumps there at once.
  {
    const t = await open(browser, url, { reducedMotion: 'reduce' });
    const { page } = t;
    await page.evaluate(trackHelpers, STICKY_TOP);
    const ids = await page.evaluate(() => window.__trackIds());
    const name = 'tracks reduced motion: at each stage\'s scroll offset exactly one still is on, that stage\'s';
    await step(name, async () => {
      const r = await walkStages(page, ids);
      report(name, r.bad.length === 0 && r.count > 0, r.bad.slice(0, 4).join('; ') || `${r.count} stages across ${ids.length} tracks`);
    });
    const click = 'tracks reduced motion: a stage button sets that stage within 2 frames, by an instant (not smooth) jump';
    await step(click, async () => {
      const out = [];
      for (const id of ids) {
        const n = await page.evaluate((id) => window.__track(id).n, id);
        // A tabbed track shows only its current tab's stage buttons; its tabs are the buttons to click.
        const tabStarts = await page.evaluate((id) => [...document.querySelectorAll(`#${id} .fig-tabs button[data-stage]`)].map((b) => Number(b.dataset.stage)), id);
        const picks = tabStarts.length ? [tabStarts[tabStarts.length - 1], tabStarts[Math.floor(tabStarts.length / 2)]] : [n - 1, Math.floor(n / 2)];
        for (const i of picks) {
          await page.evaluate((id) => window.__jump(window.__stageY(id, 0)), id);
          await twoFrames(page);
          const y0 = await page.evaluate(() => scrollY);
          await page.locator(`#${id} :is(.fig-stages, .fig-tabs) button[data-stage="${i}"]:visible`).first().click();
          const y1 = await page.evaluate(() => scrollY);
          await sleep(50);
          const y2 = await page.evaluate(() => scrollY);
          await twoFrames(page);
          const s = await page.evaluate((id) => window.__stillState(id), id);
          const ok = y1 !== y0 && y1 === y2 && s.stage === String(i) && s.on.length === 1 && s.on[0] === i;
          out.push({ at: `${id} -> ${i}`, ok, why: `scrollY ${y0} -> ${y1} -> ${y2}, data-stage ${s.stage}, on [${s.on}]` });
        }
      }
      const bad = out.filter((o) => !o.ok);
      report(click, bad.length === 0, bad.length ? bad.map((o) => `${o.at}: ${o.why}`).join('; ') : `${out.length} clicks`);
    });
    report('tracks reduced motion: no page errors', t.errors.length === 0, t.errors.join(' | '));
    await t.close();
  }

  // Loading deep inside a track: the stage matches where the page is on the first read after load and
  // again once the browser's own scroll to the fragment (or the restored position) has landed. Chrome
  // runs that scroll with the page's smooth scroll-behavior, so the first read is near the top.
  {
    const at = (page, prev) =>
      page.evaluate(
        ([top, prev]) => {
          const el = document.getElementById('howpolluted');
          const rail = el.querySelector('.track-rail');
          const fig = rail.querySelector('figure');
          const rr = rail.getBoundingClientRect();
          return { stage: el.dataset.stage, railTop: rr.top, pad: Math.max(0, rr.height - fig.getBoundingClientRect().height), n: el.querySelectorAll('.fig-stages button[data-stage]').length, y: scrollY, top, prev };
        },
        [STICKY_TOP, prev],
      );
    const judge = (r) => {
      const expect = stageFor(deskProgress({ railTop: r.railTop, pad: r.pad, top: r.top }), r.n, r.prev);
      const s = Number(r.stage);
      return { ok: r.stage != null && r.stage !== '' && Number.isInteger(s) && s >= 0 && s < r.n && s === expect, s, txt: `data-stage ${r.stage} (expected ${expect}) at scrollY ${r.y}` };
    };
    const landed = async (page) => {
      let y = -1;
      for (let i = 0; i < 40; i++) {
        const ny = await page.evaluate(() => scrollY);
        if (ny === y && ny > 0) break;
        y = ny;
        await sleep(150);
      }
      await twoFrames(page);
    };
    const t = await open(browser, url + '#howpolluted');
    const { page } = t;
    const name = 'tracks deep load (#howpolluted at 1440): data-stage matches the page position right after load and once the fragment scroll lands';
    await step(name, async () => {
      const a = judge(await at(page, 0));
      await landed(page);
      const b = judge(await at(page, a.s));
      report(name, a.ok && b.ok, `at load ${a.txt}; landed ${b.txt}`);
    });
    const reload = 'tracks deep load (reload at stage 3 of howpolluted at 1440): data-stage matches the page position right after load and once the restored scroll lands';
    await step(reload, async () => {
      await page.evaluate(trackHelpers, STICKY_TOP);
      await page.evaluate(() => window.__jump(window.__stageY('howpolluted', 3)));
      await sleep(300);
      await page.reload({ waitUntil: 'load' });
      const a = judge(await at(page, 0));
      await landed(page);
      const b = judge(await at(page, a.s));
      report(reload, a.ok && b.ok && b.s === 3, `at load ${a.txt}; landed ${b.txt}`);
    });
    report('tracks deep load: no page errors', t.errors.length === 0, t.errors.join(' | '));
    await t.close();
  }

  // Resizing across 860 mid-track: the phone layout drops the pin, the desktop one takes it back, and
  // the stage never jumps more than one either way.
  {
    const t = await open(browser, url);
    const { page } = t;
    await page.evaluate(trackHelpers, STICKY_TOP);
    const name = 'tracks resize 1440 -> 390 -> 1440 mid-terrarium: text static at 390, sticky at 1440, data-stage within 1';
    await step(name, async () => {
      const read = () => page.evaluate(() => ({ stage: Number(document.getElementById('terrarium').dataset.stage), pos: getComputedStyle(document.querySelector('#terrarium .track-text')).position }));
      await page.evaluate(() => {
        const t = window.__track('terrarium');
        window.__jump(t.railDocTop - 96 + t.pad / 2);
      });
      await sleep(300);
      const a = await read();
      await page.setViewportSize(PHONE);
      await sleep(400);
      const b = await read();
      await page.setViewportSize(DESK);
      await sleep(400);
      const c = await read();
      report(name, b.pos === 'static' && c.pos === 'sticky' && Math.abs(b.stage - a.stage) <= 1 && Math.abs(c.stage - a.stage) <= 1, `1440 stage ${a.stage} (${a.pos}), 390 stage ${b.stage} (${b.pos}), 1440 stage ${c.stage} (${c.pos})`);
    });
    report('tracks resize: no page errors', t.errors.length === 0, t.errors.join(' | '));
    await t.close();
  }
}

/* ── HowPolluted (plan 2, spec 5.4) ── */

// At its last stage the demo is a pile the visitor cleans up: clicking pieces lowers the card's number and
// its grade follows HowPolluted's own scale; every number says it is a demo; nothing calls /api; and a
// wheel over the plate still scrolls the page (no wheel zoom).
async function checkHowPolluted(browser, url) {
  const t = await open(browser, url + '?debug=1');
  const { page } = t;
  const api = [];
  page.on('request', (r) => {
    if (r.url().includes('/api')) api.push(r.url());
  });
  await page.evaluate(trackHelpers, STICKY_TOP);
  const card = () =>
    page.evaluate(() => {
      const c = document.querySelector('#howpolluted .hp-card');
      const n = c?.querySelector('.hp-card-n');
      return { n: n ? Number(n.textContent) : NaN, grade: c?.querySelector('.hp-card-grade-word')?.textContent || '', text: c?.textContent || '', readout: document.querySelector('#howpolluted .fig-readout')?.textContent || '' };
    });
  const pick = 'howpolluted: at stage 5, clicking 6 pieces lowers the card number and the grade matches gradeFor(litter, N)';
  await step(pick, async () => {
    await page.evaluate(() => window.__jump(window.__stageY('howpolluted', 4)));
    await waitLive(page, 'howpolluted-0');
    await page.waitForFunction(() => document.getElementById('howpolluted').dataset.stage === '4' && window.__hp?.interactive() && window.__hp.items().length > 6, null, { timeout: 15000 });
    await sleep(700); // the card has slid in
    const c0 = await card();
    let clicked = 0;
    for (let k = 0; k < 40 && clicked < 6; k++) {
      // The front-most piece whose centre is on the scene itself (not under the card or a button).
      const p = await page.evaluate(() => {
        const r = document.querySelector('#howpolluted .hp').getBoundingClientRect();
        const items = window.__hp.items().slice().reverse();
        for (const it of items) {
          const x = r.left + it.cx;
          const y = r.top + it.cy;
          const el = document.elementFromPoint(x, y);
          if (el && el.closest('.hp') && !el.closest('.hp-card, .hp-controls, button')) return { x, y };
        }
        return null;
      });
      if (!p) break;
      const before = await page.evaluate(() => window.__hp.items().length);
      await page.mouse.click(p.x, p.y);
      const after = await page.evaluate(() => window.__hp.items().length);
      if (after === before - 1) clicked++;
    }
    await sleep(400); // the card repaints within a frame
    const c1 = await card();
    const want = gradeFor('litter', c1.n).grade;
    report(pick, clicked === 6 && c1.n < c0.n && c1.grade === want, `picked ${clicked}, card ${c0.n}% ${c0.grade} -> ${c1.n}% ${c1.grade} (gradeFor says ${want})`);
  });
  const demo = 'howpolluted: the card and the readout both say demo, and the card says "Demo, not a measurement"';
  await step(demo, async () => {
    const c = await card();
    report(demo, /demo/i.test(c.text) && /Demo, not a measurement/.test(c.text) && /demo/i.test(c.readout), `readout "${c.readout}"`);
  });
  report('howpolluted: no request to /api', api.length === 0, api.slice(0, 3).join(' | '));
  const wheel = 'howpolluted: a wheel over the plate at stage 5 scrolls the page';
  await step(wheel, async () => {
    const box = await page.locator('#howpolluted .fig-stage').boundingBox();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.6);
    const y0 = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 240);
    await sleep(600);
    const y1 = await page.evaluate(() => scrollY);
    report(wheel, y1 !== y0, `scrollY ${y0} -> ${y1}`);
  });
  report('howpolluted: no page errors', t.errors.length === 0, t.errors.join(' | '));
  reportConsole('howpolluted: no console errors or WebGL/context warnings', t.logs);
  await t.close();
}

/* ── Archer Hero: the game never traps keys or scrolling (spec 3.7 and 9.6) ── */

// Pointer Lock is refused in this context (as headless, an iframe policy or a declining visitor would),
// so the drag fallback and the unlocked Esc are what get exercised. ?debug=1 exposes __archer.
async function checkArcher(browser, url) {
  const refuse = () => {
    Element.prototype.requestPointerLock = function () {
      return Promise.reject(new DOMException('refused for the check', 'NotAllowedError'));
    };
  };
  const t = await open(browser, url + '?debug=1', {}, { init: refuse });
  const { page } = t;
  const id = 'archer-hero';
  const roblox = JSON.stringify(content).match(/https:\/\/www\.roblox\.com\/[^"]+/)?.[0];
  await page.evaluate(trackHelpers, STICKY_TOP);
  const toStage = async (i) => {
    await page.evaluate(([id, i]) => window.__jump(window.__stageY(id, i)), [id, i]);
    await page.waitForFunction(([id, i]) => document.getElementById(id).dataset.stage === String(i), [id, i], { timeout: 3000 });
    await twoFrames(page);
  };
  const z = () => page.evaluate(() => window.__archer?.state?.archer?.z ?? NaN);
  const scrollY = () => page.evaluate(() => scrollY);
  const isFocused = () => page.evaluate(() => document.activeElement === document.querySelector('figure.fig[data-fig="archer"]'));
  const sel = figSel('archer-0');

  await step('archer: at stage 1 the attract mode walks the archer up the path', async () => {
    await toStage(1);
    await waitLive(page, 'archer-0');
    await page.waitForFunction(() => window.__archer?.state, null, { timeout: 10000 });
    await sleep(300);
    const z0 = await z();
    await sleep(2000);
    const z1 = await z();
    report('archer: at stage 1 the attract mode walks the archer up the path', z1 > z0 + 0.5, `z ${z0.toFixed(2)} -> ${z1.toFixed(2)} in 2 s`);
  });

  await step('archer: stage 3 shows "Click to play"', async () => {
    await toStage(3);
    await page.waitForFunction((sel) => !document.querySelector(sel + ' .ah-prompt')?.hidden, sel, { timeout: 3000 });
    const text = await page.textContent(sel + ' .ah-prompt');
    report('archer: stage 3 shows "Click to play"', text === 'Click to play', `prompt "${text}"`);
  });

  await step('archer: unfocused, ArrowDown and Space scroll the page', async () => {
    await page.evaluate(() => document.activeElement?.blur());
    const y0 = await scrollY();
    await page.keyboard.press('ArrowDown');
    await sleep(400);
    const y1 = await scrollY();
    await page.keyboard.press('Space');
    await sleep(600);
    const y2 = await scrollY();
    report('archer: unfocused, ArrowDown and Space scroll the page', y1 > y0 && y2 > y1, `scrollY ${y0} -> ${y1} (ArrowDown) -> ${y2} (Space)`);
  });

  await step('archer: click to play, W moves the archer and ArrowDown leaves the page put', async () => {
    await toStage(3);
    await page.click(sel + ' .ah-prompt');
    await page.waitForFunction((sel) => document.activeElement === document.querySelector(sel), sel, { timeout: 2000 });
    await sleep(200);
    const z0 = await z();
    await page.keyboard.down('KeyW');
    await sleep(500);
    await page.keyboard.up('KeyW');
    const z1 = await z();
    const y0 = await scrollY();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    await sleep(400);
    const y1 = await scrollY();
    report('archer: click to play, W moves the archer and ArrowDown leaves the page put', z1 > z0 + 1 && y1 === y0 && (await isFocused()), `z ${z0.toFixed(2)} -> ${z1.toFixed(2)}, scrollY ${y0} -> ${y1}`);
  });

  await step('archer: with Pointer Lock refused, a drag turns the camera', async () => {
    const box = await page.locator(sel + ' canvas.fig-canvas').boundingBox();
    const yaw0 = await page.evaluate(() => window.__archer.state.archer.yaw);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await sleep(150);
    const yaw1 = await page.evaluate(() => window.__archer.state.archer.yaw);
    report('archer: with Pointer Lock refused, a drag turns the camera', Math.abs(yaw1 - yaw0) > 0.1 && (await isFocused()), `yaw ${yaw0.toFixed(3)} -> ${yaw1.toFixed(3)}`);
  });

  await step('archer: a wheel over the playing game scrolls the page', async () => {
    const box = await page.locator(sel + ' canvas.fig-canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const y0 = await scrollY();
    await page.mouse.wheel(0, 400);
    await sleep(500);
    const y1 = await scrollY();
    report('archer: a wheel over the playing game scrolls the page', y1 > y0, `scrollY ${y0} -> ${y1}`);
    await toStage(3);
  });

  await step('archer: Esc lets go of the figure', async () => {
    const before = await isFocused();
    await page.keyboard.press('Escape');
    await sleep(100);
    const after = await isFocused();
    report('archer: Esc lets go of the figure', before && !after, `focused before ${before}, after ${after}`);
  });

  // With the game resumed and playing (focus leaving pauses it, so focusing another control first would
  // prove nothing), a W that starts at the page's own email button must not reach the game: the game
  // listens on the figure, not the window.
  await step('archer: W pressed at the page\'s own email button does not move a playing archer', async () => {
    await page.click(sel + ' .ah-prompt');
    await page.waitForFunction((sel) => document.querySelector(sel + ' .ah-hud')?.classList.contains('is-playing') && document.querySelector(sel + ' .ah-prompt')?.hidden, sel, { timeout: 3000 });
    const z0 = await z();
    const sent = await page.evaluate(async () => {
      const b = [...document.querySelectorAll('[data-copy-email]')].find((x) => x.getClientRects().length);
      if (!b) return false;
      b.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
      await new Promise((r) => setTimeout(r, 500));
      b.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
      return true;
    });
    const z1 = await z();
    const playing = (await isFocused()) && (await page.evaluate((sel) => document.querySelector(sel + ' .ah-hud')?.classList.contains('is-playing'), sel));
    report('archer: W pressed at the page\'s own email button does not move a playing archer', sent && playing && z1 === z0, `sent ${sent}, still playing and focused ${playing}, z ${z0.toFixed(3)} -> ${z1.toFixed(3)}`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  });

  await step('archer: losing shows the end panel with Play again and the Roblox link', async () => {
    await toStage(3);
    await page.evaluate(() => window.__archer.kill());
    await page.waitForFunction((sel) => !document.querySelector(sel + ' .ah-end')?.hidden, sel, { timeout: 3000 });
    const r = await page.evaluate((sel) => {
      const end = document.querySelector(sel + ' .ah-end');
      const a = end.querySelector('a');
      return { again: !!end.querySelector('button.ah-again'), href: a?.getAttribute('href'), text: a?.textContent, target: a?.target, rel: a?.rel };
    }, sel);
    report('archer: losing shows the end panel with Play again and the Roblox link', r.again && r.href === roblox && r.text === 'Play the full game on Roblox' && r.target === '_blank' && /noopener/.test(r.rel), JSON.stringify(r));
  });

  await step('archer: scrolling away mid-game and back leaves no key held', async () => {
    await page.click(sel + ' .ah-again');
    await page.waitForFunction((sel) => document.activeElement === document.querySelector(sel), sel, { timeout: 2000 });
    await page.keyboard.down('KeyW');
    await sleep(300);
    // Away: the figure just above the viewport (stopped, not destroyed), then back to its last stage.
    await page.evaluate((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      window.__jump(window.scrollY + r.bottom + 60);
    }, sel);
    await sleep(600);
    await toStage(3);
    await sleep(200);
    const z0 = await z();
    await sleep(500);
    const z1 = await z();
    await page.keyboard.up('KeyW');
    const playing = await page.evaluate((sel) => document.querySelector(sel + ' .ah-hud')?.classList.contains('is-playing'), sel);
    report('archer: scrolling away mid-game and back leaves no key held', z1 === z0 && playing, `z ${z0.toFixed(3)} -> ${z1.toFixed(3)} over 500 ms after returning, still playing ${playing}`);
  });

  report('archer: no page errors', t.errors.length === 0, t.errors.join(' | '));
  reportConsole('archer: no console errors or WebGL/context warnings', t.logs);
  await t.close();
}

/* ── terrarium (plan 4) ── */

// The Terrarium track: a live, seeded jar whose stages are driven by scroll. ?debug=1 exposes
// window.__terra = { gen(), pop(), species(), azimuth(), pickFirst() } for these checks.
const shown = (page, sel) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.9 && r.width > 0 && r.height > 0;
  }, sel);

async function checkTerrarium(browser, url) {
  const ID = 'terrarium-0';
  const at = (page, i) => page.evaluate((i) => window.__jump(window.__stageY('terrarium', i)), i);
  const readoutGen = (page) =>
    page.evaluate(() => {
      const m = (document.querySelector('#terrarium .fig-readout')?.textContent || '').match(/^gen (\d+), (\d+) alive, (\d+) species$/);
      return m ? Number(m[1]) : null;
    });

  {
    const t = await open(browser, url + '?debug=1');
    const { page } = t;
    await page.evaluate(trackHelpers, STICKY_TOP);

    const n1 = 'terrarium: at stage 1 the generation rises above 5 within 6 s';
    await step(n1, async () => {
      await at(page, 1);
      await waitLive(page, ID);
      await page.waitForFunction(() => window.__terra && window.__terra.pop() > 0, null, { timeout: 15000 });
      const g0 = await page.evaluate(() => window.__terra.gen());
      const t0 = Date.now();
      await page.waitForFunction(() => window.__terra.gen() > 5, null, { timeout: 6000 }).catch(() => {});
      const g1 = await page.evaluate(() => window.__terra.gen());
      report(n1, g1 > 5, `gen ${g0} -> ${g1} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    });

    const n2 = 'terrarium: at stage 2 the river is shown and its canvas is drawn';
    await step(n2, async () => {
      await at(page, 2);
      await sleep(900);
      const vis = await shown(page, '#terrarium .tr-river');
      const px = await page.evaluate(() => {
        const c = document.querySelector('#terrarium .tr-river canvas');
        if (!c || !c.width) return 0;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
        return n / (c.width * c.height);
      });
      report(n2, vis && px > 0.05, `shown ${vis}, ${(px * 100).toFixed(1)}% of its pixels painted`);
    });

    const n3 = 'terrarium: at stage 3 the brain view is shown';
    await step(n3, async () => {
      await at(page, 3);
      await page.waitForFunction(() => document.querySelector('#terrarium .tr-brain.is-open'), null, { timeout: 3000 }).catch(() => {});
      await sleep(600);
      report(n3, await shown(page, '#terrarium .tr-brain'), '');
    });

    const n4 = 'terrarium: at stage 4 a drag turns the jar and a click on a creature opens its brain';
    await step(n4, async () => {
      await at(page, 4);
      await page.waitForFunction(() => !document.querySelector('#terrarium .tr-brain.is-open'), null, { timeout: 3000 }).catch(() => {});
      await sleep(600);
      const box = await page.locator('#terrarium .fig-stage').boundingBox();
      const a0 = await page.evaluate(() => window.__terra.azimuth());
      const y = box.y + box.height * 0.3;
      await page.mouse.move(box.x + box.width * 0.35, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.6, y, { steps: 8 });
      await page.mouse.up();
      await sleep(300);
      const a1 = await page.evaluate(() => window.__terra.azimuth());
      const brainAfterDrag = await shown(page, '#terrarium .tr-brain');
      const p = await page.evaluate(() => window.__terra.pickFirst());
      if (!p) return report(n4, false, `azimuth ${a0.toFixed(3)} -> ${a1.toFixed(3)}, no creature to click`);
      await page.mouse.click(p.x, p.y);
      await page.waitForFunction(() => document.querySelector('#terrarium .tr-brain.is-open'), null, { timeout: 3000 }).catch(() => {});
      await sleep(500);
      const open = await shown(page, '#terrarium .tr-brain');
      report(n4, Math.abs(a1 - a0) > 0.05 && !brainAfterDrag && open, `azimuth ${a0.toFixed(3)} -> ${a1.toFixed(3)}, a drag opened the brain: ${brainAfterDrag}; clicked creature ${p.id} at ${Math.round(p.x)},${Math.round(p.y)}: brain ${open ? 'open' : 'closed'}`);
    });

    const n5 = 'terrarium: a click on the river overlay opens nothing and does not turn the jar';
    await step(n5, async () => {
      await page.locator('#terrarium .tr-brain-close').click();
      await page.waitForFunction(() => !document.querySelector('#terrarium .tr-brain.is-open'), null, { timeout: 3000 });
      await sleep(500);
      const box = await page.locator('#terrarium .tr-river').boundingBox();
      const a0 = await page.evaluate(() => window.__terra.azimuth());
      for (const fx of [0.2, 0.5, 0.8]) {
        await page.mouse.click(box.x + box.width * fx, box.y + box.height * 0.5);
        await sleep(150);
      }
      // a drag across the river is the river's, not the jar's
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 6 });
      await page.mouse.up();
      await sleep(400);
      const open = await page.evaluate(() => !!document.querySelector('#terrarium .tr-brain.is-open'));
      const a1 = await page.evaluate(() => window.__terra.azimuth());
      // the jar's own idle turn is 0.025 rad/s; a drag across the river would be radians
      report(n5, !open && Math.abs(a1 - a0) < 0.02 && (await shown(page, '#terrarium .tr-river')), `brain ${open ? 'opened' : 'closed'}, azimuth ${a0.toFixed(3)} -> ${a1.toFixed(3)}`);
    });

    const n6 = 'terrarium: a wheel over the jar scrolls the page';
    await step(n6, async () => {
      const box = await page.locator('#terrarium .fig-stage').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3);
      const y0 = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0, 240);
      await sleep(500);
      const y1 = await page.evaluate(() => scrollY);
      report(n6, y1 > y0, `scrollY ${y0} -> ${y1}`);
    });

    const n7 = 'terrarium: scrolling back to stage 0 resets the world to gen 0 or 1';
    await step(n7, async () => {
      await at(page, 2);
      await sleep(300);
      const before = await page.evaluate(() => window.__terra.gen());
      await at(page, 0);
      await page.waitForFunction(() => window.__terra.gen() <= 1, null, { timeout: 4000 }).catch(() => {});
      const after = await page.evaluate(() => window.__terra.gen());
      report(n7, before > 1 && after <= 1, `gen ${before} -> ${after}`);
    });
    report('terrarium: no page errors', t.errors.length === 0, t.errors.join(' | '));
    reportConsole('terrarium: no console errors or WebGL/context warnings', t.logs);
    await t.close();
  }

  {
    const t = await open(browser, url + '?debug=1');
    const { page } = t;
    await page.evaluate(trackHelpers, STICKY_TOP);
    const n8 = 'terrarium: jumping straight to stage 4 on a fresh load, the readout gen is the live world\'s';
    await step(n8, async () => {
      await at(page, 4);
      await waitLive(page, ID);
      await page.waitForFunction(() => /^gen \d+/.test(document.querySelector('#terrarium .fig-readout')?.textContent || ''), null, { timeout: 5000 });
      let r = null;
      let g = null;
      for (let i = 0; i < 8; i++) {
        r = await readoutGen(page);
        g = await page.evaluate(() => window.__terra.gen());
        if (r === g) break;
        await sleep(150);
      }
      const text = await page.evaluate(() => document.querySelector('#terrarium .fig-readout').textContent);
      report(n8, r != null && r === g && g <= 3, `readout "${text}", __terra.gen() ${g}`);
    });
    report('terrarium (fresh stage 4): no page errors', t.errors.length === 0, t.errors.join(' | '));
    await t.close();
  }

  {
    // A worker that cannot start (CSP, an old browser) falls back through the host's error path.
    const init = () => {
      window.Worker = function () {
        throw new Error('Worker blocked by the check');
      };
    };
    const t = await open(browser, url, {}, { init });
    const { page } = t;
    await page.evaluate(trackHelpers, STICKY_TOP);
    const n9 = 'terrarium: with Worker throwing, one "fallback: error" and the stage stills show';
    await step(n9, async () => {
      await at(page, 1);
      await page.waitForFunction(() => document.querySelector('#terrarium figure')?.dataset.fallback === 'error', null, { timeout: 15000 }).catch(() => {});
      await sleep(800);
      const lines = t.logs.filter((l) => l.text === '[fig:terrarium] fallback: error').length;
      const s = await page.evaluate(() => {
        const f = document.querySelector('#terrarium figure');
        const on = f.querySelector('.fig-still.is-on');
        return { canvases: f.querySelectorAll('canvas').length, live: f.classList.contains('is-live'), still: !!on && getComputedStyle(on).opacity === '1' && on.complete && on.naturalWidth > 0 };
      });
      report(n9, lines === 1 && s.canvases === 0 && !s.live && s.still, `${lines} fallback lines, ${s.canvases} canvases, live ${s.live}, still shown ${s.still}`);
    });
    report('terrarium (no worker): no page errors', t.errors.length === 0, t.errors.join(' | '));
    await t.close();
  }
}

/* ── BTTRURSLF (plan 5, spec 5.2): tabs, scrubbed clips, flippable cards, real stats, no source shipped ── */

async function checkBttr(browser, url) {
  const t = await open(browser, url);
  const { page } = t;
  const origin = new URL(url).origin;
  const foreign = [];
  page.on('request', (r) => {
    const u = r.url();
    if (/^https?:/.test(u) && new URL(u).origin !== origin) foreign.push(u);
  });
  await page.evaluate(trackHelpers, STICKY_TOP);
  const id = 'bttrurslf';

  const tabs = 'bttr: each tab jumps to its first stage and is the selected tab there';
  await step(tabs, async () => {
    await page.evaluate((id) => window.__jump(window.__stageY(id, 0)), id);
    await twoFrames(page);
    const out = [];
    const starts = await page.$$eval(`#${id} .fig-tabs button[data-stage]`, (bs) => bs.map((b) => Number(b.dataset.stage)));
    for (const [j, s] of starts.entries()) {
      await page.locator(`#${id} .fig-tabs button[data-stage="${s}"]`).click();
      await page.waitForFunction(([id, s]) => document.getElementById(id).dataset.stage === String(s), [id, s], { timeout: 4000 }).catch(() => {});
      const r = await page.evaluate(([id, j]) => ({
        stage: document.getElementById(id).dataset.stage,
        sel: [...document.querySelectorAll(`#${id} .fig-tabs button[data-stage]`)].findIndex((b) => b.getAttribute('aria-current') === 'true'),
        shown: [...document.querySelectorAll(`#${id} .fig-stages li`)].filter((li) => !li.hidden).map((li) => Number(li.dataset.tab)),
      }), [id, j]);
      out.push({ s, j, ok: r.stage === String(s) && r.sel === j && r.shown.every((k) => k === j), r });
    }
    const bad = out.filter((o) => !o.ok);
    report(tabs, starts.length === 6 && bad.length === 0, bad.map((o) => `tab ${o.j} -> ${JSON.stringify(o.r)}`).join('; ') || `${starts.length} tabs`);
  });

  const scrub = 'bttr: scrolling within a stage scrubs its clip';
  await step(scrub, async () => {
    const seek = async (f) => {
      await page.evaluate(([id, f]) => window.__jump(window.__stageY(id, 4) + (f - 0.5) * (window.__track(id).pad / (window.__track(id).n - 1))), [id, f]);
      await page.waitForFunction((id) => document.querySelector(`#${id} video.is-on.is-ready`), id, { timeout: 15000 });
      await sleep(600);
      return page.evaluate((id) => document.querySelector(`#${id} video.is-on`).currentTime, id);
    };
    const a = await seek(0.2);
    const b = await seek(0.45);
    report(scrub, b > a + 0.2, `currentTime ${a.toFixed(2)} -> ${b.toFixed(2)} s`);
  });

  const flip = 'bttr: at the end of Appearance a puzzle card flips on hover';
  await step(flip, async () => {
    await page.evaluate((id) => window.__jump(window.__stageY(id, 2) + 0.4 * (window.__track(id).pad / (window.__track(id).n - 1))), id);
    const card = page.locator(`#${id} .bp-card`).nth(2);
    await card.waitFor({ state: 'visible', timeout: 15000 });
    await card.hover();
    await sleep(700);
    const r = await card.evaluate((b) => ({ pressed: b.getAttribute('aria-pressed'), tf: getComputedStyle(b.querySelector('.bp-face--open')).transform }));
    await page.mouse.move(2, 2);
    report(flip, r.pressed === 'true' && r.tf !== 'none', `aria-pressed ${r.pressed}, open face transform ${r.tf}`);
  });

  const stats = 'bttr: the Stats tab shows real numbers (or a visible TODO) with when and how they were counted';
  await step(stats, async () => {
    await page.locator(`#${id} .fig-tabs button[data-stage="14"]`).click();
    await page.waitForFunction((id) => !document.querySelector(`#${id} .bs`)?.hidden, id, { timeout: 5000 });
    const txt = await page.locator(`#${id} .bs`).innerText();
    const ok = (/\d+\s*\n?\s*accounts?/.test(txt) && /As of \d{4}-\d{2}-\d{2}/.test(txt)) || /\[TODO: account count\]/.test(txt);
    report(stats, ok && /screens you can open/.test(txt) && /automated tests/.test(txt), txt.replace(/\s+/g, ' ').slice(0, 140));
  });

  report('bttr: no request leaves this site (no BTTRURSLF server, no AI)', foreign.length === 0, foreign.slice(0, 3).join(' | '));
  report('bttr: no page errors', t.errors.length === 0, t.errors.join(' | '));
  await t.close();

  // A phone: the tab row scrolls inside the plate, a tab tap jumps there, the page never scrolls sideways.
  const pt = await open(browser, url, PHONE_OPTS);
  const phone = 'bttr 390x844: tabs scroll inside the plate, a tapped tab jumps to its stage, no sideways page scroll';
  await step(phone, async () => {
    await pt.page.evaluate(trackHelpers, STICKY_TOP);
    await pt.page.evaluate((id) => document.getElementById(id).querySelector('figure').scrollIntoView({ block: 'center', behavior: 'instant' }), id);
    await twoFrames(pt.page);
    const row = await pt.page.$eval(`#${id} .fig-tabs`, (r) => ({ sw: r.scrollWidth, cw: r.clientWidth }));
    const tab = pt.page.locator(`#${id} .fig-tabs button[data-stage="12"]`);
    await tab.scrollIntoViewIfNeeded();
    await tab.tap();
    await pt.page.waitForFunction((id) => document.getElementById(id).dataset.stage === '12', id, { timeout: 4000 }).catch(() => {});
    const r = await pt.page.evaluate((id) => ({ stage: document.getElementById(id).dataset.stage, sw: document.documentElement.scrollWidth, iw: innerWidth }), id);
    report(phone, row.sw > row.cw && r.stage === '12' && r.sw <= r.iw, `tab row ${row.sw}/${row.cw}, stage ${r.stage}, page ${r.sw}/${r.iw}`);
  });
  await pt.close();

  // A slow network: jumping into a clip that has not arrived shows the stage's still and never errors.
  const st = await open(browser, url);
  const slow = 'bttr slow network: a jump into an unloaded clip keeps the still on and throws nothing';
  await step(slow, async () => {
    const cdp = await st.context.newCDPSession(st.page);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 40 * 1024, uploadThroughput: 40 * 1024 });
    await st.page.evaluate(trackHelpers, STICKY_TOP);
    await st.page.evaluate((id) => window.__jump(window.__stageY(id, 5)), id);
    await sleep(1500);
    const r = await st.page.evaluate((id) => {
      const v = document.querySelector(`#${id} video.is-on`);
      const still = document.querySelector(`#${id} .fig-still.is-on`);
      return { stage: document.getElementById(id).dataset.stage, still: !!still && Number(still.dataset.stage), ready: !!v && v.classList.contains('is-ready') };
    }, id);
    report(slow, r.stage === '5' && r.still === 5 && st.errors.length === 0, `${JSON.stringify(r)}${st.errors.length ? ', errors: ' + st.errors.join(' | ') : ''}`);
  });
  await st.close();
}

// The built site carries recorded pixels and numbers only: none of BTTRURSLF's selectors, storage keys
// or code. These strings appear in the capture script, which stays out of dist/.
async function checkNoSource() {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const path = await import('node:path');
  const dist = path.join(root, 'dist');
  const hits = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|css|html|json)$/.test(f)) {
        const s = readFileSync(p, 'utf8');
        for (const needle of ['mer__ask', 'shop-hub', 'bttrurslf:settings', '__shopHub', 'SUPABASE_SERVICE_ROLE_KEY']) if (s.includes(needle)) hits.push(`${path.relative(dist, p)}: ${needle}`);
        if (/eyJ[A-Za-z0-9_-]{20,}/.test(s)) hits.push(`${path.relative(dist, p)}: a JWT-shaped string`);
      }
    }
  };
  walk(dist);
  report('dist: no BTTRURSLF selectors, storage keys or secrets ship', hits.length === 0, hits.slice(0, 4).join('; '));
}

/* ── BC Window Coverings (plan 6, spec 5.1): the frame never traps scrolling and keeps the budget ── */

const BCWC = process.env.BCWC_DIR || 'C:/Users/Warren/Downloads/Projects/bcwc';

async function startBcwc() {
  const { existsSync } = await import('node:fs');
  if (!existsSync(BCWC + '/dist/index.html')) return null;
  const { spawn } = await import('node:child_process');
  const port = 4380;
  const child = spawn(process.execPath, [BCWC + '/node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: BCWC, stdio: 'ignore' });
  const stop = () => child.exitCode == null && child.kill();
  process.once('exit', stop);
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/products`)).ok) return { origin: `http://127.0.0.1:${port}`, stop };
    } catch {}
    await sleep(200);
  }
  stop();
  return null;
}

async function checkBcwc(browser, url) {
  const id = 'bcwc';
  const pageFor = async (q, opts) => {
    const t = await open(browser, url + q, opts);
    await t.page.evaluate(trackHelpers, STICKY_TOP);
    return t;
  };
  const toStage = async (page, i, f = 0.5) => {
    // A phone has no pinned stretch to scroll through: its stage buttons set the stage.
    if ((await page.evaluate(() => innerWidth)) < 860) {
      await page.evaluate((id) => document.getElementById(id).querySelector('figure').scrollIntoView({ block: 'center', behavior: 'instant' }), id);
      await page.locator(`#${id} .fig-stages button[data-stage="${i}"]`).click();
      await page.waitForFunction(([id, i]) => document.getElementById(id).dataset.stage === String(i), [id, i], { timeout: 4000 }).catch(() => {});
      return;
    }
    await page.evaluate(([id, i, f]) => window.__jump(window.__stageY(id, i) + (f - 0.5) * (window.__track(id).pad / Math.max(1, window.__track(id).n - 1))), [id, i, f]);
    await page.waitForFunction(([id, i]) => document.getElementById(id).dataset.stage === String(i), [id, i], { timeout: 4000 }).catch(() => {});
  };
  const wheelScrolls = async (page, sel) => {
    const box = await page.locator(sel).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const y0 = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 200);
    await sleep(500);
    const y1 = await page.evaluate(() => scrollY);
    await page.evaluate((y) => window.__jump(y), y0);
    return { moved: y1 !== y0, y0, y1 };
  };

  // Today: no deployed URL, so no iframe and a visible TODO.
  const t0 = await pageFor('');
  const todo = 'bcwc without a live URL: no iframe at the last stage, and the TODO shows';
  await step(todo, async () => {
    await toStage(t0.page, 4);
    await waitLive(t0.page, 'bcwc-0');
    await sleep(500);
    const r = await t0.page.evaluate((id) => ({ frames: document.querySelectorAll(`#${id} iframe`).length, note: document.querySelector(`#${id} .bw-note`)?.textContent || '', bar: document.querySelector(`#${id} .bw-url`)?.textContent || '' }), id);
    report(todo, r.frames === 0 && /\[TODO/.test(r.note) && /\[TODO/.test(r.bar), JSON.stringify(r));
  });
  const scrub = 'bcwc: scrolling within the time-of-day stage scrubs its clip';
  await step(scrub, async () => {
    const at = async (f) => {
      await toStage(t0.page, 2, f);
      await t0.page.waitForFunction((id) => document.querySelector(`#${id} video.is-on.is-ready`), id, { timeout: 15000 });
      await sleep(500);
      return t0.page.evaluate((id) => document.querySelector(`#${id} video.is-on`).currentTime, id);
    };
    const a = await at(0.2);
    const b = await at(0.45);
    report(scrub, b > a + 0.2, `currentTime ${a.toFixed(2)} -> ${b.toFixed(2)} s`);
  });
  report('bcwc without a live URL: no page errors', t0.errors.length === 0, t0.errors.join(' | '));
  await t0.close();

  const srv = await startBcwc();
  if (!srv) {
    console.log('SKIP bcwc live frame  (bcwc/dist not found, or its preview did not start)');
    return;
  }
  try {
    for (const [label, opts] of [['1440x900', {}], ['390x844', PHONE_OPTS]]) {
      const t = await pageFor('?bcwc=' + encodeURIComponent(srv.origin), opts);
      const { page } = t;
      // The frame really claims its two contexts when it attaches and gives them back when it detaches.
      const live = `bcwc ${label}: the live frame claims weight 2 at the last stage and gives it back on leaving`;
      await step(live, async () => {
        await toStage(page, 3);
        await sleep(800);
        const w0 = await page.evaluate(() => window.__figWeight());
        await toStage(page, 4);
        await page.waitForSelector(`#${id} iframe.bw-frame.is-loaded`, { timeout: 30000 });
        const w1 = await page.evaluate(() => window.__figWeight());
        await toStage(page, 2);
        await sleep(400);
        const w2 = await page.evaluate(() => window.__figWeight());
        const gone = await page.evaluate((id) => document.querySelectorAll(`#${id} iframe`).length === 0, id);
        await toStage(page, 4);
        await page.waitForSelector(`#${id} iframe.bw-frame.is-loaded`, { timeout: 30000 });
        report(live, w1 === w0 + 2 && w1 <= 3 && w2 === w0 && gone, `weight ${w0} -> ${w1} attached -> ${w2} detached, iframe removed ${gone}`);
      });
      // Back on the live stage with the frame loaded and settled. (On a phone any scroll moves the stage,
      // which correctly detaches the frame; 300 ms covers the browser's hit-test update for a new frame.)
      const ensureLive = async () => {
        await toStage(page, 4);
        await page.waitForSelector(`#${id} iframe.bw-frame.is-loaded`, { timeout: 30000 });
        await sleep(300);
      };
      const state = (page) =>
        page.evaluate((id) => ({ engaged: document.querySelector(`#${id} iframe`).style.pointerEvents === 'auto', cover: !document.querySelector(`#${id} .bw-cover`).hidden }), id);
      const guard = `bcwc ${label}: the wheel scrolls the page over the frame until clicked in, and again once let go`;
      await step(guard, async () => {
        await ensureLive();
        const before = await wheelScrolls(page, `#${id} .bw-view`);
        await ensureLive();
        await page.locator(`#${id} .bw-cover`).click();
        const engaged = (await state(page)).engaged;
        await page.locator(`#${id} .bw-done`).click();
        const s = await state(page);
        const after = await wheelScrolls(page, `#${id} .bw-view`);
        report(guard, before.moved && engaged && !s.engaged && s.cover && after.moved, `before ${before.y0}->${before.y1}, engaged ${engaged}, after Done ${JSON.stringify(s)}, after ${after.y0}->${after.y1}`);
      });
      // Esc while this page has focus lets go on its own (inside the cross-origin frame, keys belong to
      // the frame's page; Done and leaving the plate cover that case).
      const esc = `bcwc ${label}: Esc on this page lets go of the frame by itself`;
      await step(esc, async () => {
        await ensureLive();
        const box = await page.locator(`#${id} .bw-view`).boundingBox();
        await page.locator(`#${id} .bw-cover`).click();
        const engaged = (await state(page)).engaged;
        // Focus back on this page (the email button), pointer still over the plate.
        await page.evaluate(() => [...document.querySelectorAll('[data-copy-email]')].find((x) => x.getClientRects().length)?.focus({ preventScroll: true }));
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.keyboard.press('Escape');
        const s = await state(page);
        report(esc, engaged && !s.engaged && s.cover, `engaged ${engaged}, after Esc ${JSON.stringify(s)}`);
      });
      if (label === '1440x900') {
        const leave = `bcwc ${label}: moving the pointer off the plate lets go of the frame by itself`;
        await step(leave, async () => {
          await ensureLive();
          await page.locator(`#${id} .bw-cover`).click();
          const engaged = (await state(page)).engaged;
          await page.mouse.move(2, 2);
          await sleep(200);
          const s = await state(page);
          report(leave, engaged && !s.engaged && s.cover, `engaged ${engaged}, after leaving ${JSON.stringify(s)}`);
        });
      }
      report(`bcwc ${label}: no page errors`, t.errors.length === 0, t.errors.join(' | '));
      await t.close();
    }

    // The frame is weight 2: scrolling fast from Work to Projects and back never holds more than 3.
    const tb = await pageFor('?bcwc=' + encodeURIComponent(srv.origin));
    const budget = 'bcwc: fast scrolling between the live frame and the projects keeps the budget weight at most 3';
    await step(budget, async () => {
      await toStage(tb.page, 4);
      await tb.page.waitForSelector(`#${id} iframe`, { timeout: 30000 });
      let worst = 0;
      const ys = await tb.page.evaluate(() => [window.__stageY('bcwc', 4), window.__stageY('terrarium', 2), window.__stageY('howpolluted', 1), window.__stageY('archer-hero', 1)]);
      for (let k = 0; k < 4; k++) {
        for (const y of [...ys, ...ys.slice().reverse()]) {
          await tb.page.evaluate((y) => window.__jump(y), y);
          await sleep(120);
          worst = Math.max(worst, await tb.page.evaluate(() => window.__figWeight()), (await gl(tb.page)).alive);
        }
      }
      report(budget, worst <= 3, `worst weight or live contexts ${worst}`);
    });
    await tb.close();

    // A deploy that is down: the frame says so and gives its weight back.
    const td = await pageFor('?bcwc=' + encodeURIComponent('http://127.0.0.1:9'));
    const down = 'bcwc: a live site that does not load says so within 12 s and gives the budget back';
    await step(down, async () => {
      await toStage(td.page, 4);
      await td.page.waitForFunction((id) => /did not load/.test(document.querySelector(`#${id} .bw-note`)?.textContent || ''), id, { timeout: 15000 });
      const r = await td.page.evaluate((id) => ({ frames: document.querySelectorAll(`#${id} iframe`).length, w: window.__figWeight() }), id);
      report(down, r.frames === 0 && r.w <= 3, JSON.stringify(r));
    });
    await td.close();

    // A deploy that answers but never finishes loading the page: the 10 s timeout says so, removes the
    // frame and gives its two contexts back.
    const ts = await pageFor('?bcwc=' + encodeURIComponent(srv.origin));
    const stall = 'bcwc: a live page that never finishes loading times out within 12 s and gives its claim back';
    await step(stall, async () => {
      await ts.page.route(srv.origin + '/products', async (route) => {
        if (route.request().resourceType() === 'document') await sleep(20000);
        await route.continue().catch(() => {});
      });
      await toStage(ts.page, 3);
      await sleep(800);
      const w0 = await ts.page.evaluate(() => window.__figWeight());
      await toStage(ts.page, 4);
      await ts.page.waitForSelector(`#${id} iframe`, { timeout: 15000 });
      const w1 = await ts.page.evaluate(() => window.__figWeight());
      await ts.page.waitForFunction((id) => /did not load/.test(document.querySelector(`#${id} .bw-note`)?.textContent || ''), id, { timeout: 13000 });
      const r = await ts.page.evaluate((id) => ({ frames: document.querySelectorAll(`#${id} iframe`).length, w: window.__figWeight() }), id);
      report(stall, w1 === w0 + 2 && r.frames === 0 && r.w === w0, `weight ${w0} -> ${w1} attached -> ${r.w} after the timeout, frames ${r.frames}`);
    });
    await ts.close();
  } finally {
    srv.stop();
  }
}


// On a phone the attract mode must not leave dead zones: until a game is playing, the Q and E circles
// neither take touches nor block a scroll that starts on them.
async function checkArcherTouch(browser, url) {
  const t = await open(browser, url, PHONE_OPTS);
  const { page } = t;
  await page.evaluate(trackHelpers, STICKY_TOP);
  const name = 'archer 390x844: outside play the skill buttons take no touches (no scroll dead zones)';
  await step(name, async () => {
    await page.evaluate(() => document.querySelector('#archer-hero figure').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await waitLive(page, 'archer-0');
    await page.waitForSelector('#archer-hero .ah-skill', { timeout: 15000 });
    const r = await page.$$eval('#archer-hero .ah-skill', (els) => els.map((e) => ({ pe: getComputedStyle(e).pointerEvents, ta: getComputedStyle(e).touchAction })));
    report(name, r.length === 2 && r.every((x) => x.pe === 'none' && x.ta !== 'none'), JSON.stringify(r));
  });
  await t.close();
}


// A failure after the jar is built (a bad history file, a 2D context refused) must give back what it
// took: the WebGL context, the worker and the overlay layer. ?debug=1&terrafail=1 throws at that point.
async function checkTerrariumFail(browser, url) {
  const t = await open(browser, url + '?debug=1&terrafail=1');
  const { page } = t;
  await page.evaluate(trackHelpers, STICKY_TOP);
  const name = 'terrarium: a failure after the jar is built falls back and leaks no context, worker or layer';
  await step(name, async () => {
    await page.evaluate(() => window.__jump(window.__stageY('terrarium', 0)));
    await page.waitForFunction(() => document.querySelector('#terrarium figure')?.dataset.fallback === 'error', null, { timeout: 30000 });
    await sleep(800);
    const r = await page.evaluate(() => ({ alive: window.__glAlive(), weight: window.__figWeight(), layers: document.querySelectorAll('.tr-layer').length, canvases: document.querySelectorAll('#terrarium canvas').length }));
    report(name, r.alive <= r.weight && r.layers === 0 && r.canvases === 0, JSON.stringify(r));
  });
  await t.close();
}

/* ── run ── */

if (!argv.has('--no-build')) build();
const server = await startPreview(Number(process.env.PREVIEW_PORT) || 4319);
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
  const checks = {
    live: () => checkLive(browser, url),
    budget: () => checkBudget(browser, url),
    races: () => checkRaces(browser, url),
    nojs: () => checkNoJS(browser, url),
    static: () => checkStatic(browser, url),
    nowebgl2: () => checkNoWebGL2(url),
    contextloss: () => checkContextLoss(browser, url),
    reduced: () => checkReduced(browser, url),
    email: () => checkEmail(browser, url),
    phone: () => checkPhone(browser, url),
    phonedenied: () => checkPhoneDenied(browser, url),
    resize: () => checkResize(browser, url),
    tracks: () => checkTracks(browser, url),
    howpolluted: () => checkHowPolluted(browser, url),
    archer: async () => {
      await checkArcher(browser, url);
      await checkArcherTouch(browser, url);
    },
    terrarium: async () => {
      await checkTerrarium(browser, url);
      await checkTerrariumFail(browser, url);
    },
    bttr: () => checkBttr(browser, url),
    bcwc: () => checkBcwc(browser, url),
    nosource: () => checkNoSource(),
  };
  for (const [name, run] of Object.entries(checks)) if (!only.length || only.includes(name)) await run();
} finally {
  await browser.close();
  server.stop();
}
console.log(`\n${passes} passed, ${fails} failed in ${((Date.now() - started) / 1000).toFixed(0)} s`);
if (allPageErrors.length) console.log('page errors:\n  ' + allPageErrors.join('\n  '));
process.exit(fails ? 1 : 0);
