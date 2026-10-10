// Records the BC Window Coverings track's clips (spec 5.1, plan 6 task 1) from bcwc's own `vite preview`
// of its dist/, driven from outside with Playwright. bcwc is not modified. Stages: the loader, the blind
// transition into /products, the time-of-day slider, the blind slider, and a still of /products at rest
// for the live stage. Output: public/captures/bcwc/s<k>.{webm,mp4}, public/stills/bcwc-s<i>.webp and
// public/captures/bcwc/manifest.json. Usage: npm run capture:bcwc
import { chromium } from 'playwright';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { startServer, newContext, encode, finishVideo, glide, centre, clock, gitHead, root, VIEW, STILL } from './lib.mjs';
import { GPU_ARGS } from '../lib/preview.mjs';

const B = process.env.BCWC_DIR || 'C:/Users/Warren/Downloads/Projects/bcwc';
const OUT = path.join(root, 'public/captures/bcwc');
const STILLS = path.join(root, 'public/stills');
const WORK = path.join(root, '.capture-work/bcwc');
if (!existsSync(path.join(B, 'dist/index.html'))) throw new Error(`bcwc has no dist/ at ${B}; build it there first`);
mkdirSync(OUT, { recursive: true });
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// bcwc skips its cinematic loader for automation (navigator.webdriver); the capture wants to show it.
const UNMASK = "Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })";
const manifest = { source: 'bcwc', commit: gitHead(B), captured: new Date().toISOString().slice(0, 10), view: VIEW, clip: { w: 960, h: 600, fps: 24 }, stages: {} };

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
const range = (a, b, step) => {
  const out = [];
  for (let v = a; step > 0 ? v <= b + 1e-9 : v >= b - 1e-9; v += step) out.push(+v.toFixed(3));
  return out;
};

const srv = await startServer({ cwd: B, args: [B + '/node_modules/vite/bin/vite.js', 'preview', '--port', '4380', '--strictPort'], port: 4380 });
const browser = await chromium.launch({ args: GPU_ARGS });
try {
  const { context } = await newContext(browser, { video: WORK, init: [UNMASK] });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const t = clock();
  const m = {};
  await page.goto(srv.url + '/?intro');
  m.s0 = t();
  // The loader shows a "Skip intro" button until its lift-and-stack outro has finished.
  const skip = page.getByRole('button', { name: /skip intro/i });
  await skip.waitFor({ state: 'visible', timeout: 20000 }).catch(() => console.log('  no loader seen'));
  await skip.waitFor({ state: 'detached', timeout: 60000 }).catch(() => skip.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => console.log('  loader did not end')));
  await page.waitForTimeout(900);
  m.s1 = t();
  // The WebGL transition overlay loads on the first input; then follow the Products link.
  await page.mouse.move(900, 500);
  await page.waitForTimeout(1200);
  const link = page.getByRole('link', { name: 'Products', exact: true }).first();
  const to = await centre(link);
  await glide(page, { x: 900, y: 500 }, to, 700);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForURL(/\/products/, { timeout: 15000 });
  await page.waitForSelector('#ctl-time', { timeout: 15000 });
  await page.waitForTimeout(1600);
  m.s2 = t();
  const time = page.locator('#ctl-time');
  const tb = await centre(time);
  await glide(page, to, tb, 500);
  await sweep(page, time, range(6, 21.5, 0.25));
  await page.waitForTimeout(300);
  m.s3 = t();
  const blind = page.locator('input[aria-labelledby="ctl-blind-label"]');
  await glide(page, tb, await centre(blind), 500);
  await sweep(page, blind, [...range(0, 100, 2.5), ...range(97.5, 45, -2.5)]);
  await page.waitForTimeout(500);
  m.end = t();
  await page.waitForTimeout(1500); // the recording lags the clock; keep the tail on the finished slider
  await page.mouse.move(VIEW.width - 10, VIEW.height - 10);
  await page.waitForTimeout(400);
  const rest = await page.screenshot();
  await sharp(rest).resize(STILL.w, STILL.h, { fit: 'cover' }).webp({ quality: 78 }).toFile(path.join(STILLS, 'bcwc-s4.webp'));
  const raw = await finishVideo(context, page, path.join(WORK, 'bcwc.webm'));
  if (errs.length) console.log('  page errors: ' + errs.slice(0, 3).join(' | '));
  const cut = async (k, span, opts = {}) => {
    const r = await encode(raw, path.join(OUT, `s${k}`), { start: span[0], end: span[1], stillFile: path.join(STILLS, `bcwc-s${k}.webp`), ...opts });
    manifest.stages[k] = { file: `s${k}`, duration: r.duration };
    console.log(`  s${k}: ${r.duration.toFixed(2)} s, ${(r.bytes / 1024).toFixed(0)} kB`);
    return r.bytes;
  };
  let bytes = 0;
  bytes += await cut(0, [m.s0, m.s1], { speed: Math.max(1, (m.s1 - m.s0) / 4) });
  bytes += await cut(1, [m.s1, m.s2], { speed: Math.max(1, (m.s2 - m.s1) / 4) });
  bytes += await cut(2, [m.s2, m.s3]);
  bytes += await cut(3, [m.s3, m.end], { speed: Math.max(1, (m.end - m.s3) / 4) });
  console.log(`bcwc: ${(bytes / 1048576).toFixed(2)} MB`);
} finally {
  await browser.close();
  srv.stop();
}
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
