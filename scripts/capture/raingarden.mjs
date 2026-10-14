// Records the Raingarden track's clips from the live GitHub Pages deploy (or RAINGARDEN_URL, e.g. a local
// `vite preview`), driven from outside with Playwright through the app's own "Try a demo yard" path (no
// camera needed). Raingarden is not modified. Stages: the slope read from the photo (depth model, then the
// slope controls), the storm running across the yard, the optimizer designing the garden, and a still of
// the before | after comparison for the live stage. A second, unrecorded run at deviceScaleFactor 2 exports
// the matched pair for the live figure: public/raingarden/{before,after}.webp (same yard view, same storm
// time, divider pushed fully to one side) and public/raingarden/meta.json with the run's numbers.
// Output: public/captures/raingarden/s<k>.{webm,mp4}, public/stills/raingarden-s<i>.webp, manifest.json.
// Usage: node scripts/capture/raingarden.mjs   (RAINGARDEN_STORM=recent|design|typical, default recent)
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import { newContext, encode, finishVideo, glide, centre, clock, root, VIEW, STILL } from './lib.mjs';
import { GPU_ARGS } from '../lib/preview.mjs';

const URL_ = (process.env.RAINGARDEN_URL || 'https://warrensunion.github.io/raingarden/').replace(/\/?$/, '/');
const STORM = process.env.RAINGARDEN_STORM || 'recent';
const PAIR_AT = Number(process.env.RAINGARDEN_PAIR_AT || 0.42); // storm-time fraction for the before/after pair
const OUT = path.join(root, 'public/captures/raingarden');
const STILLS = path.join(root, 'public/stills');
const LIVE = path.join(root, 'public/raingarden');
const WORK = path.join(root, '.capture-work/raingarden');
for (const d of [OUT, STILLS, LIVE]) mkdirSync(d, { recursive: true });
if (!process.env.RAINGARDEN_REENCODE) rmSync(path.join(WORK, 'video'), { recursive: true, force: true });
mkdirSync(path.join(WORK, 'video'), { recursive: true });

// The deployed commit, read from the Pages build's repo (the page itself carries no version).
const commit = process.env.RAINGARDEN_COMMIT || 'unknown';
const manifest = { source: 'raingarden', url: URL_, commit, captured: new Date().toISOString().slice(0, 10), view: VIEW, clip: { w: 960, h: 600, fps: 24 }, stages: {} };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Drives the demo yard from the intro to the comparison; `at` gets named moments for the recording. */
async function runDemo(page, { at = () => {}, interact = false, log = console.log } = {}) {
  const waitStep = (n, timeout = 180000) => page.waitForFunction((n) => window.__raingarden && window.__raingarden.step === n, n, { timeout });
  const waitResult = async (s, timeout = 900000) => {
    await page.waitForFunction((s) => window.__raingarden?.lastResult?.step === s, s, { timeout, polling: 100 });
    return page.evaluate(() => {
      const r = { ...window.__raingarden.lastResult };
      for (const k of Object.keys(r)) if (r[k] && typeof r[k] === 'object' && !Array.isArray(r[k]) && !['garden', 'cost', 'confidence'].includes(k)) delete r[k];
      return r;
    });
  };
  const primary = page.locator('.dz-primary');
  const primaryReady = () => page.waitForFunction(() => { const b = document.querySelector('.dz-primary'); return b && !b.disabled && b.offsetParent; }, null, { timeout: 900000 });
  let mouse = { x: VIEW.width * 0.6, y: VIEW.height * 0.5 };
  const go = async (locator, ms = 600) => {
    const to = await centre(locator);
    if (interact) await glide(page, mouse, to, ms);
    mouse = to;
    await locator.click();
  };
  const next = async () => { await primaryReady(); await go(primary, 450); };

  await page.goto(URL_ + '?preloader=0', { waitUntil: 'load' });
  await page.waitForSelector('#pl', { state: 'detached', timeout: 90000 }).catch(() => {});
  await sleep(1200);
  await page.evaluate(() => document.querySelector('a[data-design="demo"]').click());
  await waitStep(3);
  // "Reading depth… N s" shows once the model is loaded and running on the photo
  await page.waitForFunction(() => /Reading depth/.test(document.querySelector('.dz-progress-line')?.textContent || ''), null, { timeout: 900000 }).catch(() => {});
  at('read');
  const slope = await waitResult('slope');
  at('slope');
  log('  slope: ' + JSON.stringify(slope));
  await sleep(1800);
  if (interact) {
    // set the slope by hand the way the step asks when the reading is unsure: Steep, then back to Gentle
    await go(page.getByRole('radio', { name: 'Steep (8%)' }), 700);
    await sleep(1600);
    await go(page.getByRole('radio', { name: 'Gentle (2%)' }), 500);
    await sleep(1600);
  }
  at('slopeEnd');
  await next(); await waitStep(4); await sleep(600);
  await next(); await waitStep(5);
  await page.waitForSelector('.dz-storm', { timeout: 90000 });
  await sleep(600);
  const card = page.locator(`.dz-storm[data-id="${STORM}"]`);
  if (await card.count()) { await go(card, 500); await sleep(500); }
  const storms = await page.evaluate(() => window.__raingarden.state.storms.map((x) => ({ id: x.id, label: x.label, mm: x.totalMm, source: x.source.text, url: x.source.url })));
  const place = await page.evaluate(() => window.__raingarden.state.place);
  const stormId = await page.evaluate(() => window.__raingarden.state.stormId);
  await next(); await waitStep(6);
  at('stormStart');
  const before = await waitResult('before');
  log('  before: ' + JSON.stringify(before));
  at('stormPlay');
  await sleep(12500);
  at('stormEnd');
  await next(); await waitStep(7); await sleep(1200);
  at('designStart');
  await next();
  const design = await waitResult('design');
  at('designDone');
  log('  design: ' + JSON.stringify(design));
  await sleep(2200);
  at('designEnd');
  await next(); await waitStep(8);
  const plant = await waitResult('plant');
  log('  plant: ' + JSON.stringify(plant));
  await sleep(1500);
  await next(); await waitStep(9);
  const compare = await waitResult('compare');
  log('  compare: ' + JSON.stringify(compare));
  await sleep(4500); // the three numbers count up for 1.6 s; let the camera settle
  at('compare');
  const sheetText = await page.locator('.dz-big').innerText().catch(() => '');
  const header = await page.locator('.dz-sheet').first().innerText().catch(() => '');
  return { slope, storms, stormId, place, before, design, plant, compare, sheetText, header };
}

/** At the compare step: pause, seek to `frac` of the storm, push the divider fully to one side. */
async function pose(page, side, frac) {
  await page.evaluate(({ side, frac }) => {
    const btn = document.querySelector('.dz-play-btn');
    if (btn && btn.getAttribute('aria-label') === 'Pause') btn.click();
    const s = document.querySelector('.dz-scrub');
    s.value = String(Math.round(frac * 1000));
    s.dispatchEvent(new Event('input', { bubbles: true }));
    const h = document.querySelector('.dz-split');
    h.dispatchEvent(new KeyboardEvent('keydown', { key: side === 'before' ? 'End' : 'Home', bubbles: true }));
    h.blur();
  }, { side, frac });
  await sleep(700);
  return page.evaluate(() => document.querySelector('.dz-clock')?.textContent || '');
}

/** Maps the script's marks onto the recording through the two white flashes, then cuts the three clips. */
async function encodeClips(raw, marks) {
  const m = { ...marks };
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-vf', 'scale=64:40,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=luma.txt', '-f', 'null', '-'], { cwd: WORK });
  const frames = [];
  let ts = null;
  for (const line of readFileSync(path.join(WORK, 'luma.txt'), 'utf8').split(/\r?\n/)) {
    const a = line.match(/pts_time:([\d.]+)/);
    if (a) ts = Number(a[1]);
    const y = line.match(/YAVG=([\d.]+)/);
    if (y && ts != null) frames.push([ts, Number(y[1])]);
  }
  // white-run starts that follow a non-white frame (the page is white before the black setContent)
  const starts = [];
  for (let i = 1; i < frames.length; i++) if (frames[i][1] > 230 && frames[i - 1][1] <= 230) starts.push(frames[i][0]);
  const v0 = starts[0];
  const v1 = starts[starts.length - 1];
  if (v0 == null || v1 == null || v1 - v0 < 30) throw new Error('sync flashes not found in the recording: ' + starts.join(', '));
  const k = (v1 - v0) / (m.sync1 - m.sync0);
  console.log(`  sync: video ${v0.toFixed(2)} / ${v1.toFixed(2)} s for script ${m.sync0.toFixed(2)} / ${m.sync1.toFixed(2)} s (rate ${k.toFixed(4)})`);
  for (const key of Object.keys(m)) m[key] = v0 + (m[key] - m.sync0) * k;
  writeFileSync(path.join(WORK, 'marks.json'), JSON.stringify(m, null, 1));
  const cut = async (i, span, opts = {}) => {
    const r = await encode(raw, path.join(OUT, `s${i}`), { start: span[0], end: span[1], stillFile: path.join(STILLS, `raingarden-s${i}.webp`), ...opts });
    manifest.stages[i] = { file: `s${i}`, duration: r.duration };
    console.log(`  s${i}: ${r.duration.toFixed(2)} s, ${(r.bytes / 1024).toFixed(0)} kB`);
    return r.bytes;
  };
  const crf = process.env.RAINGARDEN_CRF ? process.env.RAINGARDEN_CRF.split(',').map(Number) : [46, 34];
  let bytes = 0;
  // s0: the last seconds of the depth read, the yard rising out of the photo, Steep then Gentle
  const s0 = [Math.max(m.read, m.slope - 1.5), m.slopeEnd + 0.4];
  bytes += await cut(0, s0, { speed: Math.max(1, (s0[1] - s0[0]) / 4), crf });
  // s1: the storm playing across the yard (24 s playback, first ~12 s)
  const s1 = [m.stormPlay + 0.3, m.stormEnd];
  bytes += await cut(1, s1, { speed: Math.max(1, (s1[1] - s1[0]) / 4), crf });
  // s2: the annealing ghosts, ending on the chosen garden
  const s2 = [m.designStart, m.designEnd];
  bytes += await cut(2, s2, { speed: Math.max(1, (s2[1] - s2[0]) / 4), crf });
  console.log(`raingarden clips: ${(bytes / 1048576).toFixed(2)} MB`);
}

if (process.env.RAINGARDEN_REENCODE) {
  Object.assign(manifest, JSON.parse(readFileSync(path.join(OUT, 'manifest.json'), 'utf8')), { stages: {} });
  await encodeClips(path.join(WORK, 'raingarden.webm'), JSON.parse(readFileSync(path.join(WORK, 'marks-raw.json'), 'utf8')));
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  process.exit(0);
}

const browser = await chromium.launch({ args: GPU_ARGS });
const errs = [];
const failed = [];
const watch = (page) => {
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
};
let run;
try {
  // ---- 1. the recorded run (1440x900, DSF 1) ----
  {
    const { context } = await newContext(browser, { video: path.join(WORK, 'video') });
    const page = await context.newPage();
    watch(page);
    const t = clock();
    const m = {};
    // Playwright's video clock is not the script's clock (it starts late and can drop frames while the
    // depth model loads), so two white flashes, one before and one after the run, map one onto the other.
    const flash = async (k) => {
      await page.evaluate(() => { const d = document.createElement('div'); d.id = 'rg-sync'; d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff'; document.documentElement.appendChild(d); });
      m[k] = t();
      await sleep(700);
      await page.evaluate(() => document.getElementById('rg-sync')?.remove());
      await sleep(500);
    };
    await page.setContent('<body style="margin:0;background:#000"></body>');
    await sleep(1500);
    await flash('sync0');
    run = await runDemo(page, { at: (k) => (m[k] = t()), interact: true });
    // the still for the live stage: the comparison at rest, divider in the middle
    await page.mouse.move(VIEW.width - 10, VIEW.height - 10);
    await sleep(400);
    await sharp(await page.screenshot()).resize(STILL.w, STILL.h, { fit: 'cover' }).webp({ quality: 78 }).toFile(path.join(STILLS, 'raingarden-s3.webp'));
    await sleep(1200);
    await flash('sync1');
    const raw = await finishVideo(context, page, path.join(WORK, 'raingarden.webm'));
    writeFileSync(path.join(WORK, 'marks-raw.json'), JSON.stringify(m, null, 1));
    await encodeClips(raw, m);
  }

  // ---- 2. the matched before / after pair (unrecorded, DSF 2 for a sharper 1600x1000) ----
  {
    const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
    const page = await context.newPage();
    watch(page);
    const r2 = await runDemo(page, { log: (s) => console.log('  pair' + s.trim().replace(/^/, ' ')) });
    await page.addStyleTag({ content: '.dz-sheet,.dz-close,.dz-split{visibility:hidden!important}' });
    // the yard sits right of the 400 px sheet; a 1.6:1 box around it
    const clip = { x: 436, y: 205, width: 1000, height: 625 }; // right of the canvas edge, where the renderer paints the divider line at split 0
    // The pair's moment: unless RAINGARDEN_PAIR_AT is set, scan the scrubber for the heaviest rain the
    // clock line reports ("2:00 pm, 12 mm/h") and go a little past it, when the runoff stream is fullest.
    let at = PAIR_AT;
    if (!process.env.RAINGARDEN_PAIR_AT) {
      await pose(page, 'before', 0);
      let best = { f: 0.2, r: -1 };
      for (let f = 0; f <= 1.0001; f += 0.01) {
        const txt = await page.evaluate((f) => {
          const s = document.querySelector('.dz-scrub');
          s.value = String(Math.round(f * 1000));
          s.dispatchEvent(new Event('input', { bubbles: true }));
          return document.querySelector('.dz-clock')?.textContent || '';
        }, f);
        const r = Number((txt.match(/([\d.]+) mm\/h/) || [])[1] || 0);
        if (r > best.r) best = { f, r };
      }
      at = Math.min(1, best.f + 0.03);
      console.log(`  pair: peak ${best.r} mm/h at ${best.f.toFixed(2)}, using ${at.toFixed(2)}`);
      for (const f of [best.f, at, at + 0.04, at + 0.08]) {
        await pose(page, 'before', f);
        await page.screenshot({ clip, path: path.join(WORK, `cand-before-${f.toFixed(2)}.png`) });
      }
    }
    const shots = {};
    for (const side of ['before', 'after']) {
      const clockText = await pose(page, side, at);
      const png = await page.screenshot({ clip, path: path.join(WORK, `pair-${side}.png`) });
      shots[side] = { clock: clockText, png };
    }
    // q78 like every still; the two must stay under 250 KB together, so step the quality down only if needed
    let quality = 78;
    for (;;) {
      let total = 0;
      for (const side of ['before', 'after']) {
        await sharp(shots[side].png).resize(1600, 1000, { fit: 'cover' }).webp({ quality, effort: 6 }).toFile(path.join(LIVE, `${side}.webp`));
        shots[side].bytes = statSync(path.join(LIVE, `${side}.webp`)).size;
        total += shots[side].bytes;
      }
      if (total <= 250 * 1024 || quality <= 60) break;
      quality -= 2;
    }
    for (const side of ['before', 'after']) delete shots[side].png;
    shots.quality = quality;
    console.log('  pair: ' + JSON.stringify(shots));
    const storm = r2.storms.find((s) => s.id === r2.stormId);
    const meta = {
      generated: new Date().toISOString().slice(0, 10),
      url: URL_,
      commit,
      webpQuality: shots.quality,
      view: 'Designer step 9 "Before and after", demo yard, divider pushed fully right (before) or left (after), playback paused at the same storm time',
      clock: { value: shots.before.clock, fraction: Math.round(at * 100) / 100, from: 'the clock line under the storm scrubber (step 9); both images are at this time' },
      place: { value: r2.place?.label || 'location off', fallback: !!r2.place?.fallback, from: 'step 5 "storm": location is off in the capture, so the app uses its Richmond, BC default' },
      storm: { id: storm.id, label: storm.label, rainMm: Math.round(storm.mm * 10) / 10, source: storm.source, from: 'step 5 storm card (Open-Meteo)' },
      roofM2: { value: 120, from: 'demo yard roof area (src/data/demo-yard.json), shown in step 6 "Today, in this storm"' },
      before: {
        rainOnRoofAndGroundL: Math.round(r2.before.rainL + r2.before.roofL), roofL: Math.round(r2.before.roofL), leavesYardL: Math.round(r2.before.outL), soakedInL: Math.round(r2.before.infiltratedL),
        from: 'step 6 "Today, in this storm": the three counters at the end of playback (sim ledger; the ground is the whole photographed area, not only the marked yard)',
      },
      after: {
        capturedL: Math.round(r2.compare.capturedL), leavesYardL: Math.round(r2.compare.outAfterL), leavesYardBeforeL: Math.round(r2.compare.outBeforeL), waterStandsH: Math.round(r2.compare.drainH),
        from: 'step 9 "Before and after" big numbers',
      },
      garden: {
        areaM2: Math.round(r2.design.areaM2 * 10) / 10, lengthM: Math.round(r2.design.garden.lenM * 10) / 10, widthM: Math.round(r2.design.garden.widM * 10) / 10,
        depthCm: Math.round(r2.design.garden.depthM * 100), costCad: Math.round(r2.design.cost.total), triesAnnealing: r2.design.tries,
        from: 'step 7 "design" result (optimizer.js, simulated annealing)',
      },
      plants: { count: r2.plant.plants, species: r2.plant.species, from: 'step 8 "plant" result' },
      slope: { value: 'Gentle (2%) set by hand', reading: r2.slope.confidence, backend: r2.slope.backend, from: 'step 3: the depth reading was unsure (wide band), so the demo uses the manual Gentle slope' },
    };
    writeFileSync(path.join(LIVE, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(path.join(WORK, 'run.json'), JSON.stringify({ run, errs, failed }, null, 1));
if (errs.length) console.log('  errors: ' + errs.slice(0, 5).join(' | '));
if (failed.length) console.log('  failed requests: ' + failed.slice(0, 5).join(' | '));
