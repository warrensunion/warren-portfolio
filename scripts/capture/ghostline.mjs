// Records the Ghostline track's clips from the live GitHub Pages deploy (or GHOSTLINE_URL), driven from
// outside with Playwright. Ghostline is not modified. One fresh browser profile, one page per stage (the
// pages share IndexedDB and localStorage, and a short video per page keeps cut times close to the clock):
//   s0 record: a scripted player on a real keyboard and mouse plays matches against the practice bot until
//      2,000+ frames are saved (it walks to a home spot, then draws and releases while standing there,
//      with the odd jump or roll, so the habit is something the net can learn from the state).
//   s1 train: the train screen trains in its Worker to the saved model (time-compressed to 4 s).
//   s2 duel: the same player against the ghost, "Show what it's looking at" off (seeded in localStorage).
//   s3 heat: a visible click on that switch, then the saliency heat and probability bars while playing.
// Output: public/captures/ghostline/s<k>.{webm,mp4}, public/stills/ghostline-s<k>.webp, manifest.json.
// Usage: node scripts/capture/ghostline.mjs
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { newContext, encode, glide, centre, clock, gitHead, root, VIEW } from './lib.mjs';
import { GPU_ARGS } from '../lib/preview.mjs';

const URL_ = (process.env.GHOSTLINE_URL || 'https://warrensunion.github.io/ghostline/').replace(/\/?$/, '/');
const COMMIT = process.env.GHOSTLINE_COMMIT || gitHead(process.env.GHOSTLINE_DIR || 'C:/Users/Warren/Downloads/ghostline'); // the deployed master
const OUT = path.join(root, 'public/captures/ghostline');
const STILLS = path.join(root, 'public/stills');
const WORK = path.join(root, '.capture-work/ghostline/video');
// The arena's graded grain is costly to encode; this keeps the four clips together under 2.5 MB.
const CRF = process.env.GHOSTLINE_CRF ? process.env.GHOSTLINE_CRF.split(',').map(Number) : [54, 39];
mkdirSync(OUT, { recursive: true });
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const manifest = { source: 'ghostline', commit: COMMIT, captured: new Date().toISOString().slice(0, 10), view: VIEW, clip: { w: 960, h: 600, fps: 24 }, stages: {} };

// Small seeded PRNG so a re-run plays the same way.
let seed = 7;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + (b - a) * rand();

// Matches played on real input, then frames added by the app's own scripted bot (0 for none). With
// only the scripted player's frames the ghost kept its distance but almost never shot back.
const MY_MATCHES = Number(process.env.GHOSTLINE_MY_MATCHES || 2);
const BOT_FRAMES = Number(process.env.GHOSTLINE_BOT_FRAMES ?? 2500);
const HOME = -3.4; // metres; the player starts each round at -8 and walks in
const readProbe = (page) =>
  page.evaluate(() => ({ ...window.__ghostline, endOpen: !!document.querySelector('.rec-end:not([hidden]), .gh-end:not([hidden])') }));

/**
 * Plays on real input for `ms` or until a match's end card opens. Away from home it walks (A/D) and does
 * not start a draw; at home it draws for about 0.9 s while the cursor eases toward a point near the opponent, then
 * releases. Returns { end, ghostShots } in the page clock's seconds.
 */
async function play(page, t, mouse, ms) {
  const ghostShots = [];
  const t0 = Date.now();
  let held = null, down = false, phaseEnd = 0, lastProbe = 0, lastF1 = null;
  let aim = { x: between(880, 1000), y: between(460, 560) };
  let nextHop = Date.now() + between(2500, 5000);
  let atHome = false;
  while (Date.now() - t0 < ms) {
    const now = Date.now();
    if (now - lastProbe > 150) {
      lastProbe = now;
      const p = await readProbe(page);
      if (p.endOpen) break;
      const f1 = p.duel?.fired1 ?? 0;
      if (lastF1 != null && f1 > lastF1) ghostShots.push(t());
      lastF1 = f1;
      const x0 = p.duel?.x0 ?? HOME;
      const want = x0 < HOME - 0.6 ? 'KeyD' : x0 > HOME + 0.6 ? 'KeyA' : null;
      atHome = !want;
      if (want !== held) {
        if (held) await page.keyboard.up(held);
        if (want) await page.keyboard.down(want);
        held = want;
      }
    }
    // A steady rhythm the net can read from the state: draw once the fire cooldown (0.3 s) is over,
    // release just after the bow is fully charged (0.85 s).
    if (down && now > phaseEnd) {
      await page.mouse.up();
      down = false;
      phaseEnd = now + between(320, 380);
    } else if (!down && atHome && now > phaseEnd) {
      aim = { x: between(860, 1020), y: between(440, 570) };
      await page.mouse.down();
      down = true;
      phaseEnd = now + between(880, 960);
    }
    if (now > nextHop) {
      await page.keyboard.press(rand() < 0.6 ? 'KeyW' : 'ShiftLeft');
      nextHop = now + between(2500, 5500);
    }
    mouse.x += (aim.x - mouse.x) * 0.18;
    mouse.y += (aim.y - mouse.y) * 0.18;
    await page.mouse.move(mouse.x, mouse.y);
    await page.waitForTimeout(16);
  }
  if (held) await page.keyboard.up(held);
  if (down) await page.mouse.up();
  return { end: t(), ghostShots };
}

async function click(page, mouse, locator, ms = 600) {
  const b = await centre(locator);
  await glide(page, { ...mouse }, b, ms);
  Object.assign(mouse, b);
  await page.mouse.down();
  await page.mouse.up();
}

/** Opens a stage's own page, watched for errors; `done()` closes it and saves its video. */
async function stagePage(context, name, notes) {
  const page = await context.newPage();
  const t = clock();
  page.on('pageerror', (e) => notes.errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') notes.console.push(`${name} ${m.type()}: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400) notes.failed.push(`${name}: ${r.status()} ${r.url()}`); });
  const done = async () => {
    await page.waitForTimeout(800); // the recording lags the clock
    await page.close();
    const file = path.join(WORK, `${name}.webm`);
    await page.video().saveAs(file);
    return file;
  };
  return { page, t, done };
}

const cut = async (k, raw, span, opts = {}) => {
  const r = await encode(raw, path.join(OUT, `s${k}`), { start: span[0], end: span[1], stillFile: path.join(STILLS, `ghostline-s${k}.webp`), crf: CRF, ...opts });
  manifest.stages[k] = { file: `s${k}`, duration: r.duration };
  console.log(`  s${k}: ${span.map((v) => v.toFixed(1)).join('-')} s -> ${r.duration.toFixed(2)} s, ${(r.bytes / 1024).toFixed(0)} kB`);
  return r.bytes;
};

const browser = await chromium.launch({ args: GPU_ARGS });
const notes = { errors: [], console: [], failed: [] };
let bytes = 0;
try {
  const { context } = await newContext(browser, { video: WORK, seed: { 'ghostline.showMind': 'off' } });
  const mouse = { x: 940, y: 520 };

  // s0 record: straight into the record screen (the intro preloader plays only on intro routes).
  {
    const { page, t, done } = await stagePage(context, 'record', notes);
    await page.goto(URL_ + '#/arena/record');
    await page.waitForFunction(() => window.__ghostline?.screen === 'record' && window.__ghostline.frames > 0, null, { timeout: 120000 });
    await page.mouse.move(mouse.x, mouse.y);
    const live = [];
    let total = 0;
    for (let match = 1; match <= MY_MATCHES; match++) {
      const start = t();
      const { end } = await play(page, t, mouse, 120000);
      live.push([start, end]);
      await page.waitForSelector('.rec-end:not([hidden]) [data-act="train"]', { timeout: 20000 });
      await page.waitForTimeout(700);
      total = await page.evaluate(() => Number((document.querySelector('.rec-end-line')?.textContent.match(/([\d,]+) frames in total/) || [])[1]?.replace(/,/g, '') || 0));
      console.log(`  match ${match}: ${(end - start).toFixed(1)} s, ${total} frames in total`);
      if (match === MY_MATCHES) break;
      await click(page, mouse, page.locator('.rec-end [data-act="again"]'));
      await page.waitForTimeout(300);
    }
    const raw = await done();
    // More data from the app's own ?autoplay=bot switch (its deterministic bot on the same input device).
    if (BOT_FRAMES > 0) {
      const bot = await context.newPage();
      const goal = total + BOT_FRAMES;
      await bot.goto(URL_ + '#/arena/record?autoplay=bot&fast');
      while (total < goal) {
        await bot.waitForSelector('.rec-end:not([hidden]) [data-act="train"]', { timeout: 300000 });
        await bot.waitForTimeout(700);
        total = await bot.evaluate(() => Number((document.querySelector('.rec-end-line')?.textContent.match(/([\d,]+) frames in total/) || [])[1]?.replace(/,/g, '') || 0));
        console.log(`  bot match: ${total} frames in total`);
        if (total < goal) {
          await bot.locator('.rec-end [data-act="again"]').click();
          await bot.waitForSelector('.rec-end', { state: 'hidden', timeout: 10000 });
        }
      }
      await bot.close();
    }
    if (total < 1500) throw new Error('not enough frames recorded: ' + total);
    // The first live stretch long enough for 4 s that starts after the walk in.
    const seg = live.find(([a, b]) => b - a >= 6.5) ?? live.reduce((x, y) => (y[1] - y[0] > x[1] - x[0] ? y : x));
    const a = Math.min(seg[0] + 0.8, seg[1] - 4.3);
    bytes += await cut(0, raw, [a, a + 4]);
  }

  // s1 train: training starts on mount and ends with the model saved.
  {
    const { page, t, done } = await stagePage(context, 'train', notes);
    await page.goto(URL_ + '#/arena/train');
    await page.waitForFunction(() => window.__ghostline?.screen === 'train', null, { timeout: 120000 });
    const start = t();
    await page.waitForFunction(() => window.__ghostline.training?.done, null, { timeout: 600000, polling: 250 });
    const end = t();
    const info = await page.evaluate(() => ({ status: document.querySelector('.tr-status')?.textContent, agree: document.querySelector('.tr-agree')?.textContent }));
    console.log(`  trained in ${(end - start).toFixed(1)} s: ${info.status} agreement ${info.agree}`);
    await page.waitForTimeout(1400);
    const raw = await done();
    bytes += await cut(1, raw, [start + 0.3, end + 1.4], { speed: Math.max(1, (end + 1.1 - start) / 4) });
  }

  // s2 duel: the ghost with the heat off; cut around one of its own shots.
  {
    const { page, t, done } = await stagePage(context, 'duel', notes);
    await page.goto(URL_ + '#/arena/ghost');
    await page.waitForFunction(() => window.__ghostline?.screen === 'ghost' && window.__ghostline.inferMs > 0, null, { timeout: 120000 });
    await page.mouse.move(mouse.x, mouse.y);
    const start = t();
    const { end, ghostShots } = await play(page, t, mouse, 12000);
    console.log(`  duel: ${(end - start).toFixed(1)} s live, ghost shots at ${ghostShots.map((s) => (s - start).toFixed(1)).join(', ') || 'none'}`);
    const raw = await done();
    const g = ghostShots.find((s) => s > start + 3.4 && s < end - 1.6);
    bytes += await cut(2, raw, g ? [g - 2.4, g + 1.6] : [start + 3, start + 7]);
  }

  // s3 heat: switch "Show what it's looking at" on, then keep playing.
  {
    const { page, t, done } = await stagePage(context, 'heat', notes);
    await page.goto(URL_ + '#/arena/ghost');
    await page.waitForFunction(() => window.__ghostline?.screen === 'ghost' && window.__ghostline.inferMs > 0, null, { timeout: 120000 });
    await page.mouse.move(mouse.x, mouse.y);
    await play(page, t, mouse, 2500);
    await click(page, mouse, page.locator('.gh-toggle'), 550);
    const clicked = t();
    await page.waitForFunction(() => window.__ghostline.heat > 0.2, null, { timeout: 15000, polling: 50 });
    const on = t();
    await glide(page, { ...mouse }, { x: 940, y: 520 }, 400);
    Object.assign(mouse, { x: 940, y: 520 });
    await play(page, t, mouse, 4000);
    const heat = await page.evaluate(() => window.__ghostline.heat);
    console.log(`  heat painted ${(on - clicked).toFixed(2)} s after the click, level ${heat.toFixed(2)}`);
    const raw = await done();
    bytes += await cut(3, raw, [clicked - 0.9, clicked + 3.1]);
  }
  await context.close();
  console.log(`ghostline: ${(bytes / 1048576).toFixed(2)} MB`);
} finally {
  await browser.close();
  console.log('  page errors: ' + (notes.errors.join(' | ') || 'none'));
  console.log('  console errors/warnings: ' + (notes.console.join(' | ') || 'none'));
  console.log('  failed requests: ' + (notes.failed.join(' | ') || 'none'));
}
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
