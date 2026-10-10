// The spec's bar is Lighthouse performance >= 85 on the desktop preset, and one run is noise, so this
// runs Lighthouse several times against the built page (`vite preview`), prints every score and the
// median, and saves the median run's full report to design/lighthouse.json. Chrome is Playwright's
// Chromium, launched with the same GPU flags as the other scripts: a visitor's browser has a GPU,
// and without one the WebGL hero would be measured on a software rasteriser no visitor uses.
// Usage: npm run lighthouse [-- --no-build] [-- --runs=3]
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GPU_ARGS, build, root, startPreview } from './lib/preview.mjs';

const argv = process.argv.slice(2);
const RUNS = Number((argv.find((a) => a.startsWith('--runs=')) || '--runs=3').slice(7)) || 3;

if (!argv.includes('--no-build')) build();
const server = await startPreview(4322);
const runs = [];
try {
  for (let i = 0; i < RUNS; i++) {
    // A fresh browser per run, so no run inherits another's cache or compiled shaders.
    // Launched through Playwright (chrome-launcher's spawn fails on this Windows setup), with a debugging
    // port Lighthouse drives over CDP in a tab of its own.
    const port = 9300 + i;
    const chrome = await chromium.launch({ headless: true, args: [...GPU_ARGS, `--remote-debugging-port=${port}`] });
    try {
      const result = await lighthouse(server.url, { port, output: 'json', logLevel: 'error' }, desktopConfig);
      const lhr = result.lhr;
      const a = lhr.audits;
      const run = {
        score: Math.round(lhr.categories.performance.score * 100),
        fcp: a['first-contentful-paint'].numericValue,
        lcp: a['largest-contentful-paint'].numericValue,
        tbt: a['total-blocking-time'].numericValue,
        cls: a['cumulative-layout-shift'].numericValue,
        si: a['speed-index'].numericValue,
        lcpEl: a['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.snippet || '',
        json: result.report,
      };
      runs.push(run);
      console.log(
        `run ${i + 1}: performance ${run.score}  FCP ${run.fcp.toFixed(0)} ms  LCP ${run.lcp.toFixed(0)} ms  ` +
          `TBT ${run.tbt.toFixed(0)} ms  CLS ${run.cls.toFixed(3)}  SI ${run.si.toFixed(0)} ms`,
      );
      if (run.lcpEl) console.log(`       LCP element: ${run.lcpEl.slice(0, 120)}`);
    } finally {
      await chrome.close();
    }
  }
} finally {
  server.stop();
}

const sorted = [...runs].sort((a, b) => a.score - b.score);
const median = sorted[Math.floor(sorted.length / 2)];
await writeFile(path.join(root, 'design/lighthouse.json'), median.json);
console.log(`scores: ${runs.map((r) => r.score).join(', ')}  median: ${median.score}  (target 85)`);
console.log('design/lighthouse.json holds the median run');
if (median.score < 85) process.exitCode = 1;
