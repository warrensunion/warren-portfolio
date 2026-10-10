// Every WebGL figure's poster is a still of the scene itself, so the page reads the same before the
// scene loads, under reduced motion and on a device that cannot run it. This shoots each one through
// the host's ?poster= hook (one figure, fixed state, no motion) from the built page at the 1440x900
// layout and 2x pixels, writes webp into public/posters, then rebuilds so dist/ carries them too.
// Usage: npm run posters [-- --only=ws-1,iceberg]
import { chromium } from 'playwright';
import sharp from 'sharp';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { GPU_ARGS, build, root, startPreview } from './lib/preview.mjs';

const SHOTS = [
  { file: 'iceberg', q: 'poster=iceberg&depth=0' },
  { file: 'iceberg-under', q: 'poster=iceberg&depth=1' },
  { file: 'ws', q: 'poster=ring' },
  { file: 'ws-0', q: 'poster=ring&shape=0' },
  { file: 'ws-1', q: 'poster=ring&shape=1' },
  { file: 'ws-2', q: 'poster=ring&shape=2' },
  { file: 'ws-3', q: 'poster=ring&shape=3' },
  { file: 'ws-4', q: 'poster=ring&shape=4' },
];
const KIND_INDEX = (q) => {
  const p = new URLSearchParams(q);
  return [p.get('poster'), Number(p.get('i') || 0)];
};

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const shots = only.length ? SHOTS.filter((s) => only.includes(s.file)) : SHOTS;

build();
const server = await startPreview(4318);
const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
let failed = 0;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  for (const shot of shots) {
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'warning' || m.type() === 'error') console.log(`  [${shot.file}] ${m.text()}`);
    });
    await page.goto(server.url + '?' + shot.q, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__posterReady || window.__posterError, null, { timeout: 90000 });
    const err = await page.evaluate(() => window.__posterError);
    if (err) {
      console.log(`FAIL ${shot.file}: ${err}`);
      failed++;
      await page.close();
      continue;
    }
    const [kind, i] = KIND_INDEX(shot.q);
    const stage = page.locator(`figure.fig[data-fig="${kind}"] .fig-stage`).nth(i);
    await stage.scrollIntoViewIfNeeded();
    // Two more frames after scrolling, so the compositor has the canvas at its final place.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const png = await stage.screenshot({ type: 'png', animations: 'disabled' });
    const out = path.join(root, 'public/posters', shot.file + '.webp');
    const info = await sharp(png).webp({ quality: 80, effort: 6 }).toFile(out);
    const kb = ((await stat(out)).size / 1024).toFixed(0);
    console.log(`ok   ${shot.file}.webp ${info.width}x${info.height} ${kb} KB`);
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}
if (failed) process.exit(1);
build();
console.log('posters: done, dist rebuilt');
