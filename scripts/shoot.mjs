// Screenshots are how the layout gets judged by eye at the three sizes the spec names (1440x900,
// 1920x1080, 390x844), so they are taken from the built page as visitors get it, with every figure
// in frame either live (first frame drawn) or deliberately on its poster, never mid-fade or blank.
// Output: design/shots/<w>x<h>-<name>.png (top, hero half sunk, each section, its figure when the
// section is taller than the screen, and the full page).
// Usage: npm run shoot [-- --no-build] [-- --only=1440x900]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { GPU_ARGS, build, root, startPreview } from './lib/preview.mjs';

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
];
const SECTIONS = ['work', 'building', 'projects', 'contests', 'contact'];
const argv = process.argv.slice(2);
const only = (argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const outDir = path.join(root, 'design/shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every figure that intersects the viewport must be live or on a deliberate fallback before a shot.
async function settle(page, extraMs) {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('figure.fig[data-fig]')].every((f) => {
        const r = f.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= innerHeight) return true;
        if (!(f.classList.contains('is-live') || f.dataset.fallback)) return false;
        // A poster on screen (lazy) must have arrived, or the shot shows an empty plate.
        return [...f.querySelectorAll('img.fig-poster')].every((i) => i.complete && i.naturalWidth > 0);
      }),
    null,
    { timeout: 45000 },
  );
  // The canvas fades in over 400 ms; the scramble label and the ring's assembly take longer.
  await sleep(extraMs);
}

const jump = (page, fn, arg) => page.evaluate(fn, arg);

if (!argv.includes('--no-build')) build();
await mkdir(outDir, { recursive: true });
const server = await startPreview(4320);
const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
const written = [];
try {
  for (const vp of SIZES) {
    const tag = `${vp.width}x${vp.height}`;
    if (only.length && !only.includes(tag)) continue;
    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log(`  [${tag}] pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') console.log(`  [${tag}] ${m.type()}: ${m.text()}`);
    });
    await page.goto(server.url, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // The pointer rests in the bottom-left gutter, off every stage and link, so no hover is shot.
    await page.mouse.move(2, vp.height - 2);
    const shot = async (name, opts = {}) => {
      const file = path.join(outDir, `${tag}-${name}.png`);
      await page.screenshot({ path: file, ...opts });
      written.push(path.relative(root, file));
      console.log(`ok   ${tag}-${name}.png`);
    };

    await settle(page, 1500);
    await shot('top');

    // Half way through the hero: on desktop the sticky track, on the phone the figure's own travel.
    const halfHero = () => jump(page, () => {
      const hero = document.querySelector('.hero');
      const fig = hero.querySelector('figure');
      const desk = matchMedia('(min-width: 860px)').matches;
      const y = desk
        ? hero.offsetTop + (hero.offsetHeight - innerHeight) / 2 + 24 // just past the half-way line
        : (fig.getBoundingClientRect().top + scrollY) / 2; // heroProgress 0.5 on the phone
      scrollTo({ top: Math.max(0, y), behavior: 'instant' });
    });
    await halfHero();
    await settle(page, 1500);
    await shot('hero-under');

    for (const id of SECTIONS) {
      await jump(page, (id) => document.getElementById(id).scrollIntoView({ block: 'start', behavior: 'instant' }), id);
      await settle(page, id === 'contact' ? 4000 : 1500);
      await shot(id);
      // A section taller than the screen gets a second shot with its figure fully in view.
      const cut = await page.evaluate((id) => {
        const f = document.querySelector(`#${id} figure.fig`);
        if (!f) return false;
        const r = f.getBoundingClientRect();
        return r.top < 0 || r.bottom > innerHeight;
      }, id);
      if (cut) {
        await jump(
          page,
          (id) => document.querySelector(`#${id} figure.fig`).scrollIntoView({ block: 'center', behavior: 'instant' }),
          id,
        );
        await settle(page, id === 'contact' ? 4000 : 1500);
        await shot(id + '-fig');
      }
    }

    await jump(page, () => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await settle(page, 800);
    await shot('bottom');

    // Full page: figures out of the viewport stay on their posters, which are stills of the same scenes.
    await jump(page, () => scrollTo({ top: 0, behavior: 'instant' }));
    await settle(page, 1000);
    await shot('full', { fullPage: true });

    // The posters as a visitor without WebGL (or with reduced motion) sees them, cropped by the stage.
    await page.goto(server.url + '?static=1', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await settle(page, 600);
    await shot('static-top');
    await halfHero();
    await settle(page, 900);
    await shot('static-hero-under');
    await jump(page, () => document.querySelector('#contact figure.fig').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await settle(page, 600);
    await shot('static-contact-fig');
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}
console.log(`shoot: ${written.length} shots in design/shots`);
