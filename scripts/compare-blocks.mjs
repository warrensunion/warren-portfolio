// The ice field's blocks next to the BTTRshop hub's, at the same sizes: the hub's reference shots (taken from
// BTTRURSLF-v2's dev server into design/ref-bttrshop/) on the left, this page's field with the same block
// position on the right. For judging the port by eye; nothing from the shots ships.
// Output: design/compare/blocks-<w>x<h>-<n>.png. Usage: npm run compare:blocks [-- --no-build]
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { GPU_ARGS, build, root, startPreview } from './lib/preview.mjs';

// [our block index, the hub shot showing a block centred]
const PAIRS = {
  '1440x900': [[0, '1440x900-00.jpg'], [1, '1440x900-04.jpg'], [2, '1440x900-08.jpg']],
  '390x844': [[0, '390x844-03.jpg'], [1, '390x844-06.jpg'], [2, '390x844-10.jpg']],
};
const argv = process.argv.slice(2);
const outDir = path.join(root, 'design/compare');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!argv.includes('--no-build')) build();
await mkdir(outDir, { recursive: true });
const server = await startPreview(Number(process.env.PREVIEW_PORT) || 4352);
const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
const written = [];
try {
  for (const [tag, pairs] of Object.entries(PAIRS)) {
    const [w, h] = tag.split('x').map(Number);
    const phone = w < 600;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
    const page = await ctx.newPage();
    await page.goto(server.url, { waitUntil: 'load' });
    await page.mouse.move(w / 2, h / 2); // the world starts on the first input
    await page.waitForFunction(() => document.documentElement.classList.contains('world-live'), null, { timeout: 60000 });
    for (const [k, ref] of pairs) {
      await page.evaluate((k) => {
        const s = document.getElementById('index');
        const r = s.getBoundingClientRect();
        const n = Number(getComputedStyle(s).getPropertyValue('--blocks')) || 11;
        window.scrollTo({ top: r.top + scrollY + ((k + 0.85) / (n + 0.7)) * r.height - innerHeight / 2, behavior: 'instant' });
      }, k);
      await sleep(3000);
      const ours = await page.screenshot();
      const theirs = await sharp(path.join(root, 'design/ref-bttrshop', ref)).resize(w, h).png().toBuffer();
      const gap = 16;
      const file = path.join(outDir, `blocks-${tag}-${k}.png`);
      await sharp({ create: { width: w * 2 + gap, height: h, channels: 3, background: '#0b1626' } })
        .composite([
          { input: theirs, left: 0, top: 0 },
          { input: ours, left: w + gap, top: 0 },
        ])
        .png()
        .toFile(file);
      written.push(path.relative(root, file));
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.stop();
}
console.log(written.join('\n'));
