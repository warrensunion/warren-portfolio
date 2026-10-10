import { chromium } from 'playwright';
import { startPreview } from './lib/preview.mjs';
const [out, w, h, sel, frac] = process.argv.slice(2);
const server = await startPreview(4391);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(server.url, { waitUntil: 'load' });
const info = await p.evaluate(([sel, frac]) => {
  const t = document.querySelector(sel); const r = t.getBoundingClientRect();
  scrollTo({ top: scrollY + r.top + (r.height - innerHeight) * +frac, behavior: "instant" });
  return null; }, [sel, frac]);
await p.waitForTimeout(300);
const info2 = await p.evaluate((sel) => { const t = document.querySelector(sel); const r = t.getBoundingClientRect();
  const tx = t.querySelector('.track-text').getBoundingClientRect(), fg = t.querySelector('figure').getBoundingClientRect();
  return { textTop: tx.top, textBottom: tx.bottom, figTop: fg.top, figBottom: fg.bottom, trackH: r.height, sw: document.documentElement.scrollWidth };
}, sel);
console.log(JSON.stringify(info2));
await p.screenshot({ path: out });
await b.close(); server.stop();
