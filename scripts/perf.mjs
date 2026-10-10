// The spec promises 60 fps on a laptop, and only a measurement can keep that promise honest. This
// scrolls each WebGL figure of the built page into view at 1440x900 with the real GPU, lets it warm
// up, then records 5 s of its own frame times through __figStats (ctx.frame) and writes the average
// fps and p95 frame time per figure to design/perf.md, for the high tier, the low tier (?tier=low)
// and, as a laptop proxy, the hero under a 4x CPU throttle. The hardware string goes in the report.
// Usage: npm run perf [-- --no-build] [-- --seconds=5]
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GPU_ARGS, build, root, startPreview } from './lib/preview.mjs';

const argv = process.argv.slice(2);
const SECONDS = Number((argv.find((a) => a.startsWith('--seconds=')) || '--seconds=5').slice(10)) || 5;
const WARMUP_MS = 1500;
const FIGS = ['iceberg-0', 'iceblock-0', 'iceblock-1', 'iceblock-2', 'ring-0'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pct = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

async function measure(browser, url, ids, { throttle = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const cdp = await context.newCDPSession(page);
  const rows = [];
  for (const id of ids) {
    await page.evaluate((id) => {
      const fig = document.querySelector(`figure.fig[data-fig-id="${id}"]`);
      if (id.startsWith('iceberg')) return scrollTo({ top: 0, behavior: 'instant' });
      const r = fig.getBoundingClientRect();
      scrollTo({ top: scrollY + r.top + r.height / 2 - innerHeight / 2, behavior: 'instant' });
    }, id);
    await page.waitForFunction(
      (id) => document.querySelector(`figure.fig[data-fig-id="${id}"]`)?.classList.contains('is-live'),
      id,
      { timeout: 60000 },
    );
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await sleep(WARMUP_MS);
    await page.evaluate((id) => {
      const st = window.__figStats[id];
      st.dts = [];
      st.mark = { frames: st.frames, dtSum: st.dtSum };
    }, id);
    await sleep(SECONDS * 1000);
    const r = await page.evaluate((id) => {
      const st = window.__figStats[id];
      const out = { frames: st.frames - st.mark.frames, dtSum: st.dtSum - st.mark.dtSum, dts: st.dts };
      delete st.dts;
      return out;
    }, id);
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    rows.push({
      id,
      frames: r.frames,
      fps: r.dtSum > 0 ? (1000 * r.frames) / r.dtSum : 0,
      p95: pct(r.dts, 95),
      max: Math.max(...r.dts),
    });
  }
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const s = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl ? gl.getParameter(gl.RENDERER) : 'no webgl2';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return s;
  });
  const adapt = logs.filter((l) => /lowered quality/.test(l));
  await context.close();
  return { rows, gpu, adapt };
}

if (!argv.includes('--no-build')) build();
const server = await startPreview(4321);
const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
let high, low, thr;
try {
  high = await measure(browser, server.url + '?tier=high', FIGS);
  low = await measure(browser, server.url + '?tier=low', FIGS);
  thr = await measure(browser, server.url + '?tier=high', ['iceberg-0'], { throttle: 4 });
} finally {
  await browser.close();
  server.stop();
}

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : 'n/a');
const table = (res) =>
  ['| figure | frames | avg fps | p95 frame (ms) | worst frame (ms) |', '|---|---|---|---|---|']
    .concat(res.rows.map((r) => `| ${r.id} | ${r.frames} | ${f1(r.fps)} | ${f1(r.p95)} | ${f1(r.max)} |`))
    .join('\n');
const adaptNote = (res) => (res.adapt.length ? res.adapt.map((l) => `- ${l}`).join('\n') : '- none');
const below = [...high.rows, ...low.rows].filter((r) => r.fps < 58);

const md = `# Figure frame rates

Measured ${new Date().toISOString().slice(0, 10)} by \`npm run perf\` (scripts/perf.mjs) on the built page (\`vite preview\`).
Each figure is scrolled into view at 1440x900 (device pixel ratio 1), goes live, warms up for ${WARMUP_MS / 1000} s, then its
own frame times are recorded for ${SECONDS} s through \`ctx.frame\` into \`window.__figStats\`. Average fps is frames
divided by summed frame time; p95 is the 95th percentile of the individual frame times.

## Hardware

- GPU (WebGL renderer string): ${high.gpu}
- CPU: ${os.cpus()[0]?.model.trim()} (${os.cpus().length} logical cores), ${(os.totalmem() / 2 ** 30).toFixed(0)} GB RAM, ${os.platform()} ${os.release()}
- Browser: Playwright Chromium ${browser.version()}, headless with ${GPU_ARGS.join(' ')}.

This is a desktop GPU, not the laptop the spec names, so the high tier numbers here are a ceiling. The low tier
and the 4x CPU throttle run below are the honest stand-ins for a laptop. Headless Chromium paces
requestAnimationFrame at 60 Hz, so 60 fps is the most any row can show.

## High tier (?tier=high, what a desktop with more than 4 cores gets)

${table(high)}

Quality steps taken by the runtime adapt:
${adaptNote(high)}

## Low tier (?tier=low, what phones, touch screens and machines with 4 cores or fewer get)

${table(low)}

Quality steps taken by the runtime adapt:
${adaptNote(low)}

## Laptop proxy: hero at high tier under a 4x CPU slowdown

${table(thr)}

Quality steps taken by the runtime adapt:
${adaptNote(thr)}

The throttle slows only JavaScript and the main thread, not the GPU, so it shows whether the scene's per-frame
CPU work (water simulation, scroll read, overlay drawing) still fits a 16.7 ms frame on a slower processor.

## Verdict

${below.length ? 'Below the 58 fps target: ' + below.map((r) => `${r.id} ${f1(r.fps)} fps`).join(', ') + '.' : 'Every figure averages 58 fps or more at both tiers on this machine.'}
${thr.rows[0].fps < 58 ? `The hero under a 4x CPU throttle averages ${f1(thr.rows[0].fps)} fps.` : `The hero still averages ${f1(thr.rows[0].fps)} fps under a 4x CPU throttle.`}
`;
await writeFile(path.join(root, 'design/perf.md'), md);
console.log(md);
