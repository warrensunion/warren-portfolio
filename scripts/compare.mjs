// Side-by-side shots of yuzeli.ca and this page at the same viewport and the same named positions, for
// Warren to judge the borrowed techniques (sticky text, release, grid, the feature entry) by eye. Only
// techniques were borrowed; these images stay in design/compare/ and nothing from yuzeli.ca ships.
// Output: design/compare/<w>x<h>-<pos>.png, yuzeli.ca on the left, this site on the right.
// Usage: npm run compare [-- --no-build] [-- --only=1440x900]
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { GPU_ARGS, build, root, startPreview } from './lib/preview.mjs';

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
];
const THEIRS = 'https://www.yuzeli.ca/';
// Each position names an element on each site and how far past its top to scroll. `null` is the page top.
const POSITIONS = [
  { name: 'top', theirs: null, ours: null },
  { name: 'work', theirs: { h3: 'Mathos AI' }, ours: { sel: '#bcwc' } },
  { name: 'feature', theirs: { h3: 'TopsOJ' }, ours: { sel: '#bttrurslf' } },
  { name: 'project', theirs: { h3: 'Cardboard Cockpit' }, ours: { sel: '#terrarium' } },
  { name: 'project-mid', theirs: { h3: 'Cardboard Cockpit', down: 0.5 }, ours: { sel: '#terrarium', down: 0.5 } },
  { name: 'contact', theirs: { bottom: true }, ours: { sel: '#contact' } },
];
const argv = process.argv.slice(2);
const only = (argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const outDir = path.join(root, 'design/compare');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Scroll so the target's block sits where a visitor arriving at it would see it: its top at 96 px (the
// sticky top both sites use), then `down` viewports further.
async function go(page, where) {
  await page.evaluate((w) => {
    const jump = (y) => window.scrollTo({ top: Math.max(0, y), left: 0, behavior: 'instant' });
    if (!w) return jump(0);
    if (w.bottom) return jump(document.documentElement.scrollHeight);
    let el = w.sel ? document.querySelector(w.sel) : [...document.querySelectorAll('h3')].find((h) => h.textContent.trim().startsWith(w.h3));
    if (el && !w.sel) el = el.closest('.entry') || el;
    if (!el) return jump(0);
    const top = el.getBoundingClientRect().top + scrollY;
    jump(top - 96 + (w.down || 0) * innerHeight);
  }, where);
  await sleep(1600);
}

async function label(text, width) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24"><rect width="${width}" height="24" fill="#f4f3ee"/><text x="8" y="16" font-family="IBM Plex Mono, Consolas, monospace" font-size="12" fill="#17191c">${text}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

if (!argv.includes('--no-build')) build();
await mkdir(outDir, { recursive: true });
const server = await startPreview(Number(process.env.PREVIEW_PORT) || 4351);
const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
const written = [];
try {
  for (const vp of SIZES) {
    const tag = `${vp.width}x${vp.height}`;
    if (only.length && !only.includes(tag)) continue;
    const shots = {};
    for (const [side, url] of [['theirs', THEIRS], ['ours', server.url]]) {
      const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'networkidle' }).catch(() => page.goto(url, { waitUntil: 'load' }));
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(2, vp.height - 2);
      shots[side] = {};
      for (const p of POSITIONS) {
        await go(page, p[side]);
        shots[side][p.name] = await page.screenshot();
      }
      await context.close();
    }
    for (const p of POSITIONS) {
      const gap = 16;
      const W = vp.width * 2 + gap;
      const H = vp.height + 24;
      const file = path.join(outDir, `${tag}-${p.name}.png`);
      await sharp({ create: { width: W, height: H, channels: 3, background: '#f4f3ee' } })
        .composite([
          { input: await label('yuzeli.ca', vp.width), left: 0, top: 0 },
          { input: await label('this site', vp.width), left: vp.width + gap, top: 0 },
          { input: shots.theirs[p.name], left: 0, top: 24 },
          { input: shots.ours[p.name], left: vp.width + gap, top: 24 },
        ])
        .png()
        .toFile(file);
      written.push(path.relative(root, file));
    }
  }
} finally {
  await browser.close();
  server.stop();
}
console.log(written.join('\n'));
