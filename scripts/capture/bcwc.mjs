// Records the BC Window Coverings track's clips (spec 5.1, plan 6 task 1) from a `vite preview` of a bcwc
// production build (`npm run build:static`), driven from outside with Playwright. bcwc is not modified.
// Stages: the loader, the install-photo gallery on /work, the time-of-day slider, the faux wood blind
// tilting and lifting, and a still of /products at rest for the live stage. Output:
// public/captures/bcwc/s<k>.{webm,mp4}, public/stills/bcwc-s<i>.webp and public/captures/bcwc/manifest.json.
//
// bcwc is not deployed, so the capture serves a build. BCWC_DIR points at a folder holding that build
// (dist/ plus node_modules/vite). To capture a commit rather than a working tree, export it, build it there
// and name the commit: `git -C <bcwc> archive <sha> | tar -x -C <dir>`, `npm ci && npm run build:static`
// in <dir>, then `BCWC_DIR=<dir> BCWC_COMMIT=<sha> npm run capture:bcwc`. Usage: npm run capture:bcwc
import { chromium } from 'playwright';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import { startServer, newContext, encode, finishVideo, glide, centre, clock, gitHead, root, VIEW, STILL } from './lib.mjs';
import { GPU_ARGS } from '../lib/preview.mjs';

const B = process.env.BCWC_DIR || 'C:/Users/Warren/Downloads/Projects/bcwc';
const COMMIT = process.env.BCWC_COMMIT || gitHead(B);
const PORT = Number(process.env.BCWC_PORT || 4380);
const OUT = path.join(root, 'public/captures/bcwc');
const STILLS = path.join(root, 'public/stills');
const WORK = path.join(root, '.capture-work/bcwc');
if (!existsSync(path.join(B, 'dist/index.html'))) throw new Error(`bcwc has no dist/ at ${B}; build it there first`);
mkdirSync(OUT, { recursive: true });
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// bcwc skips its cinematic loader for automation (navigator.webdriver); the capture wants to show it.
const UNMASK = "Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })";
const manifest = { source: 'bcwc', commit: COMMIT, captured: new Date().toISOString().slice(0, 10), view: VIEW, clip: { w: 960, h: 600, fps: 24 }, stages: {} };

// Sweeps a range input through `values`, one every `ms`, firing the input events React listens for.
async function sweep(page, locator, values, ms = 40) {
  for (const v of values) {
    await locator.evaluate((el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, v);
    await page.waitForTimeout(ms);
  }
}
// Mean luma per frame (5 fps) of a recording: [{ t, y }], y in 0..255.
function lumaTrack(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', 'fps=5,scale=160:100,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const out = [];
  let t = 0;
  for (const line of (r.stdout || '').split('\n')) {
    const a = line.match(/pts_time:([\d.]+)/);
    if (a) t = +a[1];
    const b = line.match(/YAVG=([\d.]+)/);
    if (b) out.push({ t, y: +b[1] });
  }
  return out;
}
const range = (a, b, step) => {
  const out = [];
  for (let v = a; step > 0 ? v <= b + 1e-9 : v >= b - 1e-9; v += step) out.push(+v.toFixed(3));
  return out;
};

const srv = await startServer({ cwd: B, args: [B + '/node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], port: PORT });
const browser = await chromium.launch({ args: GPU_ARGS });
try {
  const { context } = await newContext(browser, { video: WORK, init: [UNMASK] });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  page.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url() + ' ' + (r.failure()?.errorText || '')));
  const t = clock();
  const m = {};
  // Not 'load': the loader is capped at about 2 s and can finish before the page's load event.
  await page.goto(srv.url + '/?intro', { waitUntil: 'commit' });
  // The loader (high GPU tier only) shows a "Skip intro" button until its lift-and-stack outro has finished.
  // Its first seconds are a dark room at 000 while the scene loads; the clip starts as the count moves.
  const skip = page.locator('.loader-skip');
  await skip.waitFor({ state: 'visible', timeout: 20000 }).catch(() => console.log('  no loader seen'));
  await page.waitForFunction(() => (document.querySelector('.loader-count')?.textContent || '000').trim() !== '000', null, { timeout: 20000 }).catch(() => {});
  m.s0 = Math.max(0, t() - 1.0);
  await skip.waitFor({ state: 'detached', timeout: 60000 }).catch(() => skip.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => console.log('  loader did not end')));
  await page.waitForTimeout(900);
  m.s0end = t();
  // Route changes cover the page with the overlay's blind. In this headless capture it draws as a flat
  // deep-green panel with no slats, so the clips start after each route has arrived and settled.
  // Our work: the family's install photos; filter to blackout and switch a pair to its closed state.
  await page.mouse.move(900, 500);
  await page.waitForTimeout(1200);
  const work = page.getByRole('link', { name: 'Our work', exact: true }).first();
  let at = await centre(work);
  await glide(page, { x: 900, y: 500 }, at, 700);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForURL(/\/work/, { timeout: 15000 });
  await page.waitForTimeout(2400);
  m.s1 = t();
  const chip = page.getByRole('button', { name: 'Blackout', exact: true });
  const cp = await centre(chip);
  await glide(page, at, cp, 700);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(1300);
  // Bring the first open/closed pair's toggle up into view with a few wheel steps (Lenis smooths them).
  const pair = page.locator('.pair-toggle button:nth-of-type(2)').first();
  let pb = await pair.boundingBox();
  if (pb && pb.y > VIEW.height - 160) {
    const by = pb.y - (VIEW.height - 260);
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, by / 12);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(1000);
  }
  const pp = await centre(pair);
  await glide(page, cp, pp, 700);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(2200);
  m.s1end = t();
  const link = page.getByRole('link', { name: 'Products', exact: true }).first();
  const to = await centre(link);
  await glide(page, pp, to, 700);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForURL(/\/products/, { timeout: 15000 });
  await page.waitForSelector('#ctl-time', { timeout: 15000 });
  // The configurator's 3D room mounts after the first input and fades in once its shaders are compiled.
  await page.waitForSelector('.cfg-stage canvas', { timeout: 15000 }).catch(() => console.log('  no configurator canvas'));
  await page.waitForTimeout(2400);
  m.s2 = t();
  // A day at 49.17°N: dawn to after dark, then back to late afternoon.
  const time = page.locator('#ctl-time');
  const tb = await centre(time);
  await glide(page, to, tb, 500);
  await sweep(page, time, [...range(5, 21, 0.25), ...range(20.75, 16, -0.25)]);
  await page.waitForTimeout(400);
  m.s3 = t();
  // Faux wood blinds (added in the light green refresh; the detailed venetian model): tilt open, then raise.
  const tile = page.getByRole('radio', { name: /faux wood/i });
  await tile.scrollIntoViewIfNeeded();
  const tp = await centre(tile);
  await glide(page, tb, tp, 600);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(1400);
  const blind = page.locator('input[aria-labelledby="ctl-blind-label"]');
  const bb = await centre(blind);
  await glide(page, tp, bb, 600);
  await sweep(page, blind, [...range(0, 100, 2), ...range(98, 40, -2)], 45);
  await page.waitForTimeout(600);
  m.end = t();
  await page.waitForTimeout(1500); // the recording lags the clock; keep the tail on the finished slider
  await page.mouse.move(VIEW.width - 10, VIEW.height - 10);
  await page.waitForTimeout(400);
  const rest = await page.screenshot();
  await sharp(rest).resize(STILL.w, STILL.h, { fit: 'cover' }).webp({ quality: 78 }).toFile(path.join(STILLS, 'bcwc-s4.webp'));
  const raw = await finishVideo(context, page, path.join(WORK, 'bcwc.webm'));
  // Under a saturated CPU the recorder drops frames and the short loader can vanish from the video. Write
  // no clips unless the loader's lit room (mid-grey: between the dark room and the white pages) is in it.
  const lit = lumaTrack(raw).filter((f) => f.t >= m.s0 - 3 && f.t <= m.s0end && f.y > 45 && f.y < 170);
  if (lit.length < 3) throw new Error('the loader is missing from the recording (CPU too busy?); no clips written, run again');
  console.log('  marks: ' + JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +v.toFixed(2)]))));
  console.log(errs.length ? '  errors:\n    ' + errs.join('\n    ') : '  no console or page errors');
  const cut = async (k, span, opts = {}) => {
    const r = await encode(raw, path.join(OUT, `s${k}`), { start: span[0], end: span[1], stillFile: path.join(STILLS, `bcwc-s${k}.webp`), ...opts });
    manifest.stages[k] = { file: `s${k}`, duration: r.duration };
    console.log(`  s${k}: ${r.duration.toFixed(2)} s, ${(r.bytes / 1024).toFixed(0)} kB`);
    return r.bytes;
  };
  let bytes = 0;
  bytes += await cut(0, [m.s0, m.s0end], { speed: Math.max(1, (m.s0end - m.s0) / 4), crf: [45, 34] }); // coarser CRFs keep the four clips under 2.5 MB
  bytes += await cut(1, [m.s1, m.s1end], { speed: Math.max(1, (m.s1end - m.s1) / 4), crf: [47, 36] }); // photos: coarser to stay in budget
  bytes += await cut(2, [m.s2, m.s3], { speed: Math.max(1, (m.s3 - m.s2) / 4), crf: [46, 35] });
  bytes += await cut(3, [m.s3, m.end], { speed: Math.max(1, (m.end - m.s3) / 4), crf: [46, 35] });
  console.log(`bcwc: ${(bytes / 1048576).toFixed(2)} MB`);
} finally {
  await browser.close();
  srv.stop();
}
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
