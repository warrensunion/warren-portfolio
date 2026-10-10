import { chromium } from 'playwright';
import { startPreview } from './lib/preview.mjs';
const server = await startPreview(4392);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'warning' && errs.push(m.text()));
await p.goto(server.url, { waitUntil: 'load' });
for (const f of [0, 0.25, 0.5, 0.75, 1]) {
  await p.evaluate((f) => { const t = document.querySelector('#howpolluted'); const r = t.querySelector('.track-rail').getBoundingClientRect(); const fg = t.querySelector('figure').getBoundingClientRect();
    scrollTo({ top: scrollY + r.top - 96 + (r.height - fg.height) * f, behavior: 'instant' }); }, f);
  await p.waitForTimeout(150);
  console.log(f, await p.evaluate(() => { const t = document.querySelector('#howpolluted'); return [t.dataset.stage, t.style.getPropertyValue('--p'), t.querySelector('.fig-still.is-on').dataset.stage, t.querySelector('[aria-current]').dataset.stage]; }));
}
await p.click('#archer-hero .fig-stages button[data-stage="2"]').catch(e=>console.log('click', e.message));
await p.waitForTimeout(1500);
console.log('after click', await p.evaluate(() => document.querySelector('#archer-hero').dataset.stage));
console.log('errors', errs);
await b.close(); server.stop();
