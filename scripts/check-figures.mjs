// The figure host's promises (live scenes that really draw, at most three WebGL contexts, scenes that
// stop off screen, posters and a logged reason whenever a scene is not allowed, recovery from a lost
// context, a still page under reduced motion) and the email copy and phone layout only hold in a real
// browser, so this drives the built page in Chromium and prints PASS/FAIL per promise. Exit code 1 on
// any FAIL. Usage: npm run check [-- --no-build] [-- --swiftshader] [-- --only=tracks,static]
import { chromium } from 'playwright';
import { build, GPU_ARGS, startPreview } from './lib/preview.mjs';
import { content } from '../src/content.js';
import { deskProgress, stageFor } from '../src/figures/track-math.js';

const argv = new Set(process.argv.slice(2));
const ARGS = argv.has('--swiftshader') ? [] : GPU_ARGS;
// --only=tracks,budget runs just those checks (names in `checks` at the bottom).
const only = ([...argv].find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
// The live WebGL figures on the page today. Each later plan appends its track figure's id here (and its
// kind to KIND_COUNT and CANVASES) as its demo lands.
const WEBGL_IDS = ['iceberg-0', 'ring-0', 'archer-0'];
const KIND_COUNT = { iceberg: 1, ring: 1, archer: 1 }; // WebGL figures per kind: one fallback log each
const CANVASES = { iceberg: 2, ring: 1, archer: 1 }; // the iceberg's WebGL scene plus its 2D overlay
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
  const name = 'fallback ?static=1: no canvases, every poster and current stage still loaded and shown, one "fallback: forced" per WebGL figure';
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
    report(name, canv === 0 && bad.length === 0 && posters.length === 8 && sameCounts(per, KIND_COUNT), `canvases ${canv}, posters ${posters.length} (bad: ${bad.join(', ') || 'none'}), logs ${JSON.stringify(per)}`);
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
  await step('reduced motion: no canvases or iframes anywhere, one "fallback: reduced-motion" per WebGL figure', async () => {
    let canv = 0;
    let frames = 0;
    await scrollThrough(page, 300, 120, async () => {
      const r = await page.evaluate(() => ({ c: document.querySelectorAll('figure.fig canvas').length, f: document.querySelectorAll('figure.fig iframe').length }));
      canv = Math.max(canv, r.c);
      frames = Math.max(frames, r.f);
    });
    const per = fallbackLogs(t.logs, 'reduced-motion');
    report('reduced motion: no canvases or iframes anywhere, one "fallback: reduced-motion" per WebGL figure', canv === 0 && frames === 0 && sameCounts(per, KIND_COUNT), `canvases ${canv}, iframes ${frames}, logs ${JSON.stringify(per)}`);
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
        for (const i of [n - 1, Math.floor(n / 2)]) {
          await page.evaluate((id) => window.__jump(window.__stageY(id, 0)), id);
          await twoFrames(page);
          const y0 = await page.evaluate(() => scrollY);
          await page.locator(`#${id} .fig-stages button[data-stage="${i}"]`).click();
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

  await step('archer: W pressed in the page\'s own email button does not move the archer', async () => {
    const focused = await page.evaluate(() => {
      const b = [...document.querySelectorAll('[data-copy-email]')].find((x) => x.getClientRects().length);
      b?.focus({ preventScroll: true });
      return document.activeElement === b && !!b;
    });
    const z0 = await z();
    await page.keyboard.down('KeyW');
    await sleep(500);
    await page.keyboard.up('KeyW');
    const z1 = await z();
    report('archer: W pressed in the page\'s own email button does not move the archer', focused && z1 === z0, `email button focused ${focused}, z ${z0.toFixed(3)} -> ${z1.toFixed(3)}`);
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
    archer: () => checkArcher(browser, url),
  };
  for (const [name, run] of Object.entries(checks)) if (!only.length || only.includes(name)) await run();
} finally {
  await browser.close();
  server.stop();
}
console.log(`\n${passes} passed, ${fails} failed in ${((Date.now() - started) / 1000).toFixed(0)} s`);
if (allPageErrors.length) console.log('page errors:\n  ' + allPageErrors.join('\n  '));
process.exit(fails ? 1 : 0);
