import { chromium } from 'playwright';
import { startPreview, GPU_ARGS } from './lib/preview.mjs';
const server = await startPreview(4398);
const b = await chromium.launch({ args: GPU_ARGS });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(server.url, { waitUntil: 'load' });
await p.evaluate(() => { const t = document.getElementById('bttrurslf'); const rail = t.querySelector('.track-rail'); const fig = rail.querySelector('figure');
  const pad = rail.getBoundingClientRect().height - fig.getBoundingClientRect().height; scrollTo({ top: rail.getBoundingClientRect().top + scrollY - 96 + pad * 2.45 / 14, behavior: 'instant' }); });
await p.waitForTimeout(4000);
console.log(JSON.stringify(await p.evaluate(() => {
  const at = (x, y) => document.elementsFromPoint(x, y).slice(0, 6).map((e) => e.tagName + '.' + e.className + ' bg=' + getComputedStyle(e).backgroundColor + ' op=' + getComputedStyle(e).opacity);
  const vids = [...document.querySelectorAll('#bttrurslf video')].map((v) => [v.className, v.currentTime.toFixed(2), v.duration, v.readyState, v.querySelector('source')?.src.split('/').slice(-2).join('/')]);
  return { grey: at(1200, 250), card: at(700, 400), vids };
}), null, 1));
await b.close(); server.stop();
