// Records the Stress Test track's clips from its live GitHub Pages deploy (warrensunion.github.io/stress-test),
// driven from outside with Playwright. The project is not modified. Stages: sketching (add a cache from the
// palette and wire it in), a live run of the deliberately bad preset that names the database as the first
// bottleneck and finds the saturation point, the advice loop (analyze, apply the top fix, re-simulate), and a
// still of the result view for the live stage. Output: public/captures/stress-test/s<k>.{webm,mp4},
// public/stills/stress-test-s<i>.webp and public/captures/stress-test/manifest.json.
// Usage: node scripts/capture/stress-test.mjs   (STRESS_TEST_URL overrides the URL, e.g. a local vite preview)
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { newContext, encode, finishVideo, glide, centre, clock, root, VIEW, STILL } from './lib.mjs';
import { GPU_ARGS } from '../lib/preview.mjs';

const URL = process.env.STRESS_TEST_URL || 'https://warrensunion.github.io/stress-test/';
const OUT = path.join(root, 'public/captures/stress-test');
const STILLS = path.join(root, 'public/stills');
const WORK = path.join(root, '.capture-work/stress-test');
mkdirSync(OUT, { recursive: true });
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// The deployed commit, read from the GitHub API so the manifest names what was captured.
let commit = 'unknown';
try {
  const r = await fetch('https://api.github.com/repos/warrensunion/stress-test/commits/main');
  if (r.ok) commit = (await r.json()).sha;
} catch {}
const manifest = { source: 'stress-test', url: URL, commit, captured: new Date().toISOString().slice(0, 10), view: VIEW, clip: { w: 960, h: 600, fps: 24 }, stages: {} };

const browser = await chromium.launch({ args: GPU_ARGS });
const errs = [];
try {
  const { context } = await newContext(browser, { video: WORK });
  const page = await context.newPage();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errs.push(`console.${m.type()}: ${m.text()}`));
  page.on('response', (r) => r.status() >= 400 && errs.push(`${r.status()} ${r.url()}`));
  const t = clock();
  const m = {};
  await page.goto(URL);
  await page.getByTestId('node-db').waitFor();
  await page.waitForTimeout(1200);
  let at = { x: 720, y: 450 };
  const go = async (locator, ms = 600) => {
    const to = await centre(locator);
    await glide(page, at, to, ms);
    at = to;
    return to;
  };

  // s0: sketch. Double-click Cache in the palette, then drag a connection from the API's right handle to it.
  m.s0 = t();
  const before = new Set(await page.locator('[data-testid^="node-"]').evaluateAll((els) => els.map((e) => e.dataset.testid)));
  await go(page.getByTestId('palette-cache'), 700);
  await page.mouse.dblclick(at.x, at.y);
  await page.waitForTimeout(700);
  const added = (await page.locator('.react-flow__node [data-testid^="node-"]').evaluateAll((els) => els.map((e) => e.dataset.testid))).find((id) => !before.has(id) && !id.startsWith('node-issue'));
  if (!added) throw new Error('no node was added');
  const from = page.locator('.react-flow__handle-right[data-nodeid="app"]');
  const toH = page.locator(`.react-flow__handle-left[data-nodeid="${added.slice(5)}"]`);
  await go(from, 600);
  await page.mouse.down();
  await go(toH, 700);
  await page.mouse.up();
  await page.waitForTimeout(900);
  await go(page.getByTestId(added), 400);
  await page.waitForTimeout(700);
  m.s0end = t();
  await page.waitForTimeout(600);

  // s1: load the deliberately bad design, then a live run at 10x: the database lights up and saturates.
  await go(page.getByTestId('preset-select'), 600);
  await page.getByTestId('preset-select').selectOption('bad-design');
  await page.getByTestId('node-issue-db').waitFor();
  await page.waitForTimeout(900);
  m.s1 = t();
  const speed = page.locator('label', { hasText: 'Live speed' }).locator('select');
  await go(speed, 500);
  await speed.selectOption('10');
  await page.waitForTimeout(200);
  await go(page.getByRole('button', { name: 'Live run' }), 500);
  await page.mouse.down();
  await page.mouse.up();
  await page.getByTestId('stat-saturation').filter({ hasText: 'req/s' }).waitFor({ timeout: 90000 });
  await go(page.getByTestId('stat-bottleneck'), 600);
  await page.waitForTimeout(900);
  m.s1end = t();
  await page.waitForTimeout(600);

  // s2: advice. Analyze, then apply the top suggestion; the applied log shows the re-simulated before and after.
  m.s2 = t();
  await go(page.getByRole('button', { name: 'advice' }), 600);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
  await go(page.getByTestId('get-advice'), 500);
  await page.mouse.down();
  await page.mouse.up();
  await page.getByTestId('recommendation').first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(900);
  await go(page.getByTestId('apply-recommendation').first(), 600);
  await page.mouse.down();
  await page.mouse.up();
  await page.getByTestId('applied-log').filter({ hasText: 're-simulated' }).waitFor({ timeout: 120000 });
  // Applying re-runs the analysis for the next step; end on the settled panel, not its busy button.
  await page.getByTestId('get-advice').filter({ hasText: 'Re-analyze' }).and(page.locator(':enabled')).waitFor({ timeout: 120000 });
  await go(page.getByTestId('applied-log'), 500);
  await page.waitForTimeout(1200);
  m.s2end = t();
  await page.waitForTimeout(1500); // the recording lags the clock; keep a still tail

  // s3: still of the result view for the bad design as shipped (not part of any clip): a fresh preset load,
  // an instant run, the results panel scrolled so the tiles and the charts both show.
  await page.getByTestId('preset-select').selectOption('bad-design');
  await page.getByTestId('node-issue-db').waitFor();
  await page.getByTestId('run-sim').click();
  await page.getByTestId('stat-saturation').filter({ hasText: 'req/s' }).waitFor({ timeout: 90000 });
  await page.getByTestId('sim-panel').evaluate((el) => {
    const box = el.closest('section');
    if (box) box.scrollTop = 110;
  });
  await page.mouse.move(VIEW.width - 10, VIEW.height - 10);
  await page.waitForTimeout(1200);
  const rest = await page.screenshot();
  await sharp(rest).resize(STILL.w, STILL.h, { fit: 'cover' }).webp({ quality: 78 }).toFile(path.join(STILLS, 'stress-test-s3.webp'));
  console.log('  marks', JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +v.toFixed(2)]))));
  const raw = await finishVideo(context, page, path.join(WORK, 'stress-test.webm'));
  const cut = async (k, span, opts = {}) => {
    const dur = span[1] - span[0];
    const r = await encode(raw, path.join(OUT, `s${k}`), { start: span[0], end: span[1], speed: Math.max(1, dur / 4), crf: [47, 35], stillFile: path.join(STILLS, `stress-test-s${k}.webp`), ...opts });
    manifest.stages[k] = { file: `s${k}`, duration: r.duration };
    console.log(`  s${k}: ${dur.toFixed(2)} s raw -> ${r.duration.toFixed(2)} s, ${(r.bytes / 1024).toFixed(0)} kB`);
    return r.bytes;
  };
  let bytes = 0;
  bytes += await cut(0, [m.s0, m.s0end]);
  bytes += await cut(1, [m.s1, m.s1end]);
  bytes += await cut(2, [m.s2, m.s2end]);
  console.log(`stress-test: ${(bytes / 1048576).toFixed(2)} MB`);
} finally {
  await browser.close();
}
if (errs.length) console.log('  page errors/warnings:\n   ' + errs.slice(0, 10).join('\n   '));
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
