// Every WebGL figure's poster is a still of the scene itself, so the page reads the same before the
// scene loads, under reduced motion and on a device that cannot run it. This shoots each one through
// the host's ?poster= hook (one figure, fixed state, no motion) from the built page at the 1440x900
// layout and 2x pixels, writes webp into public/posters, then rebuilds so dist/ carries them too. Track
// figures also get one still per stage (TRACK_STILLS, ?poster=<kind>&stage=<i>), shot at the 1440 layout and
// 1x into public/stills/<slug>-s<i>.webp; the figure draws stage i at the end of its own stretch.
// Usage: npm run posters [-- --only=ws-1,iceberg,stills/howpolluted-s0]
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
  // A track figure's stage stills (spec 3.6): one per stage, into public/stills at the plate's 1280x800.
  ...[0, 1, 2, 3, 4].map((i) => ({ file: 'terrarium-s' + i, q: 'poster=terrarium&stage=' + i, dir: 'stills', size: [1280, 800] })),
];
const TRACK_STILLS = [
  ...[0, 1, 2, 3, 4].map((i) => ({ file: `stills/howpolluted-s${i}`, q: `poster=howpolluted&stage=${i}`, still: true })),
  ...[0, 1, 2, 3].map((i) => ({ file: `stills/archer-hero-s${i}`, q: `poster=archer&stage=${i}`, still: true })),
];
const KIND_INDEX = (q) => {
  const p = new URLSearchParams(q);
  return [p.get('poster'), Number(p.get('i') || 0)];
};

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const ALL = [...SHOTS, ...TRACK_STILLS];
const shots = only.length ? ALL.filter((s) => only.includes(s.file)) : ALL;

build();
const server = await startPreview(Number(process.env.PREVIEW_PORT) || 4318);
const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
let failed = 0;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const stillContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  for (const shot of shots) {
    const page = await (shot.still ? stillContext : context).newPage();
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
    const out = shot.still ? path.join(root, 'public', shot.file + '.webp') : path.join(root, 'public', shot.dir || 'posters', shot.file + '.webp');
    const img = shot.size ? sharp(png).resize(shot.size[0], shot.size[1], { fit: 'cover' }) : sharp(png);
    const info = await img.webp({ quality: shot.still || shot.dir ? 78 : 80, effort: 6 }).toFile(out);
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
