import { chromium } from 'playwright';
import { startPreview, GPU_ARGS } from './lib/preview.mjs';
// usage: node scripts/_fig_peek.mjs <outPrefix> <w> <h> <query> <trackId> <stage,stage,...> [hover]
const [out, w, h, q, id, list, hover] = process.argv.slice(2);
const server = await startPreview(4397);
const b = await chromium.launch({ args: GPU_ARGS });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
await p.goto(server.url + (q === '-' ? '' : q), { waitUntil: 'load' });
for (const s of list.split(',').map(Number)) {
  await p.evaluate(([id, s]) => {
    const t = document.getElementById(id); const rail = t.querySelector('.track-rail'); const fig = rail.querySelector('figure');
    const n = fig.querySelectorAll('.fig-stages button[data-stage]').length; const pad = rail.getBoundingClientRect().height - fig.getBoundingClientRect().height;
    const top = rail.getBoundingClientRect().top + scrollY - 96 + (n > 1 ? pad * (s + 0.45) / (n - 1) : 0);
    scrollTo({ top: Math.min(top, rail.getBoundingClientRect().bottom + scrollY - innerHeight), behavior: 'instant' });
  }, [id, s]);
  await p.waitForTimeout(3500);
  if (hover) { const c = p.locator('.bp-card').nth(2); if (await c.isVisible().catch(() => false)) { await c.hover(); await p.waitForTimeout(800); } }
  await p.screenshot({ path: `${out}-${s}.png` });
  console.log(s, await p.evaluate((id) => [document.getElementById(id).dataset.stage, document.querySelector('#' + id + ' .fig-readout').textContent, document.querySelector('#' + id + ' figure').className], id));
}
console.log('errors', errs.slice(0, 5));
await b.close(); server.stop();
